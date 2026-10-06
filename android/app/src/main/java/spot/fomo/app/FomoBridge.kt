package spot.fomo.app

import android.os.Build
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * `window.FomoApp` in the page. Every method first checks that the page currently shown is the trusted site
 * (https://fomo.spot or www.) — if the WebView is ever sent elsewhere the bridge answers with empty values and does
 * nothing. Arguments are validated, payloads are capped (Media.MAX_BYTES).
 *
 * JavascriptInterface methods run on a background thread: UI work is posted to the main thread, and the page URL is
 * read from [MainActivity.currentUrl] (WebView.getUrl() may only be called on the main thread).
 */
class FomoBridge(private val activity: MainActivity) {

    private fun trusted(): Boolean = UrlPolicy.isTrusted(activity.currentUrl)

    /** JSON {name,type,dataBase64} of the first image on the clipboard, or "". */
    @JavascriptInterface
    fun getClipboardImage(): String {
        if (!trusted()) return ""
        val file = Media.clipboardImage(activity) ?: return ""
        return file.toJson().toString()
    }

    @JavascriptInterface
    fun hasClipboardImage(): Boolean = trusted() && Media.clipboardHasImage(activity)

    @JavascriptInterface
    fun appVersion(): String = if (trusted()) BuildConfig.VERSION_NAME else ""

    /** Opens an http(s) link in a Custom Tab (mailto/tel/tg go to their apps). */
    @JavascriptInterface
    fun openExternal(url: String?) {
        if (!trusted() || url.isNullOrBlank() || url.length > 2000) return
        activity.runOnUiThread { ExternalLinks.open(activity, url) }
    }

    /** System share sheet with a text and/or link. */
    @JavascriptInterface
    fun share(text: String?, url: String?) {
        if (!trusted()) return
        val t = (text ?: "").take(2000)
        val u = (url ?: "").take(2000)
        if (u.isNotEmpty() && UrlPolicy.scheme(u) != "https" && UrlPolicy.scheme(u) != "http") return
        activity.runOnUiThread { ExternalLinks.share(activity, t, u) }
    }

    /** Honours «Вибро-отклик» in the app settings. */
    @JavascriptInterface
    fun haptic() {
        if (!trusted() || !AppSettings.haptic(activity)) return
        activity.runOnUiThread { activity.webView.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK) }
    }

    /** The Firebase token of this device, or "" (no google-services.json, Play services missing, not fetched yet). */
    @JavascriptInterface
    fun getPushToken(): String = if (trusted()) PushBridge.token(activity) else ""

    /** Opens the native settings screen of the app (lock, notification sound per channel, behaviour, updates, logout). */
    @JavascriptInterface
    fun openSettings() {
        if (!trusted() || AppLock.isLocked) return
        activity.runOnUiThread { SettingsActivity.open(activity) }
    }

    /** Is the biometric / PIN app lock switched on (and enforceable on this device)? Says nothing about the secret. */
    @JavascriptInterface
    fun lockEnabled(): Boolean = trusted() && AppLock.enforced()

    /**
     * What this build of the app can do, so the site can show entries only for what exists:
     * `{"schema":1,"versionName":"1.0.0","versionCode":1,"settings":true,"appLock":true,"lockEnabled":false,
     * "notificationChannels":true,"updateCheck":true}`. `appLock` = the device can ask for a biometric / PIN.
     */
    @JavascriptInterface
    fun appFeatures(): String {
        if (!trusted()) return ""
        return JSONObject()
            .put("schema", 1)
            .put("versionName", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("settings", true)
            .put("appLock", Authenticator.isAvailable(activity))
            .put("lockEnabled", AppLock.enforced())
            .put("notificationChannels", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            .put("updateCheck", true)
            .toString()
    }

    /** Android 13+: shows the system "allow notifications" dialog once; no-op elsewhere or when already decided. */
    @JavascriptInterface
    fun requestNotificationPermission() {
        if (!trusted()) return
        activity.runOnUiThread { activity.requestNotificationPermission() }
    }
}

/** Tells MainActivity whether the touched element can still scroll up (pull-to-refresh must not steal that gesture). */
class ScrollBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun setCanScrollUp(canScrollUp: Boolean) {
        if (UrlPolicy.isTrusted(activity.currentUrl)) activity.pageCanScrollUp = canScrollUp
    }
}

/** Exposed ONLY to the local offline page (a separate WebView that loads nothing from the network). */
class OfflineBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun retry() {
        activity.runOnUiThread { activity.retryLoad() }
    }
}
