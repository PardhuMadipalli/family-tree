"use client";

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

const handlesInvisible = true;

export const personNodeHeight: number = 34;
export const personNodeWidth: number = 110;

type PersonNodeData = {
  label: string;
  sublabel?: string;
  background?: string;
  dimmed?: boolean;
  gender: string;
};

// Soft tinted backgrounds with a subtle accent border in the matching tone.
// Tones use the gender accent variables defined in globals.css so light and
// dark modes stay aligned with the rest of the app.
const nodeStyles: Record<string, string> = {
  female:
    'bg-[var(--female)]/15 border-[var(--female)]/40 text-foreground',
  male:
    'bg-[var(--male)]/15 border-[var(--male)]/40 text-foreground',
  other:
    'bg-muted border-border text-foreground',
  unknown:
    'bg-muted border-border text-foreground',
};

function PersonNode({ data, selected }: NodeProps) {
  const d = data as PersonNodeData;
  const tone = nodeStyles[d.gender] ?? nodeStyles.unknown;
  return (
    <div
      className={cn(
        'rounded-md border shadow-xs flex items-center justify-center px-2 transition',
        tone,
        d?.dimmed && 'opacity-50 grayscale-30',
        selected && 'ring-2 ring-brand ring-offset-1 ring-offset-background border-brand'
      )}
      style={{
        width: personNodeWidth,
        height: personNodeHeight,
      }}
    >
      <div className="font-medium text-[0.65rem] leading-tight text-center">
        {d?.label}
      </div>

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
