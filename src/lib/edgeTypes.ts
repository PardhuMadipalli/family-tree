import {
  ParentChildEdge,
  SpouseUnionEdge,
  UnionChildEdge,
} from "@/app/tree/CustomEdges";

export enum EdgeType {
  ParentChild = 'parent-child',
  SpouseUnion = 'spouse-union',
  UnionChild = 'union-child',
}

export const edgeTypes = {
  [EdgeType.ParentChild]: ParentChildEdge,
  [EdgeType.SpouseUnion]: SpouseUnionEdge,
  [EdgeType.UnionChild]: UnionChildEdge,
};
