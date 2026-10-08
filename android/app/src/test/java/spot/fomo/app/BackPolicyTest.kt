package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Test

class BackPolicyTest {
    private val base = "https://fomo.spot"

    @Test
    fun handledAnswers() {
        assertEquals(BackPolicy.Verdict.HANDLED, BackPolicy.verdict("\"handled\""))
        assertEquals(BackPolicy.Verdict.HANDLED, BackPolicy.verdict("true"))
    }

    @Test
    fun homeMinimisesWithoutWalkingTheHistory() {
        assertEquals(BackPolicy.Verdict.HOME, BackPolicy.verdict("\"home\""))
    }

    @Test
    fun noUsableAnswerFallsBackToTheWebViewHistory() {
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict(null))
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict("null"))
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict("\"none\""))
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict("\"error\""))
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict("false"))
        assertEquals(BackPolicy.Verdict.FALLBACK, BackPolicy.verdict(""))
    }

    @Test
    fun theScriptNeverThrowsAndNamesTheHandler() {
        assertEquals(true, BackPolicy.ASK_PAGE.contains("window.FomoBack"))
        assertEquals(true, BackPolicy.ASK_PAGE.contains("catch"))
    }

    @Test
    fun theWaitIsShort() {
        assertEquals(true, BackPolicy.ASK_TIMEOUT_MS in 200L..1000L)
    }

    @Test
    fun onlyOurOwnPageIsAsked() {
        assertEquals(true, BackPolicy.mayAskPage("https://fomo.spot/feed", offlineShown = false, webViewGone = false, baseUrl = base))
        assertEquals(false, BackPolicy.mayAskPage("https://fomo.spot/feed", offlineShown = true, webViewGone = false, baseUrl = base))
        assertEquals(false, BackPolicy.mayAskPage("https://fomo.spot/feed", offlineShown = false, webViewGone = true, baseUrl = base))
        assertEquals(false, BackPolicy.mayAskPage("https://evil.example/feed", offlineShown = false, webViewGone = false, baseUrl = base))
        assertEquals(false, BackPolicy.mayAskPage(null, offlineShown = false, webViewGone = false, baseUrl = base))
    }
}
