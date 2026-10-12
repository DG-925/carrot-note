package com.carrotnote.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.carrotnote.app.update.Updater
import com.carrotnote.app.web.WebBridge
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch

/** Hosts the web UI (assets/web) and gives it access to phone features through [WebBridge]. */
class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var bridge: WebBridge

    val systemDark: Boolean
        get() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private var permissionResult: CompletableDeferred<Boolean>? = null
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        permissionResult?.complete(it)
        permissionResult = null
    }

    private var imageResult: CompletableDeferred<Uri?>? = null
    private val imageLauncher = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) {
        imageResult?.complete(it)
        imageResult = null
    }

    /** Asks for a runtime permission if needed; true when granted. */
    suspend fun ensurePermission(permission: String): Boolean {
        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) return true
        permissionResult?.complete(false)
        val result = CompletableDeferred<Boolean>()
        permissionResult = result
        Graph.lock.suppressNextLock()
        permissionLauncher.launch(permission)
        return result.await()
    }

    /** Opens the photo picker; null when the user backs out. */
    suspend fun pickImage(): Uri? {
        imageResult?.complete(null)
        val result = CompletableDeferred<Uri?>()
        imageResult = result
        imageLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        return result.await()
    }

    private fun isDark(): Boolean = when (Graph.settings.theme.value) {
        1 -> false
        2 -> true
        else -> systemDark
    }

    /** Light or dark status/navigation bar icons, and the matching window color. */
    fun applySystemBars(dark: Boolean) {
        val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
        val bg = if (dark) 0xFF131110.toInt() else 0xFFF4F2EF.toInt()
        root.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        root = FrameLayout(this)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.scheme == "file") return false
                    // Links inside the UI open in the browser, never inside the app.
                    runCatching {
                        Graph.lock.suppressNextLock()
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                    }
                    return true
                }
            }
        }
        bridge = WebBridge(this, web)
        web.addJavascriptInterface(bridge, "CarrotNative")
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applySystemBars(isDark())

        // Edge to edge: the page draws under the bars and gets their sizes as CSS variables.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(0, 0, 0, ime.bottom)
            val d = resources.displayMetrics.density
            bridge.emitInsets(bars.top / d, if (ime.bottom > 0) 0f else bars.bottom / d, ime.bottom / d)
            WindowInsetsCompat.CONSUMED
        }

        bridge.start()
        web.loadUrl("file:///android_asset/web/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__native ? window.__native.back() : false") { handled ->
                    if (handled != "true") moveTaskToBack(true)
                }
            }
        })

        lifecycleScope.launch {
            Graph.lock.secureScreen.collect { secure ->
                if (secure) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
        setupShortcuts()
        handleIntent(intent)
    }

    /** Long-press shortcuts on the launcher icon. */
    private fun setupShortcuts() {
        val sm = getSystemService(ShortcutManager::class.java) ?: return
        fun shortcut(id: String, label: String, icon: Int) = ShortcutInfo.Builder(this, id)
            .setShortLabel(label)
            .setIcon(Icon.createWithResource(this, icon))
            .setIntent(Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra(EXTRA_SHORTCUT, id))
            .build()
        runCatching {
            sm.dynamicShortcuts = listOf(
                shortcut("expense", "New expense", R.drawable.ic_sc_expense),
                shortcut("task", "New task", R.drawable.ic_sc_task),
                shortcut("timer", "Start timer", R.drawable.ic_sc_timer),
                shortcut("search", "Search", R.drawable.ic_sc_search),
            )
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        bridge.emitState()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        bridge.stop()
        web.destroy()
        super.onDestroy()
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(EXTRA_SHORTCUT)?.let { id ->
            intent.removeExtra(EXTRA_SHORTCUT)
            bridge.emit("shortcut", org.json.JSONObject.quote(id))
        }
        if (intent?.getBooleanExtra(Updater.EXTRA_SHOW_UPDATE, false) == true) {
            intent.removeExtra(Updater.EXTRA_SHOW_UPDATE)
            lifecycleScope.launch {
                Updater.fetchLatest()?.let { if (Updater.isNewer(it.version, Updater.currentVersion)) Updater.showRelease(it) }
            }
        }
    }

    companion object {
        const val EXTRA_SHORTCUT = "com.carrotnote.app.SHORTCUT"
    }
}
