export type RenderGeneration = {
  next: () => number;
  isCurrent: (generation: number) => boolean;
};

export const createRenderGeneration = (): RenderGeneration => {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (generation) => generation === current,
  };
};
