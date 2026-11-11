#!/usr/bin/env bash
# Build a release APK (arm64) inside the Claude Code cloud container, without EAS.
# Known-good recipe — see docs/build-android-cloud.md for why each step exists.
set -euo pipefail

export ANDROID_HOME=/opt/android-sdk
cd "$(dirname "$0")/.."

# 1. Android SDK (skipped when already present).
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fsS -o /tmp/cmdtools.zip \
    https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q -o /tmp/cmdtools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null

# 2. Maven Central answers 429 through the cloud proxy: use Google's mirror.
mkdir -p "$HOME/.gradle/init.d"
cat > "$HOME/.gradle/init.d/mirror.gradle" <<'GRADLE'
def mirror = 'https://maven-central.storage-download.googleapis.com/maven2/'
def swap = { repos ->
  repos.all { r ->
    if (r instanceof MavenArtifactRepository && r.url.toString().contains('repo.maven.apache.org')) {
      r.url = mirror
    }
  }
}
beforeSettings { s -> swap(s.pluginManagement.repositories) }
allprojects { buildscript { swap(repositories) }; swap(repositories) }
settingsEvaluated { s -> swap(s.pluginManagement.repositories); swap(s.dependencyResolutionManagement.repositories) }
GRADLE

# 3. Generate the (git-ignored) native project, then build.
[ -d node_modules ] || npm ci --ignore-scripts
CI=1 npx expo prebuild --platform android --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
sed -i 's/-Xmx2048m/-Xmx6g/' android/gradle.properties

cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
echo "APK: $(pwd)/app/build/outputs/apk/release/app-release.apk"
