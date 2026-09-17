import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api';

interface AuthenticatedImageProps {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function AuthenticatedImage({ src, alt, style, className }: AuthenticatedImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!src) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    // Normalize endpoint: ensure it starts with /artifacts/
    const endpoint = src.startsWith('/artifacts/') ? src : `/artifacts/${src.replace(/^\/+/, '')}`;

    fetchApi(endpoint)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load artifact: ${res.status}`);
        }
        const blob = await res.blob();
        if (active) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem', textAlign: 'center', background: 'var(--surface-color)', borderRadius: '4px' }}>
        Loading forensic visualization...
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem', textAlign: 'center', fontStyle: 'italic', background: 'var(--surface-color)', borderRadius: '4px' }}>
        No visualization artifact was generated for this analysis.
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: '4px', ...style }}
      className={className}
    />
  );
}
