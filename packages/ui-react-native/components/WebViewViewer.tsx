import {usePapyrusSafeAreaInsets} from './PapyrusSafeArea';
import {parseEpubReadingLocation} from './epubReadingLocation';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View, Alert } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import WebView, {
  type WebViewMessageEvent,
  type WebViewErrorEvent,
} from "react-native-webview";
import { createContextualAnnotation, useViewerStore } from "@papyrus-sdk/core";
import { Annotation, AnnotationMarkupStyle, DocumentEngine } from "@papyrus-sdk/types";
import { resolveMaxPageWidth } from "./pdfPageMetrics";
import {
  parseWebViewInteraction,
  parseWebViewState,
} from "./webViewState";

import { parseEpubAnnotationEvent, type EpubAnnotationEvent } from "./epubAnnotationEvents";
import { getStrings } from "../mobileStrings";

const runtimeAsset = require("../runtime/index.html");
type RuntimeSource = { html: string; baseUrl?: string } | { uri: string };

const resolveRuntimeSource = (asset: unknown): RuntimeSource => {
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
  detachWebView?: () => void;
  handleWebViewMessage?: (data: string) => void;
  getWebViewDocumentSessionId?: () => string;
  syncEpubAnnotations?: (annotations: Annotation[], documentId?: string, labels?: {comment:string}) => Promise<void>;
  getWebViewRuntimeSource?: () => unknown;
  getWebViewRuntimeConfig?: () => Record<string, string> | undefined;
};

interface WebViewViewerProps {
  engine: DocumentEngine;
  documentId?: string;
  documentType?: string;
  onDefineSelection?: (selection: {text:string;pageIndex:number}) => void;
  defineSelectionMode?: "selection" | "single-word";
  maxPageWidth?: number;
  onScrollOffset?: (offsetY: number) => void;
  onTap?: () => void;
}

const WebViewViewer: React.FC<WebViewViewerProps> = ({
  engine,
  documentType,
  documentId,
  onDefineSelection,
  defineSelectionMode,
  maxPageWidth,
  onScrollOffset,
  onTap,
}) => {
  const webViewRef = useRef<WebView>(null);
  const insets=usePapyrusSafeAreaInsets();
  const { pageTheme, epubReadingMode, setDocumentState, annotations, isLoaded, locale, annotationColor, annotationOpacity, addAnnotation, beginAnnotationDraft, setSelectedAnnotation } = useViewerStore();
  const [selection,setSelection] = useState<Extract<EpubAnnotationEvent,{kind:"selection"}> | null>(null);
  const t = getStrings(locale);
  const bridgeEngine = engine as WebViewBridgeEngine;
  const runtimeSource = useMemo(
    () =>
      resolveRuntimeSource(
        bridgeEngine.getWebViewRuntimeSource?.() ?? runtimeAsset
      ),
    [bridgeEngine]
  );
  const [runtimeHtml, setRuntimeHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if ("html" in runtimeSource) {
      setRuntimeHtml(runtimeSource.html);
      return () => {
        active = false;
      };
    }

    setRuntimeHtml(null);
    void fetch(runtimeSource.uri)
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.text();
      })
      .then((html) => {
        if (active) setRuntimeHtml(html);
      })
      .catch(() => {
        if (active) setRuntimeHtml(null);
      });

    return () => {
      active = false;
    };
  }, [runtimeSource]);

  const webViewSource = useMemo<RuntimeSource>(() => {
    if (runtimeHtml !== null) {
      return {
        html: runtimeHtml,
        baseUrl: "http://localhost:3005/",
      };
    }
    if ("uri" in runtimeSource) return { html: "" };
    return runtimeSource;
  }, [runtimeHtml, runtimeSource]);
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

    return () => {
      bridgeEngine.detachWebView?.();
    };
  }, [bridgeEngine]);

  useEffect(() => {
    setSelection(null);
  }, [engine,documentId]);

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    void bridgeEngine.syncEpubAnnotations?.(annotations,documentId,{comment:t.annotationNote}).catch(() => {
      // Store remains authoritative; resend on the next loaded snapshot.
      if (active) setSelection(null);
    });
    return () => {active=false;};
  }, [bridgeEngine, annotations,documentId,isLoaded,t.annotationNote]);

  const annotateSelection = (style:AnnotationMarkupStyle,note?:string, selected = selection) => {
    if (!selected || selected.session !== bridgeEngine.getWebViewDocumentSessionId?.() || !isLoaded) return;
    (note !== undefined ? beginAnnotationDraft : addAnnotation)(createContextualAnnotation({id:`annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,anchor:selected.anchor,pageIndex:selected.pageIndex,style,color:annotationColor,opacity:annotationOpacity,note}));
    setSelection(null);
  };

  useEffect(() => {
    if (!isLoaded) return;
    webViewRef.current?.postMessage(JSON.stringify({id:"epub-layout", kind:"set-epub-view-mode", payload:{epubMode:epubReadingMode, documentSessionId:bridgeEngine.getWebViewDocumentSessionId?.()}}));
  }, [isLoaded, epubReadingMode, bridgeEngine]);

  const sendSelectionCommand = (key: string) => {
    webViewRef.current?.postMessage(JSON.stringify({type: "epub-selection-action", id: "selection-menu", key,
      documentSessionId: bridgeEngine.getWebViewDocumentSessionId?.()}));
  };
  // WebView binds positional item IDs when the menu opens. Keep the order
  // stable while selection handles move; enforce Define eligibility on action.
  const selectionMenuItems = [
    {key: "copy", label: t.copy},
    ...(onDefineSelection ? [{key: "define", label: t.define}] : []),
    {key: "highlight", label: t.annotationHighlight},
    {key: "underline", label: t.annotationUnderline},
    {key: "strikeout", label: t.annotationStrikeout},
    {key: "comment", label: t.annotationNote},
    {key: "selectAll", label: t.selectAll},
  ];

  const handleMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    // Action messages carry a validated, current-session CFI snapshot from
    // the chapter iframe. WebView's selectedText only reads the root frame.
    let action: string | undefined;
    let annotationRaw = raw;
    try {
      const message = JSON.parse(raw);
      if(message.type === "event" && message.name === "EPUB_LOCATION" && message.payload?.documentSessionId === bridgeEngine.getWebViewDocumentSessionId?.()) {
        const location=parseEpubReadingLocation(message.payload.location);
        if(location)setDocumentState({epubLocation:location});
      }
      if(message.type === "event" && message.name === "EPUB_CONTENT_TAP" && message.payload?.documentSessionId === bridgeEngine.getWebViewDocumentSessionId?.())onTap?.();
      if (message.type === "event" && message.name === "EPUB_SELECTION_ACTION") {
        action = message.payload?.action;
        annotationRaw = JSON.stringify({...message, name: "EPUB_TEXT_SELECTED"});
      }
    } catch { /* The bridge parser handles other messages. */ }
    const annotationEvent = parseEpubAnnotationEvent(annotationRaw,bridgeEngine.getWebViewDocumentSessionId?.() ?? "",documentId);
    if (annotationEvent?.kind === "selection") {
      if (!action) setSelection(annotationEvent);
      else if (action === "copy") { Clipboard.setString(annotationEvent.text); setSelection(null); }
      else if (action === "define") {
        if (defineSelectionMode !== "single-word" || /^\S{1,64}$/.test(annotationEvent.text.trim())) onDefineSelection?.(annotationEvent);
        else Alert.alert(t.define, t.defineSingleWordHint);
        setSelection(null);
      } else if (["highlight", "underline", "strikeout", "comment"].includes(action)) {
        annotateSelection(action === "comment" ? "highlight" : action as AnnotationMarkupStyle,
          action === "comment" ? "" : undefined, annotationEvent);
      }
    }
    if (annotationEvent?.kind === "tap" && annotations.some(a => a.id === annotationEvent.id)) {setSelection(null);
      const group=annotations.filter(a=>annotationEvent.ids?.includes(a.id));
      if(group.length>1)Alert.alert(t.annotationNote,undefined,[...group.map(a=>({text:(a.noteContent || a.anchor?.quote || a.content || '').slice(0,100),onPress:()=>setSelectedAnnotation(a.id)})),{text:t.cancel,style:'cancel'}]);
      else setSelectedAnnotation(annotationEvent.id);
      return;}
    const interaction = parseWebViewInteraction(raw);
    if (interaction?.kind === "scroll") onScrollOffset?.(interaction.offsetY);
    if (interaction?.kind === "tap") onTap?.();

    const state = parseWebViewState(raw);
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
  const resolvedMaxPageWidth = resolveMaxPageWidth(maxPageWidth);
  const cappedWebViewStyle = resolvedMaxPageWidth
    ? {
        width: "100%" as const,
        maxWidth: resolvedMaxPageWidth,
        alignSelf: "center" as const,
      }
    : undefined;

  return (
    <View style={[styles.container,documentType === "epub" && {paddingTop:insets.top,paddingBottom:insets.bottom}]}>
      <WebView
        ref={webViewRef}
        source={webViewSource}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        menuItems={selectionMenuItems}
        onCustomMenuSelection={event => sendSelectionCommand(event.nativeEvent.key)}
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
        style={[styles.webview, cappedWebViewStyle]}
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
