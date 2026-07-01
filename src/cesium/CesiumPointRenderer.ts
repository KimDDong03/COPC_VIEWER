import type { Scene } from "cesium";
import {
  CesiumPointPrimitiveRenderer,
  type CesiumPointPrimitiveRendererOptions,
} from "./CesiumPointPrimitiveRenderer";

/**
 * @deprecated Use CesiumPointPrimitiveRenderer instead.
 */
export class CesiumPointRenderer extends CesiumPointPrimitiveRenderer {
  constructor(scene: Scene, options?: CesiumPointPrimitiveRendererOptions) {
    super(scene, options);
  }

  protected override get rendererName(): string {
    return "CesiumPointRenderer";
  }
}
