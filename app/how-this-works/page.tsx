import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function HowThisWorks() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300">
              Pivot
            </Link>
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
            <Link
              href="/"
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Back to Chat
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">How This Works</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Pivot combines Retrieval-Augmented Generation (RAG) with the Model Context Protocol (MCP)
              to create a conversational business intelligence platform.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Architecture Overview</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2">Presentation Layer</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Next.js App Router with chat UI and Recharts visualizations</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-2">Intelligence Layer</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Anthropic API with MCP Tool Server and RAG retrieval</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Data Layer</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Vector embeddings with Chroma and Voyage AI</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">RAG vs MCP: Clear Distinction</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-700">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left text-gray-900 dark:text-gray-100">Concern</th>
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left text-gray-900 dark:text-gray-100">RAG (Retrieval)</th>
                      <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left text-gray-900 dark:text-gray-100">MCP (Tools)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-medium text-gray-900 dark:text-gray-100">Purpose</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Grounds the LLM in source data</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Extends the LLM with capabilities</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-medium text-gray-900 dark:text-gray-100">What it provides</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Context: relevant data chunks</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Actions: charting, aggregation, export</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-medium text-gray-900 dark:text-gray-100">When it runs</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Before LLM generates a response</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">During response generation (tool calls)</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-medium text-gray-900 dark:text-gray-100">Implementation</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Vector search with embeddings</td>
                      <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">Custom MCP server with tool definitions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Key Features</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Natural Language Queries</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-3">Ask questions about your data in plain English</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                    <li>Semantic understanding of business questions</li>
                    <li>Context-aware responses with source citations</li>
                    <li>Support for complex analytical queries</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Dynamic Visualizations</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-3">Automatically generated charts and graphs</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                    <li>Bar charts, line charts, pie charts</li>
                    <li>ARIMA forecasting with confidence intervals</li>
                    <li>Responsive design for all screen sizes</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Data Aggregation</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-3">Intelligent data processing and analysis</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                    <li>Sum, average, and group by operations</li>
                    <li>Time series analysis and trends</li>
                    <li>Comparative period analysis</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Source Attribution</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-3">Transparent and verifiable responses</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                    <li>Direct links to source data</li>
                    <li>Confidence scores for retrieval</li>
                    <li>Audit trail for all analyses</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Technology Stack</h2>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Frontend</h3>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li><strong>Next.js 15:</strong> Server components and App Router</li>
                      <li><strong>React:</strong> Interactive UI components</li>
                      <li><strong>Tailwind CSS:</strong> Utility-first styling</li>
                      <li><strong>Recharts:</strong> Data visualization library</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Backend</h3>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li><strong>Anthropic API:</strong> Claude for LLM capabilities</li>
                      <li><strong>Chroma:</strong> Vector database for embeddings</li>
                      <li><strong>Voyage AI:</strong> High-quality text embeddings</li>
                      <li><strong>Vercel:</strong> Serverless deployment platform</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Try It Yourself</h2>
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Start exploring your data with natural language queries:
                </p>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside mb-4">
                  <li>&quot;What were our top selling categories last month?&quot;</li>
                  <li>&quot;Show me revenue trends over time&quot;</li>
                  <li>&quot;Compare sales between different regions&quot;</li>
                  <li>&quot;Which products have the highest conversion rate?&quot;</li>
                </ul>
                <Link
                  href="/"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Start Analyzing →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16 py-8 px-6">
        <div className="max-w-4xl mx-auto text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Built with Next.js, Anthropic API, and the Model Context Protocol.
            <a
              href="https://github.com/jeromebenton-edu/Pivot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 ml-1"
            >
              View source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
