import Anthropic from '@anthropic-ai/sdk';
import { SheetsService } from './sheetsService';
import { ToolCallHandler } from './toolCallHandler';
import { ConversationManager } from './conversationManager';

export class ChatService {
  private anthropic: Anthropic;
  private sheetsService: SheetsService;
  private toolCallHandler: ToolCallHandler;
  private conversationManager: ConversationManager;

  constructor() {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.error('Environment variables:', {
        ANTHROPIC_API_KEY: ANTHROPIC_API_KEY ? '***set***' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
      });
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required. ' +
        'Please set it in your .env file in the root directory or backend directory. ' +
        'Make sure the backend server is restarted after adding the key.'
      );
    }

    this.anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    this.sheetsService = SheetsService.getInstance();
    this.toolCallHandler = new ToolCallHandler(this.sheetsService);
    this.conversationManager = new ConversationManager();
  }

  private async continueConversation(
    conversation: any,
    spreadsheetId: string
  ) {
    // Get conversation history with compaction if needed
    // TODO: Implement compaction
    // const messages = conversation.getMessagesForAPI();
    const messages = conversation.getAllMessages();

    // Tool definitions
    const tools = this.toolCallHandler.getToolDefinitions();

    console.log("================================================");
    console.log("Continuing conversation");
    console.log("================================================");
    console.log('Making API call with messages:', JSON.stringify(messages, null, 2));
    // console.log('Tools:', JSON.stringify(tools, null, 2));
    // Initial API call
    let currentResponse = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: messages,
      tools: tools,
    }).catch((error: any) => {
      console.error('Anthropic API error:', error);
      throw new Error(`Failed to communicate with AI: ${error.message || 'Unknown error'}`);
    });
    console.log('API Response:', currentResponse);

    // Handle tool calls in a loop
    let iterationCount = 0;
    const maxIterations = 10;

    while (
      currentResponse.stop_reason === 'tool_use' &&
      iterationCount < maxIterations
    ) {
      iterationCount++;

      // Extract all text items to add to the conversation
      const textItems: any[] = currentResponse.content.filter(
        (item: any) => item.type === 'text'
      );
      for (const textItem of textItems) {
        conversation.addMessage({
          role: 'assistant',
          content: textItem,
        });
      }

      // Extract all tool_use items from the response
      const toolUseItems: any[] = currentResponse.content.filter(
        (item: any) => item.type === 'tool_use'
      );

      for (const toolUseItem of toolUseItems) {
        // Handle the tool call
        const toolResult = await this.toolCallHandler.handleToolCall(
          toolUseItem,
          spreadsheetId,
          conversation
        );

        if (!toolResult.requiresConfirmation) {
          conversation.addMessage({
            role: 'assistant',
            content: [
              toolUseItem,
              // { type: 'text', text: 'XXXXXXXXXXXXXXX' },
            ],
          });
          conversation.addMessage({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseItem.id,
                content: JSON.stringify(toolResult.content),
              },
              {
                type: 'text',
                text: 'What next?',
              },
            ],
          });
        }
      }

      // If any tool call requires confirmation, break and return
      if (conversation.hasPendingToolCalls()) {
        break;
      }

      // if there are no pending tool calls, continue the conversation
      // TODO: Implement compaction
      // const nextMessages = conversation.getMessagesForAPI();
      const nextMessages = conversation.getAllMessages();

      console.log("================================================");
      console.log("Making API call with messages in loop");
      console.log("================================================");
      console.log('Inside loop, iteration:', iterationCount);
      console.log('Making API call with messages:', JSON.stringify(nextMessages, null, 2));
      currentResponse = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: nextMessages,
        tools: tools,
      }).catch((error: any) => {
        console.error('Anthropic API error in loop:', error);
        throw new Error(`Failed to communicate with AI: ${error.message || 'Unknown error'}`);
      });
      console.log('API Response:', currentResponse);

      // while loop back to top
    }

    // If we broke out due to confirmation needed, return that
    if (conversation.hasPendingToolCalls()) {
      const allPendingCalls = conversation.getAllPendingToolCalls();
      const pendingToolCalls = allPendingCalls.map((toolCall: any) => ({
        id: toolCall.id,
        operation: toolCall.name,
        range: toolCall.input?.range,
        values: toolCall.input?.values,
      }));
      
      return {
        type: 'confirmation_required',
        pendingToolCalls,
        message: currentResponse.content,
        conversationId: conversation.id,
      };
    }

    // Add final assistant response (if we have one)
    if (currentResponse.content && currentResponse.content.length > 0) {
      conversation.addMessage({
        role: 'assistant',
        content: currentResponse.content,
      });
    }

    return {
      type: 'message',
      message: currentResponse.content || [{ type: 'text', text: 'I received your message.' }],
      conversationId: conversation.id,
    };
  }

  async handleMessage(
    message: string,
    conversationId: string | undefined,
    spreadsheetId: string | undefined
  ) {
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is required');
    }

    if (!this.sheetsService.isConfigured()) {
      throw new Error('Google Sheets service not configured. Please provide service account JSON.');
    }

    const conversation = this.conversationManager.getOrCreateConversation(
      conversationId || 'default',
      spreadsheetId
    );

    // Add user message
    conversation.addMessage({
      role: 'user',
      content: message,
    });

    try {
      return await this.continueConversation(conversation, spreadsheetId);
    } catch (error: any) {
      console.error('Chat service error:', error);
      throw new Error(`Chat error: ${error.message}`);
    }
  }

  async confirmToolCalls(
    conversationId: string,
    toolCallIds: string[],
    confirmed: boolean
  ) {
    const conversation = this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get all pending tool calls that were confirmed/rejected
    const pendingCalls = conversation.getPendingToolCalls(toolCallIds);
    
    if (pendingCalls.length === 0) {
      throw new Error('No pending tool calls found');
    }

    // Clear all pending calls from conversation
    conversation.clearPendingToolCalls(toolCallIds);

    for (const pendingCall of pendingCalls) {
      conversation.addMessage({
        role: 'assistant',
        content: JSON.stringify({
          pending: true,
          operation: pendingCall.name,
          range: pendingCall.input?.range,
          values: pendingCall.input?.values,
        }),
      });  

      if (!confirmed) {
        conversation.addMessage({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: pendingCall.id,
              content: JSON.stringify({
                denied: true,
                operation: pendingCall.name,
                range: pendingCall.input?.range,
                values: pendingCall.input?.values,
              }),
            },
            {
              type: 'text',
              text: 'I do not want to proceed with this tool call.',
            },
          ],
        });
      } else {
        // Execute the tool call
        const toolResult = await this.toolCallHandler.executeToolCall(
          pendingCall,
          conversation.spreadsheetId
        );
        conversation.addMessage({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: pendingCall.id,
              content: toolResult.content,
            },
            {
              type: 'text',
              text: 'What next?',
            }
          ],
        });
      }
    }

    // If there are no pending tool calls, continue the conversation
    if (!conversation.hasPendingToolCalls()) {
      // Continue conversation
      try {
        return await this.continueConversation(conversation, conversation.spreadsheetId);
      } catch (error: any) {
        console.error('Confirmation error:', error);
        throw new Error(`Confirmation error: ${error.message}`);
      }
    }
  }

  configureSheets(serviceAccountJson: any) {
    return this.sheetsService.configure(serviceAccountJson);
  }
}
