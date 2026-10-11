package com.carrotnote.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

@Serializable
data class UserInfo(
    val id: String,
    val email: String = "",
    val name: String = "",
    val username: String = "",
    val bio: String = "",
    val github: String = "",
    val avatarRev: Int = 0,
)

/** Signed-in account and auth token. */
class Session(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    private val _user = MutableStateFlow(readUser())
    val user: StateFlow<UserInfo?> = _user.asStateFlow()

    val token: String? get() = prefs.getString("token", null)

    private fun readUser(): UserInfo? {
        val id = prefs.getString("user_id", null) ?: return null
        if (prefs.getString("token", null) == null) return null
        prefs.getString("user_json", null)?.let { j ->
            runCatching { AppJson.decodeFromString(UserInfo.serializer(), j) }.getOrNull()?.let { return it }
        }
        return UserInfo(id, prefs.getString("email", "") ?: "", prefs.getString("name", "") ?: "")
    }

    fun signIn(token: String, user: UserInfo) {
        prefs.edit()
            .putString("token", token)
            .putString("user_id", user.id)
            .putString("email", user.email)
            .putString("name", user.name)
            .putString("user_json", AppJson.encodeToString(UserInfo.serializer(), user))
            .apply()
        _user.value = user
    }

    fun updateUser(user: UserInfo) {
        if (user == _user.value) return
        prefs.edit().putString("email", user.email).putString("name", user.name)
            .putString("user_json", AppJson.encodeToString(UserInfo.serializer(), user)).apply()
        _user.value = user
    }

    fun signOut() {
        prefs.edit().clear().apply()
        _user.value = null
    }
}

/** Device preferences. */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private val _currency = MutableStateFlow(prefs.getString("currency", "USD") ?: "USD")
    val currency: StateFlow<String> = _currency.asStateFlow()

    /** 0 = system, 1 = light, 2 = dark (default, matches CarrotPOS) */
    private val _theme = MutableStateFlow(prefs.getInt("theme", 1))
    val theme: StateFlow<Int> = _theme.asStateFlow()

    private val _autoUpdate = MutableStateFlow(prefs.getBoolean("auto_update", true))
    val autoUpdate: StateFlow<Boolean> = _autoUpdate.asStateFlow()

    fun setCurrency(v: String) {
        prefs.edit().putString("currency", v).apply(); _currency.value = v
    }

    fun setTheme(v: Int) {
        prefs.edit().putInt("theme", v).apply(); _theme.value = v
    }

    fun setAutoUpdate(v: Boolean) {
        prefs.edit().putBoolean("auto_update", v).apply(); _autoUpdate.value = v
    }

    var snoozedVersion: String?
        get() = prefs.getString("snoozed_version", null)
        set(v) = prefs.edit().putString("snoozed_version", v).apply()

    var snoozedUntil: Long
        get() = prefs.getLong("snoozed_until", 0)
        set(v) = prefs.edit().putLong("snoozed_until", v).apply()

    var notifiedVersion: String?
        get() = prefs.getString("notified_version", null)
        set(v) = prefs.edit().putString("notified_version", v).apply()
}
