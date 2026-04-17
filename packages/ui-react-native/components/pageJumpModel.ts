export const resolvePageJumpTarget = (
  value: string,
  pageCount: number
): number | null => {
  if (pageCount <= 0) return null;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;

  return Math.max(1, Math.min(pageCount, parsed));
};
