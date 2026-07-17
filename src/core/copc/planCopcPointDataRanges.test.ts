import { describe, expect, it } from "vitest";
import {
  planCopcPointDataRanges,
  type CopcPointDataRangeEntry,
} from "./planCopcPointDataRanges";

describe("planCopcPointDataRanges", () => {
  it("merges contiguous point-data entries by default", () => {
    const plan = planCopcPointDataRanges([
      entry("0-0-0-0", 100, 20),
      entry("1-0-0-0", 120, 30),
      entry("1-1-0-0", 150, 10),
    ]);

    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 100, end: 160 },
      "1-0-0-0": { begin: 100, end: 160 },
      "1-1-0-0": { begin: 100, end: 160 },
    });
  });

  it("merges across a configured gap only at entry boundaries", () => {
    const plan = planCopcPointDataRanges(
      [
        entry("0-0-0-0", 100, 20),
        entry("1-0-0-0", 124, 10),
        entry("1-1-0-0", 140, 5),
      ],
      { maxGapBytes: 5 },
    );

    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 100, end: 134 },
      "1-0-0-0": { begin: 100, end: 134 },
      "1-1-0-0": { begin: 140, end: 145 },
    });
  });

  it("starts a new span when a merge would exceed the max span", () => {
    const plan = planCopcPointDataRanges(
      [
        entry("0-0-0-0", 0, 40),
        entry("1-0-0-0", 40, 40),
        entry("1-1-0-0", 80, 40),
      ],
      { maxSpanBytes: 100 },
    );

    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 0, end: 80 },
      "1-0-0-0": { begin: 0, end: 80 },
      "1-1-0-0": { begin: 80, end: 120 },
    });
  });

  it("keeps a single oversize node in its own span", () => {
    const plan = planCopcPointDataRanges(
      [
        entry("0-0-0-0", 0, 150),
        entry("1-0-0-0", 150, 10),
      ],
      { maxSpanBytes: 100 },
    );

    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 0, end: 150 },
      "1-0-0-0": { begin: 150, end: 160 },
    });
  });

  it("keeps zero-byte hierarchy nodes as empty ranges without eager neighbors", () => {
    const plan = planCopcPointDataRanges([
      entry("empty", 100, 0),
      entry("populated", 100, 20),
    ]);

    expect(toObject(plan)).toEqual({
      empty: { begin: 100, end: 100 },
      populated: { begin: 100, end: 120 },
    });
  });

  it("sorts unsorted entries by point-data offset before planning", () => {
    const plan = planCopcPointDataRanges([
      entry("1-1-0-0", 160, 10),
      entry("0-0-0-0", 100, 20),
      entry("1-0-0-0", 120, 40),
    ]);

    expect([...plan.keys()]).toEqual([
      "0-0-0-0",
      "1-0-0-0",
      "1-1-0-0",
    ]);
    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 100, end: 170 },
      "1-0-0-0": { begin: 100, end: 170 },
      "1-1-0-0": { begin: 100, end: 170 },
    });
  });

  it("accepts bigint range values that fit in safe integer space", () => {
    const plan = planCopcPointDataRanges([
      {
        nodeKey: "0-0-0-0",
        pointDataOffset: 10n,
        pointDataLength: 20n,
      },
    ]);

    expect(toObject(plan)).toEqual({
      "0-0-0-0": { begin: 10, end: 30 },
    });
  });

  it("rejects invalid and duplicate entries", () => {
    expect(() =>
      planCopcPointDataRanges([
        { nodeKey: "0-0-0-0", pointDataLength: 10 },
      ]),
    ).toThrow("pointDataOffset for 0-0-0-0 must be a safe integer.");
    expect(() =>
      planCopcPointDataRanges([entry("0-0-0-0", -1, 10)]),
    ).toThrow(
      "pointDataOffset for 0-0-0-0 must be a non-negative safe integer.",
    );
    expect(() =>
      planCopcPointDataRanges([entry("0-0-0-0", 0, -1)]),
    ).toThrow(
      "pointDataLength for 0-0-0-0 must be a non-negative safe integer.",
    );
    expect(() =>
      planCopcPointDataRanges([
        entry("0-0-0-0", 0, 10),
        entry("0-0-0-0", 10, 10),
      ]),
    ).toThrow("Duplicate COPC point-data node key: 0-0-0-0");
  });
});

function entry(
  nodeKey: string,
  pointDataOffset: number,
  pointDataLength: number,
): CopcPointDataRangeEntry {
  return {
    nodeKey,
    pointDataOffset,
    pointDataLength,
  };
}

function toObject(
  plan: ReadonlyMap<string, { readonly begin: number; readonly end: number }>,
): Record<string, { readonly begin: number; readonly end: number }> {
  return Object.fromEntries(plan);
}
