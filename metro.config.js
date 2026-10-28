// Metro config: paksa `three` ke build ESM (three.module.js).
// three 0.186 CJS (three.cjs) manggil process.emitWarning (API Node.js)
// yang TIDAK ADA di React Native/Hermes -> crash "undefined is not a function" saat startup.
// R3F (CJS) require('three') -> Metro harus resolve ke ESM build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return context.resolveRequest(context, 'three/build/three.module.js', platform);
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
