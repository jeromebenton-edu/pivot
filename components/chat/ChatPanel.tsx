'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Message } from '@/lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Only scroll when a new message is added
  useEffect(() => {
    // Only scroll when messages array grows (new message added)
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]);

  const handleExampleClick = (question: string) => {
    // Set the input value and immediately send the message
    setInputValue(question);
    // Small delay to ensure UI updates before sending
    setTimeout(() => {
      handleSendMessage(question);
    }, 50);
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue(''); // Clear the input after sending
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
                    <li><strong>Total Records:</strong> 1,033 transactions</li>
                    <li><strong>Total Revenue:</strong> $1,053,931.91</li>
                    <li><strong>Unique Customers:</strong> 500 users</li>
                    <li><strong>Unique Products:</strong> 100 products</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">🏷️ Product Categories</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li>Electronics ($252k revenue)</li>
                    <li>Home & Garden ($187k revenue)</li>
                    <li>Clothing ($170k revenue)</li>
                    <li>Sports & Outdoors ($163k revenue)</li>
                    <li>Toys & Games ($158k revenue)</li>
                    <li>Books ($124k revenue)</li>
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
                    <li><strong>Purchase:</strong> 986 completed purchases</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-left max-w-2xl mx-auto space-y-3">
              <p className="text-sm font-semibold">💡 Example Questions You Can Ask:</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-blue-600 mb-1">Revenue Analysis</p>
                  <ul className="text-xs space-y-1">
                    <li className="cursor-pointer hover:text-blue-700 hover:bg-blue-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What were the top selling categories in December 2024?')}>• What were the top selling categories in December 2024?</li>
                    <li className="cursor-pointer hover:text-blue-700 hover:bg-blue-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me monthly revenue for 2024')}>• Show me monthly revenue for 2024</li>
                    <li className="cursor-pointer hover:text-blue-700 hover:bg-blue-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Compare Q3 vs Q4 performance')}>• Compare Q3 vs Q4 performance</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-green-600 mb-1">Regional Performance</p>
                  <ul className="text-xs space-y-1">
                    <li className="cursor-pointer hover:text-green-700 hover:bg-green-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Which region has the highest conversion rate?')}>• Which region has the highest conversion rate?</li>
                    <li className="cursor-pointer hover:text-green-700 hover:bg-green-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Compare sales between North America and Europe')}>• Compare sales between North America and Europe</li>
                    <li className="cursor-pointer hover:text-green-700 hover:bg-green-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me regional revenue breakdown')}>• Show me regional revenue breakdown</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-purple-600 mb-1">Customer Behavior</p>
                  <ul className="text-xs space-y-1">
                    <li className="cursor-pointer hover:text-purple-700 hover:bg-purple-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What\'s the cart abandonment rate?')}>• What&apos;s the cart abandonment rate?</li>
                    <li className="cursor-pointer hover:text-purple-700 hover:bg-purple-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me the customer purchase funnel')}>• Show me the customer purchase funnel</li>
                    <li className="cursor-pointer hover:text-purple-700 hover:bg-purple-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Average order value by category')}>• Average order value by category</li>
                  </ul>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs font-semibold text-orange-600 mb-1">Forecasting</p>
                  <ul className="text-xs space-y-1">
                    <li className="cursor-pointer hover:text-orange-700 hover:bg-orange-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What was the highest revenue month in 2024?')}>• What was the highest revenue month in 2024?</li>
                    <li className="cursor-pointer hover:text-orange-700 hover:bg-orange-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me Electronics category performance')}>• Show me Electronics category performance</li>
                    <li className="cursor-pointer hover:text-orange-700 hover:bg-orange-50 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Compare Q1 vs Q4 2024 revenue')}>• Compare Q1 vs Q4 2024 revenue</li>
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
            <div className="bg-gray-100 rounded-lg p-4 max-w-md">
              <div className="flex items-center space-x-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <div className="text-sm text-gray-600 animate-pulse">
                  Searching knowledge base and analyzing data...
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                This typically takes 3-8 seconds
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <InputBar
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        value={inputValue}
        onChange={setInputValue}
      />
    </div>
  );
}