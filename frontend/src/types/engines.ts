/**
 * ForenSight V4 — Forensic Engine Extension Types
 * Clean TypeScript contract interfaces mirroring the backend extension architecture.
 */

export type EngineCategory =
  | 'FILE_ANALYSIS'
  | 'GLOBAL_ANALYSIS'
  | 'LOCAL_ANALYSIS'
  | 'CAMERA_IDENTIFICATION'
  | 'GEOMETRIC_ANALYSIS'
  | 'AI_SCREENING'
  | 'VIDEO_FORENSICS';

export type EngineExecutionStatus =
  | 'APPLIED'
  | 'COMPLETED'
  | 'NOT_APPLICABLE'
  | 'FAILED'
  | 'PENDING'
  | 'RUNNING';

export interface InputRequirements {
  supported_formats: string[];
  min_dimensions: [number, number];
  max_dimensions?: [number, number] | null;
  requires_color: boolean;
  requires_lossy_compression: boolean;
}

export interface ScientificReference {
  title: string;
  authors?: string | null;
  publication_venue?: string | null;
  year?: number | null;
  doi_or_url?: string | null;
  reference_type: 'PAPER' | 'BOOK' | 'STANDARD' | 'TECH_DOC' | 'VALIDATION_REPORT';
  notes?: string | null;
}

export interface EngineMetadata {
  engine_id: string;
  engine_name: string;
  engine_version: string;
  category: EngineCategory;
  description: string;
  input_requirements: InputRequirements;
  limitations: string[];
  scientific_references: ScientificReference[];
  parameter_schema?: Record<string, unknown>;
}

export interface PlannedEngineDescriptor {
  engine_id: string;
  engine_name: string;
  category: EngineCategory;
  target_version: string;
  status: 'PLANNED';
  description: string;
  target_formats: string[];
  input_requirements_summary: string;
  planned_capabilities: string[];
  scientific_rationale: string;
}

export interface NormalizedObservation {
  evidence_id: number;
  analysis_id?: number | null;
  engine_id: string;
  engine_version: string;
  status: EngineExecutionStatus;
  observation_type: string;
  metric_name: string;
  raw_value: string;
  normalized_value?: number | null;
  direction: 'elevated' | 'consistent' | 'informational';
  technical_reliability: 'HIGH' | 'MEDIUM' | 'CONDITIONAL';
  interpretation: string;
  limitations: string[];
  result_data: Record<string, unknown>;
  parameters_used: Record<string, unknown>;
  created_at: string;
}

export interface EngineArtifactMetadata {
  artifact_id: string;
  evidence_id: number;
  analysis_id?: number | null;
  engine_id: string;
  engine_version: string;
  artifact_type: 'HEATMAP' | 'PLOT' | 'VISUALIZATION' | 'MASK' | 'SPECTRUM' | 'TABLE' | 'JSON' | 'DERIVED_IMAGE';
  storage_path: string;
  sha256_hash: string;
  mime_type: string;
  width?: number | null;
  height?: number | null;
  created_at: string;
}
