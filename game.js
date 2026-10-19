(() => {
  const SIZE = 10;
  const FLEET = [5, 4, 3, 3, 2]; // tailles des bateaux
  const LLAMA_TAUNTS = ["Tiens, une bouclette de plus !", "Ma laine vaut mieux que ta flotte !", "Crache pas trop loin, Wooly !"];
  const SHEEP_TAUNTS = ["Bêêêest ta flotte est foutue !", "On va t'tondre, capitaine !", "Mouton noir de ton destin !"];

  const $ = id => document.getElementById(id);
  const setup = $("setup"), battle = $("battle"), gameover = $("gameover");
  const statusEl = $("status"), shipsLeftEl = $("ships-left");
  const llamaMsg = $("llama-msg"), sheepMsg = $("sheep-msg");

  let playerGrid, enemyGrid, playerShips, enemyShips;
  let horizontal = true, placingIdx = 0, battleOn = false, busy = false;

  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const canPlace = (grid, r, c, len, horiz) => {
    for (let i = 0; i < len; i++) {
      const rr = r + (horiz ? 0 : i), cc = c + (horiz ? i : 0);
      if (!inBounds(rr, cc) || grid[rr][cc]) return false;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = rr + dr, nc = cc + dc;
          if (inBounds(nr, nc) && grid[nr][nc]) return false;
        }
    }
    return true;
  };
  const place = (grid, r, c, len, horiz) => {
    const cells = [];
    for (let i = 0; i < len; i++)
      cells.push([r + (horiz ? 0 : i), c + (horiz ? i : 0)]);
    cells.forEach(([rr, cc]) => grid[rr][cc] = 1);
    return cells;
  };

  const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

  function randomFleet(grid) {
    grid.forEach(row => row.fill(0));
    const ships = [];
    for (const len of FLEET) {
      let placed = false;
      while (!placed) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * (horiz ? SIZE : SIZE - len + 1));
        const c = Math.floor(Math.random() * (horiz ? SIZE - len + 1 : SIZE));
        if (canPlace(grid, r, c, len, horiz)) {
          ships.push({ cells: place(grid, r, c, len, horiz), hits: 0 });
          placed = true;
        }
      }
    }
    return ships;
  }

  function makeBoard(el, onClick, showShips) {
    el.innerHTML = "";
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const d = document.createElement("div");
        d.className = "cell";
        d.dataset.r = r; d.dataset.c = c;
        if (onClick) d.addEventListener("click", () => onClick(r, c, d));
        el.appendChild(d);
      }
    el.dataset.show = showShips ? "true" : "false";
  }

  const cellAt = (el, r, c) => el.children[r * SIZE + c];

  function paint(el, grid, shots, ships) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const d = cellAt(el, r, c);
        const s = shots[r][c];
        d.className = "cell" + (s ? (s === "hit" ? " hit" : " miss") : "");
        if (el.dataset.show === "true" && grid[r][c]) d.classList.add("ship");
        if (s === "hit" && ships && isSunkAt(ships, r, c)) d.classList.add("sunk");
        d.textContent = s === "hit" ? "💥" : s === "miss" ? "💦" : "";
      }
  }

  const isSunkAt = (ships, r, c) =>
    ships.some(s => s.hits >= s.cells.length && s.cells.some(([rr, cc]) => rr === r && cc === c));

  // ---- Phase de placement ----
  function renderSetup() {
    const board = $("player-board");
    makeBoard(board, (r, c, d) => {
      if (battleOn || placingIdx >= FLEET.length) return;
      if (canPlace(playerGrid, r, c, FLEET[placingIdx], horizontal)) {
        playerShips.push({ cells: place(playerGrid, r, c, FLEET[placingIdx], horizontal), hits: 0 });
        placingIdx++;
        updateSetup(board);
      }
    });
    updateSetup(board);
    board.addEventListener("mouseover", e => {
      if (battleOn || placingIdx >= FLEET.length) return;
      const t = e.target.closest(".cell");
      if (!t) return;
      updateSetup(board, +t.dataset.r, +t.dataset.c);
    });
    board.addEventListener("mouseleave", () => updateSetup(board));
  }

  function updateSetup(board, hoverR = -1, hoverC = -1) {
    const len = FLEET[placingIdx] ?? 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const d = cellAt(board, r, c);
        d.className = "cell" + (playerGrid[r][c] ? " ship" : "");
        d.textContent = "";
      }
    if (len && hoverR >= 0 && canPlace(playerGrid, hoverR, hoverC, len, horizontal)) {
      for (let i = 0; i < len; i++)
        cellAt(board, hoverR + (horizontal ? 0 : i), hoverC + (horizontal ? i : 0)).classList.add("ship");
    }
    shipsLeftEl.textContent = FLEET.slice(placingIdx).join(", ") || "✅ prête !";
    $("start-btn").disabled = placingIdx < FLEET.length;
  }

  // ---- Phase de bataille ----
  function playerShoot(r, c) {
    if (!battleOn || busy || playerShots[r][c]) return;
    busy = true;
    const hit = enemyGrid[r][c] === 1;
    if (hit) {
      const ship = enemyShips.find(s => s.cells.some(([rr, cc]) => rr === r && cc === c));
      ship.hits++;
    }
    playerShots[r][c] = hit ? "hit" : "miss";
    paint($("enemy-board"), enemyGrid, playerShots, enemyShips);
    taunt(hit, llamaMsg, LLAMA_TAUNTS);
    statusEl.textContent = hit ? "💥 Touché ! Bien joué, capitaine Léo !" : "💦 Raté… dans l'eau !";

    if (checkEnd()) return;
    if (hit) { busy = false; return; } // rejouer après un touché

    setTimeout(() => { enemyTurn(); }, 600);
  }

  function enemyTurn() {
    let r, c;
    do {
      r = Math.floor(Math.random() * SIZE);
      c = Math.floor(Math.random() * SIZE);
    } while (enemyShots[r][c]);
    const hit = playerGrid[r][c] === 1;
    enemyShots[r][c] = hit ? "hit" : "miss";
    if (hit) {
      const ship = playerShips.find(s => s.cells.some(([rr, cc]) => rr === r && cc === c));
      ship.hits++;
    }
    paint($("player-view"), playerGrid, enemyShots, playerShips);
    if (hit) {
      taunt(true, sheepMsg, SHEEP_TAUNTS);
      statusEl.textContent = "🔴 Aïe ! Wooly a touché votre flotte !";
      document.querySelector(".captain-llama").classList.add("shake");
      setTimeout(() => document.querySelector(".captain-llama").classList.remove("shake"), 400);
      if (checkEnd()) return;
      setTimeout(enemyTurn, 600);
    } else {
      statusEl.textContent = "💦 Wooly a raté ! À vous, capitaine Léo !";
      busy = false;
    }
  }

  const taunt = (onHit, el, list) => {
    if (onHit && Math.random() < 0.4) el.textContent = list[Math.floor(Math.random() * list.length)];
  };

  function checkEnd() {
    const llamaFleetGone = playerShips.every(s => s.hits >= s.cells.length);
    const sheepFleetGone = enemyShips.every(s => s.hits >= s.cells.length);
    if (!llamaFleetGone && !sheepFleetGone) return false;
    const playerWon = sheepFleetGone;
    battleOn = false;
    busy = false;
    battle.classList.add("hidden");
    gameover.classList.remove("hidden");
    $("result").textContent = playerWon ? "🏆 Victoire du Lama !" : "🏳️ Victoire du Mouton !";
    $("result-msg").textContent = playerWon
      ? "Léo le Lama danse la gigue sur le pont. Bêêêest triste pour Wooly…"
      : "Wooly bêle de joie. Léo crache de dépit.";
  }

  // ---- Init / events ----
  function startGame() {
    playerGrid = emptyGrid(); enemyGrid = emptyGrid();
    playerShots = emptyGrid(); enemyShots = emptyGrid();
    playerShips = []; enemyShips = randomFleet(enemyGrid);
    placingIdx = 0; battleOn = false; busy = false;
    setup.classList.remove("hidden");
    battle.classList.add("hidden");
    gameover.classList.add("hidden");
    statusEl.textContent = "Placez vos bateaux puis coulez la flotte mouton !";
    renderSetup();
  }

  function beginBattle() {
    setup.classList.add("hidden");
    battle.classList.remove("hidden");
    makeBoard($("player-view"), null, true);
    makeBoard($("enemy-board"), playerShoot, false);
    paint($("player-view"), playerGrid, enemyShots, playerShips);
    paint($("enemy-board"), enemyGrid, playerShots, enemyShips);
    battleOn = true;
    statusEl.textContent = "⚔️ La bataille commence ! Visez la flotte mouton !";
  }

  $("rotate-btn").addEventListener("click", () => { horizontal = !horizontal; });
  $("random-btn").addEventListener("click", () => {
    playerShips = randomFleet(playerGrid);
    placingIdx = FLEET.length;
    updateSetup($("player-board"));
  });
  $("start-btn").addEventListener("click", beginBattle);
  $("restart-btn").addEventListener("click", startGame);

  startGame();
})();
