# Function AI fix

The previous function AI relied on the Cloudflare model returning JSON. The free model sometimes replies in prose, causing:

`AI did not return usable JSON`

This version fixes the function enquiry by making the core enquiry logic rule-based.

It now:
- extracts date;
- extracts event type;
- extracts guest count;
- extracts timing;
- filters unsuitable enquiries such as 18ths and children’s parties;
- checks booked/pending dates and public events;
- sends/records the enquiry without relying on AI JSON.

## Install

1. Upload `site-config.js` to `/pub` if it has been overwritten.
2. Open `CLOUDFLARE-WORKER-FUNCTION-FIX-CODE.js`.
3. Copy all code.
4. Paste it into the Cloudflare Worker editor.
5. Deploy.

Then test `function-ai.html` again.
