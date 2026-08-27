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

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The bridge to the consumption journal.
 *
 * The lines are written by the service, which is alive even when JS is
 * not; from here we only say which state we are in, read what there is to
 * send to the other phone, and put aside what the other one sends us.
 */
class JournalModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoJournal"

    /** "waiting", "channel", "channel+video": it ends up on every line. */
    @ReactMethod
    fun state(state: String, promise: Promise) {
        Journal.state(state)
        promise.resolve(true)
    }

    /** A line right now, to mark a moment that counts. */
    @ReactMethod
    fun mark(why: String, promise: Promise) {
        Journal.sample(ctx, why)
        promise.resolve(true)
    }

    /** How many lines the journal has: only the new ones get sent. */
    @ReactMethod
    fun lines(promise: Promise) {
        promise.resolve(Journal.myLines(ctx))
    }

    /** The lines from `fromLine` onwards, as a single text. */
    @ReactMethod
    fun read(fromLine: Int, promise: Promise) {
        promise.resolve(Journal.readMine(ctx, fromLine))
    }

    /**
     * Appends the journal that arrived from the other phone.
     *
     * `who` says which connection it comes from: each one has its own
     * file, otherwise the consumption of different phones would end up
     * mixed into lines that do not say whose they are.
     */
    @ReactMethod
    fun appendOther(text: String, who: String, promise: Promise) {
        Journal.appendOther(ctx, text, who)
        promise.resolve(true)
    }

    /**
     * How the app died last time, if the phone remembers.
     *
     * Comes back `null` before Android 11, where this memory does not
     * exist, and on a phone that has never died.
     */
    @ReactMethod
    fun lastDeath(promise: Promise) {
        val u = Journal.lastDeath(ctx)
        if (u == null) {
            promise.resolve(null)
            return
        }
        val m = Arguments.createMap()
        m.putDouble("when", u.timestamp.toDouble())
        m.putString("cause", Journal.cause(u.reason))
        m.putString("was", Journal.importance(u.importance))
        m.putString("description", u.description ?: "")
        promise.resolve(m)
    }

    /** Where the files are, to tell whoever goes and reads them. */
    @ReactMethod
    fun path(promise: Promise) {
        promise.resolve(Journal.myFile(ctx)?.parentFile?.absolutePath ?: "")
    }
}
