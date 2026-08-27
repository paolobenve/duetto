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

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/**
 * The two settings "staying reachable" depends on.
 *
 * 1) Unrestricted battery use: it is standard Android and can be asked
 *    for with a system dialog, one tick and done.
 *
 * 2) Auto-start: this is NOT an Android permission, it is a screen of the
 *    manufacturer's own. No app can grant it to itself; the only thing
 *    possible is to open that screen on the user's behalf. Without it,
 *    after the phone reboots the more aggressive manufacturers do not
 *    even deliver the boot event.
 */
object StartupHelper {

    fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    /**
     * Opens the request for unrestricted use.
     *
     * It has to be started from the foreground ACTIVITY, not from the
     * application context: started from there, some interfaces (HyperOS
     * among them) show the dialog for an instant and close it themselves.
     *
     * And if the manufacturer blocks it altogether - Xiaomi does - we
     * fall back on the system list and, as a last resort, on the app's
     * own page: better a screen the user can still get there from than a
     * dialog that vanishes.
     */
    fun requestIgnoreBatteryOptimizations(ctx: Context, activity: Activity?): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        val from = activity ?: ctx

        @Suppress("BatteryLife")
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:${ctx.packageName}"))
        if (start(from, direct, activity == null)) return true

        val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        if (start(from, list, activity == null)) return true

        return openAppSettings(ctx, activity)
    }

    /** Starts it, adding NEW_TASK only when we do not come from an activity. */
    private fun start(from: Context, intent: Intent, needsNewTask: Boolean): Boolean {
        return try {
            if (needsNewTask) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (from.packageManager.resolveActivity(intent, 0) == null) return false
            from.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Known auto-start screens, by manufacturer. The list works by trial:
     * the names change between versions, and there is no official way to
     * reach them.
     */
    private val AUTOSTART_SCREENS = listOf(
        "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
        "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
        "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
        "com.asus.mobilemanager" to "com.asus.mobilemanager.autostart.AutoStartActivity",
        "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
    )

    /** True if an auto-start screen exists on this phone. */
    fun hasAutoStartScreen(ctx: Context): Boolean = findAutoStartIntent(ctx) != null

    fun openAutoStartSettings(ctx: Context, activity: Activity?): Boolean {
        val intent = findAutoStartIntent(ctx) ?: return false
        return start(activity ?: ctx, intent, activity == null)
    }

    private fun findAutoStartIntent(ctx: Context): Intent? {
        val pm = ctx.packageManager
        for ((pkg, cls) in AUTOSTART_SCREENS) {
            val intent = Intent().setComponent(ComponentName(pkg, cls))
            if (pm.resolveActivity(intent, 0) != null) return intent
        }
        return null
    }

    /** Fallback: the app's page in the system settings. */
    fun openAppSettings(ctx: Context, activity: Activity? = null): Boolean {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:${ctx.packageName}"))
        return start(activity ?: ctx, intent, activity == null)
    }
}
