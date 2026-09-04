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

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.concurrent.Executors

/**
 * A screen that looks at a QR code and hands back what it says.
 *
 * Whoever is near can hold one phone up to the other instead of
 * dictating eight digits or an invitation: the code carries the
 * server too, so nothing is typed at all. The camera and the reading
 * are the phone's own - CameraX and ZXing, both free and with no
 * services of anybody's behind them - which is what keeps the app
 * publishable where proprietary pieces are not welcome.
 *
 * The first readable code ends the screen; the back gesture ends it
 * with nothing. The caller gets the text, or an empty string.
 */
class ScanActivity : ComponentActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        val preview = PreviewView(this)
        preview.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        root.addView(preview)
        val hint = TextView(this)
        hint.text = intent.getStringExtra("hint") ?: "QR"
        hint.setTextColor(Color.WHITE)
        hint.textSize = 18f
        hint.gravity = Gravity.CENTER
        hint.setPadding(40, 60, 40, 60)
        val hintParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        hintParams.gravity = Gravity.BOTTOM
        hint.layoutParams = hintParams
        root.addView(hint)
        setContentView(root)

        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()
            val previewUse = Preview.Builder().build()
            previewUse.setSurfaceProvider(preview.surfaceProvider)
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor) { image -> read(image) }
            try {
                provider.unbindAll()
                provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_BACK_CAMERA, previewUse, analysis,
                )
            } catch (e: Exception) {
                android.util.Log.w("Duetto", "scanner: camera not bound: ${e.message}")
                finishWith("")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private val reader = QRCodeReader()
    private val hints = mapOf(DecodeHintType.TRY_HARDER to true)

    /** One frame: the luminance plane alone is enough for a QR code. */
    private fun read(image: ImageProxy) {
        try {
            if (done) return
            val plane = image.planes[0]
            val width = image.width
            val height = image.height
            val buffer = plane.buffer
            val stride = plane.rowStride
            val bytes = ByteArray(width * height)
            if (stride == width) {
                buffer.get(bytes, 0, width * height)
            } else {
                // Padded rows: copied one at a time, the padding left out.
                val row = ByteArray(stride)
                for (y in 0 until height) {
                    buffer.position(y * stride)
                    buffer.get(row, 0, minOf(stride, buffer.remaining()))
                    System.arraycopy(row, 0, bytes, y * width, width)
                }
            }
            val source = PlanarYUVLuminanceSource(bytes, width, height, 0, 0, width, height, false)
            val text = try {
                reader.decode(BinaryBitmap(HybridBinarizer(source)), hints).text
            } catch (e: Exception) {
                // Most frames have no code in them: that is not an error.
                null
            } finally {
                reader.reset()
            }
            if (text != null) finishWith(text)
        } finally {
            image.close()
        }
    }

    private fun finishWith(text: String) {
        if (done) return
        done = true
        runOnUiThread {
            setResult(RESULT_OK, Intent().putExtra("text", text))
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdown()
    }
}
