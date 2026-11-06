/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
package com.duetto.platform

import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.telecom.CallAudioState
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * The channel, as Android's telephony sees it: a call.
 *
 * WHY
 * For Android, Duetto in the channel was an app with a foreground
 * service that uses the microphone - and some phones close exactly that.
 * A Motorola closed it at the stroke of the hour, in the middle of a
 * conversation, about once a day: "[KILL UID] Foreground kill". WhatsApp,
 * Signal and Discord do not suffer it because while they talk they are
 * a CALL, through the telecom framework, in "self-managed" mode: their
 * own interface, no call log, no dialer - and the system keeps a
 * process in a call bound and important.
 *
 * So entering the channel opens such a call, and leaving closes it.
 * Waiting outside the channel is not a call, and stays as it was.
 *
 * A real phone call that is answered puts ours on hold, and ends by
 * giving it back: Telecom says both, and they are passed on.
 *
 * If a phone refuses - an old Android, a maker that left telecom out -
 * nothing else changes: the channel goes on as before, and the journal
 * says so.
 */
object Calls {
    private const val TAG = "Duetto"
    private const val ACCOUNT_ID = "duetto-channel"

    /** the call in progress, if there is one */
    @Volatile var connection: DuettoConnection? = null

    /** where the states go: set by CallsModule */
    @Volatile var listener: ((String) -> Unit)? = null

    /** for the journal: the states arrive from Telecom, with no context of their own */
    @Volatile var appCtx: Context? = null
        private set

    fun say(state: String) {
        appCtx?.let { Journal.sample(it, "call:$state") }
        listener?.invoke(state)
    }

    private fun handle(ctx: Context) = PhoneAccountHandle(
        ComponentName(ctx, DuettoConnectionService::class.java), ACCOUNT_ID,
    )

    /**
     * Opens the call. Gives back "placed" when Telecom took it (the
     * state follows as "active", or "failed"), or why not.
     */
    fun start(ctx: Context, name: String): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "too-old"
        if (connection != null) return "already"
        appCtx = ctx.applicationContext
        // Other apps' calls are watched whether telecom takes ours or not.
        watchOthers(ctx)
        /**
         * Not over a telephone call.
         *
         * A call of ours going active puts the one in progress on hold:
         * Duetto restarted by an update in the middle of a phone call
         * came back into the channel, opened its call, and the person on
         * the phone found themselves on hold. While the phone is busy the
         * call waits, and is placed the moment it is free.
         */
        if (phoneBusy(ctx)) {
            waitForPhone(ctx, name)
            return "waiting-phone"
        }
        return place(ctx, name)
    }

    private val clock = Handler(Looper.getMainLooper())
    private var waiting: Runnable? = null

    /**
     * In a call or ringing. A call in progress by the "in a call" mode alone:
     * the call state stayed "off hook" for minutes after a call ended on
     * a dual-SIM phone, and the channel waited silent all that while.
     * The call state, when allowed, only for the ringing.
     */
    private fun phoneBusy(ctx: Context): Boolean {
        // Not the "ringtone" mode: Android passes through it after our own
        // call is closed, with nobody calling, and a quick way out and
        // back in showed "a call on the phone" for a couple of seconds.
        val mode = ctx.getSystemService(AudioManager::class.java)?.mode
        if (mode == AudioManager.MODE_IN_CALL) return true
        if (ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            try {
                @Suppress("DEPRECATION")
                val st = ctx.getSystemService(TelephonyManager::class.java)?.callState
                if (st == TelephonyManager.CALL_STATE_RINGING) return true
            } catch (_: Exception) { /* not known: the mode said it */ }
        }
        return false
    }

    private fun waitForPhone(ctx: Context, name: String) {
        stopWaiting()
        say("wait-phone")
        var free = 0
        val r = object : Runnable {
            override fun run() {
                free = if (phoneBusy(ctx)) 0 else free + 1
                if (free >= 2) {
                    waiting = null
                    // Said first: the audio our call takes on going active
                    // must be read as ours from this moment.
                    say("phone-free")
                    place(ctx, name)
                    return
                }
                clock.postDelayed(this, 1000)
            }
        }
        waiting = r
        clock.postDelayed(r, 1000)
    }

    private fun stopWaiting() {
        waiting?.let { clock.removeCallbacks(it) }
        waiting = null
    }

    private fun place(ctx: Context, name: String): String {
        return try {
            val telecom = ctx.getSystemService(TelecomManager::class.java) ?: return "no-telecom"
            val account = handle(ctx)
            telecom.registerPhoneAccount(
                PhoneAccount.builder(account, "Duetto")
                    .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                    .setIcon(Icon.createWithResource(ctx, R.drawable.ic_notification))
                    .build(),
            )
            if (!telecom.isOutgoingCallPermitted(account)) return "not-permitted"
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, account)
                putString(EXTRA_NAME, name)
            }
            telecom.placeCall(Uri.fromParts("duetto", name.ifEmpty { "channel" }, null), extras)
            "placed"
        } catch (e: Exception) {
            Log.w(TAG, "call: not placed: ${e.message}")
            "refused:${e.javaClass.simpleName}"
        }
    }

    /**
     * Gives the call back after a real one ended.
     *
     * Telecom holds a self-managed call when another is answered and
     * does not give it back: it is up to the app. The audio mode could
     * not say when - a WhatsApp call is in the same mode as ours, and
     * ours came back seven seconds into it - so JavaScript says, when
     * the audio is given back to us; and DuettoConnection.watch, when
     * the telephone's mode is left or another app's call is gone. The
     * channel's output and volume come back with it (backFromHold,
     * giveBack).
     */
    fun resume() {
        val c = connection ?: return
        if (c.state != Connection.STATE_HOLDING) return
        c.setActive()
        say("resumed")
        c.backFromHold()
        outputMoved()
    }

    /**
     * The phone's own ringtone, while the channel's call is on.
     *
     * With a call in progress - and ours is one - Android does not ring
     * for a new one: it plays the call-waiting beeps, which one does not
     * recognise as the telephone. Knowing that the phone rings takes the
     * phone permission; granted, Duetto plays the ringtone itself until
     * the call is answered or gone. Refused, the beeps stay.
     */
    private var ringtone: Ringtone? = null
    private var callback: Any? = null

    /** The phone ringing, by its call state. */
    @Volatile private var ringing = false

    /**
     * The channel's call volume, output by output, written down when a
     * telephone call comes to take the line - at its ringing, or at the
     * hold for a call made from here - and given back when the channel is
     * on that output again (giveBack).
     *
     * Android keeps one call volume for each output - the speaker, the
     * earpiece, a headset - and the channel and a telephone call share
     * it. A call made louder or softer on the speaker left the channel at
     * that volume after it: 36 of the 65 calls counted under
     * hushWaitingBeeps. The other's voice comes back as it was.
     */
    private val kept = mutableMapOf<String, Int>()

    /** Outputs taken to the bottom for the waiting beeps, owed their volume. */
    private val hushed = mutableSetOf<String>()

    private const val CALL_STREAM = AudioManager.STREAM_VOICE_CALL

    private fun bottom(am: AudioManager): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) am.getStreamMinVolume(CALL_STREAM) else 1

    /**
     * The call-waiting beeps, made faint.
     *
     * Android plays them on the call volume, through the output in use -
     * the speaker, often - and the call volume is the one Duetto keeps
     * high for the other's voice: they came out very loud. While the
     * phone rings the call volume of that output goes to its bottom. The
     * other's voice in the channel is fainter for those seconds too:
     * somebody is calling.
     *
     * It goes back up on the same output (giveBack). It used to go back
     * the moment the ringing was over, on whatever output was in use -
     * and answering moves our call to the ear first (onHold): the
     * earpiece got the speaker's volume, and the speaker stayed at the
     * bottom. Of 65 calls answered on the POCO with the channel on the
     * speaker, 13 October to 6 November, 16 gave the channel back at 1
     * of 12, and in 49 the call put on the speaker began at 1 too.
     */
    private fun hushWaitingBeeps(ctx: Context, where: String?) {
        // An option, on unless switched off (see setQuietWaitingBeeps).
        if (!ctx.getSharedPreferences(PREFS_CALLS, Context.MODE_PRIVATE).getBoolean(KEY_QUIET_BEEPS, true)) return
        // An output not known could not be given its volume back.
        if (where == null || where in hushed) return
        try {
            val am = ctx.getSystemService(AudioManager::class.java) ?: return
            val now = am.getStreamVolume(CALL_STREAM)
            if (now <= bottom(am)) return
            hushed.add(where)
            am.setStreamVolume(CALL_STREAM, bottom(am), 0)
            Journal.sample(ctx, "call:waiting-beeps-hushed:$now")
        } catch (e: Exception) {
            Log.w(TAG, "waiting beeps: ${e.message}")
        }
    }

    /** The option behind hushWaitingBeeps, kept where the ringing is heard. */
    fun setQuietWaitingBeeps(ctx: Context, on: Boolean) {
        ctx.getSharedPreferences(PREFS_CALLS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_QUIET_BEEPS, on).apply()
    }
    private const val PREFS_CALLS = "duetto_calls"
    private const val KEY_QUIET_BEEPS = "quiet_waiting_beeps"

    /**
     * The channel's volume where it is now, written down (see kept). An
     * output hushed for the beeps keeps the volume written at the
     * ringing: the bottom is not the channel's. Gives back the output,
     * when it is known.
     */
    private fun keepVolume(ctx: Context): String? {
        val where = whereNow() ?: return null
        if (where in hushed) return where
        try {
            val now = ctx.getSystemService(AudioManager::class.java)?.getStreamVolume(CALL_STREAM)
                ?: return where
            kept[where] = now
            Journal.sample(ctx, "call:volume-kept:$where:$now")
        } catch (e: Exception) {
            Log.w(TAG, "call volume not kept: ${e.message}")
        }
        return where
    }

    /** A call takes the line: the channel's volume, before ours goes to the ear. */
    fun keepForHold() {
        appCtx?.let { keepVolume(it) }
    }

    /**
     * The call volume given back, on the output in use.
     *
     * Android sets the volume of the output in use and of no other, so
     * this is asked whenever that may have changed - the ringing over,
     * the output moved, our call back. An output hushed for the beeps
     * goes back up as soon as the ringing is over: a call answered and
     * put on the speaker is heard at the volume of before, not at the
     * bottom. And with our call active again, an output written down
     * gets the channel's own volume, however the call left it.
     */
    private fun giveBack() {
        if (ringing) return
        val ctx = appCtx ?: return
        val where = whereNow() ?: return
        val mine = kept[where] ?: return
        try {
            val am = ctx.getSystemService(AudioManager::class.java) ?: return
            var now = am.getStreamVolume(CALL_STREAM)
            // Still at the bottom: nobody moved it meanwhile.
            if (hushed.remove(where) && now <= bottom(am) && mine > now) {
                am.setStreamVolume(CALL_STREAM, mine, 0)
                now = mine
                Journal.sample(ctx, "call:volume-back:$where:$mine")
            }
            if (connection?.state != Connection.STATE_ACTIVE) return
            kept.remove(where)
            if (now != mine) {
                am.setStreamVolume(CALL_STREAM, mine, 0)
                Journal.sample(ctx, "call:volume-back:$where:$mine")
            }
        } catch (e: Exception) {
            Log.w(TAG, "call volume back: ${e.message}")
        }
    }

    /** The output may have moved, or our call come back: see giveBack. From any thread. */
    fun outputMoved() {
        clock.post { giveBack() }
    }

    /**
     * The output in use, followed (Android 12 on): Android's own word
     * when it moves, for the volume owed to an output - telecom does not
     * always say it (whereNow).
     */
    private var outputCb: Any? = null

    fun watchOutput(ctx: Context) {
        appCtx = ctx.applicationContext
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || outputCb != null) return
        try {
            val am = ctx.getSystemService(AudioManager::class.java) ?: return
            val l = AudioManager.OnCommunicationDeviceChangedListener { giveBack() }
            am.addOnCommunicationDeviceChangedListener(ctx.mainExecutor, l)
            outputCb = l
        } catch (e: Exception) {
            Log.w(TAG, "output not followed: ${e.message}")
        }
    }

    private fun unwatchOutput() {
        val l = outputCb ?: return
        outputCb = null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        try {
            appCtx?.getSystemService(AudioManager::class.java)
                ?.removeOnCommunicationDeviceChangedListener(l as AudioManager.OnCommunicationDeviceChangedListener)
        } catch (_: Exception) { /* noop */ }
    }

    private fun onCallState(state: Int) {
        val ctx = appCtx ?: return
        ringing = state == TelephonyManager.CALL_STATE_RINGING
        if (ringing && connection?.state == Connection.STATE_ACTIVE) {
            hushWaitingBeeps(ctx, keepVolume(ctx))
            val am = ctx.getSystemService(AudioManager::class.java)
            if (am?.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
            if (ringtone?.isPlaying == true) return
            try {
                val uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE)
                    ?: return
                ringtone = RingtoneManager.getRingtone(ctx, uri)?.apply {
                    audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
                    play()
                }
                Journal.sample(ctx, "call:ringtone")
            } catch (e: Exception) {
                Log.w(TAG, "ringtone: ${e.message}")
            }
        } else {
            stopRinging()
            giveBack()
        }
    }

    fun stopRingingNow() = stopRinging()

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Exception) { /* noop */ }
        ringtone = null
    }

    /** Starts listening for the phone ringing, if the permission is there. */
    fun watchRinging(ctx: Context) {
        if (callback != null) return
        if (ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
        val tm = ctx.getSystemService(TelephonyManager::class.java) ?: return
        appCtx = ctx.applicationContext
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) = onCallState(state)
                }
                tm.registerTelephonyCallback(ctx.mainExecutor, cb)
                callback = cb
            } else {
                @Suppress("DEPRECATION")
                val l = object : PhoneStateListener() {
                    // On the thread that made it - the module's, when the
                    // permission came later: to the main one, with the
                    // volumes it keeps (kept, hushed).
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, number: String?) {
                        clock.post { onCallState(state) }
                    }
                }
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                callback = l
            }
        } catch (e: Exception) {
            Log.w(TAG, "ringing not watched: ${e.message}")
        }
    }

    private fun unwatchRinging() {
        stopRinging()
        ringing = false
        val cb = callback ?: return
        callback = null
        val tm = appCtx?.getSystemService(TelephonyManager::class.java) ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && cb is TelephonyCallback) {
                tm.unregisterTelephonyCallback(cb)
            } else if (cb is PhoneStateListener) {
                @Suppress("DEPRECATION")
                tm.listen(cb, PhoneStateListener.LISTEN_NONE)
            }
        } catch (_: Exception) { /* noop */ }
    }

    /**
     * Another app's call, seen by the microphone and by the speaker.
     *
     * WhatsApp does not go through telecom on every phone, and there its
     * call reached us by no road: no hold, and the audio focus it took
     * was the telecom framework's, held for our call. Two things show it
     * all the same, with no permission: the system silences our
     * microphone when another app's call takes it, and another app plays
     * a voice-communication stream beside ours. Either one says "another
     * call"; both gone, it is over.
     */
    private var recCb: AudioManager.AudioRecordingCallback? = null
    private var playCb: AudioManager.AudioPlaybackCallback? = null
    private var micTaken = false
    private var voiceBeside = false
    private var otherCall = false

    /** Another app's call, as the microphone and the speaker say now. */
    val otherCallNow: Boolean get() = otherCall

    /**
     * The last moment another app's call was seen (uptime ms): the
     * moment it came, or the moment it went. See DuettoConnection.watch.
     */
    @Volatile var otherCallSeenAt = 0L
        private set

    /**
     * Our own call's sound, which is not somebody else's call.
     *
     * A call arriving in the channel sounds as a voice-communication
     * stream - Android's own beep for a notification during a call has
     * that use, and some phones give our ringtone the same - and with
     * WebRTC's beside it that made two voices: "another call", the
     * channel hushed for the length of the sound and back. On the OPPO
     * two calls from the POCO read as two calls of somebody else's. For a
     * few seconds after a call of ours sounds, a second voice is not
     * counted; when they are over, the voices are looked at again.
     */
    private const val OWN_ALERT_MS = 3000L
    @Volatile private var ownAlertUntil = 0L
    private var lastVoices = 0
    private val judge = Handler(Looper.getMainLooper())

    /** A call of ours is about to sound: see ownAlertUntil. */
    fun ownAlertNow() {
        ownAlertUntil = SystemClock.uptimeMillis() + OWN_ALERT_MS
        judge.removeCallbacksAndMessages(null)
        judge.postDelayed({
            voiceBeside = lastVoices >= 2
            judgeOthers()
        }, OWN_ALERT_MS + 50)
    }

    private fun judgeOthers() {
        val now = micTaken || voiceBeside
        if (now == otherCall) return
        otherCall = now
        otherCallSeenAt = SystemClock.uptimeMillis()
        say(if (now) "other-call:${if (micTaken) "mic" else "voice"}" else "other-call:over")
    }

    fun watchOthers(ctx: Context) {
        if (recCb != null) return
        appCtx = ctx.applicationContext
        val am = ctx.getSystemService(AudioManager::class.java) ?: return
        val main = Handler(Looper.getMainLooper())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            recCb = object : AudioManager.AudioRecordingCallback() {
                override fun onRecordingConfigChanged(configs: MutableList<android.media.AudioRecordingConfiguration>?) {
                    micTaken = configs?.any { it.isClientSilenced } == true
                    judgeOthers()
                }
            }.also { am.registerAudioRecordingCallback(it, main) }
        }
        playCb = object : AudioManager.AudioPlaybackCallback() {
            override fun onPlaybackConfigChanged(configs: MutableList<android.media.AudioPlaybackConfiguration>?) {
                // Ours is one voice stream, WebRTC's; a second one is
                // somebody else's call.
                val voices = configs?.count {
                    it.audioAttributes.usage == AudioAttributes.USAGE_VOICE_COMMUNICATION
                } ?: 0
                lastVoices = voices
                // Our own call sounding a moment ago is not another call.
                if (voices >= 2 && SystemClock.uptimeMillis() < ownAlertUntil) return
                voiceBeside = voices >= 2
                judgeOthers()
            }
        }.also { am.registerAudioPlaybackCallback(it, main) }
    }

    fun unwatchOthers() {
        val am = appCtx?.getSystemService(AudioManager::class.java)
        try {
            recCb?.let { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) am?.unregisterAudioRecordingCallback(it) }
            playCb?.let { am?.unregisterAudioPlaybackCallback(it) }
        } catch (_: Exception) { /* noop */ }
        recCb = null
        playCb = null
        micTaken = false
        voiceBeside = false
        otherCall = false
    }

    /**
     * The output, asked of Android for our call.
     *
     * With a call of its own the output is Android's to move too: it put
     * the call on a Bluetooth earpiece the moment one connected, against
     * a choice of "only when asked", and what the app set by the other
     * road was overwritten. So while the call is on, the output goes
     * through it. Gives back false with no call - then the old road.
     */
    fun setRoute(route: String): Boolean {
        val c = connection ?: return false
        if (c.state != Connection.STATE_ACTIVE) return false
        val r = when (route) {
            "EARPIECE" -> CallAudioState.ROUTE_EARPIECE
            "BLUETOOTH" -> CallAudioState.ROUTE_BLUETOOTH
            "WIRED_HEADSET" -> CallAudioState.ROUTE_WIRED_HEADSET
            "SPEAKER_PHONE" -> CallAudioState.ROUTE_SPEAKER
            else -> return false
        }
        return try {
            @Suppress("DEPRECATION")
            c.setAudioRoute(r)
            true
        } catch (_: Exception) { false }
    }

    fun routeName(r: Int): String = when (r) {
        CallAudioState.ROUTE_EARPIECE -> "EARPIECE"
        CallAudioState.ROUTE_BLUETOOTH -> "BLUETOOTH"
        CallAudioState.ROUTE_WIRED_HEADSET -> "WIRED_HEADSET"
        CallAudioState.ROUTE_SPEAKER -> "SPEAKER_PHONE"
        else -> "OTHER"
    }

    /**
     * Where the conversation's sound really is, as Android's audio has
     * it - not as the telephony last said.
     *
     * Entering, the speaker asked for reached Telecom a moment before it
     * made the call active: it said speaker, then the earpiece of its
     * own, and then put the speaker on without saying so (20 October,
     * and 14). The button stayed on the earpiece, and the speaker asked
     * again was written down as refused. Null when it cannot be told.
     */
    fun whereNow(): String? {
        val am = appCtx?.getSystemService(AudioManager::class.java) ?: return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return when (am.communicationDevice?.type) {
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "SPEAKER_PHONE"
                AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "EARPIECE"
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLE_HEADSET -> "BLUETOOTH"
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_USB_HEADSET -> "WIRED_HEADSET"
                else -> null
            }
        }
        @Suppress("DEPRECATION")
        return when {
            am.isBluetoothScoOn -> "BLUETOOTH"
            am.isSpeakerphoneOn -> "SPEAKER_PHONE"
            am.isWiredHeadsetOn -> "WIRED_HEADSET"
            else -> "EARPIECE"
        }
    }

    /** Closes the call, if there is one. */
    fun end() {
        stopWaiting()
        unwatchOthers()
        unwatchRinging()
        unwatchOutput()
        // An output left at the bottom for the beeps is still owed its
        // volume, the next time it is in use; the channel's own ends here.
        clock.post { kept.keys.retainAll(hushed) }
        val c = connection ?: return
        connection = null
        try {
            c.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            c.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "call: not closed cleanly: ${e.message}")
        }
        say("ended")
    }

    const val EXTRA_NAME = "com.duetto.platform.CALL_NAME"
}

/** The one call there can be: the channel. */
@RequiresApi(Build.VERSION_CODES.O)
class DuettoConnection : Connection() {

    /**
     * The net for a telephone call: the phone seen "in a call" while ours
     * is held, and then out of it, says the call ended. Android enters
     * that mode a moment AFTER the hold - read at the hold itself, it was
     * still ours, and the net was never cast - so it is watched all the
     * hold long, and only a mode seen and then left counts. A WhatsApp
     * call never enters it, and the net stays quiet there.
     *
     * And a second net, for another app's call through telecom - Meet's:
     * see otherAppGone.
     */
    private val clock = Handler(Looper.getMainLooper())
    private var clearReadings = 0
    private var sawInCall = false
    private var heldAt = 0L
    private val watch = object : Runnable {
        override fun run() {
            if (state != STATE_HOLDING) return
            val mode = Calls.appCtx?.getSystemService(AudioManager::class.java)?.mode
                ?: AudioManager.MODE_IN_CALL
            if (mode == AudioManager.MODE_IN_CALL) sawInCall = true
            clearReadings = if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_RINGTONE) 0
            else clearReadings + 1
            if (sawInCall && clearReadings >= 2) {
                Calls.resume()
                return
            }
            if (!sawInCall && otherAppGone()) {
                Calls.appCtx?.let { Journal.sample(it, "call:other-app-gone") }
                Calls.resume()
                return
            }
            clock.postDelayed(this, 1000)
        }
    }

    /**
     * Another app's call through telecom, ended: Meet's, Signal's.
     *
     * Telecom gives back nothing when it ends - not the focus, not the
     * audio, which it keeps for the call left, ours on hold - and the
     * mode is ours all along, "communication": the net above never moves
     * (6/11). What says it is the other app itself, its voice and its
     * microphone gone (Calls.watchOthers): seen during this hold, and
     * gone for OTHER_GONE_MS in a row. While Meet opens its call they
     * come and go within a second, and taking ours back then would put
     * Meet on hold - which Meet takes as the end of its call.
     */
    private fun otherAppGone(): Boolean {
        if (Calls.otherCallNow) return false
        // Seen during this hold: it went after the hold began.
        if (Calls.otherCallSeenAt < heldAt) return false
        return SystemClock.uptimeMillis() - Calls.otherCallSeenAt >= OTHER_GONE_MS
    }

    private companion object {
        /** See otherAppGone. */
        const val OTHER_GONE_MS = 5000L
        /** See backFromHold: the wait the app had, and the check after it. */
        const val SPEAKER_BACK_MS = 300L
        const val SPEAKER_CONFIRM_MS = 1500L
    }

    /**
     * Moved to the ear by the hold (onHold): on resuming, back to the
     * speaker - here, and not only in JavaScript.
     *
     * The app put it back 300 ms after our call came back, with a timer
     * of JavaScript's, and those stand still while the app is behind - as
     * it is after a telephone call - unless the task with no interface
     * runs (PresenceService), which a Duetto opened by hand does not
     * have. On the POCO, from 7 October to 6 November: without that task
     * the channel stayed at the ear until Duetto was opened 18 times of
     * 31, once for 82 minutes; with it, the speaker came back 46 times
     * of 47.
     */
    private var earByHold = false

    /** Our call active again: the speaker back, if the hold took it to the ear. From any thread. */
    fun backFromHold() {
        clock.postDelayed({
            // Held again meanwhile: it waits for the next resuming.
            if (state != STATE_ACTIVE || !earByHold) return@postDelayed
            earByHold = false
            speakerBack(again = true)
        }, SPEAKER_BACK_MS)
    }

    /**
     * The speaker asked for, if the sound is still at the ear: a headset
     * that took it meanwhile keeps it. Looked at once more a moment
     * later, if it was asked for or Android could not say yet where the
     * sound was: Telecom, giving its focus to a call, can put back its
     * own default, the earpiece, over a speaker just asked for - on
     * 6 November, 7 ms after the speaker was pressed on a telephone call
     * just answered.
     */
    private fun speakerBack(again: Boolean) {
        if (state != STATE_ACTIVE) return
        when (Calls.whereNow()) {
            "EARPIECE" -> try {
                @Suppress("DEPRECATION")
                setAudioRoute(CallAudioState.ROUTE_SPEAKER)
                Calls.say("route:speaker-after-hold")
            } catch (_: Exception) { return }
            null -> { /* not told yet: looked at again */ }
            else -> return
        }
        if (again) clock.postDelayed({ speakerBack(again = false) }, SPEAKER_CONFIRM_MS)
    }

    override fun onHold() {
        // A real call was answered: ours waits, and says so.
        Calls.stopRingingNow()
        // The channel's volume, while the output is still ours: see Calls.kept.
        Calls.keepForHold()
        /**
         * To the ear, if we were on speaker.
         *
         * The output is telecom's for every call at once, and the call
         * just answered took ours: on speaker in the channel, a phone
         * call opened on speaker too. Headsets are left alone - there
         * the call belongs in them. Our output is put back on resuming
         * (backFromHold).
         */
        if (lastRoute == CallAudioState.ROUTE_SPEAKER) {
            try {
                @Suppress("DEPRECATION")
                setAudioRoute(CallAudioState.ROUTE_EARPIECE)
                Calls.say("route:call-to-ear")
                earByHold = true
            } catch (_: Exception) { /* the call keeps the speaker */ }
        }
        setOnHold()
        Calls.say("held")
        clock.removeCallbacks(watch)
        clearReadings = 0
        sawInCall = false
        heldAt = SystemClock.uptimeMillis()
        clock.postDelayed(watch, 1000)
    }

    /** Where Android put the call's sound: told, so that the app can agree or not. */
    private var lastRoute = -1

    @Deprecated("Deprecated in Java")
    override fun onCallAudioStateChanged(state: CallAudioState?) {
        val r = state?.route ?: return
        if (r == lastRoute) return
        lastRoute = r
        Calls.say("route:${Calls.routeName(r)}")
        Calls.outputMoved()
    }

    override fun onUnhold() {
        clock.removeCallbacks(watch)
        setActive()
        Calls.say("resumed")
        backFromHold()
        Calls.outputMoved()
    }

    /** Closed by the system, not by us: the channel is told. */
    override fun onDisconnect() {
        if (Calls.connection === this) Calls.connection = null
        setDisconnected(DisconnectCause(DisconnectCause.REMOTE))
        destroy()
        Calls.say("ended-by-system")
    }

    override fun onAbort() = onDisconnect()
}

/** Where Telecom asks for the call to be made. */
@RequiresApi(Build.VERSION_CODES.O)
class DuettoConnectionService : ConnectionService() {

    override fun onCreateOutgoingConnection(
        account: PhoneAccountHandle?, request: ConnectionRequest?,
    ): Connection {
        val c = DuettoConnection()
        c.connectionProperties = Connection.PROPERTY_SELF_MANAGED
        c.connectionCapabilities = Connection.CAPABILITY_HOLD or Connection.CAPABILITY_SUPPORT_HOLD
        c.audioModeIsVoip = true
        request?.address?.let { c.setAddress(it, TelecomManager.PRESENTATION_ALLOWED) }
        request?.extras?.getString(Calls.EXTRA_NAME)?.let {
            c.setCallerDisplayName(it, TelecomManager.PRESENTATION_ALLOWED)
        }
        c.setActive()
        Calls.connection = c
        Calls.say("active")
        Calls.watchRinging(this)
        Calls.watchOutput(this)
        return c
    }

    /**
     * The call focus is ours again: the other call - a telephone's, a
     * WhatsApp's - ended, and Telecom gives the focus back to the one
     * left, which is ours. The signal meant for exactly this.
     */
    override fun onConnectionServiceFocusGained() {
        super.onConnectionServiceFocusGained()
        Calls.resume()
    }

    override fun onCreateOutgoingConnectionFailed(
        account: PhoneAccountHandle?, request: ConnectionRequest?,
    ) {
        Calls.say("failed")
    }
}
