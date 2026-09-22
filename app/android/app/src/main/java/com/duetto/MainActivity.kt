package com.duetto

import android.content.Intent
import android.view.KeyEvent
import com.duetto.platform.Volume
import android.content.res.Configuration
import com.duetto.platform.PipModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Duetto"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * I tasti del volume, mentre si è nel canale.
   *
   * Vedi Volume.kt: si prova prima con il volume di sistema, e solo se
   * quello non si muove - perché è al suo limite - la voce dell'altro la
   * alza l'app per conto suo. Fuori dal canale non passa di qui nulla.
   */
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.intercept(this, keyCode)) return true
    return super.onKeyDown(keyCode, event)
  }

  /** Il rilascio va consumato insieme alla pressione, o il tasto agisce due volte. */
  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.consumeRelease(keyCode)) return true
    return super.onKeyUp(keyCode, event)
  }

  /**
   * Opened on purpose, from outside.
   *
   * The icon, the notification, a link: every one of them hands the
   * activity an intent. The window coming back by itself - the bounce
   * that follows minimizing, which some phones do - hands it none. So
   * this is the difference between "somebody opened the app" and "the
   * window blinked", which no measure of time can tell apart, and the
   * interface needs it to know whether the leaving of a moment ago
   * still holds.
   *
   * super first, and always: React Native reads the intent from there,
   * and the links would stop arriving.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    PipModule.opened()
  }

  /** The little window begins or ends: the app changes its clothes. */
  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration,
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    PipModule.changed(isInPictureInPictureMode)
  }
}
