package dev.alarmmcp.android

import android.content.Context
import androidx.core.content.edit
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

@Serializable
data class Pairing(
    val convexUrl: String,
    val deviceId: String,
    val deviceToken: String,
    val deviceName: String,
    val userName: String? = null,
)

/**
 * App-private storage for the pairing and small bits of state that must survive process death.
 * Backups are disabled in the manifest so the device token never leaves the phone.
 */
class DeviceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("alarm-mcp", Context.MODE_PRIVATE)

    fun pairing(): Pairing? =
        prefs.getString(KEY_PAIRING, null)?.let { runCatching { appJson.decodeFromString<Pairing>(it) }.getOrNull() }

    fun savePairing(pairing: Pairing) = prefs.edit { putString(KEY_PAIRING, appJson.encodeToString(pairing)) }

    fun clear() = prefs.edit {
        remove(KEY_PAIRING)
        remove(KEY_PENDING)
        remove(KEY_ARMED)
    }

    var pushToken: String?
        get() = prefs.getString(KEY_PUSH_TOKEN, null)
        set(value) = prefs.edit { putString(KEY_PUSH_TOKEN, value) }

    var lastConvexUrl: String?
        get() = prefs.getString(KEY_LAST_URL, null)
        set(value) = prefs.edit { putString(KEY_LAST_URL, value) }

    fun pendingResponses(): List<PendingResponse> =
        prefs.getString(KEY_PENDING, null)
            ?.let { runCatching { appJson.decodeFromString(pendingSerializer, it) }.getOrNull() }
            ?: emptyList()

    fun setPendingResponses(responses: List<PendingResponse>) =
        prefs.edit { putString(KEY_PENDING, appJson.encodeToString(pendingSerializer, responses)) }

    var armedBackups: Set<String>
        get() = prefs.getStringSet(KEY_ARMED, emptySet()) ?: emptySet()
        set(value) = prefs.edit { putStringSet(KEY_ARMED, value) }

    private companion object {
        const val KEY_PAIRING = "pairing"
        const val KEY_PUSH_TOKEN = "pushToken"
        const val KEY_LAST_URL = "lastConvexUrl"
        const val KEY_PENDING = "pendingResponses"
        const val KEY_ARMED = "armedBackups"
        val pendingSerializer = ListSerializer(PendingResponse.serializer())
    }
}
