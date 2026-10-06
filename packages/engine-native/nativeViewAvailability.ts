export type NativeViewManagerRegistry = {
  hasViewManagerConfig?: (name: string) => boolean;
};

export const isNativeViewManagerRegistered = (
  registry: NativeViewManagerRegistry,
  managerName: string
): boolean => {
  if (typeof registry.hasViewManagerConfig !== "function") return false;

  try {
    return registry.hasViewManagerConfig(managerName);
  } catch {
    return false;
  }
};
