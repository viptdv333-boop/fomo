package spot.fomo.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent

/** Everything that is not the site itself leaves the WebView through here, with a short allow-list of schemes. */
object ExternalLinks {

    /** http(s) -> Custom Tabs; mailto/tel/sms/tg -> ACTION_VIEW; intent: -> sanitized; any other scheme is ignored. */
    fun open(activity: Activity, url: String) {
        when (UrlPolicy.scheme(url)) {
            "http", "https" -> openWeb(activity, url)
            "mailto", "tel", "sms", "tg" -> view(activity, Uri.parse(url))
            "intent" -> openIntentUri(activity, url)
            else -> Unit // javascript:, file:, content:, market:, data: ... never launched from page content
        }
    }

    private fun openWeb(activity: Activity, url: String) {
        val uri = Uri.parse(url)
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, uri)
        } catch (e: Exception) {
            view(activity, uri)
        }
    }

    private fun view(activity: Activity, uri: Uri) {
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(activity, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Android "intent://...#Intent;scheme=...;end" links. Parsed, then stripped of everything dangerous (explicit
     * component, selector, URI permission flags), restricted to BROWSABLE targets; a browser_fallback_url is only
     * followed when it is https.
     */
    private fun openIntentUri(activity: Activity, url: String) {
        val intent = try {
            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        } catch (e: Exception) {
            return
        }
        intent.component = null
        intent.selector = null
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.flags = intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            val fallback = intent.getStringExtra("browser_fallback_url")
            if (UrlPolicy.scheme(fallback) == "https") openWeb(activity, fallback!!)
            else Toast.makeText(activity, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    /** ACTION_SEND chooser for FomoApp.share(text, url). */
    fun share(activity: Activity, text: String, url: String) {
        val body = listOf(text, url).filter { it.isNotBlank() }.joinToString("\n")
        if (body.isBlank()) return
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body)
        activity.startActivity(Intent.createChooser(send, activity.getString(R.string.share_chooser)))
    }
}
