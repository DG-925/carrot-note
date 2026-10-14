package com.carrotnote.app.chat

import android.content.Context
import android.media.MediaRecorder
import android.util.Base64
import java.io.File

/** Records a voice message or voice note (AAC in .m4a, small enough to send in a chat). */
object VoiceRecorder {
    private const val MAX_MS = 120_000
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    val recording: Boolean get() = recorder != null

    @Suppress("DEPRECATION") // MediaRecorder(Context) needs Android 12; this one works everywhere.
    fun start(context: Context) {
        cancel()
        val f = File(context.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
        val r = MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(22_050)
            r.setAudioEncodingBitRate(32_000)
            r.setMaxDuration(MAX_MS)
            r.setOutputFile(f.path)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            r.release()
            f.delete()
            throw IllegalStateException("Can't use the microphone right now")
        }
        recorder = r
        file = f
        startedAt = System.currentTimeMillis()
    }

    /** Stops and returns the clip as a data URL with its length in seconds, or null if it was too short. */
    fun stop(): Pair<String, Double>? {
        val r = recorder ?: return null
        val f = file
        val seconds = ((System.currentTimeMillis() - startedAt).coerceAtMost(MAX_MS.toLong())) / 1000.0
        recorder = null
        file = null
        val ok = runCatching { r.stop() }.isSuccess // fails when nothing was recorded
        r.release()
        if (f == null) return null
        try {
            if (!ok && seconds < 1.0 || seconds < 0.6 || !f.exists() || f.length() < 200) return null
            return Pair("data:audio/mp4;base64," + Base64.encodeToString(f.readBytes(), Base64.NO_WRAP), seconds)
        } finally {
            f.delete()
        }
    }

    fun cancel() {
        val r = recorder ?: return
        recorder = null
        runCatching { r.stop() }
        r.release()
        file?.delete()
        file = null
    }
}
