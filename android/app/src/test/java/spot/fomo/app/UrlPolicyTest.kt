package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {
    private val base = "https://fomo.spot"

    @Test
    fun trustedOnlyForTheSiteOverHttps() {
        assertTrue(UrlPolicy.isTrusted("https://fomo.spot/", base))
        assertTrue(UrlPolicy.isTrusted("https://www.fomo.spot/ideas/1?x=1", base))
        assertTrue(UrlPolicy.isTrusted("https://FOMO.spot:443/x", base))
        assertFalse(UrlPolicy.isTrusted("http://fomo.spot/", base))
        assertFalse(UrlPolicy.isTrusted("https://fomo.spot.evil.com/", base))
        assertFalse(UrlPolicy.isTrusted("https://evilfomo.spot/", base))
        assertFalse(UrlPolicy.isTrusted("https://fomo.spot@evil.com/", base))
        assertFalse(UrlPolicy.isTrusted("https://evil.com\\@fomo.spot/", base))
        assertFalse(UrlPolicy.isTrusted("https://fomo.spot:8443/", base))
        assertFalse(UrlPolicy.isTrusted("javascript:alert(1)", base))
        assertFalse(UrlPolicy.isTrusted("file:///etc/passwd", base))
        assertFalse(UrlPolicy.isTrusted(null, base))
        assertFalse(UrlPolicy.isTrusted("", base))
    }

    @Test
    fun wwwBaseIsNormalised() {
        assertEquals(setOf("fomo.spot", "www.fomo.spot"), UrlPolicy.trustedHosts("https://www.fomo.spot"))
    }

    @Test
    fun schemes() {
        assertEquals("https", UrlPolicy.scheme("HTTPS://x"))
        assertEquals("mailto", UrlPolicy.scheme("mailto:a@b.c"))
        assertEquals("intent", UrlPolicy.scheme("intent://x#Intent;end"))
        assertNull(UrlPolicy.scheme("no scheme"))
        assertNull(UrlPolicy.scheme(null))
    }

    @Test
    fun sameOriginPathKeepsOnlyPaths() {
        assertEquals("/ideas/5?x=1", UrlPolicy.sameOriginPath("/ideas/5?x=1", base))
        assertEquals("/ideas/5", UrlPolicy.sameOriginPath("https://fomo.spot/ideas/5", base))
        assertEquals("/", UrlPolicy.sameOriginPath("https://www.fomo.spot", base))
        assertNull(UrlPolicy.sameOriginPath("//evil.com/x", base))
        assertNull(UrlPolicy.sameOriginPath("https://evil.com/x", base))
        assertNull(UrlPolicy.sameOriginPath("javascript:alert(1)", base))
        assertNull(UrlPolicy.sameOriginPath("/a\\b", base))
        assertNull(UrlPolicy.sameOriginPath("", base))
        assertNull(UrlPolicy.sameOriginPath(null, base))
    }

    @Test
    fun pullToRefreshIsOffWhereGesturesConflict() {
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/terminal"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/terminal/BTC"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/en/terminal"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/chat?room=general"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/messages"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/rooms/abc123"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/en/rooms/abc123"))
        assertTrue(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/roomsx"))
        assertTrue(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/"))
        assertTrue(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/ideas"))
        assertTrue(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/terminalx"))
        assertTrue(UrlPolicy.pullToRefreshAllowed("https://fomo.spot/calendar"))
    }

    @Test
    fun updateUrlMustBeHttpsOnTheSiteOrGithub() {
        assertTrue(UrlPolicy.isAllowedUpdateUrl("https://fomo.spot/app/fomo.apk", base))
        assertTrue(UrlPolicy.isAllowedUpdateUrl("https://github.com/owner/repo/releases/latest/download/fomo.apk", base))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("http://fomo.spot/app/fomo.apk", base))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("https://evil.com/fomo.apk", base))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("https://github.com@evil.com/fomo.apk", base))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("", base))
    }
}
