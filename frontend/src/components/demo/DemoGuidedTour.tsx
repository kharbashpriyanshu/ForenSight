import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  Cpu, 
  SplitSquareVertical, 
  Network, 
  FileText, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

interface DemoGuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  id: string;
  badge: string;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  highlights: { title: string; desc: string }[];
  actionLabel?: string;
  actionRoute?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dossier',
    badge: 'CASE FS-DEMO-001 • INSTRUCTOR AUDIT',
    category: 'CASE DOSSIER',
    title: 'Investigation Dossier: Operation Mirrored Echo',
    subtitle: 'Synthetic Corporate Campaign Integrity Examination',
    description: 
      'Welcome to ForenSight. You are logged into the interactive demonstration environment pre-loaded with Case FS-DEMO-001. This investigation probes visual asset manipulation across a distributed multi-asset media campaign.',
    icon: <Layers size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Authentic Reference Master', desc: '1 unaltered studio camera capture with pristine sensor PRNU and CFA demosaicing.' },
      { title: '6 Spliced & Manipulated Assets', desc: 'Realistically modified files containing copy-move clones, spliced badges, and recompressed social media uploads.' },
      { title: 'Isolated Sandbox', desc: 'Safe deterministic testing environment with zero interference to active investigations.' }
    ],
    actionLabel: 'Explore Case Dossier',
    actionRoute: '/cases/FS-DEMO-001',
  },
  {
    id: 'custody',
    badge: 'ISO/IEC 27037 • EVIDENCE INTEGRITY',
    category: 'CHAIN OF CUSTODY',
    title: 'Cryptographic Custody & Bitstream Hashing',
    subtitle: 'Mathematical Immutability from Ingestion to Courtroom',
    description: 
      'Digital evidence handling requires verifiable mathematical immutability. Upon intake, ForenSight immediately fingerprints every visual bitstream with SHA-256 and logs chronological custody events.',
    icon: <ShieldCheck size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Immutable SHA-256 Fingerprint', desc: 'Calculated at the exact millisecond of upload. Any subsequent bit modification invalidates the custody log.' },
      { title: 'Self-Healing Cloud Storage', desc: 'Binary payloads persist in PostgreSQL bytea tables with automatic on-disk restoration across ephemeral container redeploys.' },
      { title: 'Forensic Audit Timeline', desc: 'Chronological tracking of every analyst access, verification decision, and processing event.' }
    ],
    actionLabel: 'Inspect Chain of Custody',
    actionRoute: '/cases/FS-DEMO-001/custody',
  },
  {
    id: 'engines',
    badge: '23 ENGINES • 6 EPISTEMIC CATEGORIES',
    category: 'FORENSIC WORKBENCH',
    title: 'Multi-Modal Scientific Analysis',
    subtitle: 'Comprehensive Signal Extraction without Black-Box Guesswork',
    description: 
      'ForenSight computes 23 deterministic mathematical and physical forensic signals across 6 epistemic categories, enabling thorough empirical examination rather than unexplainable neural guesswork.',
    icon: <Cpu size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Container & Compression', desc: 'Double-JPEG compression ghosting, Quantization matrix analysis, and EXIF provenance extraction.' },
      { title: 'Color & Spectrum', desc: 'Color Filter Array (CFA) demosaicing residuals and 2D FFT 4-quadrant power spectrum analysis.' },
      { title: 'Noise & Resampling', desc: 'Median filter residual analysis, Laplacian noise variance, and Radon transform interpolation detection.' },
      { title: 'Sensor & Camera PRNU', desc: 'Photo-Response Non-Uniformity sensor noise fingerprint identification across camera hardware.' },
      { title: 'Copy-Move & Clone Detection', desc: 'Dense DCT sliding-window block matching and ORB keypoint affine RANSAC consensus.' },
      { title: 'Physical & Lighting Geometry', desc: 'NOAA solar ephemeris astronomical azimuth calculation and 3D vanishing point perspective geometry.' }
    ],
    actionLabel: 'Examine Evidence Items',
    actionRoute: '/cases/FS-DEMO-001/evidence',
  },
  {
    id: 'microscopy',
    badge: 'SYNCHRONIZED LAB • DELTA WIPE SLIDER',
    category: 'COMPARATIVE ANALYSIS',
    title: 'Interactive Microscopy & Comparative Lab',
    subtitle: 'Synchronized Multi-Scale Loupe & Wipe Differences',
    description: 
      'Pinpointing subtle manipulation boundaries requires comparing suspicious imagery against authentic reference baselines in an synchronized comparative viewport.',
    icon: <SplitSquareVertical size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Dual Viewport Pan & Zoom', desc: 'Synchronized cursor navigation with high-magnification sub-pixel inspection loupe.' },
      { title: 'Interactive Wipe Slider', desc: 'Real-time horizontal wipe reveals localized pixel deltas and spliced boundary transitions.' },
      { title: 'Artifact Discrepancy Overlay', desc: 'Visualizes clone displacement vectors, noise inconsistencies, and compression boundary misalignments.' }
    ],
    actionLabel: 'Open Comparative Lab',
    actionRoute: '/cases/FS-DEMO-001/compare',
  },
  {
    id: 'graph',
    badge: 'FORCE-DIRECTED GRAPH • LINEAGE DAG',
    category: 'RELATIONSHIP MAPPING',
    title: 'Investigation Knowledge Graph & Lineage',
    subtitle: 'Multi-Evidence Derivation Trees & Camera Clusters',
    description: 
      'Digital evidence rarely exists in isolation. ForenSight maps the entire case ecosystem into an interactive force-directed epistemic graph to uncover hidden connections.',
    icon: <Network size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Hierarchical DAG Mode', desc: 'Traces parent-to-child derivation lineage (Master → Cropped Banner → Spliced Composite).' },
      { title: 'Evidence Clusters Mode', desc: 'Clusters assets automatically by camera PRNU sensor signatures and compression profiles.' },
      { title: 'Interactive Node Inspector', desc: 'Click any node to view connected links, scientific observations, and evidentiary findings.' }
    ],
    actionLabel: 'Explore Knowledge Graph',
    actionRoute: '/cases/FS-DEMO-001/graph',
  },
  {
    id: 'fusion',
    badge: 'SCIENTIFIC AXIOM • OBSERVATION ≠ PROOF',
    category: 'EPISTEMIC SYNTHESIS',
    title: 'Multi-Modal Epistemic Fusion & Court Reports',
    subtitle: 'Calibrated Confidence Scoring & Tamper-Evident Export',
    description: 
      'In forensic science, a single anomaly is merely an observation. ForenSight synthesizes all 23 analytical signals into an overarching calibrated confidence assessment and generates court-ready reports.',
    icon: <FileText size={22} className="tour-step-icon" />,
    highlights: [
      { title: 'Observation ≠ Proof Axiom', desc: 'Cross-validates physical lighting, sensor PRNU, and compression artifacts to eliminate false positives.' },
      { title: 'Calibrated Epistemic Scale', desc: 'Standardized assessment levels: Nominal, Inconclusive, Suspicious, Confirmed Anomaly.' },
      { title: 'ISO/IEC 27037 Court Reports', desc: 'One-click export of tamper-evident PDF investigation dossiers complete with SHA-256 hashes and analyst signatures.' }
    ],
    actionLabel: 'View Forensic Reports',
    actionRoute: '/cases/FS-DEMO-001/reports',
  },
];

export default function DemoGuidedTour({ isOpen, onClose }: DemoGuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      handleDismiss();
    } else if (e.key === 'ArrowRight') {
      setCurrentStep(prev => Math.min(prev + 1, TOUR_STEPS.length - 1));
    } else if (e.key === 'ArrowLeft') {
      setCurrentStep(prev => Math.max(prev - 1, 0));
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  const handleDismiss = () => {
    try {
      localStorage.setItem('forensight_demo_tour_dismissed', 'true');
    } catch {}
    onClose();
  };

  const handleNext = () => {
    if (isLastStep) {
      handleDismiss();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleActionClick = (route?: string) => {
    handleDismiss();
    if (route) {
      navigate(route);
    }
  };

  return (
    <div 
      className="demo-tour-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(10, 14, 20, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'demoFadeIn 0.2s ease-out',
      }}
    >
      <div 
        className="demo-tour-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-color-solid, #ffffff)',
          border: '1px solid var(--accent-border, rgba(184, 135, 42, 0.35))',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border-subtle)',
          overflow: 'hidden',
          animation: 'demoSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* MODAL HEADER */}
        <div style={{
          padding: '1.25rem 1.5rem 1rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-raised, #faf8f3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(184, 135, 42, 0.15)',
              color: 'var(--accent-color, #b8872a)',
            }}>
              <Sparkles size={18} />
            </span>
            <div>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--accent-color, #b8872a)',
              }}>
                {step.badge}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Interactive Forensic Tour • Step {currentStep + 1} of {TOUR_STEPS.length}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDismiss}
            aria-label="Close tour"
            title="Dismiss guided tour (reopen anytime via 'Demo Tour' in topbar)"
            style={{
              padding: '0.35rem',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{
          padding: '1.5rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}>
          {/* Step Title Area */}
          <div>
            <div style={{
              display: 'inline-block',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              background: 'rgba(184, 135, 42, 0.10)',
              color: 'var(--accent-text, #8c6214)',
              marginBottom: '0.4rem',
            }}>
              {step.category}
            </div>
            <h2 id="demo-tour-title" style={{
              margin: '0 0 0.35rem 0',
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              lineHeight: 1.3,
            }}>
              {step.title}
            </h2>
            <div style={{ fontSize: '0.88rem', color: 'var(--accent-text, #8c6214)', fontWeight: 500 }}>
              {step.subtitle}
            </div>
          </div>

          {/* Description */}
          <p style={{
            margin: 0,
            fontSize: '0.92rem',
            lineHeight: 1.6,
            color: 'var(--text-main)',
            opacity: 0.9,
          }}>
            {step.description}
          </p>

          {/* Highlights Box */}
          <div style={{
            background: 'var(--surface-sunken, #f4efe4)',
            border: '1px solid var(--border-default)',
            borderLeft: '4px solid var(--accent-color, #b8872a)',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              marginBottom: '0.2rem',
            }}>
              Core Capabilities & Highlights
            </div>
            {step.highlights.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--accent-color, #b8872a)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--text-main)' }}>{h.title}: </strong>
                  <span style={{ color: 'var(--text-muted)' }}>{h.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Action Link to direct workspace view */}
          {step.actionRoute && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              background: 'rgba(184, 135, 42, 0.07)',
              border: '1px dashed var(--accent-border, rgba(184, 135, 42, 0.35))',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Directly explore this feature in the current demo workspace:
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleActionClick(step.actionRoute)}
                style={{
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  color: 'var(--accent-text, #8c6214)',
                  borderColor: 'var(--accent-border)',
                }}
              >
                <span>{step.actionLabel || 'Jump to Feature'}</span>
                <ExternalLink size={13} />
              </button>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-raised, #faf8f3)',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          {/* Skip / Close option */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDismiss}
            style={{
              fontSize: '0.84rem',
              color: 'var(--text-muted)',
              border: 'none',
              background: 'transparent',
              padding: '0.4rem 0.6rem',
              cursor: 'pointer',
            }}
          >
            Skip Tour
          </button>

          {/* Step Indicator Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(idx)}
                aria-label={`Jump to step ${idx + 1}: ${s.title}`}
                title={`Step ${idx + 1}: ${s.category}`}
                style={{
                  width: idx === currentStep ? '22px' : '8px',
                  height: '8px',
                  borderRadius: '999px',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: idx === currentStep 
                    ? 'var(--accent-color, #b8872a)' 
                    : 'var(--border-default, #ccc)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrev}
              disabled={isFirstStep}
              style={{
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                opacity: isFirstStep ? 0.4 : 1,
                cursor: isFirstStep ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={16} />
              <span>Back</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              style={{
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'var(--accent-color, #b8872a)',
                borderColor: 'var(--accent-color, #b8872a)',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              <span>{isLastStep ? 'Finish & Explore Station' : 'Next Step'}</span>
              {isLastStep ? <CheckCircle2 size={15} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
