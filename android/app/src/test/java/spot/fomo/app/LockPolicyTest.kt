package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LockPolicyTest {
    private val minute = 60_000L

    @Test
    fun timeoutValuesAreParsedAndUnknownOnesFallBackToOneMinute() {
        assertEquals(0, LockPolicy.parseTimeoutMinutes("0"))
        assertEquals(1, LockPolicy.parseTimeoutMinutes("1"))
        assertEquals(5, LockPolicy.parseTimeoutMinutes("5"))
        assertEquals(15, LockPolicy.parseTimeoutMinutes(" 15 "))
        assertEquals(1, LockPolicy.parseTimeoutMinutes(null))
        assertEquals(1, LockPolicy.parseTimeoutMinutes(""))
        assertEquals(1, LockPolicy.parseTimeoutMinutes("abc"))
        assertEquals(1, LockPolicy.parseTimeoutMinutes("7"))
        assertEquals(1, LockPolicy.parseTimeoutMinutes("-5"))
        assertEquals(LockPolicy.DEFAULT_TIMEOUT_MINUTES, LockPolicy.parseTimeoutMinutes("999999999999"))
    }

    @Test
    fun timeoutInMilliseconds() {
        assertEquals(0L, LockPolicy.timeoutMs(0))
        assertEquals(minute, LockPolicy.timeoutMs(1))
        assertEquals(15 * minute, LockPolicy.timeoutMs(15))
        assertEquals(0L, LockPolicy.timeoutMs(-3))
    }

    @Test
    fun neverLocksWhenDisabledOrWhenTheAppDidNotLeave() {
        assertFalse(LockPolicy.shouldLock(false, 0L, 10 * minute, 0L, false))
        // null = the app never went to the background (first start, rotation of the settings screen)
        assertFalse(LockPolicy.shouldLock(true, null, 10 * minute, 0L, false))
    }

    @Test
    fun immediatelyLocksOnAnyLeave() {
        assertTrue(LockPolicy.shouldLock(true, 1_000L, 1_000L, LockPolicy.timeoutMs(0), false))
        assertTrue(LockPolicy.shouldLock(true, 1_000L, 1_500L, LockPolicy.timeoutMs(0), false))
    }

    @Test
    fun locksOnlyAfterTheTimeoutHasPassed() {
        val t = LockPolicy.timeoutMs(1)
        assertFalse(LockPolicy.shouldLock(true, 1_000L, 1_000L + t - 1, t, false))
        assertTrue(LockPolicy.shouldLock(true, 1_000L, 1_000L + t, t, false))
        assertTrue(LockPolicy.shouldLock(true, 1_000L, 1_000L + 2 * t, t, false))

        val fifteen = LockPolicy.timeoutMs(15)
        assertFalse(LockPolicy.shouldLock(true, 0L, 14 * minute, fifteen, false))
        assertTrue(LockPolicy.shouldLock(true, 0L, 15 * minute, fifteen, false))
    }

    @Test
    fun ourOwnTripToASystemScreenGetsAGraceEvenForImmediately() {
        val now = 30_000L // 30 s away: the picker, the camera or the PIN screen
        assertFalse(LockPolicy.shouldLock(true, 0L, now, LockPolicy.timeoutMs(0), true))
        assertFalse(LockPolicy.shouldLock(true, 0L, now, LockPolicy.timeoutMs(1), true))
        // ...but not forever: after the grace the app locks like a normal leave
        assertTrue(LockPolicy.shouldLock(true, 0L, LockPolicy.EXTERNAL_FLOW_GRACE_MS, LockPolicy.timeoutMs(0), true))
        // a longer configured timeout is never shortened by the grace
        assertFalse(LockPolicy.shouldLock(true, 0L, LockPolicy.EXTERNAL_FLOW_GRACE_MS + 1, LockPolicy.timeoutMs(5), true))
    }

    @Test
    fun aClockGoingBackwardsFailsClosed() {
        assertTrue(LockPolicy.shouldLock(true, 5_000L, 1_000L, LockPolicy.timeoutMs(15), false))
    }
}
