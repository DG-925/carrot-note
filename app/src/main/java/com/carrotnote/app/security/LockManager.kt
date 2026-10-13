package com.carrotnote.app.security

import android.content.Context
import android.os.SystemClock
import android.util.Base64
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** App lock: PIN (stored as a salted PBKDF2 hash) plus optional fingerprint / face unlock. */
class LockManager(context: Context) {
    private val prefs = context.getSharedPreferences("lock", Context.MODE_PRIVATE)

    val pinEnabled: Boolean get() = prefs.getString("pin_hash", null) != null

    val pinLength: Int get() = prefs.getInt("pin_len", 4)

    private val _locked = MutableStateFlow(pinEnabled)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    private val _biometric = MutableStateFlow(prefs.getBoolean("biometric", false))
    val biometricEnabled: StateFlow<Boolean> = _biometric.asStateFlow()

    /** Seconds in background before the app locks again. */
    private val _delay = MutableStateFlow(prefs.getInt("delay", 30))
    val lockDelay: StateFlow<Int> = _delay.asStateFlow()

    private val _secureScreen = MutableStateFlow(prefs.getBoolean("secure_screen", false))
    val secureScreen: StateFlow<Boolean> = _secureScreen.asStateFlow()

    private var backgroundAt = 0L
    private var suppressUntil = 0L

    /** Call before opening another app (contact picker, installer) so returning doesn't lock. */
    fun suppressNextLock() {
        suppressUntil = SystemClock.elapsedRealtime() + 120_000
    }

    fun onAppBackground() {
        backgroundAt = SystemClock.elapsedRealtime()
    }

    fun onAppForeground() {
        if (!pinEnabled || backgroundAt == 0L) return
        val now = SystemClock.elapsedRealtime()
        if (now < suppressUntil) {
            suppressUntil = 0
            return
        }
        if (now - backgroundAt >= _delay.value * 1000L) _locked.value = true
    }

    fun lockNow() {
        if (pinEnabled) _locked.value = true
    }

    // ---- PIN ----

    fun failedAttempts(): Int = prefs.getInt("fails", 0)

    /** Milliseconds the user must wait before trying again (after 5 wrong PINs). */
    fun cooldownRemaining(): Long {
        val until = prefs.getLong("cooldown_until", 0)
        return (until - System.currentTimeMillis()).coerceAtLeast(0)
    }

    fun verify(pin: String): Boolean {
        if (cooldownRemaining() > 0) return false
        val ok = check(pin)
        if (ok) {
            prefs.edit().putInt("fails", 0).apply()
        } else {
            val fails = failedAttempts() + 1
            val e = prefs.edit().putInt("fails", fails)
            if (fails % 5 == 0) e.putLong("cooldown_until", System.currentTimeMillis() + 30_000L * (fails / 5))
            e.apply()
        }
        return ok
    }

    fun unlock() {
        _locked.value = false
    }

    fun check(pin: String): Boolean {
        val salt = prefs.getString("pin_salt", null) ?: return false
        val hash = prefs.getString("pin_hash", null) ?: return false
        return MessageDigest.isEqual(hash.toByteArray(), hashPin(pin, Base64.decode(salt, Base64.NO_WRAP)).toByteArray())
    }

    fun setPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit()
            .putString("pin_salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            .putString("pin_hash", hashPin(pin, salt))
            .putInt("pin_len", pin.length)
            .putInt("fails", 0)
            .apply()
    }

    fun disable() {
        prefs.edit().remove("pin_hash").remove("pin_salt").putBoolean("biometric", false).apply()
        _biometric.value = false
        _locked.value = false
    }

    fun setBiometric(enabled: Boolean) {
        prefs.edit().putBoolean("biometric", enabled).apply(); _biometric.value = enabled
    }

    fun setLockDelay(seconds: Int) {
        prefs.edit().putInt("delay", seconds).apply(); _delay.value = seconds
    }

    fun setSecureScreen(enabled: Boolean) {
        prefs.edit().putBoolean("secure_screen", enabled).apply(); _secureScreen.value = enabled
    }

    fun clear() {
        prefs.edit().clear().apply()
        _biometric.value = false
        _delay.value = 30
        _secureScreen.value = false
        _locked.value = false
    }

    private fun hashPin(pin: String, salt: ByteArray): String =
        Base64.encodeToString(pbkdf2Sha256(pin.toByteArray(Charsets.UTF_8), salt, 20_000), Base64.NO_WRAP)

    /**
     * PBKDF2-HMAC-SHA256 with a 32-byte result (one block), the same as the platform's
     * "PBKDF2WithHmacSHA256", which only exists from Android 8. HmacSHA256 exists everywhere.
     */
    private fun pbkdf2Sha256(password: ByteArray, salt: ByteArray, iterations: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(password, "HmacSHA256")) }
        var u = mac.doFinal(salt + byteArrayOf(0, 0, 0, 1))
        val out = u.copyOf()
        repeat(iterations - 1) {
            u = mac.doFinal(u)
            for (i in out.indices) out[i] = (out[i].toInt() xor u[i].toInt()).toByte()
        }
        return out
    }
}
