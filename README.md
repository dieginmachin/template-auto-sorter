# Template Auto-Sorter

The "AI Template Library Auto-Sorter" from Hall Of Templates. Connect a Figma file and every email template in it lands on one canvas, sorted by brand, campaign or flow, category, signature section, language, year and length. Click a card to see the full render and jump to the frame in Figma.

Live: https://dieginmachin.github.io/template-auto-sorter/

## How it works

- A static page with no build step and no server. The browser calls `https://api.figma.com` directly with the user's personal access token. The token is stored in that browser only (localStorage, or sessionStorage with "Remember" off) and the page's Content-Security-Policy only allows network calls to api.figma.com.
- `GET /v1/files/:key?depth=4` reads page → section → email frame → its top-level blocks. Sections nested deeper are opened with `GET /v1/files/:key/nodes?ids=…&depth=2`.
- `GET /v1/images/:key?ids=…&scale=0.34&format=jpg` renders thumbnails in batches of 60 as cards scroll into view; the viewer asks for one frame at `scale=1`. Image URLs are cached for 20 days and the sorted file for good (until "Re-sort from Figma"). A 429 waits for `Retry-After` and resumes.

## Sorting rules (`classify.js`)

A template is any frame, component, instance or group 320–900px wide and at least 0.75× as tall as it is wide. Emailify building blocks (🚣 rows, 🎁 wrappers) are skipped.

| Field | Source |
|---|---|
| Brand | The section the frame sits in. In generic sections ("Random", "Section 1") a `(XX)` code at the start of the name maps to the brand that uses the same code elsewhere. Near-duplicate names merge ("Blue Leaf" → "Bluleaf", "Acme Co" → "Acme Co."). |
| Type | Flow when the name says welcome / WS #, abandoned cart, checkout or browse, post-purchase / aftercare, win-back, back in stock; otherwise Campaign. "Email Campaign" in the name always means Campaign. |
| Category | Keyword families in the frame name (English, Spanish, Dutch): Black Friday & Cyber, Holidays, Seasonal moments, Sale & promo, New & launch, Social proof, Education & story, Product spotlight, Engagement & newsletter. Without a keyword the layer structure decides (Reviews → Social proof, Discount code → Sale, Articles → Education, Product grid or a bare product name → Product spotlight). |
| Sections | Names of the frame's direct children: announcement bar, header & logo, hero, product grid, image gallery, bento, reviews, discount code, countdown, video, articles & listicle, features & USPs, text & CTA, custom code, contact & help, footer. "Signature section" is the most distinctive one, used for grouping. |
| Language | `(EN)`, `NL \|`, `EN 23/07` style tags, `footer:NL` layers, then common words; templates with no signal take their brand's majority. |
| Year | `YYMMDD` / `DDMMYY` (settled per brand), `Nov 10, 2024`, `2025 / May / 1`, `02.10.24`, `06/30/25`. |
| Length | Short < 1600px, Medium < 3000px, Long. |

## Parts mode (Atomic Emails)

The **Emails / Parts** switch opens a second library for the pieces the Atomic Emails method cuts an email into. Group by Level, Type, Folder, Brand, Width or File.

What counts as a part, in order:

1. Anything inside a page, section or frame whose name starts with **Parts**, **Atomic**, **Components**, **Library** (or Piezas, Componentes, Design system).
2. Inside that area, sections or frames named **Atoms / Molecules / Organisms** set the level. The workshop's **Elements / Containers / Sections** and the Spanish names work too. "01 — Atoms" is fine; "Atom / Button" is a part, not a folder.
3. A part's own name can carry its level: `Atom / Button / Primary`, `Organism - Hero BF`.
4. Components and component sets anywhere else in the file are parts too (a component set counts once, with its variant count).
5. No level word anywhere: size decides. 480px wide or more is an organism; up to 90px tall and 360px wide (or under 30,000px²) is an atom; the rest are molecules. The viewer marks these "(by size)".

Type comes from the part's name, then its folder's name: hero, header & nav, announcement bar, footer, product grid, product card, reviews, discount code, countdown, article, bento, features & USPs, button & CTA, logo, social icons, video, image, text, divider & spacer, badge & label, icon. Folder is the nearest named section or frame (for example "Extracted from BF email"). Brand is the Figma Section around the parts area, else a brand-named page, else the file name (one file per brand).

Recommended layout for extractor output:

```
Page "Parts"
  Section "Atoms"       → Button / Primary, Badge / Sale, Divider, Logo …
  Section "Molecules"   → Product card, Review card, Discount code block …
  Section "Organisms"   → Hero / Split image, Product grid / 2x2, Footer / Standard …
```

## Files

- `index.html`: markup and CSP
- `app.css`: DFY / Atomic Emails styling (Figtree, Instrument Serif, green CTA)
- `app.js`: connect screen, the canvas (after the portfolio's template library), filters, viewer, files panel
- `figma.js`: REST client, caching, thumbnail queue
- `classify.js`: the sorting rules (also runs in Node: `require('./classify.js')`)

To test locally, serve the folder (`python3 -m http.server`) and use a real token. A fixture-based mock of the API lives outside this repo, because the fixtures contain client names.
