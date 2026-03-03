'use client';

import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import ChatPanel from '@/components/chat/ChatPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import ThemeToggle from '@/components/ThemeToggle';
import UserMenu from '@/components/ui/UserMenu';
import DatasetSelector from '@/components/data/DatasetSelector';

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [datasetId, setDatasetId] = useState('builtin');

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 px-6 py-4" role="banner">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pivot</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Enterprise BI Platform</p>
            </div>
            <DatasetSelector
              currentDatasetId={datasetId}
              onDatasetChange={setDatasetId}
            />
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://github.com/jeromebenton-edu/Pivot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              GitHub
            </a>
            <a
              href="/how-this-works"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              How This Works
            </a>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden" role="main">
        <div className="h-full px-6 py-4">
          <ErrorBoundary>
            <ChatPanel datasetId={datasetId} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
