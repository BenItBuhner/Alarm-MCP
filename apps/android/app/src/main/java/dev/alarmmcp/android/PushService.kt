package dev.alarmmcp.android

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Optional FCM wake-up path: a high-priority data message lets the app start its service and ring
 * even if Android has killed the live connection. Only active when built with google-services.json.
 */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val store = DeviceStore(this)
        store.pushToken = token
        if (store.pairing() != null) AlarmService.start(this, AlarmService.ACTION_HEARTBEAT)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] != "alarm" || DeviceStore(this).pairing() == null) return
        val alarm = message.data["alarm"]
        AlarmService.start(this, AlarmService.ACTION_PUSH) {
            alarm?.let { putExtra(AlarmService.EXTRA_ALARM, it) }
        }
    }
}
