(function () {
  'use strict';

  const B = window.Battleship;
  const COLUMNS = 'ABCDEFGHIJ';
  const COMPUTER_DELAY_MS = 650;

  const els = {
    newGame: document.getElementById('new-game'),
    playAgain: document.getElementById('play-again'),
    turn: document.getElementById('turn-indicator'),
    message: document.getElementById('message'),
    banner: document.getElementById('winner-banner'),
    winnerText: document.getElementById('winner-text'),
    playerBoard: document.getElementById('player-board'),
    enemyBoard: document.getElementById('enemy-board'),
    playerFleet: document.getElementById('player-fleet'),
    enemyFleet: document.getElementById('enemy-fleet'),
  };

  let game = null;
  let computerTimer = null;
  let playerCells = [];
  let enemyCells = [];
  let lastPlayerShot = null;
  let lastComputerShot = null;

  const coord = (row, col) => `${COLUMNS[col]}${row + 1}`;

  function buildBoard(container, interactive) {
    container.textContent = '';
    const cells = [];
    container.appendChild(makeLabel(''));
    for (let c = 0; c < B.BOARD_SIZE; c++) container.appendChild(makeLabel(COLUMNS[c]));

    for (let r = 0; r < B.BOARD_SIZE; r++) {
      container.appendChild(makeLabel(String(r + 1)));
      const rowCells = [];
      for (let c = 0; c < B.BOARD_SIZE; c++) {
        const cell = document.createElement(interactive ? 'button' : 'div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute('role', 'gridcell');
        if (interactive) cell.type = 'button';
        container.appendChild(cell);
        rowCells.push(cell);
      }
      cells.push(rowCells);
    }
    return cells;
  }

  function makeLabel(text) {
    const label = document.createElement('div');
    label.className = 'label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = text;
    return label;
  }

  function describeCell(board, r, c, revealShips) {
    const shot = board.shots[r][c];
    const index = board.grid[r][c];
    const ship = index === B.EMPTY ? null : board.ships[index];
    if (shot === 'miss') return 'miss';
    if (shot === 'hit') return B.isSunk(ship) ? `sunk ${ship.name}` : 'hit';
    if (ship && revealShips) return ship.name;
    return 'water';
  }

  function paintBoard(board, cells, { revealShips, interactive, lastShot }) {
    const canFire = interactive && game.turn === 'player';
    for (let r = 0; r < B.BOARD_SIZE; r++) {
      for (let c = 0; c < B.BOARD_SIZE; c++) {
        const cell = cells[r][c];
        const shot = board.shots[r][c];
        const index = board.grid[r][c];
        const ship = index === B.EMPTY ? null : board.ships[index];
        const sunk = ship !== null && B.isSunk(ship);

        cell.classList.toggle('cell--ship', ship !== null && (revealShips || sunk));
        cell.classList.toggle('cell--hit', shot === 'hit' && !sunk);
        cell.classList.toggle('cell--sunk', shot === 'hit' && sunk);
        cell.classList.toggle('cell--miss', shot === 'miss');
        cell.classList.toggle(
          'cell--last',
          lastShot !== null && lastShot[0] === r && lastShot[1] === c
        );
        cell.setAttribute('aria-label', `${coord(r, c)}: ${describeCell(board, r, c, revealShips)}`);
        if (interactive) cell.disabled = !canFire || shot !== null;
      }
    }
  }

  function paintFleet(board, list) {
    list.textContent = '';
    board.ships.forEach((ship) => {
      const li = document.createElement('li');
      li.className = 'fleet-ship';
      if (B.isSunk(ship)) li.classList.add('is-sunk');
      const name = document.createElement('span');
      name.textContent = ship.name;
      const pips = document.createElement('span');
      pips.className = 'pips';
      pips.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < ship.length; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip';
        pips.appendChild(pip);
      }
      li.append(name, pips);
      li.title = B.isSunk(ship) ? `${ship.name} (sunk)` : `${ship.name} (${ship.length})`;
      list.appendChild(li);
    });
  }

  function paintPlayerFleetDamage() {
    // The player can see damage to their own ships.
    const items = els.playerFleet.querySelectorAll('.fleet-ship');
    game.playerBoard.ships.forEach((ship, i) => {
      items[i].querySelectorAll('.pip').forEach((pip, p) => {
        pip.classList.toggle('is-hit', p < ship.hits);
      });
    });
  }

  function render() {
    const over = B.isGameOver(game);
    paintBoard(game.playerBoard, playerCells, {
      revealShips: true,
      interactive: false,
      lastShot: lastComputerShot,
    });
    paintBoard(game.computerBoard, enemyCells, {
      revealShips: over,
      interactive: true,
      lastShot: lastPlayerShot,
    });
    paintFleet(game.playerBoard, els.playerFleet);
    paintPlayerFleetDamage();
    paintFleet(game.computerBoard, els.enemyFleet);

    els.enemyBoard.classList.toggle('is-active', game.turn === 'player');

    if (over) {
      const playerWon = game.winner === 'player';
      els.turn.dataset.turn = 'over';
      els.turn.textContent = 'Game over';
      els.winnerText.textContent = playerWon
        ? 'You win! The enemy fleet has been sunk.'
        : 'The computer wins. Your fleet has been sunk.';
      els.banner.classList.toggle('is-loss', !playerWon);
      els.banner.hidden = false;
    } else {
      els.banner.hidden = true;
      els.turn.dataset.turn = game.turn;
      els.turn.textContent = game.turn === 'player' ? 'Your turn' : "Computer's turn";
    }
  }

  function describeOutcome(who, outcome) {
    const where = coord(outcome.row, outcome.col);
    if (who === 'player') {
      if (outcome.result === 'miss') return `You fired at ${where}: miss.`;
      if (outcome.result === 'hit') return `You fired at ${where}: hit!`;
      return `You fired at ${where} and sank the enemy ${outcome.ship.name}!`;
    }
    if (outcome.result === 'miss') return `Computer fired at ${where}: miss.`;
    if (outcome.result === 'hit') return `Computer fired at ${where}: hit!`;
    return `Computer fired at ${where} and sank your ${outcome.ship.name}!`;
  }

  function onEnemyBoardClick(event) {
    const cell = event.target.closest('button.cell');
    if (!cell || !game) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const outcome = B.playerAttack(game, row, col);
    if (!outcome.valid) {
      if (outcome.reason === 'repeat') els.message.textContent = `You already fired at ${coord(row, col)}.`;
      return;
    }
    lastPlayerShot = [row, col];
    els.message.textContent = describeOutcome('player', outcome);
    render();
    if (game.turn === 'computer') scheduleComputerTurn();
  }

  function scheduleComputerTurn() {
    const current = game;
    computerTimer = setTimeout(() => {
      computerTimer = null;
      if (current !== game) return;
      const outcome = B.computerAttack(game);
      if (!outcome.valid) return;
      lastComputerShot = [outcome.row, outcome.col];
      els.message.textContent = `${els.message.textContent} ${describeOutcome('computer', outcome)}`;
      render();
    }, COMPUTER_DELAY_MS);
  }

  function newGame() {
    if (computerTimer !== null) {
      clearTimeout(computerTimer);
      computerTimer = null;
    }
    game = B.createGame();
    lastPlayerShot = null;
    lastComputerShot = null;
    playerCells = buildBoard(els.playerBoard, false);
    enemyCells = buildBoard(els.enemyBoard, true);
    els.message.textContent = 'New game! Click a cell on the enemy grid to fire.';
    render();
  }

  els.enemyBoard.addEventListener('click', onEnemyBoardClick);
  els.newGame.addEventListener('click', newGame);
  els.playAgain.addEventListener('click', () => {
    newGame();
    els.newGame.focus();
  });

  newGame();
})();
