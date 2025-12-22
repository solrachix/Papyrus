/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { NativeDocumentEngine } from '@papyrus/engine-native';
import { useViewerStore } from '@papyrus/core';
import { PapyrusConfig } from '@papyrus/types';
import { Viewer, Topbar, ToolDock, RightSheet, AnnotationEditor, BottomBar, SettingsSheet } from '@papyrus/ui-react-native';

const LOCAL_WEB_PDF = Image.resolveAssetSource(require('./assets/tracemonkey-pldi-09.pdf'));
const SAMPLE_PDF = Image.resolveAssetSource(require('./assets/sample.pdf'));
const DEFAULT_PDF_URL = 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
const DEFAULT_PDF = LOCAL_WEB_PDF?.uri
  ? { uri: LOCAL_WEB_PDF.uri }
  : SAMPLE_PDF?.uri
    ? { uri: SAMPLE_PDF.uri }
    : { uri: DEFAULT_PDF_URL };

const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialPage: 4,
  initialZoom: 1.0,
  initialLocale: 'pt-BR',
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
  const [engine] = useState(() => new NativeDocumentEngine());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isLoaded, setDocumentState, initializeStore, triggerScrollToPage, uiTheme } = useViewerStore();

  useEffect(() => {
    initializeStore(INITIAL_SDK_CONFIG);

    const init = async () => {
      try {
        await engine.load(DEFAULT_PDF);
        if (INITIAL_SDK_CONFIG.initialZoom) engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
        if (INITIAL_SDK_CONFIG.initialPage) engine.goToPage(INITIAL_SDK_CONFIG.initialPage);

        setDocumentState({
          isLoaded: true,
          pageCount: engine.getPageCount(),
          outline: await engine.getOutline(),
        });

        if (INITIAL_SDK_CONFIG.initialPage) {
          triggerScrollToPage(INITIAL_SDK_CONFIG.initialPage - 1);
        }
      } catch (err) {
        console.error('[Papyrus RN] Engine init failed', err);
      }
    };

    init();
    return () => engine.destroy();
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="small" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, uiTheme === 'dark' && styles.containerDark]}>
      <Topbar engine={engine} onOpenSettings={() => setSettingsOpen(true)} />
      <View style={styles.viewer}>
        <Viewer engine={engine} />
        <ToolDock />
      </View>
      <BottomBar />
      <RightSheet engine={engine} />
      <SettingsSheet engine={engine} visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AnnotationEditor />
    </SafeAreaView>
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
