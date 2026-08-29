import React, { useContext } from "react";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import type { MobileSafeAreaInsets } from "./mobileChromeMetrics";

const papyrusSafeAreaContext =
  SafeAreaInsetsContext as unknown as React.Context<
    MobileSafeAreaInsets | null
  >;

export const ZERO_SAFE_AREA_INSETS: MobileSafeAreaInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

export const usePapyrusSafeAreaInsets = (): MobileSafeAreaInsets =>
  useContext(papyrusSafeAreaContext) ?? ZERO_SAFE_AREA_INSETS;

export function PapyrusSafeAreaBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const insets = useContext(papyrusSafeAreaContext);
  if (insets) return <>{children}</>;
  return React.createElement(SafeAreaProvider, null, children as never);
}
