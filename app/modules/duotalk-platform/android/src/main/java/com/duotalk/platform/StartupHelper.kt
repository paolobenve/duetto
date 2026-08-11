package com.duotalk.platform

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
 * 1) Uso senza restrizioni di batteria: e' standard di Android e si puo'
 *    chiedere con una finestra di sistema, una spunta e via.
 *
 * 2) Avvio automatico: NON e' un'autorizzazione di Android, e' una
 *    schermata proprietaria dei produttori. Nessuna app puo' concederselo
 *    da sola; l'unica cosa possibile e' aprire quella schermata al posto
 *    dell'utente. Senza, dopo un riavvio del telefono i produttori piu'
 *    aggressivi non consegnano nemmeno l'evento di avvio.
 */
object StartupHelper {

    fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    /** Finestra di sistema: una spunta e l'app puo' restare attiva. */
    fun requestIgnoreBatteryOptimizations(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        return try {
            @Suppress("BatteryLife")
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${ctx.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Schermate di avvio automatico note, per produttore. L'elenco e'
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

    fun openAutoStartSettings(ctx: Context): Boolean {
        val intent = findAutoStartIntent(ctx) ?: return false
        return try {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: Exception) {
            false
        }
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
    fun openAppSettings(ctx: Context): Boolean {
        return try {
            ctx.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:${ctx.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        } catch (e: Exception) {
            false
        }
    }
}
