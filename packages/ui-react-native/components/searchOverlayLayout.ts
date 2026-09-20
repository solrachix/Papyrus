export const getSearchOverlayLayout = (windowWidth: number) => {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
    return { frame: { paddingHorizontal: 12 }, card: null } as const;
  }

  if (windowWidth < 768) {
    return { frame: { paddingHorizontal: 12 }, card: null } as const;
  }

  return {
    frame: { paddingHorizontal: 24 },
    card: {
      width: Math.min(640, windowWidth - 48),
      alignSelf: "center",
    },
  } as const;
};
