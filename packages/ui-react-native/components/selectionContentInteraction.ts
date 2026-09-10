export type SelectionContentInteraction = "tap" | "scroll";

export const shouldDismissSelectionOnContentInteraction = ({
  selectionActive,
  interaction,
}: {
  selectionActive: boolean;
  interaction: SelectionContentInteraction;
}): boolean => selectionActive && (interaction === "tap" || interaction === "scroll");
