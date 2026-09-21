"""
ForenSight V4 — Advanced JPEG Forensic Engines

Contains standard-compliant, low-overhead forensic engines for JPEG files:
1. JPEGStructureEngine (JPEG-STRUCTURE)
2. JPEGQuantizationTableEngine (JPEG-QT)
3. JPEGHuffmanEngine (JPEG-HUFFMAN)
"""

from .parser import parse_jpeg_stream, JPEGParseResult
from .structure_engine import JPEGStructureEngine, JPEGStructureParameters
from .qt_engine import JPEGQuantizationTableEngine, JPEGQTParameters
from .huffman_engine import JPEGHuffmanEngine, JPEGHuffmanParameters

__all__ = [
    "parse_jpeg_stream",
    "JPEGParseResult",
    "JPEGStructureEngine",
    "JPEGStructureParameters",
    "JPEGQuantizationTableEngine",
    "JPEGQTParameters",
    "JPEGHuffmanEngine",
    "JPEGHuffmanParameters",
]
