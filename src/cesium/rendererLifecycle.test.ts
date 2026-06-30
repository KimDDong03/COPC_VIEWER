import type { Scene } from "cesium";
import { describe, expect, it } from "vitest";
import type { CopcBounds, CopcInspection } from "../core";
import { CesiumBoundsRenderer } from "./CesiumBoundsRenderer";
import { CesiumPointRenderer } from "./CesiumPointRenderer";

describe("Cesium renderer lifecycle", () => {
  it("removes point primitive collections once when destroyed", () => {
    const { removedPrimitives, scene } = createSceneStub();
    const renderer = new CesiumPointRenderer(scene);

    renderer.setPoints([
      {
        longitudeDegrees: 127,
        latitudeDegrees: 37,
        heightMeters: 10,
      },
    ]);
    renderer.clear();
    renderer.destroy();
    renderer.destroy();

    expect(removedPrimitives).toHaveLength(1);
    expect(() => renderer.setPoints([])).toThrow(
      "CesiumPointRenderer has been destroyed.",
    );
  });

  it("removes bounds primitive collections once when destroyed", () => {
    const { removedPrimitives, scene } = createSceneStub();
    const renderer = new CesiumBoundsRenderer(scene);

    renderer.clear();
    renderer.destroy();
    renderer.destroy();

    expect(removedPrimitives).toHaveLength(1);
    expect(() =>
      renderer.setBounds(createBounds(), {} as CopcInspection),
    ).toThrow("CesiumBoundsRenderer has been destroyed.");
  });
});

function createSceneStub(): {
  readonly removedPrimitives: unknown[];
  readonly scene: Scene;
} {
  const removedPrimitives: unknown[] = [];

  return {
    removedPrimitives,
    scene: {
      primitives: {
        add: <T>(primitive: T): T => primitive,
        remove: (primitive: unknown): boolean => {
          removedPrimitives.push(primitive);
          return true;
        },
      },
    } as unknown as Scene,
  };
}

function createBounds(): CopcBounds {
  return {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 1,
    maxY: 1,
    maxZ: 1,
  };
}
