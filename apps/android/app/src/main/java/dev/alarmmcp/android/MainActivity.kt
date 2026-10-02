package dev.alarmmcp.android

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.getSystemService
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.alarmmcp.android.ui.AlarmMcpTheme
import dev.alarmmcp.android.ui.Bad
import dev.alarmmcp.android.ui.Good
import dev.alarmmcp.android.ui.Muted
import dev.alarmmcp.android.ui.Panel
import dev.alarmmcp.android.ui.intensityColor
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

class MainActivity : ComponentActivity() {
    private val resumeTick = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AlarmMcpTheme {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                        .safeDrawingPadding(),
                ) {
                    val ui by AlarmState.ui.collectAsStateWithLifecycle()
                    val pairing = ui.pairing
                    if (pairing == null) PairingScreen() else StatusScreen(pairing, ui, resumeTick.intValue)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        resumeTick.intValue++
        if (DeviceStore(this).pairing() != null) AlarmService.start(this)
    }
}

@Composable
private fun PairingScreen() {
    val context = LocalContext.current
    val store = remember { DeviceStore(context) }
    val scope = rememberCoroutineScope()
    val defaultUrl = BuildConfig.DEFAULT_CONVEX_URL
    var serverUrl by remember { mutableStateOf(store.lastConvexUrl ?: defaultUrl) }
    var showServer by remember { mutableStateOf(defaultUrl.isEmpty()) }
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf(defaultDeviceName()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Alarm MCP", fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text(
            "Let your AI agents wake you up when they finish, or softly when they need your permission.",
            color = Muted,
        )
        Spacer(Modifier.size(8.dp))
        Text(
            "Open the Alarm MCP dashboard at alarm-mcp.techlitnow.com, choose Pair a device, and enter the code shown there.",
            color = Muted,
            fontSize = 14.sp,
        )
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.uppercase().take(12) },
            label = { Text("Pairing code") },
            placeholder = { Text("ABCD-EFGH") },
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.take(60) },
            label = { Text("Device name") },
            supportingText = { Text("Agents can target it by name, e.g. \"wake me on my phone\".") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (showServer) {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it.trim() },
                label = { Text("Convex deployment URL") },
                placeholder = { Text("https://your-deployment.convex.cloud") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            TextButton(onClick = { showServer = true }) { Text("Use a different server", color = Muted) }
        }
        error?.let { Text(it, color = Bad, fontSize = 14.sp) }
        Button(
            enabled = !busy && normalizePairingCode(code).length == 8 && name.isNotBlank() && serverUrl.startsWith("http"),
            onClick = {
                busy = true
                error = null
                scope.launch {
                    runCatching {
                        DeviceApi.pair(serverUrl, code, name.trim(), context.deviceCapabilities(), BuildConfig.VERSION_NAME)
                    }.onSuccess { result ->
                        val pairing = Pairing(serverUrl, result.deviceId, result.deviceToken, name.trim(), result.userName)
                        store.lastConvexUrl = serverUrl
                        store.savePairing(pairing)
                        AlarmState.update { it.copy(pairing = pairing, connection = Connection.CONNECTING) }
                        AlarmService.start(context)
                    }.onFailure {
                        error = friendlyError(it)
                    }
                    busy = false
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) "Pairing…" else "Pair this phone") }
    }
}

@Composable
private fun StatusScreen(pairing: Pairing, ui: AppUiState, resumeTick: Int) {
    val context = LocalContext.current
    val connected = ui.connection == Connection.CONNECTED

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Alarm MCP", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Dot(if (connected) Good else Muted)
            Spacer(Modifier.width(6.dp))
            Text(if (connected) "connected" else "connecting", color = Muted, fontSize = 13.sp)
        }
        Card {
            Text("Paired as", color = Muted, fontSize = 13.sp)
            Text(pairing.deviceName, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            pairing.userName?.let { Text("Account: $it", color = Muted, fontSize = 14.sp) }
        }

        if (ui.ringing.isNotEmpty()) {
            Card {
                Text("Ringing now", fontWeight = FontWeight.SemiBold)
                ui.ringing.values.forEach { (alarm, _) ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                        Dot(intensityColor(alarm.intensity))
                        Spacer(Modifier.width(8.dp))
                        Text(alarm.title, modifier = Modifier.weight(1f))
                        TextButton(onClick = { context.startActivity(AlarmActivity.intent(context, alarm.alarmId)) }) { Text("Open") }
                    }
                }
            }
        }

        SetupChecklist(resumeTick)

        Card {
            Text("Upcoming", fontWeight = FontWeight.SemiBold)
            if (ui.upcoming.isEmpty()) {
                Text("Nothing scheduled. Ask your agent to wake you when it's done.", color = Muted, fontSize = 14.sp)
            }
            ui.upcoming.forEach { alarm ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                    Dot(intensityColor(alarm.intensity))
                    Spacer(Modifier.width(8.dp))
                    Text(alarm.title, modifier = Modifier.weight(1f))
                    Text(formatTime(alarm.fireAt), color = Muted, fontSize = 14.sp)
                }
            }
        }

        ui.lastError?.let { Text(it, color = Bad, fontSize = 13.sp) }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { AlarmService.start(context, AlarmService.ACTION_TEST) }, modifier = Modifier.weight(1f)) {
                Text("Test alarm")
            }
            OutlinedButton(onClick = { AlarmService.start(context, AlarmService.ACTION_UNPAIR) }, modifier = Modifier.weight(1f)) {
                Text("Unpair")
            }
        }
        Text("v${BuildConfig.VERSION_NAME}", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun SetupChecklist(resumeTick: Int) {
    val context = LocalContext.current
    var permissionTick by remember { mutableIntStateOf(0) }
    val notificationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionTick++ }
    val checks = remember(resumeTick, permissionTick) { setupChecks(context) }
    if (checks.all { it.ok }) return

    Card {
        Text("Make sure alarms can wake you", fontWeight = FontWeight.SemiBold)
        checks.forEach { check ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                Dot(if (check.ok) Good else Bad)
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(check.title, fontSize = 15.sp)
                    Text(check.detail, color = Muted, fontSize = 12.sp)
                }
                if (!check.ok) {
                    TextButton(onClick = {
                        if (check.kind == SetupKind.NOTIFICATIONS && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            check.settingsIntent?.let { runCatching { context.startActivity(it) } }
                        }
                    }) { Text("Fix") }
                }
            }
        }
    }
}

private enum class SetupKind { NOTIFICATIONS, FULL_SCREEN, EXACT_ALARMS, BATTERY }

private data class SetupCheck(
    val kind: SetupKind,
    val title: String,
    val detail: String,
    val ok: Boolean,
    val settingsIntent: Intent?,
)

private fun setupChecks(context: Context): List<SetupCheck> {
    val packageUri = "package:${context.packageName}".toUri()
    val notifications = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val fullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        context.getSystemService<NotificationManager>()?.canUseFullScreenIntent() == true
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.getSystemService<AlarmManager>()?.canScheduleExactAlarms() == true
    val battery = context.getSystemService<PowerManager>()?.isIgnoringBatteryOptimizations(context.packageName) == true

    return listOf(
        SetupCheck(SetupKind.NOTIFICATIONS, "Notifications", "Needed to show alarms.", notifications, null),
        SetupCheck(
            SetupKind.FULL_SCREEN,
            "Full-screen alarms",
            "Lets alarms take over the lock screen.",
            fullScreen,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
            } else {
                null
            },
        ),
        SetupCheck(
            SetupKind.EXACT_ALARMS,
            "Exact alarms",
            "Rings on time even if the connection drops.",
            exact,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri) else null,
        ),
        SetupCheck(
            SetupKind.BATTERY,
            "Unrestricted battery",
            "Keeps the live connection alive overnight.",
            battery,
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri),
        ),
    )
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Panel)
            .padding(16.dp),
    ) { content() }
}

@Composable
private fun Dot(color: Color) {
    Box(
        Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(color),
    )
}

private fun defaultDeviceName(): String {
    val model = Build.MODEL.orEmpty()
    val maker = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercase() }
    return if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model".trim()
}

private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)

private fun formatTime(epochMs: Double): String =
    timeFormatter.format(Instant.ofEpochMilli(epochMs.toLong()).atZone(ZoneId.systemDefault()))

private fun friendlyError(error: Throwable): String {
    val message = error.message.orEmpty()
    return when {
        message.contains("expired", ignoreCase = true) -> "That code has expired. Create a new one on the dashboard."
        message.contains("invalid", ignoreCase = true) || message.contains("not found", ignoreCase = true) ->
            "That code didn't work. Check it and try again."
        else -> message.lineSequence().firstOrNull { it.isNotBlank() }?.take(200) ?: "Pairing failed."
    }
}
