'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  XCircle,
  Download,
  FileJson,
  Loader2,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  AgentEventResponse,
  AgentStepResponse,
  StreamEvent,
  TaskResponse,
  streamTask,
} from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { TaskTimeline } from '@/components/TaskTimeline';
import { ApprovalPanel } from '@/components/ApprovalPanel';
import { AuditTabs } from '@/components/AuditTabs';
import { ReportView } from '@/components/ReportView';
import {
  formatDuration,
  formatCost,
  formatTokens,
  relativeTime,
  shortId,
} from '@/lib/utils';

const TERMINAL_STATUSES = new Set([
  'complete',
  'failed',
  'cancelled',
  'best_effort',
]);

interface Props {
  taskId: string;
}

export function TaskDetailClient({ taskId }: Props) {
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [auditEvents, setAuditEvents] = useState<AgentEventResponse[]>([]);
  const [auditSteps, setAuditSteps] = useState<AgentStepResponse[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const cleanupStreamRef = useRef<(() => void) | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (): Promise<TaskResponse | null> => {
    try {
      const [t, evs, sts] = await Promise.all([
        api.getTask(taskId),
        api.getEvents(taskId).catch((): AgentEventResponse[] => []),
        api.getSteps(taskId).catch((): AgentStepResponse[] => []),
      ]);
      setTask(t);
      setAuditEvents(evs);
      setAuditSteps(sts);
      setFetchError(null);
      return t;
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.status === 404 ? 'Task not found' : `Error ${e.status}`}: ${e.message}`
          : 'Failed to load task';
      setFetchError(msg);
      return null;
    }
  }, [taskId]);

  // ── SSE streaming ────────────────────────────────────────────────────────

  const startStream = useCallback(
    (status: string) => {
      if (TERMINAL_STATUSES.has(status)) return;
      if (cleanupStreamRef.current) return; // already open

      setIsStreaming(true);
      const cleanup = streamTask(
        taskId,
        (ev: StreamEvent) => setStreamEvents((prev) => [...prev, ev]),
        () => {
          setIsStreaming(false);
          cleanupStreamRef.current = null;
          // Refresh audit data after stream ends
          void fetchAll();
        },
      );
      cleanupStreamRef.current = cleanup;
    },
    [taskId, fetchAll],
  );

  // ── Initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    setPageLoading(true);
    fetchAll()
      .then((t) => {
        if (t) startStream(t.status);
      })
      .finally(() => setPageLoading(false));

    return () => {
      cleanupStreamRef.current?.();
      cleanupStreamRef.current = null;
    };
  }, [fetchAll, startStream]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    const t = await fetchAll();
    if (t && !TERMINAL_STATUSES.has(t.status)) startStream(t.status);
    setRefreshing(false);
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      await api.cancelTask(taskId);
      cleanupStreamRef.current?.();
      cleanupStreamRef.current = null;
      setIsStreaming(false);
      await fetchAll();
    } catch (e) {
      setCancelError(
        e instanceof ApiError ? e.message : 'Cancel failed',
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDownloadMd = async () => {
    setExportError(null);
    try {
      await api.downloadReportMd(taskId);
    } catch (e) {
      setExportError(
        e instanceof ApiError
          ? `Export failed (${e.status}): ${e.message}`
          : 'Could not download report. Try again.',
      );
    }
  };

  const handleDownloadJson = async () => {
    setExportError(null);
    try {
      await api.downloadReportJson(taskId);
    } catch (e) {
      setExportError(
        e instanceof ApiError
          ? `Export failed (${e.status}): ${e.message}`
          : 'Could not download report. Try again.',
      );
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (fetchError || !task) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-gray-800 font-medium mb-1">
          {fetchError ?? 'Task not found'}
        </p>
        <Link
          href="/"
          className="text-sm text-indigo-600 hover:underline mt-2 inline-block"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.has(task.status);
  const canCancel = !isTerminal && !cancelLoading;
  const hasReport = Boolean(task.final_report);

  const metaItems = [
    { label: 'Model', value: task.model_name ?? '—' },
    { label: 'Provider', value: task.llm_provider ?? '—' },
    { label: 'Total tokens', value: formatTokens(task.total_tokens) },
    { label: 'Cost', value: formatCost(task.estimated_cost_usd) },
    { label: 'Prompt tokens', value: formatTokens(task.total_prompt_tokens) },
    {
      label: 'Completion tokens',
      value: formatTokens(task.total_completion_tokens),
    },
    {
      label: 'Critic score',
      value:
        task.critic_score != null ? task.critic_score.toFixed(2) : '—',
    },
    { label: 'Revisions', value: String(task.revision_count) },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1">
            <h1 className="text-base font-mono font-medium text-gray-700">
              {shortId(taskId)}
              <span className="text-gray-400">…</span>
            </h1>
            <StatusBadge status={task.status} />
            {task.human_in_loop && (
              <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-medium">
                human-in-loop
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Created {relativeTime(task.created_at)}
            {task.total_duration_ms != null &&
              ` · finished in ${formatDuration(task.total_duration_ms)}`}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {hasReport && (
            <>
              <button
                onClick={() => void handleDownloadMd()}
                title="Download Markdown report"
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
              <button
                onClick={() => void handleDownloadJson()}
                title="Download JSON report"
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileJson className="h-3.5 w-3.5" />
                .json
              </button>
            </>
          )}
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
          {canCancel && (
            <button
              onClick={() => void handleCancel()}
              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Cancel error */}
      {cancelError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {cancelError}
        </div>
      )}

      {/* Export error — dismissable */}
      {exportError && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <span>{exportError}</span>
          <button
            onClick={() => setExportError(null)}
            className="ml-4 text-amber-600 hover:text-amber-800 font-medium flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Original task */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
          Task
        </p>
        <p className="text-sm text-gray-800 leading-relaxed">
          {task.original_task}
        </p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metaItems.map(({ label, value }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-gray-200 px-4 py-3"
          >
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-medium text-gray-900 truncate">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Human approval panel */}
      {task.status === 'awaiting_approval' && (
        <ApprovalPanel
          taskId={taskId}
          onDecision={() => void handleRefresh()}
        />
      )}

      {/* Live timeline + audit side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Live Events
          </h2>
          <TaskTimeline events={streamEvents} isStreaming={isStreaming} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Execution Audit
          </h2>
          <AuditTabs events={auditEvents} steps={auditSteps} />
        </div>
      </div>

      {/* Final report */}
      {hasReport && task.final_report && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">
            Final Report
          </h2>
          <ReportView content={task.final_report} />
        </div>
      )}

      {/* Error display */}
      {task.error && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-5">
          <h3 className="text-sm font-medium text-red-800 mb-1.5">
            Pipeline Error
          </h3>
          <pre className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">
            {task.error}
          </pre>
        </div>
      )}
    </div>
  );
}
