import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Copy, 
  Check, 
  ArrowRight, 
  FolderArchive, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw
} from 'lucide-react';
import { fetchApi } from '../api';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface ValidationResult {
  valid: boolean;
  title: string;
  explanation: string;
  nextStep: string;
}

interface CaseItem {
  id: number;
  case_identifier: string;
  title: string;
  status: string;
}

interface IngestSuccessData {
  id: number;
  case_id: number;
  case_identifier: string;
  original_filename: string;
  sha256_hash: string;
  image_format: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  created_at: string;
}

export default function EvidenceIntake() {
  const { caseId: paramCaseId } = useParams<{ caseId?: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; megapixels: string } | null>(null);
  const [validationError, setValidationError] = useState<ValidationResult | null>(null);

  // Case association state
  const [activeCaseIdentifier, setActiveCaseIdentifier] = useState<string>(paramCaseId || '');
  const [activeCaseTitle, setActiveCaseTitle] = useState<string>('');
  const [availableCases, setAvailableCases] = useState<CaseItem[]>([]);
  const [caseMode, setCaseMode] = useState<'existing' | 'new'>(paramCaseId ? 'existing' : 'new');
  const [newCaseTitle, setNewCaseTitle] = useState<string>('');

  // Optional Provenance / Context
  const [showOptionalContext, setShowOptionalContext] = useState<boolean>(false);
  const [sourcePlatform, setSourcePlatform] = useState<string>('');
  const [acquisitionMethod, setAcquisitionMethod] = useState<string>('');
  const [receivedFrom, setReceivedFrom] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>('');
  const [reportedCaptureTime, setReportedCaptureTime] = useState<string>('');
  const [sourceReferenceUrl, setSourceReferenceUrl] = useState<string>('');
  const [intakeNotes, setIntakeNotes] = useState<string>('');

  // Submission & Success state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string>('');
  const [successResult, setSuccessResult] = useState<IngestSuccessData | null>(null);
  const [hashCopied, setHashCopied] = useState<boolean>(false);

  // Beginner guidance toggle
  const [showGuidance, setShowGuidance] = useState<boolean>(false);

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Load case details or list of cases
  useEffect(() => {
    if (paramCaseId) {
      setActiveCaseIdentifier(paramCaseId);
      fetchApi(`/cases/${paramCaseId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.title) {
            setActiveCaseTitle(data.title);
          }
        })
        .catch(err => console.error("Error loading case info:", err));
    } else {
      fetchApi('/cases?limit=50')
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          const caseList = Array.isArray(data) ? data : [];
          setAvailableCases(caseList);
          if (caseList.length > 0) {
            setActiveCaseIdentifier(caseList[0].case_identifier);
            setActiveCaseTitle(caseList[0].title);
          } else {
            setCaseMode('new');
          }
        })
        .catch(err => console.error("Error loading case list:", err));
    }
  }, [paramCaseId]);

  // Update default case title when file is selected in "new" mode
  useEffect(() => {
    if (caseMode === 'new' && file && !newCaseTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setNewCaseTitle(`Investigation: ${cleanName}`);
    }
  }, [file, caseMode, newCaseTitle]);

  const validateFile = (selectedFile: File): ValidationResult | null => {
    const filename = selectedFile.name.toLowerCase();
    const ext = filename.substring(filename.lastIndexOf('.'));

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        title: 'Unsupported File Format',
        explanation: `Selected file "${selectedFile.name}" has an unsupported extension (${ext || 'none'}). ForenSight requires raster images with standard encoding.`,
        nextStep: 'Please select a JPEG (.jpg, .jpeg), PNG (.png), or WebP (.webp) image file.'
      };
    }

    if (selectedFile.type && !ALLOWED_MIME_TYPES.includes(selectedFile.type.toLowerCase())) {
      return {
        valid: false,
        title: 'Unsupported MIME Type',
        explanation: `Declared MIME type "${selectedFile.type}" does not match forensic analysis requirements.`,
        nextStep: 'Ensure the image is a valid image/jpeg, image/png, or image/webp binary.'
      };
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        title: 'File Exceeds Size Limit',
        explanation: `Selected file is ${sizeMB} MB, exceeding ForenSight's maximum single evidence limit of 10 MB.`,
        nextStep: 'Select a file smaller than 10 MB, or tile/crop large sensor captures before intake.'
      };
    }

    if (selectedFile.size === 0) {
      return {
        valid: false,
        title: 'Empty File',
        explanation: 'The selected file contains 0 bytes and cannot be ingested as digital evidence.',
        nextStep: 'Verify the file integrity on your filesystem and select a non-empty image.'
      };
    }

    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerError('');
    setValidationError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate extension, MIME, size
    const validation = validateFile(selected);
    if (validation) {
      setValidationError(validation);
      setFile(null);
      setImageMeta(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }

    // Generate local non-destructive preview & test image readability
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const newUrl = URL.createObjectURL(selected);
    setPreviewUrl(newUrl);
    setFile(selected);

    const testImg = new Image();
    testImg.onload = () => {
      const w = testImg.naturalWidth;
      const h = testImg.naturalHeight;
      const mp = ((w * h) / 1_000_000).toFixed(2);
      setImageMeta({ width: w, height: h, megapixels: mp });
    };
    testImg.onerror = () => {
      // Browser graphics engine cannot render client preview; backend will perform authoritative inspection
      setImageMeta(null);
    };
    testImg.src = newUrl;
  };

  const handleCopyHash = () => {
    if (successResult?.sha256_hash) {
      navigator.clipboard.writeText(successResult.sha256_hash);
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setValidationError({
        valid: false,
        title: 'No File Selected',
        explanation: 'Please select an image file to begin evidence intake.',
        nextStep: 'Click "Browse Files" to choose a JPEG, PNG, or WebP image.'
      });
      return;
    }

    setIsSubmitting(true);
    setServerError('');

    try {
      let targetCaseIdentifier = activeCaseIdentifier;

      // 1. If user chose to create a new case, initialize it first
      if (caseMode === 'new' && !paramCaseId) {
        const titleToUse = newCaseTitle.trim() || `Investigation: ${file.name.replace(/\.[^/.]+$/, '')}`;
        const caseRes = await fetchApi('/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: titleToUse,
            intake_notes: intakeNotes.trim() || 'Initialized via guided image intake.',
          }),
        });

        const caseData = await caseRes.json();
        if (!caseRes.ok) {
          throw new Error(caseData.detail || 'Failed to initialize investigation dossier');
        }
        targetCaseIdentifier = caseData.case_identifier;
      }

      if (!targetCaseIdentifier) {
        throw new Error('An active investigation case is required to associate evidence.');
      }

      // 2. Upload file to case evidence intake endpoint
      const formData = new FormData();
      formData.append('case_id', targetCaseIdentifier);
      formData.append('file', file);
      formData.append('source_platform', sourcePlatform.trim());
      formData.append('acquisition_method', acquisitionMethod.trim());
      formData.append('received_from', receivedFrom.trim());
      formData.append('received_at', receivedAt.trim());
      formData.append('reported_capture_time', reportedCaptureTime.trim());
      formData.append('source_reference_url', sourceReferenceUrl.trim());
      formData.append('intake_notes', intakeNotes.trim());

      const res = await fetchApi(`/cases/${targetCaseIdentifier}/evidence`, {
        method: 'POST',
        body: formData,
      }, 120000);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Evidence intake failed on server.');
      }

      // Ingestion succeeded!
      setSuccessResult({
        ...data,
        case_identifier: targetCaseIdentifier,
      });
    } catch (err: any) {
      console.error('Intake submission error:', err);
      setServerError(err.message || 'Network error during evidence upload and hashing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1rem 0 3rem 0' }}>
      {/* SUCCESS CONFIRMATION STATE */}
      {successResult ? (
        <div className="card" style={{ borderTop: '4px solid #16a34a', padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ 
              width: '42px', 
              height: '42px', 
              borderRadius: '50%', 
              background: 'rgba(22, 163, 74, 0.12)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#16a34a' 
            }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Evidence Registered & Cryptographically Fingerprinted
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.1rem 0 0 0' }}>
                Intake Complete: Evidence #{successResult.id}
              </h2>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            The evidence binary was stored bit-for-bit in secure storage. An immutable cryptographic SHA-256 digest was computed, and the intake transaction has been logged to the case audit ledger.
          </p>

          <div style={{ 
            background: 'var(--surface-sunken)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            padding: '1.25rem', 
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Original Filename
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem', wordBreak: 'break-all' }}>
                {successResult.original_filename}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Format & Geometry
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {successResult.image_format || 'IMAGE'} • {successResult.width} × {successResult.height} px
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                File Size
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {formatBytes(successResult.file_size)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Investigation Case
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-color)', marginTop: '0.2rem' }}>
                {successResult.case_identifier}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Cryptographic SHA-256 Digest (Chain of Custody Key)
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                background: 'var(--surface-color)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '6px', 
                padding: '0.5rem 0.75rem' 
              }}>
                <code style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', flex: 1, color: 'var(--text-main)' }}>
                  {successResult.sha256_hash}
                </code>
                <button 
                  type="button" 
                  onClick={handleCopyHash}
                  className="secondary-button"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  title="Copy SHA-256 Hash"
                >
                  {hashCopied ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                  <span>{hashCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button 
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/cases/${successResult.case_identifier}/evidence/${successResult.id}`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
            >
              <span>Proceed to Forensic Examination</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate(`/cases/${successResult.case_identifier}/evidence`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem' }}
            >
              <FolderArchive size={15} />
              <span>View Case Evidence Files</span>
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSuccessResult(null);
                setFile(null);
                setImageMeta(null);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setNewCaseTitle('');
              }}
              style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
            >
              + Ingest Another Image
            </button>
          </div>
        </div>
      ) : (
        /* INTAKE FORM INTERFACE */
        <form onSubmit={handleSubmit}>
          {/* Header & Orientation */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="context-pill context-pill-case" style={{ height: '22px' }}>
                FORENSIC EVIDENCE INTAKE
              </span>
              {paramCaseId && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Case: <strong>{paramCaseId}</strong>
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.025em', margin: 0 }}>
              Evidence Acquisition & Registration
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
              Select an unaltered raster image for forensic examination. ForenSight verifies the file structure, calculates an immutable SHA-256 digest, and associates the record with your investigation dossier.
            </p>
          </div>

          {/* Beginner Guidance Box (Collapsible) */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            padding: '0.85rem 1rem', 
            marginBottom: '1.25rem' 
          }}>
            <button 
              type="button" 
              onClick={() => setShowGuidance(!showGuidance)}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                padding: 0, 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
                fontWeight: 600
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Info size={16} style={{ color: 'var(--accent-color)' }} />
                <span>Forensic Intake Guide — What happens during evidence acquisition?</span>
              </span>
              {showGuidance ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showGuidance && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
                gap: '0.85rem', 
                marginTop: '0.85rem', 
                paddingTop: '0.85rem', 
                borderTop: '1px solid var(--border-color-translucent)',
                fontSize: '0.8rem',
                color: 'var(--text-muted)'
              }}>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.2rem' }}>
                    1. Original File Preservation
                  </strong>
                  The original image submitted for examination. ForenSight writes the byte stream untouched into an isolated store with zero recompression or re-encoding.
                </div>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.2rem' }}>
                    2. Cryptographic SHA-256 Hash
                  </strong>
                  A unique 256-bit digital fingerprint computed immediately. If even one pixel is altered later, the hash diverges, proving tampering or degradation.
                </div>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.2rem' }}>
                    3. Chain-of-Custody Logging
                  </strong>
                  The intake event, acquisition method, and operator identity are immutably logged into the audit ledger before analysis engines are executed.
                </div>
              </div>
            )}
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.08)', 
              border: '1px solid rgba(239, 68, 68, 0.4)', 
              borderRadius: '8px', 
              padding: '1rem', 
              marginBottom: '1.25rem' 
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', fontWeight: 700, color: '#ef4444' }}>
                    {validationError.title}
                  </h4>
                  <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.825rem', color: 'var(--text-main)' }}>
                    {validationError.explanation}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <strong>Next step:</strong> {validationError.nextStep}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Server Error Banner */}
          {serverError && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.08)', 
              border: '1px solid rgba(239, 68, 68, 0.4)', 
              borderRadius: '8px', 
              padding: '1rem', 
              marginBottom: '1.25rem',
              color: '#ef4444',
              fontSize: '0.85rem'
            }}>
              <strong>Server Intake Error:</strong> {serverError}
            </div>
          )}

          {/* SECTION 1: FILE SELECTION & PREVIEW */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '1rem' }}>
                1. Evidence File Selection <span style={{ color: '#ef4444' }}>*</span>
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Required
              </span>
            </div>

            {/* Hidden native input for accessible OS file picker */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {!file ? (
              <div style={{ 
                border: '1px dashed var(--border-color)', 
                borderRadius: '8px', 
                padding: '2.5rem 1.5rem', 
                textAlign: 'center',
                background: 'var(--surface-color-light)'
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  background: 'var(--surface-color)', 
                  border: '1px solid var(--border-color)', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: 'var(--accent-color)',
                  marginBottom: '1rem'
                }}>
                  <FileUp size={22} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 700 }}>
                  Select an image from your device
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
                  ForenSight ingests raw JPEG, PNG, and WebP files. The exact byte stream will be preserved untouched for forensic analysis.
                </p>

                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.25rem' }}
                >
                  <FileUp size={16} />
                  <span>Browse Files</span>
                </button>

                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Accepted: <strong>.jpg, .jpeg, .png, .webp</strong> • Maximum: <strong>10 MB</strong>
                </div>
              </div>
            ) : (
              /* Selected Image Verification Card */
              <div style={{ 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                padding: '1.25rem', 
                background: 'var(--surface-color-light)'
              }}>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {previewUrl && (
                    <div style={{ 
                      width: '160px', 
                      height: '110px', 
                      background: 'var(--surface-sunken)', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)', 
                      overflow: 'hidden', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <img 
                        src={previewUrl} 
                        alt="Evidence Preview" 
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 800, 
                        color: '#16a34a', 
                        background: 'rgba(22, 163, 74, 0.12)', 
                        padding: '0.15rem 0.5rem', 
                        borderRadius: '9999px',
                        textTransform: 'uppercase'
                      }}>
                        Verified for Ingest
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {file.type || 'image/raw'}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 700, wordBreak: 'break-all' }}>
                      {file.name}
                    </h3>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Size: <strong>{formatBytes(file.size)}</strong></span>
                      {imageMeta && (
                        <span>Dimensions: <strong>{imageMeta.width} × {imageMeta.height} px</strong> ({imageMeta.megapixels} MP)</span>
                      )}
                    </div>

                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Original binary preserved untouched • Ready for SHA-256 fingerprinting
                    </p>
                  </div>

                  <div>
                    <button 
                      type="button" 
                      className="secondary-button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    >
                      Change File
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: CASE ASSOCIATION */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '1rem' }}>
                2. Investigation Case Association <span style={{ color: '#ef4444' }}>*</span>
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Required for isolation & audit ledger
              </span>
            </div>

            {paramCaseId ? (
              /* Pre-associated from workspace route */
              <div style={{ 
                background: 'var(--surface-color-light)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '6px', 
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Active Investigation Dossier
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    <code>{paramCaseId}</code> {activeCaseTitle && `— ${activeCaseTitle}`}
                  </div>
                </div>
                <span className="status-badge" style={{ fontSize: '0.7rem' }}>Locked</span>
              </div>
            ) : (
              /* Global entry: Choose to create new or attach to existing */
              <div>
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input 
                      type="radio" 
                      name="caseMode" 
                      checked={caseMode === 'new'} 
                      onChange={() => setCaseMode('new')} 
                    />
                    <strong>Create new investigation dossier</strong>
                  </label>

                  {availableCases.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                      <input 
                        type="radio" 
                        name="caseMode" 
                        checked={caseMode === 'existing'} 
                        onChange={() => setCaseMode('existing')} 
                      />
                      <span>Attach to existing case</span>
                    </label>
                  )}
                </div>

                {caseMode === 'new' ? (
                  <div>
                    <input 
                      type="text" 
                      placeholder="Investigation Title (e.g., Target Image Examination or Reference ID)"
                      value={newCaseTitle}
                      onChange={e => setNewCaseTitle(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '0.55rem 0.85rem', 
                        borderRadius: '6px', 
                        border: '1px solid var(--border-color)', 
                        background: 'var(--surface-color)', 
                        color: 'var(--text-main)',
                        fontSize: '0.875rem'
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      A dedicated forensic workspace will be initialized automatically for this evidence item.
                    </div>
                  </div>
                ) : (
                  <div>
                    <select 
                      value={activeCaseIdentifier}
                      onChange={e => setActiveCaseIdentifier(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '0.55rem 0.85rem', 
                        borderRadius: '6px', 
                        border: '1px solid var(--border-color)', 
                        background: 'var(--surface-color)', 
                        color: 'var(--text-main)',
                        fontSize: '0.875rem'
                      }}
                    >
                      {availableCases.map(c => (
                        <option key={c.id} value={c.case_identifier}>
                          {c.case_identifier} — {c.title}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      The evidence file will be appended to this existing dossier's chain of custody.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: OPTIONAL PROVENANCE & CONTEXT */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <button 
              type="button" 
              onClick={() => setShowOptionalContext(!showOptionalContext)}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                padding: 0, 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div>
                <h2 className="card-title" style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>3. Acquisition & Provenance Context</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Record origin metadata, handling methods, and source claims for forensic reports
                </div>
              </div>
              {showOptionalContext ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showOptionalContext && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color-translucent)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Source Platform
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g., WhatsApp, Email attachment, CCTV export"
                      value={sourcePlatform}
                      onChange={e => setSourcePlatform(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Acquisition Method
                    </label>
                    <select 
                      value={acquisitionMethod}
                      onChange={e => setAcquisitionMethod(e.target.value)}
                    >
                      <option value="">Select method (optional)</option>
                      <option value="ORIGINAL_FILE">Original file</option>
                      <option value="FORWARDED_FILE">Forwarded file</option>
                      <option value="SCREENSHOT">Screenshot capture</option>
                      <option value="WEB_DOWNLOAD">Web download</option>
                      <option value="OTHER">Other / Undefined</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Received From
                    </label>
                    <input 
                      type="text" 
                      placeholder="Individual, agency, or device ID"
                      value={receivedFrom}
                      onChange={e => setReceivedFrom(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Received Timestamp
                    </label>
                    <input 
                      type="datetime-local" 
                      value={receivedAt}
                      onChange={e => setReceivedAt(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Reported Capture Time
                    </label>
                    <input 
                      type="text" 
                      placeholder="Time reported by claimant (keep raw)"
                      value={reportedCaptureTime}
                      onChange={e => setReportedCaptureTime(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Source Reference URL
                    </label>
                    <input 
                      type="url" 
                      placeholder="https://..."
                      value={sourceReferenceUrl}
                      onChange={e => setSourceReferenceUrl(e.target.value)}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Acquisition Notes
                    </label>
                    <textarea 
                      rows={2}
                      placeholder="Any initial physical or transmission observations..."
                      value={intakeNotes}
                      onChange={e => setIntakeNotes(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SUBMISSION ACTION */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              <ShieldCheck size={16} style={{ color: '#16a34a' }} />
              <span>Evidence integrity verified via bitwise streaming SHA-256</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="secondary-button"
                onClick={() => navigate(paramCaseId ? `/cases/${paramCaseId}/evidence` : '/cases')}
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!file || isSubmitting}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.65rem 1.4rem',
                  fontWeight: 700
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Preserving received file and computing SHA-256…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Preserve file & start intake record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
