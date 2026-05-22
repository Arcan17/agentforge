import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  planning: 'bg-violet-100 text-violet-700',
  researching: 'bg-purple-100 text-purple-700',
  analysing: 'bg-indigo-100 text-indigo-700',
  critiquing: 'bg-sky-100 text-sky-700',
  writing: 'bg-cyan-100 text-cyan-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  complete: 'bg-green-100 text-green-700',
  best_effort: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

interface Props {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
