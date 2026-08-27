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

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Registered automatically by React Native's autolinking, thanks to the
 * "file:modules/duetto-platform" dependency in package.json: there is no
 * need to touch MainApplication.
 */
class DuettoPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(
        ForegroundModule(reactContext),
        PipModule(reactContext),
        VisibilityModule(reactContext),
        NetworkModule(reactContext),
        HeartbeatModule(reactContext),
        ProximityModule(reactContext),
        LocaleModule(reactContext),
        CodecsModule(reactContext),
        AudioModule(reactContext),
        AlertsModule(reactContext),
        JournalModule(reactContext),
        VolumeModule(reactContext),
        AlarmModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
