import os
import uuid
import numpy as np
from PIL import Image
from .schemas import JPEGDCTResult, DCTStatistics, DCTACStatistics, FrequencyBandStatistics
from .exceptions import UnsupportedFormatError, ImageProcessingError
from .jpeg_parser import JPEGParser

class JPEGDCTEngine:
    
    @staticmethod
    def _get_dct_matrix():
        T = np.zeros((8, 8), dtype=np.float32)
        for i in range(8):
            for j in range(8):
                if i == 0:
                    T[i, j] = 1 / np.sqrt(8)
                else:
                    T[i, j] = np.sqrt(2 / 8) * np.cos(np.pi * (2 * j + 1) * i / 16)
        return T

    @staticmethod
    def run(input_path: str, output_dir: str) -> JPEGDCTResult:
        try:
            img = Image.open(input_path)
            if img.format not in ('JPEG', 'MPO'):
                raise UnsupportedFormatError("JPEG/DCT analysis requires a native JPEG evidence input.")
            
            orig_w, orig_h = img.size
            img_format = img.format or "JPEG"
            
            q_tables = JPEGParser.extract_quantization_tables(img)
            
            if img.mode != 'L':
                img = img.convert('L')
                
            img_arr = np.array(img, dtype=np.float32)
            
            pad_h = (8 - (orig_h % 8)) % 8
            pad_w = (8 - (orig_w % 8)) % 8
            
            if pad_h > 0 or pad_w > 0:
                img_arr = np.pad(img_arr, ((0, pad_h), (0, pad_w)), mode='edge')
                
            padded_h, padded_w = img_arr.shape
            
            img_shifted = img_arr - 128.0
            
            blocks = img_shifted.reshape(padded_h // 8, 8, padded_w // 8, 8)
            blocks = blocks.transpose(0, 2, 1, 3)
            N = (padded_h // 8) * (padded_w // 8)
            blocks = blocks.reshape(N, 8, 8)
            
            T = JPEGDCTEngine._get_dct_matrix()
            dct_blocks = np.einsum('ij,njk,kl->nil', T, blocks, T.T)
            
            dc_coeffs = dct_blocks[:, 0, 0]
            
            ac_mask = np.ones((8, 8), dtype=bool)
            ac_mask[0, 0] = False
            ac_coeffs = dct_blocks[:, ac_mask]
            
            dc_stats = DCTStatistics(
                mean=float(np.mean(dc_coeffs)),
                median=float(np.median(dc_coeffs)),
                std=float(np.std(dc_coeffs)),
                min_val=float(np.min(dc_coeffs)),
                max_val=float(np.max(dc_coeffs))
            )
            
            ac_flat = ac_coeffs.flatten()
            ac_abs = np.abs(ac_flat)
            
            zero_prop = float(np.sum(np.abs(ac_flat) < 1e-1) / ac_flat.size) if ac_flat.size > 0 else 0.0
            
            ac_stats = DCTACStatistics(
                mean=float(np.mean(ac_flat)),
                median=float(np.median(ac_flat)),
                std=float(np.std(ac_flat)),
                min_val=float(np.min(ac_flat)),
                max_val=float(np.max(ac_flat)),
                mean_abs=float(np.mean(ac_abs)),
                median_abs=float(np.median(ac_abs)),
                zero_proportion=zero_prop,
                percentiles={
                    "90th": float(np.percentile(ac_abs, 90)),
                    "95th": float(np.percentile(ac_abs, 95)),
                    "99th": float(np.percentile(ac_abs, 99))
                }
            )
            
            low_mask = np.zeros((8, 8), dtype=bool)
            low_mask[0:3, 0:3] = True
            low_mask[0, 0] = False
            
            high_mask = np.zeros((8, 8), dtype=bool)
            for i in range(8):
                for j in range(8):
                    if i + j >= 9:
                        high_mask[i, j] = True
                        
            mid_mask = ~(low_mask | high_mask)
            mid_mask[0, 0] = False
            
            low_energy = float(np.mean(np.abs(dct_blocks[:, low_mask])))
            mid_energy = float(np.mean(np.abs(dct_blocks[:, mid_mask])))
            high_energy = float(np.mean(np.abs(dct_blocks[:, high_mask])))
            
            band_stats = FrequencyBandStatistics(
                low_freq_energy=low_energy,
                mid_freq_energy=mid_energy,
                high_freq_energy=high_energy
            )
            
            avg_dct_map = np.mean(np.abs(dct_blocks), axis=0)
            avg_dct_log = np.log1p(avg_dct_map)
            max_log = np.max(avg_dct_log)
            if max_log > 0:
                vis_arr = (avg_dct_log / max_log * 255).astype(np.uint8)
            else:
                vis_arr = np.zeros((8, 8), dtype=np.uint8)
                
            vis_img = Image.fromarray(vis_arr, mode='L').resize((256, 256), Image.Resampling.NEAREST)
            
            os.makedirs(output_dir, exist_ok=True)
            run_id = uuid.uuid4().hex[:8]
            vis_path = os.path.join(output_dir, f"dct_energy_map_{run_id}.jpg")
            vis_img.save(vis_path, 'JPEG', quality=95)
            
            return JPEGDCTResult(
                image_width=orig_w,
                image_height=orig_h,
                padded_width=padded_w,
                padded_height=padded_h,
                total_blocks=N,
                jpeg_format=img_format,
                quantization_tables=q_tables,
                dc_statistics=dc_stats,
                ac_statistics=ac_stats,
                band_statistics=band_stats,
                visualization_artifact_path=vis_path
            )
            
        except UnsupportedFormatError:
            raise
        except Exception as e:
            raise ImageProcessingError(f"JPEG/DCT processing failed: {str(e)}")
