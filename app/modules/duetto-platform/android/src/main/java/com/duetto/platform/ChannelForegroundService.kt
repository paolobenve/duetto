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

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Keeps the process alive while you are in the channel.
 *
 * Android suspends apps in the background and with the screen off:
 * without a foreground service the WebRTC connection would drop within
 * seconds. From Android 14 the "microphone" type is also the only way
 * allowed to go on recording audio outside the foreground.
 *
 * The standing notification in the status bar is not a whim: it is
 * Android that imposes it in return, and it cannot be removed.
 */
class ChannelForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var currentText: String = Strings.inChannel

    /**
     * The name of the connection in use, which goes in front of the text.
     *
     * The app sends it, because the app is the one that knows it. In the
     * text and not in the title: the folded notification, on a good many
     * phones, does not show the title, and "You are in the channel"
     * without a name does not say which one.
     */
    private var currentName: String? = null
    private var cameraActive: Boolean = false

    /**
     * Whether the user is actually in the channel, not merely waiting.
     *
     * The wake lock follows this and nothing else. In conversation the
     * CPU must not doze - WebRTC is a stream of timers and packets - and
     * the cost is the cost of the call. Waiting is another life: the
     * socket sits still, the server's rare pings arrive by themselves
     * (an incoming packet wakes the CPU on its own), and holding the
     * lock all night bought nothing but a warm battery. What used to
     * need it - noticing a silent death with the screen off - is the
     * watchdog alarm's job now.
     */
    private var inChannel: Boolean = false

    /**
     * The consumption journal is written from here.
     *
     * It is the service that is alive for the whole time worth measuring
     * - with the screen off and the app in the background too - while the
     * JavaScript side may be stopped. With the wake lock we hold, this
     * wait fires on time; if one day the wake lock went away, a system
     * alarm would be needed in its place.
     */
    private val clock = Handler(Looper.getMainLooper())
    private var journalStarted = false

    /**
     * It does not reschedule itself: the Journal sees to that at every
     * line written, wherever it comes from. Doing it here as well, a line
     * written off the beat would leave two waits queued and the journal
     * would thicken by itself.
     */
    private val writeJournal = Runnable { Journal.sample(applicationContext) }

    private fun rescheduleJournal() {
        clock.removeCallbacks(writeJournal)
        // With diagnostics off there is no periodic line: the wait is not
        // put back in the queue, and the journal is left with the lines
        // that events write.
        if (!Journal.sampling) return
        clock.postDelayed(writeJournal, JOURNAL_INTERVAL_MS)
    }

    companion object {
        const val CHANNEL_ID = "duetto_presence"
        const val NOTIFICATION_ID = 4711
        const val EXTRA_TEXT = "text"
        const val EXTRA_NAME = "name"
        const val EXTRA_CAMERA = "camera"
        const val EXTRA_IN_CHANNEL = "inChannel"

        // A safety net: if something goes wrong and we do not stop the
        // service, the wake lock does not hang around for ever.
        private const val WAKELOCK_TIMEOUT_MS = 8L * 60L * 60L * 1000L

        /**
         * How often a journal line is written.
         *
         * Five minutes is close enough to see the difference between an
         * hour in conversation and an hour of waiting, and far enough
         * apart not to be a consumption of its own: the line costs one
         * read of some counters and a write of a hundred bytes or so.
         */
        private const val JOURNAL_INTERVAL_MS = 5L * 60L * 1000L
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Plugging the cable in and pulling it out are the journal's most
     * important boundaries: while charging the battery goes up, and any
     * account of consumption made across that moment is meaningless.
     * Marking them with a line, whoever reads can throw whole charging
     * periods away instead of finding positive differences in the middle
     * of the numbers.
     */
    private val charger = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_POWER_CONNECTED ->
                    Journal.sample(applicationContext, "charger-in")
                Intent.ACTION_POWER_DISCONNECTED ->
                    Journal.sample(applicationContext, "charger-out")
                // The screen does not make a line get written: it goes on
                // and off far too often, and every line costs. Only the
                // count of seconds is kept, which ends up on the next line.
                Intent.ACTION_SCREEN_ON -> Journal.screenChanged(true)
                Intent.ACTION_SCREEN_OFF -> Journal.screenChanged(false)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        // Registered at runtime and not in the manifest: from Android 8
        // these announcements no longer reach receivers declared there.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(charger, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(charger, filter)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // A null intent = the system put us back on our feet, after
        // killing us to make room for something else (START_STICKY). The
        // service comes back, but the JavaScript engine went away with the
        // process: on its own, this service would only know how to show a
        // notification declaring a presence that does not exist, which is
        // worse than nothing.
        //
        // The road to putting the connection back up already exists and it
        // is the one taken after a reboot: it hands over to
        // PresenceService, which starts the JavaScript with no interface.
        // The notification is the same - same channel, same number - so
        // the changeover cannot be seen.
        if (intent == null) {
            // The system put us back on our feet: we are in the
            // background, and the microphone cannot be asked for here.
            goForeground(mayUseMicrophone = false)
            if (PresenceService.canStart() && WatchdogAlarm.available(this)) {
                try {
                    androidx.core.content.ContextCompat.startForegroundService(
                        this,
                        Intent(this, PresenceService::class.java),
                    )
                    android.util.Log.i("Duetto", "woken by the system: presence restarted")
                } catch (e: Exception) {
                    android.util.Log.w("Duetto", "waking did not work: ${e.message}")
                }
            }
            // The place is theirs: staying on in twos would mean two
            // services and one wake lock too many.
            stopSelf()
            return START_NOT_STICKY
        }

        intent.getStringExtra(EXTRA_TEXT)?.let { currentText = it }
        intent.getStringExtra(EXTRA_NAME)?.let {
            currentName = it
            // On disk as well: after a reboot the presence notification is
            // born before the app can say what it is called.
            Notifier.rememberName(this, it)
        }
        if (intent.hasExtra(EXTRA_CAMERA)) {
            cameraActive = intent.getBooleanExtra(EXTRA_CAMERA, false)
        }
        if (intent.hasExtra(EXTRA_IN_CHANNEL)) {
            inChannel = intent.getBooleanExtra(EXTRA_IN_CHANNEL, false)
        }
        goForeground()
        if (inChannel) acquireWakeLock() else releaseWakeLock()
        // The net under the waiting: see WatchdogAlarm.
        WatchdogAlarm.schedule(this)

        // onStartCommand arrives at every change of the notification's
        // text: without this guard a sampler would pile up for every call,
        // and the journal would fill with twin lines.
        if (!journalStarted) {
            journalStarted = true
            // Before any reading: the names in storage have changed.
            Bridge.migrate(applicationContext)
            Journal.onWrite { rescheduleJournal() }
            // How it ended last time: if the process before died, here is
            // where we find out why.
            Journal.recordExits(applicationContext)
            // The start line reschedules the wait by itself.
            Journal.sample(applicationContext, "start")
        }

        // If Android kills us for memory, it starts us again.
        return START_STICKY
    }

    override fun onDestroy() {
        try { unregisterReceiver(charger) } catch (_: Exception) { /* never registered */ }
        // First the rescheduling is unhooked, then the last line is
        // written: otherwise that line would queue a wait nobody is left
        // to wait for.
        Journal.onWrite(null)
        clock.removeCallbacks(writeJournal)
        journalStarted = false
        Journal.sample(applicationContext, "exit")
        releaseWakeLock()
        super.onDestroy()
    }

    /**
     * Swiping the app out of the recents does NOT stop presence.
     *
     * It used to, and that seemed reasonable: whoever throws the app out
     * of the recents wants to close it. But the journals of two different
     * phones tell another story: after every "exit" the process stayed
     * there with no service, and half an hour later Android recycled it -
     * `was=cached`, "[TOO MANY EMPTY PROCS]", "out-of-memory". Whoever had
     * swiped the app away to tidy the recents up found themselves
     * unreachable without having asked for it, and with no way of
     * noticing.
     *
     * The gesture is ambiguous, and it is of no use any more: to be
     * unreachable there is "leave and become unavailable", which says so
     * in so many words. It was not there when this shortcut was written.
     *
     * By staying on its feet, the service holds the process up too: which
     * is exactly what it is asked to do.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        Journal.sample(applicationContext, "recents-cleared")
        // The JavaScript engine goes with the activity: with nobody to
        // take the connection back up, this service would be left showing
        // a presence that is not there any more. It hands over to
        // PresenceService, the same road as a reboot.
        //
        // With a little delay: the old context has to finish taking itself
        // apart first, otherwise the task without an interface would be
        // born inside the one that is dying.
        if (PresenceService.canStart() && WatchdogAlarm.available(this)) {
            clock.postDelayed({
                try {
                    androidx.core.content.ContextCompat.startForegroundService(
                        applicationContext,
                        Intent(applicationContext, PresenceService::class.java),
                    )
                } catch (e: Exception) {
                    android.util.Log.w("Duetto", "recents: presence not resumed: ${e.message}")
                }
            }, 2500)
        }
        super.onTaskRemoved(rootIntent)
    }

    // --- notification -------------------------------------------------------

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            Strings.presenceChannel,
            // LOW: no sound, the notification is only there to inform
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = Strings.presenceChannelWhat
            setShowBadge(false)
            enableVibration(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Duetto")
            .setContentText(Notifier.withName(currentName ?: Notifier.name(this), currentText))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pending)
            // No `setOngoing`: it is that declaration that makes the
            // notification impossible to dismiss, and on Android 13 and
            // later it is of no use any more. From there on the system
            // lets a foreground service's notification be swiped away -
            // the service goes on running and one stays reachable all the
            // same - while before 13 it is the system itself that holds it
            // in place, with or without this line. Taking it away changes
            // nothing on old phones and gives the choice back on new ones.
            // It comes back at the first change of state, because a
            // foreground service has to have a notification.
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setGroup(Notifier.GROUP)
            .setSortKey(Notifier.SORT_STATE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    /**
     * @param mayUseMicrophone false when we are not the ones starting up
     *
     * From Android 14 the "microphone" type can only be asked for while
     * in the foreground: asking for it from a standstill - as when the
     * SYSTEM puts us back on our feet after killing us - throws an
     * exception and kills the app. In that case we start with no type: the
     * notification is there all the same, and whoever really needs the
     * microphone - entering the channel - asks for it afresh when the user
     * is in front of the screen.
     *
     * And in any case nobody dies: if the system refuses, it is written in
     * the journal and we stop. An app that crashes does not even leave a
     * way of understanding what happened.
     */
    private fun goForeground(mayUseMicrophone: Boolean = true) {
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && mayUseMicrophone) {
                var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (cameraActive) {
                    type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                }
                startForeground(NOTIFICATION_ID, notification, type)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            android.util.Log.w("Duetto", "service refused by the system: ${e.message}")
            Journal.sample(applicationContext, "service-refused")
            try { stopSelf() } catch (_: Exception) { /* noop */ }
        }
    }

    // --- wake lock ----------------------------------------------------------

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Duetto::presence").apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
            // already released: nothing to do
        }
        wakeLock = null
    }
}
