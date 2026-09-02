import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, StatusBar, Pressable, Text, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MobileDocumentEngine } from '@papyrus-sdk/engine-native';
import { useViewerStore } from '@papyrus-sdk/core';
import type { PapyrusConfig } from '@papyrus-sdk/types';
import { Viewer, Topbar, ToolDock, RightSheet, AnnotationEditor, BottomBar, SettingsSheet, MobilePerfProvider, createPerfSession, createRunId } from '@papyrus-sdk/ui-react-native';
import { mobileFixtureRegistry } from './fixtureRegistry.generated';
import fixtureManifest from './assets/fixtures/fixture-manifest.json';
import { bootstrapFixtureLaunch } from './perf/fixtureStartup';
import { parsePapyrusReaderUrl, resolveFixtureLaunch } from './perf/fixtureSelection';
import { createDocumentLoadCoordinator } from './perf/documentLoadState';
import { textFixtures } from './perf/textFixtures';

const SAMPLE_EPUB_BASE64 =
  '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';
const SAMPLE_EPUB_DATA_URI = `data:application/epub+zip;base64,${SAMPLE_EPUB_BASE64}`;
const SAMPLE_TEXT = textFixtures.small;

const ACCENT_COLOR = '#2563eb';
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
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      createdAt: Date.now(),
    },
  ],
};

const App: React.FC = () => {
  const [engine] = useState(() => new MobileDocumentEngine());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeType, setActiveType] = useState<'pdf' | 'epub' | 'text'>('pdf');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadCoordinatorRef = useRef(createDocumentLoadCoordinator());
  const [perfSession, setPerfSession] = useState(() => createPerfSession({ enabled: false, context: { fixture: 'unknown' } }));
  const { isLoaded, setDocumentState, initializeStore, triggerScrollToPage, uiTheme, accentColor } = useViewerStore();
  const Root = View;

  useEffect(() => {
    initializeStore(INITIAL_SDK_CONFIG);

    const loadFixture = async (url: string | null, warm = false) => {
      const parsed = parsePapyrusReaderUrl(url);
      const resolvedLaunch = parsed.valid ? resolveFixtureLaunch(parsed) : null;
      const runId = resolvedLaunch?.runId ?? createRunId();
      const loadSession = createPerfSession({
        enabled: resolvedLaunch?.perfEnabled === true,
        context: {
          runId,
          sampleId: resolvedLaunch?.sampleId,
          documentLoadId: `${runId}-document-1`,
          fixture: resolvedLaunch?.fixture ?? 'unknown',
        },
        sink: (line) => console.log(`[Papyrus Perf] ${line}`),
      });
      if (!warm) {
        (globalThis as Record<string, unknown>).__PAPYRUS_MOBILE_PERF__ = loadSession.enabled;
        setPerfSession(loadSession);
      }
      const load = warm ? null : loadCoordinatorRef.current.start('pdf');
      if (load) {
        setLoadError(null);
        setActiveType('pdf');
        setDocumentState({ isLoaded: false, pageCount: 0, outline: [], currentPage: 1, searchResults: [], searchQuery: '', activeSearchIndex: -1 });
      }

      try {
        const result = await bootstrapFixtureLaunch({
          url,
          warm,
          engine,
          registry: mobileFixtureRegistry,
          manifest: fixtureManifest.fixtures.reduce((entries, fixture) => ({
            ...entries,
            [fixture.name]: fixture,
          }), {}),
          resolveAsset: (asset) => {
            const resolved = Image.resolveAssetSource(asset as number);
            if (!resolved?.uri) throw new Error('bundled fixture has no URI');
            return { uri: resolved.uri };
          },
          emit: (name, payload) => loadSession.emit(name, payload),
        });
        if (result.ignored || !result.resolved || !load) return;
        if (!loadCoordinatorRef.current.isCurrent(load)) return;
        const pageCount = result.pageCount;
        if (INITIAL_SDK_CONFIG.initialZoom) engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
        const outline = await engine.getOutline();
        if (!loadCoordinatorRef.current.isCurrent(load)) return;
        loadCoordinatorRef.current.finish(load, 'complete');
        setLoadError(null);
        setDocumentState({ isLoaded: true, pageCount, outline });
        if (INITIAL_SDK_CONFIG.initialPage) {
          const page = Math.max(1, Math.min(pageCount || 1, INITIAL_SDK_CONFIG.initialPage));
          engine.goToPage(page);
          triggerScrollToPage(page - 1);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (load && loadCoordinatorRef.current.finish(load, 'error')) {
          setLoadError(message);
        }
        console.error('[Papyrus Expo] Fixture load failed', err);
      }
    };

    void Linking.getInitialURL().then((url) => loadFixture(url));
    const subscription = Linking.addEventListener('url', ({ url }) => void loadFixture(url, true));
    return () => {
      subscription.remove();
      engine.destroy();
    };
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

  const loadDocument = async (type: 'pdf' | 'epub' | 'text') => {
    const load = loadCoordinatorRef.current.start(type);
    setLoadError(null);
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
      if (type === 'pdf') {
        const resolved = Image.resolveAssetSource(mobileFixtureRegistry.small);
        if (!resolved?.uri) throw new Error('small fixture has no URI');
        await engine.load({ uri: resolved.uri });
      } else if (type === 'epub') {
        await engine.load({ type: 'epub', source: SAMPLE_EPUB_DATA_URI });
      } else {
        await engine.load({ type: 'text', source: SAMPLE_TEXT });
      }

      if (!loadCoordinatorRef.current.isCurrent(load)) return;
      if (INITIAL_SDK_CONFIG.initialZoom) engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
      const pageCount = engine.getPageCount();
      const outline = await engine.getOutline();
      if (!loadCoordinatorRef.current.isCurrent(load)) return;
      loadCoordinatorRef.current.finish(load, 'complete');
      setDocumentState({
        isLoaded: true,
        pageCount,
        outline,
      });

      if (INITIAL_SDK_CONFIG.initialPage) {
        const page = Math.max(1, Math.min(pageCount || 1, INITIAL_SDK_CONFIG.initialPage));
        engine.goToPage(page);
        triggerScrollToPage(page - 1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!loadCoordinatorRef.current.isCurrent(load)) return;
      loadCoordinatorRef.current.finish(load, 'error');
      setLoadError(message);
      console.error('[Papyrus Expo] Engine load failed', err);
    }
  };

  return (
    <SafeAreaProvider>
      <MobilePerfProvider session={perfSession}>
      <Root style={[styles.container, uiTheme === 'dark' && styles.containerDark]}>
      <StatusBar
        barStyle={uiTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={uiTheme === 'dark' ? '#0f1115' : '#ffffff'}
      />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          {loadError ? (
            <Text style={styles.loadingError}>{`Não foi possível carregar o documento.\n${loadError}`}</Text>
          ) : (
            <ActivityIndicator size="small" color={ACCENT_COLOR} />
          )}
        </View>
      )}
      <Topbar engine={engine} onOpenSettings={() => setSettingsOpen(true)} />
      <View style={[styles.typeBar, uiTheme === 'dark' && styles.typeBarDark]}>
        {(['pdf', 'epub', 'text'] as const).map((type) => {
          const isActive = type === activeType;
          return (
            <Pressable
              key={type}
              onPress={() => loadDocument(type)}
              style={[
                styles.typeButton,
                uiTheme === 'dark' && styles.typeButtonDark,
                isActive && { backgroundColor: accentColor },
              ]}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  uiTheme === 'dark' && styles.typeButtonTextDark,
                  isActive && styles.typeButtonTextActive,
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.viewer}>
        <Viewer engine={engine} viewerMode="compat" />
        <ToolDock />
      </View>
      <BottomBar
        documentType={activeType}
        onOpenDestination={() => {}}
        onOpenInfo={() => {}}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <RightSheet engine={engine} documentType={activeType} />
      <SettingsSheet engine={engine} visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AnnotationEditor />
      </Root>
      </MobilePerfProvider>
    </SafeAreaProvider>
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
  typeBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  typeBarDark: {
    backgroundColor: '#0f1115',
    borderBottomColor: '#1f2937',
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  typeButtonDark: {
    backgroundColor: '#111827',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 17, 21, 0.15)',
    zIndex: 5,
  },
  loadingError: {
    maxWidth: '82%',
    color: '#b91c1c',
    textAlign: 'center',
  },
});

export default App;
