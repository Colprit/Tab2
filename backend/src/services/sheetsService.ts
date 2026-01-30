import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export class SheetsService {
  private auth: JWT | null = null;
  private sheets: any = null;
  private static instance: SheetsService | null = null;

  static getInstance(): SheetsService {
    if (!SheetsService.instance) {
      SheetsService.instance = new SheetsService();
    }
    return SheetsService.instance;
  }

  async configure(serviceAccountJson: any) {
    try {
      const credentials = typeof serviceAccountJson === 'string' 
        ? JSON.parse(serviceAccountJson) 
        : serviceAccountJson;

      this.auth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.readonly'
        ],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error: any) {
      throw new Error(`Failed to configure Google Sheets: ${error.message}`);
    }
  }

  async testConnection(spreadsheetId: string) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      return {
        success: true,
        title: response.data.properties?.title,
        spreadsheetId: response.data.spreadsheetId,
      };
    } catch (error: any) {
      throw new Error(`Failed to connect to spreadsheet: ${error.message}`);
    }
  }

  async readRange(spreadsheetId: string, range: string) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return {
        values: response.data.values || [],
        range: response.data.range,
      };
    } catch (error: any) {
      throw new Error(`Failed to read range: ${error.message}`);
    }
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption,
        requestBody: {
          values,
        },
      });

      return {
        updatedCells: response.data.updatedCells,
        updatedRows: response.data.updatedRows,
        updatedColumns: response.data.updatedColumns,
        updatedRange: response.data.updatedRange,
      };
    } catch (error: any) {
      throw new Error(`Failed to write range: ${error.message}`);
    }
  }

  async appendRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [values],
        },
      });

      return {
        updatedCells: response.data.updates?.updatedCells,
        updatedRows: response.data.updates?.updatedRows,
        updatedRange: response.data.updates?.updatedRange,
      };
    } catch (error: any) {
      throw new Error(`Failed to append row: ${error.message}`);
    }
  }

  async getSpreadsheetMetadata(spreadsheetId: string) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      return {
        title: response.data.properties?.title,
        sheets: response.data.sheets?.map((sheet: any) => ({
          title: sheet.properties?.title,
          sheetId: sheet.properties?.sheetId,
          gridProperties: sheet.properties?.gridProperties,
        })) || [],
      };
    } catch (error: any) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  async clearRange(spreadsheetId: string, range: string) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      const response = await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });

      return {
        clearedRange: response.data.clearedRange,
      };
    } catch (error: any) {
      throw new Error(`Failed to clear range: ${error.message}`);
    }
  }

  async createChart(
    spreadsheetId: string,
    options: {
      sheetId?: number;
      chartType: 'LINE' | 'COLUMN' | 'BAR' | 'PIE' | 'AREA' | 'SCATTER';
      dataSourceRange: string;
      title?: string;
      position?: {
        rowIndex?: number;
        columnIndex?: number;
      };
      legendPosition?: 'BOTTOM_LEGEND' | 'LEFT_LEGEND' | 'RIGHT_LEGEND' | 'TOP_LEGEND' | 'NO_LEGEND';
    }
  ) {
    if (!this.sheets) {
      throw new Error('Google Sheets service not configured');
    }

    try {
      // Get spreadsheet metadata to resolve sheet IDs
      const metadata = await this.getSpreadsheetMetadata(spreadsheetId);
      if (metadata.sheets.length === 0) {
        throw new Error('No sheets found in spreadsheet');
      }

      // Parse the data source range to extract sheet name and range
      let sheetName: string | null = null;
      let range: string;
      if (options.dataSourceRange.includes('!')) {
        const parts = options.dataSourceRange.split('!');
        sheetName = parts[0] || null;
        range = parts[1] || options.dataSourceRange;
      } else {
        range = options.dataSourceRange;
      }

      // Validate that the range is contiguous (no commas allowed)
      // Commas indicate multiple ranges, which are not supported for charts
      if (range.includes(',')) {
        throw new Error(
          `Invalid range format: "${options.dataSourceRange}". ` +
          `Ranges with commas (multiple ranges) are not valid for charts. ` +
          `The range must be a single contiguous rectangular area. ` +
          `Examples of valid ranges: "A1:C10", "Sheet1!B2:E25". ` +
          `Examples of invalid ranges: "B2:B25,E2:E25", "Sheet1!B2:B25,E2:E25". ` +
          `If you need to chart non-contiguous data, use a single range that includes all columns (e.g., "B2:E25" instead of "B2:B25,E2:E25").`
        );
      }

      // Determine sheet ID
      let sheetId = options.sheetId;
      if (!sheetId) {
        if (sheetName) {
          // Find sheet by name
          const sheet = metadata.sheets.find((s: any) => s.title === sheetName);
          if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not found`);
          }
          sheetId = sheet.sheetId;
        } else {
          // Use first sheet as default
          sheetId = metadata.sheets[0].sheetId;
        }
      }

      // Helper function to convert column letter to index (A=0, B=1, etc.)
      const colToIndex = (col: string): number => {
        let index = 0;
        for (let i = 0; i < col.length; i++) {
          index = index * 26 + (col.charCodeAt(i) - 64);
        }
        return index - 1;
      };

      // Parse A1 notation range (e.g., "A1:C10")
      const parseRange = (rangeStr: string) => {
        const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
        if (!match) {
          throw new Error(
            `Invalid range format: "${rangeStr}". ` +
            `Expected a single contiguous range in A1 notation (e.g., "A1:C10" or "Sheet1!B2:E25"). ` +
            `The range must be a rectangular area defined by two cell references separated by a colon. ` +
            `Multiple ranges separated by commas are not supported.`
          );
        }
        return {
          startRow: parseInt(match[2]) - 1, // Convert to 0-based
          startCol: colToIndex(match[1]),
          endRow: parseInt(match[4]), // End is exclusive
          endCol: colToIndex(match[3]) + 1, // End is exclusive
        };
      };

      const rangeIndices = parseRange(range);
      const numSeriesColumns = rangeIndices.endCol - rangeIndices.startCol - 1; // Exclude first column (X-axis)

      if (numSeriesColumns < 1) {
        throw new Error(
          'Chart requires at least one Series column. ' +
          'The range must include: 1 X-axis column (first column) + at least 1 Series column (subsequent columns). ' +
          'Example: "A1:B10" where A is X-axis and B is a Series, or "A1:C10" where A is X-axis and B,C are Series.'
        );
      }

      // Build the chart specification
      const chartSpec: any = {
        title: options.title || '',
        basicChart: {
          chartType: options.chartType,
          legendPosition: options.legendPosition || 'BOTTOM_LEGEND',
          domains: [
            {
              domain: {
                sourceRange: {
                  sources: [
                    {
                      sheetId: sheetId,
                      startRowIndex: rangeIndices.startRow,
                      startColumnIndex: rangeIndices.startCol,
                      endRowIndex: rangeIndices.endRow,
                      endColumnIndex: rangeIndices.startCol + 1,
                    },
                  ],
                },
              },
            },
          ],
          series: [],
          headerCount: 1,
        },
      };

      // Add series for each data column (skip first column which is X-axis)
      for (let i = 0; i < numSeriesColumns; i++) {
        chartSpec.basicChart.series.push({
          series: {
            sourceRange: {
              sources: [
                {
                  sheetId: sheetId,
                  startRowIndex: rangeIndices.startRow,
                  startColumnIndex: rangeIndices.startCol + 1 + i,
                  endRowIndex: rangeIndices.endRow,
                  endColumnIndex: rangeIndices.startCol + 2 + i,
                },
              ],
            },
          },
          targetAxis: 'LEFT_AXIS',
        });
      }

      // Set chart position (default to row 0, column after data)
      const position = options.position || { 
        rowIndex: 0, 
        columnIndex: rangeIndices.endCol + 1 
      };

      // Execute batch update to add chart
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addChart: {
                chart: {
                  spec: chartSpec,
                  position: {
                    overlayPosition: {
                      anchorCell: {
                        sheetId: sheetId,
                        rowIndex: position.rowIndex || 0,
                        columnIndex: position.columnIndex || 0,
                      },
                      offsetXPixels: 0,
                      offsetYPixels: 0,
                    },
                  },
                },
              },
            },
          ],
        },
      });

      return {
        chartId: response.data.replies?.[0]?.addChart?.chart?.chartId,
        success: true,
      };
    } catch (error: any) {
      throw new Error(`Failed to create chart: ${error.message}`);
    }
  }

  isConfigured(): boolean {
    return this.sheets !== null;
  }
}
