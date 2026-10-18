# Bug report: Battleship

How the game was debugged, what went wrong, and how each problem was fixed.

## How it was tested

- **Automated tests** (`npm test`, Node's built-in `node:test`, 21 tests) on the DOM-free logic in `js/game.js`:
  ship placement (500 seeded random boards), attacks, turn order and victory detection.
- **Manual and scripted browser testing** in Chrome at desktop size and at a 390x844 phone viewport: full games
  to a player win and to a computer win, rapid and out-of-turn clicks, repeated clicks, New Game mid-turn,
  console errors, horizontal overflow.

## Bugs found and fixed

| # | Bug | Cause | Fix |
|---|-----|-------|-----|
| 1 | `npm test` crashed with `Cannot find module '.../tests'` before running any tests. | The script was `node --test tests/`. Newer Node versions (v22+) treat a bare directory argument as a module path, not a folder to search for tests. | Changed the script to `node --test tests/*.test.js`, which works on Node 18 through 24. |
| 2 | The highlight for your most recent shot looked exactly like the hover highlight on the enemy grid, so it was unclear which cell you had just fired at. | Both used the same accent-coloured inset outline. | `.cell--last` now uses a white outline; hover keeps the gold one. |

## Edge cases designed for and verified

The design was meant to prevent these bugs, and each one was checked in the browser:

- **Stale computer move after New Game.** The computer replies after a 650 ms delay. Pressing New Game in that
  window could have let the old game's shot land on the new board. `newGame()` cancels the pending timer, and
  the callback also checks that the game it was scheduled for is still the current one. Verified: after firing
  and pressing New Game immediately, the new boards had 0 shots.
- **Double or out-of-turn attacks.** `playerAttack()` rejects moves unless `game.turn === 'player'`, and the
  enemy grid's buttons are disabled during the computer's turn. Verified by clicking twice quickly.
- **Repeated attacks.** `receiveAttack()` rejects cells that were already shot and changes nothing. Shot cells
  are also disabled buttons. A rejected attack does not use up your turn.
- **Actions after game over.** Both attack functions return `{ valid: false, reason: 'game-over' }`, and every
  enemy cell is disabled. Verified by force-enabling a cell after a win and clicking it: no state change.
- **Invalid ship placement.** Ships are placed by choosing at random from every valid
  `(row, col, orientation)`, so overlaps and ships off the edge can't happen. A test checks 500 random boards.
