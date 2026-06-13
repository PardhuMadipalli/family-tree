"use client";

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { CircleHelp, Mars, Venus } from 'lucide-react';

const handlesInvisible = true;

// ---------------------------------------------------------------------------
// PersonNode — bumped to ~180x64 so a full name fits on one line, with a
// gender-tinted initials avatar on the left and a sublabel slot for date
// info underneath the name. Both `fullName` and `sublabel` are populated by
// `treeLayout.ts`; `label` is kept as a fallback for older callers.
// ---------------------------------------------------------------------------

export const personNodeHeight: number = 64;
export const personNodeWidth: number = 220;

type PersonNodeData = {
  label: string;        // given name (legacy fallback)
  fullName?: string;    // "Given Family"
  sublabel?: string;    // already-formatted dates / age line
  background?: string;
  dimmed?: boolean;
  gender: string;
};

// Soft tinted backgrounds with a subtle accent border in the matching tone.
// Tones use the gender accent variables defined in globals.css so light and
// dark modes stay aligned with the rest of the app.
const nodeStyles: Record<string, string> = {
  female:
    'bg-[var(--female)]/10 border-[var(--female)]/40 text-foreground',
  male:
    'bg-[var(--male)]/10 border-[var(--male)]/40 text-foreground',
  other:
    'bg-muted border-border text-foreground',
  unknown:
    'bg-muted border-border text-foreground',
};

const avatarStyles: Record<string, string> = {
  female: 'bg-[var(--female)]/25 text-[var(--female)] border-[var(--female)]/50',
  male: 'bg-[var(--male)]/25 text-[var(--male)] border-[var(--male)]/50',
  other: 'bg-muted-foreground/15 text-muted-foreground border-border',
  unknown: 'bg-muted-foreground/15 text-muted-foreground border-border',
};

function getInitials(fullName: string | undefined, fallback: string): string {
  const source = (fullName ?? fallback ?? '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function GenderGlyph({ gender }: { gender: string }) {
  if (gender === 'male') return <Mars className="size-3" aria-hidden />;
  if (gender === 'female') return <Venus className="size-3" aria-hidden />;
  return <CircleHelp className="size-3" aria-hidden />;
}

function PersonNode({ data, selected }: NodeProps) {
  const d = data as PersonNodeData;
  const tone = nodeStyles[d.gender] ?? nodeStyles.unknown;
  const avatarTone = avatarStyles[d.gender] ?? avatarStyles.unknown;
  const displayName = d.fullName ?? d.label ?? '';
  const initials = getInitials(d.fullName, d.label);

  return (
    <div
      className={cn(
        'group rounded-lg border shadow-sm flex items-center gap-2 px-2.5 py-1.5 transition-all',
        'hover:shadow-md hover:-translate-y-0.5',
        tone,
        d?.dimmed && 'opacity-40 saturate-50',
        selected && 'ring-2 ring-brand ring-offset-1 ring-offset-background border-brand shadow-md'
      )}
      style={{
        width: personNodeWidth,
        height: personNodeHeight,
      }}
    >
      {/* Initials avatar with a subtle gender glyph in the corner. */}
      <div className="relative shrink-0">
        <div
          className={cn(
            'size-9 rounded-full border flex items-center justify-center text-[0.7rem] font-semibold tracking-tight',
            avatarTone,
          )}
          aria-hidden
        >
          {initials}
        </div>
      </div>

      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-[0.78rem] truncate" title={displayName}>
            {displayName}
          </span>
          <span className="opacity-60 shrink-0">
            <GenderGlyph gender={d.gender} />
          </span>
        </div>
        {d.sublabel ? (
          <span className="text-[0.65rem] text-muted-foreground tabular-nums truncate">
            {d.sublabel}
          </span>
        ) : (
          <span className="text-[0.65rem] text-muted-foreground/50 italic">
            no dates
          </span>
        )}
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
