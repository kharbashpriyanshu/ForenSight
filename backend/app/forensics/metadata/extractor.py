from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from .schemas import ExtractedMetadata

class MetadataExtractor:
    @staticmethod
    def extract(file_path: str) -> ExtractedMetadata:
        try:
            with Image.open(file_path) as img:
                exif_data = img.getexif()
                exif_dict = {}
                gps_dict = None
                
                if exif_data:
                    for tag_id, value in exif_data.items():
                        tag_name = TAGS.get(tag_id, tag_id)
                        
                        # Handle nested GPS Info
                        if tag_name == "GPSInfo":
                            gps_dict = {}
                            if isinstance(value, dict):
                                for gps_tag_id, gps_value in value.items():
                                    gps_tag_name = GPSTAGS.get(gps_tag_id, gps_tag_id)
                                    gps_dict[str(gps_tag_name)] = gps_value
                        else:
                            # Normalize bytes or complex objects to strings
                            if isinstance(value, bytes):
                                try:
                                    value = value.decode(errors='replace')
                                except:
                                    value = str(value)
                            elif not isinstance(value, (int, float, str)):
                                value = str(value)
                            
                            # Clean null bytes if any
                            if isinstance(value, str):
                                value = value.replace('\x00', '')
                            
                            exif_dict[str(tag_name)] = value

                # Normalizing GPS Dict for JSON serialization
                if gps_dict:
                    normalized_gps = {}
                    for k, v in gps_dict.items():
                        if isinstance(v, bytes):
                            try:
                                normalized_gps[k] = v.decode(errors='replace')
                            except:
                                normalized_gps[k] = str(v)
                        elif not isinstance(v, (int, float, str)):
                            normalized_gps[k] = str(v)
                        else:
                            normalized_gps[k] = v
                    gps_dict = normalized_gps

                return ExtractedMetadata(
                    image_format=img.format or "UNKNOWN",
                    width=img.width,
                    height=img.height,
                    color_mode=img.mode,
                    exif=exif_dict,
                    gps_info=gps_dict
                )
        except Exception as e:
            raise ValueError(f"Failed to extract metadata: {str(e)}")
