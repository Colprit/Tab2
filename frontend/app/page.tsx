'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';

const DEFAULT_SPREADSHEET_ID = '1N6RoM5vCpJUHk1WiWG1DZ-qSwPg8il3BSb-bEqSBs58';

export default function Home() {
  const [spreadsheetId, setSpreadsheetId] = useState<string>(DEFAULT_SPREADSHEET_ID);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    // Try to get spreadsheet ID from URL params first
    const params = new URLSearchParams(window.location.search);
    const id = params.get('spreadsheetId');
    if (id) {
      setSpreadsheetId(id);
    }
    // Otherwise, use the default that's already set in useState
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (spreadsheetId.trim()) {
      // Spreadsheet ID is set, Sidebar will render
    }
  };

  if (!spreadsheetId) {
    return (
      <div style={{ 
        padding: '20px', 
        maxWidth: '600px', 
        margin: '50px auto',
        fontFamily: 'system-ui',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <h1 style={{ marginBottom: '10px' }}>Google Sheets AI Assistant</h1>
        <p style={{ marginTop: '20px', marginBottom: '20px', color: '#666' }}>
          Enter a Google Spreadsheet ID or use the default to get started.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="Spreadsheet ID (from Google Sheets URL)"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              marginBottom: '10px',
              boxSizing: 'border-box'
            }}
          />
          <button
            type="submit"
            disabled={!spreadsheetId.trim()}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              backgroundColor: spreadsheetId.trim() ? '#4285f4' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: spreadsheetId.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Load Spreadsheet
          </button>
        </form>
        <p style={{ fontSize: '14px', color: '#666', marginTop: '20px' }}>
          You can find the Spreadsheet ID in the URL: 
          <br />
          <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '3px' }}>
            https://docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
          </code>
        </p>
      </div>
    );
  }

  return <Sidebar spreadsheetId={spreadsheetId} />;
}
