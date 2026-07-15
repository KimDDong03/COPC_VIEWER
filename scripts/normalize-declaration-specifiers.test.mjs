import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "vitest";
import {
  normalizeDeclarationSpecifier,
  rewriteDeclarationSpecifiers,
} from "./normalize-declaration-specifiers.mjs";

const declarationPath = path.resolve(
  "virtual-dist",
  "lib",
  "cesium",
  "index.d.ts",
);

describe("normalizeDeclarationSpecifier", () => {
  test("maps declaration files and directory entry points to runtime extensions", () => {
    const existingPaths = createExistingPathSet([
      path.resolve("virtual-dist", "lib", "cesium", "Renderer.d.ts"),
      path.resolve("virtual-dist", "lib", "core", "index.d.ts"),
    ]);

    assert.equal(
      normalizeDeclarationSpecifier(
        "./Renderer",
        declarationPath,
        existingPaths.has,
      ),
      "./Renderer.js",
    );
    assert.equal(
      normalizeDeclarationSpecifier(
        "../core",
        declarationPath,
        existingPaths.has,
      ),
      "../core/index.js",
    );
  });

  test("preserves package imports and explicit runtime extensions", () => {
    const noFilesExist = () => false;

    assert.equal(
      normalizeDeclarationSpecifier("cesium", declarationPath, noFilesExist),
      "cesium",
    );
    assert.equal(
      normalizeDeclarationSpecifier(
        "./Renderer.js",
        declarationPath,
        noFilesExist,
      ),
      "./Renderer.js",
    );
  });

  test("rejects unresolved relative specifiers", () => {
    assert.throws(
      () =>
        normalizeDeclarationSpecifier(
          "./Missing",
          declarationPath,
          () => false,
        ),
      /Cannot resolve relative declaration specifier "\.\/Missing"/,
    );
  });
});

describe("rewriteDeclarationSpecifiers", () => {
  test("rewrites only actual module specifiers", () => {
    const existingPaths = createExistingPathSet([
      path.resolve("virtual-dist", "lib", "cesium", "Renderer.d.ts"),
      path.resolve("virtual-dist", "lib", "core", "Point.d.ts"),
    ]);
    const declarationText = [
      'import type { Renderer } from "./Renderer";',
      'export type { Point } from "../core/Point";',
      'export type RendererFactory = typeof import("./Renderer");',
      'export type LiteralPath = "./Renderer";',
      'export type { Cartesian3 } from "cesium";',
      "",
    ].join("\n");
    const rewritten = rewriteDeclarationSpecifiers(
      declarationText,
      declarationPath,
      existingPaths.has,
    );

    assert.equal(rewritten.replacementCount, 3);
    assert.equal(
      rewritten.text,
      [
        'import type { Renderer } from "./Renderer.js";',
        'export type { Point } from "../core/Point.js";',
        'export type RendererFactory = typeof import("./Renderer.js");',
        'export type LiteralPath = "./Renderer";',
        'export type { Cartesian3 } from "cesium";',
        "",
      ].join("\n"),
    );
  });
});

function createExistingPathSet(paths) {
  const normalizedPaths = new Set(paths.map((filePath) => path.normalize(filePath)));

  return {
    has: (filePath) => normalizedPaths.has(path.normalize(filePath)),
  };
}
