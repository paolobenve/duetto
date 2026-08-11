package com.duotalk.platform

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Registrato automaticamente dall'autolinking di React Native, grazie alla
 * dipendenza "file:modules/duotalk-platform" in package.json: non serve
 * toccare MainApplication.
 */
class DuoTalkPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(
        ForegroundModule(reactContext),
        PipModule(reactContext),
        VisibilityModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
