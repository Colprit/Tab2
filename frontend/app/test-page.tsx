'use client';

import { Sidebar } from '@/components/Sidebar';

// Test page that always shows the sidebar
export default function TestPage() {
  // Use a test spreadsheet ID - replace with your own
  const testSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  
  return (
    <div>
      <Sidebar spreadsheetId={testSpreadsheetId} />
    </div>
  );
}
