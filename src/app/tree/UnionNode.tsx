"use client";

import { cn } from '@/lib/utils';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

type UnionNodeData = {
  unionId: string;
};

export const unionNodeHeight: number = 30;
export const unionNodeWidth: number = unionNodeHeight;

function UnionNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(`size-[${unionNodeWidth}px] rounded-full bg-gray-400 dark:bg-gray-600 border-gray-600 dark:border-gray-400`,
        selected && "border-blue-500")}
    >
      <Handle type="target" position={Position.Top} id="top" className='size-1 bg-gray-600 dark:bg-gray-400' />
      <Handle type="source" position={Position.Bottom} id="bottom" className='size-1 bg-gray-600 dark:bg-gray-400' />
    </div>
  );
}

export default memo(UnionNode);
