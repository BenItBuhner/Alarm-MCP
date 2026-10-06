package dev.alarmmcp.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (DeviceStore(context).pairing() != null) AlarmService.start(context)
    }
}

/** Fired by AlarmManager when the server has not delivered an upcoming alarm in time. */
class BackupAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarm = intent.getStringExtra(AlarmService.EXTRA_ALARM) ?: return
        AlarmService.start(context, AlarmService.ACTION_BACKUP) { putExtra(AlarmService.EXTRA_ALARM, alarm) }
    }
}

/** Handles the response buttons on alarm notifications. */
class AlarmActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra(AlarmService.EXTRA_ALARM_ID) ?: return
        val action = intent.getStringExtra(AlarmService.EXTRA_ACTION)
            ?.let { name -> ResponseAction.entries.firstOrNull { it.wireName == name } } ?: return
        AlarmService.respond(context, alarmId, action, intent.getStringExtra(AlarmService.EXTRA_OPTION))
    }

    companion object {
        fun intent(context: Context, alarmId: String, action: ResponseAction, option: String?): Intent =
            Intent(context, AlarmActionReceiver::class.java)
                .putExtra(AlarmService.EXTRA_ALARM_ID, alarmId)
                .putExtra(AlarmService.EXTRA_ACTION, action.wireName)
                .apply { option?.let { putExtra(AlarmService.EXTRA_OPTION, it) } }
    }
}
