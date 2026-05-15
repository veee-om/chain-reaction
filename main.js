const COLS = 9;
const ROWS = 6;
const EXPLOSION_DELAY = 230;
const PLAYER_PRESETS = [
  { id: "p1", defaultName: "Red", colorName: "Crimson", color: "#ff3f66", dark: "#8d0b2a", highlight: "#ffd4de" },
  { id: "p2", defaultName: "Green", colorName: "Emerald", color: "#39f29c", dark: "#087743", highlight: "#d8ffed" },
  { id: "p3", defaultName: "Blue", colorName: "Azure", color: "#43a7ff", dark: "#075893", highlight: "#d9eeff" },
  { id: "p4", defaultName: "Yellow", colorName: "Gold", color: "#ffd447", dark: "#9b6500", highlight: "#fff2bf" }
];

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");
const setupForm = document.getElementById("setupForm");
const playerCountSelect = document.getElementById("playerCountSelect");
const playerFields = document.getElementById("playerFields");
const boardElement = document.getElementById("board");
const scoreRow = document.getElementById("scoreRow");
const turnText = document.getElementById("turnText");
const turnDot = document.getElementById("turnDot");
const restartButton = document.getElementById("restartButton");
const setupButton = document.getElementById("setupButton");
const overlayRestartButton = document.getElementById("overlayRestartButton");
const winnerOverlay = document.getElementById("winnerOverlay");
const winnerText = document.getElementById("winnerText");

let board = [];
let players = [];
let activePlayerIds = [];
let currentPlayerIndex = 0;
let isProcessing = false;
let gameOver = false;
let movesMade = 0;
let playerHasPlayed = {};

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      owner: null,
      count: 0
    }))
  );
}

function renderPlayerFields() {
  const selectedCount = Number(playerCountSelect.value);
  playerFields.innerHTML = "";

  PLAYER_PRESETS.slice(0, selectedCount).forEach((preset, index) => {
    const field = document.createElement("label");
    field.className = "player-field";
    field.style.setProperty("--player-color", preset.color);

    const inputId = `playerName${index + 1}`;
    field.innerHTML = `
      <span class="player-swatch" aria-hidden="true"></span>
      <span class="player-field-copy">
        <span>${preset.colorName}</span>
        <input id="${inputId}" type="text" maxlength="16" value="${preset.defaultName}" autocomplete="off">
      </span>
    `;

    playerFields.appendChild(field);
  });
}

function readPlayersFromSetup() {
  const selectedCount = Number(playerCountSelect.value);

  return PLAYER_PRESETS.slice(0, selectedCount).map((preset, index) => {
    const input = document.getElementById(`playerName${index + 1}`);
    const name = input.value.trim() || preset.defaultName;

    return {
      ...preset,
      name
    };
  });
}

function setupBoardMarkup() {
  boardElement.innerHTML = "";

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("aria-label", `Cell ${row + 1}, ${col + 1}`);
      cell.addEventListener("click", () => handleCellClick(row, col));
      boardElement.appendChild(cell);
    }
  }
}

function startGame(nextPlayers) {
  players = nextPlayers;
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  restartGame();
}

function getCurrentPlayer() {
  return getPlayerById(activePlayerIds[currentPlayerIndex]);
}

function getPlayerById(playerId) {
  return players.find(player => player.id === playerId);
}

function getCellElement(row, col) {
  return boardElement.children[row * COLS + col];
}

function getNeighbors(row, col) {
  const possibleNeighbors = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ];

  return possibleNeighbors.filter(([nextRow, nextCol]) =>
    nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS
  );
}

function getCriticalMass(row, col) {
  return getNeighbors(row, col).length;
}

function isLegalMove(row, col, playerId) {
  const cell = board[row][col];
  return cell.owner === null || cell.owner === playerId;
}

function addOrb(row, col, playerId) {
  const cell = board[row][col];
  cell.owner = playerId;
  cell.count += 1;
}

function getUnstableCells() {
  const unstable = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (board[row][col].count >= getCriticalMass(row, col)) {
        unstable.push([row, col]);
      }
    }
  }

  return unstable;
}

function queueUnstableCell(queue, queued, row, col) {
  const key = `${row},${col}`;
  if (!queued.has(key) && board[row][col].count >= getCriticalMass(row, col)) {
    queue.push([row, col]);
    queued.add(key);
  }
}

async function processExplosions(playerId) {
  const queue = getUnstableCells();
  const queued = new Set(queue.map(([row, col]) => `${row},${col}`));
  let guard = 0;
  const maxExplosions = ROWS * COLS * 160;

  while (queue.length > 0) {
    if (guard > maxExplosions) {
      console.warn("Explosion guard stopped an unusually long chain reaction.");
      break;
    }

    const [row, col] = queue.shift();
    queued.delete(`${row},${col}`);

    if (board[row][col].count < getCriticalMass(row, col)) {
      continue;
    }

    await explodeCell(row, col, playerId);
    renderBoard();

    for (const [neighborRow, neighborCol] of getNeighbors(row, col)) {
      queueUnstableCell(queue, queued, neighborRow, neighborCol);
    }

    guard += 1;
  }
}

async function explodeCell(row, col, playerId) {
  const cellElement = getCellElement(row, col);
  const player = getPlayerById(playerId);
  cellElement.style.setProperty("--player-color", player.color);
  cellElement.classList.add("exploding");

  board[row][col].count = 0;
  board[row][col].owner = null;

  for (const [neighborRow, neighborCol] of getNeighbors(row, col)) {
    addOrb(neighborRow, neighborCol, playerId);
  }

  await wait(EXPLOSION_DELAY);
  cellElement.classList.remove("exploding");
}

function wait(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

async function handleCellClick(row, col) {
  if (isProcessing || gameOver) {
    return;
  }

  const player = getCurrentPlayer();
  if (!isLegalMove(row, col, player.id)) {
    flashIllegalCell(row, col, player.color);
    return;
  }

  isProcessing = true;
  boardElement.classList.add("locked");
  playerHasPlayed[player.id] = true;
  movesMade += 1;

  addOrb(row, col, player.id);
  renderBoard();

  await processExplosions(player.id);
  renderBoard();

  eliminatePlayers();
  const winner = checkWinner();
  if (winner) {
    endGame(winner);
  } else {
    switchTurn(player.id);
  }

  isProcessing = false;
  boardElement.classList.remove("locked");
}

function flashIllegalCell(row, col, color) {
  const cell = getCellElement(row, col);
  cell.animate(
    [
      { transform: "translateX(0)", borderColor: "rgba(255,255,255,0.18)" },
      { transform: "translateX(-4px)", borderColor: color },
      { transform: "translateX(4px)", borderColor: color },
      { transform: "translateX(0)", borderColor: "rgba(255,255,255,0.18)" }
    ],
    { duration: 220, easing: "ease-out" }
  );
}

function switchTurn(previousPlayerId) {
  const previousIndex = activePlayerIds.indexOf(previousPlayerId);
  currentPlayerIndex = (previousIndex + 1) % activePlayerIds.length;
  renderStatus();
}

function getOrbCounts() {
  const counts = Object.fromEntries(players.map(player => [player.id, 0]));

  for (const row of board) {
    for (const cell of row) {
      if (cell.owner) {
        counts[cell.owner] += cell.count;
      }
    }
  }

  return counts;
}

function eliminatePlayers() {
  if (movesMade < players.length) {
    return;
  }

  const counts = getOrbCounts();
  activePlayerIds = activePlayerIds.filter(playerId => {
    return !playerHasPlayed[playerId] || counts[playerId] > 0;
  });
}

function checkWinner() {
  if (movesMade < players.length || activePlayerIds.length !== 1) {
    return null;
  }

  return getPlayerById(activePlayerIds[0]);
}

function endGame(winner) {
  gameOver = true;
  winnerText.textContent = `${winner.name} wins`;
  winnerText.style.color = winner.color;
  winnerOverlay.classList.remove("hidden");
}

function restartGame() {
  board = createEmptyBoard();
  activePlayerIds = players.map(player => player.id);
  currentPlayerIndex = 0;
  isProcessing = false;
  gameOver = false;
  movesMade = 0;
  playerHasPlayed = Object.fromEntries(players.map(player => [player.id, false]));

  winnerOverlay.classList.add("hidden");
  boardElement.classList.remove("locked");
  renderBoard();
  renderStatus();
}

function showSetup() {
  gameOver = true;
  isProcessing = false;
  winnerOverlay.classList.add("hidden");
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
}

function renderStatus() {
  if (players.length === 0) {
    return;
  }

  const player = getCurrentPlayer();
  const counts = getOrbCounts();

  turnText.textContent = player.name;
  turnText.style.color = player.color;
  turnDot.style.setProperty("--player-color", player.color);

  renderScoreRow(counts, player.id);
}

function renderScoreRow(counts, currentPlayerId) {
  scoreRow.innerHTML = "";

  players.forEach(player => {
    const panel = document.createElement("article");
    panel.className = "player-panel";
    panel.style.setProperty("--player-color", player.color);
    panel.classList.toggle("active", player.id === currentPlayerId);
    panel.classList.toggle("eliminated", !activePlayerIds.includes(player.id));

    const stateLabel = activePlayerIds.includes(player.id) ? formatOrbCount(counts[player.id]) : "Out";
    panel.innerHTML = `
      <span class="player-swatch" aria-hidden="true"></span>
      <div>
        <p>${player.name}</p>
        <strong>${stateLabel}</strong>
      </div>
    `;

    scoreRow.appendChild(panel);
  });
}

function formatOrbCount(count) {
  return `${count} ${count === 1 ? "orb" : "orbs"}`;
}

function renderBoard() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      const cellElement = getCellElement(row, col);
      cellElement.innerHTML = "";
      cellElement.className = "cell";

      if (cell.count > 0 && cell.owner) {
        const player = getPlayerById(cell.owner);
        cellElement.style.setProperty("--player-color", player.color);
        cellElement.style.setProperty("--player-dark", player.dark);
        cellElement.style.setProperty("--player-highlight", player.highlight);
        cellElement.appendChild(createOrbCluster(cell.owner, cell.count));
      }
    }
  }

  renderStatus();
}

function createOrbCluster(owner, count) {
  const player = getPlayerById(owner);
  const cluster = document.createElement("div");
  cluster.className = "orb-cluster";

  for (let index = 0; index < count; index += 1) {
    const orb = document.createElement("span");
    orb.className = `orb count-${Math.min(count, 3)}`;
    orb.style.setProperty("--player-color", player.color);
    orb.style.setProperty("--player-dark", player.dark);
    orb.style.setProperty("--player-highlight", player.highlight);
    cluster.appendChild(orb);
  }

  return cluster;
}

playerCountSelect.addEventListener("change", renderPlayerFields);
setupForm.addEventListener("submit", event => {
  event.preventDefault();
  startGame(readPlayersFromSetup());
});
restartButton.addEventListener("click", restartGame);
setupButton.addEventListener("click", showSetup);
overlayRestartButton.addEventListener("click", restartGame);

renderPlayerFields();
setupBoardMarkup();
