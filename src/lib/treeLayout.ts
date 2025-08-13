import type { Edge, Node } from '@xyflow/react';
import type { ParentChildV1, PersonV1, UnionV1 } from './domain';

type PersonById = Record<string, PersonV1>;

// Compute generation levels for all nodes independent of selected root
function computeLevelsAll(people: PersonV1[], parentChildLinks: ParentChildV1[]) {
  const childToParents = new Map<string, Set<string>>();
  const parentToChildren = new Map<string, Set<string>>();
  const allIds = new Set(people.map((p) => p.id));

  for (const link of parentChildLinks) {
    if (!childToParents.has(link.childId)) childToParents.set(link.childId, new Set());
    for (const pid of link.parentIds) {
      childToParents.get(link.childId)!.add(pid);
      if (!parentToChildren.has(pid)) parentToChildren.set(pid, new Set());
      parentToChildren.get(pid)!.add(link.childId);
    }
  }

  const inDegree = new Map<string, number>();
  for (const id of allIds) inDegree.set(id, 0);
  for (const [childId, parents] of childToParents.entries()) {
    inDegree.set(childId, (inDegree.get(childId) ?? 0) + parents.size);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) if (deg === 0) queue.push(id);
  const level = new Map<string, number>();
  queue.forEach((id) => level.set(id, 0));

  while (queue.length) {
    const id = queue.shift()!;
    const children = Array.from(parentToChildren.get(id) ?? []);
    for (const child of children) {
      const parentLevel = level.get(id) ?? 0;
      level.set(child, Math.max(level.get(child) ?? 0, parentLevel + 1));
      const nextDeg = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, nextDeg);
      if (nextDeg === 0) queue.push(child);
    }
  }

  // Any nodes not reached (due to cycles or isolates) get level 0
  for (const id of allIds) if (!level.has(id)) level.set(id, 0);

  return { level, parentToChildren };
}

// Compute descendants set from the selected root
function computeDescendants(rootId: string, parentToChildren: Map<string, Set<string>>) {
  const visited = new Set<string>();
  const queue: string[] = [];
  if (rootId) {
    visited.add(rootId);
    queue.push(rootId);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of Array.from(parentToChildren.get(id) ?? [])) {
      if (!visited.has(c)) {
        visited.add(c);
        queue.push(c);
      }
    }
  }
  return visited;
}

export function buildDescendantsFlow(
  rootId: string,
  people: PersonV1[],
  parentChildLinks: ParentChildV1[],
  unions: UnionV1[],
): { nodes: Node[]; edges: Edge[] } {
  const personById: PersonById = Object.fromEntries(people.map((p) => [p.id, p]));
  if (!people.length) return { nodes: [], edges: [] };

  const { level, parentToChildren } = computeLevelsAll(people, parentChildLinks);
  const allIds = new Set(people.map((p) => p.id));
  const highlight = rootId.trim() && rootId === 'none' ? allIds : computeDescendants(rootId, parentToChildren);

  // Group all nodes by level
  const levels: Record<number, string[]> = {};
  for (const [id, lvl] of level.entries()) {
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(id);
  }

  // Stable sort for consistent layout
  Object.values(levels).forEach((ids) => ids.sort());

  const xSpacing = 220;
  const ySpacing = 160;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // layout nodes for ALL people
  Object.entries(levels).forEach(([levelStr, ids]) => {
    const lvl = Number(levelStr);
    ids.forEach((id, index) => {
      const person = personById[id];
      if (!person) return;

      const isHighlighted = highlight.has(id);
      const genderBg = person.gender === 'female'
        ? '#fce7f3'
        : person.gender === 'male'
          ? '#dbeafe'
          : '#e5e7eb';

      nodes.push({
        id,
        position: { x: index * xSpacing, y: lvl * ySpacing },
        data: {
          label: `${person.givenName}${person.familyName ? ' ' + person.familyName : ''}`,
          sublabel: person.birthDate ? `b. ${person.birthDate}` : undefined,
          background: genderBg,
          gender: person.gender,
          dimmed: isHighlighted ? false : true,
        },
        type: 'personNode',
      });
    });
  });

  // parent-child edges for ALL links
  for (const [parentId, children] of parentToChildren.entries()) {
    for (const childId of children) {
      const isHighlighted = highlight.has(parentId) && highlight.has(childId);
      edges.push({
        id: `pc-${parentId}-${childId}`,
        source: parentId,
        target: childId,
        animated: false,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        style: { stroke: isHighlighted ? '#4f46e5' : '#9ca3af', opacity: isHighlighted ? 1 : 0.4 },
        zIndex: isHighlighted ? 1 : 0,
      });
    }
  }

  // union edges for ALL unions
  for (const u of unions) {
    if (u.partnerIds.length < 2) continue;
    const [a, b] = u.partnerIds;
    if (!personById[a] || !personById[b]) continue;
    const isHighlighted = highlight.has(a) && highlight.has(b);
    edges.push({
      id: `union-${u.id}`,
      source: a,
      target: b,
      animated: false,
      sourceHandle: 'right',
      targetHandle: 'left',
      style: {
        stroke: isHighlighted ? '#6b7280' : '#d1d5db',
        strokeDasharray: '6 4',
        opacity: isHighlighted ? 1 : 0.4,
      },
      zIndex: 0,
    });
  }

  return { nodes, edges };
}


