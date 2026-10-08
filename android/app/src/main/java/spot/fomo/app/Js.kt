package spot.fomo.app

import org.json.JSONArray
import org.json.JSONObject

/** Builders for the small scripts the app evaluates in the page. Values are always JSON-encoded, never concatenated raw. */
object Js {
    /** document.dispatchEvent(new CustomEvent(name, {detail})) — the site listens for these (src/lib/native-app.ts). */
    fun event(name: String, detail: JSONObject): String =
        "(function(){document.dispatchEvent(new CustomEvent(${JSONObject.quote(name)},{detail:$detail}));})();"

    fun nativePaste(file: FilePayload): String = event("fomo-native-paste", file.toJson())

    /** The app took the system bars back on its own (it was stopped): the chart of the page must leave its full screen. */
    const val IMMERSIVE_RESET = "(function(){document.dispatchEvent(new CustomEvent('fomo-native-immersive-reset'));})();"

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

    /**
     * Reads a blob: URL in the page and hands it to the saveFile* bridge in 384 KB pieces (a multiple of 3 bytes, so every base64 piece
     * stands on its own). The app has already shown its own toast for every error that comes back from the bridge; a failure inside
     * the page (blob revoked, read error) is reported with saveFileFailed.
     */
    fun saveBlob(url: String, name: String, mime: String): String =
        "(function(u,n,m){var B=window.FomoApp;if(!B||!B.saveFileBegin)return;" +
            "function fail(t){try{B.saveFileFailed(t||'');}catch(_){}}" +
            "fetch(u).then(function(r){return r.blob();}).then(function(b){" +
            "var r=B.saveFileBegin(n,m||b.type||'application/octet-stream');if(String(r).indexOf('ok:')!==0)return;" +
            "var t=String(r).slice(3),C=393216,i=0;" +
            "function next(){if(i>=b.size){B.saveFileEnd(t);return;}var s=b.slice(i,i+C);i+=C;var fr=new FileReader();" +
            "fr.onload=function(){var d=String(fr.result);if(B.saveFileChunk(t,d.slice(d.indexOf(',')+1))==='ok')next();};" +
            "fr.onerror=function(){fail(t);};fr.readAsDataURL(s);}next();" +
            "}).catch(function(){fail('');});})(${JSONObject.quote(url)},${JSONObject.quote(name)},${JSONObject.quote(mime)});"
}
