import {
  resolveVirtualPageWindow,
  type VirtualPageWindow,
} from "@papyrus-sdk/core";

export type ViewerVirtualWindows = {
  render: VirtualPageWindow;
  wrappers: VirtualPageWindow;
};

export const resolveViewerVirtualWindows = ({
  pageCount,
  anchorIndex,
  renderOverscan,
  isSingleViewportMode,
}: {
  pageCount: number;
  anchorIndex: number;
  renderOverscan: number;
  isSingleViewportMode: boolean;
}): ViewerVirtualWindows => {
  const safeRenderOverscan = Math.max(0, Math.floor(renderOverscan));
  const renderWindowOverscan = isSingleViewportMode ? 0 : safeRenderOverscan;
  const wrapperOverscan = isSingleViewportMode
    ? 0
    : Math.max(1, safeRenderOverscan);

  return {
    render: resolveVirtualPageWindow({
      pageCount,
      anchorIndex,
      overscan: renderWindowOverscan,
    }),
    wrappers: resolveVirtualPageWindow({
      pageCount,
      anchorIndex,
      overscan: wrapperOverscan,
    }),
  };
};
