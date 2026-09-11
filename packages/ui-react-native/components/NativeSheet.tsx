import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { IconClose } from "../icons";
import { getNativeSheetSizeStyle } from "./nativeSheetLayout";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import { getNativeSheetPalette } from "./readerSheetPresentation";

export type NativeSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  isDark?: boolean;
  maxHeight?: number | string;
  title?: string;
  closeAccessibilityLabel?: string;
  showHeader?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
};

export function NativeSheet({
  visible,
  onClose,
  children,
  isDark,
  maxHeight,
  title,
  closeAccessibilityLabel = "Close sheet",
  showHeader = false,
  sheetStyle,
}: NativeSheetProps) {
  const insets = usePapyrusSafeAreaInsets();
  const palette = getNativeSheetPalette(Boolean(isDark));
  const { height: windowHeight } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const motion = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    motion.stopAnimation();
    backdropOpacity.stopAnimation();

    if (visible) {
      renderedRef.current = true;
      setRendered(true);
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
      setRendered(false);
    });
  }, [backdropOpacity, motion, visible]);

  if (!rendered) return null;

  return (
    <Modal
      animationType="none"
      transparent
      visible={rendered}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            getNativeSheetSizeStyle(maxHeight),
            { paddingBottom: insets.bottom },
            {
              backgroundColor: palette.backgroundColor,
              borderTopColor: palette.borderColor,
            },
            sheetStyle,
            {
              transform: [
                {
                  translateY: motion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, windowHeight],
                  }),
                },
              ],
            },
          ]}
        >
          {showHeader ? (
            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <Text
                style={[styles.title, { color: palette.textColor }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                style={[
                  styles.closeButton,
                  isDark && styles.closeButtonDark,
                  { backgroundColor: palette.closeBackgroundColor },
                ]}
                accessibilityLabel={closeAccessibilityLabel}
              >
                <IconClose size={18} color={palette.textColor} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export const NativeSheetScrollView = React.forwardRef<
  ScrollView,
  ScrollViewProps
>(function NativeSheetScrollView(props, ref) {
  return <ScrollView ref={ref} {...props} />;
});

export function NativeSheetFlatList<ItemT>(props: FlatListProps<ItemT>) {
  return <FlatList {...props} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
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
    backgroundColor: "#ffffff",
  },
  sheetDark: {
    borderTopColor: "#1f2937",
    backgroundColor: "#0f1115",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
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
  closeButtonDark: {
    backgroundColor: "#111827",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  titleDark: {
    color: "#f8fafc",
  },
});
