from PIL import Image
import numpy as np
from typing import List
from .schemas import QuantizationTable

class JPEGParser:
    @staticmethod
    def extract_quantization_tables(img: Image.Image) -> List[QuantizationTable]:
        tables = []
        q_tables = getattr(img, 'quantization', None)
        if q_tables and isinstance(q_tables, dict):
            for idx, q_list in q_tables.items():
                if isinstance(q_list, (list, tuple)):
                    arr = np.array(q_list)
                    if arr.size == 64:
                        tables.append(QuantizationTable(
                            table_index=idx,
                            values=list(q_list),
                            min_val=int(np.min(arr)),
                            max_val=int(np.max(arr)),
                            mean_val=float(np.mean(arr)),
                            median_val=float(np.median(arr)),
                            std_val=float(np.std(arr))
                        ))
        return tables
