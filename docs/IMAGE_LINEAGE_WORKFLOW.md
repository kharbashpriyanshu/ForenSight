# Forwarded Image Investigation Workflow

ForenSight's guided workflow is designed for investigative teams reviewing still images received through messaging, social platforms, screenshots, or web downloads. It keeps reported context, file integrity, measured observations, and analyst decisions as separate records.

## Investigation steps

1. Create a case and record the reported claim, event date and location, and source reference. These fields document the allegation or context supplied at intake; they are not verified by the forensic engines.
2. Upload each file as received. Record the channel, acquisition method, sender if appropriate, time received, reported capture time, source link, and acquisition notes. For forwarded images, retain the forwarded file and any earlier or later versions as separate evidence items.
3. Open **Image version links** and run **Find related versions**. The current matcher links identical SHA-256 bitstreams and produces visual-match candidates using a 64-bit difference hash and ORB features with RANSAC geometry checks.
4. Review each candidate pair. Confirm a relation, select a parent when the evidence supports direction, record that direction is unclear, or reject the link. Every review decision records the investigator and writes a case audit event.
5. Run relevant image analyses, review observations and counter-hypotheses, and export the PDF or JSON case report. The report includes the intake question, a concise triage summary, acquisition context, C2PA status when checked, reviewed image links, and the full evidence and analysis records.

## Similarity interpretation

- **EXACT_BITSTREAM** means the two files have the same SHA-256 digest. It establishes byte identity only.
- **LIKELY_DERIVATIVE** means the pair met the current ORB/RANSAC candidate thresholds: at least 12 geometrically consistent inliers and a 35% inlier ratio.
- **POSSIBLE_DERIVATIVE** means the pair met the current perceptual-hash and aspect-ratio rule. It is a lower-support candidate.
- The similarity thresholds have not been calibrated as forensic error rates. Repeated textures may produce false candidates; heavy crops or screenshots may be missed. A visual match does not prove which version came first, who created it, or whether the depicted event is true.
- Parent/child direction is entered by an analyst and is never inferred from upload time or matching metrics.

## Benign transformation stress run

The Benchmark Suite exposes `POST /api/benchmark/transformation-stress` and `GET /api/benchmark/transformation-profiles`. The run compares baseline images with five reproducible laboratory profiles:

- Resize to a 1600-pixel long edge and encode JPEG at quality 82.
- Recompress JPEG at quality 72 and then quality 84.
- Crop 5% from each edge and encode JPEG at quality 84.
- Place the image on a 720 × 1280 neutral canvas and re-encode it, as a screen-recapture simulation.
- Decode and rewrite the RGB pixels to PNG without carrying source metadata.

The report groups engine applicability, execution status, localization results where ground-truth masks exist, and changes in numeric normalized observations by profile. The profiles are synthetic operations, not captures from WhatsApp or another named platform. They do not provide platform-specific false-positive rates or universal accuracy claims. Such rates need labeled, licensed, representative data and task-specific decision rules.

Run a small selected engine list first. The service accepts at most 20 source images per request and defaults to six commonly used engines. Results are written to `backend/datasets/benchmark/transformation-stress/latest.json` when run from the backend directory.

## C2PA Content Credentials

The **Inspect Content Credential** action reads and validates available C2PA information with the official Python SDK. Remote manifest retrieval and OCSP requests are disabled during inspection. The report distinguishes credentials that are absent, present with validation issues, reported valid by the SDK, indeterminate, or unavailable.

Credential absence is not evidence of manipulation. A valid content binding establishes properties of the signed provenance data; it does not prove that the image depicts the reported event or location. The SDK's configured trust stores also affect validation results.

## Data and privacy

Case claims, sender information, source URLs, and notes may contain sensitive information. They are stored with the case or evidence context and included in case report exports. Use only information necessary for the investigation and apply the project's existing case access controls.
