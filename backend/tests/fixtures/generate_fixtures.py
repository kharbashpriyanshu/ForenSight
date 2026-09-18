import os
import json
import hashlib
import numpy as np
import cv2
from PIL import Image

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "forensics")
MANIFEST_PATH = os.path.join(FIXTURES_DIR, "fixtures_manifest.json")

def generate_all_fixtures():
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    manifest = {}

    # 1. clean_reference.jpg
    p1 = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    img1 = Image.new("RGB", (300, 300), color=(120, 160, 200))
    img1.save(p1, format="JPEG", quality=95)
    manifest["clean_reference.jpg"] = {
        "fixture_id": "FIX-001",
        "format": "JPEG",
        "dimensions": [300, 300],
        "creation_method": "PIL RGB canvas single-pass compression at Q=95",
        "ground_truth": "CLEAN_REFERENCE",
        "known_limitations": "Synthetic flat gradient; baseline for unmanipulated noise/compression."
    }

    # 2. clean_reference.png
    p2 = os.path.join(FIXTURES_DIR, "clean_reference.png")
    img2 = Image.new("RGB", (300, 300), color=(140, 180, 120))
    img2.save(p2, format="PNG")
    manifest["clean_reference.png"] = {
        "fixture_id": "FIX-002",
        "format": "PNG",
        "dimensions": [300, 300],
        "creation_method": "PIL RGB canvas lossless PNG compression",
        "ground_truth": "CLEAN_REFERENCE",
        "known_limitations": "Lossless container; frequency DCT and ELA compression analyses are mathematically inapplicable."
    }

    # 3. clean_reference.webp
    p3 = os.path.join(FIXTURES_DIR, "clean_reference.webp")
    img3 = Image.new("RGB", (300, 300), color=(200, 150, 120))
    img3.save(p3, format="WEBP", quality=90)
    manifest["clean_reference.webp"] = {
        "fixture_id": "FIX-003",
        "format": "WEBP",
        "dimensions": [300, 300],
        "creation_method": "PIL WebP lossy compression at Q=90",
        "ground_truth": "CLEAN_REFERENCE",
        "known_limitations": "WebP compression differs from standard JPEG DCT tables."
    }

    # 4. metadata_known_camera.jpg
    p4 = os.path.join(FIXTURES_DIR, "metadata_known_camera.jpg")
    img4 = Image.new("RGB", (300, 300), color=(100, 120, 140))
    exif4 = img4.getexif()
    exif4[0x010f] = "Canon"             # Make
    exif4[0x0110] = "Canon EOS 80D"     # Model
    exif4[0x0132] = "2026:01:15 12:00:00" # DateTime
    img4.save(p4, format="JPEG", quality=95, exif=exif4)
    manifest["metadata_known_camera.jpg"] = {
        "fixture_id": "FIX-004",
        "format": "JPEG",
        "dimensions": [300, 300],
        "creation_method": "PIL JPEG with explicit hardware EXIF tags (Canon EOS 80D)",
        "ground_truth": "KNOWN_CAMERA_METADATA",
        "known_limitations": "Simulated EXIF headers without proprietary maker note blocks."
    }

    # 5. metadata_stripped.jpg
    p5 = os.path.join(FIXTURES_DIR, "metadata_stripped.jpg")
    img5 = Image.new("RGB", (300, 300), color=(110, 130, 150))
    img5.save(p5, format="JPEG", quality=90) # No exif argument
    manifest["metadata_stripped.jpg"] = {
        "fixture_id": "FIX-005",
        "format": "JPEG",
        "dimensions": [300, 300],
        "creation_method": "PIL JPEG saved without EXIF dictionary",
        "ground_truth": "STRIPPED_METADATA",
        "known_limitations": "Absence of EXIF is characteristic of web optimization or privacy stripping."
    }

    # 6. recompressed_double_jpeg.jpg
    p6 = os.path.join(FIXTURES_DIR, "recompressed_double_jpeg.jpg")
    img6 = Image.new("RGB", (300, 300), color=(150, 150, 150))
    # Add texture so DCT coefficients are active
    arr6 = np.zeros((300, 300, 3), dtype=np.uint8)
    for i in range(300):
        arr6[i, :, :] = (i * 7) % 256
    img6 = Image.fromarray(arr6)
    img6.save(p6, format="JPEG", quality=70)
    # Reload and resave at different quality
    img6_re = Image.open(p6)
    img6_re.save(p6, format="JPEG", quality=90)
    manifest["recompressed_double_jpeg.jpg"] = {
        "fixture_id": "FIX-006",
        "format": "JPEG",
        "dimensions": [300, 300],
        "creation_method": "Two-pass JPEG compression (Q=70 then Q=90)",
        "ground_truth": "DOUBLE_JPEG_RECOMPRESSION",
        "known_limitations": "Global uniform recompression without spatial splicing."
    }

    # 7. synthetic_copy_move.jpg
    p7 = os.path.join(FIXTURES_DIR, "synthetic_copy_move.jpg")
    arr7 = np.zeros((400, 400, 3), dtype=np.uint8)
    for i in range(400):
        arr7[i, :, :] = (i * 3) % 255
    patch = np.zeros((90, 90, 3), dtype=np.uint8)
    # Deterministic circles/rectangles for SIFT/ORB keypoints
    np.random.seed(1337)
    for _ in range(6):
        cx, cy = np.random.randint(15, 75, 2)
        cv2.circle(patch, (cx, cy), 12, (255, 255, 255), -1)
        cv2.rectangle(patch, (cx-8, cy-8), (cx+8, cy+8), (80, 80, 80), -1)
    arr7[40:130, 40:130] = patch
    arr7[220:310, 220:310] = patch
    cv2.imwrite(p7, arr7)
    manifest["synthetic_copy_move.jpg"] = {
        "fixture_id": "FIX-007",
        "format": "JPEG",
        "dimensions": [400, 400],
        "creation_method": "Synthetic cloned feature patch placed at (40,40) and (220,220)",
        "ground_truth": "CONTROLLED_SYNTHETIC_COPY_MOVE",
        "known_limitations": "Zero-rotation, zero-scaling synthetic patch copy."
    }

    # 8. localized_splice_ela.jpg
    p8 = os.path.join(FIXTURES_DIR, "localized_splice_ela.jpg")
    bg = Image.new("RGB", (300, 300), color=(180, 180, 180))
    # Add gradient
    bg_arr = np.fromfunction(lambda y, x, c: (x * 2 + y) % 255, (300, 300, 3), dtype=np.uint8)
    bg = Image.fromarray(bg_arr)
    # Save bg at low quality Q=60
    bg.save(p8, format="JPEG", quality=60)
    # Open, paste a patch with different compression history, save at Q=95
    bg_loaded = Image.open(p8).convert("RGB")
    patch_arr = np.full((100, 100, 3), 240, dtype=np.uint8)
    cv2.circle(patch_arr, (50, 50), 30, (20, 20, 20), -1)
    patch_img = Image.fromarray(patch_arr)
    bg_loaded.paste(patch_img, (100, 100))
    bg_loaded.save(p8, format="JPEG", quality=95)
    manifest["localized_splice_ela.jpg"] = {
        "fixture_id": "FIX-008",
        "format": "JPEG",
        "dimensions": [300, 300],
        "creation_method": "Q=60 background spliced with uncompressed patch and saved at Q=95",
        "ground_truth": "CONTROLLED_SYNTHETIC_SPLICING",
        "known_limitations": "High contrast boundary designed for ELA error surface validation."
    }

    # 9. malformed_header.jpg
    p9 = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
    with open(p9, "wb") as f:
        f.write(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00CORRUPT_BYTES_DEADBEEF\x00\xFF\xD9")
    manifest["malformed_header.jpg"] = {
        "fixture_id": "FIX-009",
        "format": "CORRUPTED_JPEG",
        "dimensions": None,
        "creation_method": "Synthetic byte injection corrupting JPEG scan headers",
        "ground_truth": "MALFORMED_INPUT",
        "known_limitations": "Cannot be parsed by valid JPEG decoders."
    }

    # 10. malformed_header.png
    p10 = os.path.join(FIXTURES_DIR, "malformed_header.png")
    with open(p10, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x00BAD_CRC_DEADBEEF")
    manifest["malformed_header.png"] = {
        "fixture_id": "FIX-010",
        "format": "CORRUPTED_PNG",
        "dimensions": None,
        "creation_method": "Invalid PNG IHDR chunk and bad CRC bytes",
        "ground_truth": "MALFORMED_INPUT",
        "known_limitations": "Cannot be parsed by valid PNG decoders."
    }

    # 11. truncated.jpg
    p11 = os.path.join(FIXTURES_DIR, "truncated.jpg")
    # Take p1 and truncate halfway
    with open(p1, "rb") as f:
        valid_bytes = f.read()
    with open(p11, "wb") as f:
        f.write(valid_bytes[:len(valid_bytes) // 3])
    manifest["truncated.jpg"] = {
        "fixture_id": "FIX-011",
        "format": "TRUNCATED_JPEG",
        "dimensions": None,
        "creation_method": "Valid JPEG byte stream truncated at 33% length",
        "ground_truth": "TRUNCATED_INPUT",
        "known_limitations": "Missing EOI marker and incomplete entropy-coded scan data."
    }

    # 12. zero_byte.bin
    p12 = os.path.join(FIXTURES_DIR, "zero_byte.bin")
    with open(p12, "wb") as f:
        pass
    manifest["zero_byte.bin"] = {
        "fixture_id": "FIX-012",
        "format": "EMPTY",
        "dimensions": None,
        "creation_method": "0-byte file",
        "ground_truth": "ZERO_BYTE",
        "known_limitations": "Boundary test for upload validation."
    }

    # 13. unsupported.txt
    p13 = os.path.join(FIXTURES_DIR, "unsupported.txt")
    with open(p13, "w", encoding="utf-8") as f:
        f.write("ForenSight Forensic System Adversarial Input Test - Plain Text File\n")
    manifest["unsupported.txt"] = {
        "fixture_id": "FIX-013",
        "format": "TEXT",
        "dimensions": None,
        "creation_method": "Standard ASCII text file",
        "ground_truth": "UNSUPPORTED_FORMAT",
        "known_limitations": "MIME type text/plain must be rejected by image ingest."
    }

    # 14. tiny_2x2.png
    p14 = os.path.join(FIXTURES_DIR, "tiny_2x2.png")
    img14 = Image.new("RGB", (2, 2), color=(255, 0, 0))
    img14.save(p14, format="PNG")
    manifest["tiny_2x2.png"] = {
        "fixture_id": "FIX-014",
        "format": "PNG",
        "dimensions": [2, 2],
        "creation_method": "Minimal 2x2 dimension RGB PNG",
        "ground_truth": "EXTREME_DIMENSION",
        "known_limitations": "Sub-block geometry (smaller than 8x8 DCT grid or 16x16 noise block)."
    }

    # 15. unusual_aspect_10x1000.jpg
    p15 = os.path.join(FIXTURES_DIR, "unusual_aspect_10x1000.jpg")
    img15 = Image.new("RGB", (10, 1000), color=(100, 200, 100))
    img15.save(p15, format="JPEG", quality=90)
    manifest["unusual_aspect_10x1000.jpg"] = {
        "fixture_id": "FIX-015",
        "format": "JPEG",
        "dimensions": [10, 1000],
        "creation_method": "Extreme aspect ratio 1:100 JPEG canvas",
        "ground_truth": "EXTREME_ASPECT_RATIO",
        "known_limitations": "High aspect ratio tests block partitioning and memory allocation boundaries."
    }

    # Calculate SHA256 for all fixtures
    for filename, meta in manifest.items():
        filepath = os.path.join(FIXTURES_DIR, filename)
        with open(filepath, "rb") as f:
            meta["sha256"] = hashlib.sha256(f.read()).hexdigest()
            meta["file_size_bytes"] = os.path.getsize(filepath)

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Generated {len(manifest)} fixtures in {FIXTURES_DIR}")
    print(f"Manifest written to {MANIFEST_PATH}")

if __name__ == "__main__":
    generate_all_fixtures()
