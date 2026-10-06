package spot.fomo.app

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSpecTest {

    @Test
    fun defaultsAreTheSafeOnes() {
        assertFalse("the lock is opt-in", SettingsSpec.DEFAULT_LOCK_ENABLED)
        assertEquals("15", SettingsSpec.DEFAULT_LOCK_TIMEOUT)
        assertEquals(15, LockPolicy.parseTimeoutMinutes(SettingsSpec.DEFAULT_LOCK_TIMEOUT))
        assertFalse(SettingsSpec.DEFAULT_HIDE_CONTENT)
        assertTrue("pull-to-refresh worked before the settings existed", SettingsSpec.DEFAULT_PULL_TO_REFRESH)
        assertFalse("a screen that never sleeps is opt-in", SettingsSpec.DEFAULT_KEEP_SCREEN_ON)
        assertTrue("haptics worked before the settings existed", SettingsSpec.DEFAULT_HAPTIC)
    }

    @Test
    fun keysAreUnique() {
        val keys = listOf(
            SettingsSpec.KEY_LOCK_ENABLED, SettingsSpec.KEY_LOCK_TIMEOUT, SettingsSpec.KEY_HIDE_CONTENT,
            SettingsSpec.KEY_PULL_TO_REFRESH, SettingsSpec.KEY_KEEP_SCREEN_ON, SettingsSpec.KEY_HAPTIC,
        )
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test
    fun everyTimeoutChoiceIsAKnownPolicyValue() {
        val values = Regex("<item>(\\d+)</item>")
            .findAll(resource("values/strings_settings.xml").substringAfter("lock_timeout_values"))
            .map { it.groupValues[1].toInt() }
            .toList()
        assertEquals(LockPolicy.TIMEOUT_MINUTES, values)
    }

    /** res/xml/settings.xml and SettingsSpec must carry the same keys and defaults, or the screen and the code disagree. */
    @Test
    fun preferenceXmlMatchesTheSpec() {
        val xml = resource("xml/settings.xml")
        fun defaultOf(key: String): String {
            val tag = Regex("<[A-Za-z]+[^>]*app:key=\"$key\"[^>]*>", RegexOption.DOT_MATCHES_ALL).find(xml)?.value
            requireNotNull(tag) { "no preference with key $key" }
            return Regex("app:defaultValue=\"([^\"]*)\"").find(tag)?.groupValues?.get(1) ?: ""
        }
        assertEquals(SettingsSpec.DEFAULT_LOCK_ENABLED.toString(), defaultOf(SettingsSpec.KEY_LOCK_ENABLED))
        assertEquals(SettingsSpec.DEFAULT_LOCK_TIMEOUT, defaultOf(SettingsSpec.KEY_LOCK_TIMEOUT))
        assertEquals(SettingsSpec.DEFAULT_HIDE_CONTENT.toString(), defaultOf(SettingsSpec.KEY_HIDE_CONTENT))
        assertEquals(SettingsSpec.DEFAULT_PULL_TO_REFRESH.toString(), defaultOf(SettingsSpec.KEY_PULL_TO_REFRESH))
        assertEquals(SettingsSpec.DEFAULT_KEEP_SCREEN_ON.toString(), defaultOf(SettingsSpec.KEY_KEEP_SCREEN_ON))
        assertEquals(SettingsSpec.DEFAULT_HAPTIC.toString(), defaultOf(SettingsSpec.KEY_HAPTIC))
    }

    @Test
    fun notificationChannelIdsStayStable() {
        // Installed phones own these channels; renaming one silently orphans the owner's melody / importance choice.
        assertEquals(listOf("messages", "terminal", "calendar", "general"), Notifications.ALL_CHANNELS)
    }

    @Test
    fun terminalPageIsRecognisedWithAndWithoutALanguagePrefix() {
        assertTrue(UrlPolicy.isTerminal("https://fomo.spot/terminal"))
        assertTrue(UrlPolicy.isTerminal("https://fomo.spot/terminal/BTCUSDT?x=1"))
        assertTrue(UrlPolicy.isTerminal("https://fomo.spot/en/terminal"))
        assertFalse(UrlPolicy.isTerminal("https://fomo.spot/"))
        assertFalse(UrlPolicy.isTerminal("https://fomo.spot/terminals"))
        assertFalse(UrlPolicy.isTerminal("https://fomo.spot/ideas/terminal"))
        assertFalse(UrlPolicy.isTerminal(null))
    }

    private fun resource(path: String): String {
        // Gradle runs unit tests with the module directory (android/app) as the working directory
        val candidates = listOf(File("src/main/res/$path"), File("app/src/main/res/$path"))
        val file = candidates.firstOrNull { it.exists() } ?: error("cannot find $path from ${File(".").absolutePath}")
        return file.readText(Charsets.UTF_8)
    }
}
