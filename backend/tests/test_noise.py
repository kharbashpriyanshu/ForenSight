import os
import pytest
from PIL import Image
import numpy as np
from app.forensics.noise.engine import NoiseEngine
from app.forensics.noise.exceptions import ImageProcessingError

@pytest.fixture
def temp_dir(tmpdir):
    return str(tmpdir)

def create_test_image(path, format='JPEG'):
    img = Image.new('RGB', (100, 100), color='green')
    img.save(path, format=format)
    return path

def test_noise_valid_jpeg(temp_dir):
    input_path = os.path.join(temp_dir, 'test.jpg')
    create_test_image(input_path, 'JPEG')
    out_dir = os.path.join(temp_dir, 'out')
    
    with open(input_path, 'rb') as f:
        orig_bytes = f.read()

    res = NoiseEngine.run(input_path, out_dir, kernel_size=5, sigma=1.0)
    
    assert res.width == 100
    assert res.height == 100
    assert res.filter_config.method == "Gaussian"
    assert res.filter_config.kernel_size == 5
    assert os.path.exists(res.residual_image_path)
    assert os.path.exists(res.local_map_image_path)
    
    assert res.global_statistics.mean_residual >= 0
    assert res.global_statistics.max_residual >= 0
    
    assert res.local_statistics.mean_residual >= 0
    
    # Integrity check
    with open(input_path, 'rb') as f:
        new_bytes = f.read()
    assert orig_bytes == new_bytes

def test_noise_valid_png(temp_dir):
    # Noise engine accepts PNGs because it's a general structural filter, unlike ELA
    input_path = os.path.join(temp_dir, 'test.png')
    create_test_image(input_path, 'PNG')
    out_dir = os.path.join(temp_dir, 'out')
    
    res = NoiseEngine.run(input_path, out_dir)
    assert res.width == 100

def test_noise_invalid_config(temp_dir):
    input_path = os.path.join(temp_dir, 'test.jpg')
    create_test_image(input_path)
    
    with pytest.raises(ValueError, match="odd integer"):
        NoiseEngine.run(input_path, temp_dir, kernel_size=4)
        
    with pytest.raises(ValueError, match="Sigma must be"):
        NoiseEngine.run(input_path, temp_dir, sigma=-1.0)

def test_noise_corrupted_file(temp_dir):
    input_path = os.path.join(temp_dir, 'corrupt.jpg')
    with open(input_path, 'wb') as f:
        f.write(b'this is not an image')
        
    with pytest.raises(ImageProcessingError):
        NoiseEngine.run(input_path, temp_dir)
