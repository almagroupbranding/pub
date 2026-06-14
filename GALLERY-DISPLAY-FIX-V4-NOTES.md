# Gallery display fix v4

This patch fixes the gallery admin preview issue.

## What was happening

The admin dashboard was reading the updated gallery JSON straight from GitHub, but newly uploaded image files can take a minute or two to appear through GitHub Pages. That made the gallery card appear immediately while the image itself looked broken.

Some older imported images were also remote `useyourlocal` image URLs, and a few of those may no longer load reliably.

## What changed

- AI Admin gallery previews now use the raw GitHub image URL for locally uploaded images.
- Public gallery keeps using normal site paths, with a raw GitHub fallback for local uploaded images.
- Broken/missing gallery images now fail more gracefully.
- Admin cards now show the saved image path, which makes debugging much easier.

## Still recommended

Replace older remote UseYourLocal gallery images with locally uploaded photos through the AI Admin gallery tab.
