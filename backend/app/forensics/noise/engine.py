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
    def run(input_path: str, output_dir: str, kernel_size: int = 5, sigma: float = 1.0, window_size: int = 16, stride: int = 16) -> NoiseResult:
        if kernel_size % 2 == 0 or kernel_size < 3:
            raise ValueError("Kernel size must be an odd integer >= 3.")
        
        if sigma <= 0:
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
            
            # Step 1: Smooth the signal (S) using OpenCV Gaussian Blur
            smoothed = cv2.GaussianBlur(img_arr, (kernel_size, kernel_size), sigmaX=sigma, sigmaY=sigma)
            
            # Step 2: Calculate Absolute Residual (R = |I - S|)
            residual = np.abs(img_arr - smoothed)
            
            # Step 3: Global Statistics
            global_stats = NoiseEngine._calculate_statistics(residual)
            
            # Step 4: Local Analysis
            local_residual = NoiseEngine._local_analysis(residual, window_size, stride)
            local_stats = NoiseEngine._calculate_statistics(local_residual)
            
            # Step 5: Normalize and Save Visualizations
            def normalize_to_uint8(arr, max_val):
                if max_val > 0:
                    scaled = arr * (255.0 / max_val)
                else:
                    scaled = arr
                return np.clip(scaled, 0, 255).astype(np.uint8)
                
            norm_global = normalize_to_uint8(residual, global_stats.max_residual)
            norm_local = normalize_to_uint8(local_residual, local_stats.max_residual)
            
            global_map_path = os.path.join(output_dir, f"noise_residual_{run_id}.jpg")
            local_map_path = os.path.join(output_dir, f"noise_local_{run_id}.jpg")
            
            Image.fromarray(norm_global, mode='L').save(global_map_path, 'JPEG', quality=95)
            Image.fromarray(norm_local, mode='L').save(local_map_path, 'JPEG', quality=95)
            
            return NoiseResult(
                width=width,
                height=height,
                filter_config=FilterConfig(method="Gaussian", kernel_size=kernel_size, sigma=sigma),
                global_statistics=global_stats,
                local_config=LocalAnalysisConfig(window_size=window_size, stride=stride, aggregation_method="Mean Absolute Residual"),
                local_statistics=local_stats,
                residual_image_path=global_map_path,
                local_map_image_path=local_map_path
            )
            
        except ValueError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"Noise processing failed: {str(e)}")
