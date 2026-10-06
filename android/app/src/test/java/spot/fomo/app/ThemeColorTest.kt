package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeColorTest {
    @Test
    fun parsesHexAndRgb() {
        assertEquals(0xFF0A0A0A.toInt(), ThemeColor.parse("#0a0a0a"))
        assertEquals(0xFFFFFFFF.toInt(), ThemeColor.parse("#fff"))
        assertEquals(0xFF16A34A.toInt(), ThemeColor.parse("\"#16A34A\""))
        assertEquals(0xFF102030.toInt(), ThemeColor.parse("rgb(16, 32, 48)"))
        assertEquals(0xFF102030.toInt(), ThemeColor.parse("rgba(16,32,48,0.5)"))
        assertEquals(0xFF000000.toInt(), ThemeColor.parse("black"))
    }

    @Test
    fun rejectsGarbage() {
        assertNull(ThemeColor.parse(""))
        assertNull(ThemeColor.parse("\"\""))
        assertNull(ThemeColor.parse(null))
        assertNull(ThemeColor.parse("#12"))
        assertNull(ThemeColor.parse("#gggggg"))
        assertNull(ThemeColor.parse("rgb(1,2)"))
        assertNull(ThemeColor.parse("hotpink"))
    }

    @Test
    fun luminanceSeparatesLightFromDark() {
        assertTrue(ThemeColor.luminance(0xFFFFFFFF.toInt()) > 0.9)
        assertTrue(ThemeColor.luminance(0xFF0A0A0A.toInt()) < 0.1)
    }
}
