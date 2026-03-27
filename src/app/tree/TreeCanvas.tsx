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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tree</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={exportPNG}
            disabled={exporting || people.length === 0}
            variant="outline"
          >
            Export PNG
          </Button>
          <Button
            onClick={exportPDF}
            disabled={exporting || people.length === 0}
            variant="outline"
          >
            Export PDF
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="rounded-md overflow-hidden border border-black/10 dark:border-white/10 h-[600px]">
        {peopleHydrated && relHydrated && people.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-black/50 dark:text-white/40">
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
          <Background />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
        )}
      </div>
    </div>
  );
}


