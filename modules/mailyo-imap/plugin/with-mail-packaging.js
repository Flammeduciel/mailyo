// Config plugin: JavaMail for Android and its activation library both ship
// META-INF license files; the app must drop the duplicates when packaging.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// mailyo-imap: exclude duplicate JavaMail metadata';
const BLOCK = `
${MARKER}
android {
    packaging {
        resources {
            // Only the license files collide. The javamail.* and mailcap files must
            // stay: JavaMail finds its IMAP/SMTP providers and MIME handlers there.
            excludes += ['META-INF/LICENSE.md', 'META-INF/NOTICE.md', 'META-INF/LICENSE.txt', 'META-INF/NOTICE.txt']
        }
    }
}
`;

module.exports = function withMailPackaging(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += BLOCK;
    }
    return mod;
  });
};
