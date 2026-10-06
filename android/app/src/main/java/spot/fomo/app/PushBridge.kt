package spot.fomo.app

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * The seam between Firebase Cloud Messaging and the page. The app owns the device token; the page reads it through
 * FomoApp.getPushToken() (and the "fomo-native-push-token" event) and registers it with the signed-in user's session
 * at POST /api/push/fcm — so the server never trusts the app, only the cookie session.
 *
 * Without app/google-services.json Firebase is not initialised: every function here degrades to "no token".
 */
object PushBridge {
    private const val PREFS = "push"
    private const val KEY_TOKEN = "token"

    /** Set by MainActivity while it is alive; receives new tokens so the page can register them. */
    @Volatile
    var onToken: ((String) -> Unit)? = null

    fun isAvailable(context: Context): Boolean = try {
        FirebaseApp.getApps(context).isNotEmpty()
    } catch (e: Exception) {
        false
    }

    /** The last known token, or "" (no Firebase config, offline on first start, not fetched yet). */
    fun token(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null) ?: ""

    /** Called by FcmService.onNewToken and by [fetchToken]. */
    fun onNewToken(context: Context, token: String) {
        if (token.isBlank()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val changed = prefs.getString(KEY_TOKEN, null) != token
        prefs.edit().putString(KEY_TOKEN, token).apply()
        if (changed) onToken?.invoke(token)
    }

    /** Asks Firebase for the current token (async); the result lands in [onNewToken]. Safe to call on every start. */
    fun fetchToken(context: Context) {
        if (!isAvailable(context)) return
        val app = context.applicationContext
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) task.result?.let { onNewToken(app, it) }
            }
        } catch (e: Exception) {
            // Google Play services missing (de-Googled phone): the site's Web Push / in-app bell keep working
        }
    }
}
