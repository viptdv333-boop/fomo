package spot.fomo.app

import android.app.Activity
import android.content.Intent
import android.webkit.CookieManager
import android.webkit.WebStorage
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * «Выйти из аккаунта» from the native settings.
 *
 *  1. Tell the server to forget this phone: DELETE /api/push/fcm with the session cookie of the WebView and this device's
 *     Firebase token (the same call the page makes before sign-out), so a shared phone stops getting the account's
 *     notifications. Best effort, 5 s timeouts, failures are ignored — signing out never waits on the network for long.
 *  2. Remove all cookies and the site's local storage from the WebView (this also drops the page's own "registered token" memory).
 *  3. Send the user to the start page with an empty history (MainActivity, EXTRA_RESET_HOME).
 */
object AccountLogout {
    private val executor = Executors.newSingleThreadExecutor()

    fun run(activity: Activity) {
        // CookieManager is read here on the main thread, the network call goes off it
        val cookie = try {
            CookieManager.getInstance().getCookie(BuildConfig.BASE_URL)
        } catch (e: Exception) {
            null
        }
        val token = PushBridge.token(activity)
        executor.execute {
            if (!cookie.isNullOrBlank() && token.isNotBlank()) forgetDevice(cookie, token)
            activity.runOnUiThread { clearWebData(activity) }
        }
    }

    private fun forgetDevice(cookie: String, token: String) {
        var conn: HttpURLConnection? = null
        try {
            conn = URL(BuildConfig.BASE_URL.trimEnd('/') + "/api/push/fcm").openConnection() as HttpURLConnection
            conn.requestMethod = "DELETE"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.instanceFollowRedirects = false // a redirect could carry the cookie to another origin
            conn.doOutput = true
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            conn.outputStream.use { it.write(JSONObject().put("token", token).toString().toByteArray(Charsets.UTF_8)) }
            conn.responseCode // the status itself does not matter
        } catch (e: Exception) {
            // offline / server down: the token is cleaned up server-side when FCM reports it unregistered
        } finally {
            conn?.disconnect()
        }
    }

    private fun clearWebData(activity: Activity) {
        val cookies = CookieManager.getInstance()
        cookies.removeAllCookies {
            cookies.flush()
            try {
                WebStorage.getInstance().deleteAllData()
            } catch (e: Exception) {
                // storage already closed
            }
            if (activity.isFinishing || activity.isDestroyed) return@removeAllCookies
            activity.startActivity(
                Intent(activity, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_RESET_HOME, true)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
        }
    }
}
