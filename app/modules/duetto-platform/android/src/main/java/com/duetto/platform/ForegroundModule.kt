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

import android.content.Intent
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Bridge from JS to ChannelForegroundService. */
class ForegroundModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    init { live = this }

    override fun getName() = "DuettoForeground"

    private fun sendToService(
        promise: Promise?,
        configure: Intent.() -> Unit,
    ) {
        try {
            val intent = Intent(ctx, ChannelForegroundService::class.java).apply(configure)
            ContextCompat.startForegroundService(ctx, intent)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("foreground_service_error", e)
        }
    }

    @ReactMethod
    fun start(text: String, withCamera: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
            putExtra(ChannelForegroundService.EXTRA_CAMERA, withCamera)
        }
    }

    /**
     * To be called when the video goes on or off: on Android 14+ using
     * the camera outside the foreground requires the service to declare
     * the "camera" type as well.
     */
    @ReactMethod
    fun setCameraActive(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_CAMERA, active)
        }
    }

    @ReactMethod
    fun setText(
        text: String, name: String, actions: String,
        enterLabel: String, waitLabel: String, alertLabel: String, promise: Promise,
    ) {
        lastText = arrayOf(text, name, actions, enterLabel, waitLabel, alertLabel)
        sendText(promise)
    }

    /**
     * The other connections, one line each under the one in use: where
     * the other side of each stands - in the channel, waiting, Duetto
     * switched off, unreachable - since when. Kept here and put under
     * every text the standing notification is given, so that the two
     * writers of that text - the app and the presence with no interface
     * - need not know of them; a change of theirs writes the last text
     * again. Only while there is a text: after a stop, nothing is written,
     * or the service would be started again by it.
     *
     * One line per connection, three fields tab apart: the pair's id,
     * where the other stands (in, waiting, detached, unreachable), the
     * words. The id and the state give each line its buttons.
     */
    @ReactMethod
    fun setPairLines(lines: String, promise: Promise) {
        if (lines != pairLines) {
            pairLines = lines
            if (lastText != null) sendText(null)
        }
        promise.resolve(true)
    }

    private fun sendText(promise: Promise?) {
        val l = lastText ?: run { promise?.resolve(true); return }
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, l[0])
            putExtra(ChannelForegroundService.EXTRA_PAIR_LINES, pairLines)
            putExtra(ChannelForegroundService.EXTRA_NAME, l[1])
            putExtra(ChannelForegroundService.EXTRA_ACTIONS, l[2])
            putExtra(ChannelForegroundService.EXTRA_ENTER_LABEL, l[3])
            putExtra(ChannelForegroundService.EXTRA_WAIT_LABEL, l[4])
            putExtra(ChannelForegroundService.EXTRA_ALERT_LABEL, l[5])
        }
    }

    /** A button of the notification, said to JavaScript. */
    private fun sayAction(action: String) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("duettoNotificationAction", action)
        } catch (_: Exception) {
        }
    }

    companion object {
        /** the module alive, for the service to reach JavaScript through */
        @Volatile private var live: ForegroundModule? = null
        /** the last text given to the standing notification, and its words: see setPairLines */
        @Volatile private var lastText: Array<String>? = null
        @Volatile private var pairLines = ""
        /** the processor held up while a lost server is dialled again: see holdAwake */
        private val awake = mutableMapOf<String, PowerManager.WakeLock>()
        fun emitAction(action: String) { live?.sayAction(action) }
    }

    /**
     * The processor held up for a moment, under a name: while a connection
     * to the server that went down is dialled again.
     *
     * Alone in the channel or waiting, nothing keeps the processor awake,
     * and the attempts to dial again are timers that stand still while it
     * sleeps: on 15 October the moto lost the server at 09:55 and found it
     * again only at 10:07, at the watchdog alarm's next round. `ms` caps
     * it: the lock lets go by itself, whatever happens to the one who
     * asked; held again, it starts counting again.
     */
    @ReactMethod
    fun holdAwake(tag: String, ms: Double, promise: Promise) {
        try {
            synchronized(awake) {
                val lock = awake.getOrPut(tag) {
                    val pm = ctx.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
                    pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Duetto::redial:$tag").apply {
                        setReferenceCounted(false)
                    }
                }
                lock.acquire(ms.toLong().coerceIn(1_000L, 120_000L))
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("awake_error", e)
        }
    }

    /** The server found again, or given up: the processor may sleep. */
    @ReactMethod
    fun letSleep(tag: String, promise: Promise) {
        synchronized(awake) {
            try {
                awake.remove(tag)?.let { if (it.isHeld) it.release() }
            } catch (_: Exception) {
                // already let go by its timeout: nothing to do
            }
        }
        promise.resolve(true)
    }

    /** Takes the quiet note away when it is not true any more. */
    @ReactMethod
    fun clearNote(promise: Promise) {
        Notifier.clearNote(ctx)
        promise.resolve(true)
    }


    @ReactMethod
    fun stop(promise: Promise) {
        lastText = null
        try {
            ctx.stopService(Intent(ctx, ChannelForegroundService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("foreground_service_error", e)
        }
    }

    /**
     * Hands over to listening without an interface.
     *
     * It is called when the interface is about to disappear without
     * anybody having asked to leave: from that moment the app's
     * JavaScript engine is gone, and the connection would go with it.
     * PresenceService starts one with no window, which opens it again.
     *
     * With a little delay: the old context has to finish taking itself
     * apart, otherwise the task without an interface would be born inside
     * the one that is dying.
     */
    /**
     * To be called on entering and leaving the channel: the service
     * holds the CPU awake only while a conversation is actually running.
     * Waiting costs nothing - see the note on `inChannel` in the service.
     */
    @ReactMethod
    fun setInChannel(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_IN_CHANNEL, active)
        }
    }

    /** The other there to hear: the processor is kept awake only then. */
    @ReactMethod
    fun setPeerHere(here: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_PEER_HERE, here)
        }
    }

    /**
     * "Leave and become unavailable", written where a reboot cannot
     * erase it: the boot receiver, the watchdog alarm and the handovers
     * all read it before putting presence back on its feet.
     */
    @ReactMethod
    fun setAvailable(v: Boolean, promise: Promise) {
        WatchdogAlarm.setAvailable(ctx, v)
        promise.resolve(true)
    }

    /**
     * When Duetto was last swiped out of the recents, 0 if never: the
     * presence that comes back after a window vanished tells the other
     * side whether it was that gesture or the phone.
     */
    @ReactMethod
    fun recentsClearedAt(promise: Promise) {
        promise.resolve(ChannelForegroundService.recentsClearedAt(ctx).toDouble())
    }

    /** The same choice, read back: the presence asks before starting. */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(WatchdogAlarm.available(ctx))
    }

    /**
     * Whether there is anything for the watchdog alarm to watch over:
     * false while no pair is set up, true again the moment one is.
     */
    @ReactMethod
    fun watchdogWanted(v: Boolean, promise: Promise) {
        WatchdogAlarm.setWanted(ctx, v)
        promise.resolve(true)
    }

    @ReactMethod
    fun resumePresence(promise: Promise) {
        if (!PresenceService.canStart() || !WatchdogAlarm.available(ctx)) {
            promise.resolve(false)
            return
        }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                ContextCompat.startForegroundService(
                    ctx,
                    Intent(ctx, PresenceService::class.java),
                )
            } catch (e: Exception) {
                android.util.Log.w("Duetto", "presence not resumed: ${e.message}")
            }
        }, 1500)
        promise.resolve(true)
    }

    // --- The settings that staying reachable depends on ---------------

    /**
     * The name the phone goes by, as its owner sees it.
     *
     * Build.MODEL is what the maker calls the hardware - "2511FPC34G"
     * for a POCO F5 - and nobody recognises their phone in it. The
     * device name in the system settings, the one shown in Bluetooth,
     * is what they would write themselves. Empty where there is none.
     */
    @ReactMethod
    fun deviceName(promise: Promise) {
        val resolver = ctx.contentResolver
        val name = try {
            android.provider.Settings.Global.getString(resolver, "device_name")
                ?: android.provider.Settings.Secure.getString(resolver, "bluetooth_name")
        } catch (e: Exception) { null }
        promise.resolve(name?.trim() ?: "")
    }

    /**
     * The battery, for the diagnostics on screen: percent, and whether
     * the charger is in. The journal has had them all along; whoever is
     * reading the numbers on the phone wants them there too.
     */
    @ReactMethod
    fun battery(promise: Promise) {
        val bm = ctx.getSystemService(android.content.Context.BATTERY_SERVICE)
            as? android.os.BatteryManager
        val percent = bm?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val status = ctx.registerReceiver(
            null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED),
        )
        val plugged = (status?.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        val map = com.facebook.react.bridge.Arguments.createMap()
        map.putInt("percent", percent)
        map.putBoolean("charging", plugged)
        promise.resolve(map)
    }

    @ReactMethod
    fun isBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.isIgnoringBatteryOptimizations(ctx))
    }

    @ReactMethod
    fun requestBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.requestIgnoreBatteryOptimizations(ctx, currentActivity))
    }

    /**
     * When the app last started up by itself, in milliseconds; 0 if it
     * never happened.
     *
     * It is the only way to know whether auto-start is granted: the
     * permission itself cannot be read by any app, but its effect can.
     */
    @ReactMethod
    fun lastAutoStart(promise: Promise) {
        val p = ctx.getSharedPreferences(BootReceiver.PREFS, android.content.Context.MODE_PRIVATE)
        promise.resolve(p.getLong(BootReceiver.LAST_AUTO_START, 0L).toDouble())
    }

    /** How long the phone has been on: it dates the last reboot. */
    @ReactMethod
    fun uptimeMs(promise: Promise) {
        promise.resolve(android.os.SystemClock.elapsedRealtime().toDouble())
    }

    @ReactMethod
    fun hasAutoStartScreen(promise: Promise) {
        promise.resolve(StartupHelper.hasAutoStartScreen(ctx))
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAutoStartSettings(ctx, currentActivity))
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAppSettings(ctx, currentActivity))
    }

    /** News to be read at leisure: it does not sound and does not buzz. */
    @ReactMethod
    fun note(name: String, text: String, promise: Promise) {
        try {
            Notifier.showNote(ctx, name, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** An alert to show when the app is not in the foreground. */
    @ReactMethod
    fun notify(name: String, text: String, promise: Promise) {
        try {
            Notifier.show(ctx, name, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** The same, gone by itself after `ms`: news the standing notification says as well. */
    @ReactMethod
    fun notifyBrief(name: String, text: String, ms: Double, promise: Promise) {
        try {
            Notifier.show(ctx, name, text, briefMs = ms.toLong())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /**
     * A call from a connection not in use: touched, it opens the app on
     * it, and it sounds and buzzes as that connection was set to - empty
     * words keep the connection in use's.
     */
    @ReactMethod
    fun notifyFor(
        name: String, text: String, pairId: String,
        vibration: String, sound: String, uri: String, level: Double, promise: Promise,
    ) {
        try {
            val own = Alerts.stored(ctx)
            val choice = Alerts.Choice(
                vibration.ifEmpty { own.vibration },
                sound.ifEmpty { own.sound },
                if (sound.isEmpty()) own.uri else uri,
                if (level >= 0) level.toFloat() else own.level,
            )
            Notifier.show(ctx, name, text, pairId, choice)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** The connection the app was opened for, once: see OpenedFrom. */
    @ReactMethod
    fun takeOpenedPair(promise: Promise) {
        val id = OpenedFrom.pair
        val enter = OpenedFrom.enter
        OpenedFrom.pair = null
        OpenedFrom.enter = false
        promise.resolve(if (id != null && enter) "enter:$id" else id)
    }

    /** A word over everything, gone by itself: what a notification's button did. */
    @ReactMethod
    fun toast(text: String, promise: Promise) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                android.widget.Toast.makeText(ctx, text, android.widget.Toast.LENGTH_SHORT).show()
            } catch (_: Exception) { /* noop */ }
        }
        promise.resolve(true)
    }

    /** Takes the alert away, when the user has come back into the app. */
    @ReactMethod
    fun clearNotification(promise: Promise) {
        Notifier.cancel(ctx)
        promise.resolve(true)
    }
}
