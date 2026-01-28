import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables BEFORE importing routes
// Try multiple locations: backend/.env, root/.env, and current working directory
const backendEnvPath = join(__dirname, '..', '.env');
const rootEnvPath = join(__dirname, '..', '..', '.env');

// Load in order of preference (later loads override earlier ones)
dotenv.config({ path: backendEnvPath });
dotenv.config({ path: rootEnvPath });
dotenv.config(); // Also try default location (current working directory)

// Log which .env file was loaded (for debugging)
if (process.env.ANTHROPIC_API_KEY) {
  console.log('✓ ANTHROPIC_API_KEY loaded successfully');
} else {
  console.warn('⚠ ANTHROPIC_API_KEY not found. Checked:', backendEnvPath, rootEnvPath);
}

import { chatRouter } from './routes/chat.js';
import { sheetsRouter } from './routes/sheets.js';
import { SheetsService } from './services/sheetsService.js';

// Auto-configure Google Service Account on startup
async function configureGoogleSheets() {
  // Try environment variable first, then hardcoded value
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (serviceAccountJson) {
    try {
      const sheetsService = SheetsService.getInstance();
      // Handle both string JSON and object
      const jsonToUse = typeof serviceAccountJson === 'string' 
        ? serviceAccountJson 
        : JSON.stringify(serviceAccountJson);
      await sheetsService.configure(jsonToUse);
      console.log('✓ Google Service Account configured successfully');
    } catch (error: any) {
      console.error('⚠ Failed to auto-configure Google Service Account:', error.message);
      console.log('You can still configure it manually via the UI');
    }
  } else {
    console.log('ℹ Google Service Account not configured - set GOOGLE_SERVICE_ACCOUNT_JSON in .env or hardcode in config/serviceAccount.ts');
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

app.use('/api/chat', chatRouter);
app.use('/api/sheets', sheetsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);
  // Auto-configure Google Sheets after server starts
  await configureGoogleSheets();
});
