package com.carrotnote.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(val status: Int, message: String) : Exception(message)

@Serializable
data class AuthResponse(val token: String, val user: UserInfo)

@Serializable
data class SyncRequest(val cursors: Map<String, Long>, val changes: List<SyncRecord>)

@Serializable
data class SyncResponse(
    val cursors: Map<String, Long> = emptyMap(),
    val changes: List<SyncRecord> = emptyList(),
    val spaces: List<SpaceInfo> = emptyList(),
    val invites: Int = 0,
    val user: UserInfo? = null,
    /** 3 and up: the server shares rentals and invoices of shared projects. 0 = an older server. */
    val apiVersion: Int = 0,
    /** Chat messages waiting on the server for this user. */
    val chatPending: Int = 0,
    /** How many follow this user, and the newest few. */
    val followers: FollowSummary? = null,
)

@Serializable
data class FollowSummary(val count: Int = 0, val latest: List<Follower> = emptyList())

@Serializable
data class Follower(val id: String, val username: String = "", val name: String = "", val avatarRev: Int = 0, val at: Long = 0)

@Serializable
data class PublicUser(val id: String, val username: String = "", val name: String = "", val avatarRev: Int = 0)

@Serializable
data class Invite(
    val id: String,
    val spaceId: String,
    val projectName: String = "",
    val createdAt: Long = 0,
    val from: PublicUser,
)

@Serializable
data class UsernameCheck(val available: Boolean, val reason: String? = null)

@Serializable
private data class Register(val username: String, val name: String, val email: String, val password: String)

@Serializable
private data class Login(val login: String, val password: String)

@Serializable
data class ProfileUpdate(
    val name: String? = null,
    val username: String? = null,
    val bio: String? = null,
    val github: String? = null,
)

@Serializable
private data class PasswordChange(val oldPassword: String, val newPassword: String)

@Serializable
private data class PasswordOnly(val password: String)

@Serializable
private data class UsernameOnly(val username: String)

@Serializable
private data class UserIdOnly(val userId: String)

@Serializable
private data class AvatarUpload(val image: String)

@Serializable
private data class UserResponse(val user: UserInfo)

@Serializable
private data class UsersResponse(val users: List<PublicUser> = emptyList())

@Serializable
private data class InvitesResponse(val invites: List<Invite> = emptyList())

/** Talks to the Carrot Note Cloudflare Worker (which stores data in D1). */
class ApiClient(private val baseUrl: String) {

    suspend fun register(username: String, name: String, email: String, password: String): AuthResponse =
        decode(AuthResponse.serializer(), request("POST", "/api/register", AppJson.encodeToString(Register.serializer(), Register(username, name, email, password))))

    suspend fun login(login: String, password: String): AuthResponse =
        decode(AuthResponse.serializer(), request("POST", "/api/login", AppJson.encodeToString(Login.serializer(), Login(login, password))))

    suspend fun usernameAvailable(username: String): UsernameCheck =
        decode(UsernameCheck.serializer(), request("GET", "/api/username/" + enc(username), null))

    suspend fun logout(token: String) {
        request("POST", "/api/logout", "{}", token)
    }

    suspend fun sync(token: String, req: SyncRequest): SyncResponse =
        decode(SyncResponse.serializer(), request("POST", "/api/sync", AppJson.encodeToString(SyncRequest.serializer(), req), token))

    suspend fun updateProfile(token: String, update: ProfileUpdate): UserInfo =
        decode(UserResponse.serializer(), request("POST", "/api/profile", AppJson.encodeToString(ProfileUpdate.serializer(), update), token)).user

    suspend fun uploadAvatar(token: String, base64Jpeg: String): UserInfo =
        decode(UserResponse.serializer(), request("PUT", "/api/profile/avatar", AppJson.encodeToString(AvatarUpload.serializer(), AvatarUpload(base64Jpeg)), token)).user

    suspend fun deleteAvatar(token: String): UserInfo =
        decode(UserResponse.serializer(), request("DELETE", "/api/profile/avatar", null, token)).user

    suspend fun avatar(token: String, userId: String): ByteArray? = withContext(Dispatchers.IO) {
        val conn = open("GET", "/api/users/" + enc(userId) + "/avatar", token)
        try {
            if (conn.responseCode != 200) null else conn.inputStream.use { it.readBytes() }
        } catch (e: IOException) {
            null
        } finally {
            conn.disconnect()
        }
    }

    suspend fun searchUsers(token: String, query: String): List<PublicUser> =
        decode(UsersResponse.serializer(), request("GET", "/api/users/search?q=" + enc(query), null, token)).users

    suspend fun invite(token: String, projectId: String, username: String) {
        request("POST", "/api/projects/" + enc(projectId) + "/invite", AppJson.encodeToString(UsernameOnly.serializer(), UsernameOnly(username)), token)
    }

    suspend fun invites(token: String): List<Invite> =
        decode(InvitesResponse.serializer(), request("GET", "/api/invites", null, token)).invites

    suspend fun answerInvite(token: String, inviteId: String, accept: Boolean) {
        request("POST", "/api/invites/" + enc(inviteId) + (if (accept) "/accept" else "/decline"), "{}", token)
    }

    suspend fun leaveSpace(token: String, spaceId: String) {
        request("POST", "/api/spaces/" + enc(spaceId) + "/leave", "{}", token)
    }

    suspend fun removeMember(token: String, spaceId: String, userId: String) {
        request("POST", "/api/spaces/" + enc(spaceId) + "/remove", AppJson.encodeToString(UserIdOnly.serializer(), UserIdOnly(userId)), token)
    }

    suspend fun changePassword(token: String, old: String, new: String) {
        request("POST", "/api/password", AppJson.encodeToString(PasswordChange.serializer(), PasswordChange(old, new)), token)
    }

    suspend fun deleteAccount(token: String, password: String) {
        request("POST", "/api/account/delete", AppJson.encodeToString(PasswordOnly.serializer(), PasswordOnly(password)), token)
    }

    /** A JSON request for features the app drives directly (client links, chat). Returns the response body. */
    suspend fun raw(method: String, path: String, body: String?, token: String): String = request(method, path, body, token)

    /** Forgot password: emails a code (the answer never says whether the account exists). */
    suspend fun forgotPassword(login: String, lang: String): String =
        request("POST", "/api/password/forgot", buildJsonObject { put("login", login); put("lang", lang) }.toString())

    /** Forgot password, step two: the code and a new password sign you in. */
    suspend fun resetPassword(login: String, code: String, password: String, lang: String): AuthResponse =
        decode(AuthResponse.serializer(), request("POST", "/api/password/reset", buildJsonObject {
            put("login", login); put("code", code); put("password", password); put("lang", lang)
        }.toString()))

    /** What this server can do for "forgot" ({"email": true} when it can send codes). */
    suspend fun recovery(): String = request("GET", "/api/recovery", null)

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    private fun <T> decode(serializer: kotlinx.serialization.KSerializer<T>, text: String): T = AppJson.decodeFromString(serializer, text)

    private fun open(method: String, path: String, token: String?): HttpURLConnection =
        (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
        }

    private suspend fun request(method: String, path: String, body: String?, token: String? = null): String =
        withContext(Dispatchers.IO) {
            val conn = open(method, path, token).apply {
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
            }
            try {
                if (body != null) conn.outputStream.use { it.write(body.toByteArray()) }
                val code = conn.responseCode
                val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
                if (code !in 200..299) {
                    val msg = runCatching {
                        (AppJson.parseToJsonElement(text) as JsonObject)["error"]?.jsonPrimitive?.content
                    }.getOrNull() ?: "Server error ($code)"
                    throw ApiException(code, msg)
                }
                text
            } catch (e: IOException) {
                throw ApiException(0, "Can't reach the server. Check your internet connection.")
            } finally {
                conn.disconnect()
            }
        }
}
