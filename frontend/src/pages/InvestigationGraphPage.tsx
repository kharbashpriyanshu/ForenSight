import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import { useTheme } from '../contexts/ThemeContext';
import { GraphWorkspaceSkeleton } from '../components/common/LoadingStates';
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
  const { isDark } = useTheme();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'grid'>('graph');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dag');
  const [showAnalyses, setShowAnalyses] = useState<boolean>(true);
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
    if (graphData && !loading) {
      computeLayout(graphData, layoutMode, showAnalyses, showArtifacts, filterType);
    }
  }, [graphData, loading, layoutMode, showAnalyses, showArtifacts, filterType]);

  // =========================================================================
  // GUARANTEED DETERMINISTIC FORENSIC LAYOUT GENERATOR
  // (RELATIONSHIP-DRIVEN HIERARCHY, BALANCED 2D SPREAD & ZERO STACKING)
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
    const nodeById = new Map(activeNodes.map(n => [n.id, n]));

    if (mode === 'dag') {
      // ---------------------------------------------------------------------
      // RELATIONSHIP-DRIVEN HIERARCHICAL DAG (LONGEST-PATH TOPOLOGICAL LAYERS)
      // ---------------------------------------------------------------------
      const outNeighbors = new Map<string, string[]>();
      const inNeighbors = new Map<string, string[]>();
      const inDegree = new Map<string, number>();

      activeNodes.forEach(n => {
        outNeighbors.set(n.id, []);
        inNeighbors.set(n.id, []);
        inDegree.set(n.id, 0);
      });

      activeEdges.forEach(e => {
        if (e.source === e.target) return;
        outNeighbors.get(e.source)?.push(e.target);
        inNeighbors.get(e.target)?.push(e.source);
        inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      });

      const typeTieOrder: Record<string, number> = {
        CASE: 0,
        EVIDENCE: 1,
        ANALYSIS_JOB: 2,
        ANALYSIS: 3,
        ARTIFACT: 4,
        OBSERVATION: 5,
        FINDING: 6,
        REPORT: 7,
      };

      const sortByDeterministicOrder = (ids: string[]) =>
        ids.sort((a, b) => {
          const na = nodeById.get(a);
          const nb = nodeById.get(b);
          const ta = typeTieOrder[na?.type || ''] ?? 99;
          const tb = typeTieOrder[nb?.type || ''] ?? 99;
          if (ta !== tb) return ta - tb;
          return (na?.label || a).localeCompare(nb?.label || b);
        });

      const remainingIn = new Map(inDegree);
      const levelMap = new Map<string, number>();
      const visited = new Set<string>();
      const topoOrder: string[] = [];

      // Kahn's algorithm with deterministic tie-breaking and cycle safety
      while (visited.size < activeNodes.length) {
        const ready = sortByDeterministicOrder(
          activeNodes
            .filter(n => !visited.has(n.id) && (remainingIn.get(n.id) ?? 0) === 0)
            .map(n => n.id)
        );

        let batch: string[];
        if (ready.length > 0) {
          batch = ready;
        } else {
          // Break cycles deterministically by picking the unvisited node with smallest remaining in-degree
          const unvisited = activeNodes.filter(n => !visited.has(n.id)).map(n => n.id);
          sortByDeterministicOrder(unvisited);
          unvisited.sort((a, b) => (remainingIn.get(a) ?? 0) - (remainingIn.get(b) ?? 0));
          batch = [unvisited[0]];
        }

        for (const u of batch) {
          if (visited.has(u)) continue;
          visited.add(u);
          topoOrder.push(u);
          if (!levelMap.has(u)) levelMap.set(u, 0);
          const uLevel = levelMap.get(u)!;

          for (const v of outNeighbors.get(u) || []) {
            if (!visited.has(v)) {
              levelMap.set(v, Math.max(levelMap.get(v) ?? 0, uLevel + 1));
              remainingIn.set(v, Math.max(0, (remainingIn.get(v) ?? 0) - 1));
            }
          }
        }
      }

      // Group nodes by computed topological level
      const maxLevel = Math.max(0, ...Array.from(levelMap.values()));
      const levels: GraphNode[][] = Array.from({ length: maxLevel + 1 }, () => []);
      topoOrder.forEach(id => {
        const node = nodeById.get(id);
        if (node) {
          levels[levelMap.get(id) ?? 0].push(node);
        }
      });

      // Adaptive horizontal & vertical spacing so graph fills canvas proportionally
      const numLevels = levels.length;
      const colSpacing = numLevels <= 3 ? 250 : numLevels <= 4 ? 215 : numLevels <= 5 ? 190 : 165;
      const totalWidthSpan = (numLevels - 1) * colSpacing;
      const startX = -totalWidthSpan / 2;

      const yPositions = new Map<string, number>();

      levels.forEach((nodesInLevel, lvlIdx) => {
        if (nodesInLevel.length === 0) return;

        // Barycenter sort by average parent Y to minimize edge crossings
        if (lvlIdx > 0) {
          nodesInLevel.sort((a, b) => {
            const parentsA = (inNeighbors.get(a.id) || []).filter(p => yPositions.has(p));
            const parentsB = (inNeighbors.get(b.id) || []).filter(p => yPositions.has(p));
            const avgA = parentsA.length > 0
              ? parentsA.reduce((sum, p) => sum + (yPositions.get(p) ?? 0), 0) / parentsA.length
              : 0;
            const avgB = parentsB.length > 0
              ? parentsB.reduce((sum, p) => sum + (yPositions.get(p) ?? 0), 0) / parentsB.length
              : 0;
            if (Math.abs(avgA - avgB) > 1) return avgA - avgB;
            return (typeTieOrder[a.type] ?? 99) - (typeTieOrder[b.type] ?? 99);
          });
        }

        const count = nodesInLevel.length;
        const baseX = startX + lvlIdx * colSpacing;

        if (count > 10) {
          // Wrap very dense levels into 2 readable sub-columns
          const numSubCols = count > 18 ? 3 : 2;
          const subColWidth = 210;
          const rowPitch = 86;
          const numRows = Math.ceil(count / numSubCols);
          const startY = -((numRows - 1) * rowPitch) / 2;

          nodesInLevel.forEach((n, idx) => {
            const cfg = TYPE_CONFIG[n.type] || DEFAULT_CONFIG;
            const subCol = idx % numSubCols;
            const subRow = Math.floor(idx / numSubCols);
            const x = baseX + (subCol - (numSubCols - 1) / 2) * subColWidth;
            const y = startY + subRow * rowPitch;
            yPositions.set(n.id, y);
            simMap.set(n.id, { ...n, x, y, radius: cfg.defaultRadius, column: lvlIdx });
          });
        } else {
          // Generous vertical pitch for small/medium levels so graph expands in 2D
          const verticalPitch = count === 2 ? 360 : count === 3 ? 210 : count === 4 ? 160 : count <= 7 ? 120 : 95;
          const totalHeight = (count - 1) * verticalPitch;
          let startY = -totalHeight / 2;

          if (count === 1 && lvlIdx > 0) {
            const parents = (inNeighbors.get(nodesInLevel[0].id) || []).filter(p => yPositions.has(p));
            if (parents.length > 0) {
              startY = parents.reduce((sum, p) => sum + (yPositions.get(p) ?? 0), 0) / parents.length;
            }
          }

          nodesInLevel.forEach((n, rowIdx) => {
            const cfg = TYPE_CONFIG[n.type] || DEFAULT_CONFIG;
            const y = startY + rowIdx * verticalPitch;
            yPositions.set(n.id, y);
            simMap.set(n.id, { ...n, x: baseX, y, radius: cfg.defaultRadius, column: lvlIdx });
          });
        }
      });

    } else {
      // ---------------------------------------------------------------------
      // EVIDENCE SATELLITE CLUSTER LAYOUT (RELATIONSHIP-GROUPED)
      // ---------------------------------------------------------------------
      const evidenceNodes = activeNodes.filter(n => n.type === 'EVIDENCE');
      const caseNodes = activeNodes.filter(n => n.type === 'CASE');
      const otherNodes = activeNodes.filter(n => n.type !== 'EVIDENCE' && n.type !== 'CASE');

      if (evidenceNodes.length === 0) {
        caseNodes.forEach((cn, i) => {
          const cfg = TYPE_CONFIG[cn.type] || DEFAULT_CONFIG;
          simMap.set(cn.id, {
            ...cn,
            x: (i - (caseNodes.length - 1) / 2) * 260,
            y: 0,
            radius: cfg.defaultRadius
          });
        });

        const orbitRadius = Math.max(180, otherNodes.length * 36);
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
        // Build undirected adjacency (excluding CASE) to group transitive analytical descendants with their Evidence
        const adjNoCase = new Map<string, string[]>();
        activeNodes.forEach(n => adjNoCase.set(n.id, []));
        activeEdges.forEach(e => {
          const src = nodeById.get(e.source);
          const tgt = nodeById.get(e.target);
          if (!src || !tgt || src.type === 'CASE' || tgt.type === 'CASE') return;
          adjNoCase.get(e.source)?.push(e.target);
          adjNoCase.get(e.target)?.push(e.source);
        });

        const claimed = new Set<string>(evidenceNodes.map(e => e.id));
        const clusterMembers = new Map<string, GraphNode[]>();
        evidenceNodes.forEach(ev => clusterMembers.set(ev.id, []));

        // Multi-source BFS so every node joins its nearest Evidence cluster
        const queue: Array<{ nodeId: string; evId: string }> = evidenceNodes.map(ev => ({ nodeId: ev.id, evId: ev.id }));
        while (queue.length > 0) {
          const { nodeId, evId } = queue.shift()!;
          for (const nbrId of adjNoCase.get(nodeId) || []) {
            if (!claimed.has(nbrId)) {
              claimed.add(nbrId);
              const nbrNode = nodeById.get(nbrId);
              if (nbrNode && nbrNode.type !== 'EVIDENCE' && nbrNode.type !== 'CASE') {
                clusterMembers.get(evId)?.push(nbrNode);
                queue.push({ nodeId: nbrId, evId });
              }
            }
          }
        }

        // Arrange Evidence clusters in a balanced 2D grid
        const cols = evidenceNodes.length <= 2 ? evidenceNodes.length : Math.ceil(Math.sqrt(evidenceNodes.length));
        const rows = Math.ceil(evidenceNodes.length / cols);
        const clusterSpacingX = 430;
        const clusterSpacingY = 380;

        caseNodes.forEach((cn, i) => {
          const cfg = TYPE_CONFIG[cn.type] || DEFAULT_CONFIG;
          simMap.set(cn.id, {
            ...cn,
            x: (i - (caseNodes.length - 1) / 2) * 240,
            y: -((rows - 1) * clusterSpacingY) / 2 - 220,
            radius: cfg.defaultRadius
          });
        });

        evidenceNodes.forEach((ev, idx) => {
          const cfg = TYPE_CONFIG[ev.type] || DEFAULT_CONFIG;
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const cx = (col - (cols - 1) / 2) * clusterSpacingX;
          const cy = (row - (rows - 1) / 2) * clusterSpacingY + 40;

          simMap.set(ev.id, { ...ev, x: cx, y: cy, radius: cfg.defaultRadius });

          const members = clusterMembers.get(ev.id) || [];
          const orbitRadius = Math.max(135, Math.min(210, 105 + members.length * 16));
          members.forEach((child, ci) => {
            const childCfg = TYPE_CONFIG[child.type] || DEFAULT_CONFIG;
            const ring = ci >= 10 ? 1 : 0;
            const ringCount = ring === 0 ? Math.min(10, members.length) : members.length - 10;
            const ringIdx = ring === 0 ? ci : ci - 10;
            const r = orbitRadius + ring * 100;
            const angle = (ringIdx / Math.max(1, ringCount)) * 2 * Math.PI + Math.PI / 4;
            simMap.set(child.id, {
              ...child,
              x: cx + Math.cos(angle) * r,
              y: cy + Math.sin(angle) * r,
              radius: childCfg.defaultRadius
            });
          });
        });

        // Place unclustered nodes (e.g. REPORT linked directly to CASE) cleanly beside CASE
        const unclustered = otherNodes.filter(n => !simMap.has(n.id));
        const caseTopY = -((rows - 1) * clusterSpacingY) / 2 - 220;
        unclustered.forEach((on, oi) => {
          const cfg = TYPE_CONFIG[on.type] || DEFAULT_CONFIG;
          simMap.set(on.id, {
            ...on,
            x: 240 + (oi % 2) * 190,
            y: caseTopY + Math.floor(oi / 2) * 100,
            radius: cfg.defaultRadius
          });
        });
      }
    }

    simNodesRef.current = simMap;
    autoFitView(Array.from(simMap.values()));
  };

  // Center and auto-fit all nodes (including label capsules) comfortably inside the canvas
  const autoFitView = (nodes: SimNode[]) => {
    if (!containerRef.current || nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const displayLen = Math.min(28, cleanLabel(n.label, n.type).length);
      const labelHalfW = Math.max(n.radius + 8, displayLen * 3.2 + 12);
      const topExtent = n.radius + 8;
      const bottomExtent = n.radius + 26; // Includes 19px label capsule + 5px gap

      if (n.x - labelHalfW < minX) minX = n.x - labelHalfW;
      if (n.x + labelHalfW > maxX) maxX = n.x + labelHalfW;
      if (n.y - topExtent < minY) minY = n.y - topExtent;
      if (n.y + bottomExtent > maxY) maxY = n.y + bottomExtent;
    });

    const marginX = 28;
    const marginTop = 36;
    const marginBottom = 72; // Clears bottom-left stats pill & empty-state banner
    const availW = Math.max(120, rect.width - marginX * 2);
    const availH = Math.max(120, rect.height - marginTop - marginBottom);

    const graphWidth = Math.max(120, maxX - minX);
    const graphHeight = Math.max(120, maxY - minY);

    const scaleX = availW / graphWidth;
    const scaleY = availH / graphHeight;
    const targetK = Math.min(1.2, Math.max(0.35, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const viewportCenterX = marginX + availW / 2;
    const viewportCenterY = marginTop + availH / 2;

    transformRef.current = {
      x: viewportCenterX - centerX * targetK,
      y: viewportCenterY - centerY * targetK,
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

    // Theme-aware Forensic Technical Workbench Canvas
    ctx.fillStyle = isDark ? '#0f172a' : '#f6f2eb';
    ctx.fillRect(0, 0, width, height);

    // Clean dot matrix
    const { x: tx, y: ty, k } = transformRef.current;
    const gridSize = 32 * k;
    if (gridSize > 12) {
      ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(190, 175, 150, 0.45)';
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

    // 1. Draw Edges with S-curves, directional arrows & subtle relationship labels
    const visibleEdgeList = graphData.edges.filter(e => simNodes.has(e.source) && simNodes.has(e.target));
    const showAllEdgeLabels = k >= 0.70 && visibleEdgeList.length <= 24;

    visibleEdgeList.forEach(e => {
      const u = simNodes.get(e.source)!;
      const v = simNodes.get(e.target)!;

      const edgeKey = `${e.source}->${e.target}`;
      const isConnectedToActive = activeEdgeKeys.has(edgeKey);
      const isDimmed = activeNode && !isConnectedToActive;

      const isSameColDag = layoutMode === 'dag' && Math.abs(u.x - v.x) < 10;
      const cp1x = isSameColDag ? u.x + 56 : (u.x + v.x) / 2;
      const cp1y = u.y;
      const cp2x = isSameColDag ? v.x + 56 : (u.x + v.x) / 2;
      const cp2y = v.y;

      ctx.beginPath();
      if (layoutMode === 'dag') {
        ctx.moveTo(u.x, u.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, v.x, v.y);
      } else {
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
      }

      if (isConnectedToActive) {
        ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb';
        ctx.lineWidth = 3.2;
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = isDark ? 'rgba(96, 165, 250, 0.55)' : 'rgba(37, 99, 235, 0.6)';
        ctx.shadowBlur = 10;
      } else if (isDimmed) {
        ctx.strokeStyle = isDark ? 'rgba(100, 116, 139, 0.35)' : 'rgba(200, 190, 175, 0.45)';
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.65)' : 'rgba(165, 150, 130, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.85;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw directional arrow on edge (aligned to curve tangent near target)
      if (k > 0.38 && !isDimmed) {
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > v.radius + 18) {
          let angle: number;
          if (layoutMode === 'dag') {
            const tx = 3 * (v.x - cp2x);
            const ty = 3 * (v.y - cp2y);
            angle = Math.hypot(tx, ty) > 1 ? Math.atan2(ty, tx) : Math.atan2(dy, dx);
          } else {
            angle = Math.atan2(dy, dx);
          }
          const arrowX = v.x - Math.cos(angle) * (v.radius + 4);
          const arrowY = v.y - Math.sin(angle) * (v.radius + 4);
          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.fillStyle = isConnectedToActive
            ? (isDark ? '#60a5fa' : '#2563eb')
            : (isDark ? 'rgba(148, 163, 184, 0.9)' : 'rgba(150, 135, 115, 0.95)');
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-9, -4.5);
          ctx.lineTo(-9, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw relationship label pill when connected to active node or zoomed comfortably
      if ((isConnectedToActive || (showAllEdgeLabels && !isDimmed)) && e.type) {
        const midPtX = layoutMode === 'dag'
          ? 0.125 * u.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * v.x
          : (u.x + v.x) / 2;
        const midPtY = layoutMode === 'dag'
          ? 0.125 * u.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * v.y
          : (u.y + v.y) / 2;

        ctx.save();
        ctx.font = `${isConnectedToActive ? '700' : '600'} 8.5px "Space Grotesk", sans-serif`;
        const lw = ctx.measureText(e.type).width + 8;
        const lh = 13;
        ctx.fillStyle = isConnectedToActive
          ? (isDark ? '#1e3a8a' : '#2563eb')
          : (isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(246, 242, 235, 0.92)');
        ctx.strokeStyle = isConnectedToActive
          ? (isDark ? '#60a5fa' : '#1d4ed8')
          : (isDark ? 'rgba(71, 85, 105, 0.7)' : 'rgba(180, 165, 145, 0.65)');
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(midPtX - lw / 2, midPtY - lh / 2, lw, lh, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isConnectedToActive
          ? '#ffffff'
          : (isDark ? '#cbd5e1' : '#5c5040');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.type, midPtX, midPtY + 0.5);
        ctx.restore();
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

      // Investigation Root Ring for CASE node
      if (sim.type === 'CASE') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, sim.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.55)' : 'rgba(30, 58, 138, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
      }

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
      const maxLen = 28;
      const truncated = displayLabel.length > maxLen ? displayLabel.slice(0, maxLen - 1) + '…' : displayLabel;

      ctx.font = `${isSelected || isHovered ? '700' : '600'} 11px "Plus Jakarta Sans", sans-serif`;
      const textMetrics = ctx.measureText(truncated);
      const padX = 7;
      const textW = textMetrics.width;
      const labelY = sim.y + sim.radius + 5;

      // Solid high-contrast label capsule
      ctx.fillStyle = isSelected ? '#1e3a8a' : (isDark ? '#1e293b' : '#ffffff');
      ctx.strokeStyle = isSelected ? '#3b82f6' : (isDark ? 'rgba(71, 85, 105, 0.95)' : 'rgba(195, 180, 160, 0.9)');
      ctx.lineWidth = 1.2;

      const rx = sim.x - textW / 2 - padX;
      const ry = labelY - 2;
      const rw = textW + padX * 2;
      const rh = 19;
      const rRadius = 5;

      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, rRadius);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSelected ? '#ffffff' : (isDark ? '#f1f5f9' : '#1a1610');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(truncated, sim.x, labelY + 1);
      ctx.restore();

      ctx.restore();
    });

    // Close Camera Transform
    ctx.restore();

    // Expose rendered screen-space metrics for layout telemetry & E2E verification
    const renderedNodes: Array<{ id: string; type: string; screenX: number; screenY: number; radius: number }> = [];
    simNodes.forEach(sim => {
      renderedNodes.push({
        id: sim.id,
        type: sim.type,
        screenX: tx + sim.x * k,
        screenY: ty + sim.y * k,
        radius: sim.radius * k,
      });
    });
    (window as unknown as { __forensightGraphMetrics?: unknown }).__forensightGraphMetrics = {
      width,
      height,
      zoom: k,
      tx,
      ty,
      layoutMode,
      nodes: renderedNodes,
    };
  }, [graphData, selectedNode, hoveredNode, searchQuery, layoutMode, isDark]);

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

  // Handle Canvas & Container Resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || simNodesRef.current.size === 0) return;
      autoFitView(Array.from(simNodesRef.current.values()));
    };

    window.addEventListener('resize', handleResize);
    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [loading]);

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
    return <GraphWorkspaceSkeleton />;
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
  const visibleNodeIds = new Set(currentNodesList.map(n => n.id));
  const visibleEdgeCount = graphData.edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)).length;
  const isEmptyCaseGraph = graphData.nodes.length <= 1 && graphData.edges.length === 0;
  const allAvailableTypes = ['ALL', 'CASE', 'EVIDENCE', 'FINDING', 'OBSERVATION', 'ANALYSIS', 'REPORT'];
  const analysisCount = graphData.nodes.filter(n => n.type === 'ANALYSIS').length;
  const artifactCount = graphData.nodes.filter(n => n.type === 'ARTIFACT').length;

  const overlaySurface = isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(254, 251, 246, 0.92)';
  const overlayBorder = isDark ? '1px solid var(--border-color)' : '1px solid rgba(255, 255, 255, 0.90)';

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
          background: isDark ? '#0f172a' : '#f6f2eb',
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
                background: overlaySurface,
                backdropFilter: 'blur(12px)',
                border: overlayBorder,
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                padding: '0.25rem',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.14)'
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

            {/* Empty-Case Guidance Banner */}
            {isEmptyCaseGraph && (
              <div
                data-testid="graph-empty-state"
                style={{
                  position: 'absolute',
                  bottom: '3.25rem',
                  left: '1.2rem',
                  right: '1.2rem',
                  maxWidth: '480px',
                  background: overlaySurface,
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '0.9rem 1.05rem',
                  boxShadow: 'var(--shadow-card)',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    No evidence or relationships recorded yet
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Acquire and register evidence to populate analyses, observations, findings, and provenance links.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/cases/${caseId}/evidence/new`)}
                  style={{ whiteSpace: 'nowrap', fontSize: '0.76rem', padding: '0.45rem 0.85rem', flexShrink: 0 }}
                >
                  Acquire Evidence
                </button>
              </div>
            )}

            {/* Quick Live Node & Link Count Pill (Bottom-Left) */}
            <div
              data-testid="graph-stats-pill"
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1.2rem',
                background: overlaySurface,
                backdropFilter: 'blur(10px)',
                border: overlayBorder,
                borderRadius: '20px',
                padding: '0.25rem 0.75rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-tech)',
                letterSpacing: '0.04em',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                zIndex: 10
              }}
            >
              {currentNodesList.length} NODES • {visibleEdgeCount} LINKS • {layoutMode === 'dag' ? 'PIPELINE DAG' : 'SATELLITE CLUSTERS'}
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
                    onClick={() => {
                      setSelectedNode(node);
                      setActiveRightTab('inspector');
                    }}
                    style={{ 
                      background: isSelected ? 'var(--surface-color)' : 'var(--surface-color-light)',
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
          background: 'var(--surface-color-light)',
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
              background: activeRightTab === 'controls' ? 'var(--surface-color)' : 'transparent',
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
              background: activeRightTab === 'inspector' ? 'var(--surface-color)' : 'transparent',
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
                    background: layoutMode === 'dag' ? 'var(--surface-color)' : 'transparent',
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
                    background: layoutMode === 'cluster' ? 'var(--surface-color)' : 'transparent',
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
                        background: isSelected ? 'var(--primary-color)' : 'var(--surface-color-light)',
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
          <div
            data-testid="inspector-scroll-panel"
            onWheel={e => e.stopPropagation()}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
          >
            {selectedNode ? (() => {
              const cfg = TYPE_CONFIG[selectedNode.type] || DEFAULT_CONFIG;
              const connectedEdges = graphData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div>
                      <span style={{ 
                        fontSize: '0.68rem', 
                        fontWeight: 800, 
                        color: isDark ? cfg.border : cfg.fill,
                        background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
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
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
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
                  <div style={{ flexShrink: 0 }}>
                    <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                      Metadata Attributes ({Object.keys(selectedNode.metadata || {}).length})
                    </h4>
                    <div style={{ 
                      background: 'var(--surface-color-light)', 
                      border: '1px solid var(--border-color-translucent)', 
                      borderRadius: '10px', 
                      padding: '0.75rem', 
                      fontSize: '0.76rem',
                      maxHeight: '240px',
                      overflowY: 'auto',
                      overscrollBehavior: 'contain'
                    }}>
                      {Object.keys(selectedNode.metadata || {}).length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No additional metadata attributes recorded for this node.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {Object.entries(selectedNode.metadata).map(([k, v]) => (
                              <tr key={k} style={{ borderBottom: '1px solid var(--border-color-translucent)' }}>
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
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexShrink: 0 }}>
                      <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                        Connected Links
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {connectedEdges.length} links
                      </span>
                    </div>

                    <div
                      data-testid="inspector-connected-links"
                      onWheel={e => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        paddingRight: '0.2rem'
                      }}
                    >
                      {connectedEdges.map((e, idx) => {
                        const targetId = e.source === selectedNode.id ? e.target : e.source;
                        const targetNode = graphData.nodes.find(n => n.id === targetId);

                        return (
                          <div 
                            key={idx} 
                            data-testid={`inspector-link-item-${idx}`}
                            style={{ 
                              background: 'var(--surface-color-light)', 
                              padding: '0.45rem 0.65rem', 
                              borderRadius: '8px', 
                              border: '1px solid var(--border-color-translucent)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexShrink: 0,
                              cursor: targetNode ? 'pointer' : 'default',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => targetNode && handleCenterOnNode(targetNode)}
                            title={targetNode ? `Jump to ${targetNode.label}` : ''}
                          >
                            <div style={{ minWidth: 0, paddingRight: '0.5rem' }}>
                              <span style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.7rem', fontFamily: 'var(--font-tech)' }}>{e.type}</span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-main)', marginTop: '0.1rem', wordBreak: 'break-word' }}>
                                {e.source === selectedNode.id ? `→ ${targetNode ? cleanLabel(targetNode.label, targetNode.type) : e.target}` : `← ${targetNode ? cleanLabel(targetNode.label, targetNode.type) : e.source}`}
                              </div>
                            </div>
                            {targetNode && <ArrowRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
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
