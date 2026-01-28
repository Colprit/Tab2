# Troubleshooting: Can't See the Sidebar

## The sidebar appears on the RIGHT side of the screen

The AI Assistant sidebar is a **400px wide panel on the RIGHT side** of your browser window. It appears once you:

1. **Enter a Spreadsheet ID** in the input field on the initial page
2. **Click "Load Spreadsheet"** button

## Step-by-Step to See the Sidebar:

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Open your browser:** Go to `http://localhost:3000`

3. **You should see:**
   - A form asking for "Spreadsheet ID"
   - An input field
   - A "Load Spreadsheet" button

4. **Enter a Spreadsheet ID** (from your Google Sheets URL):
   - Example: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
   - Or use a test ID to see the layout

5. **Click "Load Spreadsheet"**

6. **The sidebar should now appear on the RIGHT side:**
   - Left side: Google Sheets iframe (takes most of the screen)
   - Right side: AI Assistant sidebar (400px wide, light gray background)

## If you still can't see it:

### Check Browser Console:
1. Open Developer Tools (F12 or Cmd+Option+I)
2. Look for any JavaScript errors in the Console tab
3. Check the Network tab for failed API requests

### Verify the App is Running:
- Backend should be on `http://localhost:3001`
- Frontend should be on `http://localhost:3000`
- Check terminal for any error messages

### Visual Check:
- The sidebar has a **light gray background** (`#f9f9f9`)
- It should say **"AI Assistant"** at the top
- It's **400px wide** on the right side
- If you see the Google Sheets iframe, the sidebar should be right next to it

### Common Issues:

1. **Sidebar is off-screen:**
   - Try zooming out (Cmd/Ctrl + -)
   - Check if your browser window is wide enough

2. **Only seeing the input form:**
   - Make sure you've entered a spreadsheet ID AND clicked the button
   - The sidebar only appears after loading a spreadsheet

3. **Blank page:**
   - Check browser console for errors
   - Verify both frontend and backend are running
   - Check that dependencies are installed: `npm run install:all`

4. **Sidebar is there but empty:**
   - This is normal if you haven't configured the service account yet
   - Click "Configure Service Account" button in the sidebar

## Quick Test:

To verify the sidebar is working, you can temporarily modify `frontend/app/page.tsx` to always show the sidebar:

```tsx
// Change this line:
if (!spreadsheetId) {
  
// To:
if (false) {  // Always show sidebar for testing
```

This will help you see if the sidebar component itself is rendering correctly.
