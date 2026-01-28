import express from 'express';
import { ChatService } from '../services/chatService.js';

const router = express.Router();

// Lazy-load ChatService to avoid requiring ANTHROPIC_API_KEY at module load time
let chatServiceInstance: ChatService | null = null;

function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService();
  }
  return chatServiceInstance;
}

router.post('/message', async (req, res) => {
  try {
    const { message, conversationId, spreadsheetId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID is required' });
    }

    const chatService = getChatService();
    const result = await chatService.handleMessage(
      message,
      conversationId,
      spreadsheetId
    );

    res.json(result);
  } catch (error: any) {
    console.error('Chat error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      type: 'error'
    });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const { conversationId, toolCallId, confirmed } = req.body;

    if (!conversationId || !toolCallId || typeof confirmed !== 'boolean') {
      return res.status(400).json({ 
        error: 'conversationId, toolCallId, and confirmed are required' 
      });
    }

    const chatService = getChatService();
    const result = await chatService.confirmToolCall(
      conversationId,
      toolCallId,
      confirmed
    );

    res.json(result);
  } catch (error: any) {
    console.error('Confirmation error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

export { router as chatRouter };
