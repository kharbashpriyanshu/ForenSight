from .metadata import MetadataAdapter
from .ela import ELAAdapter
from .noise import NoiseAdapter
from .jpeg_dct import JPEGDCTAdapter
from .copy_move import CopyMoveAdapter

ADAPTERS = {
    "METADATA": MetadataAdapter,
    "ELA": ELAAdapter,
    "NOISE": NoiseAdapter,
    "JPEG_DCT": JPEGDCTAdapter,
    "COPY_MOVE": CopyMoveAdapter
}
