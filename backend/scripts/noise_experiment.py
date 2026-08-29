import os
import sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.forensics.noise.engine import NoiseEngine

def run_experiment():
    print("Running Noise Residual Controlled Experiment...")
    out_dir = "noise_experiment_out"
    os.makedirs(out_dir, exist_ok=True)
    
    # Create an image with distinct structural areas:
    # 1. Smooth region (left half)
    # 2. Textured region (right half)
    # 3. High contrast edge (middle)
    width, height = 200, 200
    img_arr = np.zeros((height, width), dtype=np.uint8)
    
    # Smooth region
    img_arr[:, :100] = 128
    
    # Textured region
    noise = np.random.normal(0, 20, (height, 100))
    img_arr[:, 100:] = np.clip(128 + noise, 0, 255).astype(np.uint8)
    
    base_path = os.path.join(out_dir, "test_structure.jpg")
    img = Image.fromarray(img_arr, mode='L')
    
    # Add a stark high-contrast edge block
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 80, 60, 120], fill=255)
    
    img.save(base_path, 'JPEG')
    
    # Run Noise Engine
    print("Analyzing Image...")
    res = NoiseEngine.run(base_path, out_dir, kernel_size=5, sigma=1.5, window_size=16, stride=16)
    
    print(f"Global Max Residual: {res.global_statistics.max_residual:.2f}")
    print(f"Global Mean Residual: {res.global_statistics.mean_residual:.2f}")
    print(f"Global Median Residual: {res.global_statistics.median_residual:.2f}")
    print(f"Global Std Residual: {res.global_statistics.std_residual:.2f}")
    
    print(f"Experiment completed. Artifacts saved in {out_dir}/")
    print("Notice that the residual map will highlight the textured region and the sharp edges.")
    print("This demonstrates that HIGH RESIDUAL != MANIPULATION. It naturally correlates with image complexity.")

if __name__ == "__main__":
    run_experiment()
