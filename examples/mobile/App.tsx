/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {
  SafeAreaView,
  View,
  ActivityIndicator,
  StyleSheet,
  Image,
  Platform,
  StatusBar,
  Pressable,
  Text,
} from 'react-native';
import {MobileDocumentEngine} from '@papyrus-sdk/engine-native';
import {useViewerStore} from '@papyrus-sdk/core';
import {PapyrusConfig} from '@papyrus-sdk/types';
import {
  ReadingShell,
  ToolDock,
  AnnotationEditor,
} from '@papyrus-sdk/ui-react-native';

const BUNDLED_ASSETS = {
  './assets/tracemonkey-pldi-09.pdf': require('./assets/tracemonkey-pldi-09.pdf'),
  './assets/sample.pdf': require('./assets/sample.pdf'),
} as const;

const resolveBundledAsset = (assetPath: keyof typeof BUNDLED_ASSETS) => {
  if (process.env.JEST_WORKER_ID) return null;
  return Image.resolveAssetSource(BUNDLED_ASSETS[assetPath]);
};

const LOCAL_WEB_PDF = resolveBundledAsset('./assets/tracemonkey-pldi-09.pdf');
const SAMPLE_PDF = resolveBundledAsset('./assets/sample.pdf');
const DEFAULT_PDF_URL =
  'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
const DEFAULT_PDF = LOCAL_WEB_PDF?.uri
  ? {uri: LOCAL_WEB_PDF.uri}
  : SAMPLE_PDF?.uri
  ? {uri: SAMPLE_PDF.uri}
  : {uri: DEFAULT_PDF_URL};
const SAMPLE_EPUB_BASE64 =
  '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';
const SAMPLE_EPUB_DATA_URI = `data:application/epub+zip;base64,${SAMPLE_EPUB_BASE64}`;
const SAMPLE_TEXT =
  'Papyrus SDK\\n\\nThis is a text sample rendered by the mobile WebView runtime.';

const ACCENT_COLOR = '#2563eb';
const VIEWER_VIRTUAL_WINDOW_SIZE = 8;
const VIEWER_MAX_TO_RENDER_PER_BATCH = 6;
const THUMBS_INITIAL_COUNT = 4;
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialPage: 4,
  initialZoom: 1.0,
  initialLocale: 'pt-BR',
  initialAccentColor: ACCENT_COLOR,
  sidebarLeftOpen: true,
  initialAnnotations: [
    {
      id: 'mock-1',
      pageIndex: 3,
      type: 'text',
      color: '#3b82f6',
      content: 'Loaded from initial config.',
      rect: {x: 0.1, y: 0.1, width: 0.2, height: 0.05},
      createdAt: Date.now(),
    },
  ],
};

const App: React.FC = () => {
  const [engine] = useState(() => new MobileDocumentEngine());
  const [activeType, setActiveType] = useState<'pdf' | 'epub' | 'text'>('pdf');
  const [isPicking, setIsPicking] = useState(false);
  const {
    isLoaded,
    setDocumentState,
    initializeStore,
    triggerScrollToPage,
    uiTheme,
    accentColor,
  } = useViewerStore();
  const Root = Platform.OS === 'ios' ? SafeAreaView : View;

  useEffect(() => {
    initializeStore(INITIAL_SDK_CONFIG);

    const init = async () => {
      await loadDocument('pdf');
    };

    init();
    return () => engine.destroy();
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

  const inferDocumentType = (
    name?: string,
    mimeType?: string,
    uri?: string,
  ) => {
    const lowerMime = (mimeType ?? '').toLowerCase();
    if (lowerMime.includes('pdf')) return 'pdf';
    if (lowerMime.includes('epub')) return 'epub';
    if (lowerMime.includes('text')) return 'text';

    const candidate = (name ?? uri ?? '')
      .split('?')[0]
      .split('#')[0]
      .toLowerCase();
    if (candidate.endsWith('.pdf')) return 'pdf';
    if (candidate.endsWith('.epub')) return 'epub';
    if (candidate.endsWith('.txt')) return 'text';
    return null;
  };

  const loadTextFromUri = async (uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to load local text (${response.status})`);
    }
    return response.text();
  };

  const loadDocumentFromSource = async (
    type: 'pdf' | 'epub' | 'text',
    source: unknown,
  ) => {
    setActiveType(type);
    setDocumentState({
      isLoaded: false,
      pageCount: 0,
      outline: [],
      currentPage: 1,
      searchResults: [],
      searchQuery: '',
      activeSearchIndex: -1,
    });

    try {
      await engine.load({type, source});

      if (INITIAL_SDK_CONFIG.initialZoom)
        engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
      const pageCount = engine.getPageCount();
      const outline = await engine.getOutline();
      setDocumentState({
        isLoaded: true,
        pageCount,
        outline,
      });

      if (INITIAL_SDK_CONFIG.initialPage) {
        const page = Math.max(
          1,
          Math.min(pageCount || 1, INITIAL_SDK_CONFIG.initialPage),
        );
        engine.goToPage(page);
        triggerScrollToPage(page - 1);
      }
    } catch (err) {
      console.error('[Papyrus RN] Engine load failed', err);
    }
  };

  const loadDocument = async (type: 'pdf' | 'epub' | 'text') => {
    if (type === 'pdf') {
      await loadDocumentFromSource('pdf', DEFAULT_PDF);
      return;
    }
    if (type === 'epub') {
      await loadDocumentFromSource('epub', SAMPLE_EPUB_DATA_URI);
      return;
    }
    await loadDocumentFromSource('text', SAMPLE_TEXT);
  };

  const openLocalDocument = async () => {
    if (isPicking) return;
    setIsPicking(true);
    const documentPickerModule = (() => {
      try {
        // Lazy load prevents startup crash if native module is missing.
        return require('@react-native-documents/picker');
      } catch (error) {
        console.error('[Papyrus RN] Document picker module unavailable', error);
        return null;
      }
    })();

    if (!documentPickerModule) {
      setIsPicking(false);
      return;
    }

    try {
      const picks = await documentPickerModule.pick({
        type: [
          documentPickerModule.types.pdf,
          'application/epub+zip',
          documentPickerModule.types.plainText,
        ],
        mode: 'import',
      });
      const result = Array.isArray(picks) ? picks[0] : picks;

      const uri = result?.uri;
      if (!uri) return;

      const docType = inferDocumentType(result.name, result.type, uri);
      if (!docType) {
        console.warn(
          '[Papyrus RN] Unsupported file type',
          result.name,
          result.type,
        );
        return;
      }

      if (docType === 'text') {
        try {
          await loadDocumentFromSource('text', {uri});
        } catch {
          const text = await loadTextFromUri(uri);
          await loadDocumentFromSource('text', text);
        }
        return;
      }

      if (docType === 'epub') {
        await loadDocumentFromSource('epub', {uri});
        return;
      }

      await loadDocumentFromSource('pdf', {uri});
    } catch (err) {
      if (
        documentPickerModule.isErrorWithCode?.(err) &&
        err?.code === documentPickerModule.errorCodes?.OPERATION_CANCELED
      ) {
        return;
      }
      console.error('[Papyrus RN] Document picker failed', err);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <Root
      style={[styles.container, uiTheme === 'dark' && styles.containerDark]}>
      <StatusBar
        barStyle={uiTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={uiTheme === 'dark' ? '#0f1115' : '#ffffff'}
      />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={ACCENT_COLOR} />
        </View>
      )}
      <View style={styles.viewer}>
        <ReadingShell
          engine={engine}
          title="Papyrus Mobile"
          documentType={activeType}
          thumbsInitialCount={THUMBS_INITIAL_COUNT}
          viewerProps={{
            virtualWindowSize: VIEWER_VIRTUAL_WINDOW_SIZE,
            maxToRenderPerBatch: VIEWER_MAX_TO_RENDER_PER_BATCH,
            removeClippedSubviews: true,
          }}
        />
        <View
          pointerEvents="box-none"
          style={styles.documentSwitcherFrame}
          testID="papyrus-document-switcher">
          <View
            style={[
              styles.documentSwitcher,
              uiTheme === 'dark' && styles.documentSwitcherDark,
            ]}>
            <View style={styles.documentTypeRow}>
              {(['pdf', 'epub', 'text'] as const).map(type => {
                const isActive = type === activeType;
                return (
                  <Pressable
                    key={type}
                    onPress={() => loadDocument(type)}
                    style={[
                      styles.typeButton,
                      uiTheme === 'dark' && styles.typeButtonDark,
                      isActive && {backgroundColor: accentColor},
                    ]}>
                    <Text
                      style={[
                        styles.typeButtonText,
                        uiTheme === 'dark' && styles.typeButtonTextDark,
                        isActive && styles.typeButtonTextActive,
                      ]}>
                      {type.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={openLocalDocument}
              disabled={isPicking}
              style={[
                styles.openButton,
                uiTheme === 'dark' && styles.openButtonDark,
                isPicking && styles.openButtonDisabled,
              ]}>
              <Text style={styles.openButtonText}>
                {isPicking ? 'OPENING...' : 'OPEN FILE'}
              </Text>
            </Pressable>
          </View>
        </View>
        {activeType === 'pdf' ? <ToolDock /> : null}
      </View>
      <AnnotationEditor />
    </Root>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  containerDark: {
    backgroundColor: '#0f1115',
  },
  viewer: {
    flex: 1,
    position: 'relative',
  },
  documentSwitcherFrame: {
    position: 'absolute',
    top: 74,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 18,
    paddingHorizontal: 12,
  },
  documentSwitcher: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 12},
    elevation: 8,
    gap: 10,
  },
  documentSwitcherDark: {
    backgroundColor: 'rgba(15,17,21,0.86)',
    borderColor: 'rgba(71,85,105,0.44)',
  },
  documentTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(226,232,240,0.9)',
    flex: 1,
    alignItems: 'center',
  },
  typeButtonDark: {
    backgroundColor: 'rgba(17,24,39,0.92)',
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  typeButtonTextDark: {
    color: '#e5e7eb',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  openButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  openButtonDark: {
    borderColor: '#334155',
    backgroundColor: 'rgba(17,24,39,0.94)',
  },
  openButtonDisabled: {
    opacity: 0.6,
  },
  openButtonText: {
    letterSpacing: 0.6,
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 17, 21, 0.15)',
    zIndex: 5,
  },
});

export default App;
