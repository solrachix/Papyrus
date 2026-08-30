import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/benchmarks/android-pinch-ab.sh"),
  "utf8"
);

test("ADB pinch trajectory opens and closes around the same anchor", () => {
  expect(script).toMatch(/OPEN_LEFT=11373/);
  expect(script).toMatch(/OPEN_RIGHT=22384/);
  expect(script).toMatch(/move_pair \$\(\(OPEN_LEFT - i \* STEP\)\) \$\(\(OPEN_RIGHT \+ i \* STEP\)\)/);
  expect(script).toMatch(/move_pair \$\(\(OPEN_LEFT - remaining \* STEP\)\) \$\(\(OPEN_RIGHT \+ remaining \* STEP\)\)/);
});

test("benchmark waits for the app process before collecting frames", () => {
  expect(script).toMatch(/pidof "\$APP"/);
  expect(script).toMatch(/APP_READY_TIMEOUT/);
});
