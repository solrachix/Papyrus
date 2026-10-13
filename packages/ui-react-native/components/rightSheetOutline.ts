import type { OutlineItem, PageDestination } from "@papyrus-sdk/types";

export interface FlattenedOutlineEntry {
  id: string;
  title: string;
  depth: number;
  disabled: boolean;
  value: OutlineItem;
}

export const flattenOutline = (
  outline: OutlineItem[],
  canNavigateByDestination: boolean,
  depth = 0,
  parentId = "",
): FlattenedOutlineEntry[] =>
  outline.flatMap((item, index) => {
    const id = `${parentId}${index}:${item.pageIndex}:${item.title}`;
    return [
      {
        id,
        title: item.title,
        depth,
        disabled: item.pageIndex < 0 && !(canNavigateByDestination && item.dest),
        value: item,
      },
      ...flattenOutline(
        item.children ?? [],
        canNavigateByDestination,
        depth + 1,
        `${id}/`,
      ),
    ];
  });

export async function navigateEpubOutlineEntry(options: {
  item: OutlineItem;
  goToDestination?: (destination: PageDestination) => Promise<number | null>;
  navigateToPageIndex: (pageIndex: number) => void;
  close: () => void;
}): Promise<void> {
  const { item, goToDestination, navigateToPageIndex, close } = options;

  if (item.dest && goToDestination) {
    try {
      const pageIndex = await goToDestination(item.dest);
      if (pageIndex != null && pageIndex >= 0) {
        navigateToPageIndex(pageIndex);
        close();
        return;
      }
    } catch {
      // Some EPUB destinations cannot resolve in the runtime; use the
      // document page index when it is available.
    }
  }

  if (item.pageIndex >= 0) navigateToPageIndex(item.pageIndex);
  close();
}
