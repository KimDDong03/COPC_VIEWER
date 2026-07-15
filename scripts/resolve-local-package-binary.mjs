import { readFileSync } from "node:fs";
import path from "node:path";

export function resolveLocalPackageBinary(
  installationRoot,
  packageName,
  binaryName,
) {
  const packageRoot = path.resolve(
    installationRoot,
    "node_modules",
    ...packageName.split("/"),
  );
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const binaryPath =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.[binaryName];

  if (typeof binaryPath !== "string" || binaryPath.length === 0) {
    throw new Error(
      `${packageName} does not declare the ${binaryName} local binary.`,
    );
  }

  const resolvedBinaryPath = path.resolve(packageRoot, binaryPath);
  const relativeBinaryPath = path.relative(packageRoot, resolvedBinaryPath);

  if (
    relativeBinaryPath === "" ||
    relativeBinaryPath.startsWith("..") ||
    path.isAbsolute(relativeBinaryPath)
  ) {
    throw new Error(
      `${packageName} declared a binary outside its package root: ${binaryPath}`,
    );
  }

  return resolvedBinaryPath;
}
