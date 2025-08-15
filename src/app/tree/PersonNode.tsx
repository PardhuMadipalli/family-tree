"use client";

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

const handlesInvisible = true;

type PersonNodeData = {
  label: string;
  sublabel?: string;
  background?: string;
  dimmed?: boolean;
  gender: string;
};

const backgroundColors = {
  female: 'bg-red-200 dark:bg-red-900',
  male: 'bg-blue-200 dark:bg-blue-900',
  other: 'bg-gray-300 dark:bg-gray-500',
};

function PersonNode({ data, selected }: NodeProps) {
  const d = data as PersonNodeData;
  return (
    <div
      style={{
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,.5)' : undefined,
      }}
      className={cn(backgroundColors[d.gender as keyof typeof backgroundColors],
        "p-2 rounded-md max-w-[200px]",
        d?.dimmed && "opacity-50 grayscale-30",
        selected && "border-1 border-blue-500"
      )}
    >
      <div className="font-medium text-sm text-gray-800 dark:text-white/85">{d?.label}</div>
      {d?.sublabel ? (
        <div className="text-[11px] text-muted-foreground dark:text-white/60">{d.sublabel}</div>
      ) : null}

      {/* Handles for parent/child vertical edges */}
      <Handle type="source" position={Position.Bottom} id="bottom" className={cn(handlesInvisible && 'opacity-0')} />
      <Handle type="target" position={Position.Top} id="top" className={cn(handlesInvisible && 'opacity-0')} />
      {/* Handles for union horizontal edges */}
      <Handle type="source" position={Position.Right} id="right" className={cn(handlesInvisible && 'opacity-0')} />
      <Handle type="target" position={Position.Left} id="left" className={cn(handlesInvisible && 'opacity-0')} />
    </div>
  );
}

export default memo(PersonNode);


