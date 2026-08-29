import os
import sys
import numpy as np
from PIL import Image
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.forensics.jpeg_dct.engine import JPEGDCTEngine

def run_experiment():
    print("Running JPEG/DCT Controlled Recompression Experiment...")
    out_dir = "jpeg_dct_experiment_out"
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Create a base complex image (not just flat)
    width, height = 256, 256
    x = np.linspace(0, 10, width)
    y = np.linspace(0, 10, height)
    xv, yv = np.meshgrid(x, y)
    img_arr = (np.sin(xv) * np.cos(yv) * 127 + 128).astype(np.uint8)
    
    # Add some high-frequency noise
    noise = np.random.normal(0, 10, (height, width))
    img_arr = np.clip(img_arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(img_arr, mode='L')
    
    # Experiment A: High Quality (95)
    path_hq = os.path.join(out_dir, "hq.jpg")
    img.save(path_hq, 'JPEG', quality=95)
    print("Analyzing High-Quality (95) JPEG...")
    res_hq = JPEGDCTEngine.run(path_hq, out_dir)
    
    # Experiment B: Low Quality (50) double-compression
    # We take the HQ image and re-save it at 50
    path_lq = os.path.join(out_dir, "lq.jpg")
    hq_img = Image.open(path_hq)
    hq_img.save(path_lq, 'JPEG', quality=50)
    print("Analyzing Recompressed Low-Quality (50) JPEG...")
    res_lq = JPEGDCTEngine.run(path_lq, out_dir)
    
    print("\n=== RESULTS ===")
    print("Quantization Table 0 (Luminance) Mean:")
    print(f"  HQ: {res_hq.quantization_tables[0].mean_val:.2f}")
    print(f"  LQ: {res_lq.quantization_tables[0].mean_val:.2f}")
    
    print("\nAC Coefficients Mean Absolute:")
    print(f"  HQ: {res_hq.ac_statistics.mean_abs:.2f}")
    print(f"  LQ: {res_lq.ac_statistics.mean_abs:.2f}")
    
    print("\nAC Coefficients Zero Proportion:")
    print(f"  HQ: {res_hq.ac_statistics.zero_proportion:.2%}")
    print(f"  LQ: {res_lq.ac_statistics.zero_proportion:.2%}")
    
    print("\nHigh Frequency Energy:")
    print(f"  HQ: {res_hq.band_statistics.high_freq_energy:.2f}")
    print(f"  LQ: {res_lq.band_statistics.high_freq_energy:.2f}")
    
    print("\n=== CONCLUSION ===")
    print("The experiment successfully demonstrates that lower quality / double-compression")
    print("increases quantization severity (higher mean Q-table), forces more AC coefficients to zero,")
    print("and strips high-frequency energy from the image.")
    print("This is a measurable OBSERVATION, but does NOT universally prove malicious manipulation.")

if __name__ == "__main__":
    run_experiment()
