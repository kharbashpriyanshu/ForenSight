"""
ForenSight V4 — NOAA Solar Ephemeris & Astronomical Shadow Cross-Check

Calculates the exact astronomical solar azimuth and elevation angle for a given
geographic coordinate (latitude, longitude) and timestamp, and cross-references
it with observed image shadow vectors for forensic timeline and location verification.
"""

import math
import datetime
from typing import Optional, Tuple, Dict, Any
from PIL import Image, ExifTags


def calculate_noaa_solar_position(
    lat: float,
    lon: float,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    second: int = 0,
    tz_offset: float = 0.0
) -> Dict[str, float]:
    """
    Standard NOAA astronomical solar position calculation algorithm.
    Accurate to within 0.01 degrees.
    
    Returns:
        {
            "solar_elevation_deg": float (-90 to +90),
            "solar_azimuth_deg": float (0 to 360, clockwise from True North),
            "solar_zenith_deg": float (0 to 180),
            "expected_shadow_azimuth_deg": float (0 to 360),
            "shadow_length_ratio": float (cotangent of elevation, ratio of shadow length to object height),
            "equation_of_time_minutes": float,
            "solar_declination_deg": float
        }
    """
    # Adjust month and year for astronomical Julian calculation
    calc_year = year
    calc_month = month
    if calc_month <= 2:
        calc_year -= 1
        calc_month += 12

    a = math.floor(calc_year / 100)
    b = 2 - a + math.floor(a / 4)
    day_fraction = (hour + minute / 60.0 + second / 3600.0 - tz_offset) / 24.0
    jd = math.floor(365.25 * (calc_year + 4716)) + math.floor(30.6001 * (calc_month + 1)) + day + b - 1524.5 + day_fraction
    t = (jd - 2451545.0) / 36525.0

    # Geometric mean longitude of the sun (degrees)
    l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360.0

    # Mean anomaly of the sun (degrees)
    m = (357.52911 + t * (35999.05029 - 0.0001537 * t)) % 360.0
    m_rad = math.radians(m)

    # Earth eccentricity
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

    # Sun equation of center
    c = (
        math.sin(m_rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
        math.sin(2 * m_rad) * (0.019993 - 0.000101 * t) +
        math.sin(3 * m_rad) * 0.000289
    )
    sun_true_lon = l0 + c
    sun_app_lon = sun_true_lon - 0.00569 - 0.00478 * math.sin(math.radians(125.04 - 1934.136 * t))

    # Mean obliquity of ecliptic
    eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0
    eps = eps0 + 0.00256 * math.cos(math.radians(125.04 - 1934.136 * t))
    eps_rad = math.radians(eps)

    # Solar declination
    decl = math.degrees(math.asin(math.sin(eps_rad) * math.sin(math.radians(sun_app_lon))))
    decl_rad = math.radians(decl)

    # Equation of time (minutes)
    y = math.tan(eps_rad / 2.0) ** 2
    l0_rad = math.radians(l0)
    eot = 4.0 * math.degrees(
        y * math.sin(2 * l0_rad) -
        2 * e * math.sin(m_rad) +
        4 * e * y * math.sin(m_rad) * math.cos(2 * l0_rad) -
        0.5 * (y ** 2) * math.sin(4 * l0_rad) -
        1.25 * (e ** 2) * math.sin(2 * m_rad)
    )

    # True solar time
    solar_time_fix = eot + 4.0 * lon - 60.0 * tz_offset
    true_solar_time = (hour * 60.0 + minute + second / 60.0 + solar_time_fix) % 1440.0
    hour_angle = true_solar_time / 4.0 - 180.0
    if hour_angle < -180:
        hour_angle += 360.0

    lat_rad = math.radians(lat)
    ha_rad = math.radians(hour_angle)

    # Solar zenith and elevation
    csz = math.sin(lat_rad) * math.sin(decl_rad) + math.cos(lat_rad) * math.cos(decl_rad) * math.cos(ha_rad)
    csz = max(-1.0, min(1.0, csz))
    zenith = math.degrees(math.acos(csz))
    elevation = 90.0 - zenith

    # Solar azimuth (clockwise from True North)
    az_denom = math.cos(lat_rad) * math.sin(math.radians(zenith))
    if abs(az_denom) > 0.0001:
        az_rad = ((math.sin(lat_rad) * math.cos(math.radians(zenith))) - math.sin(decl_rad)) / az_denom
        az_rad = max(-1.0, min(1.0, az_rad))
        azimuth = 180.0 - math.degrees(math.acos(az_rad))
        if hour_angle > 0:
            azimuth = 360.0 - azimuth
    else:
        azimuth = 180.0 if lat > 0 else 0.0

    # Expected shadow direction on the ground is opposite the sun
    expected_shadow_az = (azimuth + 180.0) % 360.0

    # Ratio of shadow length to caster height
    shadow_ratio = (1.0 / math.tan(math.radians(elevation))) if elevation > 0.5 else 99.0

    return {
        "solar_elevation_deg": round(elevation, 2),
        "solar_azimuth_deg": round(azimuth, 2),
        "solar_zenith_deg": round(zenith, 2),
        "expected_shadow_azimuth_deg": round(expected_shadow_az, 2),
        "shadow_length_ratio": round(shadow_ratio, 2),
        "equation_of_time_minutes": round(eot, 2),
        "solar_declination_deg": round(decl, 2)
    }


def extract_exif_datetime_and_gps(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Extracts DateTimeOriginal, TimeZoneOffset, and GPS coordinates from image EXIF.
    Returns normalized dictionary or None if EXIF is missing.
    """
    try:
        with Image.open(image_path) as img:
            exif = img.getexif()
            if not exif:
                return None

            dt_str = None
            gps_info = None

            # Standard Exif tags
            for tag_id, value in exif.items():
                tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                if tag_name == "DateTimeOriginal":
                    dt_str = str(value)
                elif tag_name == "DateTime" and not dt_str:
                    dt_str = str(value)
                elif tag_name == "GPSInfo":
                    gps_info = value

            # If not in top-level, check IFD
            if hasattr(exif, "get_ifd"):
                try:
                    exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
                    for k, v in exif_ifd.items():
                        name = ExifTags.TAGS.get(k, str(k))
                        if name == "DateTimeOriginal":
                            dt_str = str(v)
                except Exception:
                    pass

                try:
                    gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
                    if gps_ifd:
                        gps_info = gps_ifd
                except Exception:
                    pass

            if not dt_str:
                return None

            # Parse datetime string "YYYY:MM:DD HH:MM:SS"
            dt_parts = dt_str.strip().split(" ")
            if len(dt_parts) != 2:
                return None

            date_parts = [int(p) for p in dt_parts[0].split(":")]
            time_parts = [int(p) for p in dt_parts[1].split(":")]
            dt = datetime.datetime(
                year=date_parts[0],
                month=date_parts[1],
                day=date_parts[2],
                hour=time_parts[0],
                minute=time_parts[1],
                second=time_parts[2] if len(time_parts) > 2 else 0
            )

            lat = None
            lon = None
            if gps_info and isinstance(gps_info, dict):
                lat = _parse_gps_coord(gps_info.get(2), gps_info.get(1))
                lon = _parse_gps_coord(gps_info.get(4), gps_info.get(3))

            return {
                "datetime": dt,
                "datetime_str": dt_str,
                "has_gps": lat is not None and lon is not None,
                "latitude": lat,
                "longitude": lon
            }

    except Exception:
        return None


def _parse_gps_coord(coord_tuple, ref_str) -> Optional[float]:
    """Helper to convert EXIF GPS DMS rational tuple to decimal degrees."""
    if not coord_tuple or len(coord_tuple) < 3:
        return None
    try:
        d = float(coord_tuple[0])
        m = float(coord_tuple[1])
        s = float(coord_tuple[2])
        dec = d + (m / 60.0) + (s / 3600.0)
        if ref_str in ["S", "W"]:
            dec = -dec
        return round(dec, 6)
    except Exception:
        return None
