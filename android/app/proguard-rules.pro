# R8 keep rules for the WebView bridges: the page calls these by name, so they must not be renamed or removed.
-keepattributes JavascriptInterface
-keepclassmembers class spot.fomo.app.FomoBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class spot.fomo.app.ScrollBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class spot.fomo.app.OfflineBridge {
    @android.webkit.JavascriptInterface <methods>;
}
# Firebase brings its own consumer rules; the service is referenced from the manifest.
-keep class spot.fomo.app.FcmService
