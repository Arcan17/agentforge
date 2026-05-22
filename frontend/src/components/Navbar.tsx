import Link from 'next/link';
import { Bot } from 'lucide-react';

export function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-gray-900 hover:text-gray-700 transition-colors"
        >
          <Bot className="h-5 w-5 text-indigo-600" />
          AgentForge
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/tasks/new"
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-md hover:bg-indigo-700 transition-colors font-medium"
          >
            New Task
          </Link>
        </div>
      </div>
    </nav>
  );
}
