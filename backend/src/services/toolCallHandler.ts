import { SheetsService } from './sheetsService';
import { Conversation } from './conversationManager';

interface ToolCall {
  id: string;
  name: string;
  input: any;
}

interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
  requiresConfirmation?: boolean;
}

export class ToolCallHandler {
  private sheetsService: SheetsService;

  constructor(sheetsService: SheetsService) {
    this.sheetsService = sheetsService;
  }

  getToolDefinitions() {
    return [
      {
        name: 'read_range',
        description: 'Read values from a specific range in the Google Sheet. Use A1 notation (e.g., "A1:C10" or "Sheet1!A1:C10").',
        input_schema: {
          type: 'object' as const,
          properties: {
            range: {
              type: 'string' as const,
              description: 'The range to read in A1 notation (e.g., "A1:C10" or "Sheet1!A1:C10")',
            },
          },
          required: ['range'],
        },
      },
      {
        name: 'write_range',
        description: 'Write values to a specific range in the Google Sheet. This operation requires user confirmation before execution.',
        input_schema: {
          type: 'object' as const,
          properties: {
            range: {
              type: 'string' as const,
              description: 'The range to write to in A1 notation (e.g., "A1:C3" or "Sheet1!A1:C3")',
            },
            values: {
              type: 'array' as const,
              description: 'A 2D array of values to write. Each inner array represents a row. Values can be strings, numbers, or booleans.',
              items: {
                type: 'array' as const,
                items: {
                  anyOf: [
                    { type: 'string' as const },
                    { type: 'number' as const },
                    { type: 'boolean' as const },
                  ],
                },
              },
            },
            valueInputOption: {
              type: 'string' as const,
              enum: ['RAW', 'USER_ENTERED'],
              description: 'How to interpret the input values. RAW: values are stored as-is. USER_ENTERED: values are parsed as if typed into the sheet.',
              default: 'USER_ENTERED',
            },
          },
          required: ['range', 'values'],
        },
      },
      {
        name: 'append_row',
        description: 'Append a new row to the end of a range in the Google Sheet. This operation requires user confirmation before execution.',
        input_schema: {
          type: 'object' as const,
          properties: {
            range: {
              type: 'string' as const,
              description: 'The range to append to (e.g., "A:C" or "Sheet1!A:C")',
            },
            values: {
              type: 'array' as const,
              description: 'An array of values for the new row. Values can be strings, numbers, or booleans.',
              items: {
                anyOf: [
                  { type: 'string' as const },
                  { type: 'number' as const },
                  { type: 'boolean' as const },
                ],
              },
            },
            valueInputOption: {
              type: 'string' as const,
              enum: ['RAW', 'USER_ENTERED'],
              description: 'How to interpret the input values',
              default: 'USER_ENTERED',
            },
          },
          required: ['range', 'values'],
        },
      },
      {
        name: 'clear_range',
        description: 'Clear all values from a specific range in the Google Sheet. This operation requires user confirmation before execution.',
        input_schema: {
          type: 'object' as const,
          properties: {
            range: {
              type: 'string' as const,
              description: 'The range to clear in A1 notation',
            },
          },
          required: ['range'],
        },
      },
      // TODO: Add get_spreadsheet_metadata tool
      // {
      //   name: 'get_spreadsheet_metadata',
      //   description: 'Get metadata about the spreadsheet including sheet names and properties.',
      //   input_schema: {
      //     type: 'object' as const,
      //     properties: {},
      //     required: [],
      //   },
      // },
    ];
  }

  async handleToolCall(
    toolCall: ToolCall,
    spreadsheetId: string,
    conversation: Conversation
  ): Promise<ToolResult> {
    const writeOperations = ['write_range', 'append_row', 'clear_range'];
    const requiresConfirmation = writeOperations.includes(toolCall.name);
    
    if (requiresConfirmation) {
      // Write operation - require confirmation
      conversation.addPendingToolCall(toolCall);
      return {
        toolUseId: toolCall.id,
        content: JSON.stringify({
          pending: true,
          operation: toolCall.name,
          range: toolCall.input.range,
          values: toolCall.input.values,
        }),
        isError: false,
        requiresConfirmation: true,
      };
    } else {
      // Read operations can proceed immediately
      return await this.executeToolCall(toolCall, spreadsheetId);
    }
  }

  async executeToolCall(
    toolCall: ToolCall,
    spreadsheetId: string
  ): Promise<ToolResult> {
    try {
      let result: any;

      switch (toolCall.name) {
        case 'read_range':
          result = await this.sheetsService.readRange(
            spreadsheetId,
            toolCall.input.range
          );
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              values: result.values,
              range: result.range,
            }),
            isError: false,
            requiresConfirmation: false,
          };

        case 'write_range':
          result = await this.sheetsService.writeRange(
            spreadsheetId,
            toolCall.input.range,
            toolCall.input.values,
            toolCall.input.valueInputOption || 'USER_ENTERED'
          );
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              updatedCells: result.updatedCells,
              updatedRows: result.updatedRows,
              updatedRange: result.updatedRange,
            }),
            isError: false,
            requiresConfirmation: false,
          };

        case 'append_row':
          result = await this.sheetsService.appendRow(
            spreadsheetId,
            toolCall.input.range,
            toolCall.input.values,
            toolCall.input.valueInputOption || 'USER_ENTERED'
          );
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              updatedCells: result.updatedCells,
              updatedRows: result.updatedRows,
              updatedRange: result.updatedRange,
            }),
            isError: false,
            requiresConfirmation: false,
          };

        case 'clear_range':
          result = await this.sheetsService.clearRange(
            spreadsheetId,
            toolCall.input.range
          );
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              clearedRange: result.clearedRange,
            }),
            isError: false,
            requiresConfirmation: false,
          };

        default:
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              error: `Unknown tool: ${toolCall.name}`,
            }),
            isError: true,
            requiresConfirmation: false,
          };
      }
    } catch (error: any) {
      return {
        toolUseId: toolCall.id,
        content: JSON.stringify({
          error: error.message || 'Tool execution failed',
        }),
        isError: true,
        requiresConfirmation: false,
      };
    }
  }
}
