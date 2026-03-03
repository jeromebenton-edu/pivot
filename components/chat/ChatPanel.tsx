'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@/lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import SessionSidebar from './SessionSidebar';
import dynamic from 'next/dynamic';

const KPIDashboard = dynamic(() => import('../charts/KPIDashboard'), { ssr: false });

interface ChatPanelProps {
  datasetId?: string;
}

export default function ChatPanel({ datasetId = 'builtin' }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  const lastMessageContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, lastMessageContent]);

  const handleExampleClick = (question: string) => {
    setInputValue(question);
    setTimeout(() => {
      handleSendMessage(question);
    }, 50);
  };

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setInputValue('');
  }, []);

  const handleSelectSession = useCallback(async (selectedSessionId: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        const restoredMessages: Message[] = (data.messages || []).map((m: Record<string, unknown>) => ({
          id: m.id as string,
          role: m.role as string,
          content: m.content as string,
          chartConfig: m.chart_config || undefined,
          sources: m.sources || undefined,
          timestamp: new Date(m.created_at as string),
        }));
        setSessionId(selectedSessionId);
        setMessages(restoredMessages);
        setSidebarOpen(false);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Create session if this is the first message
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const sessionRes = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: content.slice(0, 100) }),
          });
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            currentSessionId = sessionData.session?.id || null;
            setSessionId(currentSessionId);
          }
        } catch {
          // Session creation is non-critical
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId: currentSessionId,
          datasetId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Check if response is SSE stream or JSON fallback
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        // SSE streaming response
        const assistantMessageId = crypto.randomUUID();
        setMessages((prev) => [...prev, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        }]);
        setIsLoading(false); // Hide loading indicator once streaming starts

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'text') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + event.content }
                      : msg
                  )
                );
              } else if (event.type === 'metadata') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, chartConfig: event.chartConfig, sources: event.sources }
                      : msg
                  )
                );
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content || 'Sorry, an error occurred. Please try again.' }
                      : msg
                  )
                );
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } else {
        // JSON fallback (for non-streaming responses)
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message?.content || 'No response received',
          chartConfig: data.message?.chartConfig,
          sources: data.message?.sources,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);

      const errorContent = 'Sorry, I encountered an error. Please try again.';
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
    <div className="flex flex-col h-full relative overflow-hidden">
      <SessionSidebar
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isOpen={sidebarOpen}
      />

      <div
        className={`flex flex-col h-full transition-all duration-200 relative ${sidebarOpen ? 'ml-72' : 'ml-0'}`}
      >
        {/* Sidebar toggle — always in the chat area, never inside the sidebar */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-3 left-3 z-20 p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          title="Chat history"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pl-14 space-y-4">
          {messages.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 mt-4">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold mb-1 text-gray-900 dark:text-gray-100">Welcome to Pivot</h2>
                <p>Ask questions about your data in natural language.</p>
              </div>

              {datasetId === 'builtin' && (
                <div className="max-w-4xl mx-auto mb-6">
                  <KPIDashboard
                    data={{
                      totalRevenue: 53426420.61,
                      totalOrders: 3199,
                      avgOrderValue: 16700.98,
                      monthlyTrend: [
                        { month: 'Jan', revenue: 3738900.10 },
                        { month: 'Feb', revenue: 4018088.69 },
                        { month: 'Mar', revenue: 4565873.18 },
                        { month: 'Apr', revenue: 4702460.63 },
                        { month: 'May', revenue: 4612033.46 },
                        { month: 'Jun', revenue: 4704551.77 },
                        { month: 'Jul', revenue: 3921957.64 },
                        { month: 'Aug', revenue: 4431734.55 },
                        { month: 'Sep', revenue: 4804379.47 },
                        { month: 'Oct', revenue: 4894556.01 },
                        { month: 'Nov', revenue: 4981420.44 },
                        { month: 'Dec', revenue: 4050464.67 },
                      ],
                      categoryBreakdown: [
                        { name: 'Industrial Bearings', revenue: 12964552.23 },
                        { name: 'Structural Fabrications', revenue: 11527533.17 },
                        { name: 'Electronic Assemblies', revenue: 10615538.25 },
                        { name: 'Hydraulic Components', revenue: 7752200.88 },
                        { name: 'Polymer & Seal Kits', revenue: 7512731.69 },
                        { name: 'Precision Tooling', revenue: 3053864.39 },
                      ],
                    }}
                    onDrillDown={handleSendMessage}
                  />
                </div>
              )}

              <div className="text-left max-w-2xl mx-auto space-y-3">
                <p className="text-sm font-semibold">Example Questions You Can Ask:</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Spend Analysis</p>
                    <ul className="text-xs space-y-1">
                      <li className="cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What were the top product lines by spend in Q4 2024?')}>What were the top product lines by spend in Q4 2024?</li>
                      <li className="cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me monthly procurement spend for 2024')}>Show me monthly procurement spend for 2024</li>
                      <li className="cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Compare Q2 vs Q3 spending trends')}>Compare Q2 vs Q3 spending trends</li>
                    </ul>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">Supplier Performance</p>
                    <ul className="text-xs space-y-1">
                      <li className="cursor-pointer hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Which supplier has the best on-time delivery rate?')}>Which supplier has the best on-time delivery rate?</li>
                      <li className="cursor-pointer hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Compare supplier quality scores across regions')}>Compare supplier quality scores across regions</li>
                      <li className="cursor-pointer hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me supplier lead time analysis')}>Show me supplier lead time analysis</li>
                    </ul>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">Quality & Operations</p>
                    <ul className="text-xs space-y-1">
                      <li className="cursor-pointer hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What is the overall defect rate by product line?')}>What is the overall defect rate by product line?</li>
                      <li className="cursor-pointer hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me the quality inspection trend over time')}>Show me the quality inspection trend over time</li>
                      <li className="cursor-pointer hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Which facility has the lowest defect rate?')}>Which facility has the lowest defect rate?</li>
                    </ul>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">Forecasting</p>
                    <ul className="text-xs space-y-1">
                      <li className="cursor-pointer hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Forecast procurement spend for Q1 2025')}>Forecast procurement spend for Q1 2025</li>
                      <li className="cursor-pointer hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('What is the spend forecast for the next 6 months?')}>What is the spend forecast for the next 6 months?</li>
                      <li className="cursor-pointer hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950 rounded px-1 py-0.5 transition-all" onClick={() => handleExampleClick('Show me the monthly spend forecast for all of 2025')}>Show me the monthly spend forecast for all of 2025</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} onDrillDown={handleSendMessage} />
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 max-w-md">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
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
    </div>
  );
}
