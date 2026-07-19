# Security Policy

## Supported Versions

**COPC Cesium PointCloud Provider** (`copc-cesium`) is pre-1.0. Security fixes
target the latest `0.x` source release and current `main`. Older pre-1.0 versions
do not receive parallel maintenance.

| Version | Supported |
| --- | --- |
| Current `main` | Yes |
| Latest tagged/published `0.x` | Yes |
| Earlier `0.x` versions | No |

The source tag `v0.1.0` exists. Registry and GitHub release publication are
separate maintainer actions, so report the exact package version, tag, or commit
you tested. Upgrade to the newest available source/release before reporting an
issue that may already be fixed.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's
[private GitHub security advisory form](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/security/advisories/new).

If the private form is unavailable, do not disclose technical details publicly.
Open only the non-sensitive
[private-channel request](https://github.com/KimDDong03/COPC-Cesium-PointCloud-Provider/issues/new?template=security_channel_request.yml)
and wait for the maintainer to establish a private channel. That form must not
contain reproduction steps, affected URLs, logs, credentials, or other
vulnerability details.

Include in the private report, when safe:

- affected version/tag/commit and environment;
- impact and realistic attack scenario;
- minimal reproduction or proof of concept;
- relevant logs with credentials, tokens, private URLs, and sensitive COPC data
  removed;
- known mitigation or workaround;
- preferred disclosure timeline, if applicable.

The project aims to acknowledge a report within five business days and provide
an initial assessment within ten business days. Complex reports can take longer;
updates will remain in the private channel while investigation and remediation
continue.

Allow time for a fix and release before public disclosure. Attribution and
disclosure timing will be coordinated with the reporter when practical.

## Relevant Security Boundaries

Reports are especially useful when they involve:

- malformed or hostile COPC/LAZ input causing browser compromise or unbounded
  resource use;
- HTTP Range or persistent-cache validation bypass;
- source identity, `no-store`, or cache revocation failure;
- worker message validation, stale-result, or cancellation boundary failure;
- package, workflow, provenance, dependency, or secret exposure;
- cross-origin behavior that exposes non-public source data.

Availability failures caused only by an unreachable public sample host are not
security vulnerabilities, though a reproducible fail-open or resource-exhaustion
path may be.
