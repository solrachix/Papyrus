export type BasePageLayoutMetrics = {
  offsets: number[];
  lengths: number[];
  estimatedLength: number;
  itemSpacing: number;
  topPadding: number;
  bottomPadding: number;
};

export type ScaledPageLayoutMetrics = {
  itemCount: number;
  getOffset: (index: number) => number;
  getLength: (index: number) => number;
  getTotalContentHeight: () => number;
};

export const createPageLayoutMetrics = ({
  itemCount,
  itemSpacing,
  topPadding,
  bottomPadding,
  getBaseItemLength,
  estimatedLength,
}: {
  itemCount: number;
  itemSpacing: number;
  topPadding: number;
  bottomPadding: number;
  getBaseItemLength: (index: number) => number;
  estimatedLength: number;
}): BasePageLayoutMetrics => {
  const offsets: number[] = [];
  const lengths: number[] = [];
  let offset = topPadding;

  for (let index = 0; index < itemCount; index += 1) {
    const length = Math.max(itemSpacing, getBaseItemLength(index));
    offsets.push(offset);
    lengths.push(length);
    offset += length;
  }

  return {
    offsets,
    lengths,
    estimatedLength,
    itemSpacing,
    topPadding,
    bottomPadding,
  };
};

export const scalePageLayoutMetrics = (
  base: BasePageLayoutMetrics,
  zoomRatio: number
): ScaledPageLayoutMetrics => {
  const safeRatio = Number.isFinite(zoomRatio) ? Math.max(0.01, zoomRatio) : 1;
  const getOffset = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, base.offsets.length - 1));
    const offset = base.offsets[safeIndex] ?? base.topPadding;
    return (
      base.topPadding +
      (offset - base.topPadding - safeIndex * base.itemSpacing) * safeRatio +
      safeIndex * base.itemSpacing
    );
  };
  const getLength = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, base.lengths.length - 1));
    const length = base.lengths[safeIndex] ?? base.itemSpacing;
    return (length - base.itemSpacing) * safeRatio + base.itemSpacing;
  };

  return {
    itemCount: base.lengths.length,
    getOffset,
    getLength,
    getTotalContentHeight: () => {
      if (base.lengths.length === 0) {
        return base.topPadding + base.bottomPadding;
      }
      const lastIndex = base.lengths.length - 1;
      return getOffset(lastIndex) + getLength(lastIndex) + base.bottomPadding;
    },
  };
};
