"use client";

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import clsx from 'clsx';
import { memo } from 'react';

export const unionNodeHeight: number = 15;
export const unionNodeWidth: number = unionNodeHeight;

function UnionNode({ data, selected }: NodeProps) {
  return (
    <>
      <div
        className={clsx(
          `rounded-full`,
          `bg-gray-400 dark:bg-gray-600 border-1 border-gray-600 dark:border-gray-400`,
          selected && "border-blue-500"
        )}
        style={{
          width: unionNodeWidth,
          height: unionNodeHeight,
        }}
      >
        <Handle type="target" position={Position.Top} id="top" className='' />
        <Handle type="source" position={Position.Bottom} id="bottom" />
      </div>
    </>
  );
}

export default memo(UnionNode);
