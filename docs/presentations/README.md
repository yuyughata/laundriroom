# Presentations

Two training decks, each saved as a PDF to read or share and as source files to
edit.

| Deck | For | PDF | Speaker notes | Live (claude.ai) |
|---|---|---|---|---|
| **How an Order Flows** (team training, 24 slides) | laundriroom staff who sign up and support vendors: the order cycle, customer and vendor side by side, the money, behind the scenes, the pitch | [team-training.pdf](team-training.pdf) | [notes](team-training-speaker-notes.pdf) | [open](https://claude.ai/artifact/CPECY9iyr8S2onM1Eue2J8) |
| **Partner Playbook** (27 slides) | Laundry partners and their managers: set-up, every order, growing and getting paid, standards and help | [partner-playbook.pdf](partner-playbook.pdf) | [notes](partner-playbook-speaker-notes.pdf) | [open](https://claude.ai/artifact/96P7jxVN6dX3AzCuNPYJ84) |

The live decks are private claude.ai pages. Share them from the page's Share
menu, or send the PDF.

**Before presenting**, fill in the placeholders. The commission rate `[__%]`
appears in both decks. The Playbook's last slide also needs `[WhatsApp number]`,
`[partner support email]` and `[support hours]`.

## What's in each folder

```
<deck>/
  deck.json        title, slide order, sections, fonts
  slides/<id>.html one <section> per slide; <aside> = the speaker's script
  images/<id>.png  screenshots and logos; slides reference them as /_blob/<id>
```

The slides use the claude.ai Slides format. `<x-icon>` and `<x-shape>` are
drawn by the viewer there. Images point at the deck's claude.ai asset store
(`/_blob/<id>`), and `images/` holds a copy of each one under the same id.

## Updating a deck

1. Edit the slide in `slides/` (or ask Claude to). If you change a screenshot,
   upload the new image to the deck's asset store and use the `/_blob/<id>`
   it returns, then save a copy in `images/` under that id.
2. Republish the slide to the live deck. On claude.ai the files are served as
   `project/deck.json` and `project/slides/<id>.html`; Claude can publish the
   changed file to the deck's URL.
3. Rebuild the PDFs:

```bash
node scripts/render-deck-pdf.mjs docs/presentations/team-training docs/presentations/team-training.pdf docs/presentations/team-training-speaker-notes.pdf
```

```bash
node scripts/render-deck-pdf.mjs docs/presentations/partner-playbook docs/presentations/partner-playbook.pdf docs/presentations/partner-playbook-speaker-notes.pdf
```

The script needs Playwright with Chromium (`npm i -D playwright && npx
playwright install chromium`). It stops with an error if an image is missing or
a slide's content runs into its footer. In the PDF, icons are simple line
drawings rather than the viewer's icon font.

The decks were last updated on 2026-11-04 to match the commission rules
(migrations `0041`/`0042`): commission is added on top of the vendor's prices,
and on an express order the express charge replaces it.
