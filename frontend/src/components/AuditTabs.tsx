'use client';

import { useState } from 'react';
import { AgentEventResponse, AgentStepResponse } from '@/lib/api';
import { StatusBadge } from './StatusBadge';
import { cn, formatDuration } from '@/lib/utils';

interface Props {
  events: AgentEventResponse[];
  steps: AgentStepResponse[];
}

type Tab = 'events' | 'steps';

export function AuditTabs({ events, steps }: Props) {
  const [tab, setTab] = useState<Tab>('steps');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'steps', label: 'Steps', count: steps.length },
    { id: 'events', label: 'Events', count: events.length },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Steps tab */}
      {tab === 'steps' && (
        <div className="overflow-x-auto">
          {steps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No steps recorded yet
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 font-medium">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Agent</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3 text-right">Tokens</th>
                  <th className="pb-2 pr-3 text-right">Duration</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {steps.map((step) => (
                  <tr key={step.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2 pr-3 text-gray-400 tabular-nums">
                      {step.step_number}
                    </td>
                    <td className="py-2 pr-3 font-medium text-gray-700 capitalize">
                      {step.agent_name}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={step.status} />
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                      {step.tokens_used.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-600">
                      {formatDuration(step.duration_ms)}
                    </td>
                    <td className="py-2 text-red-500 max-w-[120px] truncate">
                      {step.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Events tab */}
      {tab === 'events' && (
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No events recorded yet
            </p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 text-xs"
              >
                <span className="font-mono text-gray-300 w-6 text-right flex-shrink-0">
                  {ev.id}
                </span>
                <span className="font-medium text-gray-700 w-36 truncate">
                  {ev.event_type}
                </span>
                <span className="text-gray-500 w-20 truncate capitalize">
                  {ev.agent_name ?? '—'}
                </span>
                <span className="ml-auto text-gray-400 flex-shrink-0 tabular-nums">
                  {new Date(ev.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
