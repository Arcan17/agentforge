'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Search, ArrowRight, Zap } from 'lucide-react';
import { api, HealthResponse, MetricsResponse } from '@/lib/api';
import { MetricsCards } from '@/components/MetricsCards';
import { formatDuration } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskIdInput, setTaskIdInput] = useState('');

  useEffect(() => {
    Promise.all([api.health(), api.metrics()])
      .then(([h, m]) => {
        setHealth(h);
        setMetrics(m);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to connect to backend'),
      )
      .finally(() => setLoading(false));
  }, []);

  const lookup = () => {
    const id = taskIdInput.trim();
    if (id) router.push(`/tasks/${id}`);
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Multi-agent research pipeline · last 24 hours
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Health indicator */}
          {loading ? (
            <span className="flex items-center gap-1.5 text-sm text-gray-400">
              <span className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />
              Connecting…
            </span>
          ) : health ? (
            <span
              className={`flex items-center gap-1.5 text-sm font-medium ${
                health.status === 'ok' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              API {health.status === 'ok' ? 'Online' : 'Offline'}
            </span>
          ) : null}

          <Link
            href="/tasks/new"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            New Task
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <strong>Backend unreachable:</strong> {error}
          <br />
          <span className="text-xs opacity-80">
            Make sure{' '}
            <code className="font-mono">docker compose up -d</code> is running
            and <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code> is
            correct.
          </span>
        </div>
      )}

      {/* Metrics cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
            >
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-7 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : metrics ? (
        <MetricsCards metrics={metrics} />
      ) : null}

      {/* Agent latency chart */}
      {metrics &&
        Object.keys(metrics.agent_avg_latency_ms).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              Agent Avg Latency
            </h2>

            <div className="space-y-3">
              {Object.entries(metrics.agent_avg_latency_ms)
                .sort(([, a], [, b]) => b - a)
                .map(([agent, ms]) => {
                  const maxMs = Math.max(
                    ...Object.values(metrics.agent_avg_latency_ms),
                  );
                  const pct = maxMs > 0 ? (ms / maxMs) * 100 : 0;
                  return (
                    <div key={agent} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-gray-600 capitalize">
                        {agent}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-xs text-gray-500 tabular-nums">
                        {formatDuration(ms)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      {/* Task lookup */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-indigo-600" />
          Look Up a Task
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={taskIdInput}
            onChange={(e) => setTaskIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="Paste a task UUID…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400"
          />
          <button
            onClick={lookup}
            disabled={!taskIdInput.trim()}
            className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Go
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Task IDs are returned by <code className="font-mono">POST /tasks</code> or shown after creating a task.
        </p>
      </div>
    </div>
  );
}
