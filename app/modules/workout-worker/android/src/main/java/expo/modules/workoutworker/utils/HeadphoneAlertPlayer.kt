package expo.modules.workoutworker.utils

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.util.Log

/**
 * Plays the rest alert through headphones when the phone is on silent or vibrate.
 *
 * Notification sounds go out on the notification stream, which the ringer mode mutes - so someone
 * training with headphones on a silenced phone hears nothing. Workout apps get around this the way
 * media apps do: play the cue on the media stream, which ringer mode doesn't touch, ducking any music
 * underneath it. We only do this when headphones are connected, so a silenced phone never plays out
 * of its own speaker, and never while Do Not Disturb is on.
 */
class HeadphoneAlertPlayer(private val context: Context) {

    private val audioManager = context.getSystemService(AudioManager::class.java)

    private val headphoneTypes = setOf(
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
    )

    private val mediaAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    fun playIfSilenced() {
        try {
            if (!shouldPlay()) return
            play()
        } catch (e: Exception) {
            Log.e("HeadphoneAlertPlayer", "Failed to play headphone alert", e)
        }
    }

    private fun shouldPlay(): Boolean {
        // With the ringer on, the notification's own sound already reaches the headphones.
        if (audioManager.ringerMode == AudioManager.RINGER_MODE_NORMAL) return false
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        if (notificationManager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) {
            return false
        }
        return audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in headphoneTypes }
    }

    private fun play() {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return
        val focusRequest = requestFocus()
        val player = MediaPlayer()
        val release = {
            player.release()
            abandonFocus(focusRequest)
        }
        player.setAudioAttributes(mediaAttributes)
        player.setDataSource(context, uri)
        player.setOnCompletionListener { release() }
        player.setOnErrorListener { _, _, _ -> release(); true }
        player.setOnPreparedListener { it.start() }
        player.prepareAsync()
    }

    private fun requestFocus(): AudioFocusRequest? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(mediaAttributes)
            .build()
        audioManager.requestAudioFocus(request)
        return request
    }

    private fun abandonFocus(request: AudioFocusRequest?) {
        if (request != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest(request)
        }
    }
}
