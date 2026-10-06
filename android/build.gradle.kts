// Top-level build file. The Google Services plugin is only APPLIED in app/build.gradle.kts when app/google-services.json exists.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.google.services) apply false
}
