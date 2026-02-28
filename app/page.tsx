import ChatPanel from '@/components/chat/ChatPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import ThemeToggle from '@/components/ThemeToggle';

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 px-6 py-4" role="banner">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pivot</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Conversational BI Platform</p>
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
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden" role="main">
        <div className="max-w-7xl mx-auto h-full px-6 py-4">
          <ErrorBoundary>
            <ChatPanel />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
