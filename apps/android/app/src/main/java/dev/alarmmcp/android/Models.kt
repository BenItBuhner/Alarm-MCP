package dev.alarmmcp.android

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
enum class Intensity {
    @SerialName("gentle") GENTLE,
    @SerialName("normal") NORMAL,
    @SerialName("urgent") URGENT,
}

@Serializable
enum class AlarmSound {
    @SerialName("chime") CHIME,
    @SerialName("beacon") BEACON,
    @SerialName("klaxon") KLAXON,
}

/** Mirrors the backend `deviceAlarm` validator. Convex numbers arrive as JSON doubles. */
@Serializable
data class DeviceAlarm(
    val alarmId: String,
    val deliveryId: String? = null,
    val title: String,
    val message: String? = null,
    val intensity: Intensity,
    val speak: Boolean,
    val vibrate: Boolean,
    val sound: AlarmSound,
    val responseOptions: List<String> = emptyList(),
    val fireAt: Double,
    val firedAt: Double? = null,
    val maxRingSeconds: Double,
) {
    val isTest: Boolean get() = alarmId.startsWith(TEST_ALARM_PREFIX)
}

@Serializable
data class FeedDevice(val id: String, val name: String, val platform: String)

@Serializable
data class Feed(val device: FeedDevice, val ringing: List<DeviceAlarm>, val upcoming: List<DeviceAlarm>)

@Serializable
data class PairResult(val deviceId: String, val deviceToken: String, val userName: String? = null)

@Serializable
enum class ResponseAction {
    @SerialName("dismiss") DISMISS,
    @SerialName("respond") RESPOND,
    @SerialName("snooze") SNOOZE;

    val wireName: String get() = name.lowercase()
}

@Serializable
data class PendingResponse(
    val alarmId: String,
    val action: ResponseAction,
    val option: String? = null,
    val snoozeMinutes: Double? = null,
)

const val TEST_ALARM_PREFIX = "test-"

val appJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
}
