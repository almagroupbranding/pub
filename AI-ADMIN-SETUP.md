# The Alma AI Admin — Option 2 Build

This package adds:

1. `ai-admin.html`  
   Admin-only AI writer. It drafts an event/news update and only publishes after approval.

2. `function-ai.html`  
   Public AI-assisted function room enquiry. It asks no more than three questions, checks availability files, filters unsuitable events, and emails the owner.

3. `worker/`  
   Cloudflare Worker backend. This keeps the OpenAI key, GitHub token and email key secret.

4. `content/function-availability.json`  
   Editable booked/pending dates for the function room.

5. Updated `.pages.yml`  
   Pages CMS can now edit function room availability too.

---

## Why a Worker is needed

GitHub Pages is public static hosting. It must not contain:

- OpenAI API keys
- GitHub tokens
- email API keys
- admin passwords

The Worker is the private secure layer.

---

## Deploy the website files

Upload all files except the `worker/` folder to the `/pub` GitHub repository root.

Make sure `.pages.yml` is present in the root. If hidden files are missed, use `PAGES-CMS-CONFIG-COPY.yml` and create `.pages.yml` manually.

---

## Deploy the Worker

From the `worker/` folder:

```bash
npm install
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Use a long random value for `SESSION_SECRET`.

---

## GitHub token

Create a fine-grained GitHub token with access only to:

- owner: `almagroupbranding`
- repo: `pub`
- permission: Contents read/write

The Worker uses this to update:

- `content/events.json`
- `content/news.json`

---

## Email

This template uses Resend for email.

Set:

```toml
FROM_EMAIL = "The Alma <events@your-verified-domain.co.uk>"
OWNER_EMAIL = "info@thealmapub.co.uk"
```

You must verify the sending domain in Resend first.

---

## Connect the front-end pages to the Worker

After deploying the Worker, copy its URL.

In both:

- `ai-admin.html`
- `function-ai.html`

replace:

```js
const API_BASE = window.ALMA_AI_API || "https://YOUR-WORKER.your-subdomain.workers.dev";
```

with the actual Worker URL.

---

## Calendar checking

The AI function enquiry currently checks:

- `content/events.json`
- `content/function-availability.json`

That means it will avoid known public events and known booked/pending function dates.

Later Phase 3 can connect directly to Google Calendar, Outlook Calendar, or a proper booking system API.
