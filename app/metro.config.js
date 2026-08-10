const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro config di default per React Native.
 * https://reactnative.dev/docs/metro
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
