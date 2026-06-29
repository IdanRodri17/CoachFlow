/// <reference types="nativewind/types" />
// This file teaches TypeScript two NativeWind facts. Do not delete.
//
// 1) The /// reference above makes React Native components accept a `className`
//    prop. Without it, TS would flag className as an unknown prop on <View>/<Text>.
//
// 2) The declaration below lets us `import "./global.css"` as a side effect
//    (the stylesheet is consumed by Metro, not TypeScript) without a TS2882 error.
declare module "*.css";
