package com.carrotnote.app.update

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.carrotnote.app.BuildConfig
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.data.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

data class ReleaseInfo(
    val version: String,
    val notes: String,
    val apkUrl: String,
    val size: Long,
    val pageUrl: String,
)

sealed interface DownloadState {
    data object Idle : DownloadState
    data class Downloading(val progress: Float) : DownloadState
    data class Failed(val message: String) : DownloadState
    data object ReadyToInstall : DownloadState
}

/** Checks GitHub Releases for a newer APK and installs it. */
object Updater {
    const val EXTRA_SHOW_UPDATE = "show_update"

    private val _available = MutableStateFlow<ReleaseInfo?>(null)
    /** A newer release the user should be asked about (null = nothing to show). */
    val available: StateFlow<ReleaseInfo?> = _available.asStateFlow()

    private val _download = MutableStateFlow<DownloadState>(DownloadState.Idle)
    val download: StateFlow<DownloadState> = _download.asStateFlow()

    val currentVersion: String get() = BuildConfig.VERSION_NAME.substringBefore('-')

    fun isNewer(remote: String, local: String): Boolean {
        fun parts(v: String) = v.trim().removePrefix("v").substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
        val a = parts(remote)
        val b = parts(local)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    suspend fun fetchLatest(): ReleaseInfo? = withContext(Dispatchers.IO) {
        val conn = (URL("https://api.github.com/repos/${BuildConfig.GITHUB_REPO}/releases/latest").openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "CarrotNote/${BuildConfig.VERSION_NAME}")
        }
        try {
            if (conn.responseCode != 200) return@withContext null
            val obj = AppJson.parseToJsonElement(conn.inputStream.bufferedReader().use { it.readText() }) as JsonObject
            val tag = obj["tag_name"]?.jsonPrimitive?.contentOrNull ?: return@withContext null
            val asset = (obj["assets"] as? JsonArray)?.map { it as JsonObject }?.firstOrNull {
                it["name"]?.jsonPrimitive?.contentOrNull?.endsWith(".apk") == true
            } ?: return@withContext null
            ReleaseInfo(
                version = tag.removePrefix("v"),
                notes = obj["body"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                apkUrl = asset["browser_download_url"]?.jsonPrimitive?.contentOrNull ?: return@withContext null,
                size = asset["size"]?.jsonPrimitive?.longOrNull ?: 0L,
                pageUrl = obj["html_url"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Checks for an update. When [manual] is false a version the user postponed with "Later"
     * stays hidden for a day. Returns the newer release, or null if up to date.
     */
    suspend fun check(manual: Boolean): ReleaseInfo? {
        val latest = runCatching { fetchLatest() }.getOrNull() ?: return null
        if (!isNewer(latest.version, currentVersion)) return null
        val s = Graph.settings
        val snoozed = s.snoozedVersion == latest.version && System.currentTimeMillis() < s.snoozedUntil
        if (manual || !snoozed) _available.value = latest
        return latest
    }

    fun showRelease(release: ReleaseInfo) {
        _available.value = release
    }

    fun later() {
        _available.value?.let {
            Graph.settings.snoozedVersion = it.version
            Graph.settings.snoozedUntil = System.currentTimeMillis() + 24 * 3600_000L
        }
        _available.value = null
        _download.value = DownloadState.Idle
    }

    // Before Android 7 the installer can only open files other apps can read, so the download goes
    // to the app's folder on shared storage there.
    private fun apkFile(context: Context, version: String): File {
        val base = if (Build.VERSION.SDK_INT >= 24) context.cacheDir else context.getExternalFilesDir(null) ?: context.cacheDir
        return File(File(base, "updates").apply { mkdirs() }, "carrot-note-$version.apk")
    }

    suspend fun downloadAndInstall(context: Context, release: ReleaseInfo) {
        val file = apkFile(context, release.version)
        if (!(file.exists() && release.size > 0 && file.length() == release.size)) {
            _download.value = DownloadState.Downloading(0f)
            val ok = withContext(Dispatchers.IO) {
                runCatching {
                    file.parentFile?.listFiles()?.forEach { it.delete() }
                    val conn = (URL(release.apkUrl).openConnection() as HttpURLConnection).apply {
                        instanceFollowRedirects = true
                        connectTimeout = 15_000
                        readTimeout = 30_000
                        setRequestProperty("User-Agent", "CarrotNote/${BuildConfig.VERSION_NAME}")
                    }
                    try {
                        val total = conn.contentLength.toLong().takeIf { it > 0 } ?: release.size
                        val tmp = File(file.path + ".part")
                        conn.inputStream.use { input ->
                            tmp.outputStream().use { out ->
                                val buf = ByteArray(64 * 1024)
                                var read = 0L
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    out.write(buf, 0, n)
                                    read += n
                                    if (total > 0) _download.value = DownloadState.Downloading((read.toFloat() / total).coerceIn(0f, 1f))
                                }
                            }
                        }
                        tmp.renameTo(file)
                    } finally {
                        conn.disconnect()
                    }
                }.getOrElse { false }
            }
            if (!ok) {
                _download.value = DownloadState.Failed("Download failed. Check your connection and try again.")
                return
            }
        }
        _download.value = DownloadState.ReadyToInstall
        install(context, file)
    }

    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    fun openInstallPermissionSettings(context: Context) {
        Graph.lock.suppressNextLock()
        val intent = if (Build.VERSION.SDK_INT >= 26) {
            Intent(AndroidSettings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        } else {
            Intent(AndroidSettings.ACTION_SECURITY_SETTINGS)
        }
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun install(context: Context, file: File = apkFile(context, _available.value?.version ?: "")) {
        if (!file.exists()) return
        if (!canInstall(context)) {
            openInstallPermissionSettings(context)
            return
        }
        Graph.lock.suppressNextLock()
        val uri = if (Build.VERSION.SDK_INT >= 24) {
            FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        } else {
            file.setReadable(true, false)
            Uri.fromFile(file)
        }
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    fun notify(context: Context, release: ReleaseInfo) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, 4242,
            Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_SHOW_UPDATE, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_UPDATES)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF7A1A.toInt())
            .setContentTitle("Carrot Note ${release.version} is available")
            .setContentText("Tap to update now or later.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(4242, n)
    }
}

class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val release = runCatching { Updater.fetchLatest() }.getOrNull() ?: return Result.success()
        if (Updater.isNewer(release.version, Updater.currentVersion) &&
            Graph.settings.notifiedVersion != release.version
        ) {
            Updater.notify(applicationContext, release)
            Graph.settings.notifiedVersion = release.version
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<UpdateWorker>(12, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork("carrot_update_check", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork("carrot_update_check")
        }
    }
}
