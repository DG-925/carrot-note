package com.carrotnote.app.web

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.data.AppJson
import com.carrotnote.app.data.CalEvent
import com.carrotnote.app.data.ProfileUpdate
import com.carrotnote.app.data.PublicUser
import com.carrotnote.app.data.Rental
import com.carrotnote.app.data.TaskItem
import com.carrotnote.app.data.UserInfo
import com.carrotnote.app.data.Invite
import com.carrotnote.app.export.Invoice
import com.carrotnote.app.export.PdfReport
import com.carrotnote.app.monitor.Uptime
import com.carrotnote.app.monitor.UptimeResult
import com.carrotnote.app.profile.Avatars
import com.carrotnote.app.profile.Github
import com.carrotnote.app.reminders.Reminders
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.update.DownloadState
import com.carrotnote.app.update.UpdateWorker
import com.carrotnote.app.update.Updater
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import kotlin.coroutines.resume

/**
 * Connects the web UI (TypeScript in assets/web) to the app's data and phone features.
 *
 * JS calls `CarrotNative.call(id, method, argsJson)`; the answer comes back through
 * `window.__native.reply(id, ok, json)`. State and data changes are pushed with
 * `window.__native.emit(name, json)`.
 */
class WebBridge(private val activity: MainActivity, private val web: WebView) {

    private val jobs = mutableListOf<Job>()
    private var dataJobs = mutableListOf<Job>()
    private var pageReady = false
    private val pending = ArrayList<String>()

    // ---------------------------------------------------------------- JS -> native

    @JavascriptInterface
    fun call(id: String, method: String, args: String) {
        Graph.scope.launch {
            val result = runCatching {
                val a = runCatching { AppJson.parseToJsonElement(args.ifBlank { "{}" }).jsonObject }.getOrDefault(JsonObject(emptyMap()))
                handle(method, a)
            }
            result.fold(
                onSuccess = { reply(id, true, it) },
                onFailure = { reply(id, false, JsonPrimitive(it.message ?: "Something went wrong")) },
            )
        }
    }

    /** Called by the page once its script has loaded. */
    @JavascriptInterface
    fun ready() {
        Graph.scope.launch {
            pageReady = true
            pending.forEach { web.evaluateJavascript(it, null) }
            pending.clear()
            emitState()
            emitAllData()
        }
    }

    // ---------------------------------------------------------------- native -> JS

    private fun js(code: String) {
        if (!pageReady) {
            pending += code
            return
        }
        web.evaluateJavascript(code, null)
    }

    private fun reply(id: String, ok: Boolean, value: JsonElement) {
        js("window.__native&&window.__native.reply(${JSONObject.quote(id)},$ok,JSON.parse(${JSONObject.quote(value.toString())}))")
    }

    fun emit(name: String, json: String) {
        js("window.__native&&window.__native.emit(${JSONObject.quote(name)},JSON.parse(${JSONObject.quote(json)}))")
    }

    // ---------------------------------------------------------------- observing state

    fun start() {
        val flows: List<Flow<Any?>> = listOf(
            Graph.repoFlow, Graph.session.user, Graph.lock.locked, Graph.lock.biometricEnabled, Graph.lock.lockDelay,
            Graph.lock.secureScreen, Graph.settings.currency, Graph.settings.theme, Graph.settings.autoUpdate,
            Graph.sync.state, Graph.inviteCount, Updater.available, Updater.download,
        )
        jobs += Graph.scope.launch { merge(*flows.map { f -> f.map { } }.toTypedArray()).collect { emitState() } }
        jobs += Graph.scope.launch {
            Graph.repoFlow.collect { repo ->
                dataJobs.forEach { it.cancel() }
                dataJobs = mutableListOf()
                if (repo == null) return@collect
                repo.allCollections.filterKeys { it != "receipt" }.forEach { (type, col) ->
                    dataJobs += Graph.scope.launch { col.flow.collect { emitTable(type) } }
                }
                dataJobs += Graph.scope.launch { repo.spaces.collect { emit("spaces", repo.spacesJson()) } }
            }
        }
    }

    fun stop() {
        jobs.forEach { it.cancel() }
        dataJobs.forEach { it.cancel() }
    }

    private fun emitTable(type: String) {
        val col = Graph.repoOrNull?.collection(type) ?: return
        emit("table", "{\"type\":${JSONObject.quote(type)},\"items\":${col.listJson()}}")
    }

    private fun emitAllData() {
        val repo = Graph.repoOrNull ?: return
        repo.allCollections.keys.filter { it != "receipt" }.forEach(::emitTable)
        emit("spaces", repo.spacesJson())
    }

    fun emitState() {
        val user = Graph.session.user.value
        val sync = Graph.sync.state.value
        val lock = Graph.lock
        val release = Updater.available.value
        val state = buildJsonObject {
            put("signedIn", Graph.repoOrNull != null)
            put("locked", Graph.repoOrNull != null && lock.locked.value)
            put("user", user?.let { AppJson.encodeToJsonElement(UserInfo.serializer(), it) } ?: JsonNull)
            put("version", Updater.currentVersion)
            put("systemDark", activity.systemDark)
            put("invites", Graph.inviteCount.value)
            put("settings", buildJsonObject {
                put("currency", Graph.settings.currency.value)
                put("theme", Graph.settings.theme.value)
                put("autoUpdate", Graph.settings.autoUpdate.value)
            })
            put("lock", buildJsonObject {
                put("pinEnabled", lock.pinEnabled)
                put("pinLength", lock.pinLength)
                put("biometric", lock.biometricEnabled.value)
                put("biometricAvailable", biometricAvailable())
                put("delay", lock.lockDelay.value)
                put("secureScreen", lock.secureScreen.value)
            })
            put("sync", buildJsonObject {
                put("syncing", sync.syncing)
                put("lastSync", sync.lastSync)
                put("apiVersion", sync.apiVersion)
                put("error", sync.error?.let { JsonPrimitive(it) } ?: JsonNull)
            })
            put("release", release?.let {
                buildJsonObject {
                    put("version", it.version); put("notes", it.notes); put("size", it.size)
                }
            } ?: JsonNull)
            put("download", when (val d = Updater.download.value) {
                is DownloadState.Downloading -> buildJsonObject { put("state", "downloading"); put("progress", d.progress) }
                is DownloadState.Failed -> buildJsonObject { put("state", "failed"); put("message", d.message) }
                DownloadState.ReadyToInstall -> buildJsonObject { put("state", "ready"); put("canInstall", Updater.canInstall(activity)) }
                DownloadState.Idle -> buildJsonObject { put("state", "idle") }
            })
        }
        emit("state", state.toString())
    }

    fun emitInsets(top: Float, bottom: Float, keyboard: Float) {
        emit("insets", "{\"top\":$top,\"bottom\":$bottom,\"keyboard\":$keyboard}")
    }

    // ---------------------------------------------------------------- methods

    private val ok: JsonElement = JsonPrimitive(true)
    private fun token() = Graph.session.token ?: error("You are signed out")

    private suspend fun handle(method: String, a: JsonObject): JsonElement { return when (method) {
        // ---- data
        "data.save" -> {
            val type = a.str("type")
            val col = Graph.repo.collection(type) ?: error("Unknown type $type")
            val item = col.saveJson(a["item"].toString())
            when (item) {
                is TaskItem -> Reminders.schedule(activity, item)
                is CalEvent -> Reminders.schedule(activity, item)
                is Rental -> Reminders.schedule(activity, item)
                is JsonObject -> if (type == "invoice") Reminders.scheduleInvoice(activity, item)
            }
            ok
        }
        "data.delete" -> {
            val type = a.str("type")
            val id = a.str("id")
            Graph.repo.collection(type)?.delete(id)
            if (type == "task" || type == "event") Reminders.cancel(activity, "${type}_$id")
            if (type == "rental") Reminders.cancelRental(activity, id)
            if (type == "invoice") Reminders.cancel(activity, "invoice_$id")
            ok
        }

        // ---- account
        "auth.login" -> {
            Graph.onSignedIn(Graph.api.login(a.str("login"), a.str("password"))); ok
        }
        "auth.register" -> {
            Graph.onSignedIn(Graph.api.register(a.str("username"), a.str("name"), a.str("email"), a.str("password"))); ok
        }
        "auth.usernameAvailable" -> {
            val r = Graph.api.usernameAvailable(a.str("username"))
            buildJsonObject { put("available", r.available); put("reason", r.reason?.let { JsonPrimitive(it) } ?: JsonNull) }
        }
        "auth.hasUnsynced" -> JsonPrimitive(Graph.repoOrNull?.hasUnsynced() == true)
        "auth.signOut" -> {
            runCatching { Graph.sync.syncNow() }
            Graph.signOut(); ok
        }
        "auth.changePassword" -> {
            Graph.api.changePassword(token(), a.str("old"), a.str("new")); ok
        }
        "auth.deleteAccount" -> {
            Graph.api.deleteAccount(token(), a.str("password")); Graph.forceSignOut(); ok
        }

        // ---- profile
        "profile.update" -> {
            val u = Graph.api.updateProfile(
                token(),
                ProfileUpdate(name = a.strOrNull("name"), username = a.strOrNull("username"), bio = a.strOrNull("bio"), github = a.strOrNull("github")),
            )
            Graph.session.updateUser(u); ok
        }
        "profile.pickPhoto" -> {
            Graph.lock.suppressNextLock()
            val uri = activity.pickImage() ?: return JsonPrimitive(false)
            val jpeg = Avatars.prepareFromUri(activity, uri) ?: error("Couldn't read that image")
            Avatars.upload(activity, jpeg); JsonPrimitive(true)
        }
        "profile.deletePhoto" -> {
            Graph.session.updateUser(Graph.api.deleteAvatar(token())); ok
        }
        "profile.githubPhoto" -> {
            val p = Github.profile(a.str("login")) ?: error("GitHub profile not found")
            val jpeg = Github.avatarBytes(p)?.let(Avatars::prepare) ?: error("Couldn't load the GitHub photo")
            Avatars.upload(activity, jpeg); ok
        }
        "github.profile" -> {
            val p = Github.profile(a.str("login"))
            if (p == null) JsonNull else buildJsonObject {
                put("login", p.login); put("name", p.name); put("bio", p.bio); put("avatarUrl", p.avatarUrl)
                put("publicRepos", p.publicRepos); put("followers", p.followers); put("htmlUrl", p.htmlUrl)
            }
        }
        "avatar" -> {
            val bytes = Avatars.load(activity, a.str("userId"), a.int("rev"))
            if (bytes == null) JsonNull else JsonPrimitive("data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
        }

        // ---- settings and lock
        "settings.set" -> {
            a.strOrNull("currency")?.let { if (it.isNotBlank()) Graph.settings.setCurrency(it) }
            if (Graph.settings.setWidgetPrefs(a.boolOrNull("hideAmounts"), a.strOrNull("lang")?.takeIf { it == "en" || it == "ar" })) {
                com.carrotnote.app.widget.Widgets.refresh(activity)
            }
            a.intOrNull("theme")?.let { Graph.settings.setTheme(it) }
            a.boolOrNull("autoUpdate")?.let {
                Graph.settings.setAutoUpdate(it)
                if (it) UpdateWorker.schedule(activity) else UpdateWorker.cancel(activity)
            }
            ok
        }
        "lock.verify" -> {
            val lock = Graph.lock
            val good = lock.verify(a.str("pin"))
            if (good) lock.unlock()
            buildJsonObject { put("ok", good); put("cooldown", lock.cooldownRemaining()) }
        }
        "lock.cooldown" -> JsonPrimitive(Graph.lock.cooldownRemaining())
        "lock.biometric" -> {
            val good = biometricPrompt(a.strOrNull("title") ?: "Unlock Carrot Note")
            if (good && a.boolOrNull("unlock") == true) Graph.lock.unlock()
            JsonPrimitive(good)
        }
        "lock.setPin" -> { Graph.lock.setPin(a.str("pin")); emitState(); ok }
        "lock.disable" -> { Graph.lock.disable(); emitState(); ok }
        "lock.setBiometric" -> {
            val on = a.bool("on")
            if (on && !biometricPrompt("Turn on fingerprint unlock")) return JsonPrimitive(false)
            Graph.lock.setBiometric(on); JsonPrimitive(true)
        }
        "lock.setDelay" -> { Graph.lock.setLockDelay(a.int("seconds")); ok }
        "lock.setSecure" -> { Graph.lock.setSecureScreen(a.bool("on")); ok }
        "lock.now" -> { Graph.lock.lockNow(); ok }

        // ---- sync, team, invitations
        "sync.now" -> JsonPrimitive(Graph.sync.syncNow())
        "team.search" -> {
            val users = Graph.api.searchUsers(token(), a.str("query"))
            AppJson.encodeToJsonElement(ListSerializer(PublicUser.serializer()), users)
        }
        "team.invite" -> {
            Graph.sync.syncNow() // make sure the project exists on the server
            Graph.api.invite(token(), a.str("projectId"), a.str("username"))
            Graph.sync.syncNow(); ok
        }
        "team.remove" -> { Graph.api.removeMember(token(), a.str("spaceId"), a.str("userId")); Graph.sync.syncNow(); ok }
        "team.leave" -> { Graph.api.leaveSpace(token(), a.str("spaceId")); Graph.sync.syncNow(); ok }
        "invites.list" -> {
            val list = Graph.api.invites(token())
            Graph.setInviteCount(list.size)
            AppJson.encodeToJsonElement(ListSerializer(Invite.serializer()), list)
        }
        "invites.answer" -> {
            Graph.api.answerInvite(token(), a.str("id"), a.bool("accept"))
            Graph.sync.syncNow(); ok
        }

        // ---- timer, invoice, export
        "timer.start" -> { TimeTracker.start(activity, a.strOrNull("projectId"), a.strOrNull("note").orEmpty()); ok }
        "timer.stop" -> { TimeTracker.stop(activity); ok }
        "invoice.share" -> {
            val p = Graph.repo.projects.get(a.str("projectId")) ?: error("Project not found")
            withContext(Dispatchers.IO) { Invoice.create(activity, p) }
            Invoice.share(activity, p); ok
        }
        "money.exportCsv" -> { exportCsv(); ok }
        "pdf.share" -> {
            val doc = a["doc"]?.jsonObject ?: error("Nothing to export")
            val file = withContext(Dispatchers.IO) { PdfReport.create(activity, doc) }
            PdfReport.share(activity, file, doc["title"]?.jsonPrimitive?.contentOrNull ?: "Carrot Note"); ok
        }
        "backup.import" -> importBackup(a.boolOrNull("confirmOnly") == true)

        // ---- receipts (photos are kept as their own records and loaded on demand)
        "receipt.capture" -> captureReceipt(a.strOrNull("source") ?: "camera")
        "receipt.get" -> Graph.repo.receipts.get(a.str("id")) ?: JsonNull

        // ---- uptime checks for rentals
        "uptime.status" -> AppJson.encodeToJsonElement(
            kotlinx.serialization.builtins.MapSerializer(String.serializer(), UptimeResult.serializer()),
            Uptime.results(activity),
        )
        "uptime.check" -> {
            val r = Graph.repo.rentals.get(a.str("id")) ?: error("Rental not found")
            val result = withContext(Dispatchers.IO) { Uptime.check(activity, r) }
            AppJson.encodeToJsonElement(UptimeResult.serializer(), result)
        }
        "uptime.probe" -> AppJson.encodeToJsonElement(UptimeResult.serializer(), withContext(Dispatchers.IO) { Uptime.probe(a.str("target")) })

        // ---- password vault: the key can be kept on this phone behind the fingerprint
        "vault.hasKey" -> JsonPrimitive(vaultPrefs().contains(vaultKeyName()))
        "vault.saveKey" -> { vaultPrefs().edit().putString(vaultKeyName(), a.str("key")).apply(); ok }
        "vault.clearKey" -> { vaultPrefs().edit().remove(vaultKeyName()).apply(); ok }
        "vault.loadKey" -> {
            val key = vaultPrefs().getString(vaultKeyName(), null) ?: return JsonNull
            if (biometricAvailable() && !biometricPrompt("Unlock your vault")) JsonNull else JsonPrimitive(key)
        }
        "backup.export" -> { exportBackup(); ok }

        // ---- free public web APIs (holidays, exchange rates, GitHub)
        "net.get" -> {
            val url = a.str("url")
            require(allowedHosts.any { url.startsWith(it) }) { "That address is not allowed" }
            withContext(Dispatchers.IO) { AppJson.parseToJsonElement(httpGet(url)) }
        }
        "contacts.birthdays" -> {
            val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            if (!granted && !(a.boolOrNull("ask") == true && activity.ensurePermission(Manifest.permission.READ_CONTACTS))) JsonNull
            else withContext(Dispatchers.IO) { readBirthdays() }
        }

        // ---- phone
        "contacts.all" -> {
            if (!activity.ensurePermission(Manifest.permission.READ_CONTACTS)) JsonNull
            else withContext(Dispatchers.IO) { readContacts() }
        }
        "notifications.request" -> {
            JsonPrimitive(Build.VERSION.SDK_INT < 33 || activity.ensurePermission(Manifest.permission.POST_NOTIFICATIONS))
        }
        "notifications.granted" -> JsonPrimitive(
            Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
        )
        "app.started" -> {
            // Once per launch after sign-in/unlock: notification permission + update check.
            if (!started) {
                started = true
                if (Build.VERSION.SDK_INT >= 33) activity.ensurePermission(Manifest.permission.POST_NOTIFICATIONS)
                if (Graph.settings.autoUpdate.value) runCatching { Updater.check(manual = false) }
            }
            ok
        }
        "app.openUrl" -> {
            val url = a.str("url")
            open(Intent(Intent.ACTION_VIEW, Uri.parse(if (url.startsWith("http")) url else "https://$url"))); ok
        }
        "app.dial" -> { open(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(a.str("phone"))))); ok }
        "app.whatsapp" -> {
            val digits = a.strOrNull("phone").orEmpty().filter { it.isDigit() }
            val text = a.strOrNull("text")?.let { "?text=" + Uri.encode(it) }.orEmpty()
            open(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits$text"))); ok
        }
        "app.email" -> { open(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + a.str("to")))); ok }
        "app.share" -> {
            open(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, a.strOrNull("subject").orEmpty())
                        .putExtra(Intent.EXTRA_TEXT, a.str("text")),
                    "Share",
                ),
            ); ok
        }
        "app.copy" -> {
            ContextCompat.getSystemService(activity, ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Carrot Note", a.str("text")))
            toast(a.strOrNull("toast") ?: "Copied"); ok
        }
        "app.toast" -> { toast(a.str("text")); ok }
        "app.systemBars" -> { activity.applySystemBars(a.bool("dark")); ok }
        "app.exit" -> { activity.moveTaskToBack(true); ok }

        // ---- updates
        "update.check" -> {
            val r = Updater.check(manual = a.boolOrNull("manual") ?: true)
            if (r == null) JsonNull else JsonPrimitive(r.version)
        }
        "update.download" -> {
            val r = Updater.available.value ?: error("No update to download")
            Updater.downloadAndInstall(activity, r); ok
        }
        "update.install" -> { Updater.install(activity); ok }
        "update.later" -> { Updater.later(); ok }

        else -> error("Unknown method $method")
    } }

    private var started = false

    private val allowedHosts = listOf("https://date.nager.at/", "https://open.er-api.com/", "https://api.github.com/", "https://rdap.org/")

    private fun vaultPrefs() = activity.getSharedPreferences("vault", android.content.Context.MODE_PRIVATE)
    private fun vaultKeyName() = "key_" + (Graph.session.user.value?.id ?: "none")

    /** Takes or picks a receipt photo and returns it as a small JPEG data URL (or null). */
    private suspend fun captureReceipt(source: String): JsonElement {
        val uri: Uri = if (source == "gallery") {
            Graph.lock.suppressNextLock()
            activity.pickImage() ?: return JsonNull
        } else {
            val dir = File(activity.cacheDir, "photos").apply { mkdirs() }
            val file = File(dir, "receipt.jpg").apply { delete() }
            val target = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
            if (!activity.takePhoto(target)) return JsonNull
            target
        }
        val jpeg = withContext(Dispatchers.IO) { shrinkPhoto(uri, 1400, 72) } ?: error("Couldn't read that photo")
        return JsonPrimitive("data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP))
    }

    private fun shrinkPhoto(uri: Uri, maxSide: Int, quality: Int): ByteArray? = runCatching {
        val cr = activity.contentResolver
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        val raw = cr.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: return@runCatching null
        // Turn it upright using the photo's EXIF orientation.
        val rotation = cr.openInputStream(uri)?.use {
            when (androidx.exifinterface.media.ExifInterface(it).getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 1)) {
                6 -> 90f; 3 -> 180f; 8 -> 270f; else -> 0f
            }
        } ?: 0f
        val scale = minOf(1f, maxSide.toFloat() / maxOf(raw.width, raw.height))
        val m = android.graphics.Matrix().apply { postScale(scale, scale); postRotate(rotation) }
        val bmp = android.graphics.Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
        java.io.ByteArrayOutputStream().use { out -> bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, out); out.toByteArray() }
    }.getOrNull()

    /**
     * Restores a backup file made with "Full backup": every record in it is saved again (records
     * with the same id are replaced). Returns how many records of each type were restored.
     */
    private suspend fun importBackup(@Suppress("UNUSED_PARAMETER") confirmOnly: Boolean): JsonElement {
        val uri = activity.pickDocument(arrayOf("application/json", "text/plain", "application/octet-stream")) ?: return JsonNull
        val text = withContext(Dispatchers.IO) { activity.contentResolver.openInputStream(uri)?.use { it.bufferedReader().readText() } }
            ?: error("Couldn't read that file")
        val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: error("That isn't a Carrot Note backup")
        val data = root["data"] as? JsonObject ?: error("That isn't a Carrot Note backup")
        val repo = Graph.repo
        val counts = buildJsonObject {
            data.forEach { (type, items) ->
                val col = repo.collection(type) ?: return@forEach
                var n = 0
                (items as? JsonArray)?.forEach { item -> if (runCatching { col.saveJson(item.toString()) }.isSuccess) n++ }
                if (n > 0) put(type, n)
            }
        }
        Reminders.rescheduleAll(activity, repo)
        Graph.sync.requestSync()
        return counts
    }

    private fun httpGet(url: String): String {
        val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "CarrotNote/${com.carrotnote.app.BuildConfig.VERSION_NAME}")
        }
        try {
            val code = conn.responseCode
            if (code == 404) error("Not found")
            if (code == 204) return "null"
            if (code !in 200..299) error("The service answered $code. Try again later.")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } catch (e: java.io.IOException) {
            error("Can't reach the internet. Check your connection.")
        } finally {
            conn.disconnect()
        }
    }

    /** Birthdays saved on phone contacts, as month/day (and year when known). */
    private fun readBirthdays(): JsonArray {
        val names = HashMap<Long, String>()
        activity.contentResolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
            null, null, null,
        )?.use { c -> while (c.moveToNext()) names[c.getLong(0)] = c.getString(1).orEmpty() }
        return buildJsonArray {
            activity.contentResolver.query(
                ContactsContract.Data.CONTENT_URI,
                arrayOf(ContactsContract.Data.CONTACT_ID, ContactsContract.CommonDataKinds.Event.START_DATE),
                ContactsContract.Data.MIMETYPE + " = ? AND " + ContactsContract.CommonDataKinds.Event.TYPE + " = ?",
                arrayOf(ContactsContract.CommonDataKinds.Event.CONTENT_ITEM_TYPE, ContactsContract.CommonDataKinds.Event.TYPE_BIRTHDAY.toString()),
                null,
            )?.use { c ->
                // Dates look like "1990-05-14" or "--05-14" (no year).
                val re = Regex("""^(\d{4}|-)?-?(\d{2})-(\d{2})""")
                while (c.moveToNext()) {
                    val name = names[c.getLong(0)]?.takeIf { it.isNotBlank() } ?: continue
                    val m = re.find(c.getString(1).orEmpty().trim()) ?: continue
                    add(buildJsonObject {
                        put("name", name)
                        put("month", m.groupValues[2].toInt())
                        put("day", m.groupValues[3].toInt())
                        m.groupValues[1].toIntOrNull()?.let { put("year", it) }
                    })
                }
            }
        }
    }

    /** Every record as one JSON file, shared through the share sheet. */
    private suspend fun exportBackup() {
        val repo = Graph.repo
        val file = withContext(Dispatchers.IO) {
            val body = repo.allCollections.entries.joinToString(",", "{", "}") { (type, col) -> "\"$type\":${col.listJson()}" }
            val dir = File(activity.cacheDir, "exports").apply { mkdirs() }
            File(dir, "carrot-note-backup-${LocalDate.now()}.json").apply {
                writeText("{\"app\":\"Carrot Note\",\"version\":\"${Updater.currentVersion}\",\"exportedAt\":${System.currentTimeMillis()},\"data\":$body}")
            }
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        open(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                "Save backup",
            ),
        )
    }

    private fun open(intent: Intent) {
        try {
            Graph.lock.suppressNextLock()
            activity.startActivity(intent)
        } catch (e: Exception) {
            toast("No app found to do that")
        }
    }

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()

    // ---------------------------------------------------------------- biometrics

    private fun biometricAvailable(): Boolean =
        BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS

    private suspend fun biometricPrompt(title: String): Boolean = suspendCancellableCoroutine { cont ->
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (cont.isActive) cont.resume(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (cont.isActive) cont.resume(false)
                }
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .build(),
        )
    }

    // ---------------------------------------------------------------- contacts

    /** Every contact on the phone with its numbers, emails and company. */
    private fun readContacts(): JsonArray {
        data class Row(val id: Long, val name: String, val phones: LinkedHashSet<String> = LinkedHashSet(), val emails: LinkedHashSet<String> = LinkedHashSet(), var company: String = "")
        val cr = activity.contentResolver
        val rows = LinkedHashMap<Long, Row>()
        cr.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
            null, null, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY + " COLLATE NOCASE ASC",
        )?.use { c ->
            while (c.moveToNext()) {
                val name = c.getString(1)?.trim().orEmpty()
                if (name.isNotEmpty()) rows[c.getLong(0)] = Row(c.getLong(0), name)
            }
        }
        cr.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.NUMBER),
            null, null, null,
        )?.use { c ->
            val seen = HashMap<Long, HashSet<String>>()
            while (c.moveToNext()) {
                val row = rows[c.getLong(0)] ?: continue
                val number = c.getString(1)?.trim().orEmpty()
                val key = number.filter { it.isDigit() }.takeLast(9)
                if (number.isNotEmpty() && seen.getOrPut(row.id) { HashSet() }.add(key)) row.phones += number
            }
        }
        cr.query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Email.CONTACT_ID, ContactsContract.CommonDataKinds.Email.ADDRESS),
            null, null, null,
        )?.use { c ->
            while (c.moveToNext()) {
                val email = c.getString(1)?.trim().orEmpty()
                if (email.isNotEmpty()) rows[c.getLong(0)]?.emails?.add(email)
            }
        }
        cr.query(
            ContactsContract.Data.CONTENT_URI,
            arrayOf(ContactsContract.Data.CONTACT_ID, ContactsContract.CommonDataKinds.Organization.COMPANY),
            ContactsContract.Data.MIMETYPE + " = ?",
            arrayOf(ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE),
            null,
        )?.use { c ->
            while (c.moveToNext()) {
                val company = c.getString(1)?.trim().orEmpty()
                if (company.isNotEmpty()) rows[c.getLong(0)]?.let { if (it.company.isEmpty()) it.company = company }
            }
        }
        return buildJsonArray {
            rows.values.forEach { r ->
                add(buildJsonObject {
                    put("id", r.id.toString())
                    put("name", r.name)
                    putJsonArray("phones") { r.phones.forEach { add(JsonPrimitive(it)) } }
                    putJsonArray("emails") { r.emails.forEach { add(JsonPrimitive(it)) } }
                    put("company", r.company)
                })
            }
        }
    }

    // ---------------------------------------------------------------- CSV

    private fun csv(s: String) = "\"" + s.replace("\"", "\"\"") + "\""

    private suspend fun exportCsv() {
        val repo = Graph.repo
        val file = withContext(Dispatchers.IO) {
            val sb = StringBuilder("Date,Type,Amount,Currency,Category,Method,Note,Project,Customer\n")
            repo.txns.value.sortedBy { it.date }.forEach { t ->
                sb.append(LocalDate.ofEpochDay(t.date)).append(',')
                    .append(t.kind).append(',')
                    .append(t.amount).append(',')
                    .append(csv(t.currency)).append(',')
                    .append(csv(t.category)).append(',')
                    .append(csv(t.method)).append(',')
                    .append(csv(t.note)).append(',')
                    .append(csv(repo.projects.get(t.projectId)?.name.orEmpty())).append(',')
                    .append(csv(repo.customers.get(t.customerId)?.name.orEmpty())).append('\n')
            }
            val dir = File(activity.cacheDir, "exports").apply { mkdirs() }
            File(dir, "carrot-note-transactions-${LocalDate.now()}.csv").apply { writeText(sb.toString()) }
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        open(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                "Export transactions",
            ),
        )
    }
}

private fun JsonObject.prim(key: String): JsonPrimitive? = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }
private fun JsonObject.str(key: String): String = prim(key)?.contentOrNull ?: error("Missing $key")
private fun JsonObject.strOrNull(key: String): String? = prim(key)?.contentOrNull
private fun JsonObject.int(key: String): Int = prim(key)?.intOrNull ?: prim(key)?.doubleOrNull?.toInt() ?: error("Missing $key")
private fun JsonObject.intOrNull(key: String): Int? = prim(key)?.intOrNull ?: prim(key)?.doubleOrNull?.toInt()
private fun JsonObject.bool(key: String): Boolean = prim(key)?.booleanOrNull ?: error("Missing $key")
private fun JsonObject.boolOrNull(key: String): Boolean? = prim(key)?.booleanOrNull
