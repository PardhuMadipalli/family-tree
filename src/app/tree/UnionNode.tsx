"use client";

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Heart } from 'lucide-react';
import clsx from 'clsx';
import { memo } from 'react';

// ---------------------------------------------------------------------------
// UnionNode — a small marriage marker between spouses' parent-child paths.
// Bumped from 12 to 22 so the heart glyph is legible at default zoom; still
// compact enough that it doesn't dominate the canvas.
// ---------------------------------------------------------------------------

export const unionNodeHeight: number = 22;
export const unionNodeWidth: number = unionNodeHeight;

function UnionNode({ data: _data, selected }: NodeProps) {
  void _data;
  return (
    <div
      className={clsx(
        'rounded-full bg-brand text-brand-foreground border-2 border-card shadow-sm flex items-center justify-center',
        selected && 'ring-2 ring-brand/50 ring-offset-1 ring-offset-background'
      )}
      style={{
        width: unionNodeWidth,
        height: unionNodeHeight,
      }}
      aria-label="Union"
    >
      <Heart className="size-3 fill-current" aria-hidden />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}

export default memo(UnionNode);
