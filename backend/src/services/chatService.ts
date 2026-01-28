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

    // Get conversation history with compaction if needed
    // TODO: Implement compaction
    // const messages = conversation.getMessagesForAPI();
    const messages = conversation.getAllMessages();

    // Tool definitions
    const tools = this.toolCallHandler.getToolDefinitions();

    let response: any;
    let requiresConfirmation = false;
    let pendingToolCalls: any[] = [];

    try {
      // Initial API call
      response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: messages,
        tools: tools,
      }).catch((error: any) => {
        console.error('Anthropic API error:', error);
        throw new Error(`Failed to communicate with AI: ${error.message || 'Unknown error'}`);
      });

      // Handle tool calls in a loop
      let currentResponse = response;
      let iterationCount = 0;
      const maxIterations = 10;

      while (
        currentResponse.stop_reason === 'tool_use' &&
        iterationCount < maxIterations
      ) {
        iterationCount++;

        const toolResults = await this.toolCallHandler.handleToolCalls(
          currentResponse.content,
          spreadsheetId,
          conversation
        );

        // Check if any write operations require confirmation
        const writeOperations = toolResults.filter(
          (result: any) => result.requiresConfirmation
        );

        if (writeOperations.length > 0) {
          requiresConfirmation = true;
          // Extract tool call details from the response content
          const toolUseItems = currentResponse.content.filter(
            (item: any) => item.type === 'tool_use'
          );
          pendingToolCalls = toolUseItems
            .filter((item: any) => 
              writeOperations.some((op: any) => op.toolUseId === item.id)
            )
            .map((item: any) => ({
              id: item.id,
              operation: item.name,
              range: item.input.range,
              values: item.input.values,
            }));
          
          // Store the assistant message with tool calls
          conversation.addMessage({
            role: 'assistant',
            content: currentResponse.content,
          });
          break;
        }

        // Add assistant message with tool_use blocks first
        conversation.addMessage({
          role: 'assistant',
          content: currentResponse.content,
        });

        // Add ALL tool results in a SINGLE user message
        // All tool_result blocks must be in one message and correspond to tool_use blocks in the previous assistant message
        const toolResultBlocks = toolResults.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.toolUseId,
          content: result.content,
          is_error: result.isError,
        }));

        conversation.addMessage({
          role: 'user',
          content: toolResultBlocks,
        });

        // Continue the conversation
        const nextMessages = conversation.getMessagesForAPI();
        currentResponse = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: nextMessages,
          tools: tools,
        }).catch((error: any) => {
          console.error('Anthropic API error in loop:', error);
          throw new Error(`Failed to communicate with AI: ${error.message || 'Unknown error'}`);
        });
      }

      // If we broke out due to confirmation needed, return that
      if (requiresConfirmation) {
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

    if (!confirmed) {
      // User rejected, add a message explaining
      conversation.addMessage({
        role: 'user',
        content: 'I do not want to proceed with these changes.',
      });
    } else {
      // Execute the pending tool calls (skip confirmation check)
      const pendingCalls = conversation.getPendingToolCalls(toolCallIds);
      
      // Clear pending calls first
      conversation.clearPendingToolCalls(toolCallIds);
      
      // Execute all tool calls and collect results
      const toolResults = [];
      for (const toolCall of pendingCalls) {
        // Execute without requiring confirmation
        const result = await this.toolCallHandler.executeToolCall(
          toolCall,
          conversation.spreadsheetId
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result.content,
          is_error: result.isError,
        });
      }

      // Add all tool results in a SINGLE user message
      if (toolResults.length > 0) {
        conversation.addMessage({
          role: 'user',
          content: toolResults,
        });
      }
    }

    // Continue conversation
    const messages = conversation.getMessagesForAPI();
    const tools = this.toolCallHandler.getToolDefinitions();

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: messages,
      tools: tools,
    });

    conversation.addMessage({
      role: 'assistant',
      content: response.content,
    });

    return {
      type: 'message',
      message: response.content,
      conversationId: conversation.id,
    };
  }

  configureSheets(serviceAccountJson: any) {
    return this.sheetsService.configure(serviceAccountJson);
  }
}
