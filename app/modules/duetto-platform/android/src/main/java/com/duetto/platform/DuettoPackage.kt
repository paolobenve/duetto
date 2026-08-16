package com.duetto.platform

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Registrato automaticamente dall'autolinking di React Native, grazie alla
 * dipendenza "file:modules/duetto-platform" in package.json: non serve
 * toccare MainApplication.
 */
class DuettoPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(
        ForegroundModule(reactContext),
        PipModule(reactContext),
        VisibilityModule(reactContext),
        CodecsModule(reactContext),
        AudioModule(reactContext),
        AvvisiModule(reactContext),
        DiarioModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
