import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
  Maximize2
} from 'lucide-react';

interface Finding {
  id: number;
  finding_identifier: string;
  evidence_id?: number;
  correlation_rule_id?: string;
  finding_type: string;
  severity_label: string;
  title: string;
  summary: string;
  interpretation?: string;
  limitations?: string;
  status: string;
  reviewer?: string;
  review_timestamp?: string;
  review_note?: string;
  decision?: string;
  created_at: string;
}

interface AnalystNote {
  id: number;
  note_identifier: string;
  author: string;
  target_type: string;
  target_id: string;
  content: string;
  created_at: string;
}

interface GraphData {
  case_id: string;
  nodes: Array<{ id: string; type: string; label: string; metadata: any }>;
  edges: Array<{ source: string; target: string; type: string }>;
}

interface SimNode {
  id: string;
  type: string;
  label: string;
  metadata: any;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const TYPE_COLORS: Record<string, { fill: string; border: string; text: string }> = {
  CASE: { fill: '#2563eb', border: '#1d4ed8', text: '#ffffff' },
  EVIDENCE: { fill: '#059669', border: '#047857', text: '#ffffff' },
  ANALYSIS_JOB: { fill: '#475569', border: '#334155', text: '#ffffff' },
  ANALYSIS: { fill: '#7c3aed', border: '#6d28d9', text: '#ffffff' },
  ARTIFACT: { fill: '#db2777', border: '#be185d', text: '#ffffff' },
  OBSERVATION: { fill: '#d97706', border: '#b45309', text: '#ffffff' },
  FINDING: { fill: '#dc2626', border: '#b91c1c', text: '#ffffff' },
  REPORT: { fill: '#0891b2', border: '#0e7490', text: '#ffffff' },
};

const DEFAULT_COLOR = { fill: '#64748b', border: '#475569', text: '#ffffff' };

const AnalystWorkspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

  const [activeTab, setActiveTab] = useState<'findings' | 'graph' | 'notes' | 'search'>('findings');
  
  // Findings state
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState('CONFIRMED_BY_ANALYST');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Graph state & simulation
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [provenanceData, setProvenanceData] = useState<any | null>(null);
  const [graphMode, setGraphMode] = useState<'graph' | 'tree'>('graph');
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);
  const [subGraphView, setSubGraphView] = useState<'graph' | 'grid'>('graph');
  const [graphFilterType, setGraphFilterType] = useState<string>('ALL');
  const [graphSearchQuery, setGraphSearchQuery] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 0.85 });
  const isDraggingCanvasRef = useRef(false);
  const draggedNodeRef = useRef<SimNode | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const animFrameRef = useRef<number | null>(null);

  const initSimulation = (data: GraphData) => {
    const simMap = new Map<string, SimNode>();
    const tiers: Record<string, any[]> = {
      CASE: [], EVIDENCE: [], ANALYSIS_JOB: [], ANALYSIS: [], OBSERVATION: [], FINDING: [], ARTIFACT: [], REPORT: [], OTHER: []
    };

    data.nodes.forEach(n => {
      if (tiers[n.type]) tiers[n.type].push(n);
      else tiers.OTHER.push(n);
    });

    tiers.CASE.forEach((n, i) => {
      simMap.set(n.id, { ...n, x: (i - (tiers.CASE.length - 1) / 2) * 160, y: 0, vx: 0, vy: 0, radius: 22 });
    });

    const evRadius = Math.max(180, tiers.EVIDENCE.length * 45);
    tiers.EVIDENCE.forEach((n, i) => {
      const angle = (i / Math.max(1, tiers.EVIDENCE.length)) * 2 * Math.PI;
      simMap.set(n.id, { ...n, x: Math.cos(angle) * evRadius, y: Math.sin(angle) * evRadius, vx: 0, vy: 0, radius: 18 });
    });

    const jobs = [...tiers.ANALYSIS_JOB, ...tiers.ANALYSIS];
    const jobRadius = evRadius + Math.max(180, jobs.length * 15);
    jobs.forEach((n, i) => {
      const angle = (i / Math.max(1, jobs.length)) * 2 * Math.PI + 0.15;
      simMap.set(n.id, { ...n, x: Math.cos(angle) * jobRadius, y: Math.sin(angle) * jobRadius, vx: 0, vy: 0, radius: n.type === 'ANALYSIS' ? 14 : 12 });
    });

    const outer = [...tiers.OBSERVATION, ...tiers.FINDING, ...tiers.ARTIFACT, ...tiers.REPORT, ...tiers.OTHER];
    const outerRadius = jobRadius + Math.max(160, outer.length * 12);
    outer.forEach((n, i) => {
      const angle = (i / Math.max(1, outer.length)) * 2 * Math.PI + 0.3;
      simMap.set(n.id, { ...n, x: Math.cos(angle) * outerRadius + (Math.random() - 0.5) * 40, y: Math.sin(angle) * outerRadius + (Math.random() - 0.5) * 40, vx: 0, vy: 0, radius: n.type === 'FINDING' ? 15 : 11 });
    });

    const nodes = Array.from(simMap.values());
    for (let step = 0; step < 90; step++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 1;
          const minDist = a.radius + b.radius + 35;
          if (distSq < minDist * minDist * 4) {
            const force = 1800 / distSq;
            const dist = Math.sqrt(distSq);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      data.edges.forEach(e => {
        const u = simMap.get(e.source);
        const v = simMap.get(e.target);
        if (u && v) {
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desired = u.radius + v.radius + 70;
          const force = (dist - desired) * 0.035;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          u.vx += fx;
          u.vy += fy;
          v.vx -= fx;
          v.vy -= fy;
        }
      });

      nodes.forEach(n => {
        n.vx -= n.x * 0.003;
        n.vy -= n.y * 0.003;
        n.x += n.vx * 0.35;
        n.y += n.vy * 0.35;
        n.vx *= 0.65;
        n.vy *= 0.65;
      });
    }

    simNodesRef.current = simMap;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      transformRef.current = {
        x: rect.width / 2,
        y: rect.height / 2,
        k: data.nodes.length > 60 ? 0.65 : 0.85
      };
    }
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const { x: tx, y: ty, k } = transformRef.current;
    ctx.save();
    ctx.fillStyle = '#f8f5ee';
    ctx.fillRect(0, 0, width, height);

    const gridSize = 32 * k;
    if (gridSize > 12) {
      ctx.fillStyle = 'rgba(215, 205, 190, 0.45)';
      const startX = (tx % gridSize + gridSize) % gridSize;
      const startY = (ty % gridSize + gridSize) % gridSize;
      for (let x = startX; x < width; x += gridSize) {
        for (let y = startY; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const simNodes = simNodesRef.current;
    const activeNode = hoveredNode || selectedNode;

    const connectedNodeIds = new Set<string>();
    if (activeNode) {
      connectedNodeIds.add(activeNode.id);
      graphData.edges.forEach(e => {
        if (e.source === activeNode.id) connectedNodeIds.add(e.target);
        if (e.target === activeNode.id) connectedNodeIds.add(e.source);
      });
    }

    graphData.edges.forEach(e => {
      const u = simNodes.get(e.source);
      const v = simNodes.get(e.target);
      if (!u || !v) return;

      const isConnectedToActive = activeNode && (e.source === activeNode.id || e.target === activeNode.id);
      const isDimmed = activeNode && !isConnectedToActive;

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(v.x, v.y);

      if (isConnectedToActive) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.95;
      } else if (isDimmed) {
        ctx.strokeStyle = 'rgba(210, 200, 185, 0.4)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
      } else {
        ctx.strokeStyle = 'rgba(180, 168, 150, 0.65)';
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.65;
      }
      ctx.stroke();

      if (k > 0.45 && !isDimmed) {
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > v.radius + 15) {
          const arrowX = v.x - Math.cos(angle) * (v.radius + 5);
          const arrowY = v.y - Math.sin(angle) * (v.radius + 5);
          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.fillStyle = isConnectedToActive ? '#2563eb' : 'rgba(160, 148, 130, 0.85)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-7, -3.5);
          ctx.lineTo(-7, 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      if ((k > 0.85 || isConnectedToActive) && !isDimmed) {
        const midX = (u.x + v.x) / 2;
        const midY = (u.y + v.y) / 2;
        ctx.save();
        ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = isConnectedToActive ? '#1e40af' : '#786c5a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.type, midX, midY - 6);
        ctx.restore();
      }
    });

    ctx.globalAlpha = 1.0;

    graphData.nodes.forEach(n => {
      const sim = simNodes.get(n.id);
      if (!sim) return;

      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const isConnected = connectedNodeIds.has(n.id);
      const isDimmed = activeNode && !isConnected;

      const matchesType = graphFilterType === 'ALL' || n.type === graphFilterType;
      const matchesSearch = !graphSearchQuery.trim() || n.label.toLowerCase().includes(graphSearchQuery.toLowerCase());
      const isFilteredOut = !matchesType || !matchesSearch;

      ctx.save();
      if (isFilteredOut) {
        ctx.globalAlpha = 0.15;
      } else if (isDimmed) {
        ctx.globalAlpha = 0.28;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const colors = TYPE_COLORS[n.type] || DEFAULT_COLOR;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, sim.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.25)' : 'rgba(245, 158, 11, 0.25)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(sim.x, sim.y, sim.radius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? '#ffffff' : colors.border;
      ctx.stroke();

      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.max(8, Math.round(sim.radius * 0.58))}px "Plus Jakarta Sans", sans-serif`;
      const shortCode = n.type === 'CASE' ? 'CS' : n.type === 'EVIDENCE' ? 'EV' : n.type === 'ANALYSIS_JOB' ? 'JOB' : n.type === 'FINDING' ? 'FD' : n.type === 'OBSERVATION' ? 'OB' : n.type === 'ARTIFACT' ? 'ART' : 'AN';
      ctx.fillText(shortCode, sim.x, sim.y);

      if (k > 0.45 || isSelected || isHovered) {
        ctx.save();
        ctx.font = `${isSelected || isHovered ? '700' : '600'} 10px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelText = n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label;
        const textMetrics = ctx.measureText(labelText);
        const padX = 4;
        const textWidth = textMetrics.width;
        const labelY = sim.y + sim.radius + 4;

        ctx.fillStyle = 'rgba(250, 247, 241, 0.88)';
        ctx.fillRect(sim.x - textWidth / 2 - padX, labelY - 1, textWidth + padX * 2, 14);

        ctx.fillStyle = isSelected ? '#1e3a8a' : '#1a1610';
        ctx.fillText(labelText, sim.x, labelY);
        ctx.restore();
      }

      ctx.restore();
    });

    ctx.restore();
    ctx.restore();
  }, [graphData, selectedNode, hoveredNode, graphFilterType, graphSearchQuery]);

  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      if (activeTab === 'graph' && graphMode === 'graph' && subGraphView === 'graph') {
        renderCanvas();
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeTab, graphMode, subGraphView, renderCanvas]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    if (activeTab === 'graph' && graphMode === 'graph') {
      handleResize();
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, graphMode]);

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
      if (dx * dx + dy * dy <= (node.radius + 6) * (node.radius + 6)) {
        return node;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: gx, y: gy, rawX, rawY } = getGraphCoords(e);
    const clickedNode = findNodeAtCoords(gx, gy);

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      dragStartRef.current = { mouseX: rawX, mouseY: rawY, startX: clickedNode.x, startY: clickedNode.y };
      setSelectedNode(clickedNode);
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
    const newK = Math.max(0.15, Math.min(3.5, transformRef.current.k * zoomFactor));

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
    const newK = Math.max(0.15, transformRef.current.k * 0.8);
    transformRef.current.x = cx - (cx - transformRef.current.x) * (newK / transformRef.current.k);
    transformRef.current.y = cy - (cy - transformRef.current.y) * (newK / transformRef.current.k);
    transformRef.current.k = newK;
  };

  const handleResetView = () => {
    if (!containerRef.current || !graphData) return;
    const rect = containerRef.current.getBoundingClientRect();
    transformRef.current = {
      x: rect.width / 2,
      y: rect.height / 2,
      k: graphData.nodes.length > 60 ? 0.65 : 0.85
    };
  };

  const handleCenterOnNode = (node: any) => {
    const sim = simNodesRef.current.get(node.id);
    if (!sim || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    transformRef.current = {
      x: rect.width / 2 - sim.x * 1.1,
      y: rect.height / 2 - sim.y * 1.1,
      k: 1.1
    };
    setSelectedNode(node);
  };

  // Notes state
  const [notes, setNotes] = useState<AnalystNote[]>([]);
  const [targetType, setTargetType] = useState('EVIDENCE');
  const [targetId, setTargetId] = useState('1');
  const [noteContent, setNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchFindings = () => {
    setLoadingFindings(true);
    fetchApi(`/cases/${caseId}/findings`)
      .then(res => res.json())
      .then(data => {
        setFindings(Array.isArray(data) ? data : []);
        setLoadingFindings(false);
      })
      .catch(() => setLoadingFindings(false));
  };

  const fetchGraph = () => {
    setLoadingGraph(true);
    Promise.all([
      fetchApi(`/cases/${caseId}/graph`).then(r => r.json()),
      fetchApi(`/cases/${caseId}/provenance`).then(r => r.json())
    ])
      .then(([gData, pData]) => {
        setGraphData(gData);
        setProvenanceData(pData);
        initSimulation(gData);
        setLoadingGraph(false);
      })
      .catch(() => setLoadingGraph(false));
  };

  const fetchNotes = () => {
    fetchApi(`/cases/${caseId}/notes`)
      .then(res => res.json())
      .then(data => setNotes(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (caseId) {
      fetchFindings();
      fetchGraph();
      fetchNotes();
    }
  }, [caseId]);

  const handleRunCorrelations = () => {
    setEvaluating(true);
    fetchApi(`/cases/${caseId}/correlations/run`, { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setEvaluating(false);
        fetchFindings();
        fetchGraph();
      })
      .catch(() => setEvaluating(false));
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding) return;
    setSubmittingReview(true);

    fetchApi(`/cases/${caseId}/findings/${selectedFinding.finding_identifier}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status: reviewStatus,
        review_note: reviewNote,
        decision: reviewStatus,
      })
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to submit review');
        return res.json();
      })
      .then(() => {
        setSubmittingReview(false);
        setSelectedFinding(null);
        setReviewNote('');
        fetchFindings();
      })
      .catch(err => {
        alert(err.message);
        setSubmittingReview(false);
      });
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSubmittingNote(true);

    fetchApi(`/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        content: noteContent.trim(),
      })
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to create note');
        return res.json();
      })
      .then(() => {
        setSubmittingNote(false);
        setNoteContent('');
        fetchNotes();
      })
      .catch(err => {
        alert(err.message);
        setSubmittingNote(false);
      });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);

    fetchApi(`/cases/${caseId}/search?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(res => res.json())
      .then(data => {
        setSearchResults(data.hits || []);
        setSearching(false);
      })
      .catch(() => setSearching(false));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--primary-color)', textTransform: 'uppercase', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                FORENSIC INTELLIGENCE SUITE
              </span>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                ANALYST ACTIVE
              </span>
            </div>
            <h2 className="card-title" style={{ margin: 0 }}>Analyst Investigation Workspace</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Cross-modality correlation, observation graph traversal, conflict analysis, and investigative review
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button 
              className="primary-button" 
              onClick={handleRunCorrelations}
              disabled={evaluating}
            >
              {evaluating ? 'Evaluating Rules...' : 'Run Correlation Engine'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => setActiveTab('findings')}
            className={activeTab === 'findings' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Correlated Findings ({findings.length})
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={activeTab === 'graph' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Observation Graph & Provenance
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={activeTab === 'notes' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Analyst Notes ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={activeTab === 'search' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Investigation Search
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: Correlated Findings Hub                                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'findings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Conflict Notice Banner */}
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', borderLeft: '4px solid #f59e0b', padding: '0.85rem 1rem', borderRadius: '4px', fontSize: '0.85rem' }}>
            <strong>Scientific Methodology Notice:</strong> Correlated findings represent deterministic intersection of objective observations (e.g. metadata software tags, ELA block variance, keypoint clustering). ForenSight distinguishes <em>Negative Evidence</em> (incompatible formats or absent tags) from <em>No Evidence</em>. No synthetic manipulation percentages are generated.
          </div>

          {loadingFindings ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading findings...</div>
          ) : findings.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                No correlated findings have been generated yet. Click "Run Correlation Engine" to evaluate observations against deterministic rules.
              </div>
              <button className="primary-button" onClick={handleRunCorrelations} disabled={evaluating}>
                Run Correlation Engine
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: selectedFinding ? '1fr 420px' : '1fr', gap: '1.25rem' }}>
              {/* Findings List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {findings.map(fnd => {
                  const isConflict = fnd.finding_type === 'CONFLICT_DETECTED';
                  const isReviewRequired = fnd.severity_label === 'REVIEW_REQUIRED';
                  const statusColor = fnd.status === 'CONFIRMED_BY_ANALYST' ? '#10b981' : fnd.status === 'DISMISSED' ? '#64748b' : isConflict ? '#ec4899' : isReviewRequired ? '#f59e0b' : 'var(--primary-color)';

                  return (
                    <div 
                      key={fnd.id}
                      className="card"
                      style={{ 
                        margin: 0, 
                        borderLeft: `4px solid ${statusColor}`,
                        cursor: 'pointer',
                        borderColor: selectedFinding?.id === fnd.id ? 'var(--primary-color)' : undefined
                      }}
                      onClick={() => { setSelectedFinding(fnd); setReviewStatus(fnd.status); setReviewNote(fnd.review_note || ''); }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', background: 'var(--surface-color-light)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                              {fnd.correlation_rule_id || 'CORR-RULE'}
                            </span>
                            <span className="badge" style={{ fontSize: '0.7rem' }}>
                              {fnd.finding_type}
                            </span>
                            <span className="badge" style={{ fontSize: '0.7rem', background: statusColor, color: 'white' }}>
                              {fnd.status}
                            </span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-color)' }}>{fnd.title}</h3>
                        </div>
                        <button 
                          className="secondary-button" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => { e.stopPropagation(); setSelectedFinding(fnd); setReviewStatus(fnd.status); setReviewNote(fnd.review_note || ''); }}
                        >
                          Review &rarr;
                        </button>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        {fnd.summary}
                      </div>

                      {fnd.interpretation && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-color-light)', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                          <strong>Interpretation:</strong> {fnd.interpretation}
                        </div>
                      )}

                      {fnd.limitations && (
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontStyle: 'italic' }}>
                          <strong>Limitation:</strong> {fnd.limitations}
                        </div>
                      )}

                      {fnd.reviewer && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Reviewed by <strong>{fnd.reviewer}</strong> ({fnd.decision}) • {new Date(fnd.review_timestamp || '').toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Review Sidebar */}
              {selectedFinding && (
                <div className="card" style={{ height: 'fit-content', position: 'sticky', top: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Analyst Review Decision</h3>
                    <button 
                      onClick={() => setSelectedFinding(null)} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
                    Finding: <strong style={{ color: 'var(--text-color)' }}>{selectedFinding.finding_identifier}</strong>
                  </div>

                  <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                        REVIEW DECISION / STATE
                      </label>
                      <select 
                        value={reviewStatus}
                        onChange={e => setReviewStatus(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                      >
                        <option value="ACKNOWLEDGED">ACKNOWLEDGED (Noted, further review required)</option>
                        <option value="CONFIRMED_BY_ANALYST">CONFIRMED_BY_ANALYST (Concur with technical indicators)</option>
                        <option value="DISMISSED">DISMISSED (Innocent explanation / Non-relevant)</option>
                        <option value="INCONCLUSIVE">INCONCLUSIVE (Ambiguous technical markers)</option>
                        <option value="REVIEW_REQUIRED">REVIEW_REQUIRED (Reset to pending)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                        EXPLANATORY ANALYST REVIEW NOTE
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Document your technical rationale, reference observations, or external context..."
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        type="submit" 
                        className="primary-button" 
                        style={{ flex: 1 }}
                        disabled={submittingReview}
                      >
                        {submittingReview ? 'Recording...' : 'Record Review'}
                      </button>
                      <button 
                        type="button" 
                        className="secondary-button" 
                        onClick={() => setSelectedFinding(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: Observation Graph & Provenance                          */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'graph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={graphMode === 'graph' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setGraphMode('graph')}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Observation Network Graph
                </button>
                <button
                  className={graphMode === 'tree' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setGraphMode('tree')}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Hierarchical Provenance Tree
                </button>
              </div>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {graphData ? `${graphData.nodes.length} Nodes • ${graphData.edges.length} Edges` : ''}
              </span>
            </div>

            {loadingGraph ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin-animate" style={{ color: '#06b6d4', marginBottom: '0.5rem', display: 'inline-block' }} />
                <div>Loading observation graph and provenance relationships...</div>
              </div>
            ) : graphMode === 'graph' && graphData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Graph Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '0.55rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                      <input 
                        type="text"
                        placeholder="Search nodes..."
                        value={graphSearchQuery}
                        onChange={e => setGraphSearchQuery(e.target.value)}
                        style={{ 
                          padding: '0.35rem 0.6rem 0.35rem 1.75rem', 
                          fontSize: '0.78rem', 
                          background: 'var(--surface-color-light)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '6px', 
                          color: 'var(--text-main)',
                          width: '160px'
                        }}
                      />
                    </div>

                    <select
                      value={graphFilterType}
                      onChange={e => setGraphFilterType(e.target.value)}
                      style={{ 
                        padding: '0.35rem 0.6rem', 
                        fontSize: '0.78rem', 
                        background: 'var(--surface-color-light)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '6px', 
                        color: 'var(--text-main)' 
                      }}
                    >
                      <option value="ALL">All Node Types ({graphData.nodes.length})</option>
                      {Array.from(new Set(graphData.nodes.map(n => n.type))).map(t => (
                        <option key={t} value={t}>{t} ({graphData.nodes.filter(n => n.type === t).length})</option>
                      ))}
                    </select>
                  </div>

                  {/* View Mode Switcher */}
                  <div style={{ display: 'flex', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '0.15rem' }}>
                    <button
                      type="button"
                      onClick={() => setSubGraphView('graph')}
                      style={{
                        background: subGraphView === 'graph' ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: subGraphView === 'graph' ? '#2563eb' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        boxShadow: subGraphView === 'graph' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      <Network size={13} />
                      <span>Visual Canvas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubGraphView('grid')}
                      style={{
                        background: subGraphView === 'grid' ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: subGraphView === 'grid' ? '#2563eb' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        boxShadow: subGraphView === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      <Grid size={13} />
                      <span>Entity Cards</span>
                    </button>
                  </div>
                </div>

                {/* Main Graph Content Area */}
                <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr', gap: '1rem', minHeight: '520px' }}>
                  {subGraphView === 'graph' ? (
                    /* Visual Network Graph Canvas */
                    <div 
                      ref={containerRef}
                      style={{ 
                        position: 'relative', 
                        minHeight: '520px', 
                        borderRadius: '10px', 
                        overflow: 'hidden', 
                        border: '1px solid var(--border-color)', 
                        background: '#f8f5ee',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <canvas 
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onWheel={handleWheel}
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          flex: 1, 
                          display: 'block', 
                          cursor: isDraggingCanvasRef.current ? 'grabbing' : draggedNodeRef.current ? 'grabbing' : hoveredNode ? 'pointer' : 'grab' 
                        }}
                      />

                      {/* Zoom Controls Overlay */}
                      <div style={{
                        position: 'absolute',
                        top: '0.85rem',
                        left: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(250, 247, 241, 0.94)',
                        backdropFilter: 'blur(6px)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '0.2rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        zIndex: 10
                      }}>
                        <button
                          type="button"
                          onClick={handleZoomIn}
                          title="Zoom In"
                          style={{ background: 'transparent', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ZoomIn size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={handleZoomOut}
                          title="Zoom Out"
                          style={{ background: 'transparent', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ZoomOut size={15} />
                        </button>
                        <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.15rem 0.2rem' }} />
                        <button
                          type="button"
                          onClick={handleResetView}
                          title="Reset View"
                          style={{ background: 'transparent', border: 'none', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>

                      {/* Legend Bar */}
                      <div style={{
                        position: 'absolute',
                        bottom: '0.75rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(250, 247, 241, 0.94)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '20px',
                        padding: '0.3rem 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                        zIndex: 10,
                        flexWrap: 'wrap',
                        maxWidth: '94%'
                      }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Legend:</span>
                        {Array.from(new Set(graphData.nodes.map(n => n.type))).map(t => {
                          const colors = TYPE_COLORS[t] || DEFAULT_COLOR;
                          const isSelected = graphFilterType === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setGraphFilterType(graphFilterType === t ? 'ALL' : t)}
                              style={{
                                background: isSelected ? 'rgba(0,0,0,0.08)' : 'transparent',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '0.1rem 0.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: isSelected ? 800 : 600,
                                color: 'var(--text-main)'
                              }}
                            >
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: colors.fill }} />
                              <span>{t}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                ({graphData.nodes.filter(n => n.type === t).length})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Categorized Entity Cards Grid with Clear High-Contrast Text */
                    <div style={{ 
                      maxHeight: '560px', 
                      overflowY: 'auto', 
                      padding: '0.85rem', 
                      background: 'var(--surface-color-light)', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)' 
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.65rem' }}>
                        {graphData.nodes
                          .filter(n => graphFilterType === 'ALL' || n.type === graphFilterType)
                          .filter(n => !graphSearchQuery.trim() || n.label.toLowerCase().includes(graphSearchQuery.toLowerCase()))
                          .map(n => {
                            const colors = TYPE_COLORS[n.type] || DEFAULT_COLOR;
                            const isSelected = selectedNode?.id === n.id;

                            return (
                              <div
                                key={n.id}
                                onClick={() => setSelectedNode(n)}
                                style={{
                                  border: `1.5px solid ${isSelected ? colors.fill : 'var(--border-color)'}`,
                                  borderLeft: `4px solid ${colors.fill}`,
                                  background: isSelected ? 'var(--surface-color)' : '#ffffff',
                                  borderRadius: '6px',
                                  padding: '0.75rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  boxShadow: isSelected ? '0 3px 10px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.03)'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: colors.fill, textTransform: 'uppercase' }}>
                                    {n.type}
                                  </span>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {n.id.split(':')[0]}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-word', marginBottom: '0.2rem' }}>
                                  {n.label}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  Click to inspect details &rarr;
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Node Inspector Drawer */}
                  {selectedNode ? (() => {
                    const colors = TYPE_COLORS[selectedNode.type] || DEFAULT_COLOR;
                    const connectedEdges = graphData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);

                    return (
                      <div className="card" style={{ height: 'fit-content', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', borderLeft: `4px solid ${colors.fill}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: 800, 
                              color: colors.fill, 
                              background: 'rgba(0,0,0,0.05)', 
                              padding: '0.15rem 0.45rem', 
                              borderRadius: '4px', 
                              textTransform: 'uppercase' 
                            }}>
                              {selectedNode.type} NODE
                            </span>
                            <h4 style={{ margin: '0.35rem 0 0.15rem', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                              {selectedNode.label}
                            </h4>
                            <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                              {selectedNode.id}
                            </code>
                          </div>
                          <button 
                            onClick={() => setSelectedNode(null)} 
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                            aria-label="Close inspector"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        {/* Focus in graph button */}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleCenterOnNode(selectedNode)}
                          style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', alignSelf: 'flex-start' }}
                        >
                          <Maximize2 size={12} />
                          <span>Focus in Visual Graph</span>
                        </button>

                        {/* Metadata table */}
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                            Metadata Attributes
                          </div>
                          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.65rem', fontSize: '0.74rem' }}>
                            {Object.keys(selectedNode.metadata || {}).length === 0 ? (
                              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No additional metadata recorded.</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                  {Object.entries(selectedNode.metadata).map(([k, v]) => (
                                    <tr key={k} style={{ borderBottom: '1px solid var(--border-color-light, rgba(0,0,0,0.06))' }}>
                                      <td style={{ padding: '0.3rem 0', fontWeight: 700, color: 'var(--text-muted)', width: '40%' }}>{k}</td>
                                      <td style={{ padding: '0.3rem 0', textAlign: 'right', color: 'var(--text-main)', wordBreak: 'break-all', fontFamily: typeof v === 'number' || String(v).length > 20 ? 'monospace' : 'inherit' }}>
                                        {String(v)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>

                        {/* Connected edges */}
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                            Connected Relational Edges ({connectedEdges.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.74rem' }}>
                            {connectedEdges.length === 0 ? (
                              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.4rem' }}>No edges connected.</div>
                            ) : (
                              connectedEdges.map((e, idx) => {
                                const targetId = e.source === selectedNode.id ? e.target : e.source;
                                const targetNode = graphData.nodes.find(n => n.id === targetId);

                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      background: 'var(--surface-color-light)',
                                      padding: '0.45rem 0.65rem',
                                      borderRadius: '5px',
                                      border: '1px solid var(--border-color)',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      cursor: targetNode ? 'pointer' : 'default'
                                    }}
                                    onClick={() => targetNode && handleCenterOnNode(targetNode)}
                                    title={targetNode ? `Jump to ${targetNode.label}` : ''}
                                  >
                                    <div>
                                      <span style={{ fontWeight: 800, color: '#2563eb' }}>{e.type}</span>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-main)', marginTop: '0.1rem' }}>
                                        {e.source === selectedNode.id ? `→ ${targetNode?.label || e.target}` : `← ${targetNode?.label || e.source}`}
                                      </div>
                                    </div>
                                    {targetNode && <ArrowRight size={11} style={{ color: 'var(--text-muted)' }} />}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Network size={28} style={{ color: '#0891b2', opacity: 0.6 }} />
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>No Node Selected</div>
                      <div style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>Click any node in the graph to inspect its provenance links and metadata.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : provenanceData ? (
              /* Provenance Tree View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {provenanceData.root_evidence?.map((ev: any) => (
                  <div key={ev.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'var(--surface-color-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>ORIGINAL EVIDENCE</span>
                      <strong>{ev.label}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({ev.details?.mime_type})</span>
                    </div>

                    <div style={{ paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-color)', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {ev.children?.map((ch: any) => (
                        <div key={ch.id} style={{ background: 'var(--background-color)', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                            <span style={{ color: ch.type === 'HASH_SIGNATURE' ? '#10b981' : ch.type === 'ANALYSIS' ? '#8b5cf6' : '#f59e0b' }}>
                              [{ch.type}]
                            </span>
                            {ch.label}
                          </div>

                          {ch.children && ch.children.length > 0 && (
                            <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {ch.children.map((sub: any) => (
                                <div key={sub.id} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  &bull; <strong style={{ color: 'var(--text-main)' }}>{sub.label}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: Analyst Notes Stream                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'notes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>
          {/* Notes List */}
          <div className="card">
            <h3 className="card-title">Case Investigative Notes ({notes.length})</h3>

            {notes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No analyst notes recorded for this case yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {notes.map(n => (
                  <div key={n.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.85rem', background: 'var(--surface-color-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge" style={{ fontSize: '0.7rem' }}>
                          {n.target_type} #{n.target_id}
                        </span>
                        <strong style={{ fontSize: '0.85rem' }}>{n.author}</strong>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                      {n.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Note Form */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title">Add Analyst Note</h3>
            <form onSubmit={handleCreateNote} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Target Entity
                </label>
                <select
                  value={targetType}
                  onChange={e => setTargetType(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                >
                  <option value="EVIDENCE">Evidence Item</option>
                  <option value="ANALYSIS">Analysis Engine</option>
                  <option value="FINDING">Correlated Finding</option>
                  <option value="CASE">Case General</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Target ID / Identifier
                </label>
                <input 
                  type="text"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  placeholder="e.g. 1, FS-FND-XXXX..."
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Note Content
                </label>
                <textarea
                  rows={4}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Write investigative observations, hypothesis, or interview notes..."
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              <button type="submit" className="primary-button" disabled={submittingNote || !noteContent.trim()}>
                {submittingNote ? 'Saving...' : 'Post Note'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: Investigation Search                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'search' && (
        <div className="card">
          <h3 className="card-title">Case-Scoped Investigation Search</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Full-text search across evidence, jobs, analyses, correlated findings, analyst notes, and generated reports.
          </div>

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input 
              type="text"
              placeholder="Search across filename, hash, job ID, rule, note content..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '0.6rem 0.8rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
            />
            <button type="submit" className="primary-button" disabled={searching || !searchQuery.trim()}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {searchResults.map((hit, idx) => (
                <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.75rem', background: 'var(--surface-color-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge" style={{ fontSize: '0.7rem' }}>{hit.entity_type}</span>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--primary-color)' }}>{hit.title}</strong>
                    </div>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{hit.entity_id}</code>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                    {hit.snippet}
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery && !searching ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              No matches found for query "{searchQuery}" in this case.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AnalystWorkspace;
