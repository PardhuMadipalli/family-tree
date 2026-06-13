"use client";

import { Button } from '@/components/ui/button';
import { useActiveTreeStore } from '@/lib/activeTreeStore';
import { edgeTypes } from '@/lib/edgeTypes';
import { layoutWithElk } from '@/lib/elkLayout';
import { nodeTypes, NodeType } from '@/lib/nodeTypes';
import { useRelationsStore } from '@/lib/relationsStore';
import { usePeopleStore } from '@/lib/store';
import { buildGraphStructure } from '@/lib/treeLayout';
import { useThemeStore } from '@/store/themes-store';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  EdgeChange,
  MiniMap,
  NodeChange,
  Panel,
  ReactFlow,
  ReactFlowInstance,
  type Edge,
  type Node,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { Heart } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import "@xyflow/react/dist/style.css";


export default function TreeCanvas() {
  const { people, isHydrated: peopleHydrated, hydrate: hydratePeople } = usePeopleStore();
  const { parentChildLinks, unions, isHydrated: relHydrated, hydrate: hydrateRelations } = useRelationsStore();
  const { theme } = useThemeStore();
  const { trees, activeTreeId } = useActiveTreeStore();
  const activeTree = useMemo(
    () => trees.find((t) => t.id === activeTreeId) ?? null,
    [trees, activeTreeId],
  );

  useEffect(() => {
    if (!peopleHydrated) void hydratePeople();
  }, [peopleHydrated, hydratePeople]);

  useEffect(() => {
    if (!relHydrated) void hydrateRelations();
  }, [relHydrated, hydrateRelations]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!peopleHydrated || !relHydrated) return;
    if (people.length === 0) return;
    const layout = async () => {
      const { nodes: graphNodes, edges: graphEdges } = buildGraphStructure(people, parentChildLinks, unions);
      const { nodes, edges } = await layoutWithElk(graphNodes, graphEdges);
      setNodes(nodes);
      setEdges(edges);
    };
    layout();
  }, [people, parentChildLinks, unions, peopleHydrated, relHydrated]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onInit = useCallback((reactFlowInstance: ReactFlowInstance) => {
    reactFlowInstance.fitView({ padding: 0.18 });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportPNG() {
    const el = containerRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        filter: (node) => {
          const cls = node?.className?.toString() ?? '';
          return (
            !cls.includes('react-flow__controls') &&
            !cls.includes('react-flow__minimap') &&
            !cls.includes('react-flow__panel')
          );
        },
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${activeTree?.name ?? 'family-tree'}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    const el = containerRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        filter: (node) => {
          const cls = node?.className?.toString() ?? '';
          return (
            !cls.includes('react-flow__controls') &&
            !cls.includes('react-flow__minimap') &&
            !cls.includes('react-flow__panel')
          );
        },
        pixelRatio: 2,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });

      const imgAspect = img.width / img.height;
      let renderWidth = pageWidth - 48;
      let renderHeight = renderWidth / imgAspect;
      if (renderHeight > pageHeight - 48) {
        renderHeight = pageHeight - 48;
        renderWidth = renderHeight * imgAspect;
      }
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(dataUrl, 'PNG', x, y, renderWidth, renderHeight);
      pdf.save(`${activeTree?.name ?? 'family-tree'}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  // MiniMap node tinting mirrors the main canvas: gender-tinted rounded rects
  // for people, brand-emerald dot for unions.
  const miniMapNodeColor = useCallback((node: Node) => {
    if (node.type === NodeType.Union) return 'var(--brand)';
    const gender = (node.data as { gender?: string } | undefined)?.gender;
    if (gender === 'female') return 'var(--female)';
    if (gender === 'male') return 'var(--male)';
    return 'var(--muted-foreground)';
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight truncate">
            {activeTree ? activeTree.name : 'Tree'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Visualize and export the active family tree.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={exportPNG}
            disabled={exporting || people.length === 0}
            variant="outline"
            size="sm"
          >
            Export PNG
          </Button>
          <Button
            onClick={exportPDF}
            disabled={exporting || people.length === 0}
            variant="outline"
            size="sm"
          >
            Export PDF
          </Button>
        </div>
      </header>
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-border/70 bg-card shadow-xs min-h-[560px] h-[calc(100dvh-220px)]"
      >
        {peopleHydrated && relHydrated && people.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Add people and relationships to see your tree here.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={onInit}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable={true}
            edgesFocusable={true}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={theme === "dark" ? "dark" : "light"}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
            <Controls position="bottom-right" showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={miniMapNodeColor}
              nodeStrokeWidth={2}
              maskColor="rgba(0, 0, 0, 0.04)"
              className="!bg-card !border !border-border/70 !rounded-md"
            />
            <Panel
              position="top-left"
              className="!m-3 rounded-md border border-border/70 bg-card/90 backdrop-blur shadow-xs px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="size-3 text-brand fill-brand" />
                  <span className="text-muted-foreground">Union</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block w-5 h-0 border-t-[1.5px] border-muted-foreground/70"
                  />
                  <span className="text-muted-foreground">Parent → child</span>
                </span>
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
