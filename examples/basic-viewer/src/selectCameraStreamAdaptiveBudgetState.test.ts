import { describe, expect, it } from "vitest";
import { selectCameraStreamAdaptiveBudgetState } from "./selectCameraStreamAdaptiveBudgetState";

describe("selectCameraStreamAdaptiveBudgetState", () => {
  const reducedState = {
    sourcePointBudget: 810_000,
    pointDataLengthBudget: 15_099_494,
  };

  it("keeps reduced work limits while the camera is moving", () => {
    expect(
      selectCameraStreamAdaptiveBudgetState(reducedState, true),
    ).toBe(reducedState);
  });

  it("removes timing-history limits from the settled terminal view", () => {
    expect(
      selectCameraStreamAdaptiveBudgetState(reducedState, false),
    ).toBeUndefined();
  });
});
