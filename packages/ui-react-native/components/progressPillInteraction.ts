export const getProgressPillInteraction = (
  onPress: () => void,
  onLongPress?: () => void
) => ({
  onPress,
  onLongPress,
  accessibilityLabel: "Open document navigation",
  accessibilityRole: "button" as const,
});
