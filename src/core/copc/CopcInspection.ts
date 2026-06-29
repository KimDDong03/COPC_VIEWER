export interface CopcBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface CopcHierarchyPageSummary {
  readonly pageOffset: number;
  readonly pageLength: number;
}

export interface CopcVlrSummary {
  readonly userId: string;
  readonly recordId: number;
  readonly description: string;
  readonly contentLength: number;
  readonly isExtended: boolean;
}

export interface CopcInspection {
  readonly sourceUrl: string;
  readonly pointCount: number;
  readonly lasVersion: string;
  readonly pointDataRecordFormat: number;
  readonly pointDataRecordLength: number;
  readonly bounds: CopcBounds;
  readonly cube: CopcBounds;
  readonly scale: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly spacing: number;
  readonly gpsTimeRange: readonly [number, number];
  readonly rootHierarchyPage: CopcHierarchyPageSummary;
  readonly vlrs: readonly CopcVlrSummary[];
  readonly wkt: string | null;
}
