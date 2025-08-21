import UnionNode from "@/app/tree/UnionNode";
import PersonNode from "@/app/tree/PersonNode";

export enum NodeType {
  Union = 'unionNode',
  Person = 'personNode',
}

export const nodeTypes = {
  [NodeType.Union]: UnionNode,
  [NodeType.Person]: PersonNode,
}