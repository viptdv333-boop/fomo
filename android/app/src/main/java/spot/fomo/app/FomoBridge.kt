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

    private companion object {
        /** Largest base64 string accepted by the one-shot [saveFile] (2M characters of base64, about 1.5 MB of file); bigger files must be chunked. */
        const val MAX_SINGLE_BASE64 = 2 * 1024 * 1024
    }

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
     * "notificationChannels":true,"updateCheck":true,"immersive":true,"saveFile":true}`. `appLock` = the device can ask for a biometric / PIN;
     * `immersive` = [setImmersive] exists (full-screen chart); `saveFile` = [saveFile] / [saveFileBegin] exist (downloads of blob:/data: files).
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
            .put("immersive", true)
            .put("saveFile", true)
            .toString()
    }

    /**
     * Full-screen chart: hides (true) / shows (false) the status and navigation bars (swipe from the edge shows them for a moment).
     * The orientation is NOT touched: the chart is full screen in whatever orientation the device is in. The app gives the bars
     * back by itself when it stops, closes or the page leaves the terminal.
     */
    @JavascriptInterface
    fun setImmersive(on: Boolean) {
        if (!trusted()) return
        activity.runOnUiThread { activity.setChartImmersive(on) }
    }

    // ---- saving files the page produced (the WebView download listener cannot fetch blob:/data: URLs) --------------------------
    // Return values: "ok" (saveFileBegin: "ok:<token>") or a short error code: untrusted, bad_args, too_large, blocked_type, busy, io,
    // no_session, bad_chunk, bad_base64. On every error the app has already shown the «could not save» toast itself; on success
    // it shows «Файл сохранён в «Загрузки»: name». Where the file goes: see FileSaver.

    /**
     * Saves one file in a single call. [base64] is the file without a data: prefix. Fine for small files; anything over about 1 MB should
     * go through [saveFileBegin] / [saveFileChunk] / [saveFileEnd] (the site's helper switches at 768 KB of base64). Not measured on a
     * device: WebView passes multi-MB strings through addJavascriptInterface, but each one is copied several times (JS -> Java String ->
     * byte[]), so the chunked form keeps memory flat.
     */
    @JavascriptInterface
    fun saveFile(name: String?, mime: String?, base64: String?): String {
        if (!trusted()) return "untrusted"
        if (base64.isNullOrEmpty() || base64.length > MAX_SINGLE_BASE64) return reportSave(FileSaver.Result("bad_args"))
        return reportSave(activity.fileSaver.saveBase64(name, mime, base64))
    }

    /** Starts a chunked save: "ok:<token>" or an error code. */
    @JavascriptInterface
    fun saveFileBegin(name: String?, mime: String?): String {
        if (!trusted()) return "untrusted"
        val r = activity.fileSaver.begin(name, mime)
        if (!r.ok) return reportSave(r)
        return "ok:${r.token}"
    }

    /** One base64 chunk of an open save; every chunk's length must be a multiple of 4 (the site cuts the file at multiples of 3 bytes). */
    @JavascriptInterface
    fun saveFileChunk(token: String?, base64: String?): String {
        if (!trusted()) return "untrusted"
        val r = activity.fileSaver.write(token, base64)
        return if (r.ok) "ok" else reportSave(r)
    }

    /** Finishes the file: it becomes visible in Downloads and the toast appears. */
    @JavascriptInterface
    fun saveFileEnd(token: String?): String {
        if (!trusted()) return "untrusted"
        return reportSave(activity.fileSaver.finish(token))
    }

    /** The page could not produce the file (a read failed): drops the open save, if any, and shows the «could not save» toast. */
    @JavascriptInterface
    fun saveFileFailed(token: String?) {
        if (!trusted()) return
        activity.fileSaver.abort(token)
        activity.runOnUiThread { activity.toastSaveFailed() }
    }

    private fun reportSave(r: FileSaver.Result): String {
        activity.runOnUiThread { if (r.ok) activity.toastSaved(r.name) else activity.toastSaveFailed() }
        return r.code
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
