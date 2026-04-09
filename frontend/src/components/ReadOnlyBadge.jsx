import { cn } from '@/lib/utils';

export default function ReadOnlyBadge({ className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900',
        className,
      )}
    >
      Read Only
    </span>
  );
}
