import {usePapyrusSafeAreaInsets} from './PapyrusSafeArea';
import {parseEpubReadingLocation} from './epubReadingLocation';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Keyboard, Platform, StyleSheet, View, Alert, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import WebView, {
  type WebViewMessageEvent,
  type WebViewErrorEvent,
} from "react-native-webview";
import { createContextualAnnotation, useViewerStore } from "@papyrus-sdk/core";
import { Annotation, AnnotationMarkupStyle, DocumentEngine } from "@papyrus-sdk/types";
import { resolveMaxPageWidth } from "./pdfPageMetrics";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";
import {
  parseWebViewInteraction,
  parseWebViewState,
} from "./webViewState";

import { parseEpubAnnotationEvent, parseEpubInkErasedEvent, parseEpubSelectionGeometryEvent, resolveEpubInkMode, type EpubAnnotationEvent } from "./epubAnnotationEvents";
import { EpubSelectionMenu, type EpubSelectionMenuAction } from "./EpubSelectionMenu";
import { getReaderSheetPalette, toReaderSheetTheme } from "./readerSheetPresentation";
import { getStrings } from "../mobileStrings";
import {
  getReaderSelectionActionOptions,
  normalizeReaderSelectionActionId,
  READER_SELECTION_ACTIONS,
} from "./sharedReaderChrome/readerSelectionActions";

const runtimeAsset = require("../runtime/index.html");
type RuntimeSource = { html: string; baseUrl?: string } | { uri: string };

// EPUB page themes are applied inside the book (background and text), not
// as a tinted overlay on top of it.
const PAPYRUS_EPUB_PAGE_PALETTES: Record<string, {background: string; foreground: string | null; link: string | null}> = {
  normal: { background: "#fffdf8", foreground: null, link: null },
  sepia: { background: "#f1e7d5", foreground: "#292724", link: "#7a4b2a" },
  dark: { background: "#242326", foreground: "#f5f3ee", link: "#f0b7a8" },
  "high-contrast": { background: "#000000", foreground: "#ffffff", link: "#ffe066" },
};

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
  /** See ViewerProps.epubTargetTopInset. */
  epubTargetTopInset?: number;
}

/** Papyrus' floating top bar plus a little breathing room. */
export const DEFAULT_EPUB_TARGET_TOP_INSET = MOBILE_CHROME_METRICS.topbarHeight + 8;

const WebViewViewer: React.FC<WebViewViewerProps> = ({
  engine,
  documentType,
  documentId,
  onDefineSelection,
  defineSelectionMode,
  maxPageWidth,
  onScrollOffset,
  onTap,
  epubTargetTopInset = DEFAULT_EPUB_TARGET_TOP_INSET,
}) => {
  const webViewRef = useRef<WebView>(null);
  const insets=usePapyrusSafeAreaInsets();
  // The keyboard can change the bottom inset; resizing the EPUB WebView makes
  // epub.js blank and re-render the page. Re-read it on a real window change
  // or when the keyboard closes.
  const papyrusWindow = useWindowDimensions();
  const stableBottomInsetRef = useRef({ key: "", value: 0 });
  const [, setStableBottomInsetVersion] = useState(0);
  const stableBottomInsetKey = `${papyrusWindow.width}x${papyrusWindow.height}`;
  if (stableBottomInsetRef.current.key !== stableBottomInsetKey) {
    stableBottomInsetRef.current = { key: stableBottomInsetKey, value: insets.bottom };
  }
  const stableBottomInset = stableBottomInsetRef.current.value;
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      stableBottomInsetRef.current = { key: "", value: 0 };
      setStableBottomInsetVersion(version => version + 1);
    });
    return () => subscription.remove();
  }, []);
  const { pageTheme, epubReadingMode, epubTypography, epubCustomFonts, setDocumentState, annotations, isLoaded, locale, annotationColor, annotationOpacity, inkStrokeWidth, activeTool, activeDrawToolPreset, addAnnotation, removeAnnotation, beginAnnotationDraft, setSelectedAnnotation } = useViewerStore();
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
    // Inline runtime HTML must have the same base URL on its first render.
    // Otherwise the effect changes the WebView source after ready and can lose the load.
    const html = "html" in runtimeSource ? runtimeSource.html : runtimeHtml;
    if (html !== null) {
      return {
        html,
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

  const annotateSelection = (style:AnnotationMarkupStyle,note?:string, selected = selection, color = annotationColor) => {
    if (!selected || selected.session !== bridgeEngine.getWebViewDocumentSessionId?.() || !isLoaded) return;
    (note !== undefined ? beginAnnotationDraft : addAnnotation)(createContextualAnnotation({id:`annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,anchor:selected.anchor,pageIndex:selected.pageIndex,style,color,opacity:annotationOpacity,note}));
    setSelection(null);
  };

  useEffect(() => {
    if (!isLoaded) return;
    webViewRef.current?.postMessage(JSON.stringify({id:"epub-layout", kind:"set-epub-view-mode", payload:{epubMode:epubReadingMode, documentSessionId:bridgeEngine.getWebViewDocumentSessionId?.()}}));
  }, [isLoaded, epubReadingMode, bridgeEngine]);

  useEffect(() => {
    if (!isLoaded || documentType !== "epub") return;
    const inkMode=resolveEpubInkMode({documentType,isLoaded,activeTool,preset:activeDrawToolPreset,color:annotationColor,opacity:annotationOpacity,strokeWidth:inkStrokeWidth});
    if(!inkMode)return;
    webViewRef.current?.postMessage(JSON.stringify({id:`epub-ink-mode-${Date.now()}`,kind:"set-epub-ink-mode",payload:{
      ...inkMode,
      documentSessionId:bridgeEngine.getWebViewDocumentSessionId?.(),
    }}));
  }, [isLoaded,documentType,activeTool,activeDrawToolPreset,annotationColor,annotationOpacity,inkStrokeWidth,bridgeEngine]);

  // Android draws its own selection menu (EpubSelectionMenu): the native
  // action mode only fits a few text items and overflows near the right edge.
  // An empty menuItems list makes react-native-webview start an action mode
  // without items, which suppresses the native toolbar while keeping the
  // selection handles. iOS keeps the native UIMenu with menuItems below.
  const useCustomSelectionMenu = Platform.OS === "android" && documentType === "epub";
  const [selectionMenuScrolling, setSelectionMenuScrolling] = useState(false);
  const selectionScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHighlightColorRef = useRef<string | null>(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const [webViewOffset, setWebViewOffset] = useState({ x: 0, y: 0 });
  useEffect(() => () => {
    if (selectionScrollTimerRef.current) clearTimeout(selectionScrollTimerRef.current);
  }, []);
  const hideSelectionMenuWhileScrolling = () => {
    if (!useCustomSelectionMenu) return;
    setSelectionMenuScrolling(true);
    if (selectionScrollTimerRef.current) clearTimeout(selectionScrollTimerRef.current);
    // The menu reappears at the selection's new position once scrolling settles.
    selectionScrollTimerRef.current = setTimeout(() => setSelectionMenuScrolling(false), 220);
  };
  const sendSelectionCommand = (key: string) => {
    webViewRef.current?.postMessage(JSON.stringify({type: "epub-selection-action", id: "selection-menu", key,
      documentSessionId: bridgeEngine.getWebViewDocumentSessionId?.()}));
  };
  // WebView binds positional item IDs when the menu opens. Keep the order
  // stable while selection handles move; enforce Define eligibility on action.
  const selectionMenuItems = [
    ...getReaderSelectionActionOptions(locale)
      .filter(action => action.id !== READER_SELECTION_ACTIONS.consult || Boolean(onDefineSelection))
      .map(action => ({key: action.id, label: action.label})),
    {key: "strikeout", label: t.annotationStrikeout},
    {key: "selectAll", label: t.selectAll},
  ];

  const handleCustomSelectionAction = (action: EpubSelectionMenuAction) => {
    sendSelectionCommand(action);
    setSelection(null);
  };
  const handleCustomSelectionHighlight = (color: string) => {
    pendingHighlightColorRef.current = color;
    sendSelectionCommand("highlight");
    setSelection(null);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    const geometry = parseEpubSelectionGeometryEvent(raw, bridgeEngine.getWebViewDocumentSessionId?.() ?? "");
    if (geometry?.kind === "cleared") setSelection(null);
    if (geometry?.kind === "rect") setSelection(current => current ? {...current, rect: geometry.rect} : current);
    const erasedInkId = parseEpubInkErasedEvent(raw, bridgeEngine.getWebViewDocumentSessionId?.() ?? "");
    // removeAnnotation records an undo step, so the dock's undo restores it.
    if (erasedInkId && useViewerStore.getState().annotations.some(a => a.id === erasedInkId && a.type === "ink")) removeAnnotation(erasedInkId);
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
        action = normalizeReaderSelectionActionId(message.payload?.action) ?? message.payload?.action;
        annotationRaw = JSON.stringify({...message, name: "EPUB_TEXT_SELECTED"});
      }
    } catch { /* The bridge parser handles other messages. */ }
    const annotationEvent = parseEpubAnnotationEvent(annotationRaw,bridgeEngine.getWebViewDocumentSessionId?.() ?? "",documentId);
    if (annotationEvent?.kind === "selection") {
      if (!action) setSelection(annotationEvent);
      else if (action === "copy") { Clipboard.setString(annotationEvent.text); setSelection(null); }
      else if (action === READER_SELECTION_ACTIONS.consult) {
        if (defineSelectionMode !== "single-word" || /^\S{1,64}$/.test(annotationEvent.text.trim())) onDefineSelection?.(annotationEvent);
        else Alert.alert(t.define, t.defineSingleWordHint);
        setSelection(null);
      } else if (["highlight", "underline", "strikeout", READER_SELECTION_ACTIONS.note].includes(action)) {
        // A colour dot in the custom menu picks the highlight colour.
        const color = action === "highlight" && pendingHighlightColorRef.current ? pendingHighlightColorRef.current : annotationColor;
        annotateSelection(action === READER_SELECTION_ACTIONS.note ? "highlight" : action as AnnotationMarkupStyle,
          action === READER_SELECTION_ACTIONS.note ? "" : undefined, annotationEvent, color);
      }
      if (action) pendingHighlightColorRef.current = null;
    }
    if (annotationEvent?.kind === "tap" && annotations.some(a => a.id === annotationEvent.id)) {setSelection(null);
      const group=annotations.filter(a=>annotationEvent.ids?.includes(a.id));
      if(group.length>1)Alert.alert(t.annotationNote,undefined,[...group.map(a=>({text:(a.noteContent || a.anchor?.quote || a.content || '').slice(0,100),onPress:()=>setSelectedAnnotation(a.id)})),{text:t.cancel,style:'cancel'}]);
      else setSelectedAnnotation(annotationEvent.id);
      return;}
    if (annotationEvent?.kind === "ink" && isLoaded && annotationEvent.session === bridgeEngine.getWebViewDocumentSessionId?.()) {
      addAnnotation(annotationEvent.annotation);
      setSelection(null);
    }
    const interaction = parseWebViewInteraction(raw);
    if (interaction?.kind === "scroll") {
      onScrollOffset?.(interaction.offsetY);
      if (selection) hideSelectionMenuWhileScrolling();
    }
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

  const epubPagePalette = documentType === "epub" ? PAPYRUS_EPUB_PAGE_PALETTES[pageTheme] || PAPYRUS_EPUB_PAGE_PALETTES.normal : null;
  useEffect(() => {
    if (!isLoaded || documentType !== "epub") return;
    webViewRef.current?.postMessage(JSON.stringify({ id: `epub-theme-${Date.now()}`, kind: "set-epub-theme", payload: { theme: epubPagePalette } }));
  }, [isLoaded, documentType, epubPagePalette]);
  useEffect(() => {
    if (!isLoaded || documentType !== "epub") return;
    webViewRef.current?.postMessage(JSON.stringify({ id: `epub-fonts-${Date.now()}`, kind: "set-epub-fonts", payload: { fonts: epubCustomFonts } }));
  }, [isLoaded, documentType, epubCustomFonts]);
  useEffect(() => {
    if (!isLoaded || documentType !== "epub") return;
    // The runtime ignores unchanged values, so a reload does not reflow.
    webViewRef.current?.postMessage(JSON.stringify({ id: `epub-typography-${Date.now()}`, kind: "set-epub-typography", payload: { typography: epubTypography } }));
  }, [isLoaded, documentType, epubTypography]);
  useEffect(() => {
    if (!isLoaded || documentType !== "epub") return;
    // Chapter-scroll: TOC/annotation targets land below the floating top chrome.
    webViewRef.current?.postMessage(JSON.stringify({ id: `epub-target-inset-${Date.now()}`, kind: "set-epub-target-inset", payload: { top: epubTargetTopInset } }));
  }, [isLoaded, documentType, epubTargetTopInset]);
  const themeOverlayStyle = useMemo(() => {
    if (documentType === "epub") return styles.themeNone;
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
  }, [pageTheme, documentType]);

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
    <View onLayout={(event: LayoutChangeEvent) => {const {width,height}=event.nativeEvent.layout;setContainerLayout(current=>current.width===width&&current.height===height?current:{width,height});}} style={[styles.container,documentType === "epub" && {paddingTop:insets.top,paddingBottom:stableBottomInset},epubPagePalette && {backgroundColor:epubPagePalette.background}]}>
      <WebView
        ref={webViewRef}
        source={webViewSource}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        menuItems={useCustomSelectionMenu ? [] : selectionMenuItems}
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
        onLayout={(event: LayoutChangeEvent) => {const {x,y}=event.nativeEvent.layout;setWebViewOffset(current=>current.x===x&&current.y===y?current:{x,y});}}
        style={[styles.webview, cappedWebViewStyle]}
      />
      <View
        pointerEvents="none"
        style={[styles.themeOverlay, themeOverlayStyle]}
      />
      {useCustomSelectionMenu && selection?.rect && !selectionMenuScrolling && activeTool !== "ink" ? (
        <EpubSelectionMenu
          anchor={{...selection.rect, x: selection.rect.x + webViewOffset.x, y: selection.rect.y + webViewOffset.y}}
          container={containerLayout}
          topInset={insets.top}
          bottomInset={stableBottomInset}
          locale={locale}
          palette={getReaderSheetPalette(toReaderSheetTheme(pageTheme))}
          canConsult={Boolean(onDefineSelection)}
          onHighlight={handleCustomSelectionHighlight}
          onAction={handleCustomSelectionAction}
        />
      ) : null}
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
