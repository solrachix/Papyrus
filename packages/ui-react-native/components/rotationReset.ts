import type { DocumentEngine } from "@papyrus-sdk/types";

type RotationEngine = Pick<DocumentEngine, "getRotation" | "rotate">;

export const resetEngineRotation = (
  engine: RotationEngine,
  onRotationChange: (rotation: number) => void
): void => {
  const normalizedRotation = ((engine.getRotation() % 360) + 360) % 360;
  const currentQuarterTurns = Math.round(normalizedRotation / 90) % 4;
  const clockwiseTurnsToReset = (4 - currentQuarterTurns) % 4;

  for (let turn = 0; turn < clockwiseTurnsToReset; turn += 1) {
    engine.rotate("clockwise");
  }

  onRotationChange(0);
};
