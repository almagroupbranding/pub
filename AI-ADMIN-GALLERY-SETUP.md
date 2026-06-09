# The Alma AI Admin + Gallery Manager

This version makes the AI admin a basic site-management dashboard.

It can now:

- draft events and news;
- publish approved updates to GitHub;
- upload gallery photos;
- resize/standardise photos before upload;
- update `content/gallery.json`;
- remove gallery photos.

## Photo upload rule

Photos are resized in the browser before upload:

- max width/height: 1600px
- format: JPEG
- quality: 0.82

This keeps the site faster and avoids massive phone photos slowing down the website.

## What to upload to GitHub

Upload/replace these files in the `/pub` repository:

- `ai-admin.html`
- `site-config.js` if not already correct

## What to paste into Cloudflare

Open:

```text
CLOUDFLARE-WORKER-AI-GALLERY-CODE.js
```

Copy all the code.

In Cloudflare Worker editor:

1. Select all current Worker code.
2. Paste the new code.
3. Click Deploy.

## Required Cloudflare setup

Secrets:

```text
ADMIN_PASSWORD
SESSION_SECRET
GITHUB_TOKEN
```

Bindings:

```text
Workers AI binding name = AI
```

Variables:

```text
SITE_ORIGIN = https://almagroupbranding.github.io
GITHUB_OWNER = almagroupbranding
GITHUB_REPO = pub
GITHUB_BRANCH = main
OWNER_EMAIL = info@thealmapub.co.uk
FROM_EMAIL = The Alma <events@your-verified-domain.co.uk>
CLOUDFLARE_AI_MODEL = @cf/meta/llama-3.1-8b-instruct-fast
```

## If publish does nothing

This new version will show the exact error.

Most common causes:

- `GITHUB_TOKEN` missing in Cloudflare secrets.
- GitHub token does not have Contents: Read and write.
- Token was created for the wrong repo.
- Cloudflare Worker has not been redeployed after adding the token.
