import type { Scene } from "cesium";
import { CesiumPointPrimitiveRenderer } from "./CesiumPointPrimitiveRenderer";

/**
 * @deprecated Use CesiumPointPrimitiveRenderer instead.
 */
export class CesiumPointRenderer extends CesiumPointPrimitiveRenderer {
  constructor(scene: Scene) {
    super(scene);
  }

  protected override get rendererName(): string {
    return "CesiumPointRenderer";
  }
}
