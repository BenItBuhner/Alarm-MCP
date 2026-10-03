package dev.alarmmcp.android

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.content.getSystemService
import androidx.core.net.toUri
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dev.convex.android.ConvexClient
import dev.convex.android.ConvexError
import dev.convex.android.ServerError
import dev.convex.android.WebSocketState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Foreground service that keeps a live Convex subscription to this device's alarm feed, rings
 * alarms, arms AlarmManager backups for upcoming ones, and delivers the user's responses.
 */
class AlarmService : LifecycleService() {
    private lateinit var store: DeviceStore
    private lateinit var ringer: AlarmRinger
    private var api: DeviceApi? = null
    private var connectionJob: Job? = null
    private val shown = linkedMapOf<String, ShownAlarm>()
    private val expiryJobs = mutableMapOf<String, Job>()
    private val flushLock = Mutex()

    override fun onCreate() {
        super.onCreate()
        store = DeviceStore(this)
        ringer = AlarmRinger(this, lifecycleScope)
        startInForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        startInForeground()
        when (intent?.action) {
            ACTION_RESPOND -> handleRespond(intent)
            ACTION_BACKUP, ACTION_PUSH -> intent.alarmExtra()?.let { if (it.alarmId !in shown) startRinging(it, local = true) }
            ACTION_HEARTBEAT -> lifecycleScope.launch { sendHeartbeat() }
            ACTION_UNPAIR -> {
                unpair(remote = true)
                return START_NOT_STICKY
            }
        }
        val pairing = store.pairing()
        if (pairing == null) {
            if (shown.isEmpty()) stopService()
            return START_NOT_STICKY
        }
        connect(pairing)
        return START_STICKY
    }

    override fun onDestroy() {
        ringer.release()
        super.onDestroy()
    }

    // ---------- Connection ----------

    private fun connect(pairing: Pairing) {
        if (connectionJob?.isActive == true) return
        val deviceApi = DeviceApi(ConvexClient(pairing.convexUrl), pairing.deviceToken)
        api = deviceApi
        AlarmState.update { it.copy(pairing = pairing, connection = Connection.CONNECTING) }
        refreshPushToken()
        connectionJob = lifecycleScope.launch {
            launch {
                deviceApi.client.webSocketStateFlow.collect { state ->
                    val connected = state == WebSocketState.CONNECTED
                    AlarmState.update { it.copy(connection = if (connected) Connection.CONNECTED else Connection.CONNECTING) }
                    updateForegroundNotification(connected)
                    if (connected) flushPending()
                }
            }
            launch {
                while (isActive) {
                    sendHeartbeat()
                    delay(HEARTBEAT_INTERVAL_MS)
                }
            }
            launch {
                while (isActive) {
                    try {
                        deviceApi.feed().collect { result -> result.onSuccess(::reconcile).onFailure(::onFeedError) }
                    } catch (e: CancellationException) {
                        currentCoroutineContext().ensureActive()
                        Log.w(TAG, "Feed subscription ended", e)
                    }
                    delay(FEED_RETRY_MS)
                }
            }
        }
    }

    private fun onFeedError(error: Throwable) {
        if (isRevokedError(error)) {
            unpair(remote = false)
            return
        }
        Log.w(TAG, "Feed error", error)
        AlarmState.update { it.copy(lastError = error.message) }
    }

    private fun reconcile(feed: Feed) {
        store.pairing()?.let { pairing ->
            if (pairing.deviceName != feed.device.name) {
                val renamed = pairing.copy(deviceName = feed.device.name)
                store.savePairing(renamed)
                AlarmState.update { it.copy(pairing = renamed) }
            }
        }
        AlarmState.update { it.copy(upcoming = feed.upcoming, lastError = null) }
        val diff = diffRinging(shown, feed.ringing, feed.upcoming.map { it.alarmId }.toSet())
        diff.close.forEach(::stopRinging)
        diff.open.forEach { startRinging(it, local = false) }
        diff.update.forEach { startRinging(it, local = false) }
        armBackups(feed.upcoming)
    }

    private suspend fun sendHeartbeat() {
        val deviceApi = api ?: return
        runCatching { deviceApi.heartbeat(store.pushToken, BuildConfig.VERSION_NAME, deviceCapabilities()) }
            .onSuccess { flushPending() }
            .onFailure { if (isRevokedError(it)) unpair(remote = false) else Log.w(TAG, "Heartbeat failed", it) }
    }

    private fun refreshPushToken() {
        if (!BuildConfig.HAS_FIREBASE || FirebaseApp.getApps(this).isEmpty()) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (token != store.pushToken) {
                store.pushToken = token
                lifecycleScope.launch { sendHeartbeat() }
            }
        }
    }

    // ---------- Ringing ----------

    private fun startRinging(alarm: DeviceAlarm, local: Boolean) {
        val previous = shown[alarm.alarmId]
        shown[alarm.alarmId] = ShownAlarm(alarm, local)
        postAlarmNotification(alarm)
        val deliveryId = alarm.deliveryId
        if (!local && deliveryId != null && previous?.alarm?.deliveryId != deliveryId) {
            lifecycleScope.launch { runCatching { api?.markSeen(deliveryId) } }
        }
        scheduleLocalExpiry(alarm, local)
        refreshRinging()
    }

    private fun stopRinging(alarmId: String) {
        shown.remove(alarmId)
        expiryJobs.remove(alarmId)?.cancel()
        getSystemService<NotificationManager>()?.cancel(notificationId(alarmId))
        refreshRinging()
    }

    private fun refreshRinging() {
        val top = loudest(shown.values)
        if (top == null) ringer.stop() else ringer.play(top)
        AlarmState.update { it.copy(ringing = shown.toMap()) }
        if (shown.isEmpty() && store.pairing() == null) stopService()
    }

    /** Server alarms expire server-side; this is a safety net if the expiry never arrives. */
    private fun scheduleLocalExpiry(alarm: DeviceAlarm, local: Boolean) {
        expiryJobs.remove(alarm.alarmId)?.cancel()
        val startedAt = if (local) System.currentTimeMillis() else (alarm.firedAt?.toLong() ?: System.currentTimeMillis())
        val slackMs = if (local) 0L else EXPIRY_SLACK_MS
        val deadline = startedAt + (alarm.maxRingSeconds * 1000).toLong() + slackMs
        expiryJobs[alarm.alarmId] = lifecycleScope.launch {
            delay((deadline - System.currentTimeMillis()).coerceAtLeast(0))
            stopRinging(alarm.alarmId)
        }
    }

    // ---------- Responses ----------

    private fun handleRespond(intent: Intent) {
        val alarmId = intent.getStringExtra(EXTRA_ALARM_ID) ?: return
        val action = intent.getStringExtra(EXTRA_ACTION)?.let { name -> ResponseAction.entries.firstOrNull { it.wireName == name } } ?: return
        stopRinging(alarmId)
        val response = PendingResponse(
            alarmId = alarmId,
            action = action,
            option = intent.getStringExtra(EXTRA_OPTION),
            snoozeMinutes = if (action == ResponseAction.SNOOZE) intent.getDoubleExtra(EXTRA_SNOOZE_MINUTES, 5.0) else null,
        )
        store.setPendingResponses(store.pendingResponses() + response)
        lifecycleScope.launch { flushPending() }
    }

    /** Sends queued responses; anything the server answered (even with an error) is dropped. */
    private suspend fun flushPending() = flushLock.withLock {
        val deviceApi = api ?: return@withLock
        for (response in store.pendingResponses()) {
            val delivered = runCatching { deviceApi.respond(response) }
                .fold(onSuccess = { true }, onFailure = { it is ServerError || it is ConvexError })
            if (!delivered) return@withLock
            store.setPendingResponses(store.pendingResponses() - response)
        }
    }

    // ---------- Backups ----------

    private fun armBackups(upcoming: List<DeviceAlarm>) {
        val alarmManager = getSystemService<AlarmManager>() ?: return
        val backups = backupsToArm(upcoming, System.currentTimeMillis())
        val ids = backups.map { it.alarm.alarmId }.toSet()
        for (stale in store.armedBackups - ids) {
            alarmManager.cancel(backupIntent(this, stale, null))
        }
        val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
        for (backup in backups) {
            val operation = backupIntent(this, backup.alarm.alarmId, backup.alarm)
            if (exact) {
                alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(backup.triggerAtMs, mainActivityIntent()), operation)
            } else {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, backup.triggerAtMs, operation)
            }
        }
        store.armedBackups = ids
    }

    // ---------- Unpairing ----------

    private fun unpair(remote: Boolean) {
        val deviceApi = api
        lifecycleScope.launch {
            if (remote && deviceApi != null) {
                withTimeoutOrNull(UNPAIR_TIMEOUT_MS) { runCatching { deviceApi.unpair() } }
            }
            connectionJob?.cancel()
            connectionJob = null
            api = null
            getSystemService<AlarmManager>()?.let { manager ->
                store.armedBackups.forEach { manager.cancel(backupIntent(this@AlarmService, it, null)) }
            }
            shown.keys.toList().forEach(::stopRinging)
            store.clear()
            AlarmState.update { AppUiState() }
            stopService()
        }
    }

    private fun stopService() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ---------- Notifications ----------

    private fun startInForeground() {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        val connected = AlarmState.ui.value.connection == Connection.CONNECTED
        ServiceCompat.startForeground(this, LISTENER_NOTIFICATION_ID, listenerNotification(connected), type)
    }

    private fun updateForegroundNotification(connected: Boolean) {
        getSystemService<NotificationManager>()?.notify(LISTENER_NOTIFICATION_ID, listenerNotification(connected))
    }

    private fun listenerNotification(connected: Boolean): Notification =
        NotificationCompat.Builder(this, AlarmMcpApp.CHANNEL_LISTENER)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle(getString(if (connected) R.string.listening else R.string.connecting))
            .setContentText(store.pairing()?.deviceName ?: getString(R.string.app_name))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(mainActivityIntent())
            .build()

    private fun postAlarmNotification(alarm: DeviceAlarm) {
        val manager = getSystemService<NotificationManager>() ?: return
        val profile = ringProfile(alarm.intensity)
        val openAlarm = PendingIntent.getActivity(
            this,
            notificationId(alarm.alarmId),
            AlarmActivity.intent(this, alarm.alarmId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(this, AlarmMcpApp.CHANNEL_ALARMS)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle(alarm.title)
            .setContentText(alarm.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(alarm.message ?: alarm.title))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(openAlarm)
        if (profile.fullScreen) builder.setFullScreenIntent(openAlarm, true)

        val actions = if (alarm.responseOptions.isNotEmpty()) {
            alarm.responseOptions.take(2).map { option -> option to respondIntent(alarm.alarmId, ResponseAction.RESPOND, option) } +
                (getString(R.string.dismiss) to respondIntent(alarm.alarmId, ResponseAction.DISMISS, null))
        } else {
            val dismissLabel = getString(if (alarm.intensity == Intensity.URGENT) R.string.im_up else R.string.dismiss)
            listOf(
                dismissLabel to respondIntent(alarm.alarmId, ResponseAction.DISMISS, null),
                getString(R.string.snooze) to respondIntent(alarm.alarmId, ResponseAction.SNOOZE, null),
            )
        }
        actions.forEach { (label, pending) -> builder.addAction(0, label, pending) }
        manager.notify(notificationId(alarm.alarmId), builder.build())
    }

    private fun respondIntent(alarmId: String, action: ResponseAction, option: String?): PendingIntent =
        PendingIntent.getBroadcast(
            this,
            "$alarmId:${action.wireName}:${option.orEmpty()}".hashCode(),
            AlarmActionReceiver.intent(this, alarmId, action, option),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    private fun mainActivityIntent(): PendingIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    companion object {
        private const val TAG = "AlarmService"
        private const val LISTENER_NOTIFICATION_ID = 1
        private const val HEARTBEAT_INTERVAL_MS = 45_000L
        private const val FEED_RETRY_MS = 5_000L
        private const val EXPIRY_SLACK_MS = 30_000L
        private const val UNPAIR_TIMEOUT_MS = 5_000L

        const val ACTION_START = "dev.alarmmcp.android.START"
        const val ACTION_RESPOND = "dev.alarmmcp.android.RESPOND"
        const val ACTION_BACKUP = "dev.alarmmcp.android.BACKUP"
        const val ACTION_PUSH = "dev.alarmmcp.android.PUSH"
        const val ACTION_HEARTBEAT = "dev.alarmmcp.android.HEARTBEAT"
        const val ACTION_UNPAIR = "dev.alarmmcp.android.UNPAIR"

        const val EXTRA_ALARM = "alarm"
        const val EXTRA_ALARM_ID = "alarmId"
        const val EXTRA_ACTION = "action"
        const val EXTRA_OPTION = "option"
        const val EXTRA_SNOOZE_MINUTES = "snoozeMinutes"

        fun start(context: Context, action: String = ACTION_START, configure: Intent.() -> Unit = {}) {
            val intent = Intent(context, AlarmService::class.java).setAction(action).apply(configure)
            ContextCompat.startForegroundService(context, intent)
        }

        fun respond(context: Context, alarmId: String, action: ResponseAction, option: String? = null, snoozeMinutes: Double = 5.0) =
            start(context, ACTION_RESPOND) {
                putExtra(EXTRA_ALARM_ID, alarmId)
                putExtra(EXTRA_ACTION, action.wireName)
                option?.let { putExtra(EXTRA_OPTION, it) }
                putExtra(EXTRA_SNOOZE_MINUTES, snoozeMinutes)
            }

        fun notificationId(alarmId: String): Int = alarmId.hashCode().let { if (it == LISTENER_NOTIFICATION_ID) it + 1 else it }

        fun backupIntent(context: Context, alarmId: String, alarm: DeviceAlarm?): PendingIntent {
            val intent = Intent(context, BackupAlarmReceiver::class.java)
                .setData("alarm-mcp://backup/$alarmId".toUri())
            alarm?.let { intent.putExtra(EXTRA_ALARM, appJson.encodeToString(it)) }
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }
    }
}

fun Intent.alarmExtra(): DeviceAlarm? =
    getStringExtra(AlarmService.EXTRA_ALARM)?.let { runCatching { appJson.decodeFromString<DeviceAlarm>(it) }.getOrNull() }
