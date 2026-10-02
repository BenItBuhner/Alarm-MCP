package dev.alarmmcp.android

data class ShownAlarm(val alarm: DeviceAlarm, val local: Boolean)

data class RingingDiff(
    val open: List<DeviceAlarm>,
    val update: List<DeviceAlarm>,
    val close: List<String>,
)

/**
 * Compares alarms ringing on this phone with the server's ringing set. Locally fired backups stay
 * open until the server either takes them over or stops listing them as upcoming.
 */
fun diffRinging(
    shown: Map<String, ShownAlarm>,
    ringing: List<DeviceAlarm>,
    upcomingIds: Set<String>,
): RingingDiff {
    val serverIds = ringing.map { it.alarmId }.toSet()
    val open = mutableListOf<DeviceAlarm>()
    val update = mutableListOf<DeviceAlarm>()
    for (alarm in ringing) {
        val current = shown[alarm.alarmId]
        when {
            current == null -> open += alarm
            current.local ||
                current.alarm.intensity != alarm.intensity ||
                current.alarm.deliveryId != alarm.deliveryId -> update += alarm
        }
    }
    val close = shown
        .filter { (id, entry) -> id !in serverIds && !(entry.local && id in upcomingIds) && !entry.alarm.isTest }
        .keys
        .toList()
    return RingingDiff(open, update, close)
}

const val BACKUP_GRACE_MS = 20_000L
const val BACKUP_HORIZON_MS = 24L * 60 * 60 * 1000

data class Backup(val alarm: DeviceAlarm, val triggerAtMs: Long)

/** Local backups ring if the server has not delivered an alarm shortly after its fire time. */
fun backupsToArm(upcoming: List<DeviceAlarm>, nowMs: Long): List<Backup> =
    upcoming
        .map { Backup(it, maxOf(it.fireAt.toLong() + BACKUP_GRACE_MS, nowMs)) }
        .filter { it.triggerAtMs - nowMs <= BACKUP_HORIZON_MS }

/** Picks the alarm whose sound should be playing when several ring at once. */
fun loudest(alarms: Collection<ShownAlarm>): DeviceAlarm? =
    alarms.map { it.alarm }.maxWithOrNull(compareBy<DeviceAlarm>({ it.intensity.ordinal }, { it.fireAt }))

data class RingProfile(
    val startVolume: Float,
    val maxVolume: Float,
    val rampMs: Long,
    val vibrationPattern: LongArray,
    val fullScreen: Boolean,
)

fun ringProfile(intensity: Intensity): RingProfile = when (intensity) {
    Intensity.GENTLE -> RingProfile(0.12f, 0.4f, 60_000, longArrayOf(0, 200, 2_800), fullScreen = false)
    Intensity.NORMAL -> RingProfile(0.35f, 0.8f, 20_000, longArrayOf(0, 600, 900), fullScreen = true)
    Intensity.URGENT -> RingProfile(1f, 1f, 0, longArrayOf(0, 1_000, 300), fullScreen = true)
}

/** Linear volume ramp from the profile's start to max volume. */
fun volumeAt(profile: RingProfile, elapsedMs: Long): Float {
    if (profile.rampMs <= 0 || elapsedMs >= profile.rampMs) return profile.maxVolume
    val progress = elapsedMs.coerceAtLeast(0).toFloat() / profile.rampMs
    return profile.startVolume + (profile.maxVolume - profile.startVolume) * progress
}

fun normalizePairingCode(raw: String): String = raw.uppercase().filter { it.isLetterOrDigit() }

fun isRevokedError(error: Throwable): Boolean =
    error.message?.contains("not paired or revoked", ignoreCase = true) == true
