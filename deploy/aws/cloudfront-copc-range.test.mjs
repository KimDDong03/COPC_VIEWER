import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "cloudfront-copc-range.yaml");
const readmePath = join(here, "README.md");

describe("CloudFront COPC range deployment template", () => {
  it("creates a private versioned S3 bucket and OAC-restricted bucket policy", async () => {
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("Type: AWS::S3::Bucket");
    expect(template).toContain("VersioningConfiguration:");
    expect(template).toContain("Status: Enabled");
    expect(template).toContain("BlockPublicAcls: true");
    expect(template).toContain("BlockPublicPolicy: true");
    expect(template).toContain("IgnorePublicAcls: true");
    expect(template).toContain("RestrictPublicBuckets: true");
    expect(template).toContain("Type: AWS::CloudFront::OriginAccessControl");
    expect(template).toContain("OriginAccessControlOriginType: s3");
    expect(template).toContain("SigningBehavior: always");
    expect(template).toContain("Principal:");
    expect(template).toContain("Service: cloudfront.amazonaws.com");
    expect(template).toContain("Action: s3:GetObject");
    expect(template).toContain("AWS:SourceArn:");
    expect(template).toContain("distribution/${CopcDistribution}");
  });

  it("keeps the CloudFront behavior narrow for range-oriented immutable objects", async () => {
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("HttpVersion: http2and3");
    expect(template).toContain("ViewerProtocolPolicy: redirect-to-https");
    expect(template).toContain("MinimumProtocolVersion: TLSv1.2_2021");
    expect(template).toContain("SslSupportMethod: sni-only");
    expect(template).toContain("Compress: false");
    expect(template).toContain("EnableAcceptEncodingBrotli: false");
    expect(template).toContain("EnableAcceptEncodingGzip: false");
    expect(template).toContain("CookieBehavior: none");
    expect(template).toContain("HeaderBehavior: none");
    expect(template).toContain("QueryStringBehavior: none");
    expect(template).toContain("Type: AWS::CloudFront::Function");
    expect(template).toContain("Object.keys(request.querystring).length > 0");
    expect(template).toContain("EventType: viewer-request");
    const defaultBehavior = yamlBlockAfter(template, "DefaultCacheBehavior:");
    expect(yamlListAfter(defaultBehavior, "AllowedMethods:")).toEqual(["GET", "HEAD", "OPTIONS"]);
    expect(yamlListAfter(defaultBehavior, "CachedMethods:")).toEqual(["GET", "HEAD"]);
  });

  it("documents and configures CORS for browser range and validator requests", async () => {
    const [template, readme] = await Promise.all([
      readFile(templatePath, "utf8"),
      readFile(readmePath, "utf8"),
    ]);

    for (const header of ["Range", "If-Range", "If-None-Match"]) {
      expect(template).toContain(`- ${header}`);
    }
    for (const header of [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "ETag",
      "Age",
      "X-Cache",
    ]) {
      expect(template).toContain(`- ${header}`);
    }
    expect(template).toContain("AccessControlAllowMethods:");
    expect(template).toContain("OriginOverride: true");
    expect(template).toContain("Type: AWS::CloudFront::OriginRequestPolicy");
    expect(template).toContain("OriginRequestPolicyId: !Ref CopcOriginRequestPolicy");
    for (const header of [
      "Origin",
      "Access-Control-Request-Headers",
      "Access-Control-Request-Method",
    ]) {
      expect(template).toContain(`- ${header}`);
    }
    expect(template).not.toMatch(/AllowedCorsOrigins:\s*\n(?:.*\n){0,3}\s+Default:\s*["']?\*["']?/);
    expect(readme).toMatch(/response policy allows `Range`, `If-Range`, and `If-None-Match`/);
    expect(readme).toMatch(/exposes `Accept-Ranges`, `Content-Length`, `Content-Range`, `ETag`, `Age`, and `X-Cache`/);
    expect(readme).toMatch(/caches only `GET` and `HEAD`/);
  });

  it("outputs deployment identifiers and states immutable-key limitations", async () => {
    const [template, readme] = await Promise.all([
      readFile(templatePath, "utf8"),
      readFile(readmePath, "utf8"),
    ]);

    expect(template).toContain("BucketName:");
    expect(template).toContain("DistributionId:");
    expect(template).toContain("DistributionDomainName:");
    expect(readme).toMatch(/Use content-addressed or otherwise versioned object keys/);
    expect(readme).toMatch(/Do not overwrite the bytes at a previously served key/);
    expect(readme).toMatch(/CloudFront does not enforce this project's 64 KiB range-planning boundary/);
    expect(readme).toMatch(/live QC against the deployed domain/);
    expect(readme).toMatch(/does not authenticate CloudFront viewers/);
    expect(readme).toMatch(/rejects every query string/);
  });
});

function yamlListAfter(text, marker) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) return [];

  const baseIndent = indentation(lines[start]);
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (indentation(line) <= baseIndent) break;
    const match = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (match) items.push(match[1]);
  }
  return items;
}

function yamlBlockAfter(text, marker) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) return "";

  const baseIndent = indentation(lines[start]);
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    if (indentation(line) <= baseIndent) break;
    block.push(line);
  }
  return block.join("\n");
}

function indentation(line) {
  return /^\s*/.exec(line)[0].length;
}
