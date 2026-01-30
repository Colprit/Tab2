import { SheetsService } from './sheetsService';
import { Conversation } from './conversationManager';

interface ToolCall {
  id: string;
  name: string;
  input: any;
}

interface ToolResult {
  toolUseId: string;
  content: string; // Formatted string content for tool_result
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
      {
        name: 'create_chart',
        description: 'Create a chart in the Google Sheet from the specified data range. This operation requires user confirmation before execution. The chart requires an X-axis (single column) and one or more Series (one or more columns). The first column in the range is used as the X-axis, and subsequent columns are used as Series.',
        input_schema: {
          type: 'object' as const,
          properties: {
            chartType: {
              type: 'string' as const,
              enum: ['LINE', 'COLUMN', 'BAR', 'PIE', 'AREA', 'SCATTER'],
              description: 'The type of chart to create: LINE (line chart), COLUMN (column/bar chart), BAR (horizontal bar chart), PIE (pie chart), AREA (area chart), SCATTER (scatter plot)',
            },
            dataSourceRange: {
              type: 'string' as const,
              description: 'The data range to chart in A1 notation. Must be a SINGLE CONTIGUOUS rectangular range in the format "START_CELL:END_CELL" where START_CELL and END_CELL are cell references like A1, B2, etc. Examples: "A1:C10" (columns A-C, rows 1-10), "Sheet1!A1:C10" (with sheet name). IMPORTANT: The range must be contiguous - multiple ranges separated by commas are NOT valid. For example, "A1:C10" is valid, but "A1:B10,C1:D10" or "Sheet1!B2:B25,E2:E25" are NOT valid. If you need non-contiguous data, you must use a single contiguous range that includes all the data you want. STRUCTURE: The first column in the range is the X-axis (single choice - one column for categories/labels). Subsequent columns are the Series (single or multichoice - one or more columns for data values). Minimum: 2 columns (1 X-axis column + at least 1 Series column). Example: "A1:C10" means column A is X-axis, columns B and C are Series.',
            },
            title: {
              type: 'string' as const,
              description: 'Optional title for the chart',
            },
            legendPosition: {
              type: 'string' as const,
              enum: ['BOTTOM_LEGEND', 'LEFT_LEGEND', 'RIGHT_LEGEND', 'TOP_LEGEND', 'NO_LEGEND'],
              description: 'Position of the legend. Default is BOTTOM_LEGEND.',
              default: 'BOTTOM_LEGEND',
            },
            position: {
              type: 'object' as const,
              properties: {
                rowIndex: {
                  type: 'number' as const,
                  description: 'Row index where to place the chart (0-based). Default is 0.',
                },
                columnIndex: {
                  type: 'number' as const,
                  description: 'Column index where to place the chart (0-based). Default is after the data range.',
                },
              },
            },
          },
          required: ['chartType', 'dataSourceRange'],
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
    const writeOperations = ['write_range', 'append_row', 'clear_range', 'create_chart'];
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
          chartType: toolCall.input.chartType,
          dataSourceRange: toolCall.input.dataSourceRange,
          title: toolCall.input.title,
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
          
          // Format as markdown table for better readability
          const formattedContent = this.formatReadRangeResult(result);
          
          return {
            toolUseId: toolCall.id,
            content: formattedContent,
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

        case 'create_chart':
          result = await this.sheetsService.createChart(
            spreadsheetId,
            {
              chartType: toolCall.input.chartType,
              dataSourceRange: toolCall.input.dataSourceRange,
              title: toolCall.input.title,
              legendPosition: toolCall.input.legendPosition,
              position: toolCall.input.position,
            }
          );
          return {
            toolUseId: toolCall.id,
            content: JSON.stringify({
              success: true,
              chartId: result.chartId,
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

  /**
   * Formats read_range results as CSV with metadata
   * Returns a formatted string that's easy for Claude to parse and understand
   */
  private formatReadRangeResult(result: { values: any[][]; range: string }): string {
    const { values, range } = result;
    if (!values || values.length === 0) {
      return `Range: ${range}\n\nNo data found in this range.`;
    }

    const maxCols = Math.max(...values.map(row => row.length));
    let output = `Range: ${range}\n`;
    output += `Data: ${values.length} row${values.length !== 1 ? 's' : ''}, ${maxCols} column${maxCols !== 1 ? 's' : ''}\n\n`;

    // Format as CSV
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const csvCells: string[] = [];
      for (let col = 0; col < maxCols; col++) {
        const cellValue = row[col]?.toString() || '';
        // Escape CSV: wrap in quotes if contains comma, quote, or newline
        if (cellValue.includes(',') || cellValue.includes('"') || cellValue.includes('\n')) {
          csvCells.push(`"${cellValue.replace(/"/g, '""')}"`);
        } else {
          csvCells.push(cellValue);
        }
      }
      output += csvCells.join(',') + '\n';
    }

    return output.trim();
  }
}
