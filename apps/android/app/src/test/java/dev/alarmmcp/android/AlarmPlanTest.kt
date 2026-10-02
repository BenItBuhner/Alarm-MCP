package dev.alarmmcp.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPlanTest {
    private fun alarm(id: String, intensity: Intensity = Intensity.NORMAL, fireAt: Double = 0.0, deliveryId: String? = "d-$id") =
        DeviceAlarm(
            alarmId = id,
            deliveryId = deliveryId,
            title = id,
            intensity = intensity,
            speak = false,
            vibrate = true,
            sound = AlarmSound.BEACON,
            fireAt = fireAt,
            maxRingSeconds = 300.0,
        )

    @Test
    fun opensNewAndUpdatesEscalatedOrTakenOverAlarms() {
        val shown = mapOf(
            "same" to ShownAlarm(alarm("same"), local = false),
            "escalated" to ShownAlarm(alarm("escalated", Intensity.GENTLE), local = false),
            "backup" to ShownAlarm(alarm("backup", deliveryId = null), local = true),
        )
        val ringing = listOf(alarm("same"), alarm("escalated", Intensity.URGENT), alarm("backup"), alarm("new"))
        val diff = diffRinging(shown, ringing, emptySet())
        assertEquals(listOf("new"), diff.open.map { it.alarmId })
        assertEquals(listOf("escalated", "backup"), diff.update.map { it.alarmId })
        assertTrue(diff.close.isEmpty())
    }

    @Test
    fun closesResolvedAlarmsButKeepsPendingBackupsAndTests() {
        val shown = mapOf(
            "acked" to ShownAlarm(alarm("acked"), local = false),
            "backup-pending" to ShownAlarm(alarm("backup-pending"), local = true),
            "backup-gone" to ShownAlarm(alarm("backup-gone"), local = true),
            "test-1" to ShownAlarm(alarm("test-1"), local = true),
        )
        val diff = diffRinging(shown, emptyList(), setOf("backup-pending"))
        assertEquals(setOf("acked", "backup-gone"), diff.close.toSet())
    }

    @Test
    fun armsBackupsAfterGraceWithinHorizon() {
        val now = 1_000_000L
        val upcoming = listOf(
            alarm("soon", fireAt = (now + 60_000).toDouble()),
            alarm("overdue", fireAt = (now - 60_000).toDouble()),
            alarm("far", fireAt = (now + BACKUP_HORIZON_MS + 60_000).toDouble()),
        )
        val backups = backupsToArm(upcoming, now).associate { it.alarm.alarmId to it.triggerAtMs }
        assertEquals(setOf("soon", "overdue"), backups.keys)
        assertEquals(now + 60_000 + BACKUP_GRACE_MS, backups["soon"])
        assertEquals(now, backups["overdue"])
    }

    @Test
    fun loudestPrefersIntensityThenLatest() {
        val alarms = listOf(
            ShownAlarm(alarm("a", Intensity.NORMAL, fireAt = 5.0), false),
            ShownAlarm(alarm("b", Intensity.URGENT, fireAt = 1.0), false),
            ShownAlarm(alarm("c", Intensity.URGENT, fireAt = 2.0), false),
        )
        assertEquals("c", loudest(alarms)?.alarmId)
        assertEquals(null, loudest(emptyList()))
    }

    @Test
    fun rampsVolumeAndKeepsGentleOffFullScreen() {
        val gentle = ringProfile(Intensity.GENTLE)
        assertEquals(gentle.startVolume, volumeAt(gentle, 0), 0.0001f)
        assertEquals(gentle.maxVolume, volumeAt(gentle, gentle.rampMs * 2), 0.0001f)
        assertTrue(volumeAt(gentle, gentle.rampMs / 2) in gentle.startVolume..gentle.maxVolume)
        assertEquals(false, gentle.fullScreen)
        assertEquals(1f, volumeAt(ringProfile(Intensity.URGENT), 0), 0.0001f)
    }

    @Test
    fun decodesFeedFromConvexJson() {
        val json = """
            {"device":{"id":"dev1","name":"Pixel","platform":"android"},
             "ringing":[{"alarmId":"a1","deliveryId":"d1","title":"Agent needs permission","intensity":"gentle",
               "speak":true,"vibrate":false,"sound":"chime","responseOptions":["Approve","Deny"],
               "fireAt":1790909963916,"firedAt":1790909963938,"maxRingSeconds":120}],
             "upcoming":[]}
        """.trimIndent()
        val feed = appJson.decodeFromString<Feed>(json)
        val ringing = feed.ringing.single()
        assertEquals(Intensity.GENTLE, ringing.intensity)
        assertEquals(listOf("Approve", "Deny"), ringing.responseOptions)
        assertEquals(1790909963916L, ringing.fireAt.toLong())
        assertEquals(null, ringing.message)
    }

    @Test
    fun normalizesPairingCodesAndDetectsRevocation() {
        assertEquals("WAFC46T4", normalizePairingCode(" wafc-46t4 "))
        assertTrue(isRevokedError(RuntimeException("Uncaught Error: Device not paired or revoked")))
    }
}
