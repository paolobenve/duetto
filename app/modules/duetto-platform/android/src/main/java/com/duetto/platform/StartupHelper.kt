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
 * Le due impostazioni da cui dipende il "restare raggiungibili".
 *
 * 1) Uso senza restrizioni di batteria: è standard di Android e si può
 *    chiedere con una finestra di sistema, una spunta e via.
 *
 * 2) Avvio automatico: NON è un'autorizzazione di Android, è una
 *    schermata proprietaria dei produttori. Nessuna app può concederselo
 *    da sola; l'unica cosa possibile è aprire quella schermata al posto
 *    dell'utente. Senza, dopo un riavvio del telefono i produttori più
 *    aggressivi non consegnano nemmeno l'evento di avvio.
 */
object StartupHelper {

    fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    /**
     * Apre la richiesta di uso senza restrizioni.
     *
     * Va lanciata dall'ACTIVITY in primo piano, non dal contesto
     * dell'applicazione: partendo da lì alcune interfacce (HyperOS fra
     * queste) mostrano la finestra per un istante e la chiudono da sole.
     *
     * E se il produttore la blocca del tutto - Xiaomi lo fa - si ripiega
     * sull'elenco di sistema e, in ultima istanza, sulla scheda dell'app:
     * meglio una schermata da cui l'utente può comunque arrivarci che
     * una finestra che sparisce.
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

    /** Avvia, aggiungendo NEW_TASK solo se non partiamo da un'activity. */
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
     * Schermate di avvio automatico note, per produttore. L'elenco è
     * per tentativi: i nomi cambiano fra versioni, e non esiste un modo
     * ufficiale per raggiungerle.
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

    /** Vero se una schermata di avvio automatico esiste su questo telefono. */
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

    /** Ripiego: la scheda dell'app nelle impostazioni di sistema. */
    fun openAppSettings(ctx: Context, activity: Activity? = null): Boolean {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:${ctx.packageName}"))
        return start(activity ?: ctx, intent, activity == null)
    }
}
