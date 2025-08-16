"use client";

import { useRelationsStore } from '@/lib/relationsStore';
import { usePeopleStore } from '@/lib/store';
import { buildDescendantsFlow } from '@/lib/treeLayout';
import { useThemeStore } from '@/store/themes-store';
import { applyEdgeChanges, applyNodeChanges, Background, Controls, EdgeChange, NodeChange, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PersonNode from './PersonNode';
import UnionNode from './UnionNode';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  const [rootId, setRootId] = useState<string>('');
  const ROOT_STORAGE_KEY = 'family-tree:selectedRootId';

  // Load stored root or fallback to first person when people are ready
  useEffect(() => {
    if (!peopleHydrated) return;
    if (people.length === 0) return;
    const stored = typeof window !== 'undefined' ? localStorage.getItem(ROOT_STORAGE_KEY) : null;
    const validIds = new Set(people.map((p) => p.id));
    const next = stored && validIds.has(stored) ? stored : people[0].id;
    if (next !== rootId) setRootId(next);
  }, [peopleHydrated, people]);

  // Persist root on change
  useEffect(() => {
    if (!rootId) return;
    try {
      localStorage.setItem(ROOT_STORAGE_KEY, rootId);
    } catch { }
  }, [rootId]);

  const flow = useMemo<{ nodes: Node[]; edges: Edge[] }>(
    () => buildDescendantsFlow(rootId, people, parentChildLinks, unions),
    [rootId, people, parentChildLinks, unions]
  );

  const [nodes, setNodes] = useState<Node[]>(flow.nodes);
  const [edges, setEdges] = useState<Edge[]>(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
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
    <div className="space-y-3 h-full">
      <div className="flex items-center gap-2">
        <label className="text-sm">Root (required):</label>
        <Select
          value={rootId}
          onValueChange={(value) => setRootId(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.givenName} {p.familyName ?? ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={exportPNG}
            disabled={exporting || !rootId}
            variant="outline"
          >
            Export PNG
          </Button>
          <Button
            onClick={exportPDF}
            disabled={exporting || !rootId}
            variant="outline"
          >
            Export PDF
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="rounded-md overflow-hidden border border-black/10 dark:border-white/10 h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView={true}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={true}
          edgesFocusable={true}
          nodeTypes={{ personNode: PersonNode, unionNode: UnionNode }}
          colorMode={theme === "dark" ? "dark" : "light"}
        >
          <Background />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}


