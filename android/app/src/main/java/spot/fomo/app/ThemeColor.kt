package spot.fomo.app

import java.util.Locale

/** Parses CSS colours from <meta name="theme-color"> (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba()) into ARGB ints. Pure Kotlin. */
object ThemeColor {

    fun parse(raw: String?): Int? {
        val s = raw?.trim()?.lowercase(Locale.ROOT)?.removeSurrounding("\"")?.trim() ?: return null
        if (s.isEmpty()) return null
        if (s.startsWith("#")) return parseHex(s.substring(1))
        if (s.startsWith("rgb")) return parseRgb(s)
        return when (s) {
            "white" -> 0xFFFFFFFF.toInt()
            "black" -> 0xFF000000.toInt()
            else -> null
        }
    }

    private fun parseHex(h: String): Int? {
        if (!h.all { it in '0'..'9' || it in 'a'..'f' }) return null
        return when (h.length) {
            3 -> argb(255, h[0].digitToInt(16) * 17, h[1].digitToInt(16) * 17, h[2].digitToInt(16) * 17)
            6 -> argb(255, h.substring(0, 2).toInt(16), h.substring(2, 4).toInt(16), h.substring(4, 6).toInt(16))
            8 -> argb(255, h.substring(0, 2).toInt(16), h.substring(2, 4).toInt(16), h.substring(4, 6).toInt(16)) // alpha ignored: bars are opaque
            else -> null
        }
    }

    private fun parseRgb(s: String): Int? {
        val inner = s.substringAfter("(", "").substringBefore(")", "")
        if (inner.isEmpty()) return null
        val parts = inner.split(',', ' ', '/').filter { it.isNotBlank() }
        if (parts.size < 3) return null
        val ch = parts.take(3).map { it.trim().removeSuffix("%").toDoubleOrNull() ?: return null }
        val pct = parts[0].endsWith("%")
        val v = ch.map { (if (pct) it * 2.55 else it).toInt().coerceIn(0, 255) }
        return argb(255, v[0], v[1], v[2])
    }

    private fun argb(a: Int, r: Int, g: Int, b: Int): Int = (a shl 24) or (r shl 16) or (g shl 8) or b

    /** Perceived luminance 0..1 of an ARGB colour (decides dark or light status-bar icons). */
    fun luminance(argb: Int): Double {
        val r = (argb shr 16) and 0xFF
        val g = (argb shr 8) and 0xFF
        val b = argb and 0xFF
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    }
}
