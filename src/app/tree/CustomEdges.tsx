import { cn } from "@/lib/utils";
import { BaseEdge, EdgeProps, getBezierPath, getStraightPath } from "@xyflow/react";

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  label,
  data,
  className,
}: EdgeProps & {
  className?: string;
}) => {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: sourceX,
    sourceY: sourceY,
    targetX: targetX,
    targetY: targetY,
    sourcePosition: sourcePosition,
    targetPosition: targetPosition,
  });

  return <BaseEdge className={cn("!stroke-gray-400 !dark:stroke-gray-500")}
    style={{
      strokeWidth: 1,
      stroke: "currentColor",
    }}
    path={edgePath}
    label={label}
    labelX={labelX}
    labelY={labelY}
    id={id}
  />
}

export const UnionChildEdge = ({ ...props }: EdgeProps) => {
  return <CustomEdge {...props} className="" />
}