package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** UrlPolicy for the second site: the terminal flavor (BASE_URL https://terminal.fomo.spot) and the isolation from https://fomo.spot. */
class TerminalFlavorTest {
    private val terminal = "https://terminal.fomo.spot"
    private val main = "https://fomo.spot"

    @Test
    fun terminalHostsAreTrustedForTheTerminalBase() {
        assertEquals(setOf("terminal.fomo.spot", "www.terminal.fomo.spot"), UrlPolicy.trustedHosts(terminal))
        assertTrue(UrlPolicy.isTrusted("https://terminal.fomo.spot/", terminal))
        assertTrue(UrlPolicy.isTrusted("https://www.terminal.fomo.spot/terminal?x=1", terminal))
        assertTrue(UrlPolicy.isTrusted("https://TERMINAL.fomo.spot:443/calendar", terminal))
    }

    @Test
    fun theMainSiteIsNotTrustedForTheTerminalAndViceVersa() {
        assertFalse(UrlPolicy.isTrusted("https://fomo.spot/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://www.fomo.spot/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://terminal.fomo.spot/", main))
        assertFalse(UrlPolicy.isTrusted("https://www.terminal.fomo.spot/", main))
    }

    @Test
    fun lookalikesAndDowngradesAreRejected() {
        assertFalse(UrlPolicy.isTrusted("http://terminal.fomo.spot/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://terminal.fomo.spot.evil.com/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://evilterminal.fomo.spot/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://terminal.fomo.spot@evil.com/", terminal))
        assertFalse(UrlPolicy.isTrusted("https://terminal.fomo.spot:8443/", terminal))
    }

    @Test
    fun sameOriginPathOnlyAcceptsTheOwnSite() {
        assertEquals("/terminal", UrlPolicy.sameOriginPath("https://terminal.fomo.spot/terminal", terminal))
        assertEquals("/calendar?d=1", UrlPolicy.sameOriginPath("/calendar?d=1", terminal))
        assertNull(UrlPolicy.sameOriginPath("https://fomo.spot/ideas/5", terminal))
        assertNull(UrlPolicy.sameOriginPath("https://terminal.fomo.spot/x", main))
    }

    @Test
    fun updateUrlMustBeOnTheOwnSiteOrGithub() {
        assertTrue(UrlPolicy.isAllowedUpdateUrl("https://terminal.fomo.spot/app/dl/FOMO-Terminal.apk", terminal))
        assertTrue(UrlPolicy.isAllowedUpdateUrl("https://github.com/x/y/releases/download/v1/FOMO-Terminal.apk", terminal))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("https://fomo.spot/app/fomo.apk", terminal))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("http://terminal.fomo.spot/app/dl/FOMO-Terminal.apk", terminal))
        assertFalse(UrlPolicy.isAllowedUpdateUrl("https://terminal.fomo.spot/app/dl/FOMO-Terminal.apk", main))
    }

    @Test
    fun terminalPageStillCountsAsTerminal() {
        assertTrue(UrlPolicy.isTerminal("https://terminal.fomo.spot/terminal"))
        assertFalse(UrlPolicy.pullToRefreshAllowed("https://terminal.fomo.spot/en/terminal/BTC"))
    }
}
