'use client';

import React from 'react';
import { Message } from '@/lib/types';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Dynamically import DynamicChart to avoid SSR issues with ECharts
const DynamicChart = dynamic(() => import('../charts/DynamicChart'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-50 dark:bg-gray-800 rounded flex items-center justify-center text-gray-400 dark:text-gray-500">
      Loading chart...
    </div>
  )
});

interface MessageBubbleProps {
  message: Message;
  onDrillDown?: (query: string) => void;
}

export default function MessageBubble({ message, onDrillDown }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-lg p-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
              p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({children}) => <ul className="list-disc list-inside mb-2">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
              li: ({children}) => <li className="mb-1">{children}</li>,
              strong: ({children}) => <strong className="font-semibold">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              code: ({children}) => <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">{children}</code>,
              pre: ({children}) => <pre className="bg-gray-200 dark:bg-gray-700 p-2 rounded overflow-x-auto">{children}</pre>,
              h1: ({children}) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
              h2: ({children}) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
              h3: ({children}) => <h3 className="text-base font-bold mb-2">{children}</h3>,
              blockquote: ({children}) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic">{children}</blockquote>,
            }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.chartConfig && (
          <div className="mt-3 -mx-3 -mb-3 p-3 bg-white dark:bg-gray-900 rounded-b-lg">
            <DynamicChart config={message.chartConfig} onDrillDown={onDrillDown} />
          </div>
        )}

        {message.chartConfig?.sampleData && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 italic">
            Note: This visualization uses sample data. Upload your dataset for real results.
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 text-xs">
            <details className="cursor-pointer">
              <summary className={`${isUser ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                {message.sources.length} sources
              </summary>
              <div className="mt-2 space-y-1">
                {message.sources.map((source, index) => (
                  <div key={`${source.id}-${index}`} className="text-xs opacity-75">
                    [{index + 1}] {source.content.substring(0, 100)}...
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}