# Google Sheets AI Assistant

An AI-powered sidebar assistant for Google Sheets that uses Anthropic's Claude to help you interact with your spreadsheets through natural language. The assistant can read from and write to your Google Sheets, with confirmation prompts for write operations.

## Features

- 🤖 **AI-Powered**: Uses Anthropic's Claude 3.5 Sonnet for intelligent spreadsheet interactions
- 📊 **Google Sheets Integration**: Full read/write access to your Google Sheets via Google Sheets API
- 🔄 **Tool Calling Loop**: Implements a proper tool calling system that handles multiple operations in sequence
- ✅ **Write Confirmations**: All write operations require user confirmation before execution
- 🧠 **Context Management**: Automatically handles context window limits with intelligent message compaction
- 🎨 **Modern UI**: Clean sidebar interface with Google Sheets embedded via iframe

## Prerequisites

1. **Anthropic API Key**: Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. **Google Service Account**: Create a service account and download the JSON credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google Sheets API
   - Create a service account and download the JSON key file
   - Share your Google Sheet with the service account email (found in the JSON file)

## Installation

1. Clone the repository and install dependencies:

```bash
npm run install:all
```

2. Set up environment variables:

Create a `.env` file in the project root or in `backend/` with:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Optional: `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON string) can be set here, or you can configure the service account in the app UI.

3. Start the development servers:

From the **root directory**, simply run:

```bash
npm run dev
```

This will start **both** servers simultaneously:
- Backend server on `http://localhost:3001`
- Frontend Next.js app on `http://localhost:3000`

**Note:** You don't need to cd into frontend or backend directories - the root `npm run dev` command handles both!

## Usage

1. Open the application in your browser: `http://localhost:3000`

2. Enter your Google Spreadsheet ID (found in the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`)

3. Click "Configure Service Account" and paste your Google Service Account JSON credentials

4. Start chatting with the AI assistant! Try commands like:
   - "What's in cell A1?"
   - "Read the range A1:C10"
   - "Add a new row with values: Name, Age, City"
   - "Write 'Hello' to cell B5"
   - "Clear the range A10:C10"

## Architecture

### Backend (`/backend`)

- **Express API Server**: Handles chat requests and Google Sheets operations
- **Chat Service**: Manages conversations and Anthropic API interactions
- **Tool Call Handler**: Processes tool calls (read/write operations)
- **Conversation Manager**: Handles conversation history and context window management
- **Sheets Service**: Google Sheets API wrapper
- **Jest tests**: Unit tests for conversation manager and context handling

### Frontend (`/frontend`)

- **Next.js App**: React-based frontend
- **Sidebar Component**: Main UI with Google Sheets iframe and chat interface
- **Chat Interface**: Message handling and display
- **Configuration Modal**: Service account setup
- **Confirmation Dialog**: Write operation confirmations

## Tool Operations

The AI assistant supports the following operations:

### Read Operations (No Confirmation Required)
- `read_range`: Read values from a specific range
- `get_spreadsheet_metadata`: Get spreadsheet information and sheet names

### Write Operations (Require Confirmation)
- `write_range`: Write values to a specific range
- `append_row`: Append a new row to a range
- `clear_range`: Clear values from a range

## Context Window Management

The system automatically manages context window limits by:
- Estimating token usage for each message
- Compacting older messages when approaching limits
- Preserving recent conversation history
- Adding summaries of older messages when needed

## Development

### Project Structure

```
Tab2/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Express server entry point
│   │   ├── routes/                  # API routes
│   │   │   ├── chat.ts              # Chat endpoints
│   │   │   └── sheets.ts            # Sheets configuration
│   │   └── services/                # Business logic
│   │       ├── chatService.ts       # Chat orchestration
│   │       ├── toolCallHandler.ts   # Tool execution
│   │       ├── conversationManager.ts   # Context management
│   │       ├── conversationManager.test.ts
│   │       └── sheetsService.ts     # Google Sheets API
│   ├── jest.config.js
│   ├── jest.setup.js
│   └── package.json
├── frontend/
│   ├── app/                         # Next.js app directory
│   ├── components/                  # React components
│   └── package.json
└── package.json                     # Root package.json
```

### Running in Development

```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

### Testing

Backend tests use Jest. From the project root:

```bash
cd backend && npm test
```

Watch mode: `npm run test:watch`. Verbose: `npm run test:verbose`.

## Security Notes

- The Google Service Account JSON is stored in memory only (not persisted)
- All API calls are made server-side
- Never commit your `.env` file or service account JSON to version control

## Additional Documentation

- **[SETUP.md](SETUP.md)** — Detailed setup and configuration
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Sidebar visibility and common issues

## License

MIT
