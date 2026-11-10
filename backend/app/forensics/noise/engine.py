import os
import uuid
import cv2
import numpy as np
from PIL import Image
from .schemas import NoiseResult, NoiseStatistics, FilterConfig, LocalAnalysisConfig
from .exceptions import UnsupportedFormatError, ImageProcessingError

class NoiseEngine:
    @staticmethod
    def _calculate_statistics(residual_arr: np.ndarray) -> NoiseStatistics:
        arr_flat = residual_arr.flatten()
        # If array is empty (e.g. image smaller than window size), return zeros
        if arr_flat.size == 0:
            return NoiseStatistics(mean_residual=0.0, median_residual=0.0, max_residual=0.0, std_residual=0.0, percentiles={"90th": 0.0, "95th": 0.0, "99th": 0.0})
            
        return NoiseStatistics(
            mean_residual=float(np.mean(arr_flat)),
            median_residual=float(np.median(arr_flat)),
            max_residual=float(np.max(arr_flat)),
            std_residual=float(np.std(arr_flat)),
            percentiles={
                "90th": float(np.percentile(arr_flat, 90)),
                "95th": float(np.percentile(arr_flat, 95)),
                "99th": float(np.percentile(arr_flat, 99)),
            }
        )

    @staticmethod
    def _local_analysis(residual_arr: np.ndarray, window_size: int, stride: int) -> np.ndarray:
        h, w = residual_arr.shape
        out_h = max(1, (h - window_size) // stride + 1)
        out_w = max(1, (w - window_size) // stride + 1)
        
        local_map = np.zeros((out_h, out_w), dtype=np.float32)
        
        # Simple window aggregation, not the fastest but perfectly reproducible for baseline
        for i in range(out_h):
            for j in range(out_w):
                y = i * stride
                x = j * stride
                # Bound checking in case of very small images
                y_end = min(h, y+window_size)
                x_end = min(w, x+window_size)
                window = residual_arr[y:y_end, x:x_end]
                if window.size > 0:
                    local_map[i, j] = np.mean(window)
                
        return local_map

    @staticmethod
    def run(
        input_path: str,
        output_dir: str,
        kernel_size: int = 5,
        sigma: float = 1.0,
        window_size: int = 16,
        stride: int = 16,
        filter_method: str = "Gaussian",
        compute_comparison: bool = True
    ) -> NoiseResult:
        norm_method = filter_method.strip().capitalize()
        if norm_method not in ("Gaussian", "Median"):
            raise ValueError(f"Unsupported filter method '{filter_method}'. Must be 'Gaussian' or 'Median'.")

        if kernel_size % 2 == 0 or kernel_size < 3:
            raise ValueError("Kernel size must be an odd integer >= 3.")
        
        if norm_method == "Gaussian" and sigma <= 0:
            raise ValueError("Sigma must be > 0.")
            
        try:
            # Pillow used to safely open the file
            img = Image.open(input_path)
            
            # We use Grayscale for baseline noise residual to evaluate overall luminance structure.
            # This is simpler mathematically and standard for primary structural noise mapping.
            if img.mode != 'L':
                img = img.convert('L')
                
            width, height = img.size
            
            os.makedirs(output_dir, exist_ok=True)
            run_id = uuid.uuid4().hex[:8]
            
            # float32 prevents underflow during subtraction
            img_arr = np.array(img, dtype=np.float32)
            img_arr_u8 = np.array(img, dtype=np.uint8)
            
            # 1. Compute Gaussian smoothed residual (Baseline)
            smoothed_gauss = cv2.GaussianBlur(img_arr, (kernel_size, kernel_size), sigmaX=max(0.1, sigma), sigmaY=max(0.1, sigma))
            residual_gauss = np.abs(img_arr - smoothed_gauss)
            
            # 2. Compute Median smoothed residual (Experimental Alternative)
            smoothed_med = cv2.medianBlur(img_arr_u8, kernel_size).astype(np.float32)
            residual_med = np.abs(img_arr - smoothed_med)
            
            # Assign primary vs comparative residual based on requested filter_method
            if norm_method == "Gaussian":
                residual = residual_gauss
                comp_residual = residual_med
                comp_method = "Median"
                primary_filter_cfg = FilterConfig(method="Gaussian", kernel_size=kernel_size, sigma=sigma)
                comp_filter_cfg = FilterConfig(method="Median", kernel_size=kernel_size, sigma=None)
            else:
                residual = residual_med
                comp_residual = residual_gauss
                comp_method = "Gaussian"
                primary_filter_cfg = FilterConfig(method="Median", kernel_size=kernel_size, sigma=None)
                comp_filter_cfg = FilterConfig(method="Gaussian", kernel_size=kernel_size, sigma=sigma)
            
            # Step 3: Global Statistics
            global_stats = NoiseEngine._calculate_statistics(residual)
            
            # Step 4: Local Analysis
            local_residual = NoiseEngine._local_analysis(residual, window_size, stride)
            local_stats = NoiseEngine._calculate_statistics(local_residual)
            
            # Step 5: Normalize and Save Primary Visualizations
            def normalize_to_uint8(arr, max_val):
                if max_val > 0:
                    scaled = arr * (255.0 / max_val)
                else:
                    scaled = arr
                return np.clip(scaled, 0, 255).astype(np.uint8)
                
            norm_global = normalize_to_uint8(residual, global_stats.max_residual)
            norm_local = normalize_to_uint8(local_residual, local_stats.max_residual)
            
            global_map_path = os.path.join(output_dir, f"noise_residual_{run_id}.png")
            local_map_path = os.path.join(output_dir, f"noise_local_{run_id}.png")
            
            Image.fromarray(norm_global, mode='L').save(global_map_path, 'PNG')
            Image.fromarray(norm_local, mode='L').save(local_map_path, 'PNG')
            
            # Step 6: Comparative Alternative Processing
            comp_global_stats = None
            comp_local_stats = None
            comp_global_path = None
            comp_local_path = None
            comparative_dict = None
            
            if compute_comparison:
                comp_global_stats = NoiseEngine._calculate_statistics(comp_residual)
                comp_local_residual = NoiseEngine._local_analysis(comp_residual, window_size, stride)
                comp_local_stats = NoiseEngine._calculate_statistics(comp_local_residual)
                
                norm_comp_global = normalize_to_uint8(comp_residual, comp_global_stats.max_residual)
                norm_comp_local = normalize_to_uint8(comp_local_residual, comp_local_stats.max_residual)
                
                comp_global_path = os.path.join(output_dir, f"noise_residual_{comp_method.lower()}_{run_id}.png")
                comp_local_path = os.path.join(output_dir, f"noise_local_{comp_method.lower()}_{run_id}.png")
                
                Image.fromarray(norm_comp_global, mode='L').save(comp_global_path, 'PNG')
                Image.fromarray(norm_comp_local, mode='L').save(comp_local_path, 'PNG')
                
                # Also save explicit gaussian / median paths if primary is Gaussian
                if norm_method == "Gaussian":
                    gauss_path = global_map_path
                    med_path = comp_global_path
                    gauss_stats = global_stats
                    med_stats = comp_global_stats
                else:
                    gauss_path = comp_global_path
                    med_path = global_map_path
                    gauss_stats = comp_global_stats
                    med_stats = global_stats

                comparative_dict = {
                    "gaussian": {
                        "method": "Gaussian",
                        "kernel_size": kernel_size,
                        "sigma": sigma,
                        "description": "Baseline linear low-pass filter (standard high-frequency residual)",
                        "mean_residual": gauss_stats.mean_residual,
                        "std_residual": gauss_stats.std_residual,
                        "max_residual": gauss_stats.max_residual,
                        "artifact_path": gauss_path,
                    },
                    "median": {
                        "method": "Median",
                        "kernel_size": kernel_size,
                        "description": "Experimental non-linear order-statistic filter (preserves step edges, isolates non-correlated noise)",
                        "mean_residual": med_stats.mean_residual,
                        "std_residual": med_stats.std_residual,
                        "max_residual": med_stats.max_residual,
                        "artifact_path": med_path,
                    }
                }
            
            return NoiseResult(
                width=width,
                height=height,
                filter_config=primary_filter_cfg,
                global_statistics=global_stats,
                local_config=LocalAnalysisConfig(window_size=window_size, stride=stride, aggregation_method="Mean Absolute Residual"),
                local_statistics=local_stats,
                residual_image_path=global_map_path,
                local_map_image_path=local_map_path,
                comparison_filter_config=comp_filter_cfg if compute_comparison else None,
                comparison_global_statistics=comp_global_stats,
                comparison_local_statistics=comp_local_stats,
                comparison_residual_image_path=comp_global_path,
                comparison_local_map_image_path=comp_local_path,
                comparative_methods=comparative_dict
            )
            
        except ValueError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"Noise processing failed: {str(e)}")
