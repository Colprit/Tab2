import Anthropic from '@anthropic-ai/sdk';
import { SheetsService } from './sheetsService';
import { ToolCallHandler } from './toolCallHandler';
import { ConversationManager } from './conversationManager';

const SYSTEM_PROMPT = `
You are an expert Google Sheets assistant with deep knowledge of spreadsheet analysis, data manipulation, and automation.
You have 10+ years of experience helping users work efficiently with data in spreadsheet environments.

Your capabilities include:
- Reading and writing data to the spreadsheet
- Researching data to answer questions
- Analyzing datasets to identify trends, patterns, and anomalies
- Creating and explaining formulas for calculations and data transformations
- Providing guidance on data organization, cleaning, and validation
- Suggesting visualization approaches for different data types
- Helping automate repetitive tasks and workflows
- Troubleshooting formula errors and data issues

Your communication style is:
- Clear and concise, avoiding unnecessary jargon
- Patient and educational, explaining concepts when needed
- Practical and action-oriented, providing specific steps users can take
- Accurate and thorough, double-checking calculations and logic

When responding:
1. Always prioritize accuracy in formulas and calculations
2. Provide step-by-step instructions when explaining complex operations
3. Consider the user's skill level and adjust explanations accordingly
4. When uncertain about a specific Google Sheets feature, acknowledge limitations

Your goal is to empower users to work more effectively with their spreadsheet data while building their confidence and skills."""
`;

export class ChatService {
  private anthropic: Anthropic;
  private sheetsService: SheetsService;
  private toolCallHandler: ToolCallHandler;
  private conversationManager: ConversationManager;

  constructor() {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.error('Environment variables:', {
        ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
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
    const messages = await conversation.getMessagesForAPI(this.anthropic);

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
      system: SYSTEM_PROMPT,
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

    while (iterationCount < maxIterations) {
      console.log("================================================");
      console.log("Inside loop, iteration:", iterationCount);
      console.log("Stop reason:", currentResponse.stop_reason);
      console.log("================================================");
      iterationCount++;

      // Extract all text items to add to the conversation
      const textItems: any[] = currentResponse.content.filter(
        (item: any) => item.type === 'text'
      );
      for (const textItem of textItems) {
        conversation.addMessage({
          role: 'assistant',
          content: [textItem],
        });
      }

      // Extract all tool_use items from the response
      const toolUseItems: any[] = currentResponse.content.filter(
        (item: any) => item.type === 'tool_use'
      );

      // Handle all tool calls in the response
      for (const toolUseItem of toolUseItems) {
        // Send call to handler
        const toolResult = await this.toolCallHandler.handleToolCall(
          toolUseItem,
          spreadsheetId,
          conversation
        );

        // If tool call does not require confirmation, add to conversation immediately
        if (!toolResult.requiresConfirmation) {
          conversation.addMessage({
            role: 'assistant',
            content: [toolUseItem],
          });
          
          // Content is now always a formatted string (no double-stringification)
          conversation.addMessage({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseItem.id,
                content: toolResult.content,
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
      if (currentResponse.stop_reason === 'tool_use' && conversation.hasPendingToolCalls()) {
        console.log("================================================");
        console.log("Breaking out of loop, has pending tool calls");
        console.log("================================================");
        break;
      }

      // If we hit the end turn, break out of the loop
      if (currentResponse.stop_reason === 'end_turn') {
        console.log("================================================");
        console.log("Stop Reason: End turn, breaking out of loop");
        console.log("================================================");
        break;
      }

      // If we hit the max tokens limit, ask AI to continue the conversation
      if (currentResponse.stop_reason === 'max_tokens') {
        console.log("================================================");
        console.log("Max tokens limit hit, asking AI to continue the conversation");
        console.log("================================================");
        conversation.addMessage({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You hit the max tokens limit.
              Please note that all tool calls you requested have been either executed or queued.
              Please do not request these same tool calls again. Please request new tool calls as needed.
              Please continue your response from where you left off.`,
            },
          ],
        });
      }

      // Continue the conversation
      const nextMessages = await conversation.getMessagesForAPI(this.anthropic);

      console.log("================================================");
      console.log("Making API call in loop");
      console.log("================================================");
      console.log('Inside loop, iteration:', iterationCount);
      console.log('Making API call with messages:', JSON.stringify(nextMessages, null, 2));
      currentResponse = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
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
        chartType: toolCall.input?.chartType,
        dataSourceRange: toolCall.input?.dataSourceRange,
        title: toolCall.input?.title,
      }));
      
      return {
        type: 'confirmation_required',
        message: currentResponse.content,
        conversationId: conversation.id,
        pendingToolCalls,
      };
    }

    // Add final assistant response (if we have one)
    // Skip if stop_reason is 'end_turn' since we already added the content in the loop
    if (currentResponse.stop_reason !== 'end_turn' && currentResponse.content && currentResponse.content.length > 0) {
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
      content: [{ type: 'text', text: message }],
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
    console.log("================================================");
    console.log("Confirming tool calls");
    console.log("================================================");
    console.log("Conversation ID:", conversationId);
    console.log("Tool call IDs:", toolCallIds);
    console.log("Confirmed:", confirmed);
    console.log("================================================");
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
        content: [
          {
            type: 'tool_use',
            id: pendingCall.id,
            name: pendingCall.name,
            input: pendingCall.input ?? {},
          }
        ]
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
        // Content is now always a formatted string (no double-stringification)
        conversation.addMessage({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: pendingCall.id,
              content: toolResult.content,
            },
          ],
        });
      }
    }

    console.log("================================================");
    console.log("Checking if there are pending tool calls");
    console.log("================================================");
    console.log("Has pending tool calls:", conversation.hasPendingToolCalls());
    console.log("================================================");
    
    // Return success response with information about pending calls
    const hasMorePendingCalls = conversation.hasPendingToolCalls();
    const allPendingCalls = hasMorePendingCalls 
      ? conversation.getAllPendingToolCalls()
      : [];
    
    const pendingToolCalls = allPendingCalls.map((toolCall: any) => ({
      id: toolCall.id,
      operation: toolCall.name,
      range: toolCall.input?.range,
      values: toolCall.input?.values,
      chartType: toolCall.input?.chartType,
      dataSourceRange: toolCall.input?.dataSourceRange,
      title: toolCall.input?.title,
    }));
    
    return {
      success: true,
      conversationId: conversation.id,
      hasMorePendingCalls,
      pendingToolCalls: hasMorePendingCalls ? pendingToolCalls : [],
    };
  }

  configureSheets(serviceAccountJson: any) {
    return this.sheetsService.configure(serviceAccountJson);
  }
}
