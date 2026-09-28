# BTS order check

Sorts a status 20 export into four lists before anyone opens an order in Pronto:
**hold**, **check**, **backorder**, **clean**.

Runs entirely in the browser. Both CSVs stay on the machine that loaded them.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # rule regression tests
npm run build    # produces dist/ for Static Web Apps
```

Drop in the two exports:

- **Unfinished sales** — the status 20 filter. Required.
- **Outstanding delivery info** — addresses and customer instructions. Optional;
  without it the address and instruction rules stay quiet rather than firing on
  every order.

## Adding a rule

Rules live in `src/rules/index.ts` as plain objects. Add one to the array:

```ts
{
  id: 'carrier-mismatch',
  category: 'check',
  label: 'Carrier needs changing',
  test: (order, { config }) => order.delivery?.carrier === config.something,
  detail: (order) => `Currently carrier ${order.delivery?.carrier}`,
}
```

Nothing else changes. The evaluator picks it up, the bucket counts update, and
it gets its own group in the worklist with its own copy button.

Three things to know:

- **Values go in `src/config.ts`, not in rules.** Fee wording, the free delivery
  cutoff, valid year names, the warehouse code. If you are editing a rule to
  change a value, the value is in the wrong place.
- **Precedence is the array in `src/rules/evaluate.ts`** (`CATEGORY_ORDER`).
  An order trips as many rules as apply but appears once, under the most
  serious, carrying all its reasons.
- **Add a test when you add a rule.** `src/test/rules.test.ts` runs against real
  orders from the September export. It is what tells you in December that rule
  fifteen did not break rule three.

## Things in the data that will bite you

These are handled, and will need re-checking if the export template changes.

- **ZROUND lines.** Type SN, "Stock rounding", ordered −1 against shipped 0.
  Comparing them marks a fully shipped order as a backorder. Excluded via
  `config.ignoredItemCodes`.
- **KN lines** are booklist pack headers wrapping the SN lines beneath them.
  Counting them reports the same shortage twice. Only SN lines are compared.
- **Sequence numbers are not decimals.** They run 3.1, 3.11, 3.12 … 3.2, so
  sorting them numerically scrambles the order and breaks student pairing. The
  parser keeps the export's row order and never sorts.
- **Student pairing is positional**: a `Year:` note, then a `Name:` note, then
  that child's items. A name with no year ahead of it is kept separately so it
  gets flagged rather than silently attached to the wrong child.
- **Delivery instructions wrap across Addr 1 to Addr 7** mid-sentence. They are
  concatenated before the rules read them.
- **Charge lines are matched on description prefix, never sequence.** Packing sat
  at 909 in September; delivery takes 909 once added and pushes the rest down.
- **Order No alone is not unique.** Everything keys on Order No + BO Suffix.
- **The Reference field is truncated to 20 characters** by Pronto, so it is shown
  but never matched against the Name tag.

## Orders the checker ignores

Stock transfers, samples and internal ZBTS orders are dropped before the rules
run and listed above the worklist so you can see what was skipped. They have no
student, no packing fee and no payment note, so left in they would sit in check
every run. Markers are in `config.internalOrderMarkers` and match as whole words
against the reference and the customer code, so a family named Samples is safe.

## Notes in the wrong place

A delivery instruction in the **delivery record** is in the right place and is
not flagged. One typed onto the order as a **DN note line** is flagged, so the
team can move it.

The checker works from a list of notes to stay quiet about, not a list of words
to look for, so an unusual note is never missed. Quiet by default: `Year:` and
`Name:` tags, booklist pack lines, the paid note, the hold markers, the
multi-student note, and anything in `config.expectedNotes`. When a new standard
note starts appearing, add it to `expectedNotes` and it goes quiet.

## Marking an order clean by hand

Open an order in hold, check or backorder and press **Mark clean** to wave its
flags through. It moves to Clean under "Marked clean by hand", is included when
you copy the clean order numbers, and still shows the flags it had. **Undo**
puts it back. Hold orders ask for confirmation first.

The override covers only the flags showing when you pressed it. If a later
export or the delivery fee setting adds a new flag, the order drops back into
its bucket. Overrides live in the browser tab and are gone on reload.

## Deploying

GitHub Pages serves the site. `.github/workflows/pages.yml` runs on every push
to `main`: it runs the tests, builds, and publishes `dist/`. A failing test
stops the deployment. Pages needs the repository to be public, which is what
`LICENSE` is there for.

Vite builds with `base: '/bts-order-checking/'` so assets resolve under the
project page URL. Rename the repository and that has to change to match.

**There is no login on GitHub Pages.** Anyone with the URL can open the tool.
The exports themselves are safe either way, because both CSVs are read in the
browser and nothing is uploaded, but the tool and its rules are visible to
anyone who finds the address.

`staticwebapp.config.json` is kept for the Azure Static Web Apps deployment,
which locks the whole site behind Entra ID. Use that instead if the tool should
be reachable only by staff: build command `npm run build`, output location
`dist`, no API location.

## Not built yet

- **Carrier rules.** Pending.
- **Checked state.** The tool has no memory between runs, so an order flagged at
  9am reappears identically at 1pm and 5pm. Persisting a "checked by / actioned
  at" record against Order No + BO Suffix is the first backend job.

## Licence

Proprietary — © 2026 Jaybel Office Choice. All rights reserved.

This repository is public for one reason: GitHub Pages needs it to be, in order
to serve the tool to the team. That is **not** an open-source release.

- Jaybel staff and authorised users may use, copy and modify it internally.
- Everyone else may look at it. Copying, redistributing, modifying, reusing the
  rules or the export parsing, or building a product on it is not permitted.

Full terms in [LICENSE](LICENSE). The libraries the site is built with are
third-party open source under their own licences and are unaffected — see
[NOTICE.md](NOTICE.md).

> Because the repo is public, the source is world-readable by design. Never
> commit a real Pronto export — `.gitignore` blocks `*.csv`, `*.pdf`, `*.xlsx`
> and `*.zip` as a safety net, with the sample fixtures the one exception — but
> the safest habit is to keep real exports outside this folder. The fixtures
> under `src/test/fixtures/` hold invented names, addresses and phone numbers.
