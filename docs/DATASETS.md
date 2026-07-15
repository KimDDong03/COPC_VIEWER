# Sample Data Provenance

The library package does not include COPC, LAS, or LAZ data. The basic viewer
streams the external samples below with HTTP range requests. The local-file
browser smoke stores its temporary download under ignored `output/` and never
adds that file to the npm package.

## Autzen classified

- Viewer URL: `https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz`
- Canonical project record: [PDAL/data Autzen](https://github.com/PDAL/data/tree/main/autzen)
- License: [Creative Commons Attribution 4.0](https://github.com/PDAL/data/blob/main/LICENSE)
- Provenance: Aaron Reyna/Watershed Sciences supplied the 2010 Autzen data for
  libLAS testing; Max Sampson/Hobu manually classified it into 21 classes in
  2021, as recorded by PDAL/data.
- Verified mirror identity on 2026-07-10: 81,123,042 bytes; SHA-256
  `db2d56cdfa058bffccdc5d6019dae2fc9c6a551df10a5523c06c76a3e25a27fa`
  for both the PDAL/data file and the viewer URL.
- Required attribution: name the original contributors above, PDAL/data, the
  CC BY 4.0 license, and disclose any further modifications.

## Millsite Reservoir

- Viewer URL: `https://s3.amazonaws.com/hobu-lidar/millsite.copc.laz`
- Canonical collection evidence: the public
  [USGS Millsite EPT metadata](https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_UT_MillsiteReservoir_2017_LAS_2018/ept.json)
  records 374,609,447 points and conforming Z bounds of 1,544–2,804 m.
- Terms: USGS states that [all 3DEP products are free and without use
  restrictions](https://www.usgs.gov/3d-elevation-program), and its 3DEP LAZ
  distribution announcement marks the material as
  [public domain](https://www.usgs.gov/news/technical-announcement/3d-elevation-program-distributing-lidar-data-laz-format).
- Observed Hobu-hosted object on 2026-07-10: 1,445,463,233 bytes, ETag
  `"c8b063cda9ce7f6535539be2c6a95799-173"`, last modified 2021-11-29,
  HTTP `206` range support, CORS `Access-Control-Allow-Origin: *`, 374,609,447
  points, Z range 1,544.44–2,803.84 m, and compound WKT
  `NAD83(2011) / UTM zone 12N + NAVD88 height` (horizontal EPSG:6341).
- Provenance qualification: the exact point count and Z bounds match the USGS
  public collection, which is strong evidence that this is a COPC encoding of
  that collection. The object does not embed an original-source URL or license,
  and the current [COPC example page](https://copc.io/#example-data) names a
  different, now-unavailable object. Byte-for-byte derivation is therefore not
  claimed.
- Submission credit: “Underlying data available from U.S. Geological Survey,
  3D Elevation Program; COPC representation hosted by Hobu.” State that the
  viewer range-reads the external object and does not redistribute it. For the
  strongest final chain of custody, retain written host confirmation or replace
  this URL with a reproducibly generated COPC from the canonical USGS source.

## Acceptance rule for future samples

A preset or submission screenshot must have a stable source record and explicit
reuse terms. A publicly reachable object is not, by itself, proof of permission.
Before adding a sample, record its provider, canonical source, license or public
domain statement, transformation history, CRS, and whether any bytes are
redistributed. Samples with unspecified terms may be used only after written
permission and must not be mirrored or presented as competition evidence before
that permission is recorded.
