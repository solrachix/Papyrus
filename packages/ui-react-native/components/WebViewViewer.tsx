import React, { useEffect, useMemo, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import WebView, {
  type WebViewMessageEvent,
  type WebViewErrorEvent,
} from "react-native-webview";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import { parseWebViewState } from "./webViewState";

const runtimeAsset = require("../runtime/index.html");
const resolveRuntimeSource = (asset: unknown) => {
  if (typeof asset === "string") {
    return { html: asset };
  }
  if (typeof asset === "number") {
    const resolved = Image.resolveAssetSource(asset);
    if (resolved?.uri) {
      return { uri: resolved.uri };
    }
  }
  if (
    asset &&
    typeof asset === "object" &&
    "uri" in asset
  ) {
    const uri = (asset as { uri?: string }).uri;
    if (uri) return { uri };
  }
  return { html: "" };
};

type WebViewBridge = {
  postMessage: (message: string) => void;
};

type WebViewBridgeEngine = DocumentEngine & {
  attachWebView?: (bridge: WebViewBridge) => void;
  handleWebViewMessage?: (data: string) => void;
  getWebViewRuntimeSource?: () => unknown;
  getWebViewRuntimeConfig?: () => Record<string, string> | undefined;
};

interface WebViewViewerProps {
  engine: DocumentEngine;
}

const WebViewViewer: React.FC<WebViewViewerProps> = ({ engine }) => {
  const webViewRef = useRef<WebView>(null);
  const { pageTheme } = useViewerStore();
  const bridgeEngine = engine as WebViewBridgeEngine;
  const runtimeSource = useMemo(
    () =>
      resolveRuntimeSource(
        bridgeEngine.getWebViewRuntimeSource?.() ?? runtimeAsset
      ),
    [bridgeEngine]
  );
  const runtimeConfig = bridgeEngine.getWebViewRuntimeConfig?.();
  const runtimeConfigScript = useMemo(() => {
    if (!runtimeConfig) return undefined;
    return `window.__PAPYRUS_RUNTIME_CONFIG__=${JSON.stringify(
      runtimeConfig
    )};true;`;
  }, [runtimeConfig]);

  useEffect(() => {
    bridgeEngine.attachWebView?.({
      postMessage: (message: string) => {
        if (__DEV__) {
          const preview =
            message.length > 200 ? `${message.slice(0, 200)}…` : message;
          console.log("[Papyrus WebView] send", preview);
        }
        webViewRef.current?.postMessage(message);
      },
    });
  }, [bridgeEngine]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const state = parseWebViewState(event.nativeEvent.data);
    if (state) {
      const viewerState = useViewerStore.getState();
      const nextState: Parameters<typeof viewerState.setDocumentState>[0] = {};
      if (
        state.currentPage !== undefined &&
        state.currentPage !== viewerState.currentPage
      ) {
        nextState.currentPage = state.currentPage;
      }
      if (
        state.pageCount !== undefined &&
        state.pageCount !== viewerState.pageCount
      ) {
        nextState.pageCount = state.pageCount;
      }
      if (Object.keys(nextState).length > 0) {
        viewerState.setDocumentState(nextState);
      }
    }
    if (__DEV__) {
      console.log("[Papyrus WebView] message", event.nativeEvent.data);
    }
    bridgeEngine.handleWebViewMessage?.(event.nativeEvent.data);
  };

  const handleLoadEnd = () => {
    if (__DEV__) {
      console.log("[Papyrus WebView] loaded");
    }
  };

  const handleError = (event: WebViewErrorEvent) => {
    if (__DEV__) {
      console.warn("[Papyrus WebView] error", event.nativeEvent);
    }
  };

  const themeOverlayStyle = useMemo(() => {
    switch (pageTheme) {
      case "sepia":
        return styles.themeSepia;
      case "dark":
        return styles.themeDark;
      case "high-contrast":
        return styles.themeContrast;
      default:
        return styles.themeNone;
    }
  }, [pageTheme]);

  const allowingReadAccessToURL = useMemo(() => {
    if (!runtimeSource || typeof runtimeSource !== "object") return undefined;
    if ("uri" in runtimeSource && runtimeSource.uri) {
      return runtimeSource.uri;
    }
    return undefined;
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={runtimeSource}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        injectedJavaScriptBeforeContentLoaded={runtimeConfigScript}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit
        setBuiltInZoomControls
        setDisplayZoomControls={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL={allowingReadAccessToURL}
        style={styles.webview}
      />
      <View
        pointerEvents="none"
        style={[styles.themeOverlay, themeOverlayStyle]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  themeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  themeNone: {
    backgroundColor: "transparent",
  },
  themeSepia: {
    backgroundColor: "rgba(244, 236, 216, 0.35)",
  },
  themeDark: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  themeContrast: {
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
});

export default WebViewViewer;
