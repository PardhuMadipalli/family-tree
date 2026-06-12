"use client";

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';

export const unionNodeHeight: number = 12;
export const unionNodeWidth: number = unionNodeHeight;

function UnionNode({ data: _data, selected }: NodeProps) {
  void _data;
  return (
    <div
      className={clsx(
        'rounded-full bg-brand border-2 border-card shadow-xs',
        selected && 'ring-2 ring-brand/50 ring-offset-1 ring-offset-background'
      )}
      style={{
        width: unionNodeWidth,
        height: unionNodeHeight,
      }}
    >
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}

export default memo(UnionNode);
