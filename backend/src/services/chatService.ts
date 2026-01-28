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
    let pendingToolCall: any = null;

    try {
      console.log('Making API call with messages:', messages);
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
      console.log('API Response:', response);

      // Handle tool calls in a loop
      let currentResponse = response;
      let iterationCount = 0;
      const maxIterations = 10;

      while (
        currentResponse.stop_reason === 'tool_use' &&
        iterationCount < maxIterations
      ) {
        iterationCount++;

        // Extract the first tool_use item from the response
        const toolCall = currentResponse.content.find(
          (item: any) => item.type === 'tool_use'
        );

        if (!toolCall) {
          // No tool_use found, break out
          break;
        }

        // Handle the single tool call
        const toolResult = await this.toolCallHandler.handleToolCall(
          toolCall,
          spreadsheetId,
          conversation
        );

        // check is there is a pending tool call
        const pendingToolCall = conversation.getPendingToolCall(toolCall.id);
        if (pendingToolCall) {
          // add the pending tool call to the conversation
          conversation.addMessage({
            role: 'assistant',
            content: pendingToolCall.content,
          });
          break;
        }

        // tool_result MUST follow immediately the tool_use block
        // Add assistant message with tool_use block
        conversation.addMessage({
          role: 'assistant',
          content: currentResponse.content,
        });
        // Add tool_result in a user message
        conversation.addMessage({
          role: 'user',
          content: [
            // note tool_result MUST be the first item in the content array
            {
              type: 'tool_result',
              tool_use_id: toolResult.toolUseId,
              content: toolResult.content,
              is_error: toolResult.isError,
            },
            {
              type: 'text',
              text: 'What next?',
            },
          ],
        });

        // Continue the conversation
        // TODO: Implement compaction
        // const nextMessages = conversation.getMessagesForAPI();
        const nextMessages = conversation.getAllMessages();

        console.log('Inside loop, iteration:', iterationCount);
        console.log('Making API call with messages:', nextMessages);
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
      }

      // If we broke out due to confirmation needed, return that
      if (requiresConfirmation) {
        return {
          type: 'confirmation_required',
          pendingToolCall,
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

  async confirmToolCall(
    conversationId: string,
    toolCallId: string,
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
        content: 'I do not want to proceed with this change.',
      });
    } else {
      // Execute the pending tool call (skip confirmation check)
      const pendingCall = conversation.getPendingToolCall(toolCallId);

      if (!pendingCall) {
        throw new Error('Pending tool call not found');
      }

      // Clear pending call first
      conversation.clearPendingToolCall(toolCallId);

      // Execute the tool call without requiring confirmation
      const toolResult = await this.toolCallHandler.executeToolCall(
        pendingCall,
        conversation.spreadsheetId
      );
         
      // tool_result MUST follow immediately the tool_use block
      // Add tool_use in a message
      conversation.addMessage({
        role: 'assistant',
        content: pendingCall,
      });
      // Add tool_result in a user message
      conversation.addMessage({
        role: 'user',
        content: [
          // note tool_result MUST be the first item in the content array
          {
            type: 'tool_result',
            tool_use_id: toolResult.toolUseId,
            content: toolResult.content,
            is_error: toolResult.isError,
          },
          {
            type: 'text',
            text: 'What next?',
          },
        ],
      });
    }

    // Continue conversation
    // TODO: Implement compaction
    // const messages = conversation.getMessagesForAPI();
    const messages = conversation.getAllMessages();
    const tools = this.toolCallHandler.getToolDefinitions();

    console.log('Inside confirmToolCall');
    console.log('Making API call with messages:', messages);
    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: messages,
      tools: tools,
    });
    console.log('API Response:', response);

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
