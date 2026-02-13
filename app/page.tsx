import ChatPanel from '@/components/chat/ChatPanel';

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pivot</h1>
            <p className="text-sm text-gray-600">Conversational BI Platform</p>
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://github.com/jeromebenton-edu/Pivot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              GitHub
            </a>
            <a
              href="#"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              How This Works
            </a>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full px-6 py-4">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
