const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * The default Metro config for React Native.
 * https://reactnative.dev/docs/metro
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
