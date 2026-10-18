# devin-battleship

A complete, single-player Battleship game you play against the computer in the browser.
Built with vanilla HTML, CSS, and JavaScript: no backend, no build step, no external APIs or keys.

## How to play

1. Open the game (see [Running locally](#running-locally)).
2. **Your Fleet** (left, or bottom on phones) shows your ships. **Enemy Waters** hides the computer's ships.
3. Each side has five randomly placed ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
4. On your turn, click any untouched cell in **Enemy Waters** to fire.
   - Red cell: hit. Dot: miss. Dark red with an X: that ship is sunk.
   - Your most recent shot (and the computer's) is outlined in white.
5. The computer then fires one shot at your fleet. It hunts at random and, after a hit, targets the
   neighbouring cells until the ship is sunk.
6. The status bar shows whose turn it is and the result of the last shots. The ship lists under each board
   cross out sunk ships.
7. Sink all five enemy ships to win. If the computer sinks yours first, it wins and the remaining enemy ships
   are revealed.
8. **New Game** (or **Play Again** after a game ends) resets both boards with fresh random fleets at any time.

Cells you've already fired at and the whole enemy board while it's the computer's turn or after the game ends
are disabled, so repeated or out-of-turn attacks are impossible.

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # or: npm start
# then visit http://localhost:8000
```

### GitHub Pages

`index.html` is in the repository root and all asset paths are relative, so enabling GitHub Pages on the
default branch (root folder) serves the game as-is.

## Running the tests

Tests use Node's built-in test runner (Node 18+); there are no dependencies to install.

```bash
npm test
# or: node --test tests/*.test.js
```

They cover:

- **Ship placement**: correct fleet, every ship straight and in bounds, no overlaps (500 seeded random boards),
  both orientations used, `canPlaceShip` edge cases.
- **Attacks**: miss, hit, sunk, repeated attacks rejected without side effects, out-of-bounds rejected.
- **Turns**: player first, strict alternation, no double moves, repeated shots don't consume a turn, the
  computer makes exactly one valid, never-repeated shot per turn, AI follows up on hits.
- **Victory detection**: win only when every ship is sunk, player and computer wins, no moves after game over,
  new games start fresh.

## Project structure

```
index.html          Page markup (GitHub Pages entry point)
css/styles.css      Styling and responsive layout
js/game.js          DOM-free game logic (boards, placement, attacks, turns, computer AI)
js/ui.js            Rendering and event handling
tests/game.test.js  Automated tests for js/game.js
package.json        `npm test` / `npm start` scripts (no dependencies)
```
