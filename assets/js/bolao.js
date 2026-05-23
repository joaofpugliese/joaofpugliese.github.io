/* ===========================================================================
 * Bolão Copa do Mundo
 * ---------------------------------------------------------------------------
 *  - Snake draft of World Cup teams (3 rounds: C, B, A).
 *  - "Confronto Direto do Dia": daily side-bet, 5 pts split among the winning
 *    side; draws roll the pot over to the next day.
 *  - Players authenticate with a Pokémon code (so picks are attributed right).
 *  - Scoring is computed client-side from raw match results in Firebase; a
 *    daily routine (or the admin) writes those results.
 *  - Leaderboard + weekly "Craque/Mico da Semana" with savage PT-BR phrases.
 *
 * Firebase data model (under /bolao):
 *   picks/<teamCode>            = { player, slot, order }
 *   confrontos/<YYYY-MM-DD>     = { teamA, teamB, picks: { <player>: "A"|"B" } }
 *   results/<matchId>           = { date, teamA, teamB, scoreA, scoreB }
 *   meta/today                  = "YYYY-MM-DD"   (admin date override for tests)
 * matchId = "<date>_<codeA>_<codeB>" with the two team codes sorted.
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

  // The 48 qualified nations for the 2026 FIFA World Cup. `code` = ISO-2 (flag).
  var TEAMS = [
    { name: "Estados Unidos",        code: "us" },
    { name: "México",                code: "mx" },
    { name: "Canadá",                code: "ca" },
    { name: "Argentina",             code: "ar" },
    { name: "Brasil",                code: "br" },
    { name: "Uruguai",               code: "uy" },
    { name: "Colômbia",              code: "co" },
    { name: "Equador",               code: "ec" },
    { name: "Paraguai",              code: "py" },
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
    { name: "Japão",                 code: "jp" },
    { name: "Coreia do Sul",         code: "kr" },
    { name: "Irã",                   code: "ir" },
    { name: "Austrália",             code: "au" },
    { name: "Arábia Saudita",        code: "sa" },
    { name: "Catar",                 code: "qa" },
    { name: "Uzbequistão",           code: "uz" },
    { name: "Jordânia",              code: "jo" },
    { name: "Iraque",                code: "iq" },
    { name: "Panamá",                code: "pa" },
    { name: "Curaçao",               code: "cw" },
    { name: "Haiti",                 code: "ht" },
    { name: "Nova Zelândia",         code: "nz" }
  ];

  var SLOTS = ["C", "B", "A"];
  var SLOT_PTS = { C: -1, B: 2, A: 3 };
  var TOTAL_PICKS = PLAYERS.length * SLOTS.length;
  var CONFRONTO_BASE = 5;
  var TOURNEY_START = "2026-06-11"; // week buckets are 7-day blocks from here

  // Savage PT-BR phrases (zoeira pesada). {n} = player name.
  var WINNER_PHRASES = [
    "{n} é o rei da rodada 👑, ajoelhem-se plebeus.",
    "{n} deu show e humilhou geral essa semana.",
    "{n} tá jogando outro bolão, monstro absurdo.",
    "{n} carregou no colo, o resto que se vire.",
    "{n} é o patrão da semana, anota aí.",
    "{n} fez bonito e deixou os rivais no chão.",
    "{n} tá voando, ninguém chega perto."
  ];
  var LOSER_PHRASES = [
    "{n} foi um desastre, vergonha da família ⚰️.",
    "{n} jogou tão mal que dói de assistir.",
    "{n} é o mico da semana, devolve o troféu.",
    "{n} apanhou feio, melhor nem comentar.",
    "{n} sumiu — alguém viu o {n}? Pffff.",
    "{n} tá de lanterna, pendura a chuteira já.",
    "{n} fez feio demais, mereceu a zoeira."
  ];

  /* -------- LOOKUPS / GLOBALS --------------------------------------------- */

  var teamByCode = {};
  TEAMS.forEach(function (t) { teamByCode[t.code] = t; });

  var CODE_TO_PLAYER = {};   // lowercase code -> player name
  (function () {
    var src = window.BOLAO_PLAYER_CODES || {};
    Object.keys(src).forEach(function (k) { CODE_TO_PLAYER[k.toLowerCase()] = src[k]; });
  })();
  var ADMIN_CODE = (window.BOLAO_ADMIN_CODE || "").toLowerCase();

  var db = null;
  var lastState = {};                 // last snapshot of /bolao
  var currentUser = null;             // { name } or { admin: true }

  var els = {};

  /* -------- DATE HELPERS --------------------------------------------------- */

  function realToday() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }
  function todayStr(state) {
    return (state && state.meta && state.meta.today) || realToday();
  }
  function parseDate(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { return new Date(parseDate(s) + n * 86400000).toISOString().slice(0, 10); }
  function weekIndex(s) { return Math.floor((parseDate(s) - parseDate(TOURNEY_START)) / 86400000 / 7); }
  function fmtBR(s) { var p = s.split("-"); return p[2] + "/" + p[1]; }
  function weekLabel(wk) { return "Semana " + (wk + 1) + " (" + fmtBR(addDays(TOURNEY_START, wk * 7)) + " – " + fmtBR(addDays(TOURNEY_START, wk * 7 + 6)) + ")"; }

  function matchId(date, a, b) { return date + "_" + [a, b].sort().join("_"); }

  function flagUrl(code, big) {
    return "https://flagcdn.com/" + (big ? "w40" : "w20") + "/" + code + ".png";
  }
  function fmtPts(n) {
    var r = Math.round(n * 10) / 10;
    return (r % 1 === 0) ? String(r) : r.toFixed(1);
  }
  function hashStr(s) { var h = 0, i; for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function pickPhrase(arr, seed, name) { return arr[hashStr(seed) % arr.length].replace(/\{n\}/g, "<b>" + name + "</b>"); }
  function showMessage(text, kind) { els.message.textContent = text || ""; els.message.className = "message" + (kind ? " " + kind : ""); }

  /* -------- DRAFT MATH (SNAKE) -------------------------------------------- */

  function turnAt(index) {
    if (index >= TOTAL_PICKS) return null;
    var n = PLAYERS.length, round = Math.floor(index / n), pos = index % n;
    var player = (round % 2 === 0) ? PLAYERS[pos] : PLAYERS[n - 1 - pos];
    return { player: player, slot: SLOTS[round], index: index };
  }

  /* -------- SCORING ENGINE ------------------------------------------------- */

  function computeStandings(state) {
    var picks = state.picks || {};
    var results = state.results || {};
    var confrontos = state.confrontos || {};

    var draftByTeam = picks; // teamCode -> { player, slot, order }

    var points = {}, weekPts = {}, weekActive = {};
    PLAYERS.forEach(function (p) { points[p] = 0; });

    function ensureWeek(wk) {
      if (!weekPts[wk]) { weekPts[wk] = {}; weekActive[wk] = {}; }
    }
    function markActive(player, wk) { ensureWeek(wk); weekActive[wk][player] = true; if (weekPts[wk][player] == null) weekPts[wk][player] = 0; }
    function addPts(player, pts, dateStr) {
      points[player] += pts;
      var wk = weekIndex(dateStr); ensureWeek(wk); markActive(player, wk);
      weekPts[wk][player] += pts;
    }

    // 1) Draft points — per match win, any stage.
    Object.keys(results).forEach(function (id) {
      var r = results[id];
      if (!r || r.scoreA == null || r.scoreB == null) return;
      var wk = weekIndex(r.date);
      [r.teamA, r.teamB].forEach(function (code) {
        if (draftByTeam[code]) markActive(draftByTeam[code].player, wk);
      });
      var winner = r.scoreA > r.scoreB ? r.teamA : (r.scoreB > r.scoreA ? r.teamB : null);
      if (winner && draftByTeam[winner]) {
        addPts(draftByTeam[winner].player, SLOT_PTS[draftByTeam[winner].slot], r.date);
      }
    });

    // 2) Confronto points — 5 pts split among winning side; draws roll over.
    var potByDate = {};
    var carry = 0;
    Object.keys(confrontos).sort().forEach(function (date) {
      var c = confrontos[date];
      if (!c || !c.teamA || !c.teamB) return;
      var incoming = CONFRONTO_BASE + carry;
      potByDate[date] = incoming;
      var pk = c.picks || {};
      var wk = weekIndex(date);
      Object.keys(pk).forEach(function (p) { markActive(p, wk); });

      var r = results[matchId(date, c.teamA, c.teamB)];
      if (!r || r.scoreA == null || r.scoreB == null) return; // not played yet

      var winnerCode = r.scoreA > r.scoreB ? r.teamA : (r.scoreB > r.scoreA ? r.teamB : null);
      if (winnerCode == null) { carry = incoming; return; }            // draw -> rollover
      var side = (winnerCode === c.teamA) ? "A" : "B";
      var winners = Object.keys(pk).filter(function (p) { return pk[p] === side; });
      if (winners.length === 0) { carry = incoming; return; }          // nobody on winning side -> rollover
      var share = incoming / winners.length;
      winners.forEach(function (p) { addPts(p, share, date); });
      carry = 0;
    });

    return { points: points, weekPts: weekPts, weekActive: weekActive, potByDate: potByDate, draftByTeam: draftByTeam };
  }

  /* -------- RENDER: everything -------------------------------------------- */

  function renderAll(state) {
    lastState = state || {};
    var standings = computeStandings(lastState);
    renderLogin();
    renderConfronto(lastState, standings);
    renderDraft(lastState);
    renderLeaderboard(standings);
    renderWeekly(lastState, standings);
    renderAdmin();
  }

  /* ---- login bar ---- */
  function renderLogin() {
    var logged = !!currentUser;
    els.codeInput.hidden = logged;
    els.loginBtn.hidden = logged;
    els.logoutBtn.hidden = !logged;
    if (!logged) { els.whoami.textContent = ""; return; }
    els.whoami.innerHTML = currentUser.admin
      ? "🔧 <b>Admin</b>"
      : "Você é: <b>" + currentUser.name + "</b>";
  }

  /* ---- confronto do dia ---- */
  function renderConfronto(state, standings) {
    var today = todayStr(state);
    els.confrontoDate.textContent = "— " + fmtBR(today);
    var c = (state.confrontos || {})[today];
    var body = els.confrontoBody;
    body.innerHTML = "";

    if (!c || !c.teamA || !c.teamB) {
      body.innerHTML = "<p class='muted'>Nenhum confronto definido para hoje." +
        (currentUser && currentUser.admin ? " Defina no painel do admin abaixo." : "") + "</p>";
      return;
    }

    var tA = teamByCode[c.teamA] || { name: c.teamA, code: c.teamA };
    var tB = teamByCode[c.teamB] || { name: c.teamB, code: c.teamB };
    var pk = c.picks || {};
    var pickList = function (side) { return Object.keys(pk).filter(function (p) { return pk[p] === side; }); };
    var aPickers = pickList("A"), bPickers = pickList("B");
    var pot = standings.potByDate[today] || CONFRONTO_BASE;

    var r = (state.results || {})[matchId(today, c.teamA, c.teamB)];
    var resolved = r && r.scoreA != null && r.scoreB != null;
    var myPick = currentUser && !currentUser.admin ? pk[currentUser.name] : null;

    // pot line
    var potLine = document.createElement("p");
    potLine.className = "pot-line";
    potLine.innerHTML = "Vale <b>" + pot + " pontos</b>, divididos entre quem acertar." +
      (pot > CONFRONTO_BASE ? " <span class='accum'>(pote acumulado!)</span>" : "");
    body.appendChild(potLine);

    var row = document.createElement("div");
    row.className = "confronto-row";

    [["A", tA, aPickers], ["B", tB, bPickers]].forEach(function (entry, idx) {
      var side = entry[0], team = entry[1], pickers = entry[2];
      var card = document.createElement("div");
      card.className = "side-card";
      if (myPick === side) card.className += " mine";
      if (resolved) {
        var win = (r.scoreA > r.scoreB ? "A" : (r.scoreB > r.scoreA ? "B" : null));
        if (win === side) card.className += " winner";
        else if (win) card.className += " loser";
      }
      card.innerHTML =
        "<img class='flag-lg' src='" + flagUrl(team.code, true) + "' alt=''>" +
        "<div class='side-name'>" + team.name + "</div>" +
        "<div class='side-count'>" + pickers.length + " palpite(s)</div>" +
        (pickers.length ? "<div class='side-pickers'>" + pickers.join(", ") + "</div>" : "");
      if (!resolved && currentUser && !currentUser.admin && !myPick) {
        card.classList.add("clickable");
        card.addEventListener("click", function () { attemptConfrontoPick(side); });
      }
      row.appendChild(card);
      if (idx === 0) {
        var vs = document.createElement("div");
        vs.className = "vs"; vs.textContent = "×";
        row.appendChild(vs);
      }
    });
    body.appendChild(row);

    var status = document.createElement("p");
    status.className = "confronto-status";
    if (resolved) {
      var win = (r.scoreA > r.scoreB ? tA.name : (r.scoreB > r.scoreA ? tB.name : null));
      status.innerHTML = "Placar: <b>" + tA.name + " " + r.scoreA + " × " + r.scoreB + " " + tB.name + "</b>. " +
        (win ? "Venceu <b>" + win + "</b>." : "Deu <b>empate</b> — pote rola pro próximo dia.");
    } else if (myPick) {
      status.innerHTML = "Seu palpite: <b>" + (myPick === "A" ? tA.name : tB.name) + "</b>. Aguardando o resultado.";
    } else if (!currentUser) {
      status.textContent = "Entre com seu código para palpitar.";
    } else if (currentUser.admin) {
      status.textContent = "Admin não palpita. 🙂";
    } else {
      status.textContent = "Clique no lado que você acha que vence.";
    }
    body.appendChild(status);
  }

  function attemptConfrontoPick(side) {
    if (!currentUser || currentUser.admin) { showMessage("Entre com seu código de jogador primeiro.", "error"); return; }
    var today = todayStr(lastState);
    var c = (lastState.confrontos || {})[today];
    if (!c) { showMessage("Não há confronto hoje.", "error"); return; }
    var ref = db.ref("bolao/confrontos/" + today + "/picks/" + currentUser.name);
    ref.transaction(function (cur) {
      if (cur != null) return; // already picked -> abort
      return side;
    }, function (err, committed) {
      if (err) { showMessage("Erro: " + err.message, "error"); return; }
      if (!committed) { showMessage("Você já palpitou hoje.", "error"); return; }
      showMessage("Palpite registrado! ✅", "success");
    });
  }

  /* ---- draft (banner / board / grid) ---- */
  function renderDraft(state) {
    var picks = state.picks || {};
    var index = Object.keys(picks).length;
    var turn = turnAt(index);

    var byPlayerSlot = {};
    PLAYERS.forEach(function (p) { byPlayerSlot[p] = {}; });
    Object.keys(picks).forEach(function (code) {
      var pk = picks[code], team = teamByCode[code] || { name: code, code: code };
      if (byPlayerSlot[pk.player]) byPlayerSlot[pk.player][pk.slot] = team;
    });

    renderBanner(turn);
    renderBoard(byPlayerSlot, turn);
    renderGrid(picks, turn);
  }

  function renderBanner(turn) {
    if (!turn) { els.banner.innerHTML = "✅ Draft completo!"; els.banner.className = "turn-banner done"; return; }
    var mine = currentUser && !currentUser.admin && currentUser.name === turn.player;
    els.banner.innerHTML =
      "Vez de <b>" + turn.player + "</b> &middot; Time <b>" + turn.slot + "</b> " +
      "<span class='count'>(escolha " + (turn.index + 1) + " de " + TOTAL_PICKS + ")</span>" +
      (mine ? " <span class='your-turn'>— é a SUA vez!</span>" : "");
    els.banner.className = "turn-banner active slot-bg-" + turn.slot;
  }

  function renderBoard(byPlayerSlot, turn) {
    var html = "<thead><tr><th>Jogador</th>" +
      SLOTS.map(function (s) { return "<th class='slot-col slot-" + s + "'>Time " + s + "</th>"; }).join("") +
      "</tr></thead><tbody>";
    PLAYERS.forEach(function (p) {
      var isCurrent = turn && turn.player === p;
      html += "<tr class='" + (isCurrent ? "current-player" : "") + "'><td class='player-name'>" + p + "</td>";
      SLOTS.forEach(function (s) {
        var t = (byPlayerSlot[p] || {})[s];
        var here = isCurrent && turn.slot === s;
        if (t) html += "<td class='cell filled'><img class='flag' alt='' src='" + flagUrl(t.code) + "'>" + t.name + "</td>";
        else if (here) html += "<td class='cell awaiting'>…</td>";
        else html += "<td class='cell'></td>";
      });
      html += "</tr>";
    });
    els.board.innerHTML = html + "</tbody>";
  }

  function renderGrid(picks, turn) {
    els.grid.innerHTML = "";
    TEAMS.forEach(function (t) {
      var pk = picks && picks[t.code];
      var card = document.createElement("div");
      card.className = "team-card " + (pk ? "taken" : "available");
      card.innerHTML =
        "<img class='flag-lg' alt='' src='" + flagUrl(t.code, true) + "'>" +
        "<span class='team-name'>" + t.name + "</span>" +
        (pk ? "<span class='owner-badge slot-" + pk.slot + "'>" + pk.player + " · " + pk.slot + "</span>" : "");
      if (!pk) card.addEventListener("click", function () { attemptPick(t); });
      els.grid.appendChild(card);
    });
  }

  function attemptPick(team) {
    if (!currentUser || currentUser.admin) { showMessage("Entre com seu código de jogador primeiro.", "error"); return; }
    var me = currentUser.name;
    db.ref("bolao/picks").transaction(function (picks) {
      picks = picks || {};
      var index = Object.keys(picks).length;
      var turn = turnAt(index);
      if (!turn) return;
      if (turn.player !== me) return;
      if (picks[team.code]) return;
      picks[team.code] = { player: me, slot: turn.slot, order: index };
      return picks;
    }, function (error, committed, snapshot) {
      if (error) { showMessage("Erro ao salvar: " + error.message, "error"); return; }
      if (!committed) {
        var picks = (snapshot && snapshot.val()) || {};
        var turn = turnAt(Object.keys(picks).length);
        if (!turn) showMessage("O draft já terminou.", "error");
        else if (picks[team.code]) showMessage(team.name + " já foi escolhido por " + picks[team.code].player + ".", "error");
        else showMessage("Não é a sua vez. Agora é a vez de " + turn.player + " (Time " + turn.slot + ").", "error");
        return;
      }
      showMessage("✅ Você escolheu " + team.name + "!", "success");
    });
  }

  /* ---- leaderboard ---- */
  function renderLeaderboard(standings) {
    var rows = PLAYERS.map(function (p) { return { name: p, pts: standings.points[p] || 0 }; });
    rows.sort(function (a, b) { return b.pts - a.pts || a.name.localeCompare(b.name); });
    var medals = ["🥇", "🥈", "🥉"];
    var html = "<thead><tr><th>#</th><th>Jogador</th><th>Pontos</th></tr></thead><tbody>";
    rows.forEach(function (r, i) {
      html += "<tr><td class='pos'>" + (medals[i] || (i + 1)) + "</td>" +
        "<td class='player-name'>" + r.name + "</td>" +
        "<td class='pts " + (r.pts < 0 ? "neg" : "") + "'>" + fmtPts(r.pts) + "</td></tr>";
    });
    els.leaderboard.innerHTML = html + "</tbody>";
  }

  /* ---- craque / mico da semana ---- */
  function renderWeekly(state, standings) {
    var today = todayStr(state);
    var curWk = Math.max(0, weekIndex(today));
    var html = "";
    for (var wk = curWk; wk >= 0; wk--) {
      var active = Object.keys(standings.weekActive[wk] || {});
      if (active.length === 0) continue;
      var scored = active.map(function (p) { return { name: p, pts: standings.weekPts[wk][p] || 0 }; });
      scored.sort(function (a, b) { return b.pts - a.pts; });
      var top = scored[0], bottom = scored[scored.length - 1];
      var inProgress = (wk === curWk);
      html += "<div class='week-card'><div class='week-title'>" + weekLabel(wk) +
        (inProgress ? " <span class='live'>em andamento</span>" : "") + "</div>";
      html += "<div class='award craque'>🔥 Craque: " + pickPhrase(WINNER_PHRASES, wk + "|" + top.name + "|w", top.name) +
        " <span class='wk-pts'>(" + fmtPts(top.pts) + " pts)</span></div>";
      if (scored.length > 1 && bottom.name !== top.name) {
        html += "<div class='award mico'>💩 Mico: " + pickPhrase(LOSER_PHRASES, wk + "|" + bottom.name + "|l", bottom.name) +
          " <span class='wk-pts'>(" + fmtPts(bottom.pts) + " pts)</span></div>";
      }
      html += "</div>";
    }
    els.weeklyBody.innerHTML = html || "<p class='muted'>Sem jogos ainda — o Craque e o Mico aparecem quando a bola rolar.</p>";
  }

  /* ---- admin ---- */
  function renderAdmin() {
    els.adminPanel.hidden = !(currentUser && currentUser.admin);
  }

  function fillTeamSelect(sel) {
    sel.innerHTML = "";
    TEAMS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (t) {
      var o = document.createElement("option"); o.value = t.code; o.textContent = t.name; sel.appendChild(o);
    });
  }

  /* -------- LOGIN / LOGOUT ------------------------------------------------- */

  function doLogin() {
    var code = (els.codeInput.value || "").trim().toLowerCase();
    if (!code) { showMessage("Digite seu código.", "error"); return; }
    if (code === ADMIN_CODE && ADMIN_CODE) { currentUser = { admin: true }; }
    else if (CODE_TO_PLAYER[code]) { currentUser = { name: CODE_TO_PLAYER[code] }; }
    else { showMessage("Código inválido. 🤔", "error"); return; }
    try { sessionStorage.setItem("bolaoCode", code); } catch (e) {}
    showMessage("");
    renderAll(lastState);
  }
  function doLogout() {
    currentUser = null;
    try { sessionStorage.removeItem("bolaoCode"); } catch (e) {}
    els.codeInput.value = "";
    renderAll(lastState);
  }
  function autoLogin() {
    var code;
    try { code = sessionStorage.getItem("bolaoCode"); } catch (e) {}
    if (!code) return;
    if (code === ADMIN_CODE && ADMIN_CODE) currentUser = { admin: true };
    else if (CODE_TO_PLAYER[code]) currentUser = { name: CODE_TO_PLAYER[code] };
  }

  /* -------- ADMIN ACTIONS -------------------------------------------------- */

  function adminSaveConfronto() {
    var date = els.admConfDate.value, a = els.admConfA.value, b = els.admConfB.value;
    if (!date) { showMessage("Escolha a data.", "error"); return; }
    if (a === b) { showMessage("Escolha dois times diferentes.", "error"); return; }
    db.ref("bolao/confrontos/" + date).update({ teamA: a, teamB: b }, function (err) {
      showMessage(err ? "Erro: " + err.message : "Confronto de " + fmtBR(date) + " definido. ✅", err ? "error" : "success");
    });
  }
  function adminSaveResult() {
    var date = els.admResDate.value, a = els.admResA.value, b = els.admResB.value;
    var sa = parseInt(els.admResSa.value, 10), sb = parseInt(els.admResSb.value, 10);
    if (!date) { showMessage("Escolha a data.", "error"); return; }
    if (a === b) { showMessage("Times diferentes, por favor.", "error"); return; }
    if (isNaN(sa) || isNaN(sb)) { showMessage("Placar inválido.", "error"); return; }
    db.ref("bolao/results/" + matchId(date, a, b)).set(
      { date: date, teamA: a, teamB: b, scoreA: sa, scoreB: sb },
      function (err) { showMessage(err ? "Erro: " + err.message : "Placar salvo. ✅", err ? "error" : "success"); });
  }
  function adminSetToday() {
    if (!els.admToday.value) { showMessage("Escolha uma data.", "error"); return; }
    db.ref("bolao/meta/today").set(els.admToday.value, function () { showMessage("Data simulada definida.", "success"); });
  }
  function adminClearToday() {
    db.ref("bolao/meta/today").remove(function () { showMessage("Voltou ao tempo real.", "success"); });
  }
  function undoLast() {
    if (!confirm("Desfazer a última escolha do draft?")) return;
    db.ref("bolao/picks").transaction(function (picks) {
      if (!picks) return;
      var lastCode = null, lastOrder = -1;
      Object.keys(picks).forEach(function (c) { if (picks[c].order > lastOrder) { lastOrder = picks[c].order; lastCode = c; } });
      if (lastCode === null) return;
      delete picks[lastCode];
      return picks;
    }, function (err, committed) {
      showMessage(err ? "Erro: " + err.message : (committed ? "Última escolha desfeita." : "Nada para desfazer."), err ? "error" : "success");
    });
  }
  function resetDraft() {
    if (!confirm("Apagar TODAS as escolhas do draft? Isso afeta todos.")) return;
    db.ref("bolao/picks").remove(function (err) { showMessage(err ? "Erro: " + err.message : "Draft reiniciado.", err ? "error" : "success"); });
  }

  /* -------- INIT ----------------------------------------------------------- */

  function grabEls() {
    els = {
      message: document.getElementById("message"),
      codeInput: document.getElementById("code-input"),
      loginBtn: document.getElementById("login-btn"),
      logoutBtn: document.getElementById("logout-btn"),
      whoami: document.getElementById("who-am-i"),
      confrontoDate: document.getElementById("confronto-date"),
      confrontoBody: document.getElementById("confronto-body"),
      banner: document.getElementById("turn-banner"),
      board: document.getElementById("players-board"),
      grid: document.getElementById("teams-grid"),
      leaderboard: document.getElementById("leaderboard"),
      weeklyBody: document.getElementById("weekly-body"),
      adminPanel: document.getElementById("admin-panel"),
      admConfDate: document.getElementById("adm-conf-date"),
      admConfA: document.getElementById("adm-conf-a"),
      admConfB: document.getElementById("adm-conf-b"),
      admConfSave: document.getElementById("adm-conf-save"),
      admResDate: document.getElementById("adm-res-date"),
      admResA: document.getElementById("adm-res-a"),
      admResB: document.getElementById("adm-res-b"),
      admResSa: document.getElementById("adm-res-sa"),
      admResSb: document.getElementById("adm-res-sb"),
      admResSave: document.getElementById("adm-res-save"),
      admToday: document.getElementById("adm-today"),
      admTodaySave: document.getElementById("adm-today-save"),
      admTodayClear: document.getElementById("adm-today-clear"),
      undo: document.getElementById("undo-btn"),
      reset: document.getElementById("reset-btn")
    };
  }

  function fail(msg) { els.banner.textContent = "⚠️ " + msg; els.banner.className = "turn-banner error"; }

  function init() {
    grabEls();
    [els.admConfA, els.admConfB, els.admResA, els.admResB].forEach(fillTeamSelect);

    // wire events
    els.loginBtn.addEventListener("click", doLogin);
    els.codeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    els.logoutBtn.addEventListener("click", doLogout);
    els.admConfSave.addEventListener("click", adminSaveConfronto);
    els.admResSave.addEventListener("click", adminSaveResult);
    els.admTodaySave.addEventListener("click", adminSetToday);
    els.admTodayClear.addEventListener("click", adminClearToday);
    els.undo.addEventListener("click", undoLast);
    els.reset.addEventListener("click", resetDraft);

    autoLogin();

    var cfg = window.BOLAO_FIREBASE_CONFIG;
    if (!cfg || /PASTE_/.test(cfg.apiKey) || /PASTE_/.test(cfg.databaseURL || "")) {
      fail("Firebase não configurado. Edite assets/js/bolao-config.js.");
      renderAll({});
      return;
    }
    if (typeof firebase === "undefined") { fail("Falha ao carregar o Firebase."); return; }
    try { firebase.initializeApp(cfg); } catch (e) { fail("Config do Firebase inválida: " + e.message); return; }

    db = firebase.database();
    db.ref("bolao").on("value", function (snap) { renderAll(snap.val() || {}); },
      function (err) { fail("Sem acesso ao banco: " + err.message); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
