# Phase 2 Dashboard / AI Plan

## Best dashboard options

1. Pages CMS
   - Low cost
   - Works with GitHub files
   - Good for events, news, gallery and opening hours

2. CloudCannon
   - More polished for clients
   - Best editor experience
   - Paid/professional option

3. Decap CMS
   - Popular static-site CMS
   - Needs more authentication setup

## AI assistant workflow

Do not let AI publish without approval.

Recommended flow:

Owner writes:
"Add karaoke on Thursday 18 July, starts 8pm, free entry."

AI turns it into:
- short event title
- warm Alma-style description
- date/time
- social caption
- website event card

Owner approves, then it commits to:
`content/events.json`

GitHub Pages rebuilds the website.
