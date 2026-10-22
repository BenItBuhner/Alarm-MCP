package dev.alarmmcp.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.content.getSystemService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class Connection { SIGNED_OUT, CONNECTING, CONNECTED, OFFLINE }

data class AppUiState(
    val pairing: Pairing? = null,
    val connection: Connection = Connection.SIGNED_OUT,
    val ringing: Map<String, ShownAlarm> = emptyMap(),
    val upcoming: List<DeviceAlarm> = emptyList(),
    val lastError: String? = null,
)

/** Process-wide state shared between [AlarmService] and the activities. */
object AlarmState {
    private val mutable = MutableStateFlow(AppUiState())
    val ui: StateFlow<AppUiState> = mutable.asStateFlow()

    fun update(transform: (AppUiState) -> AppUiState) = mutable.update(transform)
}

class AlarmMcpApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService<NotificationManager>() ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_LISTENER, getString(R.string.channel_listener), NotificationManager.IMPORTANCE_MIN)
                .apply { description = getString(R.string.channel_listener_description) },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ALARMS, getString(R.string.channel_alarms), NotificationManager.IMPORTANCE_HIGH).apply {
                description = getString(R.string.channel_alarms_description)
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            },
        )
        AlarmState.update { it.copy(pairing = DeviceStore(this).pairing()) }
    }

    companion object {
        const val CHANNEL_LISTENER = "listener"
        const val CHANNEL_ALARMS = "alarms"
    }
}

fun Context.vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        getSystemService<VibratorManager>()?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        getSystemService<Vibrator>()
    }

fun Context.deviceCapabilities(): Capabilities {
    val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        getSystemService<NotificationManager>()?.canUseFullScreenIntent() == true
    } else {
        true
    }
    return Capabilities(
        sound = true,
        vibrate = vibrator()?.hasVibrator() == true,
        fullScreen = fullScreen,
        speak = true,
        actions = true,
    )
}
