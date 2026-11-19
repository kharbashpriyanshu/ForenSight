import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Microscope, ShieldCheck, X } from 'lucide-react';

interface ForensicLabTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  title: string;
  description: string;
  target: string;
}

interface TargetRect {
  id: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const STEPS: TourStep[] = [
  {
    title: 'Choose a working style',
    description: 'Guided Investigation suggests compatible starting examinations. Analyst Workbench gives you direct control over engine selection.',
    target: 'lab-mode-switch',
  },
  {
    title: 'Check the evidence and its status',
    description: 'This summary shows the file, format, SHA-256 fingerprint, and examination progress. The custody and credential checks are above.',
    target: 'lab-evidence-summary',
  },
  {
    title: 'Find compatible examinations',
    description: 'Search by engine ID or keyword and filter by category. Format support is shown in the workbench, and incompatible methods cannot be queued.',
    target: 'lab-analyst-filters',
  },
  {
    title: 'Select and run examinations',
    description: 'Review each method, compatibility, and run status. Select compatible examinations and queue individual methods or a batch; findings still require examiner review.',
    target: 'lab-engine-list',
  },
  {
    title: 'Review the result summary',
    description: 'Completed runs, observations, failures, skipped tests, and spatial regions are summarized here. An anomaly is an observation—not proof of manipulation.',
    target: 'lab-results-metrics',
  },
  {
    title: 'Move between result views',
    description: 'Explore the overview, spatial attention map, plain-language interpretations, consolidated observations, and report preview.',
    target: 'lab-results-views',
  },
  {
    title: 'Open a forensic modality',
    description: 'These tabs organize the deeper tools: heatmap, microscopy, physics and geometry, compression, color, noise, cloning, camera and sensor, or all modalities.',
    target: 'lab-workbench-navigation',
  },
  {
    title: 'Inspect spatial signals',
    description: 'In Overview & Attention Heatmap, adjust overlay opacity and toggle ELA, noise, and clone layers. These visualizations help direct review; interpret them with the evidence and method limitations.',
    target: 'lab-heatmap-panel',
  },
];

const SPOTLIGHT_PADDING = 8;

export default function ForensicLabTour({ isOpen, onClose }: ForensicLabTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const [position, setPosition] = useState<{ targetId: string; left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const step = STEPS[currentStep];
  const activeTarget = target?.id === step.target ? target : null;
  const activePosition = position?.targetId === step.target ? position : null;

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;
    if (event.key === 'Escape') handleClose();
    else if (event.key === 'ArrowRight') setCurrentStep(index => Math.min(index + 1, STEPS.length - 1));
    else if (event.key === 'ArrowLeft') setCurrentStep(index => Math.max(index - 1, 0));
  }, [handleClose, isOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!isOpen) return;
    const targetId = step.target;
    const selector = `[data-tour-target="${targetId}"]`;
    let frameId = 0;

    const updateTarget = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        setTarget(previous => previous?.id === targetId ? null : previous);
        return;
      }

      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setTarget(previous => previous?.id === targetId ? null : previous);
        return;
      }
      setTarget({
        id: targetId,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    };

    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateTarget);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    frameId = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
      updateTarget();
    });
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [isOpen, step.target]);

  useLayoutEffect(() => {
    if (!isOpen || !activeTarget || !cardRef.current) return;
    const card = cardRef.current.getBoundingClientRect();
    const margin = 16;
    let left: number;
    let top: number;

    if (activeTarget.width > window.innerWidth * 0.6) {
      left = window.innerWidth - card.width - margin;
      top = Math.min(activeTarget.top + margin, window.innerHeight - card.height - margin);
    } else if (window.innerWidth - activeTarget.right >= card.width + margin * 2) {
      left = activeTarget.right + margin;
      top = activeTarget.top + activeTarget.height / 2 - card.height / 2;
    } else if (activeTarget.left >= card.width + margin * 2) {
      left = activeTarget.left - card.width - margin;
      top = activeTarget.top + activeTarget.height / 2 - card.height / 2;
    } else {
      left = Math.max(margin, Math.min(activeTarget.left, window.innerWidth - card.width - margin));
      top = activeTarget.bottom + margin;
      if (top + card.height > window.innerHeight - margin) top = activeTarget.top - card.height - margin;
    }

    setPosition({
      targetId: step.target,
      left: Math.max(margin, Math.min(left, window.innerWidth - card.width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - card.height - margin)),
    });
  }, [activeTarget, currentStep, isOpen, step.target]);

  if (!isOpen) return null;

  const spotlight = activeTarget ? {
    top: Math.max(0, activeTarget.top - SPOTLIGHT_PADDING),
    left: Math.max(0, activeTarget.left - SPOTLIGHT_PADDING),
    right: Math.min(window.innerWidth, activeTarget.right + SPOTLIGHT_PADDING),
    bottom: Math.min(window.innerHeight, activeTarget.bottom + SPOTLIGHT_PADDING),
  } : null;
  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1300,
    background: 'rgba(10, 14, 20, 0.64)',
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: spotlight ? 'transparent' : 'rgba(10, 14, 20, 0.64)',
        animation: 'demoFadeIn 0.2s ease-out',
      }}
    >
      {spotlight && (
        <>
          <div aria-hidden="true" style={{ ...backdropStyle, top: 0, left: 0, width: '100vw', height: spotlight.top }} />
          <div aria-hidden="true" style={{ ...backdropStyle, top: spotlight.bottom, left: 0, width: '100vw', height: Math.max(0, window.innerHeight - spotlight.bottom) }} />
          <div aria-hidden="true" style={{ ...backdropStyle, top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.bottom - spotlight.top }} />
          <div aria-hidden="true" style={{ ...backdropStyle, top: spotlight.top, left: spotlight.right, width: Math.max(0, window.innerWidth - spotlight.right), height: spotlight.bottom - spotlight.top }} />
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.right - spotlight.left,
              height: spotlight.bottom - spotlight.top,
              border: '2px solid var(--accent-color, #b8872a)',
              borderRadius: '8px',
              pointerEvents: 'none',
              zIndex: 1301,
            }}
          />
        </>
      )}

      <section
        ref={cardRef}
        className="demo-tour-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forensic-lab-tour-title"
        aria-describedby="forensic-lab-tour-description"
        style={{
          position: 'fixed',
          zIndex: 1302,
          width: 'min(360px, calc(100vw - 2rem))',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          border: '1px solid var(--accent-border, rgba(184, 135, 42, 0.35))',
          borderRadius: '14px',
          background: 'var(--surface-color-solid, #ffffff)',
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
          ...(activePosition
            ? { left: activePosition.left, top: activePosition.top }
            : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }),
        }}
      >
        <div style={{
          padding: '0.8rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
          background: 'var(--surface-raised, #faf8f3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span style={{
              width: '30px',
              height: '30px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              background: 'rgba(184, 135, 42, 0.15)',
              color: 'var(--accent-color, #b8872a)',
            }}>
              <Microscope size={17} />
            </span>
            <div>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--accent-color, #b8872a)' }}>
                FORENSIC LAB
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {currentStep + 1} of {STEPS.length} · <ShieldCheck size={11} style={{ verticalAlign: 'middle' }} /> Evidence-first analysis
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            aria-label="Close Forensic Lab tour"
            style={{ padding: '0.3rem', display: 'inline-flex', borderRadius: '7px' }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '1rem' }}>
          <h2 id="forensic-lab-tour-title" style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-main)' }}>
            {step.title}
          </h2>
          <p id="forensic-lab-tour-description" style={{ margin: '0.45rem 0 0', fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {step.description}
          </p>
        </div>

        <div style={{
          padding: '0.7rem 0.9rem',
          borderTop: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          background: 'var(--surface-raised, #faf8f3)',
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            style={{ fontSize: '0.78rem', color: 'var(--text-muted)', border: 'none', background: 'transparent', padding: '0.35rem 0.45rem' }}
          >
            Close tour
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {STEPS.map((item, index) => (
              <button
                key={item.target}
                type="button"
                onClick={() => setCurrentStep(index)}
                aria-label={`Go to Forensic Lab tour step ${index + 1}: ${item.title}`}
                aria-current={index === currentStep ? 'step' : undefined}
                style={{
                  width: index === currentStep ? '18px' : '6px',
                  height: '6px',
                  border: 0,
                  borderRadius: '999px',
                  padding: 0,
                  cursor: 'pointer',
                  background: index === currentStep ? 'var(--accent-color, #b8872a)' : 'var(--border-default, #ccc)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCurrentStep(index => Math.max(index - 1, 0))}
              disabled={currentStep === 0}
              aria-label="Previous Forensic Lab tour step"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0.35rem', opacity: currentStep === 0 ? 0.45 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => currentStep === STEPS.length - 1 ? handleClose() : setCurrentStep(index => index + 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.4rem 0.65rem',
                fontSize: '0.8rem',
                background: 'var(--accent-color, #b8872a)',
                borderColor: 'var(--accent-color, #b8872a)',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              <span>{currentStep === STEPS.length - 1 ? 'Done' : 'Next'}</span>
              {currentStep < STEPS.length - 1 && <ChevronRight size={15} />}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
