import { SheetsService } from './sheetsService.js';
import { Conversation } from './conversationManager.js';

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
          type: 'object',
          properties: {
            range: {
              type: 'string',
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
          type: 'object',
          properties: {
            range: {
              type: 'string',
              description: 'The range to write to in A1 notation (e.g., "A1:C3" or "Sheet1!A1:C3")',
            },
            values: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  type: ['string', 'number', 'boolean'],
                },
              },
              description: 'A 2D array of values to write. Each inner array represents a row.',
            },
            valueInputOption: {
              type: 'string',
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
          type: 'object',
          properties: {
            range: {
              type: 'string',
              description: 'The range to append to (e.g., "A:C" or "Sheet1!A:C")',
            },
            values: {
              type: 'array',
              items: {
                type: ['string', 'number', 'boolean'],
              },
              description: 'An array of values for the new row',
            },
            valueInputOption: {
              type: 'string',
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
          type: 'object',
          properties: {
            range: {
              type: 'string',
              description: 'The range to clear in A1 notation',
            },
          },
          required: ['range'],
        },
      },
      {
        name: 'get_spreadsheet_metadata',
        description: 'Get metadata about the spreadsheet including sheet names and properties.',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  async handleToolCalls(
    content: any[],
    spreadsheetId: string,
    conversation: Conversation
  ): Promise<ToolResult[]> {
    const toolCalls: ToolCall[] = [];

    for (const item of content) {
      if (item.type === 'tool_use') {
        toolCalls.push({
          id: item.id,
          name: item.name,
          input: item.input,
        });
      }
    }

    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(
        toolCall,
        spreadsheetId,
        conversation
      );
      results.push(result);
    }

    return results;
  }

  async executeToolCall(
    toolCall: ToolCall,
    spreadsheetId: string,
    conversation: Conversation
  ): Promise<ToolResult> {
    const writeOperations = ['write_range', 'append_row', 'clear_range'];
    const requiresConfirmation = writeOperations.includes(toolCall.name);

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
          if (requiresConfirmation) {
            // Store pending tool call for confirmation
            conversation.addPendingToolCall(toolCall);
            return {
              toolUseId: toolCall.id,
              content: JSON.stringify({
                pending: true,
                operation: 'write_range',
                range: toolCall.input.range,
                values: toolCall.input.values,
              }),
              isError: false,
              requiresConfirmation: true,
            };
          }
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
          if (requiresConfirmation) {
            conversation.addPendingToolCall(toolCall);
            return {
              toolUseId: toolCall.id,
              content: JSON.stringify({
                pending: true,
                operation: 'append_row',
                range: toolCall.input.range,
                values: toolCall.input.values,
              }),
              isError: false,
              requiresConfirmation: true,
            };
          }
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
          if (requiresConfirmation) {
            conversation.addPendingToolCall(toolCall);
            return {
              toolUseId: toolCall.id,
              content: JSON.stringify({
                pending: true,
                operation: 'clear_range',
                range: toolCall.input.range,
              }),
              isError: false,
              requiresConfirmation: true,
            };
          }
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

        case 'get_spreadsheet_metadata':
          result = await this.sheetsService.getSpreadsheetMetadata(spreadsheetId);
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              ...result,
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

  async executeToolCallWithoutConfirmation(
    toolCall: ToolCall,
    spreadsheetId: string
  ): Promise<ToolResult> {
    try {
      let result: any;

      switch (toolCall.name) {
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
