export type WebViewStateUpdate = {
  currentPage?: number;
  pageCount?: number;
};

export const parseWebViewState = (raw: string): WebViewStateUpdate | null => {
  try {
    const message: unknown = JSON.parse(raw);
    if (!message || typeof message !== "object") return null;

    const typedMessage = message as {
      type?: unknown;
      payload?: unknown;
    };
    if (typedMessage.type !== "state") return null;
    if (!typedMessage.payload || typeof typedMessage.payload !== "object") {
      return null;
    }

    const payload = typedMessage.payload as {
      currentPage?: unknown;
      pageCount?: unknown;
    };
    const update: WebViewStateUpdate = {};
    if (
      typeof payload.currentPage === "number" &&
      Number.isInteger(payload.currentPage) &&
      payload.currentPage >= 1
    ) {
      update.currentPage = payload.currentPage;
    }
    if (
      typeof payload.pageCount === "number" &&
      Number.isInteger(payload.pageCount) &&
      payload.pageCount >= 0
    ) {
      update.pageCount = payload.pageCount;
    }

    return Object.keys(update).length > 0 ? update : null;
  } catch {
    return null;
  }
};
