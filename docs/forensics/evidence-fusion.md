# Evidence Normalization & Fusion Foundation

## Why Direct Averaging is Unscientific
ForenSight operates multiple distinct analytical modalities: ELA (measuring recompression error), Noise (measuring local residuals), JPEG/DCT (measuring frequency suppression), and Copy-Move (measuring geometric consistency).
It is scientifically invalid to directly average these values into a single "Manipulation Probability." ELA produces a floating-point error magnitude. Copy-Move produces a geometric integer count. Averaging apples and oranges produces a mathematically meaningless result.

## The Normalization Foundation
Sprint 7A establishes a canonical observation framework. The `EvidenceNormalizer` reads deeply nested JSON `Analysis` records and extracts them into structured `EvidenceObservation` objects.
Each observation strictly represents a measurement, not a conclusion.

### Raw vs. Derived Values
Every observation preserves the **Raw Value** exactly as it was measured by the core engines (e.g. `24` inliers).
A **Normalized Value** is only assigned if there is a mathematically defensible boundary condition. For example, Copy-Move inlier ratios are naturally bounded between 0 and 1, so they can be normalized safely. ELA, however, has no universal ceiling, and is explicitly left as `null` for normalization to prevent arbitrary score-faking.

### Provenance
Every generated observation is strongly linked to its parent `Evidence` and its originating `Analysis`. This ensures that an investigator can trace a final fusion summary all the way down to the exact mathematical engine execution that spawned it.

### Technical Reliability
An observation carries a `technical_reliability` metric (e.g., HIGH, MEDIUM, NOT_ASSESSABLE). This measures the confidence in the *measurement*, not the confidence of manipulation. For instance, if an image lacks all EXIF metadata, the software-signature metadata observation is technically highly reliable (we are 100% sure it is missing), but it does not mean the image is manipulated.

### Modality Adapters
The architecture utilizes Modality Adapters (e.g., `MetadataAdapter`, `ELAAdapter`). Each adapter knows how to unpack its specific `Analysis.structured_findings` and translate them into a standardized Canonical Observation.

### EvidenceSet
The result of a normalization run is an `EvidenceSet`. It explicitly maps:
- `modalities_present`: Analysis that actually succeeded.
- `modalities_missing`: Analysis that wasn't run.
A missing modality is treated neutrally. It does not subtract from suspicion.

## Idempotency
Rerunning the Normalizer safely deletes previous observations for the given evidence and creates fresh ones, preventing database pollution and duplicate observation counting.

## Scientific Limitations
This foundation generates *Facts*. It does not generate *Verdicts*. An elevated ELA observation alongside an elevated Noise observation creates a contextual correlation for the next Sprint (7B). On their own, they remain neutral geometric or statistical observations.
