'use client';

import React, { useState, FormEvent, KeyboardEvent, useRef, useEffect } from 'react';

interface InputBarProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export default function InputBar({ onSendMessage, isLoading, value, onChange }: InputBarProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Use external value if provided, otherwise use internal state
  const inputValue = value !== undefined ? value : input;
  const setInputValue = onChange || setInput;

  // Only auto-focus after sending a message (when loading completes)
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Only auto-focus if user has already interacted (sent a message)
    if (!isLoading && hasInteracted) {
      inputRef.current?.focus();
    }
  }, [isLoading, hasInteracted]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      setHasInteracted(true);
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading) {
        setHasInteracted(true);
        onSendMessage(inputValue.trim());
        setInputValue('');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-800 p-4" role="form" aria-label="Chat input form">
      <div className="flex space-x-2">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Processing your request..." : "Ask a question about your data..."}
          className={`flex-1 resize-none rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] max-h-32 transition-all dark:text-gray-100 dark:placeholder-gray-500 ${
            isLoading
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-600 cursor-wait'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
          }`}
          rows={1}
          disabled={isLoading}
          autoFocus
          aria-label="Chat message input"
          aria-describedby="input-hint"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
          aria-label={isLoading ? "Sending message..." : "Send message"}
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            'Send'
          )}
        </button>
      </div>
    </form>
  );
}