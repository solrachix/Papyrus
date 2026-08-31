type NativeModuleRegistry = Record<string, unknown>;

type ModuleRegistry = {
  nativeModules: NativeModuleRegistry;
  turboModuleRegistry: { get: (name: string) => unknown };
};

export const resolvePapyrusNativeModule = <T>(
  registries: ModuleRegistry,
): T | null => {
  const turboModule = registries.turboModuleRegistry.get(
    "PapyrusNativeEngine",
  ) as T | null;
  if (turboModule) return turboModule;

  return (registries.nativeModules.PapyrusNativeEngine as T | undefined) ?? null;
};
