# CloudFront + private S3-origin COPC range deployment

This template creates a private, versioned S3 origin and a public CloudFront distribution that serves one configured public COPC prefix through Origin Access Control (OAC). OAC prevents direct public S3 reads; it does not authenticate CloudFront viewers. It is intended for public/demo COPC delivery from browser clients that issue HTTP `Range` requests against immutable object keys. Add CloudFront signed URLs/cookies or an application authorization layer before using it for sensitive point clouds, and never place private objects below the allowed prefix.

## Deploy

Prerequisites:

- An ACM certificate in `us-east-1` for the CloudFront alias domain.
- A DNS name that you will point at the resulting CloudFront distribution.
- COPC objects uploaded to the generated bucket under immutable object keys.

Example:

```powershell
aws cloudformation deploy `
  --stack-name copc-range-edge `
  --template-file deploy/aws/cloudfront-copc-range.yaml `
  --parameter-overrides `
    AlternateDomainNames=copc.example.com `
    AcmCertificateArn=arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-0000-0000-000000000000 `
    AllowedCorsOrigins=https://viewer.example.com `
    AllowedObjectPrefix=copc/public/ `
  --capabilities CAPABILITY_IAM
```

The stack outputs:

- `BucketName`
- `DistributionId`
- `DistributionDomainName`
- `AllowedObjectPrefix`

## Operating contract

Use content-addressed or otherwise versioned object keys below `AllowedObjectPrefix` for every public COPC publish, for example `copc/public/sha256/<digest>.copc.laz` or `copc/public/releases/<release-id>/<name>.copc.laz`. The OAC bucket policy cannot read objects outside that prefix. Do not overwrite the bytes at a previously served key. Changing bytes under the same key can make downstream partial-range caches mix slices from different object versions, especially when clients, CloudFront edge caches, and any application-level range cache overlap in time.

The CloudFront cache key intentionally excludes cookies, query strings, and viewer headers, and compression is disabled. A viewer-request function rejects every query string, so each immutable object path is the enforced complete cache identity rather than a documentation-only convention.

Allowed viewer methods are `GET`, `HEAD`, and `OPTIONS`, but this template caches only `GET` and `HEAD`. Each preflight therefore reaches S3 instead of sharing an `OPTIONS` cache entry across origins or requested-header combinations. CORS origins are a required explicit deployment parameter, not `*` by default. An origin-request policy forwards `Origin`, `Access-Control-Request-Headers`, and `Access-Control-Request-Method` so S3 can evaluate preflight. The response policy allows `Range`, `If-Range`, and `If-None-Match`, and exposes `Accept-Ranges`, `Content-Length`, `Content-Range`, `ETag`, `Age`, and `X-Cache` for browser inspection. CORS controls browser script access only; it is not data authorization.

## Limits and QC

CloudFront does not enforce this project's 64 KiB range-planning boundary or prove that a COPC client is using efficient ranges. It will accept valid HTTP range requests and may fetch/cache according to CloudFront behavior, but the actual deployment still needs live QC against the deployed domain:

- Confirm representative `Range` requests return `206` with correct `Content-Range`, `Content-Length`, `Accept-Ranges`, and stable `ETag`.
- Run `npm run qc:deployed-edge -- <immutable-copc-url> <allowed-viewer-origin> <expected-cloudfront-host>` to pin the trusted target host and confirm CORS preflight, a bounded first range read, repeated `If-Range` reads using the observed strong ETag, exact bytes, and a CloudFront hit. Do not feed untrusted URLs into CI.
- Confirm the real viewer can read the object in a browser; the Node QC validates the HTTP preflight contract but is not a browser execution engine.
- Confirm repeated camera movement does not trigger duplicate or mixed-version partial reads.
- Confirm object keys are immutable in the release/upload workflow.
