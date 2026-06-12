"use client";

import { Button } from '@/components/ui/button';
import { edgeTypes } from '@/lib/edgeTypes';
import { layoutWithElk } from '@/lib/elkLayout';
import { nodeTypes } from '@/lib/nodeTypes';
import { useRelationsStore } from '@/lib/relationsStore';
import { usePeopleStore } from '@/lib/store';
import { buildGraphStructure } from '@/lib/treeLayout';
import { useThemeStore } from '@/store/themes-store';
import { applyEdgeChanges, applyNodeChanges, Background, Controls, EdgeChange, NodeChange, ReactFlow, ReactFlowInstance, type Edge, type Node } from '@xyflow/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import "@xyflow/react/dist/style.css";


export default function TreeCanvas() {
  const { people, isHydrated: peopleHydrated, hydrate: hydratePeople } = usePeopleStore();
  const { parentChildLinks, unions, isHydrated: relHydrated, hydrate: hydrateRelations } = useRelationsStore();
  const { theme } = useThemeStore();
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
    reactFlowInstance.fitView();
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
          return !node?.className?.toString().includes('react-flow__controls') &&
            !node?.className?.toString().includes('react-flow__minimap');
        },
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'family-tree.png';
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
          return !node?.className?.toString().includes('react-flow__controls') &&
            !node?.className?.toString().includes('react-flow__minimap');
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
      pdf.save('family-tree.pdf');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Tree</h2>
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
      <div ref={containerRef} className="rounded-xl overflow-hidden border border-border/70 bg-card shadow-xs h-[640px]">
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
          fitView={true}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={true}
          edgesFocusable={true}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={theme === "dark" ? "dark" : "light"}
        >
          <Background gap={20} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
        )}
      </div>
    </div>
  );
}


