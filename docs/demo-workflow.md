# ForenSight V1.0 Demo Workflow

A 3–5 minute live product demonstration sequence tailored for recruiters and technical interviews.

## Sequence

### 00:00 — Introduce ForenSight
* Briefly introduce ForenSight as an explainable digital image forensics platform.
* Highlight the focus on deterministic measurements and chain of custody rather than black-box AI or "fake/real" probabilities.

### 00:20 — Create Investigation Case
* Open the Dashboard.
* Enter a new case title (e.g., `DEMO-CASE-001`) and click **Create Case**.
* Explain that ForenSight groups evidence into cases to maintain context.

### 00:40 — Acquire Evidence
* In the Evidence Acquisition section, select a sample JPEG image.
* Click **Upload**.
* Mention that the system isolates the original evidence from derived artifacts to preserve integrity.

### 01:00 — Show SHA-256 Integrity
* Point to the generated **SHA-256 Hash** displayed immediately after upload.
* Explain that this guarantees the cryptographic integrity of the source evidence throughout the analysis.

### 01:20 — Run Forensic Observations
* Scroll to the **Analysis Controls** section.
* Click the **Run Full Forensic Suite** button.
* Explain the different analysis modules running in parallel:
  * **Metadata:** Extracts software signatures.
  * **ELA (Error Level Analysis):** Measures recompression differences.
  * **Noise Residual:** Highlights high-frequency inconsistencies.
  * **JPEG/DCT:** Analyzes quantization and frequency-domain statistics.
  * **Copy-Move:** Uses SIFT and RANSAC for internal clone detection.

### 02:30 — Show Visual Artifacts
* Scroll down to the completed analysis panels.
* Walk through 1-2 key visual artifacts (e.g., the ELA map or Noise Residual map).
* Emphasize the clear structure of each panel: Method, Configuration, Measurements, Visualization, Interpretation, and Limitations.

### 03:10 — Normalize Evidence
* Scroll to the **Evidence Normalization & Observations** section.
* Explain that ForenSight normalizes raw mathematical outputs from the various modules into standardized canonical observations to enable programmatic reasoning.

### 03:30 — Correlate Observations
* Scroll to the **Evidence Correlation & Assessment** section.
* Explain that the engine applies deterministic rules (Rule v7B-v1) to identify contextual relationships between observations across different evidence families, preventing double-counting.

### 04:00 — Explain Assessment
* Point to the final **Assessment Level** (e.g., MODERATE_FORENSIC_CONCERN).
* Show the structured breakdown: Evidence Families → Relationships → Contributing Evidence.

### 04:30 — Explain Scientific Limitations
* Point out the **Scientific Limitation Warning** clearly displayed at the bottom.
* Explicitly state: "The assessment indicates the degree of forensic follow-up warranted by the available observations. It is not a probability of manipulation."
* Conclude the demo by emphasizing explainability and scientific rigor.
