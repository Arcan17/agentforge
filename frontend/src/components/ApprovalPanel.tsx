'use client';

import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Props {
  taskId: string;
  onDecision: () => void;
}

export function ApprovalPanel({ taskId, onDecision }: Props) {
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (decision: 'approve' | 'reject' | 'feedback') => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.approveTask(taskId, {
        decision,
        feedback: decision === 'feedback' ? feedback : undefined,
      });
      onDecision();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserCheck className="h-4 w-4 text-yellow-700" />
        <h3 className="text-sm font-semibold text-yellow-900">
          Human Review Required
        </h3>
      </div>
      <p className="text-xs text-yellow-700 mb-4">
        The pipeline has paused. Review the analysis and choose an action below.
        Add feedback in the box to guide the next revision.
      </p>

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Optional feedback for the analyst (required for 'Send Feedback')…"
        rows={3}
        disabled={loading}
        className="w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none disabled:opacity-60 mb-3"
      />

      {error && (
        <p className="text-xs text-red-600 mb-3 font-medium">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void submit('approve')}
          disabled={loading}
          className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => void submit('feedback')}
          disabled={loading || !feedback.trim()}
          className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          Send Feedback
        </button>
        <button
          onClick={() => void submit('reject')}
          disabled={loading}
          className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
