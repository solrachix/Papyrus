import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  UIManager,
  View,
  findNodeHandle,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DocumentSource, DocumentType } from '@papyrus-sdk/types';
import { MobileDocumentEngine, PapyrusPageView } from '@papyrus-sdk/engine-native';
import WebViewViewer from './WebViewViewer';

type CoverPreviewProps = {
  source: DocumentSource;
  type?: DocumentType;
  pageIndex?: number;
  visible?: boolean;
  keepAlive?: boolean;
  allowInteraction?: boolean;
  renderScale?: number;
  showLoading?: boolean;
  loadingIndicator?: React.ReactNode;
  placeholder?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: Error) => void;
};

const parseDataUri = (value: string): { mime: string } | null => {
  const match = /^data:([^;,]+)?(;base64)?,/.exec(value);
  if (!match) return null;
  return { mime: match[1] ?? '' };
};

const inferDocumentType = (source: DocumentSource, explicitType?: DocumentType): DocumentType => {
  if (explicitType) return explicitType;
  if (typeof source === 'string') {
    const dataUri = parseDataUri(source);
    if (dataUri?.mime) {
      const mime = dataUri.mime.toLowerCase();
      if (mime.includes('epub')) return 'epub';
      if (mime.includes('text')) return 'text';
      if (mime.includes('pdf')) return 'pdf';
    }
    const clean = source.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
    if (ext === 'epub') return 'epub';
    if (ext === 'txt') return 'text';
    if (ext === 'pdf') return 'pdf';
    return 'pdf';
  }
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    const clean = source.uri.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
    if (ext === 'epub') return 'epub';
    if (ext === 'txt') return 'text';
    if (ext === 'pdf') return 'pdf';
  }
  return 'pdf';
};

const CoverPreview: React.FC<CoverPreviewProps> = ({
  source,
  type,
  pageIndex = 0,
  visible = true,
  keepAlive = false,
  allowInteraction = false,
  renderScale = 2,
  showLoading = true,
  loadingIndicator,
  placeholder,
  style,
  onLoadStart,
  onLoadEnd,
  onError,
}) => {
  const [engine, setEngine] = useState<MobileDocumentEngine | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const viewRef = useRef<any>(null);

  const resolvedType = useMemo(() => inferDocumentType(source, type), [source, type]);
  const isPdf = resolvedType === 'pdf';
  const hasNativePageView = Boolean(UIManager.getViewManagerConfig?.('PapyrusPageView'));
  const canRender = !isPdf || hasNativePageView;
  const shouldRender = Boolean(visible);

  useEffect(() => {
    if (!shouldRender) {
      if (!keepAlive) {
        setEngine(null);
        setLoaded(false);
        setError(null);
      }
      return;
    }
    if (!engine && canRender) {
      setEngine(new MobileDocumentEngine());
    }
  }, [shouldRender, keepAlive, engine, canRender]);

  useEffect(() => {
    if (!engine || !shouldRender || !canRender) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError(null);
    onLoadStart?.();
    const loadInput = type ? { type, source } : source;
    engine
      .load(loadInput)
      .then(() => {
        if (!active) return;
        if (!isPdf && pageIndex > 0) {
          engine.goToPage(pageIndex + 1);
        }
        setLoaded(true);
        setLoading(false);
        onLoadEnd?.();
      })
      .catch((err) => {
        if (!active) return;
        const errorValue = err instanceof Error ? err : new Error('[Papyrus] Failed to load document');
        setError(errorValue);
        setLoading(false);
        onError?.(errorValue);
      });
    return () => {
      active = false;
    };
  }, [engine, shouldRender, canRender, source, type, pageIndex, isPdf, onLoadStart, onLoadEnd, onError]);

  useEffect(() => {
    if (!engine || !isPdf || !loaded || !layoutReady || !shouldRender || !canRender) return;
    const viewTag = findNodeHandle(viewRef.current);
    if (!viewTag) return;
    engine.renderPage(pageIndex, viewTag, renderScale);
  }, [engine, isPdf, loaded, layoutReady, shouldRender, canRender, pageIndex, renderScale]);

  useEffect(() => {
    return () => {
      engine?.destroy();
    };
  }, [engine]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setLayoutReady(true);
    }
  };

  if (!shouldRender || !canRender) {
    return (
      <View style={[styles.container, style]}>
        {placeholder ?? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Preview</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      <View style={styles.previewFrame} pointerEvents={allowInteraction ? 'auto' : 'none'}>
        {isPdf ? (
          <PapyrusPageView ref={viewRef} style={styles.pageView} />
        ) : (
          engine && <WebViewViewer engine={engine} />
        )}
      </View>
      {showLoading && loading && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          {loadingIndicator ?? <ActivityIndicator size="small" color="#2563eb" />}
        </View>
      )}
      {error && (
        <View pointerEvents="none" style={styles.errorOverlay}>
          <Text style={styles.errorText}>Preview unavailable</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewFrame: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  pageView: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8fafc',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  placeholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
});

export default CoverPreview;
