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

import android.app.ApplicationExitInfo
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.zip.GZIPInputStream

/**
 * Where a native crash happened, in one line.
 *
 * On 15 October the edge died in the video library a second after
 * switching the camera on, and the journal could only say
 * "native-crash": which library, which function, nobody knew. Android
 * keeps the crash's report - the tombstone - and from Android 12 hands it
 * to the app that died, through `getTraceInputStream`, written in
 * protobuf (Android's tombstone.proto). Here just enough of it is read
 * to say the signal, the abort message if there is one, the thread that
 * crashed and its first frames: library and function, which is what
 * tells a camera from a decoder from the audio.
 *
 * A report that cannot be read is said so; it never takes the start-up
 * down with it.
 */
internal object CrashTrace {

    private const val MAX_BYTES = 4 * 1024 * 1024
    private const val FRAMES = 8

    fun describe(exit: ApplicationExitInfo): String? {
        val bytes = try {
            exit.traceInputStream?.use { read(it) } ?: return null
        } catch (e: Exception) {
            return "unreadable: ${e.javaClass.simpleName}"
        }
        return try {
            summary(bytes)
        } catch (e: Exception) {
            "unparsed: ${e.javaClass.simpleName}"
        }
    }

    /** All of it, opened if it comes zipped. */
    private fun read(raw: InputStream): ByteArray {
        val buffered = raw.buffered()
        buffered.mark(2)
        val b0 = buffered.read()
        val b1 = buffered.read()
        buffered.reset()
        val stream = if (b0 == 0x1f && b1 == 0x8b) GZIPInputStream(buffered) else buffered
        val out = ByteArrayOutputStream()
        val chunk = ByteArray(16 * 1024)
        while (out.size() < MAX_BYTES) {
            val n = stream.read(chunk)
            if (n < 0) break
            out.write(chunk, 0, n)
        }
        return out.toByteArray()
    }

    // --- tombstone.proto, the few fields needed -----------------------------
    //  Tombstone: tid 6, signal_info 10, abort_message 14, threads 16 (map)
    //  Signal: name 2, code_name 4, fault_address 9
    //  Thread: id 1, name 2, current_backtrace 4
    //  BacktraceFrame: rel_pc 1, function_name 4, function_offset 5, file_name 6

    private fun summary(bytes: ByteArray): String {
        var tid = -1L
        var signal = ""
        var abort = ""
        val threads = mutableMapOf<Long, ByteArray>()
        Proto(bytes).forEach { field, value ->
            when (field) {
                6 -> tid = value as Long
                10 -> signal = signal(value as ByteArray)
                14 -> abort = String(value as ByteArray)
                16 -> {
                    var key = -1L
                    var thread: ByteArray? = null
                    Proto(value as ByteArray).forEach { f, v ->
                        if (f == 1) key = v as Long
                        if (f == 2) thread = v as ByteArray
                    }
                    thread?.let { threads[key] = it }
                }
            }
        }
        val crashed = threads[tid] ?: threads.values.firstOrNull()
        val parts = mutableListOf<String>()
        if (signal.isNotEmpty()) parts += signal
        if (abort.isNotEmpty()) parts += "abort=${abort.take(200)}"
        if (crashed != null) parts += thread(crashed)
        return parts.joinToString(" | ").ifEmpty { "empty" }
    }

    private fun signal(bytes: ByteArray): String {
        var name = ""
        var code = ""
        var fault: Long? = null
        Proto(bytes).forEach { f, v ->
            when (f) {
                2 -> name = String(v as ByteArray)
                4 -> code = String(v as ByteArray)
                9 -> fault = v as Long
            }
        }
        return listOf(name, code, fault?.let { "@0x" + java.lang.Long.toHexString(it) } ?: "")
            .filter { it.isNotEmpty() }.joinToString(" ")
    }

    private fun thread(bytes: ByteArray): String {
        var name = ""
        val frames = mutableListOf<String>()
        Proto(bytes).forEach { f, v ->
            when (f) {
                2 -> name = String(v as ByteArray)
                4 -> if (frames.size < FRAMES) frames += frame(v as ByteArray)
            }
        }
        return "thread=$name " + frames.mapIndexed { i, s -> "#$i $s" }.joinToString(" ")
    }

    private fun frame(bytes: ByteArray): String {
        var pc = 0L
        var function = ""
        var offset = 0L
        var file = ""
        Proto(bytes).forEach { f, v ->
            when (f) {
                1 -> pc = v as Long
                4 -> function = String(v as ByteArray)
                5 -> offset = v as Long
                6 -> file = String(v as ByteArray)
            }
        }
        val lib = file.substringAfterLast('/')
        val where = if (function.isNotEmpty()) "$function+$offset"
        else "pc=0x" + java.lang.Long.toHexString(pc)
        return "$lib:$where"
    }

    /** A protobuf message walked field by field: varints as Long, lengths as bytes. */
    private class Proto(private val b: ByteArray) {
        private var i = 0

        private fun varint(): Long {
            var result = 0L
            var shift = 0
            while (true) {
                val x = b[i++].toInt() and 0xff
                result = result or ((x and 0x7f).toLong() shl shift)
                if (x and 0x80 == 0) return result
                shift += 7
                if (shift > 63) throw IllegalStateException("varint")
            }
        }

        fun forEach(each: (Int, Any) -> Unit) {
            while (i < b.size) {
                val key = varint()
                val field = (key ushr 3).toInt()
                when ((key and 7).toInt()) {
                    0 -> each(field, varint())
                    1 -> { i += 8 }
                    2 -> {
                        val n = varint().toInt()
                        if (n < 0 || i + n > b.size) throw IllegalStateException("length")
                        each(field, b.copyOfRange(i, i + n))
                        i += n
                    }
                    5 -> { i += 4 }
                    else -> throw IllegalStateException("wire type")
                }
            }
        }
    }
}
