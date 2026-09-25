// Fork-only: lets EAS read this project's config.
//
// app.json carries native build-script expressions for the version fields (a Gradle expression for
// android.versionCode, Xcode $(VARS) for the iOS version/buildNumber) that upstream's GitHub Actions
// release builds fill in. EAS validates the config against the Expo schema and rejects them. EAS reads
// the config through a plain `expo config` child process, so there is no reliable "EAS is asking" signal;
// instead the expressions are kept only on GitHub Actions and replaced with the values they fall back to
// everywhere else.
const keepNativeVersionExpressions = process.env.GITHUB_ACTIONS === 'true';

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const linked = {
    ...config,
    owner: 'ajfg297-org',
    // This fork's Expo project (expo.dev), which the dev client and EAS builds are tied to.
    extra: {
      ...config.extra,
      eas: {
        .../** @type {Record<string, unknown> | undefined} */ (config.extra?.eas),
        projectId: '9afe290c-7b5c-40d9-b867-72c891d69c88',
      },
    },
  };
  if (keepNativeVersionExpressions) {
    return linked;
  }
  return {
    ...linked,
    android: { ...linked.android, versionCode: 1, version: '1.0.0' },
    ios: { ...linked.ios, version: '1.0.0', buildNumber: '1' },
  };
};
