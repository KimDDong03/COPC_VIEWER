import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const defaultDeclarationRoot = path.join(repoRoot, "dist", "lib");
const explicitRuntimeExtensionPattern = /\.(?:cjs|js|json|mjs)$/i;

export function normalizeDeclarationSpecifier(
  specifier,
  declarationPath,
  fileExists = existsSync,
) {
  if (!isRelativeSpecifier(specifier)) {
    return specifier;
  }

  if (explicitRuntimeExtensionPattern.test(specifier)) {
    return specifier;
  }

  const targetPath = path.resolve(path.dirname(declarationPath), specifier);
  const fileCandidates = [
    {
      declarationPath: `${targetPath}.d.ts`,
      specifier: `${specifier}.js`,
    },
    {
      declarationPath: `${targetPath}.d.mts`,
      specifier: `${specifier}.mjs`,
    },
    {
      declarationPath: `${targetPath}.d.cts`,
      specifier: `${specifier}.cjs`,
    },
  ];

  for (const candidate of fileCandidates) {
    if (fileExists(candidate.declarationPath)) {
      return candidate.specifier;
    }
  }

  const directoryCandidates = [
    {
      declarationPath: path.join(targetPath, "index.d.ts"),
      specifier: `${specifier.replace(/\/$/, "")}/index.js`,
    },
    {
      declarationPath: path.join(targetPath, "index.d.mts"),
      specifier: `${specifier.replace(/\/$/, "")}/index.mjs`,
    },
    {
      declarationPath: path.join(targetPath, "index.d.cts"),
      specifier: `${specifier.replace(/\/$/, "")}/index.cjs`,
    },
  ];

  for (const candidate of directoryCandidates) {
    if (fileExists(candidate.declarationPath)) {
      return candidate.specifier;
    }
  }

  throw new Error(
    `Cannot resolve relative declaration specifier "${specifier}" from ${declarationPath}.`,
  );
}

export function rewriteDeclarationSpecifiers(
  declarationText,
  declarationPath,
  fileExists = existsSync,
) {
  const sourceFile = ts.createSourceFile(
    declarationPath,
    declarationText,
    ts.ScriptTarget.Latest,
    true,
    readDeclarationScriptKind(declarationPath),
  );
  const replacements = [];

  function rememberModuleSpecifier(moduleSpecifier) {
    if (!moduleSpecifier || !ts.isStringLiteralLike(moduleSpecifier)) {
      return;
    }

    const normalizedSpecifier = normalizeDeclarationSpecifier(
      moduleSpecifier.text,
      declarationPath,
      fileExists,
    );

    if (normalizedSpecifier === moduleSpecifier.text) {
      return;
    }

    replacements.push({
      end: moduleSpecifier.getEnd() - 1,
      start: moduleSpecifier.getStart(sourceFile) + 1,
      value: normalizedSpecifier,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      rememberModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      const importTypeArgument = node.argument;

      if (
        ts.isLiteralTypeNode(importTypeArgument) &&
        ts.isStringLiteralLike(importTypeArgument.literal)
      ) {
        rememberModuleSpecifier(importTypeArgument.literal);
      }
    } else if (ts.isExternalModuleReference(node)) {
      rememberModuleSpecifier(node.expression);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let rewrittenText = declarationText;

  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    rewrittenText =
      rewrittenText.slice(0, replacement.start) +
      replacement.value +
      rewrittenText.slice(replacement.end);
  }

  return {
    replacementCount: replacements.length,
    text: rewrittenText,
  };
}

export async function normalizeDeclarationTree(
  declarationRoot,
  options = {},
) {
  const declarationPaths = await listDeclarationFiles(declarationRoot);
  const changedPaths = [];
  let replacementCount = 0;

  for (const declarationPath of declarationPaths) {
    const declarationText = await readFile(declarationPath, "utf8");
    const rewritten = rewriteDeclarationSpecifiers(
      declarationText,
      declarationPath,
    );

    if (rewritten.replacementCount === 0) {
      continue;
    }

    changedPaths.push(declarationPath);
    replacementCount += rewritten.replacementCount;

    if (!options.check) {
      await writeFile(declarationPath, rewritten.text);
    }
  }

  if (options.check && changedPaths.length > 0) {
    throw new Error(
      [
        `${replacementCount} extensionless relative declaration specifier(s) remain in ${changedPaths.length} file(s).`,
        ...changedPaths.map((declarationPath) => `- ${declarationPath}`),
      ].join("\n"),
    );
  }

  return {
    declarationFileCount: declarationPaths.length,
    changedFileCount: changedPaths.length,
    replacementCount,
  };
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function readDeclarationScriptKind(declarationPath) {
  if (declarationPath.endsWith(".d.mts")) {
    return ts.ScriptKind.TS;
  }

  if (declarationPath.endsWith(".d.cts")) {
    return ts.ScriptKind.TS;
  }

  return ts.ScriptKind.TS;
}

async function listDeclarationFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const declarationPaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      declarationPaths.push(...(await listDeclarationFiles(entryPath)));
    } else if (/\.d\.(?:cts|mts|ts)$/.test(entry.name)) {
      declarationPaths.push(entryPath);
    }
  }

  return declarationPaths.sort((left, right) => left.localeCompare(right));
}

async function main() {
  const check = process.argv.includes("--check");
  const declarationRootArgument = process.argv
    .slice(2)
    .find((argument) => !argument.startsWith("--"));
  const declarationRoot = declarationRootArgument
    ? path.resolve(declarationRootArgument)
    : defaultDeclarationRoot;
  const result = await normalizeDeclarationTree(declarationRoot, { check });

  console.log(
    check
      ? `Declaration specifier check passed for ${result.declarationFileCount} file(s).`
      : `Normalized ${result.replacementCount} declaration specifier(s) in ${result.changedFileCount} of ${result.declarationFileCount} file(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
