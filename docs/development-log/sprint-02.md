# Sprint 2 Development Log: Image Metadata & EXIF Forensics

## 1. What metadata is
Metadata is data about data. In the context of digital images, it includes information such as the image format, dimensions, color mode, and specific structural markers. 

## 2. What EXIF is
EXIF (Exchangeable Image File Format) is a specific standard for storing metadata within digital image files (like JPEG or TIFF). It commonly includes camera manufacturer, device model, capture timestamp, lens parameters, and GPS coordinates.

## 3. Why metadata matters for image forensics
Metadata is a critical initial layer of evidence. It can reveal if an image was processed by specific software (e.g., Adobe Photoshop), when it claims to have been captured, and what device created it. Inconsistencies between visual content and metadata can be strong forensic indicators.

## 4. Why metadata is not proof of manipulation
Metadata is easily altered, stripped, or spoofed by malicious actors. Conversely, social media platforms and standard editing software frequently strip or alter metadata for benign reasons (like privacy or compression). Therefore, finding "Photoshop" in EXIF data is an *indicator*, not definitive proof of malicious manipulation.

## 5. Why Pillow is used
Pillow provides a robust, native Python mechanism to read image headers and extract the EXIF dictionary without executing potentially malicious payload data. It avoids fragile string-parsing of binary formats and securely extracts standard TIFF/EXIF tags.

## 6. Metadata normalization strategy
Raw EXIF data often consists of numeric tag identifiers and complex byte streams. We normalize this by mapping IDs to human-readable string keys (via `PIL.ExifTags.TAGS`) and decoding bytes to strings, ignoring or cleaning corrupted null bytes. This ensures the output is JSON-serializable for the API and frontend.

## 7. Analysis entity design
The `Analysis` SQLAlchemy model is designed generically. It links to an `Evidence` item, has an `analysis_type` (e.g., "METADATA"), a `status` tracking field, and a generic `structured_findings` JSON column. This allows future sprints (e.g., ELA or ML analysis) to reuse the exact same architecture.

## 8. API design
- `POST /api/evidence/{evidence_id}/analysis/metadata`: Synchronously executes the metadata extraction and generates findings.
- `GET /api/analysis/{analysis_id}`: Retrieves the stored analysis result.

## 9. Security/privacy considerations
GPS data and exact capture coordinates are highly sensitive. 
- GPS info is normalized but NOT indiscriminately logged in server terminals.
- It is only exposed via the authenticated/secure evidence retrieval endpoint.
- File system paths remain strictly server-side; the client only ever receives the safe `evidence_identifier`.

## 10. Testing methodology
- Created `test_analysis.py` to trigger the analysis endpoints.
- Simulated images with and without EXIF structures using `Pillow`.
- Verified the structured findings accurately flag indicators like `NO_EXIF_METADATA` and handle missing GPS gracefully.
- All 11 tests across cases, health, and analysis execute successfully in isolated SQLite memory pools.

## 11. Known limitations
- Currently runs synchronously. As more complex forensic algorithms are added in future sprints, we will need to transition this to an asynchronous background worker queue (e.g., Celery).
- Faking deep, nested EXIF structures in tests without a dedicated library (like `piexif`) limits our ability to test highly complex malformed EXIF trees dynamically.

## 12. Future connection to evidence fusion
These metadata indicators (e.g., software presence, missing EXIF) will eventually feed into the Evidence Fusion engine. The fusion engine will combine this metadata layer with Classical DIP results (Sprint 3) and ML classifiers to generate a final, holistic confidence score.
