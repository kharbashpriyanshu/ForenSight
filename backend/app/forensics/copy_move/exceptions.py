class CopyMoveError(Exception):
    pass

class UnsupportedFormatError(CopyMoveError):
    pass

class ImageProcessingError(CopyMoveError):
    pass
