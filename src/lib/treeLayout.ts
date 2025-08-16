import type { Edge, Node } from '@xyflow/react';
import type { ParentChildV1, PersonV1, UnionV1 } from './domain';

type PersonById = Record<string, PersonV1>;

function buildPartnerAdjacency(unions: UnionV1[]) {
  const partnerAdj = new Map<string, Set<string>>();
  for (const u of unions) {
    const ids = u.partnerIds;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        if (!partnerAdj.has(a)) partnerAdj.set(a, new Set());
        if (!partnerAdj.has(b)) partnerAdj.set(b, new Set());
        partnerAdj.get(a)!.add(b);
        partnerAdj.get(b)!.add(a);
      }
    }
  }
  return partnerAdj;
}

function buildParentChildMaps(parentChildLinks: ParentChildV1[]) {
  const parentToChildren = new Map<string, Set<string>>();
  const childToParents = new Map<string, Set<string>>();
  for (const link of parentChildLinks) {
    if (!childToParents.has(link.childId)) childToParents.set(link.childId, new Set());
    for (const pid of link.parentIds) {
      if (!parentToChildren.has(pid)) parentToChildren.set(pid, new Set());
      parentToChildren.get(pid)!.add(link.childId);
      childToParents.get(link.childId)!.add(pid);
    }
  }
  return { parentToChildren, childToParents };
}

function computePartnerComponents(people: PersonV1[], partnerAdj: Map<string, Set<string>>) {
  const personIds = new Set(people.map((p) => p.id));
  const visited = new Set<string>();
  const compOf = new Map<string, string>();
  const components: Record<string, Set<string>> = {};

  for (const id of personIds) {
    if (visited.has(id)) continue;
    const compId = id;
    const stack = [id];
    visited.add(id);
    components[compId] = new Set([id]);
    compOf.set(id, compId);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nei of Array.from(partnerAdj.get(cur) ?? [])) {
        if (!personIds.has(nei) || visited.has(nei)) continue;
        visited.add(nei);
        compOf.set(nei, compId);
        components[compId].add(nei);
        stack.push(nei);
      }
    }
  }
  return { compOf, components };
}

export function buildDescendantsFlow(
  rootId: string,
  people: PersonV1[],
  parentChildLinks: ParentChildV1[],
  unions: UnionV1[],
): { nodes: Node[]; edges: Edge[] } {
  const personById: PersonById = Object.fromEntries(people.map((p) => [p.id, p]));
  if (!people.length || !rootId || !personById[rootId]) return { nodes: [], edges: [] };

  // 1) Group partners into components: all partners share the same level
  const partnerAdj = buildPartnerAdjacency(unions);
  const { compOf, components } = computePartnerComponents(people, partnerAdj);

  // 2) Build component graph using parent-child edges
  const { parentToChildren, childToParents } = buildParentChildMaps(parentChildLinks);
  const compOut = new Map<string, Set<string>>();
  const compIn = new Map<string, Set<string>>();
  for (const link of parentChildLinks) {
    const childComp = compOf.get(link.childId)!;
    for (const pid of link.parentIds) {
      const parentComp = compOf.get(pid)!;
      if (parentComp === childComp) continue; // ignore intra-component edges
      if (!compOut.has(parentComp)) compOut.set(parentComp, new Set());
      if (!compIn.has(childComp)) compIn.set(childComp, new Set());
      compOut.get(parentComp)!.add(childComp);
      compIn.get(childComp)!.add(parentComp);
    }
  }

  // 3) From root component, assign integer levels to components:
  //    - child comps: level + 1
  //    - parent comps: level - 1
  const rootComp = compOf.get(rootId)!;
  const compLevel = new Map<string, number>();
  const queue: string[] = [];
  compLevel.set(rootComp, 0);
  queue.push(rootComp);
  while (queue.length) {
    const cur = queue.shift()!;
    const curLevel = compLevel.get(cur)!;
    for (const child of Array.from(compOut.get(cur) ?? [])) {
      if (!compLevel.has(child)) {
        compLevel.set(child, curLevel + 1);
        queue.push(child);
      }
    }
    for (const parent of Array.from(compIn.get(cur) ?? [])) {
      if (!compLevel.has(parent)) {
        compLevel.set(parent, curLevel - 1);
        queue.push(parent);
      }
    }
  }

  // 4) Keep only components reachable from root via parent/child relationships
  const reachableComps = new Set<string>(compLevel.keys());

  // 5) Assign levels to each person by their component
  const personLevel = new Map<string, number>();
  for (const [compId, members] of Object.entries(components)) {
    if (!reachableComps.has(compId)) continue;
    const lvl = compLevel.get(compId)!;
    for (const id of members) personLevel.set(id, lvl);
  }

  // 6) Prepare layout: group by level and shift Y so min level becomes 0
  let minLevel = 0;
  let maxLevel = 0;
  for (const lvl of personLevel.values()) {
    if (lvl < minLevel) minLevel = lvl;
    if (lvl > maxLevel) maxLevel = lvl;
  }

  const levels: Record<number, string[]> = {};
  for (const [id, lvl] of personLevel.entries()) {
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(id);
  }
  Object.values(levels).forEach((ids) => ids.sort());

  const xSpacing = 220;
  const ySpacing = 160;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Add person nodes
  for (const [lvlStr, ids] of Object.entries(levels)) {
    const lvl = Number(lvlStr);
    const y = (lvl - minLevel) * ySpacing;
    ids.forEach((id, index) => {
      const person = personById[id];
      if (!person) return;
      const genderBg = person.gender === 'female'
        ? '#fce7f3'
        : person.gender === 'male'
          ? '#dbeafe'
          : '#e5e7eb';
      nodes.push({
        id,
        position: { x: index * xSpacing, y },
        data: {
          label: `${person.givenName}${person.familyName ? ' ' + person.familyName : ''}`,
          sublabel: person.birthDate ? `b. ${person.birthDate}` : undefined,
          background: genderBg,
          gender: person.gender,
          dimmed: false,
        },
        type: 'personNode',
      });
    });
  }

  // Create union nodes and connect spouses to unions
  const unionToChildren = new Map<string, string[]>(); // unionId -> childIds
  const unionPositions = new Map<string, { x: number; y: number }>();

  for (const u of unions) {
    if (u.partnerIds.length < 2) continue;
    const [a, b] = u.partnerIds;
    if (!personLevel.has(a) || !personLevel.has(b)) continue;

    // Create union node
    const unionId = `union-${u.id}`;
    const personA = personById[a];
    const personB = personById[b];
    if (!personA || !personB) continue;

    // Position union node between the two spouses
    const personALevel = personLevel.get(a)!;
    const personBLevel = personLevel.get(b)!;
    const personAIndex = levels[personALevel]?.indexOf(a) ?? 0;
    const personBIndex = levels[personBLevel]?.indexOf(b) ?? 0;

    // Ensure both spouses are at the same level for proper union positioning
    if (personALevel !== personBLevel) continue;

    const unionX = (personAIndex + personBIndex) * xSpacing / 2;
    const unionY = (personALevel - minLevel) * ySpacing + ySpacing * 0.3; // Position below spouses

    unionPositions.set(unionId, { x: unionX, y: unionY });

    nodes.push({
      id: unionId,
      position: { x: unionX, y: unionY },
      data: { unionId: u.id },
      type: 'unionNode',
    });

    // Connect spouses to union - use bottom handles for both spouses
    // Determine which partner is on the left and which is on the right
    const leftPartner = personAIndex < personBIndex ? a : b;
    const rightPartner = personAIndex < personBIndex ? b : a;

    edges.push({
      id: `spouse-${leftPartner}-union`,
      source: leftPartner,
      target: unionId,
      animated: false,
      sourceHandle: 'bottom',
      targetHandle: 'left',
      style: { stroke: '#6b7280', strokeDasharray: '6 4' },
      zIndex: 0,
    });

    edges.push({
      id: `spouse-${rightPartner}-union`,
      source: rightPartner,
      target: unionId,
      animated: false,
      sourceHandle: 'bottom',
      targetHandle: 'right',
      style: { stroke: '#6b7280', strokeDasharray: '6 4' },
      zIndex: 0,
    });

    // Find children of this union
    const children = parentChildLinks
      .filter(link => link.parentIds.includes(a) && link.parentIds.includes(b))
      .map(link => link.childId);

    if (children.length > 0) {
      unionToChildren.set(unionId, children);
    }
  }

  // Connect union nodes to children
  for (const [unionId, childIds] of unionToChildren.entries()) {
    for (const childId of childIds) {
      if (!personLevel.has(childId)) continue;
      edges.push({
        id: `union-${unionId}-${childId}`,
        source: unionId,
        target: childId,
        animated: false,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        style: { stroke: '#4f46e5' },
        zIndex: 1,
      });
    }
  }

  // Handle parent-child relationships that don't go through unions
  // (single parents or cases where not both parents are in the same union)
  for (const link of parentChildLinks) {
    const child = link.childId;
    if (!personLevel.has(child)) continue;

    // Check if this child is already connected through a union
    const isConnectedThroughUnion = Array.from(unionToChildren.values()).some(children =>
      children.includes(child)
    );

    if (!isConnectedThroughUnion) {
      // Connect directly from parents to child
      for (const pid of link.parentIds) {
        if (!personLevel.has(pid)) continue;
        edges.push({
          id: `pc-${pid}-${child}`,
          source: pid,
          target: child,
          animated: false,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          style: { stroke: '#4f46e5' },
          zIndex: 1,
        });
      }
    }
  }

  return { nodes, edges };
}


