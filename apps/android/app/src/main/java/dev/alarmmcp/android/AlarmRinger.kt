package dev.alarmmcp.android

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.os.VibrationEffect
import android.speech.tts.TextToSpeech
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Plays one alarm at a time on the alarm audio stream, with vibration and optional speech. */
class AlarmRinger(private val context: Context, private val scope: CoroutineScope) {
    private val alarmAudio = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    private var player: MediaPlayer? = null
    private var rampJob: Job? = null
    private var playing: DeviceAlarm? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null

    /** Starts or switches to [alarm]; a no-op if it is already playing at the same intensity. */
    fun play(alarm: DeviceAlarm) {
        val current = playing
        if (current != null && current.alarmId == alarm.alarmId && current.intensity == alarm.intensity) return
        stopSound()
        playing = alarm
        val profile = ringProfile(alarm.intensity)
        startSound(alarm.sound, profile)
        if (alarm.vibrate) startVibration(profile)
        if (alarm.speak) speak(listOfNotNull(alarm.title, alarm.message).joinToString(". "))
    }

    fun stop() {
        stopSound()
        playing = null
        tts?.stop()
    }

    fun release() {
        stop()
        tts?.shutdown()
        tts = null
    }

    private fun startSound(sound: AlarmSound, profile: RingProfile) {
        val uri = soundUri(sound) ?: return
        val mediaPlayer = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(alarmAudio)
                setDataSource(context, uri)
                isLooping = true
                prepare()
                setVolume(profile.startVolume, profile.startVolume)
                start()
            }
        }.onFailure { Log.w(TAG, "Could not play alarm sound", it) }.getOrNull() ?: return
        player = mediaPlayer
        val startedAt = SystemClock.elapsedRealtime()
        rampJob = scope.launch {
            while (isActive) {
                val volume = volumeAt(profile, SystemClock.elapsedRealtime() - startedAt)
                runCatching { mediaPlayer.setVolume(volume, volume) }
                if (volume >= profile.maxVolume) break
                delay(500)
            }
        }
    }

    private fun soundUri(sound: AlarmSound): Uri? {
        val preferred = when (sound) {
            AlarmSound.CHIME -> RingtoneManager.TYPE_NOTIFICATION
            AlarmSound.BEACON, AlarmSound.KLAXON -> RingtoneManager.TYPE_ALARM
        }
        return RingtoneManager.getDefaultUri(preferred)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    }

    @Suppress("DEPRECATION")
    private fun startVibration(profile: RingProfile) {
        val vibrator = context.vibrator() ?: return
        if (!vibrator.hasVibrator()) return
        vibrator.vibrate(VibrationEffect.createWaveform(profile.vibrationPattern, 0), alarmAudio)
    }

    private fun speak(text: String) {
        val engine = tts
        if (engine != null && ttsReady) {
            engine.setAudioAttributes(alarmAudio)
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), "alarm")
            return
        }
        pendingSpeech = text
        if (engine == null) {
            tts = TextToSpeech(context.applicationContext) { status ->
                ttsReady = status == TextToSpeech.SUCCESS
                val queued = pendingSpeech
                pendingSpeech = null
                if (ttsReady && queued != null && playing != null) speak(queued)
            }
        }
    }

    private fun stopSound() {
        rampJob?.cancel()
        rampJob = null
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
        context.vibrator()?.cancel()
    }

    private companion object {
        const val TAG = "AlarmRinger"
    }
}
