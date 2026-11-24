import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { IconClose } from "../icons";
import { ReaderOrientationModal } from "./ReaderOrientationModal";
import {
  getNativeSheetLayoutStyles,
  getNativeSheetSizeStyle,
} from "./nativeSheetLayout";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import {
  clampSheetDrag,
  shouldDismissSheetOnRelease,
  shouldStartSheetDismissDrag,
} from "./nativeSheetGesture";
import {
  getReaderSheetPalette,
  type ReaderSheetPalette,
  type ReaderSheetTheme,
} from "./readerSheetPresentation";

export type NativeSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  isDark?: boolean;
  sheetTheme?: ReaderSheetTheme;
  sheetPalette?: ReaderSheetPalette;
  maxHeight?: number | string;
  title?: string;
  closeAccessibilityLabel?: string;
  showHeader?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
  /**
   * Show the grab handle and let the user drag the sheet down to close it
   * (from the handle/header anytime, from the body when its scroll content
   * is at the top). Defaults to true; the close button stays available.
   */
  swipeToDismiss?: boolean;
};

/**
 * Scroll offset of the sheet's NativeSheetScrollView/NativeSheetFlatList, so
 * the body only starts a dismiss drag when the content is at the top.
 */
const NativeSheetScrollOffsetContext =
  React.createContext<React.MutableRefObject<number> | null>(null);

function useSheetScrollTracking<T extends NativeSyntheticEvent<NativeScrollEvent>>(
  onScroll?: ((event: T) => void) | null,
) {
  const offsetRef = useContext(NativeSheetScrollOffsetContext);
  useEffect(() => {
    if (!offsetRef) return;
    offsetRef.current = 0;
    return () => {
      offsetRef.current = 0;
    };
  }, [offsetRef]);
  return (event: T) => {
    if (offsetRef) offsetRef.current = event?.nativeEvent?.contentOffset?.y ?? 0;
    onScroll?.(event);
  };
}

export function NativeSheet({
  visible,
  onClose,
  children,
  isDark,
  sheetTheme,
  sheetPalette,
  maxHeight,
  title,
  closeAccessibilityLabel = "Close sheet",
  showHeader = false,
  sheetStyle,
  onDismiss,
  swipeToDismiss = true,
}: NativeSheetProps) {
  const insets = usePapyrusSafeAreaInsets();
  const palette = sheetPalette ?? getReaderSheetPalette(sheetTheme ?? Boolean(isDark));
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const tabletLayout = getNativeSheetLayoutStyles(windowWidth);
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const motion = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const scrollOffsetRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const swipeEnabledRef = useRef(swipeToDismiss);
  swipeEnabledRef.current = swipeToDismiss;

  const createDismissResponder = (fromHandle: boolean) => {
    const claim = (_event: GestureResponderEvent, gesture: PanResponderGestureState) =>
      swipeEnabledRef.current &&
      shouldStartSheetDismissDrag({
        dx: gesture.dx,
        dy: gesture.dy,
        scrollOffset: scrollOffsetRef.current,
        fromHandle,
      });
    const settle = () => {
      Animated.spring(dragY, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: claim,
      onMoveShouldSetPanResponder: claim,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => {
        dragY.setValue(clampSheetDrag(gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (
          shouldDismissSheetOnRelease({
            dy: gesture.dy,
            vy: gesture.vy,
            sheetHeight: sheetHeightRef.current,
          })
        ) {
          onCloseRef.current();
          return;
        }
        settle();
      },
      onPanResponderTerminate: settle,
    });
  };
  const bodyResponder = useMemo(() => createDismissResponder(false), []);
  const handleResponder = useMemo(() => createDismissResponder(true), []);
  const handleSheetLayout = (event: LayoutChangeEvent) => {
    sheetHeightRef.current = event.nativeEvent.layout.height;
  };

  useEffect(() => {
    motion.stopAnimation();
    backdropOpacity.stopAnimation();

    if (visible) {
      renderedRef.current = true;
      setRendered(true);
      dragY.setValue(0);
      motion.setValue(1);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(motion, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }


    if (!renderedRef.current) return;

    Animated.parallel([
      Animated.timing(motion, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      renderedRef.current = false;
      dragY.setValue(0);
      setRendered(false);
    });
  }, [backdropOpacity, dragY, motion, visible]);

  if (!rendered) return null;

  return (
    <ReaderOrientationModal
      animationType="none"
      transparent
      visible={rendered}
      onDismiss={onDismiss}
      onRequestClose={onClose}
    >
      <View style={[styles.root, tabletLayout?.root]}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          onLayout={handleSheetLayout}
          {...(swipeToDismiss ? bodyResponder.panHandlers : null)}
          style={[
            styles.sheet,
            tabletLayout?.sheet,
            getNativeSheetSizeStyle(maxHeight),
            { paddingBottom: insets.bottom },
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.divider,
              borderBottomColor: palette.divider,
            },
            sheetStyle,
            {
              transform: [
                {
                  translateY: Animated.add(
                    motion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, windowHeight],
                    }),
                    dragY,
                  ),
                },
              ],
            },
          ]}
        >
          <View {...(swipeToDismiss ? handleResponder.panHandlers : null)}>
            {swipeToDismiss ? (
              <View
                testID="papyrus-sheet-drag-handle"
                style={styles.handleArea}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <View
                  style={[styles.handle, { backgroundColor: palette.mutedText }]}
                />
              </View>
            ) : null}
            {showHeader ? (
              <View style={[styles.header, swipeToDismiss && styles.headerWithHandle]}>
                <View style={styles.headerSpacer} />
                <Text
                  style={[styles.title, { color: palette.text }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  style={[
                    styles.closeButton,
                    { backgroundColor: palette.closeSurface },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={closeAccessibilityLabel}
                >
                  <IconClose size={18} color={palette.text} />
                </Pressable>
              </View>
            ) : null}
          </View>
          <NativeSheetScrollOffsetContext.Provider value={scrollOffsetRef}>
            {children}
          </NativeSheetScrollOffsetContext.Provider>
        </Animated.View>
      </View>
    </ReaderOrientationModal>
  );
}

export const NativeSheetScrollView = React.forwardRef<
  ScrollView,
  ScrollViewProps
>(function NativeSheetScrollView(props, ref) {
  const onScroll = useSheetScrollTracking(props.onScroll);
  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={16}
      {...props}
      onScroll={onScroll}
    />
  );
});

export function NativeSheetFlatList<ItemT>(props: FlatListProps<ItemT>) {
  const onScroll = useSheetScrollTracking(props.onScroll);
  return <FlatList scrollEventThrottle={16} {...props} onScroll={onScroll} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    maxHeight: "78%",
    width: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerWithHandle: {
    paddingTop: 4,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.45,
  },
  headerSpacer: {
    width: 42,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
});
