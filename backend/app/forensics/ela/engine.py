import os
import uuid
import numpy as np
from PIL import Image
from .schemas import ELAResult, ELAStatistics
from .exceptions import UnsupportedFormatError, ImageProcessingError

class ELAEngine:
    @staticmethod
    def run(input_path: str, output_dir: str, quality: int = 90) -> ELAResult:
        if not (1 <= quality <= 100):
            raise ValueError("Quality must be between 1 and 100.")
            
        try:
            img = Image.open(input_path)
            if img.format not in ('JPEG', 'MPO'):
                raise UnsupportedFormatError("ELA requires JPEG evidence input.")
                
            if img.mode != 'RGB':
                img = img.convert('RGB')
                
            width, height = img.size
            img_format = img.format or "JPEG"
            
            os.makedirs(output_dir, exist_ok=True)
            
            run_id = uuid.uuid4().hex[:8]
            recompressed_path = os.path.join(output_dir, f"ela_recompressed_{run_id}.jpg")
            error_map_path = os.path.join(output_dir, f"ela_map_{run_id}.png")
            error_map_dynamic_path = os.path.join(output_dir, f"ela_map_dynamic_{run_id}.png")
            error_map_fixed20_path = os.path.join(output_dir, f"ela_map_fixed20_{run_id}.png")
            
            # 1. Save recompressed image
            img.save(recompressed_path, 'JPEG', quality=quality)
            
            # 2. Open recompressed image
            recompressed_img = Image.open(recompressed_path)
            
            # 3. Calculate absolute difference using NumPy (vectorized)
            # int16 prevents underflow when subtracting
            orig_arr = np.array(img, dtype=np.int16)
            recomp_arr = np.array(recompressed_img, dtype=np.int16)
            
            diff_arr = np.abs(orig_arr - recomp_arr)
            
            # Statistics before normalization
            diff_flat = diff_arr.flatten()
            mean_err = float(np.mean(diff_flat))
            max_err = float(np.max(diff_flat))
            std_err = float(np.std(diff_flat))
            median_err = float(np.median(diff_flat))
            p90, p95, p99 = np.percentile(diff_flat, [90, 95, 99])
            
            stats = ELAStatistics(
                mean_error=mean_err,
                max_error=max_err,
                std_error=std_err,
                median_error=median_err,
                percentiles={"90th": float(p90), "95th": float(p95), "99th": float(p99)}
            )
            
            # 4. Normalization Modes
            # Mode A: Dynamic Normalization (Existing Baseline)
            if max_err > 0:
                dynamic_multiplier = 255.0 / max_err
                norm_arr_dynamic = diff_arr * dynamic_multiplier
            else:
                dynamic_multiplier = 1.0
                norm_arr_dynamic = diff_arr
                
            norm_arr_dynamic = np.clip(norm_arr_dynamic, 0, 255).astype(np.uint8)
            
            # Mode B: Fixed Linear Scaling (Multiplier = 20.0, Experimental)
            fixed_multiplier = 20.0
            norm_arr_fixed20 = np.clip(diff_arr * fixed_multiplier, 0, 255).astype(np.uint8)
            
            sat_dynamic = float(np.mean(norm_arr_dynamic == 255) * 100)
            sat_fixed20 = float(np.mean(norm_arr_fixed20 == 255) * 100)
            
            # 5. Save Error Maps (Lossless PNG)
            error_img_dynamic = Image.fromarray(norm_arr_dynamic, mode='RGB')
            error_img_dynamic.save(error_map_path, 'PNG')
            error_img_dynamic.save(error_map_dynamic_path, 'PNG')
            
            error_img_fixed20 = Image.fromarray(norm_arr_fixed20, mode='RGB')
            error_img_fixed20.save(error_map_fixed20_path, 'PNG')
            
            scale_modes = {
                "dynamic": {
                    "mode": "dynamic",
                    "multiplier": float(dynamic_multiplier),
                    "saturation_percentage": sat_dynamic,
                    "description": "Adaptive scaling stretched to observed maximum error range",
                    "artifact_path": error_map_dynamic_path,
                },
                "fixed_20": {
                    "mode": "fixed_20",
                    "multiplier": fixed_multiplier,
                    "saturation_percentage": sat_fixed20,
                    "description": "Arbitrary display scaling with fixed 20x multiplier (uncalibrated display scale)",
                    "artifact_path": error_map_fixed20_path,
                },
                "fixed_20x": {
                    "mode": "fixed_20",
                    "multiplier": fixed_multiplier,
                    "saturation_percentage": sat_fixed20,
                    "description": "Arbitrary display scaling with fixed 20x multiplier (uncalibrated display scale)",
                    "artifact_path": error_map_fixed20_path,
                }
            }
            
            return ELAResult(
                input_format=img_format,
                width=width,
                height=height,
                jpeg_quality=quality,
                statistics=stats,
                error_image_path=error_map_path,
                recompressed_image_path=recompressed_path,
                dynamic_error_image_path=error_map_dynamic_path,
                fixed_error_image_path=error_map_fixed20_path,
                scale_modes=scale_modes
            )
            
        except UnsupportedFormatError:
            raise
        except ValueError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"ELA processing failed: {str(e)}")
