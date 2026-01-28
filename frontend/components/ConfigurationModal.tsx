'use client';

import { useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ConfigurationModalProps {
  onClose: () => void;
  onConfigured: () => void;
}

export function ConfigurationModal({ onClose, onConfigured }: ConfigurationModalProps) {
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!serviceAccountJson.trim()) {
      setError('Please paste your Google Service Account JSON');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate JSON
      JSON.parse(serviceAccountJson);

      const response = await fetch(`${API_BASE_URL}/api/sheets/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceAccountJson: serviceAccountJson.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${response.status} ${response.statusText}`);
      }

      onConfigured();
    } catch (err: any) {
      let errorMessage = 'Failed to configure service account';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.name === 'TypeError' && err.message?.includes('fetch')) {
        errorMessage = `Cannot connect to backend server at ${API_BASE_URL}. Make sure the backend is running on port 3001.`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

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
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600 }}>
          Configure Google Service Account
        </h2>

        <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
          Paste your Google Service Account JSON credentials below. This will be used to access your Google Sheets.
        </p>

        <textarea
          value={serviceAccountJson}
          onChange={(e) => setServiceAccountJson(e.target.value)}
          placeholder='{"type": "service_account", "project_id": "...", ...}'
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '12px',
            fontSize: '13px',
            fontFamily: 'monospace',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical',
            marginBottom: '12px'
          }}
        />

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fee',
            color: '#c33',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.5 : 1
            }}
          >
            {isLoading ? 'Configuring...' : 'Configure'}
          </button>
        </div>
      </div>
    </div>
  );
}
