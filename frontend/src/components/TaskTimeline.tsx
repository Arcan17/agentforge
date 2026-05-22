import {
  Bot,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import { StreamEvent } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EventConfig {
  icon: React.ReactNode;
  rowClass: string;
  label: string;
}

const EVENT_CONFIG: Record<string, EventConfig> = {
  agent_start: {
    icon: <PlayCircle className="h-3.5 w-3.5" />,
    rowClass: 'bg-blue-50 border-blue-200 text-blue-800',
    label: 'Started',
  },
  agent_complete: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    rowClass: 'bg-green-50 border-green-200 text-green-800',
    label: 'Completed',
  },
  awaiting_approval: {
    icon: <UserCheck className="h-3.5 w-3.5" />,
    rowClass: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    label: 'Awaiting Approval',
  },
  task_complete: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    rowClass: 'bg-green-100 border-green-300 text-green-900',
    label: 'Task Complete',
  },
  task_failed: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    rowClass: 'bg-red-50 border-red-200 text-red-800',
    label: 'Task Failed',
  },
  task_cancelled: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    rowClass: 'bg-gray-50 border-gray-200 text-gray-600',
    label: 'Cancelled',
  },
};

interface Props {
  events: StreamEvent[];
  isStreaming: boolean;
}

export function TaskTimeline({ events, isStreaming }: Props) {
  if (events.length === 0 && !isStreaming) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No live events yet. Events appear as the pipeline runs.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 timeline-scroll max-h-72 overflow-y-auto pr-1">
      {events.map((ev, i) => {
        const cfg = EVENT_CONFIG[ev.type] ?? {
          icon: <Bot className="h-3.5 w-3.5" />,
          rowClass: 'bg-gray-50 border-gray-200 text-gray-700',
          label: ev.type.replace(/_/g, ' '),
        };

        const agent = ev.data.agent as string | undefined;
        const tokens = ev.data.tokens as number | undefined;
        const step = ev.data.step as number | undefined;

        return (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs',
              cfg.rowClass,
            )}
          >
            <span className="flex-shrink-0 opacity-80">{cfg.icon}</span>
            <span className="font-medium">{cfg.label}</span>
            {agent && (
              <span className="opacity-70 capitalize">{agent}</span>
            )}
            {step != null && (
              <span className="opacity-50">step {step}</span>
            )}
            {tokens != null && (
              <span className="ml-auto opacity-60 tabular-nums">
                {tokens.toLocaleString()} tok
              </span>
            )}
          </div>
        );
      })}

      {isStreaming && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          Streaming…
        </div>
      )}
    </div>
  );
}
