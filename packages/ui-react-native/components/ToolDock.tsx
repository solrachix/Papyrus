import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { getStrings } from "../mobileStrings";
import {
  IconClose,
  IconColorRing,
  IconRedo,
  IconToolHighlighter,
  IconToolInk,
  IconToolNote,
  IconToolSelect,
  IconToolSquiggly,
  IconToolStrikeout,
  IconToolUnderline,
  IconUndo,
} from "../icons";
import {
  getToolDockDismissState,
  isToolDockToolSelected,
} from "../gesture/selectionInteraction";
import {
  resolveToolDockBaseIconColor,
  resolveToolDockIconColor,
  shouldUseScrollablePrimaryToolsRow,
} from "./ToolDock.layout";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";

const COLOR_SWATCHES = [
  "#fbbf24",
  "#f97316",
  "#ef4444",
  "#10b981",
  "#22d3ee",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f3f4f6",
  "#111827",
] as const;

const PRIMARY_TOOLS = [
  { id: "ink", label: "ink", icon: IconToolInk, accent: "#111827" },
  {
    id: "highlight",
    label: "highlight",
    icon: IconToolHighlighter,
    accent: "#f4c430",
  },
  {
    id: "underline",
    label: "underline",
    icon: IconToolUnderline,
    accent: "#111827",
  },
  { id: "select", label: "select", icon: IconToolSelect, accent: "#111827" },
] as const;

const EXTRA_TOOLS = [
  { id: "comment", label: "note", icon: IconToolNote, accent: "#f4c430" },
  {
    id: "squiggly",
    label: "squiggly",
    icon: IconToolSquiggly,
    accent: "#111827",
  },
  {
    id: "strikeout",
    label: "strikeout",
    icon: IconToolStrikeout,
    accent: "#111827",
  },
] as const;

const ALL_TOOLS = [...PRIMARY_TOOLS, ...EXTRA_TOOLS] as const;
const INK_WIDTHS = [0.003, 0.006, 0.01, 0.014] as const;
const OPACITY_TRACK_PADDING = 6;
const OPACITY_THUMB_SIZE = 22;
const OPACITY_RAIL_HEIGHT = 10;

const getToolAccentColor = (
  tool: (typeof ALL_TOOLS)[number],
  isDark: boolean
) => {
  return resolveToolDockBaseIconColor({ label: tool.label, isDark });
};

const getToolVisual = (toolId: (typeof ALL_TOOLS)[number]["id"]) => {
  switch (toolId) {
    case "select":
      return { width: 24, iconSize: 22, offsetY: -2 };
    case "highlight":
      return { width: 36, iconSize: 58, offsetY: 2 };
    case "underline":
      return { width: 28, iconSize: 44, offsetY: 0 };
    case "ink":
      return { width: 24, iconSize: 52, offsetY: 0 };
    case "comment":
      return { width: 24, iconSize: 28, offsetY: 6 };
    case "squiggly":
    case "strikeout":
      return { width: 24, iconSize: 26, offsetY: 6 };
    default:
      return { width: 24, iconSize: 28, offsetY: 6 };
  }
};

const getToolLabel = (
  label: (typeof ALL_TOOLS)[number]["label"],
  t: ReturnType<typeof getStrings>
) => {
  if (label === "note") return t.note;
  if (label === "select") return t.select;
  if (label === "underline") return t.underline;
  if (label === "squiggly") return t.squiggly;
  if (label === "strikeout") return t.strikeout;
  if (label === "ink") return t.ink;
  return t.highlight;
};

const OpacitySlider = React.memo(function OpacitySlider({
  value,
  color,
  isDark,
  onCommit,
}: {
  value: number;
  color: string;
  isDark: boolean;
  onCommit: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [draftValue, setDraftValue] = useState(value);
  const dragValueRef = useRef(draftValue);
  const isDraggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      dragValueRef.current = value;
      setDraftValue(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const railWidth = Math.max(trackWidth - OPACITY_TRACK_PADDING * 2, 0);
  const thumbOffset =
    railWidth > 0
      ? OPACITY_TRACK_PADDING + railWidth * draftValue - OPACITY_THUMB_SIZE / 2
      : -OPACITY_THUMB_SIZE / 2;
  const fillWidth =
    railWidth > 0
      ? Math.max(OPACITY_THUMB_SIZE / 2, railWidth * draftValue)
      : 0;

  const getOpacityFromTouch = (locationX: number) => {
    if (!railWidth) return null;
    const normalized = (locationX - OPACITY_TRACK_PADDING) / railWidth;
    return Math.min(1, Math.max(0.1, normalized));
  };

  const updateDraft = (event: GestureResponderEvent) => {
    const next = getOpacityFromTouch(event.nativeEvent.locationX);
    if (next === null) return;
    isDraggingRef.current = true;
    dragValueRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setDraftValue(dragValueRef.current);
    });
  };

  const commitDraft = (event?: GestureResponderEvent) => {
    const next = event
      ? getOpacityFromTouch(event.nativeEvent.locationX) ?? dragValueRef.current
      : dragValueRef.current;
    isDraggingRef.current = false;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    dragValueRef.current = next;
    setDraftValue(next);
    onCommit(next);
  };

  return (
    <View style={styles.opacitySliderWrap}>
      <View
        style={styles.opacityTouchSurface}
        onLayout={(event: LayoutChangeEvent) =>
          setTrackWidth(event.nativeEvent.layout.width)
        }
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={updateDraft}
        onResponderMove={updateDraft}
        onResponderRelease={commitDraft}
        onResponderTerminate={() => commitDraft()}
      >
        <View style={styles.opacityTrack} />
        <View
          style={[
            styles.opacityTrackFill,
            {
              width: fillWidth,
              backgroundColor: withInkAlpha(color, 0.92),
            },
          ]}
        />
        <View
          style={[
            styles.opacityThumb,
            {
              left: thumbOffset,
              borderColor: isDark ? "#0f172a" : "#ffffff",
            },
          ]}
        />
      </View>
    </View>
  );
});

const ToolDock: React.FC = () => {
  const {
    uiTheme,
    locale,
    annotationColor,
    setAnnotationColor,
    annotationOpacity,
    setAnnotationOpacity,
    inkStrokeWidth,
    setInkStrokeWidth,
    accentColor,
    activeTool,
    interactionMode,
    toolDockOpen,
    setDocumentState,
    activeDrawToolPreset,
    annotationUndoStack,
    annotationRedoStack,
    undoAnnotations,
    redoAnnotations,
  } = useViewerStore();
  const [paletteExpanded, setPaletteExpanded] = useState(false);
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const isDark = uiTheme === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const t = getStrings(locale);
  const panelColor = isDark ? "rgba(24,24,27,0.92)" : "rgba(255,255,255,0.96)";
  const borderColor = isDark ? "rgba(71,85,105,0.48)" : "rgba(229,231,235,0.88)";
  const buttonColor = isDark ? "rgba(39,39,42,0.96)" : "#eef1f6";
  const iconColor = isDark ? "#e5e7eb" : "#111827";
  const labelColor = isDark ? "#e5e7eb" : "#374151";
  const utilityIconColor = isDark ? "#f8fafc" : "#111827";

  const selectedTool = useMemo(
    () =>
      ALL_TOOLS.find((tool) =>
        tool.id === "ink" || tool.id === "highlight" || tool.id === "underline"
          ? activeTool === "ink" && activeDrawToolPreset === tool.id
          : isToolDockToolSelected({
              toolId: tool.id,
              activeTool,
              interactionMode,
            })
      ) ?? PRIMARY_TOOLS[1],
    [activeTool, activeDrawToolPreset, interactionMode]
  );
  const inkSettingsExpanded =
    activeTool === "ink" && activeDrawToolPreset === "ink";
  const canUndo = annotationUndoStack.length > 0;
  const canRedo = annotationRedoStack.length > 0;
  const primaryToolsRowIsScrollable =
    shouldUseScrollablePrimaryToolsRow(windowWidth);

  const applyTool = (toolId: (typeof ALL_TOOLS)[number]["id"]) => {
    if (toolId === "ink") {
      setDocumentState({
        activeTool: "ink",
        activeDrawToolPreset: "ink",
        interactionMode: "pan",
        inkStrokeWidth: 0.004,
        annotationOpacity: 1,
      });
      return;
    }
    if (toolId === "highlight") {
      setDocumentState({
        activeTool: "ink",
        activeDrawToolPreset: "highlight",
        interactionMode: "pan",
        inkStrokeWidth: 0.016,
        annotationOpacity: 0.28,
      });
      return;
    }
    if (toolId === "underline") {
      setDocumentState({
        activeTool: "ink",
        activeDrawToolPreset: "underline",
        interactionMode: "pan",
        inkStrokeWidth: 0.006,
        annotationOpacity: 0.92,
      });
      return;
    }
    if (toolId === "select") {
      const shouldArmSelection =
        activeTool !== "select" || interactionMode !== "select";
      setDocumentState({
        activeTool: "select",
        interactionMode: shouldArmSelection ? "select" : "pan",
      });
      return;
    }
    setDocumentState({
      activeTool: toolId,
      interactionMode: "pan",
    });
  };

  const renderToolButton = (
    tool: (typeof ALL_TOOLS)[number],
    compact = false
  ) => {
    const isDrawingPreset =
      tool.id === "ink" || tool.id === "highlight" || tool.id === "underline";
    const isSelected = isDrawingPreset
      ? activeTool === "ink" && activeDrawToolPreset === tool.id
      : isToolDockToolSelected({
          toolId: tool.id,
          activeTool,
          interactionMode,
        });
    const Icon = tool.icon;
    const visual = getToolVisual(tool.id);

    const baseIconColor = getToolAccentColor(tool, isDark);
    const iconColor = resolveToolDockIconColor({
      toolId: tool.id,
      isSelected,
      annotationColor,
      accentColor,
      baseIconColor,
    });

    return (
      <Pressable
        key={tool.id}
        onPress={() => {
          applyTool(tool.id);
          if (compact) setExtrasExpanded(false);
        }}
        style={[
          compact ? styles.compactToolButton : styles.toolButton,
          { width: compact ? undefined : visual.width },
        ]}
      >
        <View
          style={[
            compact ? styles.compactToolIconWrap : styles.toolIconWrap,
            {
              transform: [
                { translateY: compact ? 4 : visual.offsetY },
                { scale: isSelected ? 1.18 : 1 },
              ],
              opacity: isSelected ? 1 : 0.92,
            },
          ]}
        >
          <Icon
            size={compact ? 34 : visual.iconSize}
            color={iconColor}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {toolDockOpen ? (
        <View style={styles.stack}>
          {paletteExpanded ? (
            <View
              style={[
                styles.popup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.swatchRow}>
                {COLOR_SWATCHES.map((color) => {
                  const isSelected = annotationColor === color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setAnnotationColor(color)}
                      style={[
                        styles.swatchOuter,
                        {
                          borderColor: isSelected ? accentColor : "transparent",
                          backgroundColor: isSelected
                            ? `${accentColor}12`
                            : "transparent",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: color,
                            borderColor:
                              color === "#f3f4f6" ? "#d1d5db" : "transparent",
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {inkSettingsExpanded ? (
            <View
              style={[
                styles.popup,
                styles.inkPopup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.inkPreviewRow}>
                {INK_WIDTHS.map((width) => {
                  const selected = Math.abs(inkStrokeWidth - width) < 0.0005;
                  return (
                    <Pressable
                      key={width}
                      onPress={() => setInkStrokeWidth(width)}
                      style={[
                        styles.inkWidthButton,
                        selected && {
                          backgroundColor: `${accentColor}12`,
                          borderColor: `${accentColor}30`,
                        },
                      ]}
                    >
                      <View style={styles.inkNib}>
                        <IconToolInk
                          size={Math.round(18 + width * 1200)}
                          color={withInkAlpha(annotationColor, annotationOpacity)}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <OpacitySlider
                value={annotationOpacity}
                color={annotationColor}
                isDark={isDark}
                onCommit={setAnnotationOpacity}
              />
            </View>
          ) : null}

          {extrasExpanded ? (
            <View
              style={[
                styles.popup,
                styles.extrasPopup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.compactToolsRow}>
                {EXTRA_TOOLS.map((tool) => renderToolButton(tool, true))}
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.container,
              {
                backgroundColor: panelColor,
                borderColor,
              },
            ]}
          >
            {primaryToolsRowIsScrollable ? (
              <ScrollView
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator={false}
                style={styles.primaryToolsScrollView}
                contentContainerStyle={[
                  styles.primaryToolsRow,
                  styles.primaryToolsRowScrollableContent,
                ]}
              >
                <View style={styles.primaryToolsRowInner}>
                  <View style={styles.historyGroup}>
                    <Pressable
                      onPress={undoAnnotations}
                      disabled={!canUndo}
                      style={[
                        styles.utilityButton,
                        styles.historyButton,
                        { backgroundColor: buttonColor },
                        !canUndo && styles.disabledButton,
                      ]}
                    >
                      <IconUndo
                        size={MOBILE_CHROME_METRICS.toolDockHistoryIconSize}
                        color={
                          canUndo
                            ? utilityIconColor
                            : isDark
                            ? MOBILE_CHROME_METRICS.toolDockDisabledIconColorDark
                            : MOBILE_CHROME_METRICS.toolDockDisabledIconColorLight
                        }
                        strokeWidth={2.2}
                      />
                    </Pressable>

                    <Pressable
                      onPress={redoAnnotations}
                      disabled={!canRedo}
                      style={[
                        styles.utilityButton,
                        styles.historyButton,
                        { backgroundColor: buttonColor },
                        !canRedo && styles.disabledButton,
                      ]}
                    >
                      <IconRedo
                        size={MOBILE_CHROME_METRICS.toolDockHistoryIconSize}
                        color={
                          canRedo
                            ? utilityIconColor
                            : isDark
                            ? MOBILE_CHROME_METRICS.toolDockDisabledIconColorDark
                            : MOBILE_CHROME_METRICS.toolDockDisabledIconColorLight
                        }
                        strokeWidth={2.2}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.toolsGroup}>
                    {PRIMARY_TOOLS.map((tool) => renderToolButton(tool))}
                  </View>

                  <View style={styles.controlsGroup}>
                    <Pressable
                      onPress={() => {
                        setExtrasExpanded((value) => !value);
                        setPaletteExpanded(false);
                      }}
                      style={[
                        styles.utilityButton,
                        {
                          backgroundColor: extrasExpanded
                            ? `${accentColor}12`
                            : buttonColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.utilityLabel,
                          { color: extrasExpanded ? accentColor : utilityIconColor },
                        ]}
                      >
                        +
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setPaletteExpanded((value) => !value);
                        setExtrasExpanded(false);
                      }}
                      style={styles.colorButton}
                    >
                      <IconColorRing
                        size={30}
                        centerColor={annotationColor}
                        borderColor={
                          annotationColor === "#f3f4f6"
                            ? "#d1d5db"
                            : isDark
                            ? "#111827"
                            : "#ffffff"
                        }
                      />
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setDocumentState(
                          getToolDockDismissState({
                            activeTool,
                            interactionMode,
                          })
                        )
                      }
                      style={[
                        styles.utilityButton,
                        { backgroundColor: buttonColor },
                      ]}
                    >
                      <IconClose
                        size={15}
                        color={utilityIconColor}
                        strokeWidth={2.2}
                      />
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.primaryToolsRow}>
              <View style={styles.historyGroup}>
                <Pressable
                  onPress={undoAnnotations}
                  disabled={!canUndo}
                  style={[
                    styles.utilityButton,
                    styles.historyButton,
                    { backgroundColor: buttonColor },
                    !canUndo && styles.disabledButton,
                  ]}
                >
                  <IconUndo
                    size={MOBILE_CHROME_METRICS.toolDockHistoryIconSize}
                    color={
                      canUndo
                        ? utilityIconColor
                        : isDark
                        ? MOBILE_CHROME_METRICS.toolDockDisabledIconColorDark
                        : MOBILE_CHROME_METRICS.toolDockDisabledIconColorLight
                    }
                    strokeWidth={2.2}
                  />
                </Pressable>

                <Pressable
                  onPress={redoAnnotations}
                  disabled={!canRedo}
                  style={[
                    styles.utilityButton,
                    styles.historyButton,
                    { backgroundColor: buttonColor },
                    !canRedo && styles.disabledButton,
                  ]}
                >
                  <IconRedo
                    size={MOBILE_CHROME_METRICS.toolDockHistoryIconSize}
                    color={
                      canRedo
                        ? utilityIconColor
                        : isDark
                        ? MOBILE_CHROME_METRICS.toolDockDisabledIconColorDark
                        : MOBILE_CHROME_METRICS.toolDockDisabledIconColorLight
                    }
                    strokeWidth={2.2}
                  />
                </Pressable>
              </View>

              <View style={styles.toolsGroup}>
                {PRIMARY_TOOLS.map((tool) => renderToolButton(tool))}
              </View>

              <View style={styles.controlsGroup}>
                <Pressable
                  onPress={() => {
                    setExtrasExpanded((value) => !value);
                    setPaletteExpanded(false);
                  }}
                  style={[
                    styles.utilityButton,
                    {
                      backgroundColor: extrasExpanded
                        ? `${accentColor}12`
                        : buttonColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.utilityLabel,
                      { color: extrasExpanded ? accentColor : utilityIconColor },
                    ]}
                  >
                    +
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setPaletteExpanded((value) => !value);
                    setExtrasExpanded(false);
                  }}
                  style={styles.colorButton}
                >
                  <IconColorRing
                    size={30}
                    centerColor={annotationColor}
                    borderColor={
                      annotationColor === "#f3f4f6"
                        ? "#d1d5db"
                        : isDark
                        ? "#111827"
                        : "#ffffff"
                    }
                  />
                </Pressable>

                <Pressable
                  onPress={() =>
                    setDocumentState(
                      getToolDockDismissState({
                        activeTool,
                        interactionMode,
                      })
                    )
                  }
                  style={[styles.utilityButton, { backgroundColor: buttonColor }]}
                >
                  <IconClose
                    size={15}
                    color={utilityIconColor}
                    strokeWidth={2.2}
                  />
                </Pressable>
              </View>
              </View>
            )}
          </View>

        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: MOBILE_CHROME_METRICS.screenPadding,
    paddingBottom: 72,
  },
  stack: {
    width: "100%",
    maxWidth: MOBILE_CHROME_METRICS.maxToolDockWidth,
    alignItems: "center",
  },
  container: {
    width: "100%",
    minHeight: 92,
    borderRadius: 34,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: MOBILE_CHROME_METRICS.toolDockPaddingTop,
    paddingBottom: 2,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  popup: {
    marginBottom: 10,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  extrasPopup: {
    alignSelf: "flex-end",
    marginRight: 72,
  },
  inkPopup: {
    width: "58%",
    minWidth: 220,
    alignSelf: "center",
  },
  primaryToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 78,
  },
  primaryToolsScrollView: {
    width: "100%",
  },
  primaryToolsRowScrollableContent: {
    flexGrow: 1,
  },
  primaryToolsRowInner: {
    minWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 78,
  },
  historyGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: MOBILE_CHROME_METRICS.toolDockHistoryGap,
    width: 82,
    height: 52,
  },
  toolsGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginLeft: 6,
    marginRight: 6,
    flex: 1,
    justifyContent: "center",
    height: 82,
  },
  controlsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 116,
    height: 52,
    justifyContent: "flex-end",
  },
  compactToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  inkPreviewRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 8,
  },
  inkWidthButton: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  inkNib: {
    width: 22,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inkNibStroke: {
    width: 18,
    borderRadius: 999,
  },
  opacitySliderWrap: {
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  opacityTouchSurface: {
    width: "100%",
    height: OPACITY_THUMB_SIZE + 2,
    justifyContent: "center",
    position: "relative",
  },
  opacityTrack: {
    position: "absolute",
    left: OPACITY_TRACK_PADDING,
    right: OPACITY_TRACK_PADDING,
    top: "50%",
    marginTop: -(OPACITY_RAIL_HEIGHT / 2),
    height: OPACITY_RAIL_HEIGHT,
    borderRadius: 999,
    backgroundColor: "rgba(107,114,128,0.18)",
  },
  opacityTrackFill: {
    position: "absolute",
    left: OPACITY_TRACK_PADDING,
    top: "50%",
    marginTop: -(OPACITY_RAIL_HEIGHT / 2),
    height: OPACITY_RAIL_HEIGHT,
    borderRadius: 999,
  },
  opacityThumb: {
    position: "absolute",
    top: "50%",
    marginTop: -(OPACITY_THUMB_SIZE / 2),
    width: OPACITY_THUMB_SIZE,
    height: OPACITY_THUMB_SIZE,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  toolButton: {
    height: 82,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  compactToolButton: {
    width: 44,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  colorButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  utilityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  historyButton: {},
  disabledButton: {
    opacity: MOBILE_CHROME_METRICS.toolDockDisabledOpacity,
  },
  utilityLabel: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: "400",
    marginTop: -4,
  },
  swatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  swatchOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  toolIconWrap: {
    transform: [{ translateY: 0 }],
  },
  compactToolIconWrap: {
    transform: [{ translateY: 0 }],
  },
});

const withInkAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default ToolDock;
