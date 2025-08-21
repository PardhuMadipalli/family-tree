import { UnionChildEdge } from "@/app/tree/CustomEdges";

export enum EdgeType {
  ParentChild = 'parent-child',
  SpouseUnion = 'spouse-union',
  UnionChild = 'union-child',
}

export const edgeTypes = {
  [EdgeType.ParentChild]: UnionChildEdge,
  [EdgeType.SpouseUnion]: UnionChildEdge,
  [EdgeType.UnionChild]: UnionChildEdge,
}