import {
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
  getStraightPath,
} from "@xyflow/react";

// ---------------------------------------------------------------------------
// Edge components — split by semantic kind so structural meaning is visible.
//
// SpouseUnionEdge — connects each spouse to the marriage (union) node.
//   Brand-colored, weight 2, straight. Reads as a "married to" line.
//
// UnionChildEdge — connects a union node down to each of its children.
//   Neutral foreground at 60%, weight 1.5, smoothstep (orthogonal). Reads
//   as a parent-child branching line.
//
// ParentChildEdge — used when a child is linked directly from a parent
//   without going through a union (single-parent or non-spouse parent
//   case). Same styling as UnionChildEdge so the parent-child relationship
//   reads consistently regardless of whether a union node is in the path.
// ---------------------------------------------------------------------------

const PARENT_LINE_STROKE = 'rgba(120, 120, 120, 0.7)';
const PARENT_LINE_WIDTH = 1.5;

const UNION_LINE_STROKE = 'var(--brand)';
const UNION_LINE_WIDTH = 2;

export function SpouseUnionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: UNION_LINE_STROKE,
        strokeWidth: UNION_LINE_WIDTH,
      }}
    />
  );
}

export function UnionChildEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: PARENT_LINE_STROKE,
        strokeWidth: PARENT_LINE_WIDTH,
      }}
    />
  );
}

export function ParentChildEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: PARENT_LINE_STROKE,
        strokeWidth: PARENT_LINE_WIDTH,
      }}
    />
  );
}
