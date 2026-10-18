const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/game.js');

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allCells() {
  const cells = [];
  for (let r = 0; r < B.BOARD_SIZE; r++) for (let c = 0; c < B.BOARD_SIZE; c++) cells.push([r, c]);
  return cells;
}

function shipCellsOf(board) {
  return board.ships.flatMap((s) => s.cells);
}

function waterCellsOf(board) {
  return allCells().filter(([r, c]) => board.grid[r][c] === B.EMPTY);
}

/** Board with a single known layout for targeted assertions. */
function fixedBoard() {
  const board = B.createBoard();
  B.placeShip(board, B.FLEET[0], 0, 0, true); // Carrier A1-E1
  B.placeShip(board, B.FLEET[1], 2, 0, false); // Battleship A3-A6
  B.placeShip(board, B.FLEET[2], 9, 7, true); // Cruiser H10-J10
  B.placeShip(board, B.FLEET[3], 5, 5, false); // Submarine F6-F8
  B.placeShip(board, B.FLEET[4], 3, 8, true); // Destroyer I4-J4
  return board;
}

test.describe('ship placement', () => {
  test('fleet is 5 ships of lengths 5, 4, 3, 3, 2', () => {
    assert.deepEqual(
      B.FLEET.map((s) => s.length),
      [5, 4, 3, 3, 2]
    );
  });

  test('random boards always contain the full fleet, in bounds, without overlap', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const board = B.createRandomBoard(seeded(seed));
      assert.equal(board.ships.length, 5);
      assert.deepEqual(
        board.ships.map((s) => s.length),
        [5, 4, 3, 3, 2]
      );

      const seen = new Set();
      board.ships.forEach((ship, index) => {
        assert.equal(ship.cells.length, ship.length);
        const rows = new Set(ship.cells.map(([r]) => r));
        const cols = new Set(ship.cells.map(([, c]) => c));
        assert.ok(rows.size === 1 || cols.size === 1, 'ship must be straight');
        ship.cells.forEach(([r, c]) => {
          assert.ok(B.inBounds(r, c), `cell (${r},${c}) out of bounds`);
          const key = `${r},${c}`;
          assert.ok(!seen.has(key), `overlap at ${key}`);
          seen.add(key);
          assert.equal(board.grid[r][c], index);
        });
      });
      assert.equal(seen.size, 17);
      const occupied = allCells().filter(([r, c]) => board.grid[r][c] !== B.EMPTY).length;
      assert.equal(occupied, 17);
    }
  });

  test('placement is random (different seeds produce different layouts)', () => {
    const layouts = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      layouts.add(JSON.stringify(B.createRandomBoard(seeded(seed)).grid));
    }
    assert.ok(layouts.size > 15);
  });

  test('both orientations are used', () => {
    let horizontal = 0;
    let vertical = 0;
    for (let seed = 1; seed <= 50; seed++) {
      B.createRandomBoard(seeded(seed)).ships.forEach((s) => {
        if (s.cells[0][0] === s.cells[1][0]) horizontal++;
        else vertical++;
      });
    }
    assert.ok(horizontal > 0 && vertical > 0);
  });

  test('canPlaceShip rejects out-of-bounds and overlapping positions', () => {
    const board = B.createBoard();
    assert.equal(B.canPlaceShip(board, 0, 6, 5, true), false);
    assert.equal(B.canPlaceShip(board, 6, 0, 5, false), false);
    assert.equal(B.canPlaceShip(board, -1, 0, 2, true), false);
    assert.equal(B.canPlaceShip(board, 0, 5, 5, true), true);
    assert.equal(B.canPlaceShip(board, 5, 0, 5, false), true);

    B.placeShip(board, B.FLEET[0], 4, 2, true);
    assert.equal(B.canPlaceShip(board, 2, 4, 3, false), false);
    assert.equal(B.canPlaceShip(board, 5, 2, 3, true), true);
    assert.throws(() => B.placeShip(board, B.FLEET[1], 4, 0, true));
  });
});

test.describe('attacks', () => {
  test('miss on water', () => {
    const board = fixedBoard();
    const outcome = B.receiveAttack(board, 9, 0);
    assert.deepEqual(outcome, { valid: true, row: 9, col: 0, result: 'miss' });
    assert.equal(board.shots[9][0], 'miss');
  });

  test('hit on a ship, then sunk on its final cell', () => {
    const board = fixedBoard();
    const first = B.receiveAttack(board, 3, 8);
    assert.equal(first.result, 'hit');
    assert.equal(first.ship.name, 'Destroyer');
    assert.equal(board.shots[3][8], 'hit');
    assert.equal(B.isSunk(board.ships[4]), false);

    const second = B.receiveAttack(board, 3, 9);
    assert.equal(second.result, 'sunk');
    assert.equal(second.ship.name, 'Destroyer');
    assert.equal(B.isSunk(board.ships[4]), true);
  });

  test('repeated attacks are rejected and change nothing', () => {
    const board = fixedBoard();
    B.receiveAttack(board, 0, 0);
    B.receiveAttack(board, 9, 0);
    const hitsBefore = board.ships[0].hits;
    assert.deepEqual(B.receiveAttack(board, 0, 0), { valid: false, reason: 'repeat' });
    assert.deepEqual(B.receiveAttack(board, 9, 0), { valid: false, reason: 'repeat' });
    assert.equal(board.ships[0].hits, hitsBefore);
  });

  test('out-of-bounds attacks are rejected', () => {
    const board = fixedBoard();
    for (const [r, c] of [[-1, 0], [0, -1], [10, 0], [0, 10], [1.5, 2], [NaN, 0]]) {
      assert.deepEqual(B.receiveAttack(board, r, c), { valid: false, reason: 'out-of-bounds' });
    }
  });
});

test.describe('turns', () => {
  test('player goes first, then turns alternate', () => {
    const game = B.createGame(seeded(7));
    assert.equal(game.turn, 'player');
    const water = waterCellsOf(game.computerBoard);

    for (let i = 0; i < 5; i++) {
      const [r, c] = water[i];
      assert.equal(B.playerAttack(game, r, c).valid, true);
      assert.equal(game.turn, 'computer');
      assert.equal(B.computerAttack(game).valid, true);
      assert.equal(game.turn, 'player');
    }
  });

  test('player cannot attack twice in a row', () => {
    const game = B.createGame(seeded(3));
    const [a, b] = waterCellsOf(game.computerBoard);
    B.playerAttack(game, a[0], a[1]);
    assert.deepEqual(B.playerAttack(game, b[0], b[1]), { valid: false, reason: 'not-your-turn' });
    assert.equal(game.computerBoard.shots[b[0]][b[1]], null);
  });

  test('computer cannot attack on the player turn', () => {
    const game = B.createGame(seeded(3));
    assert.deepEqual(B.computerAttack(game), { valid: false, reason: 'not-computer-turn' });
  });

  test('a repeated player attack does not consume the turn', () => {
    const game = B.createGame(seeded(4));
    const [r, c] = waterCellsOf(game.computerBoard)[0];
    B.playerAttack(game, r, c);
    B.computerAttack(game);
    assert.equal(game.turn, 'player');
    assert.deepEqual(B.playerAttack(game, r, c), { valid: false, reason: 'repeat' });
    assert.equal(game.turn, 'player');
  });

  test('computer makes exactly one valid, never-repeated attack per turn', () => {
    const game = B.createGame(seeded(11));
    const playerTargets = allCells();
    const seen = new Set();
    let turns = 0;
    while (!B.isGameOver(game)) {
      const [r, c] = playerTargets.shift();
      B.playerAttack(game, r, c);
      if (B.isGameOver(game)) break;
      const shotsBefore = countShots(game.playerBoard);
      const outcome = B.computerAttack(game);
      assert.equal(outcome.valid, true);
      assert.ok(B.inBounds(outcome.row, outcome.col));
      const key = `${outcome.row},${outcome.col}`;
      assert.ok(!seen.has(key), `computer repeated ${key}`);
      seen.add(key);
      assert.equal(countShots(game.playerBoard), shotsBefore + 1);
      turns++;
    }
    assert.ok(turns > 0);
  });

  test('computer AI follows up on hits (adjacent shot after a hit)', () => {
    const board = fixedBoard();
    B.receiveAttack(board, 5, 5); // Submarine F6, not sunk
    for (let seed = 1; seed <= 50; seed++) {
      const [r, c] = B.chooseComputerAttack(board, seeded(seed));
      assert.equal(Math.abs(r - 5) + Math.abs(c - 5), 1);
    }
  });

  test('chooseComputerAttack returns null when no cells remain', () => {
    const board = fixedBoard();
    allCells().forEach(([r, c]) => B.receiveAttack(board, r, c));
    assert.equal(B.chooseComputerAttack(board, seeded(1)), null);
  });
});

function countShots(board) {
  return allCells().filter(([r, c]) => board.shots[r][c] !== null).length;
}

test.describe('victory detection', () => {
  test('allShipsSunk is false until every ship is sunk', () => {
    const board = fixedBoard();
    const cells = shipCellsOf(board);
    cells.forEach(([r, c], i) => {
      assert.equal(B.allShipsSunk(board), false);
      B.receiveAttack(board, r, c);
      assert.equal(B.allShipsSunk(board), i === cells.length - 1);
    });
  });

  test('allShipsSunk is false for an empty board', () => {
    assert.equal(B.allShipsSunk(B.createBoard()), false);
  });

  test('player wins by sinking every enemy ship; no actions allowed afterwards', () => {
    const game = B.createGame(seeded(21));
    const targets = shipCellsOf(game.computerBoard);
    targets.forEach(([r, c], i) => {
      assert.equal(B.playerAttack(game, r, c).valid, true);
      if (i < targets.length - 1) {
        assert.equal(game.winner, null);
        assert.equal(B.computerAttack(game).valid, true);
      }
    });
    assert.equal(game.winner, 'player');
    assert.equal(game.turn, null);
    assert.equal(B.isGameOver(game), true);

    const [r, c] = waterCellsOf(game.computerBoard)[0];
    assert.deepEqual(B.playerAttack(game, r, c), { valid: false, reason: 'game-over' });
    assert.deepEqual(B.computerAttack(game), { valid: false, reason: 'game-over' });
    assert.equal(game.computerBoard.shots[r][c], null);
  });

  test('computer wins when it sinks every player ship', () => {
    const game = B.createGame(seeded(5));
    const water = waterCellsOf(game.computerBoard);
    let i = 0;
    while (!B.isGameOver(game)) {
      const [r, c] = water[i++];
      assert.equal(B.playerAttack(game, r, c).valid, true);
      B.computerAttack(game);
    }
    assert.equal(game.winner, 'computer');
    assert.equal(B.allShipsSunk(game.playerBoard), true);
    assert.equal(B.allShipsSunk(game.computerBoard), false);
    assert.deepEqual(B.playerAttack(game, ...water[i]), { valid: false, reason: 'game-over' });
  });

  test('createGame returns a fresh, independent game (New Game reset)', () => {
    const old = B.createGame(seeded(9));
    const [r, c] = shipCellsOf(old.computerBoard)[0];
    B.playerAttack(old, r, c);
    const fresh = B.createGame(seeded(10));
    assert.equal(fresh.turn, 'player');
    assert.equal(fresh.winner, null);
    assert.equal(countShots(fresh.playerBoard), 0);
    assert.equal(countShots(fresh.computerBoard), 0);
    assert.ok(fresh.playerBoard.ships.every((s) => s.hits === 0));
    assert.ok(fresh.computerBoard.ships.every((s) => s.hits === 0));
  });
});
