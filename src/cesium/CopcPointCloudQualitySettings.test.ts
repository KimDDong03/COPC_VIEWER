import { describe, expect, it } from "vitest";
import {
  COPC_POINT_CLOUD_QUALITY_SETTINGS,
  DEFAULT_COPC_POINT_CLOUD_QUALITY_PRESET,
  createCopcPointCloudQualitySettings,
} from "./CopcPointCloudQualitySettings";

describe("createCopcPointCloudQualitySettings", () => {
  it("returns the balanced preset by default", () => {
    expect(DEFAULT_COPC_POINT_CLOUD_QUALITY_PRESET).toBe("balanced");
    expect(createCopcPointCloudQualitySettings()).toEqual(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.balanced,
    );
  });

  it("keeps preview, detail, and ultra presets ordered by render budget", () => {
    expect(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.preview
        .cameraStreamMaxRenderedPointCount,
    ).toBeLessThan(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.balanced
        .cameraStreamMaxRenderedPointCount,
    );
    expect(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.balanced
        .cameraStreamMaxRenderedPointCount,
    ).toBeLessThan(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.detail
        .cameraStreamMaxRenderedPointCount,
    );
    expect(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.detail
        .cameraStreamMaxRenderedPointCount,
    ).toBeLessThan(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.ultra
        .cameraStreamMaxRenderedPointCount,
    );
  });

  it("returns a copy so callers can override locally", () => {
    const quality = createCopcPointCloudQualitySettings("preview");
    const mutableQuality = quality as {
      cameraStreamMaxRenderedPointCount: number;
    };

    mutableQuality.cameraStreamMaxRenderedPointCount = 1;

    expect(
      COPC_POINT_CLOUD_QUALITY_SETTINGS.preview
        .cameraStreamMaxRenderedPointCount,
    ).toBe(10_000);
  });
});
