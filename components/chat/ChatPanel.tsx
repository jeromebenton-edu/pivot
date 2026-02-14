'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Message } from '@/lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Check if we got an error response
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message?.content || 'No response received',
        chartConfig: data.message?.chartConfig,
        sources: data.message?.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);

      // More detailed error message for debugging
      let errorContent = 'Sorry, I encountered an error. Please try again.';
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <h2 className="text-2xl font-semibold mb-2">Welcome to Pivot</h2>
            <p className="mb-6">Ask questions about your e-commerce data in natural language.</p>

            <div className="bg-gray-50 rounded-lg p-6 max-w-4xl mx-auto mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Dataset Overview</h3>
              <div className="grid md:grid-cols-2 gap-6 text-left text-sm">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">📊 Data Summary</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li><strong>Time Range:</strong> January - December 2024</li>
                    <li><strong>Total Records:</strong> 2,000 transactions</li>
                    <li><strong>Total Revenue:</strong> $393,744.62</li>
                    <li><strong>Unique Customers:</strong> 500 users</li>
                    <li><strong>Unique Products:</strong> 100 products</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">🏷️ Product Categories</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li>Electronics ($91k revenue)</li>
                    <li>Home & Garden ($77k revenue)</li>
                    <li>Sports & Outdoors ($59k revenue)</li>
                    <li>Toys & Games, Books, Clothing</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">🌍 Geographic Regions</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li>Asia (188 orders, $114k revenue)</li>
                    <li>Europe (207 orders, $100k revenue)</li>
                    <li>North America (178 orders, $97k revenue)</li>
                    <li>South America (136 orders, $83k revenue)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">📈 Event Types</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li><strong>View:</strong> 663 product browsing events</li>
                    <li><strong>Cart:</strong> 628 add to cart events</li>
                    <li><strong>Purchase:</strong> 709 completed purchases</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-left max-w-2xl mx-auto space-y-3">
              <p className="text-sm font-semibold">💡 Example Questions You Can Ask:</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-blue-600 mb-1">Revenue Analysis</p>
                  <ul className="text-xs list-disc list-inside space-y-1">
                    <li>What were our top selling categories last month?</li>
                    <li>Show me revenue trends over time</li>
                    <li>Compare Q3 vs Q4 performance</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-green-600 mb-1">Regional Performance</p>
                  <ul className="text-xs list-disc list-inside space-y-1">
                    <li>Which region has the highest conversion rate?</li>
                    <li>Compare sales between Asia and Europe</li>
                    <li>Show me regional revenue breakdown</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-purple-600 mb-1">Customer Behavior</p>
                  <ul className="text-xs list-disc list-inside space-y-1">
                    <li>What&apos;s the cart abandonment rate?</li>
                    <li>Show me the customer purchase funnel</li>
                    <li>Average order value by category</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-orange-600 mb-1">Forecasting</p>
                  <ul className="text-xs list-disc list-inside space-y-1">
                    <li>Forecast revenue for next 3 months</li>
                    <li>Predict Electronics sales trends</li>
                    <li>Show seasonal patterns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 max-w-xs">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <InputBar onSendMessage={handleSendMessage} isLoading={isLoading} />
    </div>
  );
}