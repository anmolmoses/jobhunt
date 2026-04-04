"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, Users, Link2, Mail, Calendar, MessageSquare, Building2,
  X, ExternalLink, Search, Briefcase, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ============ Types ============

interface GraphNode {
  id: string;
  name: string;
  type: "company" | "person";
  connectionCount?: number;
  hasSavedJob?: boolean;
  logoUrl?: string;
  company?: string;
  position?: string;
  profileUrl?: string;
  email?: string;
  connectedOn?: string;
  hasMessages?: boolean;
  messageCount?: number;
  initials?: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  hasImport: boolean;
  stats?: {
    totalCompanies: number;
    visibleCompanies: number;
    visiblePeople: number;
    savedJobMatches: number;
  };
}

// ============ Image cache ============

const imageCache = new Map<string, HTMLImageElement | null>();
let imageLoadCallback: (() => void) | null = null;

function getCachedImage(url: string): HTMLImageElement | null {
  if (imageCache.has(url)) return imageCache.get(url) || null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  imageCache.set(url, null); // placeholder while loading
  img.onload = () => {
    imageCache.set(url, img);
    imageLoadCallback?.(); // trigger graph re-render
  };
  img.onerror = () => imageCache.set(url, null);
  return null;
}

// ============ Colors ============

const COLORS = {
  savedJob: { bg: "#3b82f6", glow: "rgba(59, 130, 246, 0.25)", text: "#2563eb", ring: "#93c5fd" },
  company: { bg: "#475569", glow: "rgba(71, 85, 105, 0.2)", text: "#334155", ring: "#94a3b8" },
  person: { bg: "#94a3b8", glow: "rgba(148, 163, 184, 0.15)", text: "#64748b" },
  link: { normal: "rgba(148, 163, 184, 0.08)", highlighted: "rgba(59, 130, 246, 0.3)", dimmed: "rgba(148, 163, 184, 0.03)" },
};

// ============ Component ============

export function NetworkMap() {
  const { toast } = useToast();
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [, setImageTick] = useState(0);

  // Register callback so image loads trigger canvas re-render
  useEffect(() => {
    imageLoadCallback = () => setImageTick((t) => t + 1);
    return () => { imageLoadCallback = null; };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: Math.max(550, window.innerHeight - 320) });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    fetch("/api/linkedin/graph")
      .then((res) => res.json())
      .then((data: GraphData) => {
        setGraphData(data);
        // Preload all company logos immediately
        for (const node of data.nodes || []) {
          if (node.type === "company" && node.logoUrl) {
            getCachedImage(node.logoUrl);
          }
        }
      })
      .catch(() => toast("Failed to load network graph", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  // Filter graph data
  const filteredData = useMemo(() => {
    if (!graphData || !graphData.nodes.length) return { nodes: [], links: [] };
    let nodes = graphData.nodes;
    let links = graphData.links;

    if (showSavedOnly) {
      const savedCompanyIds = new Set(
        nodes.filter((n) => n.type === "company" && n.hasSavedJob).map((n) => n.id)
      );
      nodes = nodes.filter((n) => {
        if (n.type === "company") return n.hasSavedJob;
        return links.some((l) => {
          const src = typeof l.source === "string" ? l.source : l.source.id;
          const tgt = typeof l.target === "string" ? l.target : l.target.id;
          return (src === n.id && savedCompanyIds.has(tgt)) || (tgt === n.id && savedCompanyIds.has(src));
        });
      });
      const nodeIds = new Set(nodes.map((n) => n.id));
      links = links.filter((l) => {
        const src = typeof l.source === "string" ? l.source : l.source.id;
        const tgt = typeof l.target === "string" ? l.target : l.target.id;
        return nodeIds.has(src) && nodeIds.has(tgt);
      });
    }

    if (search) {
      const s = search.toLowerCase();
      const matchingNodeIds = new Set<string>();
      for (const n of nodes) {
        if (n.name.toLowerCase().includes(s) || n.company?.toLowerCase().includes(s) || n.position?.toLowerCase().includes(s)) {
          matchingNodeIds.add(n.id);
          for (const l of links) {
            const src = typeof l.source === "string" ? l.source : l.source.id;
            const tgt = typeof l.target === "string" ? l.target : l.target.id;
            if (src === n.id) matchingNodeIds.add(tgt);
            if (tgt === n.id) matchingNodeIds.add(src);
          }
        }
      }
      nodes = nodes.filter((n) => matchingNodeIds.has(n.id));
      const finalIds = new Set(nodes.map((n) => n.id));
      links = links.filter((l) => {
        const src = typeof l.source === "string" ? l.source : l.source.id;
        const tgt = typeof l.target === "string" ? l.target : l.target.id;
        return finalIds.has(src) && finalIds.has(tgt);
      });
    }
    return { nodes, links };
  }, [graphData, search, showSavedOnly]);

  // Highlighted node IDs (hovered + neighbors)
  const highlightedIds = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const ids = new Set<string>([hoveredNode.id]);
    for (const l of filteredData.links) {
      const src = typeof l.source === "string" ? l.source : l.source.id;
      const tgt = typeof l.target === "string" ? l.target : l.target.id;
      if (src === hoveredNode.id) ids.add(tgt);
      if (tgt === hoveredNode.id) ids.add(src);
    }
    return ids;
  }, [hoveredNode, filteredData.links]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    if (node.type === "company" && graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(3, 500);
    }
  }, []);

  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 300);
  const handleFitView = () => graphRef.current?.zoomToFit(400, 60);

  // ============ Canvas Rendering ============

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isCompany = node.type === "company";
    const isHovered = highlightedIds.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const isDimmed = hoveredNode && !isHovered;
    const x = node.x || 0;
    const y = node.y || 0;

    const alpha = isDimmed ? 0.12 : 1;

    if (isCompany) {
      const baseR = Math.min(10 + (node.connectionCount || 0) * 1.2, 28);
      const r = isHovered || isSelected ? baseR * 1.15 : baseR;
      const color = node.hasSavedJob ? COLORS.savedJob : COLORS.company;

      // Outer glow
      if ((isHovered || isSelected) && !isDimmed) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(x, y, r, x, y, r + 6);
        gradient.addColorStop(0, color.glow);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // White circle background
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();

      // Border ring
      ctx.strokeStyle = isDimmed ? `rgba(200, 200, 210, 0.12)` : (isHovered || isSelected) ? color.bg : color.ring;
      ctx.lineWidth = (isHovered || isSelected) ? 2.5 : 1.5;
      ctx.stroke();

      // Logo or fallback text
      const logoImg = node.logoUrl ? getCachedImage(node.logoUrl) : null;
      if (logoImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - 3, 0, 2 * Math.PI);
        ctx.clip();
        ctx.globalAlpha = alpha;
        ctx.drawImage(logoImg, x - (r - 3), y - (r - 3), (r - 3) * 2, (r - 3) * 2);
        ctx.restore();
      } else {
        // Fallback: company initial(s) inside the circle
        const initials = node.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        const fontSize = Math.max(r * 0.7, 6);
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDimmed ? `rgba(150, 150, 160, 0.12)` : color.bg;
        ctx.globalAlpha = alpha;
        ctx.fillText(initials, x, y);
        ctx.globalAlpha = 1;
      }

      // Label below
      const showLabel = !isDimmed || isHovered || isSelected || globalScale > 2;
      if (showLabel) {
        const fontSize = Math.max(11 / globalScale, 3.5);
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDimmed ? `rgba(100, 100, 110, 0.12)` : color.text;

        // Truncate long names
        let label = node.name;
        if (label.length > 18 && globalScale < 2) label = label.slice(0, 16) + "...";
        ctx.fillText(label, x, y + r + 3);

        // Connection count
        if (node.connectionCount && node.connectionCount > 1 && (isHovered || isSelected || globalScale > 2)) {
          ctx.font = `${Math.max(9 / globalScale, 2.5)}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = isDimmed ? `rgba(130, 130, 140, 0.12)` : "#94a3b8";
          ctx.fillText(`${node.connectionCount} connections`, x, y + r + 3 + fontSize + 2);
        }
      }
    } else {
      // Person node
      const r = isHovered || isSelected ? 6 : 4.5;

      // Glow on hover
      if ((isHovered || isSelected) && !isDimmed) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(x, y, r, x, y, r + 4);
        gradient.addColorStop(0, COLORS.person.glow);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Circle with initials
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isDimmed
        ? "rgba(226, 232, 240, 0.12)"
        : isHovered || isSelected
        ? "#e2e8f0"
        : "#f1f5f9";
      ctx.fill();
      ctx.strokeStyle = isDimmed
        ? "rgba(203, 213, 225, 0.12)"
        : isHovered || isSelected
        ? COLORS.person.bg
        : "#cbd5e1";
      ctx.lineWidth = isHovered || isSelected ? 1.5 : 0.8;
      ctx.stroke();

      // Initials inside person node
      if (node.initials && (globalScale > 1.5 || isHovered || isSelected)) {
        const fontSize = Math.max(r * 0.85, 2.5);
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDimmed ? "rgba(100, 116, 139, 0.12)" : "#64748b";
        ctx.fillText(node.initials, x, y);
      }

      // Label on hover or zoom
      if ((isHovered || isSelected || globalScale > 3) && !isDimmed) {
        const fontSize = Math.max(9 / globalScale, 2.5);
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#334155";
        ctx.fillText(node.name, x, y + r + 2);

        if (node.position && (isHovered || isSelected)) {
          ctx.font = `${Math.max(8 / globalScale, 2)}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = "#94a3b8";
          let pos = node.position;
          if (pos.length > 25 && globalScale < 3) pos = pos.slice(0, 23) + "...";
          ctx.fillText(pos, x, y + r + 2 + fontSize + 1);
        }
      }
    }
  }, [highlightedIds, hoveredNode, selectedNode]);

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const src = link.source;
    const tgt = link.target;
    if (!src || !tgt) return;

    const isHighlighted = highlightedIds.has(src.id) && highlightedIds.has(tgt.id);
    const isDimmed = hoveredNode && !isHighlighted;

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = isDimmed
      ? COLORS.link.dimmed
      : isHighlighted
      ? COLORS.link.highlighted
      : COLORS.link.normal;
    ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
    ctx.stroke();
  }, [highlightedIds, hoveredNode]);

  // ============ Render ============

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!graphData?.hasImport) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="font-medium">Import LinkedIn data first</p>
          <p className="text-sm mt-1">Switch to the Connections tab and upload your data export.</p>
        </CardContent>
      </Card>
    );
  }

  if (!filteredData.nodes.length) {
    return (
      <div className="space-y-3">
        <GraphControls search={search} setSearch={setSearch} showSavedOnly={showSavedOnly} setShowSavedOnly={setShowSavedOnly} stats={graphData.stats} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No matching connections</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedCompanyPeople = selectedNode?.type === "company"
    ? filteredData.nodes.filter((n) => {
        if (n.type !== "person") return false;
        return filteredData.links.some((l) => {
          const src = typeof l.source === "string" ? l.source : l.source.id;
          const tgt = typeof l.target === "string" ? l.target : l.target.id;
          return (src === n.id && tgt === selectedNode.id) || (tgt === n.id && src === selectedNode.id);
        });
      })
    : [];

  const graphWidth = selectedNode ? Math.max(dimensions.width - 340, 400) : dimensions.width;

  return (
    <div className="space-y-3">
      <GraphControls search={search} setSearch={setSearch} showSavedOnly={showSavedOnly} setShowSavedOnly={setShowSavedOnly} stats={graphData.stats} />

      <div className="flex gap-3">
        {/* Graph */}
        <div ref={containerRef} className="relative flex-1 rounded-xl border bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 overflow-hidden" style={{ minHeight: 550 }}>
          <ForceGraph2D
            ref={graphRef}
            graphData={filteredData}
            width={graphWidth}
            height={dimensions.height}
            nodeCanvasObject={nodeCanvasObject as any}
            linkCanvasObject={linkCanvasObject as any}
            onNodeClick={handleNodeClick as any}
            onNodeHover={((node: any) => setHoveredNode(node)) as any}
            onBackgroundClick={() => setSelectedNode(null)}
            nodePointerAreaPaint={((node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const size = node.type === "company" ? 24 : 10;
              ctx.beginPath();
              ctx.arc(node.x || 0, node.y || 0, size, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }) as any}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.35}
            cooldownTicks={120}
            enableZoomInteraction={true}
            enablePanInteraction={true}
          />

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
            <Button variant="outline" size="icon" className="h-9 w-9 bg-white/80 dark:bg-slate-900/80 backdrop-blur shadow-sm border-slate-200 dark:border-slate-700" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 bg-white/80 dark:bg-slate-900/80 backdrop-blur shadow-sm border-slate-200 dark:border-slate-700" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 bg-white/80 dark:bg-slate-900/80 backdrop-blur shadow-sm border-slate-200 dark:border-slate-700" onClick={handleFitView}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        {selectedNode && (
          <div className="w-[330px] shrink-0 rounded-xl border bg-background shadow-lg overflow-y-auto animate-in slide-in-from-right-5 duration-200" style={{ maxHeight: dimensions.height }}>
            <div className="p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {selectedNode.type === "company" ? (
                    selectedNode.logoUrl ? (
                      <img
                        src={selectedNode.logoUrl}
                        alt=""
                        className={`h-12 w-12 rounded-xl object-contain border p-1 ${selectedNode.hasSavedJob ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30" : "bg-white dark:bg-slate-900"}`}
                      />
                    ) : (
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${selectedNode.hasSavedJob ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30" : "bg-muted"}`}>
                        <Building2 className={`h-6 w-6 ${selectedNode.hasSavedJob ? "text-blue-500" : "text-muted-foreground"}`} />
                      </div>
                    )
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 border">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{selectedNode.initials || "?"}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-base leading-tight">{selectedNode.name}</h3>
                    {selectedNode.type === "person" && selectedNode.position && (
                      <p className="text-sm text-muted-foreground mt-0.5">{selectedNode.position}</p>
                    )}
                    {selectedNode.type === "person" && selectedNode.company && (
                      <p className="text-xs text-muted-foreground">at {selectedNode.company}</p>
                    )}
                    {selectedNode.type === "company" && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {selectedNode.connectionCount} connection{selectedNode.connectionCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => setSelectedNode(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                {selectedNode.type === "company" && selectedNode.hasSavedJob && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0 text-xs">
                    <Briefcase className="h-3 w-3 mr-1" />
                    You&apos;re tracking a job here
                  </Badge>
                )}
                {selectedNode.type === "person" && selectedNode.hasMessages && (
                  <Badge variant="secondary" className="text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {selectedNode.messageCount} message{selectedNode.messageCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {selectedNode.type === "person" && selectedNode.email && (
                  <Badge variant="outline" className="text-xs">
                    <Mail className="h-3 w-3 mr-1" />
                    Email available
                  </Badge>
                )}
                {selectedNode.type === "person" && selectedNode.connectedOn && (
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    Connected {selectedNode.connectedOn}
                  </Badge>
                )}
              </div>

              {/* Person Actions */}
              {selectedNode.type === "person" && (
                <div className="flex gap-2">
                  {selectedNode.profileUrl && (
                    <a href={selectedNode.profileUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        <Link2 className="h-4 w-4" />
                        LinkedIn Profile
                      </Button>
                    </a>
                  )}
                  {selectedNode.email && (
                    <a href={`mailto:${selectedNode.email}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Mail className="h-4 w-4" />
                        Email
                      </Button>
                    </a>
                  )}
                </div>
              )}

              {/* Company: people list */}
              {selectedNode.type === "company" && selectedCompanyPeople.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Your connections
                  </p>
                  <div className="space-y-1">
                    {selectedCompanyPeople.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => setSelectedNode(person)}
                        className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 border shrink-0 group-hover:border-slate-300 dark:group-hover:border-slate-600 transition-colors">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{person.initials || "?"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{person.name}</p>
                          {person.position && (
                            <p className="text-xs text-muted-foreground truncate">{person.position}</p>
                          )}
                          <div className="flex gap-1 mt-0.5">
                            {person.hasMessages && (
                              <span className="text-[10px] text-muted-foreground">{person.messageCount} msgs</span>
                            )}
                            {person.email && (
                              <span className="text-[10px] text-blue-500">has email</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {person.profileUrl && (
                            <a href={person.profileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Link2 className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {person.email && (
                            <a href={`mailto:${person.email}`} onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Controls bar (extracted to reduce re-renders) ============

function GraphControls({
  search, setSearch, showSavedOnly, setShowSavedOnly, stats,
}: {
  search: string;
  setSearch: (v: string) => void;
  showSavedOnly: boolean;
  setShowSavedOnly: (v: boolean) => void;
  stats?: { totalCompanies: number; visibleCompanies: number; visiblePeople: number; savedJobMatches: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies or people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Button
        variant={showSavedOnly ? "default" : "outline"}
        size="sm"
        onClick={() => setShowSavedOnly(!showSavedOnly)}
      >
        <Briefcase className="h-4 w-4" />
        {showSavedOnly ? "Showing saved jobs" : "Saved jobs only"}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500 ring-2 ring-blue-200" />
          Saved job match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-400 ring-2 ring-slate-200" />
          Company
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-200 ring-1 ring-slate-300" />
          Person
        </span>
      </div>
      {stats && (
        <span className="text-xs text-muted-foreground ml-auto">
          {stats.visibleCompanies} companies &middot; {stats.visiblePeople} people &middot; {stats.savedJobMatches} job matches
        </span>
      )}
    </div>
  );
}
