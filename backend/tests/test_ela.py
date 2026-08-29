import os
import io
import pytest
from PIL import Image
from app.forensics.ela.engine import ELAEngine
from app.forensics.ela.exceptions import UnsupportedFormatError, ImageProcessingError

@pytest.fixture
def temp_dir(tmpdir):
    return str(tmpdir)

def create_test_jpeg(path, color='red'):
    img = Image.new('RGB', (50, 50), color=color)
    img.save(path, format='JPEG')
    return path

def create_test_png(path):
    img = Image.new('RGB', (50, 50), color='blue')
    img.save(path, format='PNG')
    return path

def test_ela_valid_jpeg(temp_dir):
    input_path = os.path.join(temp_dir, 'test.jpg')
    create_test_jpeg(input_path)
    
    out_dir = os.path.join(temp_dir, 'out')
    
    with open(input_path, 'rb') as f:
        orig_bytes = f.read()

    result = ELAEngine.run(input_path, out_dir, quality=90)
    
    assert result.input_format in ['JPEG', 'MPO']
    assert result.width == 50
    assert result.height == 50
    assert result.jpeg_quality == 90
    assert os.path.exists(result.error_image_path)
    assert os.path.exists(result.recompressed_image_path)
    
    # Integrity check
    with open(input_path, 'rb') as f:
        new_bytes = f.read()
    assert orig_bytes == new_bytes
    
    # Statistics
    assert result.statistics.mean_error >= 0
    assert result.statistics.max_error >= 0
    assert "90th" in result.statistics.percentiles

def test_ela_invalid_format_png(temp_dir):
    input_path = os.path.join(temp_dir, 'test.png')
    create_test_png(input_path)
    out_dir = os.path.join(temp_dir, 'out')
    
    with pytest.raises(UnsupportedFormatError):
        ELAEngine.run(input_path, out_dir)

def test_ela_quality_difference(temp_dir):
    input_path = os.path.join(temp_dir, 'test_qual.jpg')
    create_test_jpeg(input_path)
    out_dir = os.path.join(temp_dir, 'out')
    
    res90 = ELAEngine.run(input_path, out_dir, quality=90)
    res70 = ELAEngine.run(input_path, out_dir, quality=70)
    
    assert res90.jpeg_quality == 90
    assert res70.jpeg_quality == 70

def test_ela_invalid_quality(temp_dir):
    input_path = os.path.join(temp_dir, 'test.jpg')
    create_test_jpeg(input_path)
    
    with pytest.raises(ValueError):
        ELAEngine.run(input_path, temp_dir, quality=150)

def test_ela_corrupted_file(temp_dir):
    input_path = os.path.join(temp_dir, 'corrupt.jpg')
    with open(input_path, 'wb') as f:
        f.write(b'this is not an image')
        
    with pytest.raises(ImageProcessingError):
        ELAEngine.run(input_path, temp_dir)
