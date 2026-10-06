package spot.fomo.app

import java.net.URI
import java.util.Locale

/**
 * Every "may this URL stay in the WebView / see the bridge / be downloaded from" decision lives here, as pure Kotlin
 * (java.net.URI only), so it can be unit-tested on the JVM (UrlPolicyTest) and reviewed in one place.
 */
object UrlPolicy {

    /** Hosts that count as "the site": the base host and its www. twin (https only). */
    fun trustedHosts(baseUrl: String): Set<String> {
        val host = hostOf(baseUrl) ?: return emptySet()
        val bare = host.removePrefix("www.")
        return setOf(bare, "www.$bare")
    }

    fun isTrusted(url: String?, baseUrl: String = BuildConfig.BASE_URL): Boolean {
        val u = parse(url) ?: return false
        if (u.scheme?.lowercase(Locale.ROOT) != "https") return false
        if (u.rawUserInfo != null) return false
        if (u.port != -1 && u.port != 443) return false
        val host = u.host?.lowercase(Locale.ROOT) ?: return false
        return host in trustedHosts(baseUrl)
    }

    /** The scheme of a URL, lower-cased, or null when it does not parse. "mailto:a@b.c" -> "mailto". */
    fun scheme(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val i = url.indexOf(':')
        if (i <= 0) return null
        val s = url.substring(0, i).lowercase(Locale.ROOT)
        return if (s.all { it.isLetterOrDigit() || it == '+' || it == '-' || it == '.' }) s else null
    }

    /**
     * A same-origin path ("/ideas/5?x=1") taken from an untrusted string (push payload, intent extra), or null.
     * Absolute URLs of the site itself are reduced to their path; everything else is dropped.
     */
    fun sameOriginPath(link: String?, baseUrl: String = BuildConfig.BASE_URL): String? {
        if (link.isNullOrBlank() || link.length > 2000) return null
        if (link.any { it == '\\' || it.code < 0x20 || it.code == 0x7f }) return null
        if (link.startsWith("/")) return if (link.startsWith("//")) null else link
        if (!isTrusted(link, baseUrl)) return null
        val u = parse(link) ?: return null
        val path = u.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
        return if (u.rawQuery != null) "$path?${u.rawQuery}" else path
    }

    /** Pull-to-refresh fights with inner scrolling on these screens (chart gestures, message history, composers). */
    fun pullToRefreshAllowed(url: String?): Boolean {
        val p = appPath(url) ?: return true
        return listOf("/terminal", "/chat", "/messages").none { p == it || p.startsWith("$it/") }
    }

    /** The terminal (charts): «Не гасить экран в терминале» applies while this is the current page. */
    fun isTerminal(url: String?): Boolean {
        val p = appPath(url) ?: return false
        return p == "/terminal" || p.startsWith("/terminal/")
    }

    /** The lower-cased path of a page without the site's language prefix (/en, /cn, /ru), or null when it does not parse. */
    private fun appPath(url: String?): String? {
        val path = parse(url)?.path?.lowercase(Locale.ROOT) ?: return null
        return path.replace(Regex("^/(en|cn|ru)(?=/|$)"), "")
    }

    /** Only the site (or its GitHub release downloads) may be offered as the APK update link: https, no user info. */
    fun isAllowedUpdateUrl(url: String?, baseUrl: String = BuildConfig.BASE_URL): Boolean {
        val u = parse(url) ?: return false
        if (u.scheme?.lowercase(Locale.ROOT) != "https" || u.rawUserInfo != null) return false
        if (u.port != -1 && u.port != 443) return false
        val host = u.host?.lowercase(Locale.ROOT) ?: return false
        return host in trustedHosts(baseUrl) || host == "github.com"
    }

    private fun hostOf(url: String): String? = parse(url)?.host?.lowercase(Locale.ROOT)

    private fun parse(url: String?): URI? {
        if (url.isNullOrBlank() || url.length > 4096) return null
        if (url.any { it == '\\' || it.code < 0x20 || it.code == 0x7f || it == ' ' }) return null
        return try {
            URI(url)
        } catch (e: Exception) {
            null
        }
    }
}
