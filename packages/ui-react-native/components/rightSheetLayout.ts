type ResolveRightSheetHeightInput = {
  windowHeight: number;
  showingNotes: boolean;
};

export const resolveRightSheetHeight = ({
  windowHeight,
  showingNotes,
}: ResolveRightSheetHeightInput) =>
  showingNotes
    ? Math.min(440, windowHeight * 0.56)
    : Math.min(640, windowHeight * 0.72);
