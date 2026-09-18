from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.domain import Evidence, Analysis
from app.schemas.v3 import (
    MultiModalityHeatmapResponse,
    ModalityHeatmapLayer,
    HeatmapRegion,
)

class HeatmapService:
    @classmethod
    def generate_evidence_heatmap(cls, db: Session, evidence: Evidence) -> MultiModalityHeatmapResponse:
        analyses = db.query(Analysis).filter(Analysis.evidence_id == evidence.id).all()
        analyses_by_type = {a.analysis_type.lower(): a for a in analyses}

        width = evidence.width or 800
        height = evidence.height or 600

        layers: List[ModalityHeatmapLayer] = []
        all_regions: List[HeatmapRegion] = []

        # -------------------------------------------------------------
        # 1. ELA Layer (Compression Error Variance)
        # -------------------------------------------------------------
        ela_anl = analyses_by_type.get("ela")
        ela_regions: List[HeatmapRegion] = []
        ela_status = "NOT_RUN"
        if ela_anl:
            if ela_anl.status == "completed" and ela_anl.structured_findings:
                ela_status = "AVAILABLE"
                findings = ela_anl.structured_findings
                mean_diff = findings.get("mean_difference", 0)
                elevated = findings.get("elevated_regions", [])
                
                # If elevated regions are explicitly listed
                if isinstance(elevated, list) and len(elevated) > 0:
                    for r in elevated:
                        if isinstance(r, dict):
                            x = float(r.get("x", 0)) / width
                            y = float(r.get("y", 0)) / height
                            w = float(r.get("w", 50)) / width
                            h = float(r.get("h", 50)) / height
                            intensity = float(r.get("intensity", 0.7))
                            ela_regions.append(HeatmapRegion(
                                modality="ELA",
                                x=round(min(max(x, 0.0), 1.0), 4),
                                y=round(min(max(y, 0.0), 1.0), 4),
                                width=round(min(max(w, 0.01), 1.0), 4),
                                height=round(min(max(h, 0.01), 1.0), 4),
                                intensity=round(min(max(intensity, 0.1), 1.0), 2),
                                description=f"Elevated recompression error level (error index {mean_diff:.1f})"
                            ))
                elif mean_diff > 12.0:
                    # Synthetic high-variance indicator for significant global error
                    ela_regions.append(HeatmapRegion(
                        modality="ELA",
                        x=0.2, y=0.2, width=0.6, height=0.6,
                        intensity=min(1.0, mean_diff / 30.0),
                        description="Global elevated high-frequency error distribution detected across central frame"
                    ))
            elif "png" in (evidence.mime_type or "").lower():
                ela_status = "INAPPLICABLE"

        layers.append(ModalityHeatmapLayer(
            modality="ELA",
            label="Error Level Analysis (Compression Variance)",
            status=ela_status,
            weight=0.35,
            regions=ela_regions,
            summary=f"Mapped {len(ela_regions)} high-frequency compression variance zones.",
            limitations="Natural sharp high-contrast luminance edges routinely exhibit elevated ELA error without modification."
        ))
        all_regions.extend(ela_regions)

        # -------------------------------------------------------------
        # 2. Noise Residual Layer (PRNU / High-Pass Sensor Noise)
        # -------------------------------------------------------------
        noise_anl = analyses_by_type.get("noise")
        noise_regions: List[HeatmapRegion] = []
        noise_status = "NOT_RUN"
        if noise_anl and noise_anl.status == "completed" and noise_anl.structured_findings:
            noise_status = "AVAILABLE"
            local_stats = noise_anl.structured_findings.get("local_statistics", {})
            anomalous = local_stats.get("anomalous_blocks", [])
            if isinstance(anomalous, list):
                for b in anomalous[:20]:  # Cap at top 20 anomalous blocks
                    if isinstance(b, dict):
                        bx = float(b.get("x", 0)) / width
                        by = float(b.get("y", 0)) / height
                        bw = float(b.get("w", 32)) / width
                        bh = float(b.get("h", 32)) / height
                        noise_regions.append(HeatmapRegion(
                            modality="NOISE",
                            x=round(min(max(bx, 0.0), 1.0), 4),
                            y=round(min(max(by, 0.0), 1.0), 4),
                            width=round(min(max(bw, 0.01), 1.0), 4),
                            height=round(min(max(bh, 0.01), 1.0), 4),
                            intensity=0.65,
                            description="Localized SNR noise residual discrepancy exceeding standard deviation boundary"
                        ))

        layers.append(ModalityHeatmapLayer(
            modality="NOISE",
            label="Sensor Noise Residual Variance (High-Pass SNR)",
            status=noise_status,
            weight=0.30,
            regions=noise_regions,
            summary=f"Isolated {len(noise_regions)} anomalous noise residual variance zones.",
            limitations="In-camera noise reduction, varying scene illumination, and optical vignetting alter SNR under normal conditions."
        ))
        all_regions.extend(noise_regions)

        # -------------------------------------------------------------
        # 3. Copy-Move Layer (Keypoint Clustering)
        # -------------------------------------------------------------
        clone_anl = analyses_by_type.get("copy-move") or analyses_by_type.get("copy_move")
        clone_regions: List[HeatmapRegion] = []
        clone_status = "NOT_RUN"
        if clone_anl and clone_anl.status == "completed" and clone_anl.structured_findings:
            clone_status = "AVAILABLE"
            findings = clone_anl.structured_findings
            matches = findings.get("matches", [])
            clusters = findings.get("clusters", [])
            if isinstance(clusters, list) and len(clusters) > 0:
                for c in clusters:
                    if isinstance(c, dict):
                        cx = float(c.get("x", 0)) / width
                        cy = float(c.get("y", 0)) / height
                        cw = float(c.get("w", 40)) / width
                        ch = float(c.get("h", 40)) / height
                        clone_regions.append(HeatmapRegion(
                            modality="COPY_MOVE",
                            x=round(min(max(cx, 0.0), 1.0), 4),
                            y=round(min(max(cy, 0.0), 1.0), 4),
                            width=round(min(max(cw, 0.01), 1.0), 4),
                            height=round(min(max(ch, 0.01), 1.0), 4),
                            intensity=0.85,
                            description=f"Duplicated region cluster with {c.get('point_count', 'multiple')} affine-consistent keypoints"
                        ))
            elif isinstance(matches, list) and len(matches) > 5:
                # Bounding indicator for matched keypoint clusters
                clone_regions.append(HeatmapRegion(
                    modality="COPY_MOVE",
                    x=0.25, y=0.25, width=0.5, height=0.5,
                    intensity=0.75,
                    description=f"{len(matches)} paired keypoints sharing spatial affine displacement vectors"
                ))

        layers.append(ModalityHeatmapLayer(
            modality="COPY_MOVE",
            label="Copy-Move Keypoint Spatial Duplication",
            status=clone_status,
            weight=0.35,
            regions=clone_regions,
            summary=f"Identified {len(clone_regions)} duplicated keypoint cluster envelopes.",
            limitations="Natural repetitive background textures (window arrays, water ripples, masonry) trigger feature matches."
        ))
        all_regions.extend(clone_regions)

        # Scientific Narrative Construction
        total_regions = len(all_regions)
        if total_regions == 0:
            what_found = "No localized spatial anomalies detected above baseline thresholds across active modalities."
            why_matters = (
                "Absence of detectable anomalies indicates consistent high-frequency error, noise residual, "
                "and descriptor distribution under current algorithmic parameters."
            )
            next_steps = [
                "Review raw container metadata for re-encoding timestamps.",
                "Verify whether source image underwent prior heavy social-media recompression.",
                "Execute remaining unexecuted modalities if any."
            ]
        else:
            modalities_with_anomalies = list({r.modality for r in all_regions})
            what_found = (
                f"Synthesized {total_regions} spatial anomaly zones across {len(modalities_with_anomalies)} "
                f"modalities ({', '.join(modalities_with_anomalies)})."
            )
            why_matters = (
                "Spatial coincidence across independent physical models (e.g. compression variance + noise residual discrepancy) "
                "significantly increases the evidentiary value compared to an isolated metric anomaly."
            )
            next_steps = [
                "Inspect coincidence regions where multiple modality layers overlap.",
                "Compare high-variance regions against natural scene boundaries to rule out innocent edge artifacts.",
                "Verify sensor PRNU profile against known reference camera if available.",
                "Record analyst review decision in the Analyst Workspace."
            ]

        limitations = (
            "SCIENTIFIC NOTICE: Heatmaps visualize mathematical measurements and error discrepancies, "
            "not binary proof of manipulation. Natural scene complexity, uneven lighting, and multi-pass recompression "
            "routinely generate localized variances."
        )

        return MultiModalityHeatmapResponse(
            evidence_id=evidence.id,
            evidence_identifier=evidence.evidence_identifier,
            filename=evidence.original_filename,
            width=width,
            height=height,
            layers=layers,
            composite_regions_count=total_regions,
            what_was_found=what_found,
            why_it_matters=why_matters,
            recommended_next_steps=next_steps,
            limitations=limitations,
        )
