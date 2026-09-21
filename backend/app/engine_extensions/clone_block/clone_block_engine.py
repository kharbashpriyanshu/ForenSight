"""
ForenSight V4 — Block-Based Copy-Move Clone Forensics Engine

Engine ID: CLONE-BLOCK
Version: 1.0.0
Category: LOCAL_ANALYSIS

Detects spatially duplicated image regions using deterministic block-based similarity
analysis. Employs sliding-window spatial block decomposition, compact low-frequency
2D DCT feature descriptors, lexicographical sorting, spatial exclusion constraints,
and displacement vector clustering to identify candidate copy-move regions.
"""

import os
import json
import time
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from app.engine_extensions.contract import (
    BaseForensicEngine,
    InputRequirements,
    ApplicabilityResult,
    ExecutionContext,
    EngineExecutionResult,
)
from app.engine_extensions.categories import EngineCategory
from app.engine_extensions.status import EngineExecutionStatus
from app.engine_extensions.reference import ScientificReference, ReferenceType
from app.engine_extensions.artifact import EngineArtifactMetadata, ArtifactType
from app.engine_extensions.observation import NormalizedObservation


class CloneBlockParameters(BaseModel):
    """Parameters for Block-Based Copy-Move Clone Detection."""
    block_size: int = Field(16, ge=8, le=64, description="Dimension of square spatial blocks (pixels).")
    stride: int = Field(8, ge=4, le=32, description="Step stride for sliding window block extraction.")
    min_spatial_distance: float = Field(32.0, ge=8.0, le=256.0, description="Minimum spatial separation between candidate matched blocks.")
    similarity_threshold: float = Field(0.96, ge=0.80, le=0.999, description="Cosine similarity threshold on normalized DCT descriptors.")
    min_cluster_size: int = Field(3, ge=2, le=50, description="Minimum number of matched block pairs sharing a consistent displacement vector.")
    displacement_tolerance: float = Field(12.0, ge=1.0, le=64.0, description="Spatial tolerance for grouping displacement vectors.")
    search_window: int = Field(15, ge=5, le=50, description="Lexicographical neighbor search window depth.")
    max_dimension: int = Field(2048, ge=256, le=4096, description="Maximum image dimension before safety downsampling.")


class CloneBlockEngine(BaseForensicEngine):
    """
    Forensic engine analyzing dense block-based copy-move cloning.
    Extracts overlapping spatial blocks, computes compact DCT descriptors,
    performs lexicographical similarity search, and clusters candidate
    duplicated regions by translation displacement consistency.
    """
    engine_id: str = "CLONE-BLOCK"
    engine_name: str = "Block-Based Clone Detection"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = (
        "Detects candidate duplicated regions via sliding-window block decomposition, "
        "normalized 2D DCT feature vectors, and displacement vector clustering."
    )
    parameter_schema = CloneBlockParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(4096, 4096),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Detection of Copy-Move Forgery in Digital Images",
            authors="Fridrich, J., Soukal, D., Lukas, J.",
            publication_venue="Proceedings of the Digital Forensic Research Workshop (DFRWS)",
            year=2003,
            reference_type=ReferenceType.PAPER,
            notes="Foundational formulation of block-based copy-move detection using quantized discrete cosine transform (DCT) coefficients and lexicographical sorting."
        ),
        ScientificReference(
            title="Exposing Digital Forgeries in Color Images",
            authors="Popescu, A. C., Farid, H.",
            publication_venue="IEEE Transactions on Signal Processing",
            year=2004,
            reference_type=ReferenceType.PAPER,
            notes="Establishes spatial block matching and dimensionality reduction with spatial separation constraints to expose duplicated image fragments."
        ),
        ScientificReference(
            title="An Evaluation of Popular Copy-Move Forgery Detection Approaches",
            authors="Christlein, V., Riess, C., Jordan, J., Angelopoulou, E.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2012,
            reference_type=ReferenceType.PAPER,
            notes="Comprehensive comparative benchmark validating block-based feature representations, filtering thresholds, and displacement vector clustering."
        )
    ]

    limitations: List[str] = [
        "Dense sliding window block comparison across high-resolution imagery requires downscaling or higher stride for computational feasibility.",
        "Translation displacement vector clustering assumes near-zero rotation and uniform scale; rotated clones are evaluated by CLONE-KEYPOINT.",
        "Repetitive scene textures (e.g. brick facades, textile patterns) naturally generate high inter-block correlations, filtered via displacement clustering.",
        "Heavy post-processing recompression (JPEG Q < 50) or Gaussian blurring attenuates high-frequency DCT descriptors.",
    ]


    def _get_evidence_path(self, context: ExecutionContext) -> str:
        if hasattr(context, "evidence_path") and context.evidence_path:
            return context.evidence_path
        return context.stored_path

    def _get_output_dir(self, context: ExecutionContext) -> str:
        if hasattr(context, "artifact_directory") and context.artifact_directory:
            os.makedirs(context.artifact_directory, exist_ok=True)
            return context.artifact_directory
        os.makedirs(context.storage_output_dir, exist_ok=True)
        return context.storage_output_dir

    def _resolve_relative_path(self, disk_path: str, context: ExecutionContext) -> str:
        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                return os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            if hasattr(context, "storage_output_dir") and context.storage_output_dir:
                return os.path.relpath(disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            pass
        return os.path.basename(disk_path)

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()
        ev_path = self._get_evidence_path(context)
        out_dir = self._get_output_dir(context)

        # 1. Applicability verification
        applicability = self.check_applicability(context)
        if not applicability.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Block clone detection inapplicable: {applicability.reason}",
                inapplicability_data=applicability.model_dump(),
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        if not os.path.exists(ev_path) or os.path.getsize(ev_path) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Evidence file missing or zero bytes.",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. Image Decoding & Luminance Conversion
        try:
            with Image.open(ev_path) as pil_img:
                orig_w, orig_h = pil_img.size
                is_grayscale = pil_img.mode in ("L", "1")
                if is_grayscale:
                    img_arr = np.array(pil_img, dtype=np.float32)
                else:
                    rgb_img = pil_img.convert("RGB")
                    rgb_arr = np.array(rgb_img, dtype=np.float32)
                    img_arr = 0.299 * rgb_arr[:, :, 0] + 0.587 * rgb_arr[:, :, 1] + 0.114 * rgb_arr[:, :, 2]
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to decode image data: {str(e)}",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        raw_h, raw_w = img_arr.shape
        params = context.parameters or {}
        max_dim = int(params.get("max_dimension", 2048))
        scale_factor = 1.0

        if max(raw_h, raw_w) > max_dim:
            scale_factor = max_dim / float(max(raw_h, raw_w))
            new_w = int(raw_w * scale_factor)
            new_h = int(raw_h * scale_factor)
            img_arr = cv2.resize(img_arr, (new_w, new_h), interpolation=cv2.INTER_AREA)
            height, width = new_h, new_w
        else:
            height, width = raw_h, raw_w

        # 3. Parameters
        block_size = int(params.get("block_size", 16))
        stride = int(params.get("stride", 8))
        min_spatial_dist = float(params.get("min_spatial_distance", 32.0))
        sim_threshold = float(params.get("similarity_threshold", 0.96))
        min_cluster = int(params.get("min_cluster_size", 3))
        disp_tolerance = float(params.get("displacement_tolerance", 12.0))
        search_window = int(params.get("search_window", 15))

        # 4. Sliding Window Block Decomposition & DCT Descriptor Extraction
        feature_vectors: List[np.ndarray] = []
        block_coords: List[Tuple[int, int]] = []
        skipped_flat_blocks = 0
        total_extracted_blocks = 0

        # Sub-block DCT size (5x5 low-frequency coefficients)
        dct_dim = min(5, block_size)

        for y in range(0, height - block_size + 1, stride):
            for x in range(0, width - block_size + 1, stride):
                total_extracted_blocks += 1
                blk = img_arr[y:y + block_size, x:x + block_size]
                std_blk = float(np.std(blk))

                # Standard forensic guardrail: skip uniform/flat blocks (e.g. solid white/black/sky)
                # to eliminate trivial false-positive matches on homogenous textureless regions.
                if std_blk < 1.0:
                    skipped_flat_blocks += 1
                    continue

                dct_mat = cv2.dct(blk)
                feat = dct_mat[:dct_dim, :dct_dim].flatten().copy()

                # Unit Euclidean normalization
                norm = float(np.linalg.norm(feat))
                if norm > 1e-6:
                    feat = feat / norm

                feature_vectors.append(feat)
                block_coords.append((x, y))

        num_valid_blocks = len(feature_vectors)
        matched_pairs: List[Dict[str, Any]] = []

        # 5. Deterministic Lexicographical Sorting & Similarity Search
        if num_valid_blocks >= 2:
            V = np.array(feature_vectors, dtype=np.float32)
            C = np.array(block_coords, dtype=np.int32)

            # Lexicographical sort along feature vector components
            sort_idx = np.lexsort(V.T[::-1])
            V_sorted = V[sort_idx]
            C_sorted = C[sort_idx]

            # Neighbor comparisons within search window
            for i in range(num_valid_blocks):
                p1 = C_sorted[i]
                for j in range(i + 1, min(i + search_window + 1, num_valid_blocks)):
                    p2 = C_sorted[j]
                    dx = abs(int(p1[0]) - int(p2[0]))
                    dy = abs(int(p1[1]) - int(p2[1]))
                    spatial_d = np.sqrt(dx * dx + dy * dy)

                    if spatial_d >= min_spatial_dist:
                        sim = float(np.dot(V_sorted[i], V_sorted[j]))
                        if sim >= sim_threshold:
                            # Canonical ordering: source has smaller x, or equal x and smaller y
                            if p1[0] < p2[0] or (p1[0] == p2[0] and p1[1] <= p2[1]):
                                src_pt, dst_pt = (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1]))
                            else:
                                src_pt, dst_pt = (int(p2[0]), int(p2[1])), (int(p1[0]), int(p1[1]))

                            matched_pairs.append({
                                "source": [src_pt[0], src_pt[1]],
                                "target": [dst_pt[0], dst_pt[1]],
                                "similarity": round(sim, 4),
                                "displacement": [dst_pt[0] - src_pt[0], dst_pt[1] - src_pt[1]],
                                "spatial_distance": round(spatial_d, 2),
                            })

        # 6. Geometric Displacement Vector Clustering
        displacement_bins: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
        disp_step = max(4, int(disp_tolerance))

        for m in matched_pairs:
            dx, dy = m["displacement"][0], m["displacement"][1]
            bin_x = int(round(dx / float(disp_step)) * disp_step)
            bin_y = int(round(dy / float(disp_step)) * disp_step)
            bin_key = (bin_x, bin_y)

            if bin_key not in displacement_bins:
                displacement_bins[bin_key] = []
            displacement_bins[bin_key].append(m)

        # 7. Candidate Duplicated Regions Derivation
        candidate_regions: List[Dict[str, Any]] = []
        sorted_bins = sorted(displacement_bins.items(), key=lambda item: len(item[1]), reverse=True)

        for bin_key, pair_list in sorted_bins:
            if len(pair_list) >= min_cluster:
                src_xs = [p["source"][0] for p in pair_list]
                src_ys = [p["source"][1] for p in pair_list]
                dst_xs = [p["target"][0] for p in pair_list]
                dst_ys = [p["target"][1] for p in pair_list]

                # Map coordinates back to original image space if downsampled
                s_x1, s_y1 = min(src_xs), min(src_ys)
                s_x2, s_y2 = max(src_xs) + block_size, max(src_ys) + block_size
                d_x1, d_y1 = min(dst_xs), min(dst_ys)
                d_x2, d_y2 = max(dst_xs) + block_size, max(dst_ys) + block_size

                orig_s_bb = [
                    int(s_x1 / scale_factor),
                    int(s_y1 / scale_factor),
                    int((s_x2 - s_x1) / scale_factor),
                    int((s_y2 - s_y1) / scale_factor),
                ]
                orig_d_bb = [
                    int(d_x1 / scale_factor),
                    int(d_y1 / scale_factor),
                    int((d_x2 - d_x1) / scale_factor),
                    int((d_y2 - d_y1) / scale_factor),
                ]

                avg_sim = float(np.mean([p["similarity"] for p in pair_list]))
                candidate_regions.append({
                    "region_id": f"clone-cluster-{len(candidate_regions) + 1}",
                    "supporting_pairs_count": len(pair_list),
                    "mean_similarity": round(avg_sim, 4),
                    "nominal_displacement": [bin_key[0], bin_key[1]],
                    "source_bounding_box": orig_s_bb,
                    "target_bounding_box": orig_d_bb,
                    "classification": "candidate duplicated region",
                })

        # Calculate displacement consistency metric (fraction of matches in top cluster)
        total_matches = len(matched_pairs)
        max_cluster_sz = max([len(pairs) for pairs in displacement_bins.values()], default=0)
        disp_consistency = float(max_cluster_sz / total_matches) if total_matches > 0 else 0.0

        # 8. Forensic Artifact Generation
        with open(ev_path, "rb") as f:
            src_sha256 = hashlib.sha256(f.read()).hexdigest()

        artifacts: List[EngineArtifactMetadata] = []

        # Artifact A: clone_block_map.png (Spatial Map with Connection Vectors & Bounding Boxes)
        map_filename = "clone_block_map.png"
        map_disk_path = os.path.join(out_dir, map_filename)

        # Base canvas: dimmed grayscale or original
        if img_arr.ndim == 2:
            base_canvas = cv2.cvtColor(np.clip(img_arr, 0, 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        else:
            base_canvas = np.clip(img_arr, 0, 255).astype(np.uint8)

        # Draw connecting displacement lines and bounding boxes for candidate clusters
        colors = [(239, 68, 68), (16, 185, 129), (59, 130, 246), (245, 158, 11), (168, 85, 247)]
        for idx, (bin_key, pair_list) in enumerate(sorted_bins[:5]):
            if len(pair_list) < min_cluster:
                continue
            color = colors[idx % len(colors)]
            for pair in pair_list[:40]:  # Draw up to 40 pairs per cluster to keep visualization crisp
                s = pair["source"]
                t = pair["target"]
                cv2.line(base_canvas, (s[0] + block_size // 2, s[1] + block_size // 2),
                         (t[0] + block_size // 2, t[1] + block_size // 2), color, 1, cv2.LINE_AA)
                cv2.circle(base_canvas, (s[0] + block_size // 2, s[1] + block_size // 2), 3, (255, 255, 255), -1)
                cv2.circle(base_canvas, (t[0] + block_size // 2, t[1] + block_size // 2), 3, color, -1)

        # Draw bounding boxes for candidate clusters
        for reg in candidate_regions:
            s_bb = reg["source_bounding_box"]
            t_bb = reg["target_bounding_box"]
            sx, sy = int(s_bb[0] * scale_factor), int(s_bb[1] * scale_factor)
            sw, sh = int(s_bb[2] * scale_factor), int(s_bb[3] * scale_factor)
            tx, ty = int(t_bb[0] * scale_factor), int(t_bb[1] * scale_factor)
            tw, th = int(t_bb[2] * scale_factor), int(t_bb[3] * scale_factor)

            cv2.rectangle(base_canvas, (sx, sy), (sx + sw, sy + sh), (59, 130, 246), 2)
            cv2.rectangle(base_canvas, (tx, ty), (tx + tw, ty + th), (239, 68, 68), 2)

        cv2.imwrite(map_disk_path, base_canvas)
        with open(map_disk_path, "rb") as f:
            map_bytes = f.read()

        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_block_map",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.HEATMAP,
            storage_path=self._resolve_relative_path(map_disk_path, context),
            sha256_hash=hashlib.sha256(map_bytes).hexdigest(),
            mime_type="image/png",
            width=width,
            height=height,
        ))

        # Artifact B: clone_block_analysis.png (Diagnostic Multi-Panel Plot)
        diag_filename = "clone_block_analysis.png"
        diag_disk_path = os.path.join(out_dir, diag_filename)
        self._generate_diagnostic_plot(
            diag_disk_path,
            total_matches=total_matches,
            max_cluster_sz=max_cluster_sz,
            disp_bins=sorted_bins[:8],
            candidate_regions=candidate_regions,
            matched_pairs=matched_pairs,
        )

        with open(diag_disk_path, "rb") as f:
            diag_bytes = f.read()

        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_block_analysis",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.PLOT,
            storage_path=self._resolve_relative_path(diag_disk_path, context),
            sha256_hash=hashlib.sha256(diag_bytes).hexdigest(),
            mime_type="image/png",
            width=840,
            height=360,
        ))

        # Artifact C: clone_block_analysis.json (Comprehensive dataset)
        json_filename = "clone_block_analysis.json"
        json_disk_path = os.path.join(out_dir, json_filename)
        analysis_data = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "source_image_sha256": src_sha256,
            "original_dimensions": [orig_w, orig_h],
            "analysis_dimensions": [width, height],
            "scale_factor": scale_factor,
            "total_matches": total_matches,
            "max_cluster_size": max_cluster_sz,
            "dimensions": {
                "original": [orig_w, orig_h],
                "processed": [width, height],
                "downsampled": scale_factor < 1.0,
                "scale_factor": scale_factor,
            },
            "parameters": {
                "block_size": block_size,
                "stride": stride,
                "min_spatial_distance": min_spatial_dist,
                "similarity_threshold": sim_threshold,
                "min_cluster_size": min_cluster,
                "displacement_tolerance": disp_tolerance,
                "search_window": search_window,
            },
            "block_statistics": {
                "total_blocks_extracted": total_extracted_blocks,
                "skipped_flat_blocks": skipped_flat_blocks,
                "valid_active_blocks": num_valid_blocks,
                "matched_pairs_count": total_matches,
                "displacement_clusters_count": len([b for b in displacement_bins.values() if len(b) >= min_cluster]),
                "max_cluster_size": max_cluster_sz,
                "displacement_consistency": round(disp_consistency, 4),
            },
            "candidate_regions_count": len(candidate_regions),
            "candidate_regions": candidate_regions,
            "sample_matched_pairs": matched_pairs[:50],
            "scientific_limitations": (
                "Candidate duplicated regions identified by block similarity are empirical geometric observations. "
                "Natural repetitive scene structures (e.g. windows, brick facades, floor tiles, repetitive textiles) "
                "frequently generate high block correlation and do not by themselves constitute proof of forgery."
            )
        }

        with open(json_disk_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        with open(json_disk_path, "rb") as f:
            json_bytes = f.read()

        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_block_json",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.JSON,
            storage_path=self._resolve_relative_path(json_disk_path, context),
            sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
            mime_type="application/json",
        ))

        # 9. Normalized Observations
        direction = "elevated" if len(candidate_regions) > 0 else "informational"
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_BLOCK",
                metric_name="BLOCK_MATCH_COUNT",
                raw_value=str(total_matches),
                normalized_value=float(min(1.0, total_matches / 100.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"matched_pairs": total_matches},
                parameters_used=context.parameters,
                interpretation=f"Identified {total_matches} block pairs satisfying similarity >= {sim_threshold} and spatial separation >= {min_spatial_dist}px.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_BLOCK",
                metric_name="MATCH_CLUSTER_COUNT",
                raw_value=str(len(candidate_regions)),
                normalized_value=float(min(1.0, len(candidate_regions) / 5.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"cluster_count": len(candidate_regions)},
                parameters_used=context.parameters,
                interpretation=f"Clustered matched blocks into {len(candidate_regions)} candidate displacement groups with >= {min_cluster} supporting pairs.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_BLOCK",
                metric_name="MAX_CLUSTER_SIZE",
                raw_value=str(max_cluster_sz),
                normalized_value=float(min(1.0, max_cluster_sz / 20.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"max_cluster_size": max_cluster_sz},
                parameters_used=context.parameters,
                interpretation=f"Largest candidate displacement cluster contains {max_cluster_sz} supporting block pairs.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_BLOCK",
                metric_name="DISPLACEMENT_CONSISTENCY",
                raw_value=str(round(disp_consistency, 4)),
                normalized_value=float(min(1.0, disp_consistency)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"displacement_consistency": round(disp_consistency, 4)},
                parameters_used=context.parameters,
                interpretation=f"Displacement consistency fraction of dominant cluster is {disp_consistency:.3f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_BLOCK",
                metric_name="CANDIDATE_REGION_COUNT",
                raw_value=str(len(candidate_regions)),
                normalized_value=float(min(1.0, len(candidate_regions) / 5.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"candidate_regions": len(candidate_regions)},
                parameters_used=context.parameters,
                interpretation=f"Localized {len(candidate_regions)} candidate duplicated regions.",
                limitations=self.limitations,
            ),
        ]

        summary = (
            f"Block clone analysis: {total_matches} matched pairs across {num_valid_blocks} active blocks. "
            f"Identified {len(candidate_regions)} candidate duplicated region(s) (max cluster size: {max_cluster_sz})."
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=summary,
            observations=observations,
            artifacts=artifacts,
            structured_findings=analysis_data,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )

    def _generate_diagnostic_plot(
        self,
        output_path: str,
        total_matches: int,
        max_cluster_sz: int,
        disp_bins: List[Tuple[Tuple[int, int], List[Dict[str, Any]]]],
        candidate_regions: List[Dict[str, Any]],
        matched_pairs: List[Dict[str, Any]],
    ) -> None:
        """Draws a clean, deterministic 3-panel diagnostic visualization."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Displacement Cluster Sizes
        draw.rectangle([20, 20, 270, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Displacement Clusters", fill=(30, 41, 59))
        draw.text((32, 46), f"Total Pairs: {total_matches} | Max: {max_cluster_sz}", fill=(100, 116, 139))

        max_bin_count = max([len(p[1]) for p in disp_bins], default=1)
        max_bin_count = max(max_bin_count, 1)

        for idx, (bin_key, p_list) in enumerate(disp_bins[:5]):
            y_base = 80 + idx * 48
            draw.text((32, y_base), f"Disp ({bin_key[0]}, {bin_key[1]}):", fill=(51, 65, 85))
            draw.text((180, y_base), f"{len(p_list)} pairs", fill=(100, 116, 139))
            bar_len = int((len(p_list) / float(max_bin_count)) * 210)
            draw.rectangle([32, y_base + 18, 242, y_base + 28], fill=(241, 245, 249))
            draw.rectangle([32, y_base + 18, 32 + bar_len, y_base + 28], fill=(59, 130, 246))

        # Panel 2: Similarity Score Distribution
        draw.rectangle([290, 20, 550, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((302, 28), "Similarity Distribution", fill=(30, 41, 59))
        draw.text((302, 46), "Cosine Similarity in [0.96, 1.00]", fill=(100, 116, 139))

        if total_matches > 0:
            sims = [p["similarity"] for p in matched_pairs]
            hist, _ = np.histogram(sims, bins=20, range=(0.96, 1.0))
            max_h = max(int(np.max(hist)), 1)
            chart_w, chart_h = 220, 200
            ox, oy = 305, 300
            for i, val in enumerate(hist):
                bar_h = int((val / max_h) * chart_h)
                x1 = ox + int(i * (chart_w / 20))
                x2 = ox + int((i + 1) * (chart_w / 20)) - 1
                y1 = oy - bar_h
                draw.rectangle([x1, y1, x2, oy], fill=(16, 185, 129))
        else:
            draw.text((330, 160), "No matched pairs detected", fill=(148, 163, 184))

        # Panel 3: Candidate Duplicated Regions Summary
        draw.rectangle([570, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((582, 28), "Candidate Regions", fill=(30, 41, 59))
        draw.text((582, 46), f"Detected Clusters: {len(candidate_regions)}", fill=(100, 116, 139))

        if len(candidate_regions) > 0:
            for idx, reg in enumerate(candidate_regions[:4]):
                y_base = 80 + idx * 58
                draw.text((582, y_base), f"{reg['region_id']}: {reg['supporting_pairs_count']} pairs", fill=(30, 41, 59))
                draw.text((582, y_base + 16), f"Disp: ({reg['nominal_displacement'][0]}, {reg['nominal_displacement'][1]})", fill=(100, 116, 139))
                draw.text((582, y_base + 32), f"Mean Sim: {reg['mean_similarity']:.3f}", fill=(59, 130, 246))
        else:
            draw.text((600, 160), "No candidate clone", fill=(148, 163, 184))
            draw.text((600, 180), "regions identified", fill=(148, 163, 184))

        img.save(output_path, "PNG")
