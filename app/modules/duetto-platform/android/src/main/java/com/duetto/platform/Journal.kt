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

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.display.DisplayManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.util.Log
import android.view.Display
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The consumption journal: a line now and then, to understand later.
 *
 * WHY IT DOES NOT MEASURE THE OTHER APPS
 * An app cannot know how much battery the others use: Android keeps that
 * account and shows it only in its own "Battery" screen, or through
 * `adb shell dumpsys batterystats`. What gets recorded here is what can
 * really be known:
 *
 *  - how far the phone's battery goes down (everybody's, not just ours);
 *  - which state Duetto was in at that moment;
 *  - how much Duetto used of its own: CPU time and bytes exchanged.
 *
 * Lined up, those three answer the question that matters: whether the
 * phone drains faster while Duetto is in the channel, and by how much.
 * The screen being on is noted because it uses more than all the rest:
 * without that column the numbers would tell a lie.
 *
 * The file sits in a folder that can be read over adb without any
 * special permission:
 *   /sdcard/Android/data/com.duetto/files/journal/mine.log
 */
object Journal {

    private const val TAG = "Duetto"
    const val FOLDER = "journal"
    const val MINE = "mine.log"
    const val OTHER = "other.log"

    /** The last death already written down: the others are old news. */
    const val LAST_DEATH = "last_recorded_death"

    /** Past this size the file is rotated: one step back and no more. */
    private const val MAX_SIZE = 512L * 1024L

    private val format = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    /**
     * Whether the five-minute sampling is wanted.
     *
     * It is the periodic line - battery counters, CPU, bytes - and it
     * belongs to diagnostics: it is written to be read afterwards, by
     * somebody looking for a reason. With diagnostics off it does not
     * get written, and the journal keeps only the lines that tell a
     * story: a death, a coming or going, a change of network. Those cost
     * nothing and are what a report is worth reading with.
     *
     * JS says so as soon as it has read the settings; before that we do
     * not sample, which is the quiet choice.
     */
    @Volatile
    var sampling = false

    /** The state JS tells us about: waiting, channel, video. */
    @Volatile private var state: String = "start"

    /**
     * Whether the volume keys have been pointed at the voice stream.
     *
     * On some phones those keys have no effect on the other voice, and
     * that was found out once, looking at the phone in hand. With the
     * phone far away there is no way to look: either the journal tells
     * the story, or it is the word of whoever uses it against the guess
     * of whoever reads the code.
     */
    @Volatile private var voiceKeys = false

    fun voiceKeys(active: Boolean) {
        voiceKeys = active
    }

    /**
     * How much of the last interval went by with the screen on.
     *
     * It is the most important thing to know in order to read the rest:
     * the screen uses more than anything else, and five minutes with the
     * screen on cost by themselves far more than Duetto can cost in an
     * hour. Without this number one would end up charging the app with
     * what was used by whoever was looking at the phone.
     *
     * Looking at the screen at the instant of the sample is not enough:
     * in five minutes it may have gone on and off. Here it adds up.
     */
    private var msScreenOn = 0L
    private var screenOnSince = 0L

    /** The counters of the last line, to write the differences. */
    private var lastCpuMs = 0L
    private var lastRx = 0L
    private var lastTx = 0L
    private var lastCharge = 0
    private var lastMoment = 0L

    fun state(newState: String) {
        state = newState
    }

    /**
     * Who keeps the time between one line and the next.
     *
     * The lines do not come only from the periodic wait: a change of
     * state or the charger being plugged in makes one get written at
     * once. If the wait went on by itself, the next line could fall a
     * few seconds later, and a window of a few seconds on the battery
     * counter measures nothing: it only says noise.
     *
     * So every line written - wherever it comes from - starts the wait
     * over again. The one who keeps it is the service, the only one
     * living long enough to be able to.
     */
    @Volatile private var reschedule: (() -> Unit)? = null

    fun onWrite(f: (() -> Unit)?) {
        reschedule = f
    }

    /** To be called when the screen goes on or off. */
    @Synchronized
    fun screenChanged(on: Boolean) {
        val now = System.currentTimeMillis()
        if (on) {
            if (screenOnSince == 0L) screenOnSince = now
        } else if (screenOnSince != 0L) {
            msScreenOn += now - screenOnSince
            screenOnSince = 0L
        }
    }

    private fun folder(ctx: Context): File? {
        // Before touching any file: the names have changed, and the first
        // line written would create the new folder under the bridge's
        // nose. It costs one boolean after the first time.
        Bridge.migrate(ctx)
        val base = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        val dir = File(base, FOLDER)
        return if (dir.exists() || dir.mkdirs()) dir else null
    }

    fun myFile(ctx: Context): File? = folder(ctx)?.let { File(it, MINE) }

    /**
     * The journal that arrives from the other side, one per connection.
     *
     * With more than one connection set up, putting everything in a
     * single file would mean mixing the consumption of different phones
     * into one column of lines that all look alike: unreadable, and with
     * no way of telling them apart afterwards, because the lines do not
     * say whose they are.
     *
     * The name carries the connection's label and a piece of its
     * fingerprint: readable by whoever downloads the files, and different
     * for every pair even when the labels look alike.
     */
    fun otherFile(ctx: Context, who: String = ""): File? {
        val folder = folder(ctx) ?: return null
        val clean = who.lowercase()
            .map { if (it.isLetterOrDigit() || it == '-') it else '-' }
            .joinToString("")
            .trim('-')
            .take(40)
        return File(folder, if (clean.isEmpty()) OTHER else "other-$clean.log")
    }

    /** Percentage, charge left in microamp-hours, current right now. */
    private fun battery(ctx: Context): Triple<Int, Int, Int> {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val percent = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val charge = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER) ?: -1
        // The sign is not the same across makers: we look at the absolute
        // value and say separately whether it is charging.
        val current = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: 0
        return Triple(percent, charge, current)
    }

    private fun charging(ctx: Context): Boolean {
        val status = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun network(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "?"
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "none"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            else -> "other"
        }
    }

    /**
     * The screen is really ON.
     *
     * PowerManager.isInteractive is not asked, because here it lied: the
     * documentation itself warns that the name talks about the screen
     * "for historical reasons" but describes the phone's interactive
     * state. During a conversation the proximity sensor turns the display
     * off while leaving the phone interactive, and so the other side's
     * journal told a whole night of "screen on" while drawing 18 mA - a
     * tenth of what a real display drinks. And on the wrong line one then
     * builds the wrong guesses: "somebody touched the screen".
     *
     * The display is asked of the DisplayManager, which tells on, off and
     * dozing (the always-on clock) apart. If it does not answer we fall
     * back on the old indicator, which is better than nothing.
     */
    private fun screenOn(ctx: Context): Boolean {
        try {
            val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val display = dm?.getDisplay(Display.DEFAULT_DISPLAY)
            if (display != null) return display.state == Display.STATE_ON
        } catch (_: Exception) { /* fall back */ }
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isInteractive
    }

    /**
     * The phone was dozing, or in battery saver.
     *
     * These are the two states in which Android cuts everybody's
     * background work: an interval spent dozing is not comparable with
     * one spent awake, and without knowing it one would end up charging
     * the app with a difference that belongs to the system.
     */
    private fun dozing(ctx: Context): String {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "?"
        val idle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pm.isDeviceIdleMode else false
        val saver = pm.isPowerSaveMode
        return when {
            idle && saver -> "doze+saver"
            idle -> "doze"
            saver -> "saver"
            else -> "no"
        }
    }

    /**
     * Closes the screen's account and gives it back in seconds.
     *
     * It has to be called while the line is being written: what has piled
     * up belongs to the interval ending now, and the next one starts from
     * zero.
     */
    private fun screenSeconds(ctx: Context): Long {
        val now = System.currentTimeMillis()
        // If the screen is on now, the piece under way counts for this
        // interval and the next one starts from this moment.
        if (screenOn(ctx)) {
            if (screenOnSince == 0L) screenOnSince = now
            msScreenOn += now - screenOnSince
            screenOnSince = now
        }
        val seconds = msScreenOn / 1000
        msScreenOn = 0
        return seconds
    }

    /**
     * Writes one line.
     *
     * Our own counters (CPU, bytes) are totals since the process started:
     * what matters is how much they have grown since the last line, so
     * the differences get written. On the first line, or after the
     * process restarts, there is no difference to show and a dash is put
     * down instead of an invented number.
     */
    @Synchronized
    fun sample(ctx: Context, why: String = "periodic") {
        try {
            val file = myFile(ctx) ?: return
            rotateIfBig(file)

            val now = System.currentTimeMillis()
            val (percent, charge, current) = battery(ctx)
            val cpuMs = Process.getElapsedCpuTime()
            val uid = Process.myUid()
            val rx = TrafficStats.getUidRxBytes(uid).coerceAtLeast(0)
            val tx = TrafficStats.getUidTxBytes(uid).coerceAtLeast(0)

            val minutes = if (lastMoment == 0L) -1.0
                else (now - lastMoment) / 60000.0
            val dCharge = if (lastCharge == 0 || charge <= 0) Int.MIN_VALUE
                else charge - lastCharge
            val dCpu = if (lastCpuMs == 0L || cpuMs < lastCpuMs) -1L else cpuMs - lastCpuMs
            val dRx = if (lastRx == 0L || rx < lastRx) -1L else rx - lastRx
            val dTx = if (lastTx == 0L || tx < lastTx) -1L else tx - lastTx

            val line = buildString {
                append(format.format(Date(now)))
                append(" why=").append(why)
                // Which phone this is, on the start line.
                //
                // Every session writes one, so the model is always there,
                // but not on every line: reading somebody else's journal
                // the first question is "which phone is it", because half
                // of the audio behaviour depends on that - and repeating
                // it on every line would be the same word a hundred
                // times.
                if (why == "start") {
                    append(" phone=\"").append(phoneName()).append('"')
                    append(" android=").append(Build.VERSION.RELEASE)
                    // Whether the phone has promised not to get in the way.
                    //
                    // It is the only one of the restrictions that can be
                    // read from code: the makers' extra ones - auto-start,
                    // "background activity" - no app can question. But
                    // this is the first to look at when an app keeps dying
                    // on the same phone, and it is absurd to have to ask
                    // for it out loud from whoever holds that phone.
                    append(" battery=").append(
                        if (StartupHelper.isIgnoringBatteryOptimizations(ctx)) "unrestricted"
                        else "optimised",
                    )
                }
                append(" state=").append(state)
                append(" batt=").append(percent).append('%')
                append(" charge=").append(charge).append("uAh")
                if (dCharge != Int.MIN_VALUE) append(" dcharge=").append(dCharge).append("uAh")
                append(" current=").append(current / 1000).append("mA")
                append(" charging=").append(if (charging(ctx)) "yes" else "no")
                append(" screen=").append(if (screenOn(ctx)) "on" else "off")
                // How much of the interval just closed was spent with the
                // screen on: it is the key to telling whether what was
                // used is ours or belongs to whoever was using the phone.
                append(" screenOn=").append(screenSeconds(ctx)).append('s')
                append(" system=").append(dozing(ctx))
                // The sound: which mode it goes through, where the voice
                // volume stands, and whether the keys command it. The
                // three things needed to make sense of an "I cannot hear
                // you" told over the phone.
                append(" audio=").append(audioMode(ctx))
                append(" volVoice=").append(voiceVolume(ctx))
                append(" volMedia=").append(mediaVolume(ctx))
                append(" speaker=").append(if (speakerphone(ctx)) "yes" else "no")
                append(" voiceKeys=").append(if (voiceKeys) "yes" else "no")
                append(" net=").append(network(ctx))
                if (minutes >= 0) append(" min=").append(String.format(Locale.US, "%.1f", minutes))
                if (dCpu >= 0) append(" cpu=+").append(dCpu / 1000).append('s')
                if (dRx >= 0) append(" rx=+").append(dRx / 1024).append("kB")
                if (dTx >= 0) append(" tx=+").append(dTx / 1024).append("kB")
                append('\n')
            }
            file.appendText(line)

            lastMoment = now
            lastCharge = charge
            lastCpuMs = cpuMs
            lastRx = rx
            lastTx = tx

            // The next periodic line starts from now, not from when it
            // had been scheduled.
            reschedule?.invoke()
        } catch (e: Exception) {
            Log.w(TAG, "journal: could not write: ${e.message}")
        }
    }

    /**
     * Why the process died, last time.
     *
     * It is the question no log could answer: the app "is gone" and
     * nobody knows whether the owner of the phone closed it, whether
     * memory ran out, whether it crashed or whether it was the maker's
     * battery manager. Android has the answer - `getHistoricalProcess
     * ExitReasons`, from Android 11 - and tells nobody until it is
     * asked.
     *
     * It is asked at start-up, when the deaths to tell about are the ones
     * from before, and it ends up in the journal: which means it ends up
     * on the OTHER phone too, since the journals get exchanged. An app
     * that disappears from somebody else's phone, with no cable and with
     * nothing one can ask them, otherwise stays a mystery.
     *
     * `description` is the most precious field: that is where makers
     * write things like "stop com.duetto due to ...", and it is the only
     * way to tell a death by memory apart from a decision of the battery
     * manager, which to Android looks like "other".
     */
    fun recordExits(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        try {
            val am = ctx.getSystemService(ActivityManager::class.java) ?: return
            val exits = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 10)
            if (exits.isEmpty()) return

            val prefs = ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
            val already = prefs.getLong(LAST_DEATH, 0L)
            // From the oldest to the most recent, so that in the journal
            // they stay in order of time like everything else.
            val fresh = exits.filter { it.timestamp > already }.sortedBy { it.timestamp }
            if (fresh.isEmpty()) return

            val file = myFile(ctx) ?: return
            rotateIfBig(file)
            for (u in fresh) {
                val line = buildString {
                    append(format.format(Date(u.timestamp)))
                    append(" why=death")
                    append(" cause=").append(cause(u.reason))
                    append(" was=").append(importance(u.importance))
                    if (u.status != 0) append(" status=").append(u.status)
                    if (u.pss > 0) append(" pss=").append(u.pss).append("kB")
                    if (u.rss > 0) append(" rss=").append(u.rss).append("kB")
                    u.description?.let { append(" description=\"").append(it).append('"') }
                    append('\n')
                }
                file.appendText(line)
            }
            prefs.edit().putLong(LAST_DEATH, fresh.last().timestamp).apply()
        } catch (e: Exception) {
            Log.w(TAG, "journal: could not read the exits: ${e.message}")
        }
    }

    /**
     * The process's last death, to tell the other phone about it.
     *
     * The journal writes it down for whoever will read it one day; this
     * one is needed right away, to tell whoever was waiting on the other
     * side and saw a person disappear without knowing why.
     */
    fun lastDeath(ctx: Context): ApplicationExitInfo? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        return try {
            ctx.getSystemService(ActivityManager::class.java)
                ?.getHistoricalProcessExitReasons(ctx.packageName, 0, 1)
                ?.firstOrNull()
        } catch (e: Exception) {
            Log.w(TAG, "journal: cannot read the last exit: ${e.message}")
            null
        }
    }

    /**
     * Make and model, without saying the make twice.
     *
     * Quite a few makers already put it inside the model - Motorola
     * writes "motorola edge 50 fusion" - and sticking the make in front
     * gave "motorola motorola edge 50 fusion".
     */
    private fun phoneName(): String {
        val make = Build.MANUFACTURER ?: ""
        val model = Build.MODEL ?: ""
        return if (model.startsWith(make, ignoreCase = true)) model
        else "$make $model".trim()
    }

    /** Which mode the phone's audio is in: it is the one making the rules. */
    private fun audioMode(ctx: Context): String {
        val am = ctx.getSystemService(android.media.AudioManager::class.java) ?: return "?"
        return when (am.mode) {
            android.media.AudioManager.MODE_NORMAL -> "normal"
            android.media.AudioManager.MODE_RINGTONE -> "ringtone"
            android.media.AudioManager.MODE_IN_CALL -> "call"
            android.media.AudioManager.MODE_IN_COMMUNICATION -> "communication"
            else -> "other(${am.mode})"
        }
    }

    /**
     * The media volume, next to the voice one.
     *
     * It tells apart the case where the volume keys end up on the wrong
     * stream: if pressing them moves this one and not the other, they are
     * not commanding the voice.
     */
    private fun mediaVolume(ctx: Context): String {
        val am = ctx.getSystemService(android.media.AudioManager::class.java) ?: return "?"
        return try {
            val v = am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
            "$v/$max"
        } catch (e: Exception) {
            "?"
        }
    }

    /** Whether the sound comes out of the speaker: it changes which volume rules. */
    @Suppress("DEPRECATION")
    private fun speakerphone(ctx: Context): Boolean {
        val am = ctx.getSystemService(android.media.AudioManager::class.java) ?: return false
        return try { am.isSpeakerphoneOn } catch (e: Exception) { false }
    }

    /** Where the voice volume stands, against its maximum. */
    private fun voiceVolume(ctx: Context): String {
        val am = ctx.getSystemService(android.media.AudioManager::class.java) ?: return "?"
        return try {
            val v = am.getStreamVolume(android.media.AudioManager.STREAM_VOICE_CALL)
            val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_VOICE_CALL)
            "$v/$max"
        } catch (e: Exception) {
            "?"
        }
    }

    internal fun cause(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_EXIT_SELF -> "self-exit"
        ApplicationExitInfo.REASON_SIGNALED -> "signal"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "out-of-memory"
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native-crash"
        ApplicationExitInfo.REASON_ANR -> "frozen"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "start-failed"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permissions-changed"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "too-many-resources"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "closed-by-user"
        ApplicationExitInfo.REASON_USER_STOPPED -> "force-stopped"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency-died"
        ApplicationExitInfo.REASON_OTHER -> "other"
        else -> "unknown($reason)"
    }

    /**
     * How much the process counted in Android's eyes when it died.
     *
     * It is the field that tells the stories apart: a process killed
     * while holding a foreground service is a phone that wanted to be rid
     * of it anyway; one killed "cached" is an app that was of no use to
     * anybody any more, which means the service was already gone.
     *
     * Mind "foreground-screen-off" (IMPORTANCE_TOP_SLEEPING): that is the
     * app which was in the foreground when the screen went off by itself.
     * It is not foreground - the activity is stopped - but it is not
     * cached either, and it is exactly the state of somebody who was
     * looking at the app a minute ago and has touched nothing. It used to
     * get mixed up with cached, and it would have told the wrong story in
     * precisely the case that matters.
     */
    internal fun importance(v: Int): String = when {
        v <= 100 -> "foreground"              // IMPORTANCE_FOREGROUND
        v <= 125 -> "foreground-service"      // FOREGROUND_SERVICE
        v <= 200 -> "visible"                 // VISIBLE
        v <= 230 -> "perceptible"             // PERCEPTIBLE
        v <= 300 -> "service"                 // SERVICE
        v <= 325 -> "foreground-screen-off"   // TOP_SLEEPING
        v <= 350 -> "cant-save-state"         // CANT_SAVE_STATE
        v <= 400 -> "cached"                  // CACHED
        else -> "gone($v)"                    // GONE
    }

    /**
     * Keeps the file within a reasonable size.
     *
     * One line every five minutes makes about 40 kB a month: the rotation
     * will hardly ever happen, but a file growing without a limit on a
     * phone is the kind of thing one finds out about when it is late.
     */
    private fun rotateIfBig(file: File) {
        if (!file.exists() || file.length() < MAX_SIZE) return
        val old = File(file.parentFile, file.name + ".1")
        if (old.exists()) old.delete()
        file.renameTo(old)
    }

    /** Our own journal, from the line starting at `from` onwards. */
    fun readMine(ctx: Context, fromLine: Int): String {
        val file = myFile(ctx) ?: return ""
        if (!file.exists()) return ""
        val lines = file.readLines()
        if (fromLine >= lines.size) return ""
        return lines.subList(fromLine.coerceAtLeast(0), lines.size).joinToString("\n")
    }

    /** How many lines our journal has: only the new ones get sent. */
    fun myLines(ctx: Context): Int {
        val file = myFile(ctx) ?: return 0
        return if (file.exists()) file.readLines().size else 0
    }

    /** Appends what the other phone has sent. */
    @Synchronized
    fun appendOther(ctx: Context, text: String, who: String = "") {
        try {
            val file = otherFile(ctx, who) ?: return
            rotateIfBig(file)
            file.appendText(if (text.endsWith("\n")) text else text + "\n")
        } catch (e: Exception) {
            Log.w(TAG, "journal: could not write the other side's: ${e.message}")
        }
    }
}
