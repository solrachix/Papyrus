import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

type RuntimeMessage = {
  type?: string;
  id?: string;
  name?: string;
  kind?: string;
  ok?: boolean;
  data?: { pageCount?: number };
  error?: { message?: string } | string;
  loadId?: string;
};

const runtimeSource = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
  "utf8",
);

const createRuntime = () => {
  const messages: RuntimeMessage[] = [];
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="viewer"></div></body></html>',
    { runScripts: "outside-only", url: "http://localhost/" },
  );
  dom.window.ReactNativeWebView = {
    postMessage: (raw: string) => messages.push(JSON.parse(raw)),
  } as never;
  dom.window.eval(runtimeSource);

  const send = (message: Record<string, unknown>) => {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", { data: JSON.stringify(message) }),
    );
  };

  return { dom, messages, send };
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("runtime message timeout");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe("document loading runtime", () => {
  it("publishes an empty TXT document as a completed one-page load", async () => {
    const runtime = createRuntime();

    runtime.send({
      id: "empty-1",
      kind: "load",
      payload: { type: "text", source: { kind: "text", text: "" } },
    });
    await waitFor(() =>
      runtime.messages.some(
        (message) => message.type === "response" && message.id === "empty-1",
      ),
    );

    expect(runtime.messages).toContainEqual({
      type: "event",
      name: "document.ready",
      payload: { loadId: "empty-1", pageCount: 1 },
    });
    expect(runtime.messages).toContainEqual(
      expect.objectContaining({ type: "response", id: "empty-1", ok: true }),
    );
  });

  it("reports an invalid TXT source instead of leaving loading pending", async () => {
    const runtime = createRuntime();

    runtime.send({
      id: "invalid-1",
      kind: "load",
      payload: { type: "text", source: null },
    });
    await waitFor(() =>
      runtime.messages.some(
        (message) => message.type === "response" && message.id === "invalid-1",
      ),
    );

    expect(runtime.messages).toContainEqual(
      expect.objectContaining({
        type: "event",
        name: "document.error",
        payload: expect.objectContaining({ loadId: "invalid-1" }),
      }),
    );
    expect(runtime.messages).toContainEqual(
      expect.objectContaining({ type: "response", id: "invalid-1", ok: false }),
    );
  });

  it("marks a pending TXT load stale when another format starts", async () => {
    const runtime = createRuntime();
    let resolveText: ((value: string) => void) | undefined;
    const fetchText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveText = resolve;
        }),
    );
    runtime.dom.window.fetch = vi.fn(async () => ({
      text: fetchText,
    })) as never;

    runtime.send({
      id: "text-a",
      kind: "load",
      payload: {
        type: "text",
        source: { kind: "uri", uri: "http://localhost/a.txt" },
      },
    });
    await waitFor(() => fetchText.mock.calls.length === 1);

    runtime.send({
      id: "new-document-b",
      kind: "load",
      payload: {
        type: "text",
        source: { kind: "text", text: "new document" },
      },
    });
    await waitFor(() =>
      runtime.messages.some(
        (message) => message.type === "response" && message.id === "new-document-b",
      ),
    );

    resolveText?.("old document");
    await waitFor(() =>
      runtime.messages.some(
        (message) => message.type === "response" && message.id === "text-a",
      ),
    );

    expect(runtime.messages).toContainEqual({
      type: "event",
      name: "document.ready",
      payload: { loadId: "new-document-b", pageCount: 1 },
    });
    expect(runtime.messages).toContainEqual(
      expect.objectContaining({
        type: "event",
        name: "document.stale",
        payload: expect.objectContaining({ loadId: "text-a" }),
      }),
    );
    expect(runtime.messages).toContainEqual(
      expect.objectContaining({ type: "response", id: "new-document-b", ok: true }),
    );
    expect(runtime.messages).toContainEqual(
      expect.objectContaining({ type: "response", id: "text-a", ok: false }),
    );
    expect(
      runtime.messages.filter(
        (message) => message.type === "event" && message.name === "document.ready",
      ),
    ).toHaveLength(1);
  });
});
