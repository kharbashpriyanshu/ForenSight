import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Search, 
  RefreshCw, 
  X, 
  ArrowRight, 
  Grid, 
  ShieldAlert, 
  Maximize2,
  GitBranch,
  Layers,
  SlidersHorizontal
} from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
  label: string;
  metadata: any;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  case_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
  column?: number;
}

type LayoutMode = 'dag' | 'cluster';

const TYPE_CONFIG: Record<string, { fill: string; border: string; glow: string; text: string; code: string; defaultRadius: number; badgeColor: string }> = {
  CASE:         { fill: '#1e3a8a', border: '#60a5fa', glow: 'rgba(59, 130, 246, 0.6)', text: '#ffffff', code: 'CASE', defaultRadius: 28, badgeColor: '#3b82f6' },
  EVIDENCE:     { fill: '#065f46', border: '#34d399', glow: 'rgba(16, 185, 129, 0.6)', text: '#ffffff', code: 'EVD',  defaultRadius: 24, badgeColor: '#10b981' },
  FINDING:      { fill: '#991b1b', border: '#f87171', glow: 'rgba(239, 68, 68, 0.6)', text: '#ffffff', code: 'FND',  defaultRadius: 22, badgeColor: '#ef4444' },
  OBSERVATION:  { fill: '#92400e', border: '#fbbf24', glow: 'rgba(245, 158, 11, 0.6)', text: '#ffffff', code: 'OBS',  defaultRadius: 18, badgeColor: '#f59e0b' },
  ANALYSIS:     { fill: '#581c87', border: '#c084fc', glow: 'rgba(168, 85, 247, 0.5)', text: '#ffffff', code: 'ANL',  defaultRadius: 16, badgeColor: '#a855f7' },
  ANALYSIS_JOB: { fill: '#334155', border: '#94a3b8', glow: 'rgba(148, 163, 184, 0.4)', text: '#ffffff', code: 'JOB',  defaultRadius: 14, badgeColor: '#64748b' },
  ARTIFACT:     { fill: '#831843', border: '#f472b6', glow: 'rgba(236, 72, 153, 0.4)', text: '#ffffff', code: 'ART',  defaultRadius: 12, badgeColor: '#ec4899' },
  REPORT:       { fill: '#155e75', border: '#22d3ee', glow: 'rgba(6, 182, 212, 0.6)', text: '#ffffff', code: 'RPT',  defaultRadius: 24, badgeColor: '#06b6d4' },
};

const DEFAULT_CONFIG = { fill: '#374151', border: '#9ca3af', glow: 'rgba(156, 163, 175, 0.4)', text: '#ffffff', code: 'NODE', defaultRadius: 16, badgeColor: '#6b7280' };

function cleanLabel(rawLabel: string, type: string): string {
  if (type === 'ANALYSIS') {
    return rawLabel
      .replace(/ Analysis$/i, '')
      .replace(/_/g, ' ')
      .replace(/\bC2PA PROVENANCE\b/i, 'C2PA Provenance')
      .replace(/\bJPEG DCT\b/i, 'JPEG DCT')
      .replace(/\bCOPY MOVE\b/i, 'Copy-Move')
      .replace(/\bSPATIAL NOISE\b/i, 'Spatial Noise')
      .replace(/\bERROR LEVEL\b/i, 'ELA 95%');
  }
  if (type === 'ANALYSIS_JOB') {
    return rawLabel.replace(/^Job:\s*/i, '').replace(/\s*\([^)]*\)$/, '');
  }
  if (type === 'ARTIFACT') {
    return rawLabel.replace(/^Artifact:\s*/i, '').replace(/_/g, ' ');
  }
  return rawLabel;
}

const InvestigationGraphPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'grid'>('graph');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dag');
  const [showAnalyses, setShowAnalyses] = useState<boolean>(false);
  const [showArtifacts, setShowArtifacts] = useState<boolean>(false);
  const [activeRightTab, setActiveRightTab] = useState<'inspector' | 'controls'>('controls');

  // Canvas Refs & Viewport State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 0.85 });
  const isDraggingCanvasRef = useRef(false);
  const draggedNodeRef = useRef<SimNode | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const animFrameRef = useRef<number | null>(null);

  const fetchGraph = () => {
    setLoading(true);
    fetchApi(`/cases/${caseId}/graph`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch investigation observation graph');
        return res.json();
      })
      .then(data => {
        setGraphData(data);
        computeLayout(data, layoutMode, showAnalyses, showArtifacts, filterType);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGraph();
  }, [caseId]);

  useEffect(() => {
    if (graphData) {
      computeLayout(graphData, layoutMode, showAnalyses, showArtifacts, filterType);
    }
  }, [layoutMode, showAnalyses, showArtifacts, filterType]);

  // =========================================================================
  // GUARANTEED DETERMINISTIC FORENSIC LAYOUT GENERATOR
  // (NO CORNER-STACKING, PERFECT VISIBILITY & BOUNDS)
  // =========================================================================
  const computeLayout = (
    data: GraphData, 
    mode: LayoutMode, 
    includeAnalyses: boolean, 
    includeArtifacts: boolean, 
    activeFilter: string
  ) => {
    const simMap = new Map<string, SimNode>();
    
    // 1. Filter nodes based on user toggles
    let activeNodes = data.nodes.filter(n => {
      if (!includeAnalyses && (n.type === 'ANALYSIS' || n.type === 'ANALYSIS_JOB')) return false;
      if (!includeArtifacts && n.type === 'ARTIFACT') return false;
      return true;
    });

    // 2. If a specific type filter is active, only show that type and its direct connections
    if (activeFilter !== 'ALL') {
      const targetTypeIds = new Set(activeNodes.filter(n => n.type === activeFilter).map(n => n.id));
      const connectedToTargetIds = new Set<string>();

      data.edges.forEach(e => {
        if (targetTypeIds.has(e.source)) connectedToTargetIds.add(e.target);
        if (targetTypeIds.has(e.target)) connectedToTargetIds.add(e.source);
      });

      activeNodes = activeNodes.filter(n => targetTypeIds.has(n.id) || connectedToTargetIds.has(n.id));
    }

    const activeNodeIds = new Set(activeNodes.map(n => n.id));
    const activeEdges = data.edges.filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

    if (mode === 'dag') {
      // ---------------------------------------------------------------------
      // HIERARCHICAL COLUMNAR PIPELINE (LEFT-TO-RIGHT)
      // Level 0: CASE
      // Level 1: EVIDENCE
      // Level 2: OBSERVATIONS & FINDINGS (Direct forensic conclusions)
      // Level 3: ANALYSES & JOBS (Underlying engine traces)
      // Level 4: REPORTS
      // ---------------------------------------------------------------------
      const columnLevels: Record<string, number> = {
        CASE: 0,
        EVIDENCE: 1,
        FINDING: 2,
        OBSERVATION: 2,
        ANALYSIS: 3,
        ANALYSIS_JOB: 3,
        ARTIFACT: 3,
        REPORT: 4,
        OTHER: 2
      };

      const columns: GraphNode[][] = [[], [], [], [], []];
      activeNodes.forEach(n => {
        const col = columnLevels[n.type] ?? 2;
        columns[col].push(n);
      });

      // Dynamic horizontal column positions with generous breathing room
      const colX = showAnalyses ? [80, 420, 840, 1260, 2020] : [80, 420, 840, 840, 1280];

      // Sort items in columns to align neatly
      const evidenceList = columns[1];
      const evidenceOrderMap = new Map<string, number>();
      evidenceList.forEach((ev, idx) => evidenceOrderMap.set(ev.id, idx));

      // Sort findings & observations by parent evidence
      columns[2].sort((a, b) => {
        const edgeA = activeEdges.find(e => e.target === a.id || e.source === a.id);
        const edgeB = activeEdges.find(e => e.target === b.id || e.source === b.id);
        const orderA = edgeA ? (evidenceOrderMap.get(edgeA.source) ?? evidenceOrderMap.get(edgeA.target) ?? 0) : 0;
        const orderB = edgeB ? (evidenceOrderMap.get(edgeB.source) ?? evidenceOrderMap.get(edgeB.target) ?? 0) : 0;
        return orderA - orderB;
      });

      // Position each column with centered vertical spacing
      columns.forEach((nodesInCol, colIdx) => {
        const count = nodesInCol.length;
        if (count === 0) return;

        const baseX = colX[colIdx] || (colIdx * 380);

        if (colIdx === 3 && count > 12) {
          // Stagger dense analysis passes into 3 readable, non-overlapping sub-columns
          const numSubCols = 3;
          const subColWidth = 220;
          const rowPitch = 60;
          const numRows = Math.ceil(count / numSubCols);
          const totalHeight = (numRows - 1) * rowPitch;
          const startY = -totalHeight / 2;

          nodesInCol.forEach((n, idx) => {
            const cfg = TYPE_CONFIG[n.type] || DEFAULT_CONFIG;
            const subCol = idx % numSubCols;
            const subRow = Math.floor(idx / numSubCols);
            const x = baseX + subCol * subColWidth;
            const y = startY + subRow * rowPitch;

            simMap.set(n.id, {
              ...n,
              x,
              y,
              radius: cfg.defaultRadius,
              column: colIdx
            });
          });
        } else {
          // Standard single column with comfortable spacing
          const verticalPitch = count > 15 ? 68 : count > 6 ? 88 : 115;
          const totalHeight = (count - 1) * verticalPitch;
          const startY = -totalHeight / 2;

          nodesInCol.forEach((n, rowIdx) => {
            const cfg = TYPE_CONFIG[n.type] || DEFAULT_CONFIG;
            simMap.set(n.id, {
              ...n,
              x: baseX,
              y: startY + rowIdx * verticalPitch,
              radius: cfg.defaultRadius,
              column: colIdx
            });
          });
        }
      });

    } else {
      // ---------------------------------------------------------------------
      // EVIDENCE SATELLITE CLUSTER LAYOUT
      // ---------------------------------------------------------------------
      const evidenceNodes = activeNodes.filter(n => n.type === 'EVIDENCE');
      const caseNodes = activeNodes.filter(n => n.type === 'CASE');
      const otherNodes = activeNodes.filter(n => n.type !== 'EVIDENCE' && n.type !== 'CASE');

      if (evidenceNodes.length === 0) {
        // When evidence is filtered out, center the Case and neatly orbit other active nodes
        caseNodes.forEach((cn, i) => {
          const cfg = TYPE_CONFIG[cn.type] || DEFAULT_CONFIG;
          simMap.set(cn.id, {
            ...cn,
            x: (i - (caseNodes.length - 1) / 2) * 260,
            y: 0,
            radius: cfg.defaultRadius
          });
        });

        const orbitRadius = Math.max(220, otherNodes.length * 45);
        otherNodes.forEach((on, i) => {
          const cfg = TYPE_CONFIG[on.type] || DEFAULT_CONFIG;
          const angle = (i / Math.max(1, otherNodes.length)) * 2 * Math.PI - Math.PI / 2;
          simMap.set(on.id, {
            ...on,
            x: Math.cos(angle) * orbitRadius,
            y: Math.sin(angle) * orbitRadius,
            radius: cfg.defaultRadius
          });
        });
      } else {
        caseNodes.forEach((cn, i) => {
          const cfg = TYPE_CONFIG[cn.type] || DEFAULT_CONFIG;
          simMap.set(cn.id, {
            ...cn,
            x: (i - (caseNodes.length - 1) / 2) * 260,
            y: -380,
            radius: cfg.defaultRadius
          });
        });

        const clusterSpacing = Math.max(580, 2400 / Math.max(1, evidenceNodes.length));
        const evCenters = new Map<string, { x: number; y: number }>();

        evidenceNodes.forEach((ev, i) => {
          const cfg = TYPE_CONFIG[ev.type] || DEFAULT_CONFIG;
          const cx = (i - (evidenceNodes.length - 1) / 2) * clusterSpacing;
          const cy = 0;
          evCenters.set(ev.id, { x: cx, y: cy });

          simMap.set(ev.id, {
            ...ev,
            x: cx,
            y: cy,
            radius: cfg.defaultRadius
          });
        });

        evidenceNodes.forEach(ev => {
          const center = evCenters.get(ev.id) || { x: 0, y: 0 };
          const children = activeEdges
            .filter(e => e.source === ev.id || e.target === ev.id)
            .map(e => activeNodes.find(n => n.id === (e.source === ev.id ? e.target : e.source)))
            .filter(Boolean) as GraphNode[];

          const orbitRadius = Math.max(180, children.length * 12);
          children.forEach((child, ci) => {
            if (child.type === 'CASE') return;
            const cfg = TYPE_CONFIG[child.type] || DEFAULT_CONFIG;
            const angle = (ci / Math.max(1, children.length)) * 2 * Math.PI - Math.PI / 2;
            simMap.set(child.id, {
              ...child,
              x: center.x + Math.cos(angle) * orbitRadius,
              y: center.y + Math.sin(angle) * orbitRadius,
              radius: cfg.defaultRadius
            });
          });
        });

        otherNodes.forEach((on, oi) => {
          if (!simMap.has(on.id)) {
            const cfg = TYPE_CONFIG[on.type] || DEFAULT_CONFIG;
            const angle = (oi / Math.max(1, otherNodes.length)) * 2 * Math.PI;
            simMap.set(on.id, {
              ...on,
              x: Math.cos(angle) * 320,
              y: 200 + Math.sin(angle) * 80,
              radius: cfg.defaultRadius
            });
          }
        });
      }
    }

    simNodesRef.current = simMap;
    autoFitView(Array.from(simMap.values()));
  };

  // Center and auto-fit all nodes comfortably inside the canvas
  const autoFitView = (nodes: SimNode[]) => {
    if (!containerRef.current || nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      if (n.x - n.radius < minX) minX = n.x - n.radius;
      if (n.x + n.radius > maxX) maxX = n.x + n.radius;
      if (n.y - n.radius < minY) minY = n.y - n.radius;
      if (n.y + n.radius > maxY) maxY = n.y + n.radius;
    });

    const padding = 100;
    const graphWidth = Math.max(200, maxX - minX + padding * 2);
    const graphHeight = Math.max(200, maxY - minY + padding * 2);

    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const targetK = Math.min(1.1, Math.max(0.35, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    transformRef.current = {
      x: rect.width / 2 - centerX * targetK,
      y: rect.height / 2 - centerY * targetK,
      k: targetK
    };
  };

  // =========================================================================
  // HIGH-CONTRAST CANVAS RENDER ENGINE
  // =========================================================================
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    // Authoritative DPR transform: guarantees zero blur, crisp vectors & crisp text
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clear entire logical area (which maps to 100% of physical pixels)
    ctx.clearRect(0, 0, width, height);

    // Warm Forensic Technical Workbench Canvas
    ctx.fillStyle = '#f6f2eb';
    ctx.fillRect(0, 0, width, height);

    // Clean dot matrix
    const { x: tx, y: ty, k } = transformRef.current;
    const gridSize = 32 * k;
    if (gridSize > 12) {
      ctx.fillStyle = 'rgba(190, 175, 150, 0.45)';
      const startX = (tx % gridSize + gridSize) % gridSize;
      const startY = (ty % gridSize + gridSize) % gridSize;
      for (let x = startX; x < width; x += gridSize) {
        for (let y = startY; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Apply Camera Transform
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const simNodes = simNodesRef.current;
    const activeNode = hoveredNode || selectedNode;

    // Build connected set for illumination
    const connectedNodeIds = new Set<string>();
    const activeEdgeKeys = new Set<string>();

    if (activeNode) {
      connectedNodeIds.add(activeNode.id);
      graphData.edges.forEach(e => {
        if (e.source === activeNode.id || e.target === activeNode.id) {
          connectedNodeIds.add(e.source);
          connectedNodeIds.add(e.target);
          activeEdgeKeys.add(`${e.source}->${e.target}`);
        }
      });
    }

    // 1. Draw Edges with S-curves and directional arrows
    graphData.edges.forEach(e => {
      const u = simNodes.get(e.source);
      const v = simNodes.get(e.target);
      if (!u || !v) return;

      const edgeKey = `${e.source}->${e.target}`;
      const isConnectedToActive = activeEdgeKeys.has(edgeKey);
      const isDimmed = activeNode && !isConnectedToActive;

      ctx.beginPath();
      if (layoutMode === 'dag') {
        const midX = (u.x + v.x) / 2;
        ctx.moveTo(u.x, u.y);
        ctx.bezierCurveTo(midX, u.y, midX, v.y, v.x, v.y);
      } else {
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
      }

      if (isConnectedToActive) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3.2;
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = 'rgba(37, 99, 235, 0.6)';
        ctx.shadowBlur = 10;
      } else if (isDimmed) {
        ctx.strokeStyle = 'rgba(200, 190, 175, 0.45)';
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(165, 150, 130, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.85;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw directional arrow on edge
      if (k > 0.40 && !isDimmed) {
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > v.radius + 18) {
          const arrowX = v.x - Math.cos(angle) * (v.radius + 4);
          const arrowY = v.y - Math.sin(angle) * (v.radius + 4);
          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.fillStyle = isConnectedToActive ? '#2563eb' : 'rgba(150, 135, 115, 0.95)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-8, -4);
          ctx.lineTo(-8, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    });

    ctx.globalAlpha = 1.0;

    // 2. Draw Nodes with High Contrast
    simNodes.forEach(sim => {
      const isSelected = selectedNode?.id === sim.id;
      const isHovered = hoveredNode?.id === sim.id;
      const isConnected = connectedNodeIds.has(sim.id);
      const isDimmed = activeNode && !isConnected;

      // Check search match
      const matchesSearch = !searchQuery.trim() || sim.label.toLowerCase().includes(searchQuery.toLowerCase());

      ctx.save();

      // NEVER make nodes invisible (minimum opacity 0.55 so everything is clearly visible)
      if (!matchesSearch) {
        ctx.globalAlpha = 0.20;
      } else if (isDimmed) {
        ctx.globalAlpha = 0.60;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const cfg = TYPE_CONFIG[sim.type] || DEFAULT_CONFIG;

      // Luminous Glow Halo
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, sim.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.35)' : cfg.glow;
        ctx.fill();
      }

      // Solid Node Body
      ctx.beginPath();
      ctx.arc(sim.x, sim.y, sim.radius, 0, Math.PI * 2);
      ctx.fillStyle = cfg.fill;
      ctx.fill();

      // Sharp Specular Rim
      ctx.lineWidth = isSelected ? 3.5 : 2.2;
      ctx.strokeStyle = isSelected ? '#ffffff' : cfg.border;
      ctx.stroke();

      // Node Code (Inner Abbreviation)
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.max(8.5, Math.round(sim.radius * 0.52));
      ctx.font = `800 ${fontSize}px "Space Grotesk", sans-serif`;
      ctx.fillText(cfg.code, sim.x, sim.y);

      // Node Label Badge (Always visible, clean, high-contrast)
      ctx.save();
      const displayLabel = cleanLabel(sim.label, sim.type);
      const maxLen = 26;
      const truncated = displayLabel.length > maxLen ? displayLabel.slice(0, maxLen - 1) + '…' : displayLabel;

      ctx.font = `${isSelected || isHovered ? '700' : '600'} 10px "Plus Jakarta Sans", sans-serif`;
      const textMetrics = ctx.measureText(truncated);
      const padX = 6;
      const textW = textMetrics.width;
      const labelY = sim.y + sim.radius + 5;

      // Solid high-contrast label capsule
      ctx.fillStyle = isSelected ? '#1e3a8a' : '#ffffff';
      ctx.strokeStyle = isSelected ? '#3b82f6' : 'rgba(195, 180, 160, 0.9)';
      ctx.lineWidth = 1.2;

      const rx = sim.x - textW / 2 - padX;
      const ry = labelY - 2;
      const rw = textW + padX * 2;
      const rh = 17;
      const rRadius = 5;

      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, rRadius);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSelected ? '#ffffff' : '#1a1610';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(truncated, sim.x, labelY);
      ctx.restore();

      ctx.restore();
    });

    // Close Camera Transform
    ctx.restore();
  }, [graphData, selectedNode, hoveredNode, searchQuery, layoutMode]);

  // Request Animation Loop
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      renderCanvas();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderCanvas]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;
      autoFitView(Array.from(simNodesRef.current.values()));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Coordinate Helpers
  const getGraphCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { x: tx, y: ty, k } = transformRef.current;
    return {
      x: (mouseX - tx) / k,
      y: (mouseY - ty) / k,
      rawX: mouseX,
      rawY: mouseY
    };
  };

  const findNodeAtCoords = (gx: number, gy: number): SimNode | null => {
    const simNodes = simNodesRef.current;
    for (const node of simNodes.values()) {
      const dx = node.x - gx;
      const dy = node.y - gy;
      if (dx * dx + dy * dy <= (node.radius + 10) * (node.radius + 10)) {
        return node;
      }
    }
    return null;
  };

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: gx, y: gy, rawX, rawY } = getGraphCoords(e);
    const clickedNode = findNodeAtCoords(gx, gy);

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      dragStartRef.current = { mouseX: rawX, mouseY: rawY, startX: clickedNode.x, startY: clickedNode.y };
      setSelectedNode(clickedNode);
      setActiveRightTab('inspector');
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = {
        mouseX: rawX,
        mouseY: rawY,
        startX: transformRef.current.x,
        startY: transformRef.current.y
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: gx, y: gy, rawX, rawY } = getGraphCoords(e);

    if (draggedNodeRef.current) {
      const dx = (rawX - dragStartRef.current.mouseX) / transformRef.current.k;
      const dy = (rawY - dragStartRef.current.mouseY) / transformRef.current.k;
      draggedNodeRef.current.x = dragStartRef.current.startX + dx;
      draggedNodeRef.current.y = dragStartRef.current.startY + dy;
      return;
    }

    if (isDraggingCanvasRef.current) {
      const dx = rawX - dragStartRef.current.mouseX;
      const dy = rawY - dragStartRef.current.mouseY;
      transformRef.current.x = dragStartRef.current.startX + dx;
      transformRef.current.y = dragStartRef.current.startY + dy;
      return;
    }

    const hovered = findNodeAtCoords(gx, gy);
    setHoveredNode(hovered);
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newK = Math.max(0.20, Math.min(3.5, transformRef.current.k * zoomFactor));

    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newK / transformRef.current.k);
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newK / transformRef.current.k);
    transformRef.current.k = newK;
  };

  const handleZoomIn = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newK = Math.min(3.5, transformRef.current.k * 1.25);
    transformRef.current.x = cx - (cx - transformRef.current.x) * (newK / transformRef.current.k);
    transformRef.current.y = cy - (cy - transformRef.current.y) * (newK / transformRef.current.k);
    transformRef.current.k = newK;
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newK = Math.max(0.20, transformRef.current.k * 0.8);
    transformRef.current.x = cx - (cx - transformRef.current.x) * (newK / transformRef.current.k);
    transformRef.current.y = cy - (cy - transformRef.current.y) * (newK / transformRef.current.k);
    transformRef.current.k = newK;
  };

  const handleResetView = () => {
    autoFitView(Array.from(simNodesRef.current.values()));
  };

  const handleCenterOnNode = (node: GraphNode) => {
    const sim = simNodesRef.current.get(node.id);
    if (!sim || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    transformRef.current = {
      x: rect.width / 2 - sim.x * 1.2,
      y: rect.height / 2 - sim.y * 1.2,
      k: 1.2
    };
    setSelectedNode(node);
    setActiveRightTab('inspector');
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
        <RefreshCw size={30} className="spin-animate" style={{ color: 'var(--accent-color)' }} />
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
          Computing Forensic Provenance Graph...
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Aligning causal chain: Case &rarr; Evidence &rarr; Findings &rarr; Report
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: '1.5rem', color: '#991b1b', background: 'rgba(239, 68, 68, 0.08)' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)' }}>
          <ShieldAlert size={18} /> Graph Retrieval Error
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
        <button className="btn btn-secondary" onClick={fetchGraph} style={{ marginTop: '1rem', padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!graphData) return null;

  const currentNodesList = Array.from(simNodesRef.current.values());
  const allAvailableTypes = ['ALL', 'CASE', 'EVIDENCE', 'FINDING', 'OBSERVATION', 'ANALYSIS', 'REPORT'];
  const analysisCount = graphData.nodes.filter(n => n.type === 'ANALYSIS').length;
  const artifactCount = graphData.nodes.filter(n => n.type === 'ARTIFACT').length;

  return (
    <div style={{ display: 'flex', gap: '1.25rem', height: 'calc(100vh - 128px)', minHeight: 0 }}>
      {/* ===================================================================== */}
      {/* MAIN VISUAL CANVAS (MAXIMIZED, CLEAN, 0 CLUTTER ABOVE)                */}
      {/* ===================================================================== */}
      <div 
        ref={containerRef}
        className="card" 
        style={{ 
          flex: 1, 
          position: 'relative', 
          padding: 0, 
          margin: 0,
          overflow: 'hidden', 
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          background: '#f6f2eb',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {viewMode === 'graph' ? (
          <>
            <canvas 
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              style={{ 
                flex: 1, 
                width: '100%', 
                height: '100%', 
                display: 'block', 
                cursor: isDraggingCanvasRef.current ? 'grabbing' : draggedNodeRef.current ? 'grabbing' : hoveredNode ? 'pointer' : 'grab' 
              }}
            />

            {/* Floating Navigation Controls (Top-Left) */}
            <div style={{
              position: 'absolute',
              top: '1.2rem',
              left: '1.2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              zIndex: 10
            }}>
              <div style={{
                background: 'rgba(254, 251, 246, 0.92)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.90)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                padding: '0.25rem',
                boxShadow: '0 4px 14px rgba(45, 35, 20, 0.08)'
              }}>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ZoomOut size={16} />
                </button>
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.15rem 0.25rem' }} />
                <button
                  type="button"
                  onClick={handleResetView}
                  title="Fit All Nodes in View"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            {/* Quick Live Node Count Pill (Bottom-Left) */}
            <div style={{
              position: 'absolute',
              bottom: '1rem',
              left: '1.2rem',
              background: 'rgba(254, 251, 246, 0.88)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              borderRadius: '20px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-tech)',
              letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(45, 35, 20, 0.05)',
              zIndex: 10
            }}>
              {currentNodesList.length} NODES VISIBLE • {layoutMode === 'dag' ? 'PIPELINE DAG' : 'SATELLITE CLUSTERS'}
            </div>
          </>
        ) : (
          /* Grid View Mode */
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
              {currentNodesList.map(node => {
                const cfg = TYPE_CONFIG[node.type] || DEFAULT_CONFIG;
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div 
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    style={{ 
                      background: isSelected ? 'rgba(255, 254, 250, 0.95)' : 'rgba(254, 251, 246, 0.75)',
                      border: `1.5px solid ${isSelected ? cfg.fill : 'var(--border-color)'}`,
                      borderLeft: `5px solid ${cfg.fill}`,
                      borderRadius: '12px',
                      padding: '0.95rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: isSelected ? '0 8px 24px rgba(45, 35, 20, 0.10)' : 'var(--shadow-xs)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: cfg.fill, textTransform: 'uppercase', fontFamily: 'var(--font-tech)' }}>
                        {node.type}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {node.id.split(':')[0]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                      {cleanLabel(node.label, node.type)}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Inspect connections</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* DEDICATED RIGHT-HAND PANEL: GRAPH CONTROLS, FILTERS & INSPECTOR       */}
      {/* ===================================================================== */}
      <div 
        className="card"
        style={{ 
          width: '400px', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: 0,
          margin: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          height: '100%',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        {/* Top Tab Bar: Controls vs Inspector */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid var(--border-color-translucent)',
          background: 'rgba(250, 246, 238, 0.75)',
          padding: '0.45rem 0.6rem',
          gap: '0.4rem',
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={() => setActiveRightTab('controls')}
            style={{
              flex: 1,
              padding: '0.48rem 0.65rem',
              borderRadius: '8px',
              border: activeRightTab === 'controls' ? '1px solid var(--border-color)' : '1px solid transparent',
              background: activeRightTab === 'controls' ? '#ffffff' : 'transparent',
              color: activeRightTab === 'controls' ? 'var(--primary-color)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              boxShadow: activeRightTab === 'controls' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <SlidersHorizontal size={13} style={{ color: activeRightTab === 'controls' ? 'var(--accent-color)' : 'currentColor' }} />
            <span>Controls & Filters</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveRightTab('inspector')}
            style={{
              flex: 1,
              padding: '0.48rem 0.65rem',
              borderRadius: '8px',
              border: activeRightTab === 'inspector' ? '1px solid var(--border-color)' : '1px solid transparent',
              background: activeRightTab === 'inspector' ? '#ffffff' : 'transparent',
              color: activeRightTab === 'inspector' ? 'var(--primary-color)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              boxShadow: activeRightTab === 'inspector' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Search size={13} style={{ color: activeRightTab === 'inspector' ? 'var(--accent-color)' : 'currentColor' }} />
            <span>
              {selectedNode ? `Inspector (${selectedNode.type})` : 'Node Inspector'}
            </span>
            {selectedNode && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-color)' }} />
            )}
          </button>
        </div>

        {/* Tab 1: Controls & Filters */}
        {activeRightTab === 'controls' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SlidersHorizontal size={16} style={{ color: 'var(--accent-color)' }} />
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  Graph Controls & Filters
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchGraph}
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                title="Reload from server"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input 
                type="text"
                placeholder="Search graph nodes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '0.45rem 0.65rem 0.45rem 1.95rem', 
                  fontSize: '0.82rem'
                }}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '0.65rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Layout Mode Selector */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', fontFamily: 'var(--font-tech)', letterSpacing: '0.05em' }}>
                Layout Structure
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: 'var(--surface-color-light)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-color-translucent)' }}>
                <button
                  type="button"
                  onClick={() => setLayoutMode('dag')}
                  style={{
                    background: layoutMode === 'dag' ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.45rem 0.5rem',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: layoutMode === 'dag' ? 'var(--primary-color)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: layoutMode === 'dag' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                  }}
                >
                  <GitBranch size={13} />
                  <span>Hierarchical DAG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLayoutMode('cluster')}
                  style={{
                    background: layoutMode === 'cluster' ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.45rem 0.5rem',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: layoutMode === 'cluster' ? 'var(--primary-color)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: layoutMode === 'cluster' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                  }}
                >
                  <Layers size={13} />
                  <span>Evidence Clusters</span>
                </button>
              </div>
            </div>

            {/* Granular Clutter Toggles */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', fontFamily: 'var(--font-tech)', letterSpacing: '0.05em' }}>
                Content Density Toggles
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAnalyses(prev => !prev)}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    padding: '0.42rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: showAnalyses ? 'rgba(88, 28, 135, 0.08)' : undefined,
                    borderColor: showAnalyses ? '#c084fc' : undefined
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#581c87' }} />
                    <span>Analysis Engines ({analysisCount})</span>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: showAnalyses ? '#7c3aed' : 'var(--text-muted)', fontWeight: 700 }}>
                    {showAnalyses ? 'VISIBLE' : 'HIDDEN'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowArtifacts(prev => !prev)}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    padding: '0.42rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: showArtifacts ? 'rgba(184, 135, 42, 0.08)' : undefined,
                    borderColor: showArtifacts ? 'var(--accent-color)' : undefined
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#db2777' }} />
                    <span>Artifact Files ({artifactCount})</span>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: showArtifacts ? 'var(--accent-color)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {showArtifacts ? 'VISIBLE' : 'HIDDEN'}
                  </span>
                </button>
              </div>
            </div>

            {/* Type Filter Buttons */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', fontFamily: 'var(--font-tech)', letterSpacing: '0.05em' }}>
                Filter by Node Category
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {allAvailableTypes.map(t => {
                  const isSelected = filterType === t;
                  const cfg = TYPE_CONFIG[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterType(t)}
                      style={{
                        background: isSelected ? 'var(--primary-color)' : 'rgba(254, 251, 246, 0.75)',
                        color: isSelected ? '#ffffff' : 'var(--text-main)',
                        border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '0.28rem 0.6rem',
                        fontSize: '0.74rem',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {cfg && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSelected ? '#ffffff' : cfg.fill }} />}
                      <span>{t}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-color-translucent)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setViewMode(viewMode === 'graph' ? 'grid' : 'graph')}
                style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center' }}
              >
                {viewMode === 'graph' ? <Grid size={13} /> : <Network size={13} />}
                <span>{viewMode === 'graph' ? 'Switch to Card List' : 'Switch to Visual Graph'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Node Inspector (Full-height dedicated view) */}
        {activeRightTab === 'inspector' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {selectedNode ? (() => {
              const cfg = TYPE_CONFIG[selectedNode.type] || DEFAULT_CONFIG;
              const connectedEdges = graphData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ 
                        fontSize: '0.68rem', 
                        fontWeight: 800, 
                        color: cfg.fill,
                        background: 'rgba(0,0,0,0.06)',
                        padding: '0.18rem 0.5rem',
                        borderRadius: '5px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontFamily: 'var(--font-tech)'
                      }}>
                        {selectedNode.type}
                      </span>
                      <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                        {cleanLabel(selectedNode.label, selectedNode.type)}
                      </h3>
                      <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {selectedNode.id}
                      </code>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedNode(null);
                        setActiveRightTab('controls');
                      }} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                      aria-label="Close inspector"
                      title="Close & return to controls"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleCenterOnNode(selectedNode)}
                      style={{ fontSize: '0.74rem', padding: '0.35rem 0.7rem' }}
                    >
                      <Maximize2 size={12} />
                      <span>Center on Canvas</span>
                    </button>

                    {selectedNode.type === 'EVIDENCE' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/cases/${caseId}/evidence`)}
                        style={{ fontSize: '0.74rem', padding: '0.35rem 0.7rem' }}
                      >
                        <span>Open Evidence</span>
                        <ArrowRight size={12} />
                      </button>
                    )}

                    {selectedNode.type === 'FINDING' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/cases/${caseId}/analyst`)}
                        style={{ fontSize: '0.74rem', padding: '0.35rem 0.7rem' }}
                      >
                        <span>Review Finding</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>

                  {/* Telemetry / Metadata Table - FULLY VISIBLE & SCROLLABLE */}
                  <div>
                    <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                      Metadata Attributes ({Object.keys(selectedNode.metadata || {}).length})
                    </h4>
                    <div style={{ 
                      background: 'var(--surface-color-light)', 
                      border: '1px solid var(--border-color-translucent)', 
                      borderRadius: '10px', 
                      padding: '0.75rem', 
                      fontSize: '0.76rem',
                      maxHeight: '320px',
                      overflowY: 'auto'
                    }}>
                      {Object.keys(selectedNode.metadata || {}).length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No additional metadata attributes recorded for this node.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {Object.entries(selectedNode.metadata).map(([k, v]) => (
                              <tr key={k} style={{ borderBottom: '1px solid rgba(220, 210, 190, 0.4)' }}>
                                <td style={{ padding: '0.4rem 0', fontWeight: 700, color: 'var(--text-muted)', width: '38%', verticalAlign: 'top' }}>{k}</td>
                                <td style={{ padding: '0.4rem 0', textAlign: 'right', color: 'var(--text-main)', wordBreak: 'break-all', fontFamily: typeof v === 'number' || String(v).length > 20 ? 'var(--font-mono)' : 'inherit' }}>
                                  {String(v)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Connected Edges */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                        Connected Links
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {connectedEdges.length} links
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '220px', overflowY: 'auto' }}>
                      {connectedEdges.map((e, idx) => {
                        const targetId = e.source === selectedNode.id ? e.target : e.source;
                        const targetNode = graphData.nodes.find(n => n.id === targetId);

                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              background: 'var(--surface-color-light)', 
                              padding: '0.45rem 0.65rem', 
                              borderRadius: '8px', 
                              border: '1px solid var(--border-color-translucent)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: targetNode ? 'pointer' : 'default',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => targetNode && handleCenterOnNode(targetNode)}
                            title={targetNode ? `Jump to ${targetNode.label}` : ''}
                          >
                            <div>
                              <span style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.7rem', fontFamily: 'var(--font-tech)' }}>{e.type}</span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-main)', marginTop: '0.1rem' }}>
                                {e.source === selectedNode.id ? `&rarr; ${targetNode ? cleanLabel(targetNode.label, targetNode.type) : e.target}` : `&larr; ${targetNode ? cleanLabel(targetNode.label, targetNode.type) : e.source}`}
                              </div>
                            </div>
                            {targetNode && <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })() : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <Network size={36} style={{ color: 'var(--accent-color)', opacity: 0.65 }} />
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                  No Node Selected
                </div>
                <div style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                  Click any node on the graph canvas or in the list view to inspect its full cryptographic telemetry, EXIF parameters, and provenance links.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveRightTab('controls')}
                  style={{ marginTop: '0.5rem', fontSize: '0.76rem' }}
                >
                  <SlidersHorizontal size={13} />
                  <span>Go to Controls & Filters</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestigationGraphPage;
