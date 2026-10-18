/*
 * Battleship game logic. DOM-free so it can run in the browser (as the
 * global `Battleship`) and in Node (via require) for automated tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Battleship = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOARD_SIZE = 10;

  const FLEET = Object.freeze([
    Object.freeze({ name: 'Carrier', length: 5 }),
    Object.freeze({ name: 'Battleship', length: 4 }),
    Object.freeze({ name: 'Cruiser', length: 3 }),
    Object.freeze({ name: 'Submarine', length: 3 }),
    Object.freeze({ name: 'Destroyer', length: 2 }),
  ]);

  const EMPTY = -1;

  function createGrid(fill) {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(fill));
  }

  function inBounds(row, col) {
    return (
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      row >= 0 &&
      row < BOARD_SIZE &&
      col >= 0 &&
      col < BOARD_SIZE
    );
  }

  /**
   * Board shape:
   *   ships: [{ name, length, cells: [[r, c], ...], hits }]
   *   grid:  BOARD_SIZE x BOARD_SIZE, ship index or EMPTY
   *   shots: BOARD_SIZE x BOARD_SIZE, null | 'hit' | 'miss'
   */
  function createBoard() {
    return { ships: [], grid: createGrid(EMPTY), shots: createGrid(null) };
  }

  function shipCells(row, col, length, horizontal) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(horizontal ? [row, col + i] : [row + i, col]);
    }
    return cells;
  }

  function canPlaceShip(board, row, col, length, horizontal) {
    return shipCells(row, col, length, horizontal).every(
      ([r, c]) => inBounds(r, c) && board.grid[r][c] === EMPTY
    );
  }

  function placeShip(board, ship, row, col, horizontal) {
    if (!canPlaceShip(board, row, col, ship.length, horizontal)) {
      throw new Error(`Cannot place ${ship.name} at (${row}, ${col})`);
    }
    const cells = shipCells(row, col, ship.length, horizontal);
    const index = board.ships.length;
    board.ships.push({ name: ship.name, length: ship.length, cells, hits: 0 });
    cells.forEach(([r, c]) => {
      board.grid[r][c] = index;
    });
    return board.ships[index];
  }

  function randomInt(rng, max) {
    return Math.floor(rng() * max);
  }

  /** Places every ship in `fleet` at random, non-overlapping, in-bounds positions. */
  function placeFleetRandomly(board, rng = Math.random, fleet = FLEET) {
    fleet.forEach((ship) => {
      const options = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (canPlaceShip(board, r, c, ship.length, true)) options.push([r, c, true]);
          if (canPlaceShip(board, r, c, ship.length, false)) options.push([r, c, false]);
        }
      }
      if (options.length === 0) {
        throw new Error(`No room to place ${ship.name}`);
      }
      const [r, c, horizontal] = options[randomInt(rng, options.length)];
      placeShip(board, ship, r, c, horizontal);
    });
    return board;
  }

  function createRandomBoard(rng = Math.random) {
    return placeFleetRandomly(createBoard(), rng);
  }

  function isSunk(ship) {
    return ship.hits >= ship.length;
  }

  function allShipsSunk(board) {
    return board.ships.length > 0 && board.ships.every(isSunk);
  }

  /**
   * Fires at (row, col). Returns
   *   { valid: false, reason: 'out-of-bounds' | 'repeat' }  or
   *   { valid: true, row, col, result: 'miss' | 'hit' | 'sunk', ship? }
   */
  function receiveAttack(board, row, col) {
    if (!inBounds(row, col)) return { valid: false, reason: 'out-of-bounds' };
    if (board.shots[row][col] !== null) return { valid: false, reason: 'repeat' };

    const index = board.grid[row][col];
    if (index === EMPTY) {
      board.shots[row][col] = 'miss';
      return { valid: true, row, col, result: 'miss' };
    }

    board.shots[row][col] = 'hit';
    const ship = board.ships[index];
    ship.hits += 1;
    return { valid: true, row, col, result: isSunk(ship) ? 'sunk' : 'hit', ship };
  }

  function sunkShipAt(board, row, col) {
    const index = board.grid[row][col];
    return index !== EMPTY && isSunk(board.ships[index]);
  }

  /**
   * Chooses the computer's next shot on `board` using only information a
   * player would have: shot results and which ships have been sunk.
   * Target mode: extend lines of / probe around hits on ships not yet sunk.
   * Hunt mode: random untouched cell, preferring a checkerboard pattern.
   */
  function chooseComputerAttack(board, rng = Math.random) {
    const untouched = (r, c) => inBounds(r, c) && board.shots[r][c] === null;
    const openHits = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board.shots[r][c] === 'hit' && !sunkShipAt(board, r, c)) openHits.push([r, c]);
      }
    }

    if (openHits.length > 0) {
      const isOpenHit = (r, c) =>
        inBounds(r, c) && board.shots[r][c] === 'hit' && !sunkShipAt(board, r, c);
      const lineTargets = [];
      const neighborTargets = [];
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      openHits.forEach(([r, c]) => {
        dirs.forEach(([dr, dc]) => {
          if (isOpenHit(r - dr, c - dc)) {
            // Walk past consecutive hits along this line to its open end.
            let nr = r + dr;
            let nc = c + dc;
            while (isOpenHit(nr, nc)) {
              nr += dr;
              nc += dc;
            }
            if (untouched(nr, nc)) lineTargets.push([nr, nc]);
          } else if (untouched(r + dr, c + dc)) {
            neighborTargets.push([r + dr, c + dc]);
          }
        });
      });
      const targets = lineTargets.length > 0 ? lineTargets : neighborTargets;
      if (targets.length > 0) return targets[randomInt(rng, targets.length)];
    }

    const parity = [];
    const all = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!untouched(r, c)) continue;
        all.push([r, c]);
        if ((r + c) % 2 === 0) parity.push([r, c]);
      }
    }
    const pool = parity.length > 0 ? parity : all;
    if (pool.length === 0) return null;
    return pool[randomInt(rng, pool.length)];
  }

  /**
   * Game state:
   *   playerBoard   - the human's ships, attacked by the computer
   *   computerBoard - the computer's ships, attacked by the human
   *   turn          - 'player' | 'computer' | null (game over)
   *   winner        - null | 'player' | 'computer'
   */
  function createGame(rng = Math.random) {
    return {
      playerBoard: createRandomBoard(rng),
      computerBoard: createRandomBoard(rng),
      turn: 'player',
      winner: null,
      rng,
    };
  }

  function isGameOver(game) {
    return game.winner !== null;
  }

  function finishTurn(game, attacker, targetBoard) {
    if (allShipsSunk(targetBoard)) {
      game.winner = attacker;
      game.turn = null;
    } else {
      game.turn = attacker === 'player' ? 'computer' : 'player';
    }
  }

  /** Human fires at the computer's board. */
  function playerAttack(game, row, col) {
    if (isGameOver(game)) return { valid: false, reason: 'game-over' };
    if (game.turn !== 'player') return { valid: false, reason: 'not-your-turn' };
    const outcome = receiveAttack(game.computerBoard, row, col);
    if (outcome.valid) finishTurn(game, 'player', game.computerBoard);
    return outcome;
  }

  /** Computer fires one shot at the player's board. */
  function computerAttack(game) {
    if (isGameOver(game)) return { valid: false, reason: 'game-over' };
    if (game.turn !== 'computer') return { valid: false, reason: 'not-computer-turn' };
    const target = chooseComputerAttack(game.playerBoard, game.rng);
    if (!target) return { valid: false, reason: 'no-moves' };
    const outcome = receiveAttack(game.playerBoard, target[0], target[1]);
    finishTurn(game, 'computer', game.playerBoard);
    return outcome;
  }

  return {
    BOARD_SIZE,
    FLEET,
    EMPTY,
    inBounds,
    createBoard,
    canPlaceShip,
    placeShip,
    placeFleetRandomly,
    createRandomBoard,
    isSunk,
    allShipsSunk,
    receiveAttack,
    chooseComputerAttack,
    createGame,
    isGameOver,
    playerAttack,
    computerAttack,
  };
});
