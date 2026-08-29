import os
import pytest
import numpy as np
from PIL import Image, ImageDraw
import cv2
from app.forensics.copy_move.engine import CopyMoveEngine
from app.forensics.copy_move.exceptions import ImageProcessingError

@pytest.fixture
def temp_dir(tmpdir):
    return str(tmpdir)

def create_synthetic_copymove(path):
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    for i in range(400):
        img[i, :, :] = i % 255
        
    patch = np.zeros((100, 100, 3), dtype=np.uint8)
    # Create geometric shapes to guarantee SIFT keypoints (corners/edges)
    np.random.seed(42) # fixed seed
    for _ in range(5):
        cx, cy = np.random.randint(20, 80, 2)
        cv2.circle(patch, (cx, cy), 15, (255, 255, 255), -1)
        cv2.rectangle(patch, (cx-10, cy-10), (cx+10, cy+10), (100, 100, 100), -1)
    
    img[50:150, 50:150] = patch
    img[200:300, 200:300] = patch
    
    cv2.imwrite(path, img)

def create_negative_image(path):
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    for i in range(300):
        img[:, i, :] = i % 255
    cv2.imwrite(path, img)

def test_copymove_deterministic_positive(temp_dir):
    path = os.path.join(temp_dir, 'cm.jpg')
    create_synthetic_copymove(path)
    
    out_dir = os.path.join(temp_dir, 'out')
    res = CopyMoveEngine.run(path, out_dir)
    
    # Assert features were found
    assert res.feature_statistics.keypoints_detected > 10
    assert res.matching_statistics.raw_matches > 0
    
    # Assert geometric inliers exist
    assert res.matching_statistics.geometric_inliers >= 4
    
    # Displacement should be roughly [150, 150] or [-150, -150] due to (200,200) vs (50,50)
    disp = res.geometry.displacement
    assert disp is not None
    dx, dy = abs(disp[0]), abs(disp[1])
    assert 140 < dx < 160
    assert 140 < dy < 160
    
    assert res.candidate_regions.supporting_matches >= 4

def test_copymove_negative(temp_dir):
    path = os.path.join(temp_dir, 'neg.jpg')
    create_negative_image(path)
    
    out_dir = os.path.join(temp_dir, 'out')
    res = CopyMoveEngine.run(path, out_dir)
    
    # Expect very few or 0 geometric inliers
    assert res.matching_statistics.geometric_inliers < 4
    assert res.geometry.transformation_matrix is None

def test_copymove_png_support(temp_dir):
    path = os.path.join(temp_dir, 'cm.png')
    create_synthetic_copymove(path) # Saves as PNG inherently via cv2 if extension is .png
    
    out_dir = os.path.join(temp_dir, 'out')
    res = CopyMoveEngine.run(path, out_dir)
    assert res.matching_statistics.geometric_inliers >= 4

def test_copymove_corrupted(temp_dir):
    path = os.path.join(temp_dir, 'corrupt.jpg')
    with open(path, 'wb') as f:
        f.write(b'not an image')
        
    out_dir = os.path.join(temp_dir, 'out')
    with pytest.raises(ImageProcessingError):
        CopyMoveEngine.run(path, out_dir)

def test_copymove_integrity(temp_dir):
    path = os.path.join(temp_dir, 'int.jpg')
    create_synthetic_copymove(path)
    
    with open(path, 'rb') as f:
        orig_bytes = f.read()
        
    out_dir = os.path.join(temp_dir, 'out')
    CopyMoveEngine.run(path, out_dir)
    
    with open(path, 'rb') as f:
        new_bytes = f.read()
        
    assert orig_bytes == new_bytes
