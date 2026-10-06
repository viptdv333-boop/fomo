package spot.fomo.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.util.concurrent.Executors

/**
 * The whole app is one screen: a WebView on BuildConfig.BASE_URL (https://fomo.spot, or https://terminal.fomo.spot in the terminal flavor) with the things a PWA cannot do (see android/README.md).
 *
 * Trust model: only https://fomo.spot (and www.) stays in the WebView and only that origin sees the `FomoApp` bridge.
 * Everything else opens in Custom Tabs / the matching app (ExternalLinks). The "current page" used for these decisions
 * is [currentUrl], maintained from the WebViewClient callbacks so the bridge threads never touch the WebView.
 */
class MainActivity : AppCompatActivity() {

    lateinit var webView: FomoWebView
        private set

    private lateinit var root: FrameLayout
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var offline: WebView

    private val fileChooser = FileChooser(this)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    /** URL of the page being shown (main thread writes, bridge threads read). */
    @Volatile
    var currentUrl: String? = null
        private set

    /** Set by the page's scroll probe: the touched element can still scroll up, so pull-to-refresh must stay out. */
    @Volatile
    var pageCanScrollUp: Boolean = false

    private var firstPageShown = false
    private var updateChecked = false
    private var offlineShown = false
    private var offlineReady = false
    private var lastFailedUrl: String? = null
    private var pendingShareJs: String? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingWebResources: List<String> = emptyList()
    private var webViewGone = false
    private var clearHistoryOnFinish = false

    /** The full-screen chart has the system bars hidden (FomoApp.setImmersive). */
    private var immersive = false
    private var immersiveResetPending = false

    // App lock (see AppLock / LockController). While locked, deep links and shares wait here until the owner unlocks.
    private lateinit var authenticator: Authenticator
    private lateinit var lock: LockController
    private var deferredIntent: Intent? = null
    private var deferredInitial = false
    private val themeRunnable = Runnable { readThemeColor() }

    private class DownloadRequest(val url: String, val userAgent: String?, val disposition: String?, val mime: String?)

    // ---- ActivityResult launchers (must be created before the activity is started) ----------------------------------
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { fileChooser.onResult(it.resultCode, it.data) }
    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { fileChooser.onCameraPermissionResult(it) }
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { PushBridge.fetchToken(this) }
    private val webPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { onWebPermissionResult() }

    // ---- lifecycle ---------------------------------------------------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        // The splash stays until the first page is drawn (but never longer than 2.5 s); a locked start shows the lock at once.
        firstPageShown = AppLock.isLocked
        splash.setKeepOnScreenCondition { !firstPageShown }
        main.postDelayed({ firstPageShown = true }, 2500)

        root = findViewById(R.id.root)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)
        webView = findViewById(R.id.webview)

        setupInsets()
        applyThemeColor(ContextCompat.getColor(this, R.color.fomo_bg))
        setupWebView()
        setupRefresh()
        setupBack()

        // Created last: the lock Back callback must be the most recently added one to take precedence over the page one.
        authenticator = Authenticator(this)
        lock = LockController(this, root, authenticator, restored = false) { onLockChanged(it) } // MainActivity handles rotation itself: always prompt

        PushBridge.onToken = { token -> runOnUiThread { webView.evaluateJavascript(Js.pushToken(token), null) } }
        PushBridge.fetchToken(this)

        val restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null
        if (!restored) handleIntent(intent, initial = true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent, initial = false)
    }

    override fun onStart() {
        super.onStart()
        FomoApplication.appVisible = true
        applySettings()
    }

    override fun onResume() {
        super.onResume()
        if (!webViewGone) webView.onResume()
        SecureWindow.update(this)
        lock.onResume()
        if (immersiveResetPending) {
            // the bars were given back while the app was away: tell the page so its chart leaves the full screen too
            immersiveResetPending = false
            if (!webViewGone && UrlPolicy.isTrusted(currentUrl)) webView.evaluateJavascript(Js.IMMERSIVE_RESET, null)
        }
    }

    override fun onPause() {
        if (!webViewGone) webView.onPause()
        CookieManager.getInstance().flush() // keeps the session across app restarts
        SecureWindow.update(this, pausing = true) // the recents thumbnail is taken as the app leaves
        super.onPause()
    }

    override fun onStop() {
        FomoApplication.appVisible = false
        resetImmersive(notifyPage = true) // never leave the app without status / navigation bars in the background
        CookieManager.getInstance().flush()
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (webViewGone) return
        try {
            webView.saveState(outState)
        } catch (e: Exception) {
            // WebView already gone (render process crashed)
        }
    }

    override fun onDestroy() {
        resetImmersive(notifyPage = false)
        lock.onDestroy()
        PushBridge.onToken = null
        fileChooser.cancel()
        pendingWebPermission?.deny()
        main.removeCallbacksAndMessages(null)
        io.shutdown()
        if (!webViewGone) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    // ---- setup -------------------------------------------------------------------------------------------------------

    private fun setupInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true) // the site's own sub-resources / embeds
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // target=_blank / window.open load in this same WebView; external targets are routed out by the client below
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            // The site can detect the app: UA ends with " FomoApp/<versionName> Android"
            userAgentString = userAgentString + " FomoApp/" + BuildConfig.VERSION_NAME + " Android"
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(webView.settings, true)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.addJavascriptInterface(FomoBridge(this), "FomoApp")
        webView.addJavascriptInterface(ScrollBridge(this), "FomoScroll")
        webView.webViewClient = SiteClient()
        webView.webChromeClient = SiteChrome()
        webView.setDownloadListener { url, userAgent, disposition, mime, _ -> onDownload(DownloadRequest(url, userAgent, disposition, mime)) }
        webView.onImageCommit = { info -> onImageFromKeyboard(info) }
    }

    private fun setupRefresh() {
        refresh.setColorSchemeResources(R.color.fomo_green)
        refresh.setOnRefreshListener {
            webView.reload()
            main.postDelayed({ refresh.isRefreshing = false }, 6000) // safety net if the load never reports back
        }
        // Pull only when the page itself is at the top: WebView scroll AND the element under the finger (see Js.INSTALL_SCROLL_PROBE).
        refresh.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 || pageCanScrollUp }
    }

    private fun setupBack() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    offlineShown -> {
                        hideOffline()
                        if (webView.canGoBack()) webView.goBack() else finish()
                    }
                    webView.canGoBack() -> webView.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    // ---- intents: launcher, App Links, notification taps, Share ------------------------------------------------------

    private fun handleIntent(intent: Intent?, initial: Boolean) {
        if (AppLock.isLocked) {
            // Queue it: deep links, notification taps and shares are handled after the owner unlocks (onLockChanged).
            if (intent != null) deferredIntent = intent
            deferredInitial = deferredInitial || initial
            return
        }
        val base = BuildConfig.BASE_URL
        if (intent == null) {
            if (initial) loadUrl(base)
            return
        }
        when {
            intent.getBooleanExtra(EXTRA_RESET_HOME, false) -> {
                // after "Выйти из аккаунта" in the settings: back to the start page, without the old page in the history
                clearHistoryOnFinish = true
                loadUrl(base)
            }
            BuildConfig.SHARE_ENABLED && ShareIntake.isShare(intent) -> handleShare(intent)
            intent.action == Intent.ACTION_VIEW && intent.data != null -> {
                val url = intent.dataString
                if (UrlPolicy.isTrusted(url)) loadUrl(url!!) else if (initial) loadUrl(base)
            }
            intent.hasExtra(Notifications.EXTRA_LINK) -> {
                val path = UrlPolicy.sameOriginPath(intent.getStringExtra(Notifications.EXTRA_LINK))
                loadUrl(if (path != null) base.trimEnd('/') + path else base)
            }
            else -> if (initial) loadUrl(base)
        }
    }

    private fun loadUrl(url: String) {
        if (!UrlPolicy.isTrusted(url)) return
        hideOffline()
        webView.loadUrl(url)
    }

    /** "Share to FOMO": text goes in the query string, files go through the page event once /share has loaded. */
    private fun handleShare(intent: Intent) {
        io.execute {
            val content = ShareIntake.read(this, intent)
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (content.isEmpty) {
                    loadUrl(BuildConfig.BASE_URL)
                    return@runOnUiThread
                }
                pendingShareJs = Js.nativeShare(content.text, content.title, content.files)
                val uri = Uri.parse(BuildConfig.BASE_URL).buildUpon().path("/share").clearQuery()
                if (content.title.isNotBlank()) uri.appendQueryParameter("title", content.title.take(300))
                if (content.text.isNotBlank()) uri.appendQueryParameter("text", content.text.take(1500))
                loadUrl(uri.build().toString())
            }
        }
    }

    /** An image committed from the keyboard (Gboard clipboard / stickers): read it off-thread, hand it to the page. */
    private fun onImageFromKeyboard(info: InputContentInfoCompat) {
        val uri = info.contentUri
        val mime = if (info.description.mimeTypeCount > 0) info.description.getMimeType(0) else null
        io.execute {
            val file = try {
                Media.read(this, uri, mime)
            } finally {
                try {
                    info.releasePermission()
                } catch (e: Exception) {
                    // permission was never requested (older keyboards)
                }
            }
            if (file != null) {
                runOnUiThread {
                    if (UrlPolicy.isTrusted(currentUrl)) webView.evaluateJavascript(Js.nativePaste(file), null)
                }
            }
        }
    }

    // ---- app lock and native settings --------------------------------------------------------------------------------

    private fun onLockChanged(locked: Boolean) {
        updateKeepScreenOn()
        if (locked) {
            resetImmersive(notifyPage = true)
            return
        }
        if (deferredInitial || deferredIntent != null) {
            val queued = deferredIntent
            val initial = deferredInitial
            deferredIntent = null
            deferredInitial = false
            handleIntent(queued, initial)
        }
    }

    /** Settings that can change while the page is open (the settings screen is a separate activity). */
    private fun applySettings() {
        updateRefreshEnabled()
        updateKeepScreenOn()
        SecureWindow.update(this)
    }

    /** «Обновление страницы свайпом» AND the page allows it (not on the terminal / chats). */
    private fun updateRefreshEnabled() {
        if (!::refresh.isInitialized) return
        refresh.isEnabled = !offlineShown && AppSettings.pullToRefresh(this) && UrlPolicy.pullToRefreshAllowed(currentUrl)
    }

    /** «Не гасить экран в терминале»: FLAG_KEEP_SCREEN_ON only on /terminal, only unlocked and only in the foreground. */
    private fun updateKeepScreenOn() {
        val keep = AppSettings.keepScreenOnInTerminal(this) && !AppLock.isLocked && UrlPolicy.isTerminal(currentUrl)
        if (keep) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    // ---- full-screen chart: immersive mode (system bars only; the orientation follows the sensor / the system setting) -----------

    /** FomoApp.setImmersive: hide or show the status and navigation bars; a swipe from the edge shows them transiently. */
    fun setChartImmersive(on: Boolean) {
        if (!ImmersivePolicy.shouldApply(on, immersive, AppLock.isLocked)) return
        immersive = on
        applyImmersive(on)
    }

    private fun applyImmersive(on: Boolean) {
        val controller = WindowCompat.getInsetsController(window, root)
        if (on) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    /** Gives the bars back; with [notifyPage] the page is told on the next resume (its JS may be paused right now). */
    private fun resetImmersive(notifyPage: Boolean) {
        if (!immersive) return
        immersive = false
        applyImmersive(false)
        if (notifyPage) immersiveResetPending = true
    }

    // ---- called by the helpers ---------------------------------------------------------------------------------------

    fun launchFileChooser(intent: Intent) {
        AppLock.beginExternalFlow() // the picker / camera covers the app: do not lock for that
        fileChooserLauncher.launch(intent)
    }

    fun requestCameraForChooser() {
        AppLock.beginExternalFlow()
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        try {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } catch (e: Exception) {
            // a dialog is already on screen
        }
    }

    fun retryLoad() {
        val target = lastFailedUrl?.takeIf { UrlPolicy.isTrusted(it) } ?: BuildConfig.BASE_URL
        loadUrl(target)
    }

    // ---- offline page ------------------------------------------------------------------------------------------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun showOffline(failedUrl: String?) {
        lastFailedUrl = failedUrl
        if (!offlineReady) {
            offlineReady = true
            offline.settings.apply {
                javaScriptEnabled = true // only for the local page's own script
                allowFileAccess = false // file:///android_asset/ is exempt from this switch
                allowContentAccess = false
                blockNetworkLoads = true
            }
            offline.addJavascriptInterface(OfflineBridge(this), "FomoOffline")
            offline.webViewClient = object : WebViewClient() {
                // the local page can navigate nowhere
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
            }
            offline.loadUrl("file:///android_asset/offline.html")
        }
        offlineShown = true
        offline.visibility = View.VISIBLE
        progress.visibility = View.GONE
        refresh.isRefreshing = false
        refresh.isEnabled = false
        firstPageShown = true
    }

    private fun hideOffline() {
        if (!offlineShown) return
        offlineShown = false
        offline.visibility = View.GONE
        updateRefreshEnabled()
    }

    // ---- system bars follow the site's <meta name="theme-color"> -----------------------------------------------------

    private fun applyThemeColor(argb: Int) {
        root.setBackgroundColor(argb)
        val light = ThemeColor.luminance(argb) > 0.6
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
    }

    private fun readThemeColor() {
        if (!UrlPolicy.isTrusted(currentUrl)) return
        webView.evaluateJavascript(Js.READ_THEME_COLOR) { raw ->
            applyThemeColor(ThemeColor.parse(raw) ?: ContextCompat.getColor(this, R.color.fomo_bg))
        }
    }

    private fun scheduleThemeColorRead() {
        main.removeCallbacks(themeRunnable)
        main.postDelayed(themeRunnable, 400)
    }

    // ---- web permissions (getUserMedia) ------------------------------------------------------------------------------

    private fun onWebPermissionRequest(request: PermissionRequest) {
        if (!UrlPolicy.isTrusted(request.origin.toString())) {
            request.deny()
            return
        }
        val resources = ArrayList<String>()
        for (r in request.resources) {
            if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE || r == PermissionRequest.RESOURCE_AUDIO_CAPTURE) resources.add(r)
        }
        if (resources.isEmpty()) {
            request.deny()
            return
        }
        val missing = androidPermissionsFor(resources).filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            request.grant(resources.toTypedArray())
            return
        }
        pendingWebPermission?.deny()
        pendingWebPermission = request
        pendingWebResources = resources
        webPermissionLauncher.launch(missing.toTypedArray())
    }

    private fun androidPermissionsFor(resources: List<String>): List<String> = resources.mapNotNull {
        when (it) {
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
            else -> null
        }
    }

    private fun onWebPermissionResult() {
        val request = pendingWebPermission ?: return
        pendingWebPermission = null
        val granted = pendingWebResources.filter { res ->
            androidPermissionsFor(listOf(res)).all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
        }
        if (granted.isEmpty()) request.deny() else request.grant(granted.toTypedArray())
    }

    // ---- downloads ---------------------------------------------------------------------------------------------------

    private fun onDownload(d: DownloadRequest) {
        // Cookies are only attached for the trusted origin; blob:/data: URLs cannot be fetched by DownloadManager.
        if (!UrlPolicy.isTrusted(d.url)) {
            ExternalLinks.open(this, d.url)
            return
        }
        try {
            val name = URLUtil.guessFileName(d.url, d.disposition, d.mime)
            val request = DownloadManager.Request(Uri.parse(d.url))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setTitle(name)
            d.mime?.takeIf { it.isNotBlank() }?.let { request.setMimeType(it) }
            CookieManager.getInstance().getCookie(d.url)?.let { request.addRequestHeader("Cookie", it) }
            d.userAgent?.let { request.addRequestHeader("User-Agent", it) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            } else {
                // before Android 10 the public folder needs a storage permission; the app's own folder does not
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name)
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
        }
    }

    // ---- WebView clients ---------------------------------------------------------------------------------------------

    private inner class SiteClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            val url = request.url.toString()
            if (url == "about:blank" || UrlPolicy.isTrusted(url)) return false
            ExternalLinks.open(this@MainActivity, url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            currentUrl = url
            if (ImmersivePolicy.resetOnNavigation(immersive, url)) resetImmersive(notifyPage = false)
            pageCanScrollUp = false
            updateRefreshEnabled()
            updateKeepScreenOn()
            progress.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            currentUrl = url
            refresh.isRefreshing = false
            progress.visibility = View.GONE
            CookieManager.getInstance().flush()
            if (!offlineShown) firstPageShown = true
            if (clearHistoryOnFinish && UrlPolicy.isTrusted(url)) {
                clearHistoryOnFinish = false
                view.clearHistory()
            }
            if (!UrlPolicy.isTrusted(url)) return

            view.evaluateJavascript(Js.INSTALL_SCROLL_PROBE, null)
            readThemeColor()

            val share = pendingShareJs
            if (share != null && (Uri.parse(url).path ?: "").startsWith("/share")) {
                pendingShareJs = null
                view.evaluateJavascript(share, null)
            }
            if (!updateChecked && !offlineShown) {
                updateChecked = true
                UpdateChecker.checkIfDue(this@MainActivity)
            }
        }

        /** Single-page navigations (history.pushState) do not reload the page but do change the URL. */
        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            currentUrl = url
            if (ImmersivePolicy.resetOnNavigation(immersive, url)) resetImmersive(notifyPage = false)
            updateRefreshEnabled()
            updateKeepScreenOn()
            scheduleThemeColorRead()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showOffline(request.url.toString())
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
            handler.cancel() // never "proceed" past a certificate problem
            showOffline(error.url)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The renderer crashed or was killed: this WebView is unusable. Rebuild the screen (cookies survive).
            webViewGone = true
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            runOnUiThread { recreate() }
            return true
        }
    }

    private inner class SiteChrome : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
            progress.visibility = if (newProgress in 1..99 && !offlineShown) View.VISIBLE else View.GONE
        }

        override fun onShowFileChooser(
            view: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: WebChromeClient.FileChooserParams,
        ): Boolean = fileChooser.show(filePathCallback, fileChooserParams)

        override fun onPermissionRequest(request: PermissionRequest) = onWebPermissionRequest(request)

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (pendingWebPermission === request) pendingWebPermission = null
        }
    }

    companion object {
        /** Intent extra from the settings screen after logout: reload the start page and drop the history. */
        const val EXTRA_RESET_HOME = "spot.fomo.app.RESET_HOME"
    }
}
