import os
import pytest
import numpy as np
from PIL import Image
from app.forensics.jpeg_dct.engine import JPEGDCTEngine
from app.forensics.jpeg_dct.exceptions import UnsupportedFormatError, ImageProcessingError

@pytest.fixture
def temp_dir(tmpdir):
    return str(tmpdir)

def test_jpeg_dct_constant_block_math(temp_dir):
    # Mathematical sanity test: A perfectly flat image
    # Value 200. Shifted by -128.0 = 72.0
    # DC should be 72.0 * 8 = 576.0
    # AC should be ~0.0
    path = os.path.join(temp_dir, 'constant.jpg')
    img = Image.new('L', (16, 16), color=200)
    img.save(path, 'JPEG', quality=100)
    
    out_dir = os.path.join(temp_dir, 'out')
    res = JPEGDCTEngine.run(path, out_dir)
    
    # Due to JPEG compression of the constant image, it might not be perfectly 200 anymore,
    # but it will be very close. 
    # To test pure math, we can trust the engine if AC is near zero and DC is around 576.
    assert abs(res.dc_statistics.mean - 576.0) < 10.0
    assert res.ac_statistics.mean_abs < 5.0
    assert res.total_blocks == 4

def test_jpeg_dct_rejects_png(temp_dir):
    path = os.path.join(temp_dir, 'test.png')
    img = Image.new('RGB', (16, 16), color='red')
    img.save(path, 'PNG')
    
    out_dir = os.path.join(temp_dir, 'out')
    with pytest.raises(UnsupportedFormatError, match="requires a native JPEG evidence input"):
        JPEGDCTEngine.run(path, out_dir)

def test_jpeg_dct_corrupted(temp_dir):
    path = os.path.join(temp_dir, 'corrupted.jpg')
    with open(path, 'wb') as f:
        f.write(b'not an image')
    out_dir = os.path.join(temp_dir, 'out')
    with pytest.raises(ImageProcessingError):
        JPEGDCTEngine.run(path, out_dir)

def test_jpeg_dct_padding(temp_dir):
    # 10x10 is not divisible by 8. It should pad to 16x16.
    path = os.path.join(temp_dir, 'pad.jpg')
    img = Image.new('L', (10, 10), color=100)
    img.save(path, 'JPEG', quality=90)
    
    out_dir = os.path.join(temp_dir, 'out')
    res = JPEGDCTEngine.run(path, out_dir)
    
    assert res.image_width == 10
    assert res.image_height == 10
    assert res.padded_width == 16
    assert res.padded_height == 16
    assert res.total_blocks == 4

def test_jpeg_dct_quantization_extraction(temp_dir):
    path = os.path.join(temp_dir, 'qtest.jpg')
    img = Image.new('RGB', (16, 16), color='blue')
    img.save(path, 'JPEG', quality=50) # low quality, high quantization
    
    out_dir = os.path.join(temp_dir, 'out')
    res = JPEGDCTEngine.run(path, out_dir)
    
    assert len(res.quantization_tables) > 0
    q_table = res.quantization_tables[0]
    assert len(q_table.values) == 64
    assert q_table.min_val > 0

def test_jpeg_dct_integrity(temp_dir):
    path = os.path.join(temp_dir, 'integrity.jpg')
    img = Image.new('L', (16, 16), color=50)
    img.save(path, 'JPEG')
    
    with open(path, 'rb') as f:
        orig_bytes = f.read()
        
    out_dir = os.path.join(temp_dir, 'out')
    JPEGDCTEngine.run(path, out_dir)
    
    with open(path, 'rb') as f:
        new_bytes = f.read()
        
    assert orig_bytes == new_bytes
