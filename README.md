# Where does your photo go?

A 3-minute story that follows one photo from a phone to the building that stores it, shows what data centers gain and cost, and ends on one question: does Nepal need more of them?

Six movements: your photo, inside, growing, what we gain, what it costs, Nepal. Then a short ending.

## Run it

No build step, no network at run time (fonts and the 3D library are in `fonts/` and `vendor/`).

- Kiosk PC: `tools/kiosk.sh` (Chromium full-screen from the local files), or open `index.html`.
- Anywhere else: `python3 -m http.server`, then open <http://localhost:8000>.

On screens 1280 px wide and up the page runs as a kiosk: one screen at a time, tap or swipe to step (or the arrow keys), auto-advance after 6 s (ring on the Next button), screens that wait for a tap use 12 s, and 60 s of no input shows "Still there?" and then returns to the start (clearing the visitor's vote, pick and narration). On phones and tablets the same story scrolls, with the picture pinned at the top.

## Change the words

1. Edit `content.json` (titles, drawers, map data, questions).
2. `node tools/inline-content.js` (writes `content.inline.js`, which is what the page loads, so it also works from `file://`).
3. `node tools/check-content.js` (12-word limit, no technical terms in titles, every number has a source tag and drawer, timing, and the list of open items).

A step with `"hold"` is left out of the story until the reason is cleared. A step or drawer block marked `verify` or `pending` shows up in the checker's open-items list.

## Votes and picks

Counts (not one value) are kept in the browser's localStorage, per day. Open the page with `?staff=1` to get an "Export votes (CSV)" button; it downloads `votes-YYYY-MM-DD.csv`.

## Files

| File | What it is |
| --- | --- |
| `content.json` / `content.inline.js` | All text and data / the same, inlined for offline use |
| `index.html` | Page skeleton and one SVG picture per movement |
| `style.css` | Palette, kiosk and scroll layouts, and the CSS that animates each picture by `data-state` |
| `script.js` | Builds steps from content, kiosk deck, scroll engine, drawer, idle reset, votes, 3D viewer |
| `fonts/`, `vendor/` | Poppins 400 and 700 (woff2, SIL Open Font License), three.js r128 (MIT) |
| `tools/` | Content inliner, content checker, kiosk launcher |

## Open items before launch

Run `node tools/check-content.js` for the live list. At the time of writing:

- 5.3 (about a million litres of water a day) is held back: the only source is a news report; find the primary source or cut it.
- 5.2: confirm the Xiao et al., 2025 citation.
- The Upper Trishuli-1 drawer needs the developer's and lender's response, and a read-through by someone from the affected communities.
- Link Amnesty's 2016 cobalt report directly in the cobalt drawer; add a yardstick for the 62 million tonnes of e-waste if you want the figure on a drawer line of its own.
- 6.4 question wording is a draft.
