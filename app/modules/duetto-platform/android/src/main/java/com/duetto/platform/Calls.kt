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
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
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
     * In a call or ringing. A call in progress by the audio mode alone:
     * the call state stayed "off hook" for minutes after a call ended on
     * a dual-SIM phone, and the channel waited silent all that while.
     * The call state, when allowed, only for the ringing.
     */
    private fun phoneBusy(ctx: Context): Boolean {
        val mode = ctx.getSystemService(AudioManager::class.java)?.mode
        if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_RINGTONE) return true
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
     * the audio is given back to us.
     */
    fun resume() {
        val c = connection ?: return
        if (c.state != Connection.STATE_HOLDING) return
        c.setActive()
        say("resumed")
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

    private fun onCallState(state: Int) {
        val ctx = appCtx ?: return
        if (state == TelephonyManager.CALL_STATE_RINGING && connection?.state == Connection.STATE_ACTIVE) {
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
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, number: String?) = onCallState(state)
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

    private fun judgeOthers() {
        val now = micTaken || voiceBeside
        if (now == otherCall) return
        otherCall = now
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

    /** Closes the call, if there is one. */
    fun end() {
        stopWaiting()
        unwatchOthers()
        unwatchRinging()
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
     */
    private val clock = Handler(Looper.getMainLooper())
    private var clearReadings = 0
    private var sawInCall = false
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
            clock.postDelayed(this, 1000)
        }
    }

    override fun onHold() {
        // A real call was answered: ours waits, and says so.
        Calls.stopRingingNow()
        setOnHold()
        Calls.say("held")
        clock.removeCallbacks(watch)
        clearReadings = 0
        sawInCall = false
        clock.postDelayed(watch, 1000)
    }

    override fun onUnhold() {
        clock.removeCallbacks(watch)
        setActive()
        Calls.say("resumed")
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
