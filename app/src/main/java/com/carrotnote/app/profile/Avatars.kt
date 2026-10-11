package com.carrotnote.app.profile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.carrotnote.app.BuildConfig
import com.carrotnote.app.Graph
import com.carrotnote.app.data.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Loads, caches and prepares profile pictures. */
object Avatars {
    private const val SIZE = 320
    private val memory = LruCache<String, ImageBitmap>(48)

    private fun dir(context: Context) = File(context.cacheDir, "avatars").apply { mkdirs() }
    private fun file(context: Context, userId: String, rev: Int) = File(dir(context), "${userId.filter { it.isLetterOrDigit() }}_$rev.jpg")

    suspend fun load(context: Context, userId: String, rev: Int): ImageBitmap? {
        if (rev <= 0) return null
        val key = "$userId:$rev"
        memory.get(key)?.let { return it }
        return withContext(Dispatchers.IO) {
            val f = file(context, userId, rev)
            val bytes = if (f.exists()) f.readBytes() else {
                val token = Graph.session.token ?: return@withContext null
                val b = Graph.api.avatar(token, userId) ?: return@withContext null
                dir(context).listFiles()?.filter { it.name.startsWith(userId.filter { c -> c.isLetterOrDigit() } + "_") }?.forEach { it.delete() }
                f.writeBytes(b)
                b
            }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { memory.put(key, it) }
        }
    }

    /** Remembers an uploaded photo locally so it shows instantly without a download. */
    fun remember(context: Context, userId: String, rev: Int, jpeg: ByteArray) {
        runCatching { file(context, userId, rev).writeBytes(jpeg) }
        BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)?.let { memory.put("$userId:$rev", it.asImageBitmap()) }
    }

    /** Center-crops and shrinks an image to a small square JPEG. */
    fun prepare(bytes: ByteArray): ByteArray? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIZE) sample *= 2
        val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val side = minOf(src.width, src.height)
        val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, SIZE, SIZE, true)
        return ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }

    suspend fun prepareFromUri(context: Context, uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
        runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()?.let(::prepare)
    }

    fun base64(jpeg: ByteArray): String = Base64.encodeToString(jpeg, Base64.NO_WRAP)

    /** Uploads [jpeg] as the signed-in user's photo and updates the session. */
    suspend fun upload(context: Context, jpeg: ByteArray) {
        val token = Graph.session.token ?: return
        val user = Graph.api.uploadAvatar(token, base64(jpeg))
        remember(context, user.id, user.avatarRev, jpeg)
        Graph.session.updateUser(user)
    }
}

data class GithubProfile(
    val login: String,
    val name: String,
    val bio: String,
    val avatarUrl: String,
    val publicRepos: Int,
    val followers: Int,
    val htmlUrl: String,
)

/** Reads public GitHub profiles (no sign-in needed). */
object Github {
    private fun get(url: String): HttpURLConnection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 20_000
        setRequestProperty("Accept", "application/vnd.github+json")
        setRequestProperty("User-Agent", "CarrotNote/${BuildConfig.VERSION_NAME}")
    }

    suspend fun profile(username: String): GithubProfile? = withContext(Dispatchers.IO) {
        val name = username.trim().removePrefix("@").substringAfterLast("github.com/").trim('/')
        if (!name.matches(Regex("[A-Za-z0-9-]{1,39}"))) return@withContext null
        val conn = get("https://api.github.com/users/$name")
        try {
            if (conn.responseCode != 200) return@withContext null
            val o = AppJson.parseToJsonElement(conn.inputStream.bufferedReader().use { it.readText() }) as JsonObject
            fun s(k: String) = o[k]?.jsonPrimitive?.contentOrNull.orEmpty()
            GithubProfile(
                login = s("login"), name = s("name"), bio = s("bio"), avatarUrl = s("avatar_url"),
                publicRepos = o["public_repos"]?.jsonPrimitive?.intOrNull ?: 0,
                followers = o["followers"]?.jsonPrimitive?.intOrNull ?: 0,
                htmlUrl = s("html_url"),
            )
        } catch (e: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    suspend fun avatarBytes(profile: GithubProfile): ByteArray? = withContext(Dispatchers.IO) {
        val url = profile.avatarUrl + (if ('?' in profile.avatarUrl) "&" else "?") + "s=400"
        val conn = get(url).apply { instanceFollowRedirects = true }
        try {
            if (conn.responseCode != 200) null else conn.inputStream.use { it.readBytes() }
        } catch (e: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }
}
