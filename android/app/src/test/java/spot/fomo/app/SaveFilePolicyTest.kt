package spot.fomo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SaveFilePolicyTest {

    @Test
    fun keepsOrdinaryNames() {
        assertEquals("SBER_1h.csv", SaveFilePolicy.sanitizeName("SBER_1h.csv", "text/csv"))
        assertEquals("BTCUSDT-1m.png", SaveFilePolicy.sanitizeName("BTCUSDT-1m.png", "image/png"))
        assertEquals("Отчёт 2026.csv", SaveFilePolicy.sanitizeName("Отчёт 2026.csv", "text/csv"))
    }

    @Test
    fun stripsPathsAndReservedCharacters() {
        assertEquals("passwd", SaveFilePolicy.sanitizeName("../../etc/passwd", null))
        assertEquals("evil.csv", SaveFilePolicy.sanitizeName("C:\\Users\\x\\evil.csv", "text/csv"))
        assertEquals("a_b_c.csv", SaveFilePolicy.sanitizeName("a<b>c.csv", "text/csv"))
        assertEquals("ab.csv", SaveFilePolicy.sanitizeName("a\u0000b\n.csv", "text/csv"))
        assertEquals("hidden.csv", SaveFilePolicy.sanitizeName("...hidden.csv", "text/csv"))
        assertEquals("trail", SaveFilePolicy.sanitizeName("trail. . ", null))
    }

    @Test
    fun emptyNameBecomesDownloadWithExtensionFromMime() {
        assertEquals("download.csv", SaveFilePolicy.sanitizeName("", "text/csv;charset=utf-8"))
        assertEquals("download.png", SaveFilePolicy.sanitizeName(null, "image/png"))
        assertEquals("download", SaveFilePolicy.sanitizeName("///", null))
        assertEquals("data.csv", SaveFilePolicy.sanitizeName("data", "text/csv"))
        assertEquals("data.bin", SaveFilePolicy.sanitizeName("data.bin", "text/csv"))
    }

    @Test
    fun longNameIsCutButKeepsTheExtension() {
        val n = SaveFilePolicy.sanitizeName("x".repeat(300) + ".csv", "text/csv")
        assertEquals(SaveFilePolicy.MAX_NAME, n.length)
        assertTrue(n.endsWith(".csv"))
        val noExt = SaveFilePolicy.sanitizeName("y".repeat(300), null)
        assertEquals(SaveFilePolicy.MAX_NAME, noExt.length)
    }

    @Test
    fun blocksRunnableTypes() {
        assertTrue(SaveFilePolicy.isBlocked("update.apk"))
        assertTrue(SaveFilePolicy.isBlocked("SETUP.EXE"))
        assertTrue(SaveFilePolicy.isBlocked("run.sh"))
        assertFalse(SaveFilePolicy.isBlocked("candles.csv"))
        assertFalse(SaveFilePolicy.isBlocked("apk"))
    }

    @Test
    fun mimeIsNormalised() {
        assertEquals("text/csv", SaveFilePolicy.normalizeMime("text/csv;charset=utf-8"))
        assertEquals("image/png", SaveFilePolicy.normalizeMime(" IMAGE/PNG "))
        assertEquals(SaveFilePolicy.DEFAULT_MIME, SaveFilePolicy.normalizeMime(""))
        assertEquals(SaveFilePolicy.DEFAULT_MIME, SaveFilePolicy.normalizeMime("nonsense"))
        assertEquals(SaveFilePolicy.DEFAULT_MIME, SaveFilePolicy.normalizeMime(null))
    }

    @Test
    fun uniqueNameAddsCounterBeforeExtension() {
        val taken = mutableSetOf("a.csv", "a (1).csv", "noext", "noext (1)")
        assertEquals("free.csv", SaveFilePolicy.uniqueName("free.csv") { it in taken })
        assertEquals("a (2).csv", SaveFilePolicy.uniqueName("a.csv") { it in taken })
        assertEquals("noext (2)", SaveFilePolicy.uniqueName("noext") { it in taken })
        val all = SaveFilePolicy.uniqueName("z.csv") { true }
        assertTrue(all.startsWith("z (") && all.endsWith(").csv"))
    }

    @Test
    fun parsesDataUrls() {
        val b = SaveFilePolicy.parseDataUrl("data:image/png;base64,iVBORw0KGgo=")
        assertNotNull(b)
        assertEquals("image/png", b!!.mime)
        assertTrue(b.base64)
        assertEquals("iVBORw0KGgo=", b.payload)

        val t = SaveFilePolicy.parseDataUrl("data:text/csv;charset=utf-8,a%2Cb%0A1%2C2")
        assertNotNull(t)
        assertEquals("text/csv", t!!.mime)
        assertFalse(t.base64)

        assertEquals("text/plain", SaveFilePolicy.parseDataUrl("data:,hello")!!.mime)
        assertNull(SaveFilePolicy.parseDataUrl("data:image/png;base64"))
        assertNull(SaveFilePolicy.parseDataUrl("https://fomo.spot/x"))
        assertNull(SaveFilePolicy.parseDataUrl(null))
    }

    @Test
    fun percentDecodesToBytes() {
        assertEquals("a,b\n1,2", String(SaveFilePolicy.percentDecode("a%2Cb%0A1%2C2")!!, Charsets.UTF_8))
        assertEquals("é+", String(SaveFilePolicy.percentDecode("%C3%A9+")!!, Charsets.UTF_8))
        assertEquals("Отчёт", String(SaveFilePolicy.percentDecode("Отчёт")!!, Charsets.UTF_8))
        assertNull(SaveFilePolicy.percentDecode("%4"))
        assertNull(SaveFilePolicy.percentDecode("%zz1"))
    }

    @Test
    fun readsNameFromContentDisposition() {
        assertEquals("a.csv", SaveFilePolicy.nameFromDisposition("attachment; filename=\"a.csv\""))
        assertEquals("a b.csv", SaveFilePolicy.nameFromDisposition("attachment; filename*=UTF-8''a%20b.csv"))
        assertEquals("plain.png", SaveFilePolicy.nameFromDisposition("attachment; filename=plain.png"))
        assertNull(SaveFilePolicy.nameFromDisposition("attachment"))
        assertNull(SaveFilePolicy.nameFromDisposition(null))
    }
}
