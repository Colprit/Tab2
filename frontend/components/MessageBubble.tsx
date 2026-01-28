'use client';

interface MessageBubbleProps {
  message: {
    role: 'user' | 'assistant';
    content: string | any[];
    timestamp: Date;
  };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content);

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '8px'
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: '12px',
        backgroundColor: isUser ? '#4285f4' : 'white',
        color: isUser ? 'white' : '#333',
        fontSize: '14px',
        lineHeight: '1.5',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      }}>
        {content}
      </div>
    </div>
  );
}
