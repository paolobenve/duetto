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

import android.content.Context
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent

/**
 * In the channel, the volume keys command the other person's voice.
 *
 * WHAT HAPPENED BEFORE
 * The first attempt was to point the keys at the conversation volume (see
 * AudioModule): it works on a good many phones, not on all. The second
 * was to hand them to the system and take charge only when the system did
 * NOT move, because it was at its limit.
 *
 * A Motorola Edge 50 Fusion's journal showed that this is not enough:
 * there `voiceKeys=yes`, `audio=communication`, and the call volume index
 * goes from 4/8 down to 2/8 when the key is pressed - the system moves
 * all right - and to the ear nothing changes. The phone records the
 * number and ignores it. A rule that trusts that number cannot notice:
 * from the outside, a volume that goes down with no effect and one that
 * really goes down look identical.
 *
 * WHAT IT DOES NOW
 * In the channel the keys are taken by the app, always, and they change
 * the gain WebRTC applies to the other voice before playing it: that does
 * not go through the phone and cannot be ignored by anybody. In place of
 * the system's little bar, the app's own indicator appears, saying where
 * things stand.
 *
 * The system volume stays where it is and is adjusted outside the
 * channel, like any other volume on the phone.
 *
 * It lives in an `object` and not in the module because the one who
 * receives the keys is the activity, which knows nothing of React
 * modules.
 */
object Volume {

    /** True while in the channel: outside, the keys belong to the system. */
    @Volatile
    var active = false

    /** Who carries the news to JavaScript; the module puts it here. */
    @Volatile
    var tell: ((Int) -> Unit)? = null

    /**
     * The last journal line written for a volume key.
     *
     * Holding the key down, the presses arrive in a volley, and one line
     * for each would fill the journal with noise. One every two seconds
     * is enough to reconstruct what happened.
     */
    private var lastNote = 0L

    /**
     * @return true if we handled the key ourselves and it must go no further
     */
    fun intercept(ctx: Context, keyCode: Int): Boolean {
        if (!active) return false
        val up = when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> true
            KeyEvent.KEYCODE_VOLUME_DOWN -> false
            else -> return false
        }
        // If JavaScript is not there - app just started, or the engine
        // stopped - the key goes back to the system: better the volume of
        // a moment ago than a key that does nothing.
        val receiver = tell ?: return false
        receiver.invoke(if (up) 1 else -1)

        // A journal line now and then: it is the only way to see, from a
        // phone far away, whether the keys arrive and what state the audio
        // was in when they did.
        val now = System.currentTimeMillis()
        if (now - lastNote > 2000) {
            lastNote = now
            try {
                Journal.sample(ctx.applicationContext, if (up) "volume-up" else "volume-down")
            } catch (_: Exception) { /* the journal is not worth a key */ }
        }
        return true
    }

    /** The released key goes with the pressed one, or it sounds twice. */
    fun consumeRelease(keyCode: Int): Boolean =
        active && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)

    // --- With the app out of sight ------------------------------------------

    /*
     * The keys above reach the activity only while it is on the screen.
     * With another app in front, or the phone locked, Android keeps them
     * and moves the call volume - which on a Motorola Edge changes
     * nothing at the ear (see the top of this file).
     *
     * A media session that says its volume is "remote" - the way a
     * Chromecast's is - is offered the keys instead: the system's bar
     * comes up, but over Duetto's level, and every step is passed on to
     * JavaScript like a key pressed in the app. In the app nothing
     * changes: there the activity takes the keys before the session.
     *
     * Not certain everywhere: while a call is on, a phone may keep the
     * keys for the call volume all the same. The journal says which:
     * "volume-outside:up/down" when the session got them.
     *
     * The level is said in rungs of the app's ladder, from its bottom:
     * the system's bar wants whole numbers and a top.
     */

    /** Who carries a level picked on the system's bar; the module puts it here. */
    @Volatile
    var tellTo: ((Int) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private var session: MediaSession? = null
    private var provider: VolumeProvider? = null
    private var rung = 0
    private var rungs = 0
    private var lastOutsideNote = 0L

    /** Where the level stands, and how many rungs the ladder has. */
    fun showLevel(ctx: Context, at: Int, of: Int) {
        val app = ctx.applicationContext
        main.post {
            rungs = of.coerceAtLeast(0)
            rung = at.coerceIn(0, rungs)
            settle(app)
        }
    }

    /** In the channel on, outside off: called with `active`. */
    fun outside(ctx: Context) {
        val app = ctx.applicationContext
        main.post { settle(app) }
    }

    private fun settle(ctx: Context) {
        if (!active || rungs <= 0) {
            session?.let {
                try { it.isActive = false; it.release() } catch (_: Exception) { /* noop */ }
            }
            session = null
            provider = null
            return
        }
        try {
            val s = session ?: MediaSession(ctx, "duetto-voice").also { made ->
                // Without a callback the session drops the volume steps
                // it is sent: they travel through the callback's handler.
                made.setCallback(object : MediaSession.Callback() {}, main)
                made.setPlaybackState(
                    PlaybackState.Builder()
                        .setState(PlaybackState.STATE_PLAYING, 0, 1f)
                        .build(),
                )
                session = made
            }
            val p = provider
            if (p == null || p.maxVolume != rungs) {
                // The top of a VolumeProvider is fixed: a new ladder
                // (another output, another floor) wants a new one.
                val made = object : VolumeProvider(VolumeProvider.VOLUME_CONTROL_ABSOLUTE, rungs, rung) {
                    override fun onAdjustVolume(direction: Int) {
                        if (direction == 0) return
                        val up = direction > 0
                        currentVolume = (currentVolume + if (up) 1 else -1).coerceIn(0, maxVolume)
                        tell?.invoke(if (up) 1 else -1)
                        noteOutside(ctx, if (up) "up" else "down")
                    }

                    override fun onSetVolumeTo(volume: Int) {
                        val v = volume.coerceIn(0, maxVolume)
                        currentVolume = v
                        tellTo?.invoke(v)
                        noteOutside(ctx, "to")
                    }
                }
                provider = made
                s.setPlaybackToRemote(made)
            } else if (p.currentVolume != rung) {
                p.currentVolume = rung
            }
            if (!s.isActive) {
                s.isActive = true
                Journal.sample(ctx, "volume-outside:on")
            }
        } catch (_: Exception) {
            // No session, the keys stay the system's: as before.
        }
    }

    private fun noteOutside(ctx: Context, what: String) {
        val now = System.currentTimeMillis()
        if (now - lastOutsideNote < 2000) return
        lastOutsideNote = now
        try {
            Journal.sample(ctx, "volume-outside:$what")
        } catch (_: Exception) { /* noop */ }
    }
}
