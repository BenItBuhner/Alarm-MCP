package dev.alarmmcp.android

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.getSystemService
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.alarmmcp.android.ui.AlarmMcpTheme
import dev.alarmmcp.android.ui.Muted
import dev.alarmmcp.android.ui.alarmBackground
import dev.alarmmcp.android.ui.intensityColor
import kotlinx.coroutines.delay

/** Full-screen alarm shown over the lock screen for normal and urgent alarms. */
class AlarmActivity : ComponentActivity() {
    private val alarmId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        alarmId.value = intent.getStringExtra(EXTRA_ALARM_ID)
        setContent {
            AlarmMcpTheme {
                AlarmScreen(
                    alarmId = alarmId.value,
                    onRespond = { id, action, option ->
                        AlarmService.respond(this, id, action, option)
                        finish()
                    },
                    onGone = ::finish,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        alarmId.value = intent.getStringExtra(EXTRA_ALARM_ID)
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        getSystemService<KeyguardManager>()?.requestDismissKeyguard(this, null)
    }

    companion object {
        private const val EXTRA_ALARM_ID = "alarmId"

        fun intent(context: Context, alarmId: String): Intent =
            Intent(context, AlarmActivity::class.java)
                .putExtra(EXTRA_ALARM_ID, alarmId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    }
}

@Composable
private fun AlarmScreen(
    alarmId: String?,
    onRespond: (String, ResponseAction, String?) -> Unit,
    onGone: () -> Unit,
) {
    val ui by AlarmState.ui.collectAsStateWithLifecycle()
    val alarm = (alarmId?.let { ui.ringing[it] } ?: loudest(ui.ringing.values)?.let { ui.ringing[it.alarmId] })?.alarm
    if (alarm == null) {
        LaunchedEffect(Unit) { onGone() }
        return
    }
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(1_000)
            value = System.currentTimeMillis()
        }
    }
    val endsAt = (alarm.firedAt ?: alarm.fireAt).toLong() + (alarm.maxRingSeconds * 1000).toLong()
    val remaining = ((endsAt - now) / 1000).coerceAtLeast(0)
    val urgent = alarm.intensity == Intensity.URGENT

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(alarmBackground(alarm.intensity))
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(intensityColor(alarm.intensity)),
            )
            Text(
                alarm.title,
                fontSize = if (urgent) 34.sp else 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            alarm.message?.let { Text(it, color = Muted, fontSize = 17.sp, textAlign = TextAlign.Center) }
            Spacer(Modifier.height(12.dp))
            alarm.responseOptions.forEach { option ->
                Button(
                    onClick = { onRespond(alarm.alarmId, ResponseAction.RESPOND, option) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) { Text(option, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
            }
            val dismissLabel = stringResource(if (urgent && alarm.responseOptions.isEmpty()) R.string.im_up else R.string.dismiss)
            if (alarm.responseOptions.isEmpty()) {
                Button(
                    onClick = { onRespond(alarm.alarmId, ResponseAction.DISMISS, null) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) { Text(dismissLabel, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
            } else {
                OutlinedButton(
                    onClick = { onRespond(alarm.alarmId, ResponseAction.DISMISS, null) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text(dismissLabel) }
            }
            OutlinedButton(
                onClick = { onRespond(alarm.alarmId, ResponseAction.SNOOZE, null) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onBackground),
            ) { Text(stringResource(R.string.snooze)) }
            Text(
                "${alarm.intensity.name.lowercase()} · stops ringing in ${remaining / 60}:${"%02d".format(remaining % 60)}",
                color = Muted,
                fontSize = 13.sp,
            )
        }
    }
}
