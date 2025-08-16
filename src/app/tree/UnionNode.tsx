"use client";

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

type UnionNodeData = {
  unionId: string;
};

function UnionNode({ data, selected }: NodeProps) {
  return (
    <div
      style={{
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,.5)' : undefined,
      }}
      className="w-4 h-4 rounded-full bg-gray-400 dark:bg-gray-600 border-2 border-gray-600 dark:border-gray-400"
    >
      {/* Handles for incoming edges from spouses */}
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Right} id="right" />
      {/* Handle for outgoing edges to children */}
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}

export default memo(UnionNode);
