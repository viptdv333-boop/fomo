package spot.fomo.app

import org.json.JSONArray
import org.json.JSONObject

/** Builders for the small scripts the app evaluates in the page. Values are always JSON-encoded, never concatenated raw. */
object Js {
    /** document.dispatchEvent(new CustomEvent(name, {detail})) — the site listens for these (src/lib/native-app.ts). */
    fun event(name: String, detail: JSONObject): String =
        "(function(){document.dispatchEvent(new CustomEvent(${JSONObject.quote(name)},{detail:$detail}));})();"

    fun nativePaste(file: FilePayload): String = event("fomo-native-paste", file.toJson())

    fun pushToken(token: String): String = event("fomo-native-push-token", JSONObject().put("token", token))

    /**
     * "Share to FOMO". The detail is also left in window.__fomoNativeShare because the event can fire before the page
     * has hydrated; the site takes it from there when it subscribes.
     */
    fun nativeShare(text: String, title: String, files: List<FilePayload>): String {
        val arr = JSONArray()
        files.forEach { arr.put(it.toJson()) }
        val detail = JSONObject().put("text", text).put("title", title).put("files", arr)
        return "(function(){var d=$detail;window.__fomoNativeShare=d;" +
            "document.dispatchEvent(new CustomEvent('fomo-native-share',{detail:d}));})();"
    }

    /** Resolves to the colour of the active <meta name="theme-color"> (media-query aware), or "". */
    const val READ_THEME_COLOR =
        "(function(){var l=document.querySelectorAll('meta[name=theme-color]');" +
            "for(var i=0;i<l.length;i++){var m=l[i];if(!m.media||window.matchMedia(m.media).matches)return m.content||'';}" +
            "return '';})()"

    /**
     * Tells the app whether the finger went down inside something that can still scroll up (the site scrolls inside
     * its own containers, so WebView.scrollY alone says nothing). Installed once per document.
     */
    const val INSTALL_SCROLL_PROBE =
        "(function(){if(window.__fomoScrollProbe)return;window.__fomoScrollProbe=1;" +
            "function up(el){while(el&&el!==document.documentElement){if(el.scrollTop>0){var o=getComputedStyle(el).overflowY;" +
            "if(o==='auto'||o==='scroll'||o==='overlay')return true;}el=el.parentElement;}" +
            "var s=document.scrollingElement||document.documentElement;return s.scrollTop>0;}" +
            "document.addEventListener('touchstart',function(e){try{FomoScroll.setCanScrollUp(up(e.target));}catch(_){}}," +
            "{passive:true,capture:true});})();"
}
