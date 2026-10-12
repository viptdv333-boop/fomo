package spot.fomo.app

/**
 * The system Back button, page half (MainActivity.setupBack): the site decides first (window.FomoBack, src/components/app/AppBackHandler.tsx:
 * close a sheet, collapse the chart, one screen up, to the home section) and only when it has no answer does the WebView history decide.
 * Pure Kotlin so it is unit-tested on the JVM (BackPolicyTest).
 */
object BackPolicy {

    /** How long the app waits for the page to answer before it falls back to the WebView history (a busy or hung page must not eat Back). */
    const val ASK_TIMEOUT_MS = 400L

    /**
     * Asks the page. Result (a JSON string): "handled" = the page went up / closed something, "home" = the page is at its home screen and has
     * nothing left to do (the app may minimise), "none" = no handler on this page (login, landing, an old page), "error" = the handler threw.
     */
    const val ASK_PAGE =
        "(function(){try{if(typeof window.FomoBack!=='function')return 'none';return window.FomoBack()?'handled':'home';}catch(e){return 'error';}})()"

    enum class Verdict {
        /** nothing more to do */
        HANDLED,

        /** the page is at home: minimise the app, do NOT walk the WebView history back */
        HOME,

        /** no usable answer: the old behaviour (WebView.goBack(), else minimise) */
        FALLBACK,
    }

    /** The raw evaluateJavascript result ("\"handled\"", "null", ...) -> what to do. A literal true (a bare FomoBack() result) counts as handled. */
    fun verdict(raw: String?): Verdict = when (raw?.trim()?.trim('"')) {
        "handled", "true" -> Verdict.HANDLED
        "home" -> Verdict.HOME
        else -> Verdict.FALLBACK
    }

    /** The page may be asked only while a page of our own site is shown (never an error page or a foreign one). */
    fun mayAskPage(url: String?, offlineShown: Boolean, webViewGone: Boolean, baseUrl: String = BuildConfig.BASE_URL): Boolean =
        !offlineShown && !webViewGone && UrlPolicy.isTrusted(url, baseUrl)

    /** What the Back button does first, in priority order (MainActivity.setupBack). */
    enum class Step {
        /** a <video> is shown full screen (WebChromeClient.onShowCustomView): leave it, nothing else */
        EXIT_VIDEO,

        /** the offline page is shown: hide it and go back / finish */
        OFFLINE,

        /** ask the page (window.FomoBack) */
        ASK_PAGE,

        /** the WebView history */
        HISTORY,
    }

    /** The full-screen video always goes first: Back must never close a screen or minimise the app while a video covers it. */
    fun step(videoFullscreen: Boolean, offlineShown: Boolean, mayAskPage: Boolean): Step = when {
        videoFullscreen -> Step.EXIT_VIDEO
        offlineShown -> Step.OFFLINE
        mayAskPage -> Step.ASK_PAGE
        else -> Step.HISTORY
    }
}
