# Fixing "Failed to fetch" Error

The "Failed to fetch" error when adding your service account JSON typically means the frontend can't connect to the backend server.

## Quick Fixes:

### 1. **Check if Backend is Running**

Make sure the backend server is running. In your terminal, you should see:
```
Backend server running on port 3001
```

If not, start it:
```bash
cd backend
npm run dev
```

Or from the root:
```bash
npm run dev:backend
```

### 2. **Check Backend URL**

The frontend tries to connect to `http://localhost:3001` by default. Verify this matches your backend:

1. Check `frontend/components/ConfigurationModal.tsx` - look for `API_BASE_URL`
2. Or set it in `.env` file:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

### 3. **Test Backend Connection**

Open your browser and go to:
```
http://localhost:3001/health
```

You should see: `{"status":"ok"}`

If you get an error, the backend isn't running or isn't accessible.

### 4. **Check CORS**

The backend should have CORS enabled (it does by default). If you're still having issues:

- Make sure both frontend (port 3000) and backend (port 3001) are running
- Check browser console for CORS errors
- Try accessing the backend directly: `http://localhost:3001/api/sheets/test?spreadsheetId=YOUR_ID`

### 5. **Check Browser Console**

Open Developer Tools (F12) and check:
- **Console tab**: Look for error messages
- **Network tab**: Check if the request to `/api/sheets/configure` is being made
  - If you see a red failed request, click on it to see details
  - Check the request URL - is it pointing to the right backend?

### 6. **Verify Ports**

Make sure ports aren't conflicting:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

If port 3001 is already in use, change it in `.env`:
```
PORT=3002
```

And update `NEXT_PUBLIC_API_URL` accordingly.

### 7. **Check Firewall/Antivirus**

Sometimes firewalls or antivirus software can block localhost connections. Try:
- Temporarily disabling firewall/antivirus
- Or adding an exception for localhost:3001

## Common Error Messages:

### "Failed to fetch" or "NetworkError"
- **Cause**: Backend not running or wrong URL
- **Fix**: Start backend server, verify URL

### "CORS policy" error
- **Cause**: CORS not configured correctly
- **Fix**: Backend should have `app.use(cors())` - already configured

### "Connection refused"
- **Cause**: Backend not running on that port
- **Fix**: Start backend, check port number

## Still Having Issues?

1. **Check terminal output** for backend errors
2. **Check browser console** (F12) for detailed error messages
3. **Try curl** to test backend directly:
   ```bash
   curl http://localhost:3001/health
   ```
4. **Verify environment variables**:
   - Backend needs `ANTHROPIC_API_KEY` in `.env`
   - Frontend needs `NEXT_PUBLIC_API_URL` (optional, defaults to localhost:3001)

## Testing the Configuration Endpoint Directly

You can test if the backend is working by running this in your terminal:

```bash
curl -X POST http://localhost:3001/api/sheets/configure \
  -H "Content-Type: application/json" \
  -d '{"serviceAccountJson":"{\"type\":\"service_account\"}"}'
```

If this works, the backend is fine and the issue is with the frontend connection.
