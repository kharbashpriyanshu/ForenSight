import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, Sliders, Eye, Layers, 
  Maximize2, Download, Split, Crosshair, Sparkles, Play, Pause
} from 'lucide-react';
import { fetchApi } from '../../api';

interface InteractiveVisualInspectionProps {
  evidenceId: number;
  filename: string;
}

type FilterMode = 
  | 'original' 
  | 'level_sweep' 
  | 'bit_plane' 
  | 'color_channel' 
  | 'gradient_sobel' 
  | 'clahe_contrast' 
  | 'noise_residual';

type ColorChannel = 'red' | 'green' | 'blue' | 'luminance_y' | 'chroma_cb' | 'chroma_cr' | 'invert';

export const InteractiveVisualInspection: React.FC<InteractiveVisualInspectionProps> = ({
  evidenceId,
  filename
}) => {
  // Source image state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Viewport Transform State (Pan & Zoom)
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filter Configuration
  const [filterMode, setFilterMode] = useState<FilterMode>('original');
  const [levelMin, setLevelMin] = useState<number>(0);
  const [levelMax, setLevelMax] = useState<number>(40);
  const [levelHighlightColor, setLevelHighlightColor] = useState<string>('#b8872a');
  const [autoSweepActive, setAutoSweepActive] = useState<boolean>(false);
  const [bitPlane, setBitPlane] = useState<number>(0); // 0 = LSB, 7 = MSB
  const [selectedChannel, setSelectedChannel] = useState<ColorChannel>('blue');
  const [sobelThreshold, setSobelThreshold] = useState<number>(30);
  const [contrastBoost, setContrastBoost] = useState<number>(2.0);

  // Split-Wipe Curtain Mode
  const [splitWipeActive, setSplitWipeActive] = useState<boolean>(false);
  const [splitPosition, setSplitPosition] = useState<number>(50); // percentage 0 - 100

  // Loupe Magnifier State
  const [loupeActive, setLoupeActive] = useState<boolean>(false);
  const [loupePower, setLoupePower] = useState<number>(4); // 2x, 4x, 8x, 16x
  const [loupeSize, setLoupeSize] = useState<number>(200); // diameter in px
  const [loupeFilter, setLoupeFilter] = useState<FilterMode>('gradient_sobel');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [pixelInfo, setPixelInfo] = useState<{ x: number; y: number; r: number; g: number; b: number; a: number; hex: string } | null>(null);

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const autoSweepIntervalRef = useRef<any>(null);

  // 1. Fetch raw authenticated image
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetchApi(`/evidence/${evidenceId}/raw`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Evidence retrieval failed (${res.status})`);
        const blob = await res.blob();
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setImageSrc(objectUrl);
          
          const img = new Image();
          img.onload = () => {
            if (active) {
              imageElementRef.current = img;
              setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              
              // Pre-render to offline raw canvas
              const offCanvas = document.createElement('canvas');
              offCanvas.width = img.naturalWidth;
              offCanvas.height = img.naturalHeight;
              const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
              if (offCtx) {
                offCtx.drawImage(img, 0, 0);
                rawCanvasRef.current = offCanvas;
              }
              setLoading(false);
            }
          };
          img.src = objectUrl;
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Failed to load evidence bitstream');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (autoSweepIntervalRef.current) clearInterval(autoSweepIntervalRef.current);
    };
  }, [evidenceId]);

  // 2. Auto-Sweep Timer
  useEffect(() => {
    if (autoSweepActive && filterMode === 'level_sweep') {
      autoSweepIntervalRef.current = setInterval(() => {
        setLevelMin(prev => {
          const next = (prev + 5) % 245;
          setLevelMax(next + 35);
          return next;
        });
      }, 150);
    } else {
      if (autoSweepIntervalRef.current) {
        clearInterval(autoSweepIntervalRef.current);
        autoSweepIntervalRef.current = null;
      }
    }
    return () => {
      if (autoSweepIntervalRef.current) clearInterval(autoSweepIntervalRef.current);
    };
  }, [autoSweepActive, filterMode]);

  // 3. Pixel Processing Pipeline
  const applyFilterToImageData = useCallback((
    srcData: ImageData, 
    targetData: ImageData, 
    mode: FilterMode, 
    width: number, 
    height: number
  ) => {
    const src = srcData.data;
    const dst = targetData.data;
    const len = src.length;

    if (mode === 'original') {
      dst.set(src);
      return;
    }

    if (mode === 'level_sweep') {
      // Hex to RGB for highlight
      const rH = parseInt(levelHighlightColor.slice(1, 3), 16) || 184;
      const gH = parseInt(levelHighlightColor.slice(3, 5), 16) || 135;
      const bH = parseInt(levelHighlightColor.slice(5, 7), 16) || 42;

      for (let i = 0; i < len; i += 4) {
        const lum = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
        if (lum >= levelMin && lum <= levelMax) {
          // Highlight in band
          dst[i] = rH;
          dst[i + 1] = gH;
          dst[i + 2] = bH;
          dst[i + 3] = 255;
        } else {
          // Attenuated monochrome backdrop
          const att = Math.floor(lum * 0.25);
          dst[i] = att;
          dst[i + 1] = att;
          dst[i + 2] = att;
          dst[i + 3] = 255;
        }
      }
      return;
    }

    if (mode === 'bit_plane') {
      const mask = 1 << bitPlane;
      for (let i = 0; i < len; i += 4) {
        const rBit = (src[i] & mask) ? 255 : 0;
        const gBit = (src[i + 1] & mask) ? 255 : 0;
        const bBit = (src[i + 2] & mask) ? 255 : 0;
        // Output as high contrast grayscale
        const mono = (rBit || gBit || bBit) ? 255 : 0;
        dst[i] = mono;
        dst[i + 1] = mono;
        dst[i + 2] = mono;
        dst[i + 3] = 255;
      }
      return;
    }

    if (mode === 'color_channel') {
      for (let i = 0; i < len; i += 4) {
        const r = src[i];
        const g = src[i + 1];
        const b = src[i + 2];

        if (selectedChannel === 'red') {
          dst[i] = r; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 255;
        } else if (selectedChannel === 'green') {
          dst[i] = 0; dst[i + 1] = g; dst[i + 2] = 0; dst[i + 3] = 255;
        } else if (selectedChannel === 'blue') {
          dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = b; dst[i + 3] = 255;
        } else if (selectedChannel === 'luminance_y') {
          const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          dst[i] = y; dst[i + 1] = y; dst[i + 2] = y; dst[i + 3] = 255;
        } else if (selectedChannel === 'chroma_cb') {
          const cb = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
          dst[i] = cb; dst[i + 1] = cb; dst[i + 2] = 255 - cb; dst[i + 3] = 255;
        } else if (selectedChannel === 'chroma_cr') {
          const cr = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
          dst[i] = cr; dst[i + 1] = 255 - cr; dst[i + 2] = cr; dst[i + 3] = 255;
        } else if (selectedChannel === 'invert') {
          dst[i] = 255 - r; dst[i + 1] = 255 - g; dst[i + 2] = 255 - b; dst[i + 3] = 255;
        }
      }
      return;
    }

    if (mode === 'gradient_sobel') {
      // 3x3 Sobel edge derivative
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0, j = 0; i < len; i += 4, j++) {
        lum[j] = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
      }

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          // Sobel X kernel: [-1 0 1, -2 0 2, -1 0 1]
          const gx = 
            (-1 * lum[idx - width - 1]) + (1 * lum[idx - width + 1]) +
            (-2 * lum[idx - 1])         + (2 * lum[idx + 1]) +
            (-1 * lum[idx + width - 1]) + (1 * lum[idx + width + 1]);

          // Sobel Y kernel: [-1 -2 -1, 0 0 0, 1 2 1]
          const gy = 
            (-1 * lum[idx - width - 1]) + (-2 * lum[idx - width]) + (-1 * lum[idx - width + 1]) +
            ( 1 * lum[idx + width - 1]) + ( 2 * lum[idx + width]) + ( 1 * lum[idx + width + 1]);

          const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
          const val = mag > sobelThreshold ? mag : 0;

          const outIdx = (y * width + x) * 4;
          dst[outIdx] = val;
          dst[outIdx + 1] = val > 128 ? 200 : val;
          dst[outIdx + 2] = val;
          dst[outIdx + 3] = 255;
        }
      }
      return;
    }

    if (mode === 'clahe_contrast') {
      // Local contrast boost & gamma curve
      for (let i = 0; i < len; i += 4) {
        for (let c = 0; c < 3; c++) {
          let v = src[i + c] / 255.0;
          v = Math.pow(v, 1.0 / contrastBoost);
          dst[i + c] = Math.min(255, Math.max(0, Math.round(v * 255)));
        }
        dst[i + 3] = 255;
      }
      return;
    }

    if (mode === 'noise_residual') {
      // High-pass 3x3 Laplacian residual
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = (y * width + x) * 4;
          const pUp = ((y - 1) * width + x) * 4;
          const pDown = ((y + 1) * width + x) * 4;
          const pLeft = (y * width + (x - 1)) * 4;
          const pRight = (y * width + (x + 1)) * 4;

          for (let c = 0; c < 3; c++) {
            const lap = Math.abs(
              4 * src[p + c] - src[pUp + c] - src[pDown + c] - src[pLeft + c] - src[pRight + c]
            ) * 3.5;
            dst[p + c] = Math.min(255, Math.round(lap));
          }
          dst[p + 3] = 255;
        }
      }
      return;
    }

    dst.set(src);
  }, [levelMin, levelMax, levelHighlightColor, bitPlane, selectedChannel, sobelThreshold, contrastBoost]);

  // 4. Render Main Canvas with Split Curtain
  const renderMainCanvas = useCallback(() => {
    const canvas = mainCanvasRef.current;
    const rawCanvas = rawCanvasRef.current;
    if (!canvas || !rawCanvas || !imgNaturalSize.width) return;

    const ctx = canvas.getContext('2d');
    const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !rawCtx) return;

    const w = imgNaturalSize.width;
    const h = imgNaturalSize.height;

    canvas.width = w;
    canvas.height = h;

    const rawImgData = rawCtx.getImageData(0, 0, w, h);

    if (filterMode === 'original' && !splitWipeActive) {
      ctx.putImageData(rawImgData, 0, 0);
      return;
    }

    const filteredImgData = ctx.createImageData(w, h);
    applyFilterToImageData(rawImgData, filteredImgData, filterMode, w, h);

    if (!splitWipeActive) {
      ctx.putImageData(filteredImgData, 0, 0);
    } else {
      // Split Wipe: Left = Original, Right = Filtered
      const splitX = Math.round((w * splitPosition) / 100);
      const splitData = ctx.createImageData(w, h);
      const rawD = rawImgData.data;
      const filtD = filteredImgData.data;
      const splitD = splitData.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (x < splitX) {
            splitD[idx] = rawD[idx];
            splitD[idx + 1] = rawD[idx + 1];
            splitD[idx + 2] = rawD[idx + 2];
            splitD[idx + 3] = 255;
          } else {
            splitD[idx] = filtD[idx];
            splitD[idx + 1] = filtD[idx + 1];
            splitD[idx + 2] = filtD[idx + 2];
            splitD[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(splitData, 0, 0);

      // Draw Curtain Divider Line
      ctx.save();
      ctx.strokeStyle = '#b8872a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, h);
      ctx.stroke();

      // Divider Handle Badge
      ctx.fillStyle = '#1c2b3a';
      ctx.fillRect(splitX - 32, h / 2 - 14, 64, 28);
      ctx.strokeStyle = '#f5f0e2';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(splitX - 32, h / 2 - 14, 64, 28);
      ctx.fillStyle = '#f5f0e2';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SPLIT', splitX, h / 2);
      ctx.restore();
    }
  }, [imgNaturalSize, filterMode, splitWipeActive, splitPosition, applyFilterToImageData]);

  useEffect(() => {
    renderMainCanvas();
  }, [renderMainCanvas]);

  // 5. Render Floating Loupe Magnifier
  const renderLoupe = useCallback(() => {
    if (!loupeActive || cursorPos.x < 0 || cursorPos.y < 0) return;
    const loupeCanvas = loupeCanvasRef.current;
    const rawCanvas = rawCanvasRef.current;
    if (!loupeCanvas || !rawCanvas || !imgNaturalSize.width) return;

    const loupeCtx = loupeCanvas.getContext('2d');
    const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
    if (!loupeCtx || !rawCtx) return;

    loupeCanvas.width = loupeSize;
    loupeCanvas.height = loupeSize;

    const sampleRadius = Math.round(loupeSize / (2 * loupePower));
    const sx = Math.max(0, Math.min(imgNaturalSize.width - 2 * sampleRadius, cursorPos.x - sampleRadius));
    const sy = Math.max(0, Math.min(imgNaturalSize.height - 2 * sampleRadius, cursorPos.y - sampleRadius));
    const sWidth = Math.min(2 * sampleRadius, imgNaturalSize.width - sx);
    const sHeight = Math.min(2 * sampleRadius, imgNaturalSize.height - sy);

    const patchData = rawCtx.getImageData(sx, sy, sWidth, sHeight);
    
    // Process patch according to loupeFilter
    const filteredPatch = loupeCtx.createImageData(sWidth, sHeight);
    applyFilterToImageData(patchData, filteredPatch, loupeFilter, sWidth, sHeight);

    // Create temporary canvas to scale up with nearest-neighbor crisp pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sWidth;
    tempCanvas.height = sHeight;
    tempCanvas.getContext('2d')?.putImageData(filteredPatch, 0, 0);

    loupeCtx.save();
    // Circular clip
    loupeCtx.beginPath();
    loupeCtx.arc(loupeSize / 2, loupeSize / 2, loupeSize / 2 - 2, 0, Math.PI * 2);
    loupeCtx.clip();

    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.drawImage(tempCanvas, 0, 0, loupeSize, loupeSize);

    // Crosshair in center
    loupeCtx.strokeStyle = 'rgba(184, 135, 42, 0.75)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.moveTo(loupeSize / 2 - 12, loupeSize / 2);
    loupeCtx.lineTo(loupeSize / 2 + 12, loupeSize / 2);
    loupeCtx.moveTo(loupeSize / 2, loupeSize / 2 - 12);
    loupeCtx.lineTo(loupeSize / 2, loupeSize / 2 + 12);
    loupeCtx.stroke();

    loupeCtx.restore();
  }, [loupeActive, cursorPos, loupePower, loupeSize, loupeFilter, imgNaturalSize, applyFilterToImageData]);

  useEffect(() => {
    renderLoupe();
  }, [renderLoupe]);

  // 6. Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }

    const container = containerRef.current;
    if (!container || !imgNaturalSize.width) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to natural image pixel coordinates
    const imgX = Math.round((mouseX - pan.x) / scale);
    const imgY = Math.round((mouseY - pan.y) / scale);

    if (imgX >= 0 && imgX < imgNaturalSize.width && imgY >= 0 && imgY < imgNaturalSize.height) {
      setCursorPos({ x: imgX, y: imgY });

      // Sample Pixel Data
      const rawCanvas = rawCanvasRef.current;
      if (rawCanvas) {
        const ctx = rawCanvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const p = ctx.getImageData(imgX, imgY, 1, 1).data;
          const hex = `#${((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1).toUpperCase()}`;
          setPixelInfo({ x: imgX, y: imgY, r: p[0], g: p[1], b: p[2], a: p[3], hex });
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(16, Math.max(0.2, scale * zoomFactor));
    setScale(newScale);
  };

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // 7. Export Snapshot
  const handleExportSnapshot = () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    // Create export canvas with metadata stamp
    const expCanvas = document.createElement('canvas');
    expCanvas.width = canvas.width;
    expCanvas.height = canvas.height + 40;
    const ctx = expCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1c2b3a';
    ctx.fillRect(0, 0, expCanvas.width, expCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    // Metadata header text
    ctx.fillStyle = '#f5f0e2';
    ctx.font = '12px monospace';
    ctx.fillText(
      `FORENSIGHT INSPECTION | ${filename} | Filter: ${filterMode.toUpperCase()} | Date: ${new Date().toISOString()}`,
      16,
      canvas.height + 25
    );

    const a = document.createElement('a');
    a.download = `forensight_${filename}_${filterMode}.png`;
    a.href = expCanvas.toDataURL('image/png');
    a.click();
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-color)', fontWeight: 700, marginBottom: '0.5rem' }}>
          Loading Authenticated Evidence Bitstream...
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Preparing high-resolution Canvas pipeline for interactive microscopic inspection
        </div>
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className="card" style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ef4444' }}>Inspection Bitstream Error</h4>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{error || 'Unable to access raw image.'}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ 
              fontSize: '0.70rem', 
              fontWeight: 800, 
              background: 'rgba(184, 135, 42, 0.12)', 
              color: '#92560a', 
              padding: '0.15rem 0.5rem', 
              borderRadius: '9999px',
              border: '1px solid rgba(184, 135, 42, 0.28)'
            }}>
              INTERACTIVE MICROSCOPY STATION
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Native Resolution: {imgNaturalSize.width} × {imgNaturalSize.height} px
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>High-Precision Visual Forensic Inspection</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Real-time dynamic level sweeping, bit-plane dissection, color channel isolation, and precision loupe magnification.
          </div>
        </div>

        {/* Global Toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => setScale(s => Math.min(16, s * 1.3))}
            title="Zoom In"
            style={{ padding: '0.4rem 0.65rem' }}
          >
            <ZoomIn size={15} />
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setScale(s => Math.max(0.2, s / 1.3))}
            title="Zoom Out"
            style={{ padding: '0.4rem 0.65rem' }}
          >
            <ZoomOut size={15} />
          </button>
          <button 
            className="btn btn-secondary"
            onClick={resetView}
            title="Reset Pan & Zoom"
            style={{ padding: '0.4rem 0.65rem', gap: '0.3rem', fontSize: '0.75rem' }}
          >
            <RotateCcw size={14} /> {Math.round(scale * 100)}%
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleExportSnapshot}
            title="Export Evidence Snapshot"
            style={{ padding: '0.4rem 0.75rem', gap: '0.35rem', fontSize: '0.75rem' }}
          >
            <Download size={14} /> Snapshot
          </button>
        </div>
      </div>

      {/* Control Console (Tabs & Mode Selectors) */}
      <div style={{ 
        background: 'var(--surface-color-light)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '10px', 
        padding: '0.85rem 1rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '0.85rem' 
      }}>
        {/* Mode Selector Buttons */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '0.3rem' }}>
            Filter Engine:
          </span>
          {[
            { id: 'original', label: 'True Bitstream', icon: Eye },
            { id: 'level_sweep', label: 'Level Sweep', icon: Sliders },
            { id: 'bit_plane', label: 'Bit-Plane Slicer', icon: Layers },
            { id: 'color_channel', label: 'Channel Isolator', icon: Sparkles },
            { id: 'gradient_sobel', label: 'Sobel Derivative', icon: Maximize2 },
            { id: 'clahe_contrast', label: 'Contrast Boost', icon: Sliders },
            { id: 'noise_residual', label: 'Noise Residual', icon: Crosshair },
          ].map(m => {
            const isSel = filterMode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setFilterMode(m.id as FilterMode)}
                style={{
                  padding: '0.32rem 0.7rem',
                  fontSize: '0.75rem',
                  fontWeight: isSel ? 700 : 500,
                  borderRadius: '6px',
                  border: isSel ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                  background: isSel ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.75)',
                  color: isSel ? '#fff9ee' : 'var(--text-body)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={13} /> {m.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Mode-Specific Parameter Sliders */}
        {filterMode === 'level_sweep' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Tonal Range:</span>
              <code style={{ background: '#f5efe4' }}>[{levelMin} — {levelMax}] / 255</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
              <label>Min:</label>
              <input 
                type="range" min="0" max="250" value={levelMin} 
                onChange={e => setLevelMin(Math.min(parseInt(e.target.value), levelMax - 2))}
                style={{ width: '90px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
              <label>Max:</label>
              <input 
                type="range" min="5" max="255" value={levelMax} 
                onChange={e => setLevelMax(Math.max(parseInt(e.target.value), levelMin + 2))}
                style={{ width: '90px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
              <label>Highlight Tint:</label>
              <input 
                type="color" value={levelHighlightColor} 
                onChange={e => setLevelHighlightColor(e.target.value)}
                style={{ width: '28px', height: '24px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
              />
            </div>
            <button 
              className="btn btn-secondary"
              onClick={() => setAutoSweepActive(a => !a)}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', gap: '0.35rem' }}
            >
              {autoSweepActive ? <Pause size={13} color="#ef4444" /> : <Play size={13} color="#10b981" />}
              {autoSweepActive ? 'Stop Sweep' : 'Auto Sweep Band'}
            </button>
          </div>
        )}

        {filterMode === 'bit_plane' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Active Bit Plane:</span>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(b => (
              <button
                key={b}
                onClick={() => setBitPlane(b)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: bitPlane === b ? 700 : 500,
                  borderRadius: '4px',
                  background: bitPlane === b ? 'var(--primary-color)' : '#fff',
                  color: bitPlane === b ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                Bit {b} {b === 0 ? '(LSB)' : b === 7 ? '(MSB)' : ''}
              </button>
            ))}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              (Bit 0 LSB isolates subtle sensor noise and steganographic payload structures)
            </span>
          </div>
        )}

        {filterMode === 'color_channel' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Channel Decomposition:</span>
            {[
              { id: 'blue', label: 'Blue Channel (Sensor Noise)' },
              { id: 'green', label: 'Green Channel (Sharpest)' },
              { id: 'red', label: 'Red Channel' },
              { id: 'luminance_y', label: 'YCbCr: Y (Luminance)' },
              { id: 'chroma_cb', label: 'YCbCr: Cb (Chroma Blue)' },
              { id: 'chroma_cr', label: 'YCbCr: Cr (Chroma Red)' },
              { id: 'invert', label: 'Invert Color Spectrum' },
            ].map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedChannel(c.id as ColorChannel)}
                style={{
                  padding: '0.22rem 0.6rem',
                  fontSize: '0.74rem',
                  fontWeight: selectedChannel === c.id ? 700 : 500,
                  borderRadius: '4px',
                  background: selectedChannel === c.id ? 'var(--primary-color)' : '#fff',
                  color: selectedChannel === c.id ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {filterMode === 'gradient_sobel' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Sobel Noise Gate:</span>
            <input 
              type="range" min="0" max="150" value={sobelThreshold} 
              onChange={e => setSobelThreshold(parseInt(e.target.value))}
              style={{ width: '120px' }}
            />
            <code style={{ fontSize: '0.75rem' }}>Threshold: {sobelThreshold}</code>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Highlights high-frequency edge discontinuities across cut-and-paste donor boundaries.
            </span>
          </div>
        )}

        {filterMode === 'clahe_contrast' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Gamma & Contrast Boost:</span>
            <input 
              type="range" min="0.5" max="5.0" step="0.1" value={contrastBoost} 
              onChange={e => setContrastBoost(parseFloat(e.target.value))}
              style={{ width: '120px' }}
            />
            <code style={{ fontSize: '0.75rem' }}>{contrastBoost.toFixed(1)}x</code>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Stretches dynamic range in deep shadows and overexposed highlights to reveal hidden silhouettes.
            </span>
          </div>
        )}

        {/* Viewport Secondary Controls: Split Curtain & Loupe Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.3rem', borderTop: '1px solid var(--border-color)' }}>
          {/* Split Wipe Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={splitWipeActive} 
                onChange={e => setSplitWipeActive(e.target.checked)} 
              />
              <Split size={14} /> Split Curtain Wipe
            </label>
            {splitWipeActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                <input 
                  type="range" min="5" max="95" value={splitPosition} 
                  onChange={e => setSplitPosition(parseInt(e.target.value))} 
                  style={{ width: '100px' }}
                />
                <span>{splitPosition}% (Original | Filtered)</span>
              </div>
            )}
          </div>

          {/* Loupe Magnifier Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={loupeActive} 
                onChange={e => setLoupeActive(e.target.checked)} 
              />
              <Crosshair size={14} /> High-Power Loupe Magnifier
            </label>

            {loupeActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                <span>Power:</span>
                {[2, 4, 8, 16].map(p => (
                  <button
                    key={p}
                    onClick={() => setLoupePower(p)}
                    style={{
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.72rem',
                      borderRadius: '3px',
                      background: loupePower === p ? 'var(--primary-color)' : '#fff',
                      color: loupePower === p ? '#fff' : '#000',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    {p}x
                  </button>
                ))}

                <span style={{ marginLeft: '0.4rem' }}>Size:</span>
                {[160, 220, 300].map(s => (
                  <button
                    key={s}
                    onClick={() => setLoupeSize(s)}
                    style={{
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.72rem',
                      borderRadius: '3px',
                      background: loupeSize === s ? 'var(--primary-color)' : '#fff',
                      color: loupeSize === s ? '#fff' : '#000',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    {s}px
                  </button>
                ))}

                <span style={{ marginLeft: '0.4rem' }}>Loupe Filter:</span>
                <select 
                  value={loupeFilter} 
                  onChange={e => setLoupeFilter(e.target.value as FilterMode)}
                  style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                >
                  <option value="original">Raw Pixels</option>
                  <option value="level_sweep">Level Sweep</option>
                  <option value="bit_plane">LSB Plane</option>
                  <option value="gradient_sobel">Sobel Edges</option>
                  <option value="noise_residual">Noise Residual</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Viewport */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          position: 'relative',
          width: '100%',
          height: '560px',
          background: 'radial-gradient(circle at center, #23201d 0%, #151311 100%)',
          borderRadius: '10px',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : loupeActive ? 'crosshair' : 'grab',
          border: '1px solid var(--border-color)',
          userSelect: 'none'
        }}
      >
        {/* Render Canvas */}
        <canvas
          ref={mainCanvasRef}
          style={{
            position: 'absolute',
            left: `${pan.x}px`,
            top: `${pan.y}px`,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            imageRendering: scale > 2 ? 'pixelated' : 'auto',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
          }}
        />

        {/* Floating Loupe Canvas Element */}
        {loupeActive && cursorPos.x >= 0 && (
          <div style={{
            position: 'absolute',
            left: `${(cursorPos.x * scale) + pan.x - loupeSize / 2}px`,
            top: `${(cursorPos.y * scale) + pan.y - loupeSize / 2}px`,
            width: `${loupeSize}px`,
            height: `${loupeSize}px`,
            borderRadius: '50%',
            overflow: 'hidden',
            pointerEvents: 'none',
            border: '3px solid #b8872a',
            boxShadow: '0 0 25px rgba(0, 0, 0, 0.8), inset 0 0 10px rgba(0, 0, 0, 0.5)',
            zIndex: 30,
            background: '#000'
          }}>
            <canvas ref={loupeCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        )}

        {/* Viewport HUD (Top-Left: Active Mode Badge) */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(28, 43, 58, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          color: '#f5f0e2',
          fontSize: '0.74rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          zIndex: 10
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#b8872a' }} />
          VIEW: {filterMode.toUpperCase()} {splitWipeActive ? '(CURTAIN WIPE)' : ''} | ZOOM: {Math.round(scale * 100)}%
        </div>

        {/* Viewport HUD (Bottom-Right: Live Pixel Inspector) */}
        {pixelInfo && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'rgba(28, 43, 58, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '0.4rem 0.85rem',
            borderRadius: '6px',
            color: '#f5f0e2',
            fontSize: '0.72rem',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            pointerEvents: 'none',
            zIndex: 10
          }}>
            <div style={{ 
              width: '16px', 
              height: '16px', 
              borderRadius: '3px', 
              background: pixelInfo.hex, 
              border: '1px solid #fff' 
            }} />
            <span>X: {pixelInfo.x} Y: {pixelInfo.y}</span>
            <span>RGB({pixelInfo.r}, {pixelInfo.g}, {pixelInfo.b})</span>
            <span style={{ color: '#b8872a', fontWeight: 700 }}>{pixelInfo.hex}</span>
            <span>Lum: {Math.round(0.299 * pixelInfo.r + 0.587 * pixelInfo.g + 0.114 * pixelInfo.b)}</span>
          </div>
        )}
      </div>

      {/* Forensic Examination Guide */}
      <div style={{
        background: 'rgba(184, 135, 42, 0.05)',
        border: '1px solid rgba(184, 135, 42, 0.22)',
        borderRadius: '8px',
        padding: '0.85rem 1.1rem',
        fontSize: '0.8rem',
        lineHeight: 1.5,
        color: 'var(--text-body)'
      }}>
        <strong style={{ color: '#92560a' }}>Forensic Examiner Inspection Guidelines:</strong>
        <ul style={{ margin: '0.4rem 0 0 1.25rem', padding: 0 }}>
          <li><strong>Level Sweep:</strong> Use the auto-sweep slider to detect block boundary discontinuities and luminance halos around inserted objects. Authentic natural images transition smoothly through luminance bands.</li>
          <li><strong>Bit-Plane 0 (LSB):</strong> The least-significant bit plane reveals natural CMOS sensor shot noise. Clean, sharp silhouetted cuts or missing noise in isolated regions strongly indicate digital tampering or AI inpainting.</li>
          <li><strong>Blue Channel:</strong> Digital cameras exhibit the highest noise in the Blue channel due to lower Bayer sensor sensitivity. Spliced objects from different sources show mismatched blue-channel noise variance.</li>
          <li><strong>Sobel Derivative:</strong> Sharply defined artificial boundaries indicate cut-and-paste compositing without feathered alpha-channel blending.</li>
        </ul>
      </div>
    </div>
  );
};

export default InteractiveVisualInspection;
