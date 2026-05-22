'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, FlaskConical, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;

export default function NewTaskPage() {
  const router = useRouter();
  const [task, setTask] = useState('');
  const [humanInLoop, setHumanInLoop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = task.length;
  const isValid = charCount >= MIN_LENGTH && charCount <= MAX_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    setError(null);

    try {
      const run = await api.createTask({ task, human_in_loop: humanInLoop });
      router.push(`/tasks/${run.task_id}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `Error ${e.status}: ${e.message}`
          : 'Failed to create task. Is the backend running?',
      );
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">
            New Research Task
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Describe what the agent pipeline should research and produce a report on.
          Planner → Researcher → Analyst → Critic → Writer.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        {/* Task textarea */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label
            htmlFor="task"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Task Description
          </label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Research the fintech market in Chile and identify the top 3 investment opportunities for 2025, including market size, key players, and regulatory environment."
            rows={7}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-xs tabular-nums ${
                charCount > MAX_LENGTH
                  ? 'text-red-500 font-medium'
                  : charCount > 0 && charCount < MIN_LENGTH
                    ? 'text-yellow-600'
                    : 'text-gray-400'
              }`}
            >
              {charCount.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
            {charCount > 0 && charCount < MIN_LENGTH && (
              <span className="text-xs text-yellow-600">
                Minimum {MIN_LENGTH} characters
              </span>
            )}
            {charCount > MAX_LENGTH && (
              <span className="text-xs text-red-500 font-medium">
                {charCount - MAX_LENGTH} characters over limit
              </span>
            )}
          </div>
        </div>

        {/* Human-in-the-loop toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={humanInLoop}
              onChange={(e) => setHumanInLoop(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
            />
            <div>
              <span className="block text-sm font-medium text-gray-800">
                Human-in-the-Loop
              </span>
              <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                The pipeline will pause after the Analyst step and wait for your
                approval before the Writer produces the final report. You can
                approve, reject, or send feedback to trigger another revision.
              </span>
            </div>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!isValid || loading}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Submitting…
              </>
            ) : (
              'Start Research'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
