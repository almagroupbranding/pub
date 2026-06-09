# Simple AI Admin Setup

The pages are now easier to use, but the AI still needs a secure backend.

## Why you are seeing “Failed to fetch”

The website is trying to call a placeholder Worker URL:

```js
https://YOUR-WORKER.your-subdomain.workers.dev
```

Until that is replaced, the admin login and function AI cannot work.

## Where the admin password comes from

There is no fixed password.

You create the password by setting this Cloudflare Worker secret:

```text
ADMIN_PASSWORD
```

Whatever value you put there is the password you type into:

```text
https://almagroupbranding.github.io/pub/ai-admin.html
```

Example password you could use while testing:

```text
AlmaAdmin-Change-Me-2026!
```

Do not put the password into GitHub.

---

# Easiest setup route

## Step 1 — Create the Worker

1. Go to Cloudflare.
2. Go to Workers & Pages.
3. Create a Worker.
4. Name it:

```text
alma-ai-admin
```

5. Paste the code from:

```text
worker/src/index.js
```

6. Save and deploy.

Cloudflare will give you a URL like:

```text
https://alma-ai-admin.YOURNAME.workers.dev
```

## Step 2 — Add Worker secrets

In the Worker settings, add these secrets:

```text
ADMIN_PASSWORD
SESSION_SECRET
OPENAI_API_KEY
GITHUB_TOKEN
RESEND_API_KEY
```

Use:

```text
ADMIN_PASSWORD = the admin password you want
SESSION_SECRET = any long random string, 32+ characters
```

The GitHub token needs access only to the `almagroupbranding/pub` repository with Contents read/write.

## Step 3 — Add Worker variables

In the Worker settings, add these variables:

```text
SITE_ORIGIN = https://almagroupbranding.github.io
GITHUB_OWNER = almagroupbranding
GITHUB_REPO = pub
GITHUB_BRANCH = main
OWNER_EMAIL = info@thealmapub.co.uk
FROM_EMAIL = The Alma <events@your-verified-domain.co.uk>
OPENAI_MODEL = gpt-4.1-mini
```

## Step 4 — Connect the site to the Worker

Open this file in GitHub:

```text
site-config.js
```

Replace:

```js
window.ALMA_AI_API = "https://YOUR-WORKER.your-subdomain.workers.dev";
```

With your real Worker URL:

```js
window.ALMA_AI_API = "https://alma-ai-admin.YOURNAME.workers.dev";
```

Commit the change.

## Step 5 — Test

Open:

```text
https://almagroupbranding.github.io/pub/ai-admin.html
```

Type the password you set as `ADMIN_PASSWORD`.

---

# What works after setup

## Admin AI

The admin can type:

```text
Add karaoke next Thursday at 8pm. Free entry. Make it sound warm and local.
```

The AI drafts the event.

The admin approves it.

The Worker updates:

```text
content/events.json
```

GitHub Pages republishes the site.

## Function AI

Customers can use:

```text
https://almagroupbranding.github.io/pub/function-ai.html
```

It checks:

```text
content/events.json
content/function-availability.json
```

Then emails the enquiry to the owner.

It does not confirm bookings.
