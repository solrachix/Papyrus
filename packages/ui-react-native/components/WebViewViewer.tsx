import React, { useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewErrorEvent } from 'react-native-webview';
import { useViewerStore } from '@papyrus-sdk/core';
import { DocumentEngine } from '@papyrus-sdk/types';

const runtimeAsset = require('../runtime/index.html');
const runtimeSource = (() => {
  if (typeof runtimeAsset === 'string') {
    return { html: runtimeAsset };
  }
  if (typeof runtimeAsset === 'number') {
    const resolved = Image.resolveAssetSource(runtimeAsset);
    if (resolved?.uri) {
      return { uri: resolved.uri };
    }
  }
  if (runtimeAsset && typeof runtimeAsset === 'object' && 'uri' in runtimeAsset) {
    const uri = (runtimeAsset as { uri?: string }).uri;
    if (uri) return { uri };
  }
  return { html: '' };
})();

type WebViewBridge = {
  postMessage: (message: string) => void;
};

type WebViewBridgeEngine = DocumentEngine & {
  attachWebView?: (bridge: WebViewBridge) => void;
  handleWebViewMessage?: (data: string) => void;
};

interface WebViewViewerProps {
  engine: DocumentEngine;
}

const WebViewViewer: React.FC<WebViewViewerProps> = ({ engine }) => {
  const webViewRef = useRef<WebView>(null);
  const { pageTheme } = useViewerStore();

  useEffect(() => {
    const bridgeEngine = engine as WebViewBridgeEngine;
    bridgeEngine.attachWebView?.({
      postMessage: (message: string) => {
        if (__DEV__) {
          const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
          console.log('[Papyrus WebView] send', preview);
        }
        webViewRef.current?.postMessage(message);
      },
    });
  }, [engine]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const bridgeEngine = engine as WebViewBridgeEngine;
    if (__DEV__) {
      console.log('[Papyrus WebView] message', event.nativeEvent.data);
    }
    bridgeEngine.handleWebViewMessage?.(event.nativeEvent.data);
  };

  const handleLoadEnd = () => {
    if (__DEV__) {
      console.log('[Papyrus WebView] loaded');
    }
  };

  const handleError = (event: WebViewErrorEvent) => {
    if (__DEV__) {
      console.warn('[Papyrus WebView] error', event.nativeEvent);
    }
  };

  const themeOverlayStyle = useMemo(() => {
    switch (pageTheme) {
      case 'sepia':
        return styles.themeSepia;
      case 'dark':
        return styles.themeDark;
      case 'high-contrast':
        return styles.themeContrast;
      default:
        return styles.themeNone;
    }
  }, [pageTheme]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={runtimeSource}
        originWhitelist={['*']}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        style={styles.webview}
      />
      <View pointerEvents="none" style={[styles.themeOverlay, themeOverlayStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  themeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  themeNone: {
    backgroundColor: 'transparent',
  },
  themeSepia: {
    backgroundColor: 'rgba(244, 236, 216, 0.35)',
  },
  themeDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  themeContrast: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
});

export default WebViewViewer;
