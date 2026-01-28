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

  isConfigured(): boolean {
    return this.sheets !== null;
  }
}
