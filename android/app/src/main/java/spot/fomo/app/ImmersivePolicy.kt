package spot.fomo.app

/**
 * When the system bars may be hidden for the full-screen chart (FomoApp.setImmersive) and when the app must give them back
 * on its own. Pure Kotlin so it is unit-tested on the JVM (ImmersivePolicyTest). The orientation is never touched: the chart
 * is full screen in whatever orientation the device is in.
 */
object ImmersivePolicy {

    /** A change is applied only when it is one, and never hides the bars while the app lock is up. */
    fun shouldApply(want: Boolean, current: Boolean, locked: Boolean): Boolean = want != current && !(want && locked)

    /** The bars come back by themselves when the page that asked for them is no longer the terminal. */
    fun resetOnNavigation(active: Boolean, url: String?): Boolean = active && !UrlPolicy.isTerminal(url)
}
