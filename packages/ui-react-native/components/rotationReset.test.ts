import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resetEngineRotation } from "./rotationReset";

const settingsSheet = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/components/SettingsSheet.tsx"),
  "utf8"
);

describe("SettingsSheet rotation reset", () => {
  it.each([90, 180, 270])(
    "resets %s degrees through engine rotation",
    (initialRotation) => {
      let rotation = initialRotation;
      const engine = {
        getRotation: () => rotation,
        rotate: vi.fn(() => {
          rotation = (rotation + 90) % 360;
        }),
      };
      const onRotationChange = vi.fn();

      resetEngineRotation(engine, onRotationChange);

      expect(rotation).toBe(0);
      expect(onRotationChange).toHaveBeenCalledWith(0);
    }
  );

  it("preserves zero rotation without rotating the engine", () => {
    const engine = {
      getRotation: () => 0,
      rotate: vi.fn(),
    };
    const onRotationChange = vi.fn();

    resetEngineRotation(engine, onRotationChange);

    expect(engine.rotate).not.toHaveBeenCalled();
    expect(onRotationChange).toHaveBeenCalledWith(0);
  });

  it("wires the localized reset control to the helper and viewer store", () => {
    expect(settingsSheet).toContain("resetEngineRotation(engine");
    expect(settingsSheet).toContain("setDocumentState({ rotation })");
    expect(settingsSheet).toContain("onPress={handleResetRotation}");
    expect(settingsSheet).toContain("{t.rotationOriginal}");
    expect(settingsSheet).toMatch(
      /Platform\.OS === "ios"\s*&&\s*\(\s*<Pressable[\s\S]*?\{t\.rotationOriginal\}/
    );
  });
});
