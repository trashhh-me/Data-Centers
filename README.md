# Where does the internet live?

A scroll-driven walk from your phone to the data centers behind it, and what they cost. Chapters follow the "The Cloud Was Never Weightless" wireframes: opening, inside, never sleeps, the bill, Nepal, afterlife, questions, end.

## Run it

It is plain HTML, CSS and JS with no build step. `content.json` is fetched at load, so serve the folder instead of opening the file directly:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Files

| File | What it holds |
| --- | --- |
| `content.json` | All text, sources, drawer explainers, map data, questions and the 3D model's parts |
| `index.html` | Page skeleton and the inline SVG illustrations, one per chapter |
| `style.css` | Palette, layout, and the scroll-state rules that animate each illustration |
| `script.js` | Builds the steps from `content.json`, scroll engine, interactions, narration, 3D viewer |

## How a chapter works

Each chapter is a column of steps (left) beside one pinned illustration (right). When a step crosses the middle of the screen, the illustration's `data-state` changes and CSS does the rest. On phones the illustration pins to the top and the steps scroll beneath it.

To change a sentence, edit `content.json`. To add a step, add an entry to a chapter's `steps` with a `state` name, then style that state in `style.css`.

## Notes

- Audio narration is off by default and uses the browser's speech synthesis.
- "· more" tags open a side drawer, never a modal. Esc closes it.
- The 3D model (Three.js) loads only when "Look closer" is opened.
- Facts for the Nepal chapter and the drawer sources are taken from the wireframes. Items the wireframes marked `[verify]` are flagged in the drawer ("Where these numbers come from").
