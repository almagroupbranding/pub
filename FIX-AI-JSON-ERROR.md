# Fix for “AI did not return usable JSON”

Cloudflare's free AI model sometimes replies in normal prose instead of strict JSON.

This update fixes that by:

- making the JSON instruction stronger;
- accepting code-fenced JSON;
- adding a safe fallback draft if the model still does not return JSON.

## What to do

1. Open `CLOUDFLARE-WORKER-AI-CODE-v2-JSON-FIX.js`.
2. Copy all of it.
3. Go to Cloudflare Worker editor.
4. Select all current Worker code.
5. Paste this code.
6. Click **Deploy**.

Then test the AI Admin again.

If it shows a warning in the draft, that means the AI model was messy but the system created a safe editable draft anyway.
