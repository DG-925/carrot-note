package com.carrotnote.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val status: Int, message: String) : Exception(message)

@Serializable
data class AuthResponse(val token: String, val user: UserInfo)

@Serializable
data class SyncRequest(val since: Long, val changes: List<SyncRecord>)

@Serializable
data class SyncResponse(val cursor: Long, val changes: List<SyncRecord> = emptyList())

@Serializable
private data class Credentials(val email: String, val password: String, val name: String? = null)

@Serializable
private data class PasswordChange(val oldPassword: String, val newPassword: String)

@Serializable
private data class PasswordOnly(val password: String)

@Serializable
private data class MeResponse(val user: UserInfo)

/** Talks to the Carrot Note Cloudflare Worker (which stores data in D1). */
class ApiClient(private val baseUrl: String) {

    suspend fun register(email: String, password: String, name: String): AuthResponse =
        request("POST", "/api/register", AppJson.encodeToString(Credentials.serializer(), Credentials(email, password, name)))
            .let { AppJson.decodeFromString(AuthResponse.serializer(), it) }

    suspend fun login(email: String, password: String): AuthResponse =
        request("POST", "/api/login", AppJson.encodeToString(Credentials.serializer(), Credentials(email, password)))
            .let { AppJson.decodeFromString(AuthResponse.serializer(), it) }

    suspend fun me(token: String): UserInfo =
        request("GET", "/api/me", null, token).let { AppJson.decodeFromString(MeResponse.serializer(), it).user }

    suspend fun logout(token: String) {
        request("POST", "/api/logout", "{}", token)
    }

    suspend fun sync(token: String, req: SyncRequest): SyncResponse =
        request("POST", "/api/sync", AppJson.encodeToString(SyncRequest.serializer(), req), token)
            .let { AppJson.decodeFromString(SyncResponse.serializer(), it) }

    suspend fun changePassword(token: String, old: String, new: String) {
        request("POST", "/api/password", AppJson.encodeToString(PasswordChange.serializer(), PasswordChange(old, new)), token)
    }

    suspend fun deleteAccount(token: String, password: String) {
        request("POST", "/api/account/delete", AppJson.encodeToString(PasswordOnly.serializer(), PasswordOnly(password)), token)
    }

    private suspend fun request(method: String, path: String, body: String?, token: String? = null): String =
        withContext(Dispatchers.IO) {
            val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15_000
                readTimeout = 30_000
                setRequestProperty("Accept", "application/json")
                if (token != null) setRequestProperty("Authorization", "Bearer $token")
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
                        AppJson.parseToJsonElement(text).let { it as JsonObject }["error"]?.jsonPrimitive?.content
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
