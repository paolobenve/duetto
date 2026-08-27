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
        ReteModule(reactContext),
        BattitoModule(reactContext),
        ProssimitaModule(reactContext),
        LocaleModule(reactContext),
        CodecsModule(reactContext),
        AudioModule(reactContext),
        AvvisiModule(reactContext),
        JournalModule(reactContext),
        VolumeModule(reactContext),
        AlarmModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
