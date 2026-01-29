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

      // Extract all tool_use items from the response
      const toolUseItems: any[] = currentResponse.content.filter(
        (item: any) => item.type === 'tool_use'
      );

      // Process all tool calls and collect results
      const toolResults: any[] = [];

      for (const toolUseItem of toolUseItems) {
        // Handle the tool call
        const toolResult = await this.toolCallHandler.handleToolCall(
          {
            id: toolUseItem.id,
            name: toolUseItem.name,
            input: toolUseItem.input,
          },
          spreadsheetId,
          conversation
        );

        toolResults.push(toolResult);
      }

      // If any tool call requires confirmation, break and return
      if (conversation.hasPendingToolCalls()) {
        break;
      }

      // All tool calls executed successfully - add messages
      // Add assistant message with all tool_use blocks
      conversation.addMessage({
        role: 'assistant',
        content: currentResponse.content,
      });

      // Add user message with all tool_result blocks
      const toolResultBlocks = toolResults.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.content,
        is_error: result.isError,
      }));

      conversation.addMessage({
        role: 'user',
        content: [
          ...toolResultBlocks,
          {
            type: 'text',
            text: 'What next?',
          },
        ],
      });

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

      // end of while loop
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

    // Process all tool calls
    const toolUseBlocks: any[] = [];
    const toolResultBlocks: any[] = [];

    for (const pendingCall of pendingCalls) {
      // Add tool_use block
      toolUseBlocks.push({
        type: 'tool_use',
        id: pendingCall.id,
        name: pendingCall.name,
        input: pendingCall.input,
      });

      if (!confirmed) {
        // User rejected
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: pendingCall.id,
          content: 'Denied by user.',
          is_error: false,
        });
      } else {
        // Execute the tool call
        const toolResult = await this.toolCallHandler.executeToolCall(
          pendingCall,
          conversation.spreadsheetId
        );
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: pendingCall.id,
          content: toolResult.content,
          is_error: toolResult.isError,
        });
      }
    }

    // Add assistant message with all tool_use blocks
    conversation.addMessage({
      role: 'assistant',
      content: toolUseBlocks,
    });

    // Add user message with all tool_result blocks
    const userContent: any[] = [
      ...toolResultBlocks,
      {
        type: 'text',
        text: confirmed ? 'What next?' : 'I do not want to proceed with these changes.',
      },
    ];
    
    conversation.addMessage({
      role: 'user',
      content: userContent,
    });

    // Continue conversation
    try {
      return await this.continueConversation(conversation, conversation.spreadsheetId);
    } catch (error: any) {
      console.error('Confirmation error:', error);
      throw new Error(`Confirmation error: ${error.message}`);
    }
  }

  configureSheets(serviceAccountJson: any) {
    return this.sheetsService.configure(serviceAccountJson);
  }
}
