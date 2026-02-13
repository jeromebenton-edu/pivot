'use client';

import React from 'react';
import { Message } from '@/lib/types';
import dynamic from 'next/dynamic';

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
        <div className="whitespace-pre-wrap">{message.content}</div>

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
                  <div key={source.id} className="text-xs opacity-75">
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