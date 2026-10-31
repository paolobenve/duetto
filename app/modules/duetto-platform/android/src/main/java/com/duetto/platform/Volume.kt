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
}
