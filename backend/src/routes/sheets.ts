import express from 'express';
import { SheetsService } from '../services/sheetsService.js';

const router = express.Router();

router.post('/configure', async (req, res) => {
  try {
    const { serviceAccountJson } = req.body;

    if (!serviceAccountJson) {
      return res.status(400).json({ error: 'Service account JSON is required' });
    }

    const sheetsService = SheetsService.getInstance();
    await sheetsService.configure(serviceAccountJson);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Configuration error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to configure Google Sheets service' 
    });
  }
});

router.get('/test', async (req, res) => {
  try {
    const { spreadsheetId } = req.query;
    
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return res.status(400).json({ error: 'Spreadsheet ID is required' });
    }

    const sheetsService = SheetsService.getInstance();
    const result = await sheetsService.testConnection(spreadsheetId as string);
    res.json(result);
  } catch (error: any) {
    console.error('Test error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to test connection' 
    });
  }
});

export { router as sheetsRouter };
