module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reads .env at build time → `import { X } from '@env'`.
    // react-native-dotenv v3+ is a PLUGIN (not a preset).
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './src',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
    // react-native-worklets/plugin must be listed LAST (it powers reanimated v4).
    'react-native-worklets/plugin',
  ],
};
