import React from 'react';

interface InitializationScreenProps {
  /** Short contextual status message during genuine bootstrap or session restoration */
  statusMessage?: string;
  /** Genuine measurable progress (0-100). If omitted, renders an indeterminate indicator without fake percentages. */
  progress?: number;
}

export const InitializationScreen: React.FC<InitializationScreenProps> = ({
  statusMessage = 'Initializing investigation environment',
  progress,
}) => {
  const hasDeterminateProgress = typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100;

  return (
    <div
      className="fs-init-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusMessage}
    >
      <div className="fs-init-card">
        <div className="fs-init-emblem-wrap" aria-hidden="true">
          <div className="fs-init-scan-ring" />
          <img
            src="/forensight-icon.svg"
            alt=""
            width={72}
            height={72}
            className="fs-init-icon"
          />
        </div>

        <div className="fs-init-wordmark">ForenSight</div>
        <div className="fs-init-tagline">Digital Forensic Platform</div>

        <div
          className="fs-init-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasDeterminateProgress ? Math.round(progress) : undefined}
          aria-label="Initialization progress"
        >
          {hasDeterminateProgress ? (
            <div
              className="fs-init-progress-bar-determinate"
              style={{ width: `${Math.round(progress)}%` }}
            />
          ) : (
            <div className="fs-init-progress-bar-indeterminate" />
          )}
        </div>

        <div className="fs-init-status">
          {statusMessage}
          {hasDeterminateProgress ? ` (${Math.round(progress)}%)` : ''}
        </div>
      </div>
    </div>
  );
};

export default InitializationScreen;

