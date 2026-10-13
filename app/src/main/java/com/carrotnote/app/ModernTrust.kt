package com.carrotnote.app

import android.content.Context
import android.os.Build
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

/**
 * Android 5 to 7 trust only the certificate authorities they shipped with, and many sites now use
 * newer ones (Let's Encrypt, Google Trust Services…). On those versions the app trusts the
 * system's authorities plus a few newer roots bundled in res/raw/extra_roots.pem.
 */
object ModernTrust {
    fun install(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) return
        runCatching {
            val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
            val system = KeyStore.getInstance("AndroidCAStore").apply { load(null) }
            for (alias in system.aliases()) system.getCertificate(alias)?.let { store.setCertificateEntry(alias, it) }
            context.resources.openRawResource(R.raw.extra_roots).use { input ->
                CertificateFactory.getInstance("X.509").generateCertificates(input)
                    .forEachIndexed { i, cert -> store.setCertificateEntry("carrot_extra_$i", cert) }
            }
            val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
            val ssl = SSLContext.getInstance("TLS").apply { init(null, tmf.trustManagers, null) }
            HttpsURLConnection.setDefaultSSLSocketFactory(ssl.socketFactory)
        }
    }
}
