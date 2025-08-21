"use client";

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';

export const unionNodeHeight: number = 20;
export const unionNodeWidth: number = unionNodeHeight;

function UnionNode({ data, selected }: NodeProps) {
  return (
    <>
      <div
        className={clsx(
          `bg-gray-400 dark:bg-gray-600 border-1 border-gray-600 dark:border-gray-400`,
          selected && "border-blue-500"
        )}
        style={{
          width: unionNodeWidth,
          height: unionNodeHeight,
          borderRadius: Infinity,
        }}
      >
        <Handle type="target" position={Position.Top} id="top" className='' />
        <Handle type="source" position={Position.Bottom} id="bottom" />
      </div>
    </>
  );
}

export default memo(UnionNode);
