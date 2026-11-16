import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  FileUp,
  Layers,
  Network,
  ShieldCheck,
  Sparkles,
  SplitSquareVertical,
  X,
} from 'lucide-react';

interface DemoGuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

type TourFlow = 'workspace' | 'image';

interface TourStep {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  route?: string;
  target?: string;
}

interface TargetRect {
  target: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const WELCOME_STEP: TourStep = {
  id: 'welcome',
  category: 'WELCOME',
  title: 'Welcome to ForenSight',
  description: 'Take a quick tour of the demo, or choose how you want to begin.',
  icon: <Sparkles size={18} />,
};

const CHOICE_STEP: TourStep = {
  id: 'choice',
  category: 'CHOOSE A PATH',
  title: 'Where would you like to begin?',
  description: 'Continue an existing demo investigation, or start with an image of your own.',
  icon: <Compass size={18} />,
  route: '/cases',
  target: 'demo-tour-entry-options',
};

const WORKSPACE_STEPS: TourStep[] = [
  {
    id: 'overview',
    category: 'CASE OVERVIEW',
    title: 'Start with the case dossier',
    description: 'The demo case keeps its summary, status, and key actions together. Open its evidence when you are ready to examine files.',
    icon: <Layers size={18} />,
    route: '/cases/FS-DEMO-001',
    target: 'open-evidence',
  },
  {
    id: 'evidence',
    category: 'EVIDENCE LIBRARY',
    title: 'Review the evidence',
    description: 'Check registered images, integrity hashes, and analysis status. Select an item to inspect its results.',
    icon: <Sparkles size={18} />,
    route: '/cases/FS-DEMO-001/evidence',
    target: 'evidence-library',
  },
  {
    id: 'custody',
    category: 'CHAIN OF CUSTODY',
    title: 'Verify evidence integrity',
    description: 'Trace acquisition and analyst actions in the custody ledger, and verify evidence hashes.',
    icon: <ShieldCheck size={18} />,
    route: '/cases/FS-DEMO-001/custody',
    target: 'chain-of-custody',
  },
  {
    id: 'comparison',
    category: 'COMPARATIVE ANALYSIS',
    title: 'Compare evidence side by side',
    description: 'Use synchronized zoom and the wipe control to inspect differences between two evidence items.',
    icon: <SplitSquareVertical size={18} />,
    route: '/cases/FS-DEMO-001/compare',
    target: 'evidence-comparison',
  },
  {
    id: 'graph',
    category: 'INVESTIGATION GRAPH',
    title: 'Explore evidence relationships',
    description: 'Pan and zoom the graph to follow relationships between case evidence, findings, and reports.',
    icon: <Network size={18} />,
    route: '/cases/FS-DEMO-001/graph',
    target: 'investigation-graph',
  },
  {
    id: 'reports',
    category: 'REPORTS & EXPORTS',
    title: 'Create a case report',
    description: 'Generate a forensic PDF dossier or export structured examination data for review.',
    icon: <FileText size={18} />,
    route: '/cases/FS-DEMO-001/reports',
    target: 'forensic-reports',
  },
];

const IMAGE_STEPS: TourStep[] = [
  {
    id: 'image-upload',
    category: 'IMAGE INTAKE',
    title: 'Choose an image to examine',
    description: 'ForenSight preserves the original file and calculates its SHA-256 fingerprint during intake.',
    icon: <FileUp size={18} />,
    route: '/cases/intake',
    target: 'image-intake-upload',
  },
  {
    id: 'image-case',
    category: 'CASE ASSOCIATION',
    title: 'Choose where the evidence belongs',
    description: 'Associate the image with an existing investigation or create a case. You can add acquisition details before submitting.',
    icon: <Layers size={18} />,
    route: '/cases/intake',
    target: 'image-intake-case',
  },
  {
    id: 'image-context',
    category: 'ACQUISITION CONTEXT',
    title: 'Record optional context',
    description: 'Add reported capture or transmission details separately from the forensic measurements.',
    icon: <FileText size={18} />,
    route: '/cases/intake',
    target: 'image-intake-context',
  },
];

const SPOTLIGHT_PADDING = 8;

export default function DemoGuidedTour({ isOpen, onClose }: DemoGuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [flow, setFlow] = useState<TourFlow | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ target: string; left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const flowSteps = flow === 'workspace' ? WORKSPACE_STEPS : IMAGE_STEPS;
  const steps = [WELCOME_STEP, CHOICE_STEP, ...flowSteps];
  const step = steps[currentStep] ?? WELCOME_STEP;
  const activeTargetRect = targetRect?.target === step.target ? targetRect : null;
  const activePopoverPosition = popoverPosition?.target === step.target ? popoverPosition : null;
  const isWelcome = currentStep === 0;
  const isPathChoice = currentStep === 1;
  const isFirstStep = isWelcome;
  const isLastStep = flow !== null && currentStep === steps.length - 1;
  const stepLabel = isWelcome || isPathChoice
    ? `Getting started · ${currentStep + 1} of 2`
    : `${flow === 'workspace' ? 'Workspace' : 'Image intake'} · ${currentStep - 1} of ${flowSteps.length}`;

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem('forensight_demo_tour_dismissed', 'true');
    } catch {
      // The tour can still be dismissed when browser storage is unavailable.
    }
    setCurrentStep(0);
    setFlow(null);
    onClose();
  }, [onClose]);

  const changeStep = useCallback((nextStep: number) => {
    const lastStep = flow ? flowSteps.length + 1 : 1;
    setCurrentStep(Math.max(0, Math.min(nextStep, lastStep)));
  }, [flow, flowSteps.length]);

  const chooseFlow = useCallback((selectedFlow: TourFlow) => {
    setFlow(selectedFlow);
    setCurrentStep(2);
    navigate(selectedFlow === 'workspace' ? WORKSPACE_STEPS[0].route! : IMAGE_STEPS[0].route!);
  }, [navigate]);

  const handleNext = useCallback(() => {
    if (isWelcome) {
      changeStep(1);
      if (location.pathname !== '/cases') navigate('/cases');
    } else if (isLastStep) {
      handleDismiss();
    } else if (!isPathChoice) {
      changeStep(currentStep + 1);
    }
  }, [changeStep, currentStep, handleDismiss, isLastStep, isPathChoice, isWelcome, location.pathname, navigate]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      handleDismiss();
    } else if (event.key === 'ArrowRight' && !isPathChoice) {
      handleNext();
    } else if (event.key === 'ArrowLeft') {
      changeStep(currentStep - 1);
    }
  }, [changeStep, currentStep, handleDismiss, handleNext, isOpen, isPathChoice]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen && step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [isOpen, location.pathname, navigate, step.route]);

  useEffect(() => {
    if (!isOpen || !step.target) return;

    const targetName = step.target;
    let frameId = 0;
    const selector = `[data-tour-target="${targetName}"]`;
    const updateTarget = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) {
        setTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setTargetRect(previous => previous?.target === targetName ? null : previous);
        return;
      }

      setTargetRect({
        target: targetName,
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
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
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
  }, [isOpen, location.pathname, step.target]);

  useLayoutEffect(() => {
    if (!isOpen || !activeTargetRect || !step.target || !popoverRef.current) return;

    const popover = popoverRef.current.getBoundingClientRect();
    const margin = 16;
    const isLargeTarget = activeTargetRect.width > window.innerWidth * 0.6;
    let left: number;
    let top: number;

    if (isLargeTarget) {
      left = window.innerWidth - popover.width - margin;
      top = Math.min(activeTargetRect.top + margin, window.innerHeight - popover.height - margin);
    } else if (window.innerWidth - activeTargetRect.right >= popover.width + margin * 2) {
      left = activeTargetRect.right + margin;
      top = activeTargetRect.top + activeTargetRect.height / 2 - popover.height / 2;
    } else if (activeTargetRect.left >= popover.width + margin * 2) {
      left = activeTargetRect.left - popover.width - margin;
      top = activeTargetRect.top + activeTargetRect.height / 2 - popover.height / 2;
    } else {
      left = Math.max(margin, Math.min(activeTargetRect.left, window.innerWidth - popover.width - margin));
      top = activeTargetRect.bottom + margin;
      if (top + popover.height > window.innerHeight - margin) {
        top = activeTargetRect.top - popover.height - margin;
      }
    }

    setPopoverPosition({
      target: step.target,
      left: Math.max(margin, Math.min(left, window.innerWidth - popover.width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - popover.height - margin)),
    });
  }, [activeTargetRect, currentStep, isOpen, step.target]);

  if (!isOpen) return null;

  const spotlight = activeTargetRect ? {
    top: Math.max(0, activeTargetRect.top - SPOTLIGHT_PADDING),
    left: Math.max(0, activeTargetRect.left - SPOTLIGHT_PADDING),
    right: Math.min(window.innerWidth, activeTargetRect.right + SPOTLIGHT_PADDING),
    bottom: Math.min(window.innerHeight, activeTargetRect.bottom + SPOTLIGHT_PADDING),
  } : null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1200,
    background: 'rgba(10, 14, 20, 0.64)',
  };

  return (
    <div
      className="demo-tour-overlay"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
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
              boxShadow: '0 0 0 2px rgba(184, 135, 42, 0.2)',
              pointerEvents: 'none',
              zIndex: 1201,
            }}
          />
        </>
      )}

      <section
        ref={popoverRef}
        className="demo-tour-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
        aria-describedby="demo-tour-description"
        style={{
          position: 'fixed',
          zIndex: 1202,
          width: 'min(360px, calc(100vw - 2rem))',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-color-solid, #ffffff)',
          border: '1px solid var(--accent-border, rgba(184, 135, 42, 0.35))',
          borderRadius: '14px',
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
          animation: 'demoSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          ...(activePopoverPosition
            ? { left: activePopoverPosition.left, top: activePopoverPosition.top }
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
              flexShrink: 0,
              borderRadius: '8px',
              background: 'rgba(184, 135, 42, 0.15)',
              color: 'var(--accent-color, #b8872a)',
            }}>
              {step.icon}
            </span>
            <div>
              <div style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: 'var(--accent-color, #b8872a)',
              }}>
                {step.category}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Demo tour · {stepLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDismiss}
            aria-label="Close tour"
            style={{ padding: '0.3rem', display: 'inline-flex', borderRadius: '7px' }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '1rem' }}>
          <h2 id="demo-tour-title" style={{
            margin: 0,
            fontSize: '1.05rem',
            lineHeight: 1.35,
            color: 'var(--text-main)',
          }}>
            {step.title}
          </h2>
          <p id="demo-tour-description" style={{
            margin: '0.45rem 0 0',
            fontSize: '0.84rem',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
          }}>
            {step.description}
          </p>

          {isPathChoice && (
            <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.9rem' }}>
              <button
                type="button"
                onClick={() => chooseFlow('workspace')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  width: '100%',
                  padding: '0.7rem',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '9px',
                  background: 'var(--surface-raised, #faf8f3)',
                  color: 'var(--text-main)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <Layers size={17} color="var(--accent-color, #b8872a)" />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.82rem' }}>Continue with active workspace</strong>
                  <span style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Explore demo case FS-DEMO-001
                  </span>
                </span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => chooseFlow('image')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  width: '100%',
                  padding: '0.7rem',
                  border: '1px solid var(--border-default)',
                  borderRadius: '9px',
                  background: 'var(--surface-color-solid, #ffffff)',
                  color: 'var(--text-main)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <FileUp size={17} color="var(--accent-color, #b8872a)" />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.82rem' }}>Start with an image</strong>
                  <span style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    See the evidence intake workflow
                  </span>
                </span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
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
            onClick={handleDismiss}
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              border: 'none',
              background: 'transparent',
              padding: '0.35rem 0.45rem',
            }}
          >
            Skip tour
          </button>

          {flow && currentStep >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {flowSteps.map((tourStep, index) => (
                <button
                  key={tourStep.id}
                  type="button"
                  onClick={() => changeStep(index + 2)}
                  aria-label={`Go to step ${index + 1}: ${tourStep.category}`}
                  aria-current={index + 2 === currentStep ? 'step' : undefined}
                  style={{
                    width: index + 2 === currentStep ? '18px' : '6px',
                    height: '6px',
                    border: 0,
                    borderRadius: '999px',
                    padding: 0,
                    cursor: 'pointer',
                    background: index + 2 === currentStep ? 'var(--accent-color, #b8872a)' : 'var(--border-default, #ccc)',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => changeStep(currentStep - 1)}
              disabled={isFirstStep}
              aria-label="Previous tour step"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0.35rem', opacity: isFirstStep ? 0.45 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            {!isPathChoice && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
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
                <span>{isLastStep ? 'Done' : 'Next'}</span>
                {!isLastStep && <ChevronRight size={15} />}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
