'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ConfirmationDialog } from './ConfirmationDialog';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ChatInterfaceProps {
  spreadsheetId: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
  timestamp: Date;
}

interface PendingToolCall {
  id: string;
  operation: string;
  range?: string;
  values?: any;
}

export function ChatInterface({ spreadsheetId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolCalls: PendingToolCall[];
    conversationId: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-grow textarea based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, 44), 200);
    el.style.height = `${h}px`;
  }, [input]);

  const sendMessage = async (messageText: string, currentConversationId?: string, skipUserMessage = false) => {
    if (!skipUserMessage) {
      const userMessage: Message = {
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          conversationId: currentConversationId || conversationId,
          spreadsheetId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        console.error('Server error response:', errorData);
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.error) {
        // Backend returned an error
        throw new Error(data.error);
      }

      setConversationId(data.conversationId);
      if (data.type === 'confirmation_required') {
        setPendingConfirmation({
          toolCalls: data.pendingToolCalls || [],
          conversationId: data.conversationId,
        });
      }
      if (data.message) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: formatAssistantContent(data.message),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else if (!data.type) {
        // Unexpected response format (but confirmation_required is ok without message)
        console.error('Unexpected response format missing message:', data);
        throw new Error('Unexpected response from server missing message');
      }
    } catch (error: any) {
      console.error('Chat error sending message:', error);
      throw error; // Re-throw so caller can handle error messages
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const messageToSend = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      await sendMessage(messageToSend);
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to send message. Please check the browser console for details.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAssistantContent = (content: any): string => {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (item.type === 'text') {
            return item.text;
          }
          return '';
        })
        .join('\n');
    }
    
    return JSON.stringify(content);
  };

  const handleConfirm = async (confirmed: boolean) => {
    if (!pendingConfirmation) return;

    // Close dialog immediately for better UX
    const toolCallsToProcess = pendingConfirmation.toolCalls;
    const conversationIdToUse = pendingConfirmation.conversationId;
    setPendingConfirmation(null);

    // Create informative system message
    const operationDescriptions = toolCallsToProcess.map((tc, idx) => {
      const operationName = tc.operation === 'write_range' ? 'Write to Range'
        : tc.operation === 'append_row' ? 'Append Row'
        : tc.operation === 'clear_range' ? 'Clear Range'
        : tc.operation;
      const rangeInfo = tc.range ? ` (${tc.range})` : '';
      return `${idx + 1}. ${operationName}${rangeInfo}`;
    }).join(', ');

    const confirmationRecord: Message = {
      role: 'system',
      content: confirmed
        ? `You confirmed ${toolCallsToProcess.length} ${toolCallsToProcess.length === 1 ? 'change' : 'changes'}: ${operationDescriptions}`
        : `You cancelled ${toolCallsToProcess.length} ${toolCallsToProcess.length === 1 ? 'change' : 'changes'}: ${operationDescriptions}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, confirmationRecord]);

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: conversationIdToUse,
          toolCallIds: toolCallsToProcess.map((tc) => tc.id),
          confirmed,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        console.error('Server error response:', errorData);
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Confirmation response data:', data);

      if (data.error) {
        // Backend returned an error
        throw new Error(data.error);
      }

      // Handle new confirmation required (if there are more pending tool calls)
      if (data.hasMorePendingCalls && data.pendingToolCalls && data.pendingToolCalls.length > 0) {
        setPendingConfirmation({
          toolCalls: data.pendingToolCalls,
          conversationId: data.conversationId,
        });
        // Don't clear pendingConfirmation here - we just set a new one
      } else {
        // No new confirmation needed, clear the pending confirmation
        setPendingConfirmation(null);
        
        // If confirmed and no more pending calls, continue the conversation
        if (confirmed && !data.hasMorePendingCalls) {
          // Continue conversation by sending "What next?" message
          // Skip adding user message since this is an automatic continuation
          await sendMessage('What next?', data.conversationId, true);
        }
      }
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to confirm action'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setPendingConfirmation(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    // Generate a new conversation ID to start a fresh conversation
    const newConversationId = crypto.randomUUID();
    
    // Clear frontend state and set new conversation ID
    setMessages([]);
    setConversationId(newConversationId);
    setPendingConfirmation(null);
    setInput('');
  };

  return (
    <>
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #ddd',
        backgroundColor: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {conversationId && (
          <div style={{
            fontSize: '11px',
            color: '#666',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '60%'
          }}>
            Conversation: {conversationId}
          </div>
        )}
        {!conversationId && <div />}
        <button
          onClick={handleNewConversation}
          disabled={isLoading || messages.length === 0}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: messages.length === 0 ? '#f0f0f0' : '#4285f4',
            color: messages.length === 0 ? '#999' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading || messages.length === 0 ? 'not-allowed' : 'pointer',
            opacity: isLoading || messages.length === 0 ? 0.5 : 1
          }}
        >
          New Conversation
        </button>
      </div>
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            marginTop: '40px',
            padding: '20px'
          }}>
            <p>Ask me anything about your spreadsheet!</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>
              Try: "What's in cell A1?" or "Add a row with these values..."
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {isLoading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            color: '#666',
            fontSize: '14px'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ddd',
              borderTopColor: '#4285f4',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={{ 
        padding: '16px', 
        borderTop: '1px solid #ddd',
        backgroundColor: 'white'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your spreadsheet..."
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              outline: 'none',
              resize: 'none',
              minHeight: '44px',
              maxHeight: '200px',
              fontFamily: 'inherit',
              lineHeight: 1.4
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: isLoading || !input.trim() ? 0.5 : 1
            }}
          >
            Send
          </button>
        </div>
      </div>

      {pendingConfirmation && (
        <ConfirmationDialog
          toolCalls={pendingConfirmation.toolCalls}
          onConfirm={(confirmed) => handleConfirm(confirmed)}
        />
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
