/* ===========================================================================
 * Bolão Copa do Mundo — draft logic
 * Sequential snake draft of World Cup national teams across 3 rounds (C, B, A).
 * State is persisted in Firebase Realtime Database so it is shared across
 * devices. Picked teams are unique (greyed out once taken).
 * =========================================================================== */

(function () {
  "use strict";

  /* -------- EDIT HERE ------------------------------------------------------ */

  // Draft order (round C goes top→bottom; round B reverses; round A forward).
  var PLAYERS = [
    "Alexandre", "Makoto", "Talvino", "Nick", "Gabriel",
    "Ojeda", "Jota", "Ariel", "Caio", "Joel",
    "Otávio", "Fernando", "Angelo", "Arombe", "José"
  ];

  // World Cup countries shown in the grid. `code` is an ISO-2 country code
  // used to fetch the flag from flagcdn.com (England uses "gb-eng").
  // Edit this list freely to match the final field.
  // The 48 qualified nations for the 2026 FIFA World Cup (USA/Canada/Mexico).
  var TEAMS = [
    // Hosts (CONCACAF)
    { name: "Estados Unidos",        code: "us" },
    { name: "México",                code: "mx" },
    { name: "Canadá",                code: "ca" },
    // CONMEBOL
    { name: "Argentina",             code: "ar" },
    { name: "Brasil",                code: "br" },
    { name: "Uruguai",               code: "uy" },
    { name: "Colômbia",              code: "co" },
    { name: "Equador",               code: "ec" },
    { name: "Paraguai",              code: "py" },
    // UEFA
    { name: "França",                code: "fr" },
    { name: "Inglaterra",            code: "gb-eng" },
    { name: "Espanha",               code: "es" },
    { name: "Alemanha",              code: "de" },
    { name: "Portugal",              code: "pt" },
    { name: "Holanda",               code: "nl" },
    { name: "Bélgica",               code: "be" },
    { name: "Croácia",               code: "hr" },
    { name: "Suíça",                 code: "ch" },
    { name: "Áustria",               code: "at" },
    { name: "Noruega",               code: "no" },
    { name: "Suécia",                code: "se" },
    { name: "Escócia",               code: "gb-sct" },
    { name: "Tchéquia",              code: "cz" },
    { name: "Turquia",               code: "tr" },
    { name: "Bósnia e Herzegovina",  code: "ba" },
    // CAF
    { name: "Marrocos",              code: "ma" },
    { name: "Senegal",               code: "sn" },
    { name: "Tunísia",               code: "tn" },
    { name: "Argélia",               code: "dz" },
    { name: "Egito",                 code: "eg" },
    { name: "Gana",                  code: "gh" },
    { name: "Costa do Marfim",       code: "ci" },
    { name: "África do Sul",         code: "za" },
    { name: "Cabo Verde",            code: "cv" },
    { name: "Rep. Dem. do Congo",    code: "cd" },
    // AFC
    { name: "Japão",                 code: "jp" },
    { name: "Coreia do Sul",         code: "kr" },
    { name: "Irã",                   code: "ir" },
    { name: "Austrália",             code: "au" },
    { name: "Arábia Saudita",        code: "sa" },
    { name: "Catar",                 code: "qa" },
    { name: "Uzbequistão",           code: "uz" },
    { name: "Jordânia",              code: "jo" },
    { name: "Iraque",                code: "iq" },
    // CONCACAF (além dos anfitriões)
    { name: "Panamá",                code: "pa" },
    { name: "Curaçao",               code: "cw" },
    { name: "Haiti",                 code: "ht" },
    // OFC
    { name: "Nova Zelândia",         code: "nz" }
  ];

  /* -------- DERIVED CONSTANTS --------------------------------------------- */

  var SLOTS = ["C", "B", "A"]; // round order
  var TOTAL_PICKS = PLAYERS.length * SLOTS.length;

  /* -------- DOM ------------------------------------------------------------ */

  var els = {
    banner: document.getElementById("turn-banner"),
    message: document.getElementById("message"),
    select: document.getElementById("player-select"),
    board: document.getElementById("players-board"),
    grid: document.getElementById("teams-grid"),
    reset: document.getElementById("reset-btn"),
    undo: document.getElementById("undo-btn")
  };

  // Per-page lock: once you successfully pick, you cannot pick again until you
  // refresh the page. (Resets on reload.)
  var locked = false;
  var picksRef = null;
  var teamByCode = {};
  TEAMS.forEach(function (t) { teamByCode[t.code] = t; });

  /* -------- DRAFT MATH (SNAKE) --------------------------------------------- */

  // Given how many picks have already been made, who picks next and in which slot.
  function turnAt(index) {
    if (index >= TOTAL_PICKS) return null; // draft complete
    var n = PLAYERS.length;
    var round = Math.floor(index / n);
    var pos = index % n;
    var player = (round % 2 === 0) ? PLAYERS[pos] : PLAYERS[n - 1 - pos];
    return { player: player, slot: SLOTS[round], index: index };
  }

  function countPicks(picks) {
    return picks ? Object.keys(picks).length : 0;
  }

  /* -------- UI HELPERS ----------------------------------------------------- */

  function flagUrl(code, big) {
    return "https://flagcdn.com/" + (big ? "w40" : "w20") + "/" + code + ".png";
  }

  function showMessage(text, kind) {
    els.message.textContent = text || "";
    els.message.className = "message" + (kind ? " " + kind : "");
  }

  function buildPlayerSelect() {
    var opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— selecione seu nome —";
    els.select.appendChild(opt);
    PLAYERS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      els.select.appendChild(o);
    });
  }

  /* -------- RENDER --------------------------------------------------------- */

  function render(picks) {
    var index = countPicks(picks);
    var turn = turnAt(index);

    // pickedByPlayerSlot[player][slot] = team object
    var byPlayerSlot = {};
    PLAYERS.forEach(function (p) { byPlayerSlot[p] = {}; });
    if (picks) {
      Object.keys(picks).forEach(function (code) {
        var pk = picks[code];
        var team = teamByCode[code] || { name: code, code: code };
        if (byPlayerSlot[pk.player]) byPlayerSlot[pk.player][pk.slot] = team;
      });
    }

    renderBanner(turn);
    renderBoard(byPlayerSlot, turn);
    renderGrid(picks, turn);

    // Auto-suggest the current player in the dropdown if nothing chosen yet.
    if (turn && !els.select.value && !locked) {
      els.select.value = turn.player;
    }
  }

  function renderBanner(turn) {
    if (!turn) {
      els.banner.innerHTML = "✅ Draft completo!";
      els.banner.className = "turn-banner done";
      return;
    }
    els.banner.innerHTML =
      "Vez de <b>" + turn.player + "</b> &middot; escolhendo o <b>Time " +
      turn.slot + "</b> <span class='count'>(escolha " + (turn.index + 1) +
      " de " + TOTAL_PICKS + ")</span>";
    els.banner.className = "turn-banner active slot-bg-" + turn.slot;
  }

  function renderBoard(byPlayerSlot, turn) {
    var html = "<thead><tr><th>Jogador</th>" +
      SLOTS.map(function (s) {
        return "<th class='slot-col slot-" + s + "'>Time " + s + "</th>";
      }).join("") + "</tr></thead><tbody>";

    PLAYERS.forEach(function (p) {
      var isCurrent = turn && turn.player === p;
      html += "<tr class='" + (isCurrent ? "current-player" : "") + "'>";
      html += "<td class='player-name'>" + p + "</td>";
      SLOTS.forEach(function (s) {
        var t = (byPlayerSlot[p] || {})[s];
        var here = isCurrent && turn.slot === s;
        if (t) {
          html += "<td class='cell filled'><img class='flag' alt='' src='" +
            flagUrl(t.code) + "'>" + t.name + "</td>";
        } else if (here) {
          html += "<td class='cell awaiting'>…</td>";
        } else {
          html += "<td class='cell'></td>";
        }
      });
      html += "</tr>";
    });
    html += "</tbody>";
    els.board.innerHTML = html;
  }

  function renderGrid(picks, turn) {
    els.grid.innerHTML = "";
    TEAMS.forEach(function (t) {
      var pk = picks && picks[t.code];
      var card = document.createElement("div");
      card.className = "team-card " + (pk ? "taken" : "available");

      var img = document.createElement("img");
      img.className = "flag-lg";
      img.alt = "";
      img.src = flagUrl(t.code, true);
      card.appendChild(img);

      var name = document.createElement("span");
      name.className = "team-name";
      name.textContent = t.name;
      card.appendChild(name);

      if (pk) {
        var badge = document.createElement("span");
        badge.className = "owner-badge slot-" + pk.slot;
        badge.textContent = pk.player + " · " + pk.slot;
        card.appendChild(badge);
      } else {
        card.addEventListener("click", function () { attemptPick(t); });
      }
      els.grid.appendChild(card);
    });
  }

  /* -------- PICK (atomic transaction) -------------------------------------- */

  function attemptPick(team) {
    if (locked) {
      showMessage("Você já escolheu. Atualize a página (F5) para a próxima vez.", "error");
      return;
    }
    var me = els.select.value;
    if (!me) {
      showMessage("Primeiro selecione quem você é no menu acima.", "error");
      return;
    }

    showMessage("Registrando escolha…");

    picksRef.transaction(function (picks) {
      picks = picks || {};
      var index = Object.keys(picks).length;
      var turn = turnAt(index);
      if (!turn) return; // draft complete -> abort (no change)
      if (turn.player !== me) return; // not your turn -> abort
      if (picks[team.code]) return;  // already taken -> abort
      picks[team.code] = { player: me, slot: turn.slot, order: index };
      return picks;
    }, function (error, committed, snapshot) {
      if (error) {
        showMessage("Erro ao salvar: " + error.message, "error");
        return;
      }
      if (!committed) {
        // Figure out why it was rejected for a helpful message.
        var picks = (snapshot && snapshot.val()) || {};
        var index = Object.keys(picks).length;
        var turn = turnAt(index);
        if (!turn) {
          showMessage("O draft já terminou.", "error");
        } else if (picks[team.code]) {
          showMessage(team.name + " já foi escolhido por " +
            picks[team.code].player + ".", "error");
        } else {
          showMessage("Não é a sua vez. Agora é a vez de " + turn.player +
            " (Time " + turn.slot + ").", "error");
        }
        return;
      }
      // Success: lock this page until refresh.
      locked = true;
      els.select.disabled = true;
      showMessage("✅ Você escolheu " + team.name +
        "! Atualize a página (F5) para passar a vez.", "success");
    });
  }

  /* -------- UNDO LAST PICK ------------------------------------------------- */

  function undoLast() {
    if (!confirm("Desfazer a última escolha feita? Volta uma jogada para todos.")) return;
    picksRef.transaction(function (picks) {
      if (!picks) return; // nothing to undo
      var lastCode = null, lastOrder = -1;
      Object.keys(picks).forEach(function (code) {
        var o = picks[code].order;
        if (o > lastOrder) { lastOrder = o; lastCode = code; }
      });
      if (lastCode === null) return;
      delete picks[lastCode];
      return picks;
    }, function (error, committed, snapshot) {
      if (error) { showMessage("Erro ao desfazer: " + error.message, "error"); return; }
      var picks = (snapshot && snapshot.val()) || {};
      if (!committed && Object.keys(picks).length === 0) {
        showMessage("Não há escolhas para desfazer.", "error");
        return;
      }
      // Allow this page to pick again after an undo.
      locked = false;
      els.select.disabled = false;
      showMessage("Última escolha desfeita.", "success");
    });
  }

  /* -------- RESET ---------------------------------------------------------- */

  function resetDraft() {
    if (!confirm("Apagar TODAS as escolhas e reiniciar o draft? Isso afeta todos.")) return;
    picksRef.remove(function (err) {
      if (err) { showMessage("Erro ao resetar: " + err.message, "error"); return; }
      locked = false;
      els.select.disabled = false;
      els.select.value = "";
      showMessage("Draft reiniciado.", "success");
    });
  }

  /* -------- INIT ----------------------------------------------------------- */

  function fail(msg) {
    els.banner.textContent = "⚠️ " + msg;
    els.banner.className = "turn-banner error";
  }

  function init() {
    buildPlayerSelect();
    renderBoard({}, turnAt(0)); // show empty board immediately

    var cfg = window.BOLAO_FIREBASE_CONFIG;
    if (!cfg || /PASTE_/.test(cfg.apiKey) || /PASTE_/.test(cfg.databaseURL || "")) {
      fail("Firebase não configurado. Edite assets/js/bolao-config.js (veja as instruções no arquivo).");
      return;
    }
    if (typeof firebase === "undefined") {
      fail("Falha ao carregar o Firebase. Verifique sua conexão.");
      return;
    }

    try {
      firebase.initializeApp(cfg);
    } catch (e) {
      fail("Configuração do Firebase inválida: " + e.message);
      return;
    }

    picksRef = firebase.database().ref("bolao/picks");
    picksRef.on("value", function (snap) {
      render(snap.val());
    }, function (err) {
      fail("Sem acesso ao banco: " + err.message + " (verifique as regras do Realtime Database).");
    });

    els.reset.addEventListener("click", resetDraft);
    els.undo.addEventListener("click", undoLast);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
