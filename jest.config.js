/**
 * Minimal Jest config for the own-build React Native app.
 *
 * Runs the pure-logic modules under src/ (API client, BYO streaming,
 * blob style) in Node. Native modules (expo-secure-store,
 * @react-native-async-storage/async-storage) are mocked inside the
 * tests with { virtual: true }, so no native code is needed.
 *
 * Integration note: this config needs jest + ts-jest + typescript
 * as devDependencies, and package.json needs "test": "jest".
 * Run from ~/workspace/grokbot-own/rn with: npx jest
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
};
