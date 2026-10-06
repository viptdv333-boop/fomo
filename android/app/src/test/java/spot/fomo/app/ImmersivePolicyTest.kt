package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Test

class ImmersivePolicyTest {

    @Test
    fun appliesOnlyRealChanges() {
        assertEquals(true, ImmersivePolicy.shouldApply(want = true, current = false, locked = false))
        assertEquals(true, ImmersivePolicy.shouldApply(want = false, current = true, locked = false))
        assertEquals(false, ImmersivePolicy.shouldApply(want = true, current = true, locked = false))
        assertEquals(false, ImmersivePolicy.shouldApply(want = false, current = false, locked = false))
    }

    @Test
    fun neverHidesBarsBehindTheLock() {
        assertEquals(false, ImmersivePolicy.shouldApply(want = true, current = false, locked = true))
    }

    @Test
    fun alwaysAllowsGivingTheBarsBack() {
        assertEquals(true, ImmersivePolicy.shouldApply(want = false, current = true, locked = true))
    }

    @Test
    fun resetsWhenThePageLeavesTheTerminal() {
        assertEquals(false, ImmersivePolicy.resetOnNavigation(active = true, url = "https://fomo.spot/terminal"))
        assertEquals(false, ImmersivePolicy.resetOnNavigation(active = true, url = "https://fomo.spot/en/terminal?symbol=SBER"))
        assertEquals(true, ImmersivePolicy.resetOnNavigation(active = true, url = "https://fomo.spot/feed"))
        assertEquals(true, ImmersivePolicy.resetOnNavigation(active = true, url = null))
        assertEquals(false, ImmersivePolicy.resetOnNavigation(active = false, url = "https://fomo.spot/feed"))
    }
}
