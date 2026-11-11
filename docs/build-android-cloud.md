# Build Android APK in the cloud container (no EAS)

Used when asked to "build the app" and no `EXPO_TOKEN` is available. Run:

```bash
nohup scripts/build-android-cloud.sh > /tmp/build.log 2>&1 &   # run in background, then watch the log
```

Result: `android/app/build/outputs/apk/release/app-release.apk` (arm64 only,
signed with the default debug key — fine for testing, not for the Play Store).
Send it to the user with `SendUserFile` from the scratchpad directory.

## What was learned (do not retry the dead ends)

- **EAS is not an option here**: `eas whoami` → "Not logged in", no `EXPO_TOKEN`,
  and the user declined the credential request. Build locally instead.
- Java 21 and Gradle are preinstalled; the **Android SDK is not**. It is
  installed to `/opt/android-sdk` (cmdline-tools 11076708, platform 36,
  build-tools 36.0.0). `dl.google.com` is reachable.
- **Maven Central (`repo.maven.apache.org`) returns HTTP 429** through the proxy,
  so Gradle fails with "Plugin org.jetbrains.kotlin.jvm … was not found" or
  "Could not resolve …". Retrying does not fix it. The fix is the Gradle init
  script (in the build script) redirecting to
  `https://maven-central.storage-download.googleapis.com/maven2/`. `plugins.gradle.org`
  and `maven.google.com` work as is.
- Run Gradle **in the background**: a foreground call is cut by the tool timeout,
  and the "completed" notification of the launching shell is not the build's end.
  Wait for `BUILD SUCCESSFUL|FAILED` in the log.
- `android/` and `ios/` are git-ignored (CNG): never commit them.
- Building only `arm64-v8a` keeps it fast: last run **2 min 57 s** with warm
  caches; the first run (SDK + dependency downloads) is much longer.
- The container is ephemeral: SDK, Gradle caches and the init script vanish
  with it, so the script recreates them.
- Jest cannot load native-only modules (`expo-video` crashes at import): keep
  such components out of `src/ui/index.ts` (see `AttachmentViewer`).
