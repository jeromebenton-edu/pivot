'use client';

import React from 'react';
import { Message } from '@/lib/types';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Dynamically import DynamicChart to avoid SSR issues with Recharts
const DynamicChart = dynamic(() => import('../charts/DynamicChart'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-400">
      Loading chart...
    </div>
  )
});

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-lg p-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
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
              blockquote: ({children}) => <blockquote className="border-l-4 border-gray-300 pl-3 italic">{children}</blockquote>,
            }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.chartConfig && (
          <div className="mt-3 -mx-3 -mb-3 p-3 bg-white rounded-b-lg">
            <DynamicChart config={message.chartConfig} />
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 text-xs">
            <details className="cursor-pointer">
              <summary className={`${isUser ? 'text-blue-200' : 'text-gray-500'}`}>
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