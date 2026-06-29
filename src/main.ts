import { Cartesian3, Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { CesiumPointRenderer } from "./cesium/CesiumPointRenderer";
import { createPointSamplesFromCopc } from "./cesium/createPointSamplesFromCopc";
import type { CopcInspection } from "./core/copc/CopcInspection";
import type { CopcRootPointSampleResult } from "./core/copc/CopcPointDataSample";
import { inspectCopc } from "./core/copc/inspectCopc";
import { loadRootPointSamples } from "./core/copc/loadRootPointSamples";
import type { PointSample } from "./core/PointSample";
import { createHardcodedPointSamples } from "./core/hardcodedPointSamples";
import "./style.css";

const elements = getPrototypeElements();

const viewer = new Viewer(elements.container, {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  navigationHelpButton: false,
});

const points = createHardcodedPointSamples();
const renderer = new CesiumPointRenderer(viewer.scene);
renderer.setPoints(points);

viewer.camera.flyTo({
  destination: cameraTargetForPoints(points),
  duration: 0,
});

function cameraTargetForPoints(pointSamples: readonly PointSample[]): Cartesian3 {
  const firstPoint = pointSamples[0];

  if (!firstPoint) {
    throw new Error("Cannot focus the camera without point samples.");
  }

  return Cartesian3.fromDegrees(
    firstPoint.longitudeDegrees,
    firstPoint.latitudeDegrees,
    firstPoint.heightMeters + 1200,
  );
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void inspectUrl(elements.urlInput.value);
});

void inspectUrl(elements.urlInput.value);

async function inspectUrl(url: string): Promise<void> {
  setInspectionLoading();

  try {
    const inspection = await inspectCopc(url);
    renderInspection(inspection);
    elements.statusText.textContent = "Reading COPC root point data...";

    const rootPointSamples = await loadRootPointSamples(url);
    const cesiumPoints = createPointSamplesFromCopc(
      rootPointSamples.points,
      inspection,
    );

    renderer.setPoints(cesiumPoints);
    viewer.camera.flyTo({
      destination: cameraTargetForPointCloud(cesiumPoints),
      duration: 0,
    });
    renderInspection(inspection, rootPointSamples);
    elements.statusText.textContent = `Rendered ${rootPointSamples.sampledPointCount.toLocaleString()} real COPC points from the root node.`;
  } catch (error) {
    setInspectionError(error);
  }
}

function setInspectionLoading(): void {
  elements.statusText.textContent = "Reading COPC metadata...";
  elements.metadataList.replaceChildren();
}

function setInspectionError(error: unknown): void {
  elements.statusText.textContent =
    error instanceof Error
      ? `COPC inspection failed: ${error.message}`
      : "COPC inspection failed.";
  elements.metadataList.replaceChildren();
}

function renderInspection(
  inspection: CopcInspection,
  pointResult?: CopcRootPointSampleResult,
): void {
  elements.statusText.textContent = "COPC metadata loaded.";
  elements.metadataList.replaceChildren(
    metadataRow("Point count", inspection.pointCount.toLocaleString()),
    metadataRow("LAS version", inspection.lasVersion),
    metadataRow(
      "Point format",
      `${inspection.pointDataRecordFormat} (${inspection.pointDataRecordLength} bytes)`,
    ),
    metadataRow("Bounds min", formatBoundsMin(inspection.bounds)),
    metadataRow("Bounds max", formatBoundsMax(inspection.bounds)),
    metadataRow("COPC cube min", formatBoundsMin(inspection.cube)),
    metadataRow("COPC cube max", formatBoundsMax(inspection.cube)),
    metadataRow("Scale", formatVector(inspection.scale)),
    metadataRow("Offset", formatVector(inspection.offset)),
    metadataRow("Spacing", formatNumber(inspection.spacing)),
    metadataRow(
      "Root hierarchy",
      `${inspection.rootHierarchyPage.pageLength.toLocaleString()} bytes at ${inspection.rootHierarchyPage.pageOffset.toLocaleString()}`,
    ),
    metadataRow("GPS time", formatVector(inspection.gpsTimeRange)),
    metadataRow(
      "Root points",
      pointResult
        ? `${pointResult.rootPointCount.toLocaleString()} loaded, ${pointResult.sampledPointCount.toLocaleString()} rendered`
        : "Not loaded yet",
    ),
    metadataRow("VLRs", formatVlrs(inspection)),
    metadataRow("WKT", inspection.wkt ? truncateText(inspection.wkt, 220) : "Not found"),
  );
}

function cameraTargetForPointCloud(pointSamples: readonly PointSample[]): Cartesian3 {
  if (pointSamples.length === 0) {
    throw new Error("Cannot focus the camera without point samples.");
  }

  const totals = pointSamples.reduce(
    (sum, point) => ({
      longitudeDegrees: sum.longitudeDegrees + point.longitudeDegrees,
      latitudeDegrees: sum.latitudeDegrees + point.latitudeDegrees,
      maxHeightMeters: Math.max(sum.maxHeightMeters, point.heightMeters),
    }),
    {
      longitudeDegrees: 0,
      latitudeDegrees: 0,
      maxHeightMeters: Number.NEGATIVE_INFINITY,
    },
  );

  return Cartesian3.fromDegrees(
    totals.longitudeDegrees / pointSamples.length,
    totals.latitudeDegrees / pointSamples.length,
    totals.maxHeightMeters + 2_400,
  );
}

function getPrototypeElements(): {
  readonly container: HTMLDivElement;
  readonly form: HTMLFormElement;
  readonly urlInput: HTMLInputElement;
  readonly statusText: HTMLParagraphElement;
  readonly metadataList: HTMLDListElement;
} {
  const container = document.querySelector<HTMLDivElement>("#cesium-container");
  const form = document.querySelector<HTMLFormElement>("#copc-form");
  const urlInput = document.querySelector<HTMLInputElement>("#copc-url");
  const statusText = document.querySelector<HTMLParagraphElement>("#copc-status");
  const metadataList = document.querySelector<HTMLDListElement>("#copc-metadata");

  if (!container || !form || !urlInput || !statusText || !metadataList) {
    throw new Error("Missing prototype DOM elements.");
  }

  return {
    container,
    form,
    urlInput,
    statusText,
    metadataList,
  };
}

function metadataRow(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  fragment.append(term, description);

  return fragment;
}

function formatBoundsMin(bounds: CopcInspection["bounds"]): string {
  return formatVector([bounds.minX, bounds.minY, bounds.minZ]);
}

function formatBoundsMax(bounds: CopcInspection["bounds"]): string {
  return formatVector([bounds.maxX, bounds.maxY, bounds.maxZ]);
}

function formatVector(values: readonly number[]): string {
  return values.map(formatNumber).join(", ");
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatVlrs(inspection: CopcInspection): string {
  return inspection.vlrs
    .map((vlr) => {
      const kind = vlr.isExtended ? "EVLR" : "VLR";
      const description = vlr.description ? `, ${vlr.description}` : "";
      return `${kind} ${vlr.userId}/${vlr.recordId} (${vlr.contentLength.toLocaleString()} bytes${description})`;
    })
    .join(" | ");
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
