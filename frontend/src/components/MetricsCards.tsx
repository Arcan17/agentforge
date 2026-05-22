import { CheckCircle2, Clock, Cpu, RefreshCw } from 'lucide-react';
import { MetricsResponse } from '@/lib/api';
import { formatDuration, formatTokens } from '@/lib/utils';

interface CardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}

function MetricCard({ icon, label, value, sub }: CardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-indigo-600">{icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold text-gray-900 leading-none">
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  );
}

interface Props {
  metrics: MetricsResponse;
}

export function MetricsCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Success Rate"
        value={`${(metrics.success_rate_pct ?? 0).toFixed(1)}%`}
        sub={`${metrics.runs_successful} / ${metrics.runs_total} runs`}
      />
      <MetricCard
        icon={<Clock className="h-4 w-4" />}
        label="Avg Duration"
        value={formatDuration(metrics.avg_duration_ms)}
        sub={
          metrics.p95_duration_ms != null
            ? `p95: ${formatDuration(metrics.p95_duration_ms)}`
            : undefined
        }
      />
      <MetricCard
        icon={<Cpu className="h-4 w-4" />}
        label="Avg Tokens"
        value={formatTokens(metrics.avg_tokens_per_run)}
        sub="per task"
      />
      <MetricCard
        icon={<RefreshCw className="h-4 w-4" />}
        label="Avg Revisions"
        value={(metrics.avg_revisions ?? 0).toFixed(1)}
        sub="critic cycles"
      />
    </div>
  );
}
