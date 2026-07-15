import type {
  CopcPointColor,
  CopcPointDataSample,
  CopcPointDataSampleArrays,
} from "../core/copc/CopcPointDataSample";

const DEFAULT_CYAN = packRgb(0, 255, 255);
const UNKNOWN_CLASSIFICATION = packRgb(158, 163, 168);
const MINIMUM_INTENSITY_GRAY = 48;
const MAXIMUM_INTENSITY_GRAY = 255;

const ASPRS_CLASSIFICATION_COLORS = createAsprsClassificationColors();

/**
 * Returns a packed 0xRRGGBB color without allocating per-point objects.
 * Complete RGB data has priority, followed by known ASPRS classes, intensity,
 * and a neutral classification fallback.
 */
export function colorizeCopcPoint(
  pointData: CopcPointDataSampleArrays,
  pointIndex: number,
): number {
  return colorizeCopcAttributes(
    pointData.red?.[pointIndex],
    pointData.green?.[pointIndex],
    pointData.blue?.[pointIndex],
    pointData.classification?.[pointIndex],
    pointData.intensity?.[pointIndex],
  );
}

export function colorizeCopcPointSample(
  point: CopcPointDataSample,
): CopcPointColor {
  if (point.color) {
    return point.color;
  }

  return unpackRgb(
    colorizeCopcAttributes(
      undefined,
      undefined,
      undefined,
      point.classification,
      point.intensity,
    ),
  );
}

function colorizeCopcAttributes(
  red: number | undefined,
  green: number | undefined,
  blue: number | undefined,
  classification: number | undefined,
  intensity: number | undefined,
): number {
  if (red !== undefined && green !== undefined && blue !== undefined) {
    return packRgb(red, green, blue);
  }

  if (classification !== undefined) {
    const normalizedClassification = Math.max(
      0,
      Math.min(255, Math.round(classification)),
    );
    const classificationColor =
      ASPRS_CLASSIFICATION_COLORS[normalizedClassification];

    if (classificationColor !== undefined) {
      return classificationColor;
    }
  }

  if (intensity !== undefined) {
    const normalized = Math.max(0, Math.min(65_535, intensity)) / 65_535;
    const gray = Math.round(
      MINIMUM_INTENSITY_GRAY +
        Math.sqrt(normalized) *
          (MAXIMUM_INTENSITY_GRAY - MINIMUM_INTENSITY_GRAY),
    );
    return packRgb(gray, gray, gray);
  }

  return classification === undefined ? DEFAULT_CYAN : UNKNOWN_CLASSIFICATION;
}

function createAsprsClassificationColors(): ReadonlyArray<number | undefined> {
  const colors = new Array<number | undefined>(23);

  colors[2] = packRgb(166, 124, 82); // Ground
  colors[3] = packRgb(120, 184, 92); // Low vegetation
  colors[4] = packRgb(72, 148, 65); // Medium vegetation
  colors[5] = packRgb(34, 105, 50); // High vegetation
  colors[6] = packRgb(210, 188, 172); // Building
  colors[7] = packRgb(214, 72, 72); // Low noise
  colors[9] = packRgb(52, 122, 183); // Water
  colors[10] = packRgb(135, 103, 85); // Rail
  colors[11] = packRgb(80, 82, 86); // Road surface
  colors[13] = packRgb(239, 199, 73); // Wire guard
  colors[14] = packRgb(245, 220, 82); // Wire conductor
  colors[15] = packRgb(196, 116, 55); // Transmission tower
  colors[16] = packRgb(224, 156, 67); // Wire connector
  colors[17] = packRgb(232, 143, 63); // Bridge deck
  colors[18] = packRgb(190, 38, 45); // High noise
  colors[19] = packRgb(154, 118, 170); // Overhead structure
  colors[20] = packRgb(128, 104, 76); // Ignored ground
  colors[21] = packRgb(225, 238, 245); // Snow
  colors[22] = packRgb(116, 104, 138); // Temporal exclusion

  return colors;
}

function packRgb(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}

function unpackRgb(packedColor: number): CopcPointColor {
  return {
    red: (packedColor >> 16) & 255,
    green: (packedColor >> 8) & 255,
    blue: packedColor & 255,
  };
}
