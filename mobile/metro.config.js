const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * blockList: keep Metro's file watcher out of native build-artifact dirs
 * (android/build, android/app/build, android/app/.cxx, android/.gradle,
 * ios/build, ios/Pods). On Windows without watchman, the C++/CMake build
 * creates and deletes transient temp folders fast enough that Metro's fallback
 * watcher crashes (ENOENT) trying to watch one that just vanished. Excluding
 * these dirs prevents that. A single combined RegExp avoids depending on
 * metro-config's internal `exclusionList` helper (not exported in newer Metro).
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList:
      /(?:.*[\\/])?(?:android[\\/](?:app[\\/])?(?:build|\.cxx|\.gradle)|ios[\\/](?:build|Pods))[\\/].*/,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
