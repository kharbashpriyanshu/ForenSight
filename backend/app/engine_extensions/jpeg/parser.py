"""
ForenSight V4 — JPEG Byte Stream Parser

Robust, low-overhead binary JPEG marker parser operating directly on raw file bytes.
Extracts marker sequences, byte offsets, segment lengths, SOF dimensions and component
parameters, DQT tables, DHT tables, DRI restart intervals, and structural anomalies.
Complies with ITU-T T.81 (ISO/IEC 10918-1) JPEG specification without decoding full pixel data.
"""

import struct
import hashlib
from typing import List, Dict, Any, Optional, Tuple

# Standard JPEG marker constants
MARKER_SOI  = 0xFFD8  # Start of Image
MARKER_EOI  = 0xFFD9  # End of Image
MARKER_SOS  = 0xFFDA  # Start of Scan
MARKER_DQT  = 0xFFDB  # Define Quantization Table
MARKER_DNL  = 0xFFDC  # Define Number of Lines
MARKER_DRI  = 0xFFDD  # Define Restart Interval
MARKER_DHP  = 0xFFDE  # Define Hierarchical Progression
MARKER_EXP  = 0xFFDF  # Expand Reference Component(s)
MARKER_DHT  = 0xFFC4  # Define Huffman Table
MARKER_DAC  = 0xFFCC  # Define Arithmetic Coding Condition(s)
MARKER_COM  = 0xFFFE  # Comment

# SOF Markers
SOF_MARKERS = {
    0xFFC0: "SOF0 (Baseline DCT)",
    0xFFC1: "SOF1 (Extended Sequential DCT)",
    0xFFC2: "SOF2 (Progressive DCT)",
    0xFFC3: "SOF3 (Lossless Sequential)",
    0xFFC5: "SOF5 (Differential Sequential DCT)",
    0xFFC6: "SOF6 (Differential Progressive DCT)",
    0xFFC7: "SOF7 (Differential Lossless)",
    0xFFC9: "SOF9 (Extended Sequential DCT, Arithmetic)",
    0xFFCA: "SOF10 (Progressive DCT, Arithmetic)",
    0xFFCB: "SOF11 (Lossless Sequential, Arithmetic)",
    0xFFCD: "SOF13 (Differential Sequential DCT, Arithmetic)",
    0xFFCE: "SOF14 (Differential Progressive DCT, Arithmetic)",
    0xFFCF: "SOF15 (Differential Lossless, Arithmetic)",
}

# Stand-alone markers without payload length
STANDALONE_MARKERS = {
    MARKER_SOI,
    MARKER_EOI,
    0xFF00, # Byte stuffing
    0xFF01, # TEM (Temporary marker for arithmetic coding)
    0xFFD0, 0xFFD1, 0xFFD2, 0xFFD3, 0xFFD4, 0xFFD5, 0xFFD6, 0xFFD7, # RST0-RST7
}

# ITU-T T.81 Zig-zag scan ordering
ZIGZAG_INDEX = [
     0,  1,  8, 16,  9,  2,  3, 10,
    17, 24, 32, 25, 18, 11,  4,  5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13,  6,  7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
]


def marker_name(marker: int) -> str:
    """Returns human-readable name for a 16-bit marker code."""
    if marker == MARKER_SOI:
        return "SOI"
    if marker == MARKER_EOI:
        return "EOI"
    if marker == MARKER_SOS:
        return "SOS"
    if marker == MARKER_DQT:
        return "DQT"
    if marker == MARKER_DHT:
        return "DHT"
    if marker == MARKER_DRI:
        return "DRI"
    if marker == MARKER_COM:
        return "COM"
    if 0xFFE0 <= marker <= 0xFFEF:
        return f"APP{marker - 0xFFE0}"
    if 0xFFD0 <= marker <= 0xFFD7:
        return f"RST{marker - 0xFFD0}"
    if marker in SOF_MARKERS:
        return SOF_MARKERS[marker].split()[0]
    return f"UNK_0x{marker:04X}"


class JPEGParseResult:
    """Structured container holding all metadata parsed from raw JPEG byte stream."""
    def __init__(self):
        self.is_jpeg: bool = False
        self.total_bytes: int = 0
        self.marker_sequence: List[str] = []
        self.segments: List[Dict[str, Any]] = []
        self.dimensions: Optional[Dict[str, int]] = None
        self.precision: Optional[int] = None
        self.sof_marker: Optional[str] = None
        self.components: List[Dict[str, Any]] = []
        self.restart_interval: Optional[int] = None
        self.dqt_tables: List[Dict[str, Any]] = []
        self.dht_tables: List[Dict[str, Any]] = []
        self.sos_info: Optional[Dict[str, Any]] = None
        self.trailing_bytes_count: int = 0
        self.structural_anomalies: List[str] = []
        self.entropy_data_offset: Optional[int] = None
        self.entropy_data_length: Optional[int] = None
        self.eoi_offset: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_jpeg": self.is_jpeg,
            "total_bytes": self.total_bytes,
            "marker_sequence": self.marker_sequence,
            "segments": self.segments,
            "dimensions": self.dimensions,
            "precision": self.precision,
            "sof_marker": self.sof_marker,
            "components": self.components,
            "restart_interval": self.restart_interval,
            "dqt_count": len(self.dqt_tables),
            "dht_count": len(self.dht_tables),
            "trailing_bytes_count": self.trailing_bytes_count,
            "structural_anomalies": self.structural_anomalies,
            "entropy_data_length": self.entropy_data_length,
            "eoi_offset": self.eoi_offset,
        }


def parse_jpeg_stream(data: bytes) -> JPEGParseResult:
    """
    Parses a JPEG byte stream deterministically.
    Does not decompress image rasters. Safely catches and logs all structural anomalies.
    """
    res = JPEGParseResult()
    res.total_bytes = len(data)

    if len(data) < 4:
        res.structural_anomalies.append("File size too small (< 4 bytes) for valid JPEG.")
        return res

    # Check SOI
    if data[0:2] != b"\xFF\xD8":
        res.structural_anomalies.append("Missing SOI (0xFFD8) marker at beginning of byte stream.")
        return res

    res.is_jpeg = True
    res.marker_sequence.append("SOI")
    res.segments.append({
        "marker": "SOI",
        "code": "0xFFD8",
        "offset": 0,
        "length": 0,
        "size": 2,
    })

    offset = 2
    seen_sof = False
    seen_sos = False

    while offset < len(data):
        # Scan for next marker (0xFF followed by non-0x00 and non-0xFF)
        if data[offset] != 0xFF:
            # Group consecutive non-marker bytes
            garb_start = offset
            while offset < len(data) and data[offset] != 0xFF:
                offset += 1
            garb_len = offset - garb_start
            res.structural_anomalies.append(
                f"Unexpected non-marker byte sequence ({garb_len} bytes) at offset {garb_start} (expected 0xFF marker prefix)."
            )
            continue

        # Skip repeated 0xFF padding bytes
        pad_start = offset
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1

        if offset >= len(data):
            res.structural_anomalies.append(f"Truncated JPEG stream: trailing 0xFF padding without marker code at offset {pad_start}.")
            break

        marker_byte = data[offset]
        marker_code = 0xFF00 | marker_byte
        marker_offset = pad_start
        offset += 1  # moved past marker byte

        m_name = marker_name(marker_code)
        res.marker_sequence.append(m_name)

        # Stand-alone markers (EOI, RST0-RST7, TEM)
        if marker_code in STANDALONE_MARKERS:
            res.segments.append({
                "marker": m_name,
                "code": f"0x{marker_code:04X}",
                "offset": marker_offset,
                "length": 0,
                "size": offset - marker_offset,
            })
            if marker_code == MARKER_EOI:
                res.eoi_offset = marker_offset
                # Check for trailing bytes
                trailing = len(data) - offset
                if trailing > 0:
                    res.trailing_bytes_count = trailing
                    res.structural_anomalies.append(
                        f"Detected {trailing} trailing bytes after EOI marker (offset {offset} to {len(data)})."
                    )
                break
            continue

        # Read segment length (2 bytes, includes length field itself)
        if offset + 2 > len(data):
            res.structural_anomalies.append(f"Truncated marker {m_name}: missing 16-bit segment length at offset {offset}.")
            break

        seg_length = struct.unpack(">H", data[offset:offset+2])[0]
        if seg_length < 2:
            res.structural_anomalies.append(f"Malformed {m_name} segment length {seg_length} < 2 at offset {offset}.")
            break

        payload_length = seg_length - 2
        payload_start = offset + 2
        payload_end = payload_start + payload_length

        if payload_end > len(data):
            res.structural_anomalies.append(
                f"Truncated {m_name} payload: specified {seg_length} bytes but only {len(data) - offset} remain."
            )
            payload_data = data[payload_start:]
            payload_end = len(data)
        else:
            payload_data = data[payload_start:payload_end]

        seg_info: Dict[str, Any] = {
            "marker": m_name,
            "code": f"0x{marker_code:04X}",
            "offset": marker_offset,
            "length": seg_length,
            "size": (offset + seg_length) - marker_offset,
        }

        # Detailed marker payload parsing
        if marker_code == MARKER_DQT:
            # Parse Quantization Tables
            parse_dqt_payload(payload_data, marker_offset, res)
        elif marker_code == MARKER_DHT:
            # Parse Huffman Tables
            parse_dht_payload(payload_data, marker_offset, res)
        elif marker_code == MARKER_DRI:
            # Restart Interval
            if len(payload_data) >= 2:
                res.restart_interval = struct.unpack(">H", payload_data[:2])[0]
                seg_info["restart_interval"] = res.restart_interval
            else:
                res.structural_anomalies.append("Malformed DRI segment: payload length < 2.")
        elif marker_code in SOF_MARKERS:
            # Frame Header (SOF)
            if seen_sof:
                res.structural_anomalies.append(f"Duplicate SOF marker ({m_name}) encountered at offset {marker_offset}.")
            seen_sof = True
            res.sof_marker = m_name
            parse_sof_payload(payload_data, m_name, res, seg_info)
        elif marker_code == MARKER_SOS:
            # Start of Scan
            seen_sos = True
            parse_sos_payload(payload_data, res, seg_info)
            res.segments.append(seg_info)
            offset = payload_end

            # Entropy coded data scan until EOI or restart/marker
            res.entropy_data_offset = offset
            scan_data_start = offset
            eoi_found = False

            # Scan through entropy-coded data
            while offset < len(data) - 1:
                if data[offset] == 0xFF:
                    next_byte = data[offset + 1]
                    if next_byte == 0x00:
                        # Byte stuffing, skip
                        offset += 2
                        continue
                    elif 0xD0 <= next_byte <= 0xD7:
                        # RST marker inside scan
                        rst_code = 0xFF00 | next_byte
                        res.marker_sequence.append(f"RST{next_byte - 0xD0}")
                        offset += 2
                        continue
                    elif next_byte == 0xD9:
                        # EOI found
                        res.entropy_data_length = offset - scan_data_start
                        res.marker_sequence.append("EOI")
                        res.eoi_offset = offset
                        res.segments.append({
                            "marker": "EOI",
                            "code": "0xFFD9",
                            "offset": offset,
                            "length": 0,
                            "size": 2,
                        })
                        offset += 2
                        trailing = len(data) - offset
                        if trailing > 0:
                            res.trailing_bytes_count = trailing
                            res.structural_anomalies.append(
                                f"Detected {trailing} trailing bytes after EOI marker (offset {offset} to {len(data)})."
                            )
                        eoi_found = True
                        break
                    elif next_byte != 0xFF:
                        # Found non-RST marker inside scan data (could be DNL, next SOS, etc.)
                        res.entropy_data_length = offset - scan_data_start
                        break
                    else:
                        # 0xFF 0xFF padding
                        offset += 1
                        continue
                offset += 1

            if not eoi_found and offset >= len(data) - 1:
                res.entropy_data_length = len(data) - scan_data_start
                res.structural_anomalies.append("Missing EOI (0xFFD9) marker before end of byte stream.")
            break

        res.segments.append(seg_info)
        offset = payload_end

    # Structural cross-validations
    if "EOI" not in res.marker_sequence:
        if "Missing EOI (0xFFD9) marker before end of byte stream." not in res.structural_anomalies:
            res.structural_anomalies.append("Missing EOI (0xFFD9) marker.")

    if not seen_sof:
        res.structural_anomalies.append("Missing SOF (Start of Frame) marker; cannot determine dimensions.")

    # Validate component table references against defined tables
    defined_dqt_ids = {t["table_id"] for t in res.dqt_tables}
    for comp in res.components:
        q_id = comp.get("quantization_table_id")
        if q_id is not None and q_id not in defined_dqt_ids:
            res.structural_anomalies.append(
                f"Component '{comp.get('name')}' references undefined DQT ID {q_id} (defined: {sorted(list(defined_dqt_ids))})."
            )

    return res


def parse_sof_payload(payload: bytes, sof_name: str, res: JPEGParseResult, seg_info: Dict[str, Any]) -> None:
    """Parses SOF marker payload to extract dimensions, precision, and component sampling."""
    if len(payload) < 6:
        res.structural_anomalies.append(f"Malformed {sof_name} payload: length {len(payload)} < 6.")
        return

    precision = payload[0]
    height, width = struct.unpack(">HH", payload[1:5])
    num_components = payload[5]

    res.precision = precision
    res.dimensions = {"width": width, "height": height}
    seg_info["precision"] = precision
    seg_info["dimensions"] = {"width": width, "height": height}
    seg_info["component_count"] = num_components

    if width == 0 or height == 0:
        res.structural_anomalies.append(f"Impossible frame dimensions: {width}x{height} (zero dimension).")

    comp_data = payload[6:]
    components = []
    comp_names = ["Y", "Cb", "Cr", "K"]

    for i in range(num_components):
        if len(comp_data) < (i + 1) * 3:
            res.structural_anomalies.append(f"Truncated component definition {i+1} in {sof_name}.")
            break
        c_id = comp_data[i*3]
        sampling = comp_data[i*3 + 1]
        h_samp = (sampling >> 4) & 0x0F
        v_samp = sampling & 0x0F
        qt_id = comp_data[i*3 + 2]

        c_name = comp_names[i] if i < len(comp_names) else f"Comp_{c_id}"
        components.append({
            "component_id": c_id,
            "name": c_name,
            "horizontal_sampling": h_samp,
            "vertical_sampling": v_samp,
            "quantization_table_id": qt_id,
        })

    res.components = components
    seg_info["components"] = components


def parse_sos_payload(payload: bytes, res: JPEGParseResult, seg_info: Dict[str, Any]) -> None:
    """Parses SOS marker payload to extract scan component table selectors."""
    if len(payload) < 1:
        res.structural_anomalies.append("Malformed SOS payload: length < 1.")
        return

    num_components = payload[0]
    seg_info["component_count"] = num_components
    components_in_scan = []

    pos = 1
    for i in range(num_components):
        if pos + 2 > len(payload):
            res.structural_anomalies.append(f"Truncated component {i+1} in SOS.")
            break
        c_id = payload[pos]
        tables = payload[pos + 1]
        dc_huffman = (tables >> 4) & 0x0F
        ac_huffman = tables & 0x0F

        components_in_scan.append({
            "component_id": c_id,
            "dc_huffman_table_id": dc_huffman,
            "ac_huffman_table_id": ac_huffman,
        })
        pos += 2

    res.sos_info = {
        "num_components": num_components,
        "components": components_in_scan,
    }
    seg_info["scan_components"] = components_in_scan


def parse_dqt_payload(payload: bytes, segment_offset: int, res: JPEGParseResult) -> None:
    """Parses DQT segment payload into 8x8 matrices and statistics."""
    pos = 0
    while pos < len(payload):
        if pos + 1 > len(payload):
            res.structural_anomalies.append(f"Truncated DQT header at segment offset {segment_offset + 2 + pos}.")
            break

        header = payload[pos]
        precision = (header >> 4) & 0x0F  # 0 = 8-bit, 1 = 16-bit
        table_id = header & 0x0F          # 0..3
        pos += 1

        val_size = 1 if precision == 0 else 2
        total_vals = 64
        needed = total_vals * val_size

        if pos + needed > len(payload):
            res.structural_anomalies.append(
                f"Truncated DQT table {table_id}: required {needed} bytes, got {len(payload) - pos}."
            )
            break

        raw_zigzag = []
        if precision == 0:
            raw_zigzag = list(payload[pos:pos+64])
        else:
            raw_zigzag = list(struct.unpack(f">{total_vals}H", payload[pos:pos+needed]))
        pos += needed

        # Reconstruct 8x8 matrix in natural row-major order
        matrix_8x8 = [[0] * 8 for _ in range(8)]
        for k in range(64):
            idx = ZIGZAG_INDEX[k]
            row = idx // 8
            col = idx % 8
            matrix_8x8[row][col] = raw_zigzag[k]

        # Calculate table fingerprint (SHA-256 over raw zig-zag values)
        fp_bytes = struct.pack(f">{64}H", *raw_zigzag) if precision == 1 else bytes(raw_zigzag)
        table_fingerprint = hashlib.sha256(fp_bytes).hexdigest()

        # Inferred designation (0: Luminance, 1: Chrominance, etc.)
        desc = "Luminance (Y)" if table_id == 0 else ("Chrominance (Cb/Cr)" if table_id == 1 else f"Table {table_id}")

        res.dqt_tables.append({
            "table_id": table_id,
            "precision_bits": 16 if precision == 1 else 8,
            "description": desc,
            "segment_offset": segment_offset,
            "values_zigzag": raw_zigzag,
            "matrix_8x8": matrix_8x8,
            "fingerprint": table_fingerprint,
        })


def parse_dht_payload(payload: bytes, segment_offset: int, res: JPEGParseResult) -> None:
    """Parses DHT segment payload into Huffman code tables and code lengths."""
    pos = 0
    while pos < len(payload):
        if pos + 1 > len(payload):
            res.structural_anomalies.append(f"Truncated DHT header at segment offset {segment_offset + 2 + pos}.")
            break

        header = payload[pos]
        table_class_val = (header >> 4) & 0x0F  # 0 = DC, 1 = AC
        table_id = header & 0x0F               # 0..3
        table_class = "DC" if table_class_val == 0 else "AC"
        pos += 1

        if pos + 16 > len(payload):
            res.structural_anomalies.append(
                f"Truncated DHT table length counts at offset {segment_offset + 2 + pos}."
            )
            break

        code_lengths = list(payload[pos:pos+16])
        pos += 16
        total_symbols = sum(code_lengths)

        if pos + total_symbols > len(payload):
            res.structural_anomalies.append(
                f"Truncated DHT symbol table (ID {table_id}, {table_class}): expected {total_symbols} symbols, got {len(payload) - pos}."
            )
            break

        symbols = list(payload[pos:pos+total_symbols])
        pos += total_symbols

        # Deterministic SHA-256 fingerprint of canonical code structure
        fp_hasher = hashlib.sha256()
        fp_hasher.update(bytes([table_class_val, table_id]))
        fp_hasher.update(bytes(code_lengths))
        fp_hasher.update(bytes(symbols))
        fingerprint = fp_hasher.hexdigest()

        res.dht_tables.append({
            "table_class": table_class,
            "table_id": table_id,
            "segment_offset": segment_offset,
            "code_lengths": code_lengths,
            "symbols_count": total_symbols,
            "symbols": symbols,
            "fingerprint": fingerprint,
        })
