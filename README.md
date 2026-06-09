# The Alma — Phase 1 Website Rebuild

This is the Phase 1 static rebuild for the new `/pub` repository.

## What this includes

- Full branded static website
- Home page
- Food & Drink page
- Events page
- Venue Hire enquiry page
- Gallery
- About
- Contact
- Jobs placeholder
- Content stored in `/content/*.json`
- Alma signage-inspired visual identity
- GitHub Pages-ready

## Upload to `/pub`

Upload everything in this folder to the root of the new GitHub repository:

```text
/pub
├── index.html
├── food-drink.html
├── events.html
├── venue-hire.html
├── gallery.html
├── about.html
├── contact.html
├── jobs.html
├── style.css
├── script.js
├── assets/
├── content/
└── admin/
```

Then enable GitHub Pages:

Settings → Pages → Deploy from branch → main → /root.

The live URL should become:

```text
https://almagroupbranding.github.io/pub/
```

## Editing content in Phase 1

For now, edit:

- `content/settings.json` for address, times, phone and email
- `content/events.json` for events
- `content/news.json` for news updates
- `content/gallery.json` for gallery images
- `content/food.json` for food and menu copy

## Phase 2 dashboard

Recommended next step: add Pages CMS or CloudCannon so owners can update:

- events
- news
- offers
- gallery images
- opening hours
- menus
- venue-hire wording

This keeps the easy dashboard feel of Useyourlocal, but with a fully branded site.
