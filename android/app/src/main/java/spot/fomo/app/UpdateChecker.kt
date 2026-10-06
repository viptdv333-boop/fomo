package spot.fomo.app

import android.content.Context
import androidx.appcompat.app.AlertDialog
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Optional "update available" prompt for APKs installed outside a store.
 *
 * Reads BASE_URL/app/version.json (public/app/version.json on the site) — {"versionCode":2,"versionName":"1.0.1",
 * "url":"https://fomo.spot/app/fomo.apk"} — at most once per 12 hours. If versionCode is higher than this build's, a dialog
 * offers to download. The link is opened in the browser (which downloads the APK); the app NEVER installs anything itself.
 * Safe by construction: https only, the URL must be on the site or github.com, any failure is silently ignored.
 */
object UpdateChecker {
    private const val PREFS = "update"
    private const val KEY_LAST_CHECK = "lastCheck"
    private const val KEY_DISMISSED = "dismissedCode"
    private const val CHECK_EVERY_MS = 12L * 3600 * 1000
    private const val MAX_BYTES = 16 * 1024

    private val executor = Executors.newSingleThreadExecutor()

    class Info(val versionCode: Int, val versionName: String, val url: String)

    fun checkIfDue(activity: MainActivity) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_CHECK, 0L) < CHECK_EVERY_MS) return
        executor.execute {
            val info = fetch() ?: return@execute
            prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
            if (info.versionCode <= BuildConfig.VERSION_CODE) return@execute
            if (prefs.getInt(KEY_DISMISSED, 0) >= info.versionCode) return@execute
            activity.runOnUiThread {
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                AlertDialog.Builder(activity)
                    .setTitle(R.string.update_title)
                    .setMessage(activity.getString(R.string.update_message, info.versionName))
                    .setPositiveButton(R.string.update_download) { _, _ -> ExternalLinks.open(activity, info.url) }
                    .setNegativeButton(R.string.update_later) { _, _ -> prefs.edit().putInt(KEY_DISMISSED, info.versionCode).apply() }
                    .show()
            }
        }
    }

    private fun fetch(): Info? {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(BuildConfig.BASE_URL.trimEnd('/') + "/app/version.json").openConnection() as HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.instanceFollowRedirects = false // a redirect could leave the trusted origin
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.use { it.readNBytesCompat(MAX_BYTES) }
            val json = JSONObject(String(body, Charsets.UTF_8))
            val code = json.optInt("versionCode", 0)
            val name = json.optString("versionName", "").take(40)
            val url = json.optString("url", "")
            if (code <= 0 || name.isBlank() || !UrlPolicy.isAllowedUpdateUrl(url)) null else Info(code, name, url)
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(2048)
        while (out.size() < max) {
            val n = read(buf, 0, minOf(buf.size, max - out.size()))
            if (n < 0) break
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }
}
