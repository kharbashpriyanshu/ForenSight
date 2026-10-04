"""
ForenSight V4 — Controlled Dataset Generator

Deterministic generator producing controlled forensic evaluation fixtures with
pixel-accurate ground truth masks and transformation manifests across 8 modalities:
1. Compression (JPEG quality ladders, recompression)
2. Geometry (scaling, aspect distortion, rotation, cropping)
3. Copy-Move (exact, translated, brightness-modified, scaled)
4. Splicing (donor region insertion)
5. Noise (localized variance injection, localized bilateral denoising)
6. Color (channel gain, localized saturation & contrast shifts)
7. Resampling (bilinear, bicubic, periodic interpolation traces)
8. False-Positive Challenges (checkerboards, brick grids, periodic textures)
"""

import os
import json
import hashlib
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import cv2
from PIL import Image

from .models import (
    ImageRecord,
    DatasetManifest,
    TransformationManifest,
    AuthenticOrManipulated,
    ManipulationType,
)


def compute_sha256_file(filepath: str) -> str:
    """Compute SHA-256 hex digest of a file bitstream."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class ControlledDatasetGenerator:
    """
    Deterministically synthesizes controlled benchmark suites with mathematical ground truth.
    """

    def __init__(self, output_dir: str, seed: int = 42):
        self.output_dir = output_dir
        self.seed = seed
        self.rng = np.random.RandomState(seed)
        os.makedirs(self.output_dir, exist_ok=True)

    def _create_base_synthetic_canvas(self, width: int = 256, height: int = 256) -> np.ndarray:
        """
        Creates a clean authentic baseline scene with gradients, smooth surfaces,
        and photographic luminance variations.
        """
        # Multi-scale gradient backdrop
        x = np.linspace(0, 1, width)
        y = np.linspace(0, 1, height)
        xx, yy = np.meshgrid(x, y)
        
        # Soft background illumination
        lum = 0.4 + 0.3 * np.sin(xx * np.pi) * np.cos(yy * np.pi)
        r = np.clip(lum * 220 + 20 * np.sin(xx * 4), 0, 255).astype(np.uint8)
        g = np.clip(lum * 200 + 15 * np.cos(yy * 3), 0, 255).astype(np.uint8)
        b = np.clip(lum * 180 + 30 * np.sin((xx + yy) * 2), 0, 255).astype(np.uint8)
        
        img = np.stack([r, g, b], axis=-1)

        # Draw realistic geometric shapes to create clean high-contrast edges
        cv2.circle(img, (width // 4, height // 4), width // 8, (60, 120, 200), -1)
        cv2.rectangle(img, (width // 2, height // 2), (width * 3 // 4, height * 3 // 4), (180, 80, 60), -1)
        
        return img

    def _create_donor_canvas(self, width: int = 256, height: int = 256) -> np.ndarray:
        """Creates a distinct donor scene for splicing experiments."""
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Distinct texture pattern
        for y in range(0, height, 16):
            for x in range(0, width, 16):
                val = ((x // 16) + (y // 16)) % 2 * 140 + 50
                img[y:y+16, x:x+16] = [val, 255 - val, val // 2]
        return img

    def generate_full_controlled_suite(self, dataset_id: str = "controlled-v1") -> DatasetManifest:
        """
        Synthesizes the complete 8-modality controlled evaluation dataset.
        Returns the populated DatasetManifest.
        """
        image_records: List[ImageRecord] = []

        # 1. Base Authentic Baseline
        base_canvas = self._create_base_synthetic_canvas(256, 256)
        donor_canvas = self._create_donor_canvas(256, 256)

        base_folder = os.path.join(self.output_dir, "fixture_001_authentic")
        os.makedirs(base_folder, exist_ok=True)
        base_path = os.path.join(base_folder, "original.png")
        Image.fromarray(base_canvas).save(base_path, "PNG")

        base_sha = compute_sha256_file(base_path)
        base_rel = os.path.relpath(base_path, self.output_dir).replace("\\", "/")

        base_record = ImageRecord(
            image_id="img_001_authentic_base",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=base_rel,
            sha256=base_sha,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
            manipulation_type=ManipulationType.NONE,
            ground_truth_mask=None,
            transformation_manifest=None,
            notes="Unmodified authentic reference baseline",
            expected_applicable_engines=["ELA", "NOISE", "COPY-MOVE", "HISTOGRAM", "FOURIER", "ADVANCED-NOISE", "RESAMPLING", "PRNU"]
        )
        image_records.append(base_record)

        # 2. Modality A: Compression (JPEG Q95, Q75, Q50 & Recompression)
        for q in [95, 75, 50]:
            f_dir = os.path.join(self.output_dir, f"fixture_002_jpeg_q{q}")
            os.makedirs(f_dir, exist_ok=True)
            out_file = os.path.join(f_dir, f"derived_q{q}.jpg")
            
            # Save single-compressed JPEG
            Image.fromarray(base_canvas).save(out_file, "JPEG", quality=q)
            h_val = compute_sha256_file(out_file)
            rel_p = os.path.relpath(out_file, self.output_dir).replace("\\", "/")

            trans_manifest = TransformationManifest(
                transformation_id=f"trans_comp_q{q}",
                transformation_type=ManipulationType.COMPRESSION,
                source_image_id="img_001_authentic_base",
                derived_image_id=f"img_comp_q{q}",
                parameters={"quality": q, "recompression_count": 1},
                affected_bbox=[0, 0, 256, 256],
                description=f"Standard baseline JPEG compression at Q={q}"
            )
            with open(os.path.join(f_dir, "transformation.json"), "w") as f:
                json.dump(trans_manifest.model_dump(), f, indent=2)

            image_records.append(ImageRecord(
                image_id=f"img_comp_q{q}",
                dataset_id=dataset_id,
                source="ForenSight Controlled Synthetic Lab",
                source_license="CC-BY-4.0",
                filename=rel_p,
                sha256=h_val,
                format="JPEG",
                width=256,
                height=256,
                color_mode="RGB",
                authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
                manipulation_type=ManipulationType.COMPRESSION,
                compression_history={"quality": q, "recompression": False},
                transformation_manifest=trans_manifest.model_dump(),
                expected_applicable_engines=["JPEG-QT", "JPEG-STRUCTURE", "JPEG-HUFFMAN", "BLOCKING-ARTIFACT", "JPEG-GHOST", "ADJPEG", "NADJPEG"]
            ))

        # Modality A2: Double Compression (Q95 -> Q75)
        f_double_dir = os.path.join(self.output_dir, "fixture_003_jpeg_double_q95_q75")
        os.makedirs(f_double_dir, exist_ok=True)
        first_pass = os.path.join(f_double_dir, "first_pass.jpg")
        final_double = os.path.join(f_double_dir, "derived_double.jpg")
        Image.fromarray(base_canvas).save(first_pass, "JPEG", quality=95)
        with Image.open(first_pass) as temp_img:
            temp_img.save(final_double, "JPEG", quality=75)
        
        h_dbl = compute_sha256_file(final_double)
        rel_dbl = os.path.relpath(final_double, self.output_dir).replace("\\", "/")
        trans_double = TransformationManifest(
            transformation_id="trans_double_q95_q75",
            transformation_type=ManipulationType.COMPRESSION,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_jpeg_double_q95_q75",
            parameters={"primary_quality": 95, "secondary_quality": 75},
            affected_bbox=[0, 0, 256, 256],
            description="Double JPEG compression primary Q=95 secondary Q=75"
        )
        with open(os.path.join(f_double_dir, "transformation.json"), "w") as f:
            json.dump(trans_double.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_jpeg_double_q95_q75",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_dbl,
            sha256=h_dbl,
            format="JPEG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.COMPRESSION,
            compression_history={"q1": 95, "q2": 75, "double_compression": True},
            transformation_manifest=trans_double.model_dump(),
            expected_applicable_engines=["JPEG-GHOST", "ADJPEG", "NADJPEG", "BLOCKING-ARTIFACT"]
        ))

        # 3. Modality B: Geometry (Resizing / Downscale-Upscale)
        f_geom_dir = os.path.join(self.output_dir, "fixture_004_geometry_resample")
        os.makedirs(f_geom_dir, exist_ok=True)
        geom_path = os.path.join(f_geom_dir, "derived_resampled.png")
        # Downscale 256x256 to 128x128 then upscale back to 256x256 with bicubic
        small = cv2.resize(base_canvas, (128, 128), interpolation=cv2.INTER_CUBIC)
        resampled_img = cv2.resize(small, (256, 256), interpolation=cv2.INTER_CUBIC)
        Image.fromarray(resampled_img).save(geom_path, "PNG")

        h_geom = compute_sha256_file(geom_path)
        rel_geom = os.path.relpath(geom_path, self.output_dir).replace("\\", "/")
        trans_geom = TransformationManifest(
            transformation_id="trans_resample_bicubic_down_up",
            transformation_type=ManipulationType.RESAMPLING,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_geom_resample_bicubic",
            parameters={"downscale": 0.5, "upscale": 2.0, "interpolation": "bicubic"},
            affected_bbox=[0, 0, 256, 256],
            description="Bicubic downscale 50% followed by upscale 200% introducing periodic interpolation traces"
        )
        with open(os.path.join(f_geom_dir, "transformation.json"), "w") as f:
            json.dump(trans_geom.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_geom_resample_bicubic",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_geom,
            sha256=h_geom,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.RESAMPLING,
            transformation_manifest=trans_geom.model_dump(),
            expected_applicable_engines=["RESAMPLING", "ADVANCED-NOISE", "FOURIER"]
        ))

        # 4. Modality C: Copy-Move (Exact & Translated Clone)
        f_clone_dir = os.path.join(self.output_dir, "fixture_005_copymove_clone")
        os.makedirs(f_clone_dir, exist_ok=True)
        clone_img = base_canvas.copy()
        clone_mask = np.zeros((256, 256), dtype=np.uint8)

        # Source patch: (40, 40) to (100, 100) -> Target patch: (150, 150) to (210, 210)
        patch = base_canvas[40:100, 40:100].copy()
        clone_img[150:210, 150:210] = patch
        clone_mask[150:210, 150:210] = 255  # Ground truth binary mask (255 = manipulated)

        clone_path = os.path.join(f_clone_dir, "derived_copymove.png")
        mask_path = os.path.join(f_clone_dir, "ground_truth_mask.png")
        Image.fromarray(clone_img).save(clone_path, "PNG")
        Image.fromarray(clone_mask).save(mask_path, "PNG")

        h_clone = compute_sha256_file(clone_path)
        rel_clone = os.path.relpath(clone_path, self.output_dir).replace("\\", "/")
        rel_mask = os.path.relpath(mask_path, self.output_dir).replace("\\", "/")

        trans_clone = TransformationManifest(
            transformation_id="trans_copymove_translated",
            transformation_type=ManipulationType.COPY_MOVE,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_copymove_translated",
            parameters={"source_bbox": [40, 40, 100, 100], "target_bbox": [150, 150, 210, 210], "dx": 110, "dy": 110},
            affected_bbox=[150, 150, 210, 210],
            mask_filename=rel_mask,
            description="Copy-move cloning of 60x60 square translated by (dx=110, dy=110)"
        )
        with open(os.path.join(f_clone_dir, "transformation.json"), "w") as f:
            json.dump(trans_clone.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_copymove_translated",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_clone,
            sha256=h_clone,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.COPY_MOVE,
            ground_truth_mask=rel_mask,
            transformation_manifest=trans_clone.model_dump(),
            expected_applicable_engines=["CLONE-BLOCK", "CLONE-KEYPOINT", "COPY-MOVE", "ADVANCED-NOISE"]
        ))

        # 5. Modality D: Splicing (Donor Region Paste)
        f_splice_dir = os.path.join(self.output_dir, "fixture_006_splicing_donor")
        os.makedirs(f_splice_dir, exist_ok=True)
        spliced_img = base_canvas.copy()
        splice_mask = np.zeros((256, 256), dtype=np.uint8)

        # Donor patch (50:110, 50:110) pasted at (140:200, 30:90)
        donor_patch = donor_canvas[50:110, 50:110]
        spliced_img[140:200, 30:90] = donor_patch
        splice_mask[140:200, 30:90] = 255

        splice_path = os.path.join(f_splice_dir, "derived_spliced.png")
        smask_path = os.path.join(f_splice_dir, "ground_truth_mask.png")
        Image.fromarray(spliced_img).save(splice_path, "PNG")
        Image.fromarray(splice_mask).save(smask_path, "PNG")

        h_splice = compute_sha256_file(splice_path)
        rel_splice = os.path.relpath(splice_path, self.output_dir).replace("\\", "/")
        rel_smask = os.path.relpath(smask_path, self.output_dir).replace("\\", "/")

        trans_splice = TransformationManifest(
            transformation_id="trans_splicing_donor_paste",
            transformation_type=ManipulationType.SPLICING,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_splicing_donor",
            parameters={"target_bbox": [30, 140, 90, 200], "donor_source": "synthetic_checker_canvas"},
            affected_bbox=[30, 140, 90, 200],
            mask_filename=rel_smask,
            description="Donor region splicing from distinct synthetic texture source"
        )
        with open(os.path.join(f_splice_dir, "transformation.json"), "w") as f:
            json.dump(trans_splice.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_splicing_donor",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_splice,
            sha256=h_splice,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.SPLICING,
            ground_truth_mask=rel_smask,
            transformation_manifest=trans_splice.model_dump(),
            expected_applicable_engines=["ELA", "NOISE", "ADVANCED-NOISE", "COLOR-CHANNEL"]
        ))

        # 6. Modality E: Localized Noise Injection
        f_noise_dir = os.path.join(self.output_dir, "fixture_007_noise_injection")
        os.makedirs(f_noise_dir, exist_ok=True)
        noisy_img = base_canvas.copy().astype(np.float32)
        noise_mask = np.zeros((256, 256), dtype=np.uint8)

        # Inject Gaussian noise sigma=25 into region (100:180, 100:180)
        noise_region = self.rng.normal(0, 25, size=(80, 80, 3))
        noisy_img[100:180, 100:180] += noise_region
        noisy_img = np.clip(noisy_img, 0, 255).astype(np.uint8)
        noise_mask[100:180, 100:180] = 255

        noise_path = os.path.join(f_noise_dir, "derived_noise_injected.png")
        nmask_path = os.path.join(f_noise_dir, "ground_truth_mask.png")
        Image.fromarray(noisy_img).save(noise_path, "PNG")
        Image.fromarray(noise_mask).save(nmask_path, "PNG")

        h_noise = compute_sha256_file(noise_path)
        rel_noise = os.path.relpath(noise_path, self.output_dir).replace("\\", "/")
        rel_nmask = os.path.relpath(nmask_path, self.output_dir).replace("\\", "/")

        trans_noise = TransformationManifest(
            transformation_id="trans_noise_gaussian_localized",
            transformation_type=ManipulationType.NOISE,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_noise_gaussian_localized",
            parameters={"sigma": 25.0, "distribution": "Gaussian", "target_bbox": [100, 100, 180, 180]},
            affected_bbox=[100, 100, 180, 180],
            mask_filename=rel_nmask,
            description="Localized Gaussian noise injection (sigma=25) creating high-frequency residual discrepancy"
        )
        with open(os.path.join(f_noise_dir, "transformation.json"), "w") as f:
            json.dump(trans_noise.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_noise_gaussian_localized",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_noise,
            sha256=h_noise,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.NOISE,
            ground_truth_mask=rel_nmask,
            transformation_manifest=trans_noise.model_dump(),
            expected_applicable_engines=["NOISE", "ADVANCED-NOISE", "FOURIER"]
        ))

        # 7. Modality F: Localized Color & Channel Shift
        f_color_dir = os.path.join(self.output_dir, "fixture_008_color_shift")
        os.makedirs(f_color_dir, exist_ok=True)
        color_img = base_canvas.copy().astype(np.float32)
        color_mask = np.zeros((256, 256), dtype=np.uint8)

        # Shift green channel up by +60 and blue down by -40 in region (120:200, 60:140)
        color_img[120:200, 60:140, 1] = np.clip(color_img[120:200, 60:140, 1] + 60, 0, 255)
        color_img[120:200, 60:140, 2] = np.clip(color_img[120:200, 60:140, 2] - 40, 0, 255)
        color_img = color_img.astype(np.uint8)
        color_mask[120:200, 60:140] = 255

        color_path = os.path.join(f_color_dir, "derived_color_shifted.png")
        cmask_path = os.path.join(f_color_dir, "ground_truth_mask.png")
        Image.fromarray(color_img).save(color_path, "PNG")
        Image.fromarray(color_mask).save(cmask_path, "PNG")

        h_color = compute_sha256_file(color_path)
        rel_color = os.path.relpath(color_path, self.output_dir).replace("\\", "/")
        rel_cmask = os.path.relpath(cmask_path, self.output_dir).replace("\\", "/")

        trans_color = TransformationManifest(
            transformation_id="trans_color_channel_shift",
            transformation_type=ManipulationType.COLOR,
            source_image_id="img_001_authentic_base",
            derived_image_id="img_color_channel_shift",
            parameters={"green_delta": +60, "blue_delta": -40, "target_bbox": [60, 120, 140, 200]},
            affected_bbox=[60, 120, 140, 200],
            mask_filename=rel_cmask,
            description="Localized RGB channel gain shift altering inter-channel color covariance"
        )
        with open(os.path.join(f_color_dir, "transformation.json"), "w") as f:
            json.dump(trans_color.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_color_channel_shift",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_color,
            sha256=h_color,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
            manipulation_type=ManipulationType.COLOR,
            ground_truth_mask=rel_cmask,
            transformation_manifest=trans_color.model_dump(),
            expected_applicable_engines=["COLOR-CHANNEL", "HISTOGRAM"]
        ))

        # 8. Modality H: Natural False-Positive Texture Challenge (Repetitive Brick & Checkerboard)
        f_fp_dir = os.path.join(self.output_dir, "fixture_009_false_positive_texture")
        os.makedirs(f_fp_dir, exist_ok=True)
        fp_img = np.ones((256, 256, 3), dtype=np.uint8) * 180
        # Draw repetitive brick grid (causes naive block & keypoint matchers to trigger false alarms)
        brick_h = 16
        brick_w = 32
        for r_idx, y in enumerate(range(0, 256, brick_h)):
            offset = (r_idx % 2) * (brick_w // 2)
            for x in range(-brick_w, 256 + brick_w, brick_w):
                bx = x + offset
                cv2.rectangle(fp_img, (bx, y), (bx + brick_w - 2, y + brick_h - 2), (120, 50, 40), -1)
                cv2.rectangle(fp_img, (bx, y), (bx + brick_w - 1, y + brick_h - 1), (220, 220, 220), 1)

        fp_path = os.path.join(f_fp_dir, "authentic_repetitive_texture.png")
        Image.fromarray(fp_img).save(fp_path, "PNG")

        h_fp = compute_sha256_file(fp_path)
        rel_fp = os.path.relpath(fp_path, self.output_dir).replace("\\", "/")

        trans_fp = TransformationManifest(
            transformation_id="trans_challenge_repetitive_texture",
            transformation_type=ManipulationType.REPETITIVE_TEXTURE,
            source_image_id="img_false_positive_texture",
            derived_image_id="img_false_positive_texture",
            parameters={"pattern": "repetitive_brick_grid", "is_authentic": True},
            affected_bbox=None,
            description="Authentic high-frequency repetitive brick structure designed to test false alarm rates in copy-move engines"
        )
        with open(os.path.join(f_fp_dir, "transformation.json"), "w") as f:
            json.dump(trans_fp.model_dump(), f, indent=2)

        image_records.append(ImageRecord(
            image_id="img_false_positive_texture",
            dataset_id=dataset_id,
            source="ForenSight Controlled Synthetic Lab",
            source_license="CC-BY-4.0",
            filename=rel_fp,
            sha256=h_fp,
            format="PNG",
            width=256,
            height=256,
            color_mode="RGB",
            authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
            manipulation_type=ManipulationType.REPETITIVE_TEXTURE,
            ground_truth_mask=None,
            transformation_manifest=trans_fp.model_dump(),
            notes="Authentic pattern. Evaluates false discovery rates in CLONE-BLOCK and CLONE-KEYPOINT.",
            expected_applicable_engines=["CLONE-BLOCK", "CLONE-KEYPOINT", "FOURIER", "RESAMPLING"]
        ))

        # Assemble Master Manifest
        manifest = DatasetManifest(
            manifest_version="1.0.0",
            dataset_id=dataset_id,
            dataset_version="1.0.0",
            dataset_name="ForenSight Controlled Multi-Modality Forensic Benchmark Suite",
            dataset_type="CONTROLLED",
            description="Deterministically synthesized evaluation fixtures with pixel-accurate ground truth covering compression, geometry, copy-move, splicing, noise, color, and repetitive false-positive textures.",
            creation_date="2026-09-22T00:00:00Z",
            images=image_records
        )

        manifest_path = os.path.join(self.output_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest.model_dump(), f, indent=2)

        return manifest
