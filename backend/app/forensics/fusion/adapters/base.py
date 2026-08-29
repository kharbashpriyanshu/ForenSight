from typing import List, Dict, Any

class BaseAdapter:
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        raise NotImplementedError
