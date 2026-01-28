# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm run install:all
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Start Development Servers**
   
   From the **root directory** (not in frontend or backend folders):
   ```bash
   npm run dev
   ```
   
   This starts **both** servers at once:
   - Backend: http://localhost:3001
   - Frontend: http://localhost:3000
   
   **You only need one command!** The root `package.json` uses `concurrently` to run both.

4. **Configure Google Service Account**
   - Open http://localhost:3000
   - Enter your Google Spreadsheet ID
   - Click "Configure Service Account"
   - Paste your Google Service Account JSON

## Google Service Account Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Sheets API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create a Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in details and create
   - Click on the service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key" > "JSON"
   - Download the JSON file
5. Share your Google Sheet:
   - Open your Google Sheet
   - Click "Share"
   - Add the service account email (found in the JSON file as `client_email`)
   - Give it "Editor" permissions

## Getting Your Spreadsheet ID

From your Google Sheets URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Copy the `SPREADSHEET_ID` part.

## Troubleshooting

### "Google Sheets service not configured"
- Make sure you've pasted the service account JSON in the configuration modal
- Verify the JSON is valid

### "Failed to connect to spreadsheet"
- Ensure the Google Sheets API is enabled
- Verify you've shared the sheet with the service account email
- Check that the spreadsheet ID is correct

### CORS Errors
- Make sure both frontend and backend are running
- Check that `NEXT_PUBLIC_API_URL` in `.env` matches your backend URL

### Port Already in Use
- Change `PORT` in `.env` to a different port
- Update `NEXT_PUBLIC_API_URL` accordingly
