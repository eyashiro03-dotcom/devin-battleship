# Bug Report: Battleship Audit

This report covers a full test pass of the game after it was first built:
ship placement, attacks, turn management, computer AI, win/loss, reset,
keyboard/screen-reader use, mobile layout, and console errors.

It lists only issues that were reproduced. Possible problems that were not
reproduced are listed separately under [Potential risks](#potential-risks-not-confirmed).
Bugs found and fixed while the game was first built are in [BUGS.md](BUGS.md).

**Test environment:** Node v24.22.0, Chrome 137 (driven with Playwright over CDP),
axe-core 4.10.0, html-validate 11.17.0, game served with `python3 -m http.server`.

## Summary

| # | Bug | Severity | Area | Status |
|---|-----|----------|------|--------|
| 1 | Invalid ARIA grid structure (axe: 202 critical violations) | High (accessibility) | `index.html`, `js/ui.js` | Fixed |
| 2 | Keyboard focus is lost to `<body>` after every shot | Medium (accessibility) | `js/ui.js`, `css/styles.css` | Fixed |
| 3 | Sunk ship names fail WCAG AA color contrast (4.43:1) | Low (accessibility) | `css/styles.css` | Fixed |
| 4 | Sunk state of ships is not in the fleet list text | Low (accessibility) | `js/ui.js` | Fixed |
| 5 | Every page load logs a 404 console error (`/favicon.ico`) | Low (polish) | `index.html` | Fixed |

No bugs were found in the game logic (placement, attacks, turns, AI,
win/loss, reset). See [Game logic results](#game-logic-results).

---

## Bug 1: Invalid ARIA grid structure

**Description.** Both boards had `role="grid"` and every cell had
`role="gridcell"`, but there were no `role="row"` elements between them, which
the ARIA spec requires. Because of this, screen readers may not read the boards
as tables. Also, `role="gridcell"` replaced the native `button` role on the 100
enemy cells, so they were not announced as clickable buttons.

**Steps to reproduce (before fix).**
1. Open `index.html` in Chrome.
2. Run axe-core (for example, the axe DevTools extension) on the page.
3. Result: 2 × `aria-required-children` (critical, on `#player-board` and
   `#enemy-board`) and 200 × `aria-required-parent` (critical, one per cell).
   The computed role of an enemy cell was `gridcell`, not `button`.

**Root cause.** `index.html` declared `role="grid"` on the board containers and
`buildBoard()` in `js/ui.js` set `role="gridcell"` on each cell. The CSS grid
lays out cells as direct children of the board, with no row wrappers, so the
ARIA grid → row → gridcell structure was never complete.

**Fix.** The game does not use the ARIA grid pattern (it has no arrow-key
navigation), so the grid roles were removed instead of adding row wrappers:
- Board containers are now `role="group"` with their existing `aria-label`.
- Enemy cells are plain `<button>`s, so they keep the native button role and
  their `aria-label` (for example, "D4: miss").
- Player cells (non-interactive `<div>`s) use `role="img"` with their
  `aria-label`, so the label is exposed.

**Verification.** After the fix, axe-core reports **0 violations** on the
initial page and **0 violations** at game over. An enemy cell has no explicit
role, so it is announced as a button.

## Bug 2: Keyboard focus is lost after every shot

**Description.** When a keyboard user fired with Enter or Space, focus moved
from the cell to `<body>`. Screen readers lose their place, and the user can no
longer see which cell they were on.

**Steps to reproduce (before fix).**
1. Press Tab until an enemy cell is focused, then press Enter.
2. Check `document.activeElement`: it was `BODY` right after the shot, and still
   `BODY` after the computer replied.

**Root cause.** `paintBoard()` set `cell.disabled = true` on the cell just fired
at, and on every enemy cell during the computer's turn. When a focused button
is disabled, the browser removes focus from it and focus falls back to
`<body>`.

**Fix.** Enemy cells now use `aria-disabled="true|false"` instead of the
`disabled` property. They keep focus and are still announced as unavailable.
Clicks are still checked by the game logic (`playerAttack` rejects
`not-your-turn`, `repeat` and `game-over`), and `onEnemyBoardClick` returns
early when it is not the player's turn. The CSS rules that used `:disabled`
now use `[aria-disabled="true"]`. A side effect: clicking a cell already fired
at now shows "You already fired at A1." This message existed before but could
never be shown.

**Verification.** After pressing Enter on D4, focus stays on "D4: miss", and it
is still there after the computer's reply. A click during the computer's turn,
a repeat click, and a click after game over still do not record a shot (see
browser regression results).

## Bug 3: Sunk ship names fail WCAG AA contrast

**Description.** At game over, axe-core reported `color-contrast` (serious) on
the names of sunk ships in the fleet lists: #758fa9 on #0f2845 = **4.43:1**,
below the 4.5:1 minimum for 12.8px text.

**Steps to reproduce (before fix).** Play until at least one ship is sunk, then
run axe-core. The `<span>` elements for sunk ships are flagged (6–8 nodes per
run, depending on how many ships were sunk).

**Root cause.** `.fleet-ship.is-sunk` used `color: var(--muted)` together with
`opacity: 0.7`. The muted color passes by itself, but the opacity blended it
toward the background and pushed it below the threshold.

**Fix.** Removed `opacity: 0.7`. Sunk ships are still shown as sunk by the
strikethrough, the muted color and the dark-red pips.

**Verification.** axe-core `color-contrast` reports 0 violations at game over.

## Bug 4: Sunk state is not in the fleet list text

**Description.** In the "Your ships" and "Enemy ships" lists, a sunk ship was
shown only visually (strikethrough and pip color). Its text content was just
the name (for example, "Carrier"), so screen-reader users could not tell which
ships were sunk from the list.

**Steps to reproduce (before fix).** Found by DOM/code inspection: in
`paintFleet()`, the only sunk indicators were the `is-sunk` class and the `title`
attribute. Browsers do not reliably expose `title` on a `<li>`.

**Root cause.** The sunk state was added only as CSS/visual information in
`paintFleet()`.

**Fix.** Sunk ships get a visually hidden " (sunk)" text span inside their name
(new `.visually-hidden` utility class). The visual layout does not change.

**Verification.** After a player win, the enemy fleet list text is "Carrier
(sunk), Battleship (sunk), Cruiser (sunk), Submarine (sunk), Destroyer (sunk)",
and the layout looks the same.

## Bug 5: 404 console error on every page load

**Description.** Every page load logged `Failed to load resource: the server
responded with a status of 404` in the console.

**Steps to reproduce (before fix).** Open the page with DevTools open. The
server log shows `GET /favicon.ico HTTP/1.1" 404`.

**Root cause.** The page declared no icon, so the browser requested the default
`/favicon.ico`, which does not exist.

**Fix.** Added an inline SVG data-URI `<link rel="icon">` to `index.html`. It
makes no extra request and needs no new file.

**Verification.** No console errors or page errors on load over HTTP, over
`file://`, at 320px width, or during a full game.

---

## Game logic results

These checks found **no defects**. No logic code (`js/game.js`) was changed.

| Check | Result |
|-------|--------|
| `npm test` (21 unit tests: placement, attacks, turns, AI, victory, reset) | 21/21 pass, before and after the fixes |
| 5,000 random boards: overlap, out-of-bounds, fleet lengths 5/4/3/3/2 | 0 violations. Every cell is used (min 354, max 1,125 occupancies); 12,381 horizontal / 12,619 vertical placements |
| Computer AI solo on 3,000 boards | Always finishes. Average 51.3 shots (min 24, max 69). 0 repeated or invalid shots |
| AI target mode | While an unsunk hit existed, 0 shots were away from open hits and 0 shots were "hunt" shots |
| 2,000 full games (random player vs AI): turn order, one shot per turn, no moves after game over | 0 invariant violations |
| Malformed input to `receiveAttack` (`"1"`, `null`, `NaN`, out of range) | Rejected as `out-of-bounds`, with no board change |

## Browser regression results (after fixes)

| Check | Result |
|-------|--------|
| Two 10×10 boards render (HTTP, `file://`, 320px width) | 200 cells each time |
| Horizontal overflow at 320px | None |
| Enemy ships hidden before game over | 0 cells leak ship information |
| Two clicks on different cells in the same task | Only 1 shot recorded |
| Turn indicator after a shot / after the reply | "Computer's turn" → "Your turn" |
| Click during the computer's turn | Not recorded |
| Repeat click on a cell already fired at | Not recorded, message "You already fired at A1.", still the player's turn |
| New Game pressed right after firing (pending computer timer) | 0 shots leak onto the new board |
| Full game, player wins | "You win! The enemy fleet has been sunk." |
| Full game, computer wins | "The computer wins. Your fleet has been sunk." |
| Click after game over | Not recorded |
| Play Again | Turn = player, winner = null, 0 shots, 0 marked cells, banner hidden, focus on New Game |
| Keyboard focus after firing | Stays on the cell |
| axe-core: initial page / game over | 0 / 0 violations |
| Console and page errors | None |

## Potential risks (not confirmed)

These were noticed but **not reproduced as bugs**, so they were not changed.

- **Only tested in Chromium.** Firefox and Safari (including iOS) were not tested.
- **Mobile double-tap zoom.** Cells use the default `touch-action: auto`, so
  tapping quickly on iOS Safari might trigger double-tap zoom. Not tested on a
  real device.
- **No arrow-key navigation.** All 100 enemy cells are Tab stops. This works,
  but it is slow for keyboard users. A roving-tabindex grid would be an
  improvement, not a bug fix.
- **Computer difficulty.** A player who clicks at random lost 2,000 of 2,000
  simulated games. This is how the hunt/target AI is designed (average of 51
  shots to win), not a defect. A real player is much stronger than random
  clicking.
- **Player fleet damage pips** show how many hits a ship has taken, not where it
  was hit. This is a design choice.
- **html-validate `void-style`** flags `<meta ... />` and `<link ... />`. Both
  forms are valid HTML5, so this is only a style preference.
