const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [],
  resolver: {
    blockList: [
      // Exclude Android/iOS build artifacts so Metro doesn't watch temp CMake dirs
      new RegExp(path.join(__dirname, 'android', '.cxx').replace(/\\/g, '\\\\')),
      new RegExp(path.join(__dirname, 'android', 'build').replace(/\\/g, '\\\\')),
      new RegExp(path.join(__dirname, 'ios', 'build').replace(/\\/g, '\\\\')),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
