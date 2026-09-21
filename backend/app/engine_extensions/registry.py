"""
ForenSight V4 — Forensic Engine Registry

Provides a centralized discovery and registration mechanism for forensic analytical engines.
Maintains an in-memory catalog of active, verified engines as well as the planned future manifest.
Does NOT automatically trigger execution; execution remains controlled by the analysis job architecture.
"""

from typing import Dict, List, Optional, Type
from .contract import BaseForensicEngine, ApplicabilityResult, ExecutionContext
from .categories import EngineCategory
from .manifest import PLANNED_FUTURE_ENGINES, PlannedEngineDescriptor


class ForensicEngineRegistry:
    """
    Central discovery registry for analytical forensic engines.
    """
    _instance: Optional["ForensicEngineRegistry"] = None

    def __init__(self):
        self._engines: Dict[str, BaseForensicEngine] = {}

    @classmethod
    def get_instance(cls) -> "ForensicEngineRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, engine: BaseForensicEngine) -> None:
        """
        Registers an active forensic engine.
        Overwriting is prohibited unless version is greater.
        """
        if not isinstance(engine, BaseForensicEngine):
            raise TypeError("Engine must inherit from BaseForensicEngine")

        engine_id = engine.engine_id.upper()
        if engine_id in self._engines:
            existing = self._engines[engine_id]
            if existing.engine_version == engine.engine_version:
                # Idempotent re-registration of exact same version is allowed
                self._engines[engine_id] = engine
                return
        self._engines[engine_id] = engine

    def unregister(self, engine_id: str) -> bool:
        """
        Removes an engine from the registry.
        """
        engine_id = engine_id.upper()
        if engine_id in self._engines:
            del self._engines[engine_id]
            return True
        return False

    def get_engine(self, engine_id: str) -> Optional[BaseForensicEngine]:
        """
        Retrieves a registered engine by its unique ID.
        """
        return self._engines.get(engine_id.upper())

    def list_engines(self, category: Optional[EngineCategory] = None) -> List[BaseForensicEngine]:
        """
        Returns all registered engines, optionally filtered by category.
        """
        engines = list(self._engines.values())
        if category:
            engines = [e for e in engines if e.category == category]
        return engines

    def filter_by_format(self, container_format: str) -> List[BaseForensicEngine]:
        """
        Returns registered engines capable of analyzing the specified container format.
        """
        fmt = container_format.upper()
        matching = []
        for engine in self._engines.values():
            supported = [f.upper() for f in engine.input_requirements.supported_formats]
            if "ALL" in supported or fmt in supported:
                matching.append(engine)
        return matching

    def check_applicability(self, engine_id: str, context: ExecutionContext) -> ApplicabilityResult:
        """
        Checks applicability of an engine against an execution context without executing.
        """
        engine = self.get_engine(engine_id)
        if not engine:
            return ApplicabilityResult.inapplicable(
                engine_id=engine_id,
                reason=f"Engine '{engine_id}' is not registered in the system.",
                target_format=context.image_format,
                required_format="Registered Engine"
            )
        return engine.check_applicability(context)

    def get_planned_manifest(self) -> List[PlannedEngineDescriptor]:
        """
        Returns the catalog of planned future engines.
        """
        return PLANNED_FUTURE_ENGINES

    def clear(self) -> None:
        """
        Clears registered engines (primarily for isolated test fixtures).
        """
        self._engines.clear()


# Global singleton helper
engine_registry = ForensicEngineRegistry.get_instance()
