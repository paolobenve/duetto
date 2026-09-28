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
import android.os.Build
import android.os.Bundle
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

    /** Closes the call, if there is one. */
    fun end() {
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

    override fun onHold() {
        // A real call was answered: ours waits, and says so.
        setOnHold()
        Calls.say("held")
    }

    override fun onUnhold() {
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
        return c
    }

    override fun onCreateOutgoingConnectionFailed(
        account: PhoneAccountHandle?, request: ConnectionRequest?,
    ) {
        Calls.say("failed")
    }
}
