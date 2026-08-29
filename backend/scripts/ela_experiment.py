import os
import sys
from PIL import Image, ImageDraw
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.forensics.ela.engine import ELAEngine

def run_experiment():
    print("Running ELA Controlled Experiment...")
    out_dir = "ela_experiment_out"
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Base JPEG at quality 90
    base_path = os.path.join(out_dir, "base.jpg")
    img = Image.new('RGB', (200, 200), color=(100, 100, 100))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 150, 150], fill=(200, 50, 50))
    img.save(base_path, 'JPEG', quality=90)
    
    # 2. Manipulated JPEG
    manip_path = os.path.join(out_dir, "manipulated.jpg")
    base_img = Image.open(base_path)
    draw_manip = ImageDraw.Draw(base_img)
    draw_manip.rectangle([10, 10, 40, 40], fill=(255, 255, 255))
    base_img.save(manip_path, 'JPEG', quality=90)
    
    # 3. Run ELA
    print("Analyzing Base Image...")
    res_base = ELAEngine.run(base_path, out_dir, quality=90)
    
    print("Analyzing Manipulated Image...")
    res_manip = ELAEngine.run(manip_path, out_dir, quality=90)
    
    print(f"Base Max Error: {res_base.statistics.max_error}")
    print(f"Manipulated Max Error: {res_manip.statistics.max_error}")
    print(f"Mean Error (Base): {res_base.statistics.mean_error:.2f}")
    print(f"Mean Error (Manipulated): {res_manip.statistics.mean_error:.2f}")
    
    print(f"Experiment completed. Artifacts saved in {out_dir}/")

if __name__ == "__main__":
    run_experiment()
