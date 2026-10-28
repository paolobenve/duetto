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

import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.network.ForwardingCookieHandler
import com.facebook.react.modules.websocket.WebSocketModule
import java.net.URI

/**
 * React Native's WebSocket, without WebView's cookies.
 *
 * Every time a WebSocket opens, React Native asks WebView's
 * CookieManager for the cookies of the address, and that loads WebView
 * into Duetto's process. Android then counts Duetto among the apps that
 * use WebView, and when the Play Store updates WebView it closes them
 * all: on the Edge on 9, 16, 23 and 28 October, on the POCO on the
 * 27th, nearly always at night, in the channel. Duetto never shows a
 * page and sends no cookies to its server.
 *
 * The module is final and its cookie handler private, so the handler is
 * swapped from outside, found by its type rather than by its name, for
 * one that has no cookies and never wakes WebView. Done before the first
 * socket opens: see noCookies.ts.
 *
 * fetch() needs none of this: without credentials React Native gives it
 * no cookie jar at all.
 */
object SocketsWithoutCookies {

    private class NoCookies(ctx: ReactApplicationContext) : ForwardingCookieHandler(ctx) {
        override fun get(uri: URI, headers: Map<String, List<String>>): Map<String, List<String>> =
            emptyMap()

        override fun put(uri: URI, headers: Map<String, List<String>>) {}

        override fun clearCookies(callback: Callback) {
            callback.invoke(false)
        }

        override fun addCookies(url: String, cookies: List<String>) {}
    }

    /** "ok", or why not: it goes in the journal. */
    fun install(ctx: ReactApplicationContext): String = try {
        val module = ctx.getNativeModule(WebSocketModule::class.java)
        if (module == null) {
            "no-module"
        } else {
            val field = WebSocketModule::class.java.declaredFields
                .firstOrNull { ForwardingCookieHandler::class.java.isAssignableFrom(it.type) }
            if (field == null) {
                "no-field"
            } else {
                field.isAccessible = true
                field.set(module, NoCookies(ctx))
                "ok"
            }
        }
    } catch (e: Exception) {
        "failed:${e.javaClass.simpleName}"
    }
}
