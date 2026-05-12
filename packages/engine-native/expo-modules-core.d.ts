declare module "expo-modules-core/src/NativeViewManagerAdapter" {
  export function requireNativeViewManager<T>(viewName: string): React.ComponentType<T>;
}

declare module "expo-modules-core/src/requireNativeModule" {
  export function requireOptionalNativeModule<T>(moduleName: string): T | null;
}
