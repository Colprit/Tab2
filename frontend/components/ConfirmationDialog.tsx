'use client';

interface ConfirmationDialogProps {
  toolCalls: Array<{
    id: string;
    operation: string;
    range?: string;
    values?: any;
  }>;
  onConfirm: (confirmed: boolean) => void;
}

export function ConfirmationDialog({ toolCalls, onConfirm }: ConfirmationDialogProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '900px',
        width: '90%',
        maxHeight: '90vh',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 600 }}>
          Confirm Changes
        </h3>
        
        <p style={{ marginBottom: '20px', color: '#666', fontSize: '16px' }}>
          The AI wants to make {toolCalls.length} {toolCalls.length === 1 ? 'change' : 'changes'} to your spreadsheet:
        </p>

        <div style={{
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          padding: '20px',
          marginBottom: '24px',
          fontSize: '15px',
          maxHeight: '60vh',
          overflowY: 'auto',
          flex: 1
        }}>
          {toolCalls.map((toolCall, index) => (
            <div key={toolCall.id} style={{ 
              marginBottom: index < toolCalls.length - 1 ? '24px' : '0', 
              paddingBottom: index < toolCalls.length - 1 ? '24px' : '0', 
              borderBottom: index < toolCalls.length - 1 ? '1px solid #ddd' : 'none' 
            }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '18px', color: '#333' }}>
                {index + 1}. {toolCall.operation === 'write_range' && 'Write to Range'}
                {toolCall.operation === 'append_row' && 'Append Row'}
                {toolCall.operation === 'clear_range' && 'Clear Range'}
              </div>
              {toolCall.range && (
                <div style={{ color: '#666', fontSize: '15px', marginBottom: '8px' }}>
                  Range: <code style={{ backgroundColor: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '14px', fontFamily: 'monospace' }}>{toolCall.range}</code>
                </div>
              )}
              {toolCall.values && (
                <div style={{ color: '#666', fontSize: '15px', marginTop: '8px' }}>
                  <div style={{ marginBottom: '8px' }}>Values:</div>
                  <code style={{ 
                    backgroundColor: '#fff', 
                    padding: '12px', 
                    borderRadius: '4px', 
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    display: 'block',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    overflowX: 'auto'
                  }}>
                    {JSON.stringify(toolCall.values, null, 2)}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '20px' }}>
          <button
            onClick={() => onConfirm(false)}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
