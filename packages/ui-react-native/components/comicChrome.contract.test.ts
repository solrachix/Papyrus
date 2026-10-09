import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const source = (file: string) => readFileSync(resolve(__dirname, file), "utf8");

describe("comic reader chrome", () => {
  it("wires the SDK worklet dependency in the Android example", () => {
    const root = resolve(__dirname, "../../..");
    const readExample = (path: string) => readFileSync(resolve(root, "examples/mobile", path), "utf8");
    expect(JSON.parse(readExample("package.json")).dependencies["react-native-reanimated"]).toBe("3.19.5");
    expect(readExample("babel.config.js")).toContain("react-native-reanimated/plugin");
    expect(readExample("android/settings.gradle")).toContain("include ':react-native-reanimated'");
    expect(readExample("android/app/src/main/java/com/papyrusmobile/MainApplication.kt")).toContain("ReanimatedPackage()");
  });
  it("uses page numbers rather than percentage navigation", () => {
    expect(source("ProgressPill.tsx")).toContain('documentType === "pdf" || documentType === "comic"');
    expect(source("ProgressPill.tsx")).toContain('`${displayedPage}/${pageCount || 0}`');
  });
  it("centers the title hit area without stretching the text vertically", () => {
    const topbar = source("Topbar.tsx");
    const title = topbar.match(/titleHit: \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const text = topbar.match(/brandText: \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(title).toContain('justifyContent: "center"');
    expect(title).toContain("minHeight: 32");
    expect(text).not.toContain("flexGrow");
  });
});
