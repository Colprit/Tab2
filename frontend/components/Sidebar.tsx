'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { ConfigurationModal } from './ConfigurationModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SidebarProps {
  spreadsheetId: string;
}

export function Sidebar({ spreadsheetId }: SidebarProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');

  useEffect(() => {
    // Construct the Google Sheets embed URL
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
    setSheetUrl(url);
    
    // Check if service is configured
    checkConfiguration();
  }, [spreadsheetId]);

  const checkConfiguration = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sheets/test?spreadsheetId=${spreadsheetId}`);
      if (response.ok) {
        setIsConfigured(true);
      }
    } catch (error) {
      setIsConfigured(false);
    }
  };

  const handleConfigured = () => {
    setIsConfigured(true);
    setShowConfigModal(false);
  };

  if (!sheetUrl) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center',
        fontFamily: 'system-ui'
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw',
      fontFamily: 'system-ui',
      overflow: 'hidden'
    }}>
      {/* Google Sheets iframe */}
      <div style={{ 
        flex: '1', 
        position: 'relative',
        borderRight: '1px solid #ddd',
        minWidth: 0
      }}>
        <iframe
          src={sheetUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Google Sheet"
        />
      </div>

      {/* AI Assistant Sidebar */}
      <div style={{ 
        width: '400px', 
        minWidth: '400px',
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#f9f9f9',
        borderLeft: '1px solid #ddd',
        overflow: 'hidden'
      }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #ddd',
          backgroundColor: 'white'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              AI Assistant
            </h2>
            {!isConfigured && (
              <button
                onClick={() => setShowConfigModal(true)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: '#4285f4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Configure
              </button>
            )}
          </div>
        </div>

        {isConfigured ? (
          <ChatInterface spreadsheetId={spreadsheetId} />
        ) : (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center',
            color: '#666'
          }}>
            <p>Please configure the Google Service Account to get started.</p>
            <button
              onClick={() => setShowConfigModal(true)}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Configure Service Account
            </button>
          </div>
        )}
      </div>

      {showConfigModal && (
        <ConfigurationModal
          onClose={() => setShowConfigModal(false)}
          onConfigured={handleConfigured}
        />
      )}
    </div>
  );
}
