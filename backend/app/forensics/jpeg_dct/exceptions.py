class JPEGDCTError(Exception):
    pass

class UnsupportedFormatError(JPEGDCTError):
    pass

class ImageProcessingError(JPEGDCTError):
    pass
