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
  var SLOT_PTS = { C: 4, B: 2, A: 3 };
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
    "{n} é o lixo da semana, devolve o troféu.",
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
  var selectedDate = null;            // currently-viewed confronto date (ribbon)

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

  // Picks for a confronto close once its day has begun: you may only palpitar
  // BEFORE the confronto date (i.e. today must be strictly earlier than it).
  function confrontoOpen(date, state) { return todayStr(state) < date; }

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

  /* -------- HIDDEN ADMIN LOG (approx IP geolocation) ---------------------- */
  var _geoPromise = null;
  function getGeo() {
    if (_geoPromise) return _geoPromise;
    _geoPromise = fetch("https://ipapi.co/json/")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        return {
          ip: d.ip || "", city: d.city || "", region: d.region || "",
          country: d.country_name || d.country || "",
          lat: (d.latitude != null ? d.latitude : null),
          lon: (d.longitude != null ? d.longitude : null)
        };
      })
      .catch(function () { return {}; });
    return _geoPromise;
  }
  function logAction(action, detail) {
    if (!db) return;
    var who = currentUser ? (currentUser.admin ? "admin" : currentUser.name) : "—";
    getGeo().then(function (g) {
      db.ref("bolao/adminlog").push({
        ts: Date.now(), player: who, action: action, detail: detail || "",
        ip: g.ip || "", city: g.city || "", region: g.region || "", country: g.country || "",
        lat: (g.lat == null ? null : g.lat), lon: (g.lon == null ? null : g.lon),
        ua: (navigator.userAgent || "").slice(0, 120)
      });
    });
  }

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

    // 2) Confronto points — pot is always 5; on draw, +3 split for weakSide pickers
    //    and +2 split for the other side. (No rollover.)
    var potByDate = {};
    Object.keys(confrontos).sort().forEach(function (date) {
      var c = confrontos[date];
      if (!c || !c.teamA || !c.teamB) return;
      potByDate[date] = CONFRONTO_BASE;
      var pk = c.picks || {};
      var wk = weekIndex(date);
      Object.keys(pk).forEach(function (p) { markActive(p, wk); });

      var r = results[matchId(date, c.teamA, c.teamB)];
      if (!r || r.scoreA == null || r.scoreB == null) return; // not played yet

      var winnerCode = r.scoreA > r.scoreB ? r.teamA : (r.scoreB > r.scoreA ? r.teamB : null);
      if (winnerCode == null) {
        // DRAW — split 3 pts among weakSide pickers, 2 pts among the other side.
        var weak = (c.weakSide === "A" || c.weakSide === "B") ? c.weakSide : null;
        var weakPts, otherPts;
        if (weak) { weakPts = 3; otherPts = 2; }
        else { weak = "A"; weakPts = 2.5; otherPts = 2.5; } // fallback if not tagged
        var other = (weak === "A") ? "B" : "A";
        var weakPickers = Object.keys(pk).filter(function (p) { return pk[p] === weak; });
        var otherPickers = Object.keys(pk).filter(function (p) { return pk[p] === other; });
        if (weakPickers.length > 0) {
          var ws = weakPts / weakPickers.length;
          weakPickers.forEach(function (p) { addPts(p, ws, date); });
        }
        if (otherPickers.length > 0) {
          var os = otherPts / otherPickers.length;
          otherPickers.forEach(function (p) { addPts(p, os, date); });
        }
        return;
      }
      // WIN — 5 / N_winners to each winning-side picker.
      var side = (winnerCode === c.teamA) ? "A" : "B";
      var winners = Object.keys(pk).filter(function (p) { return pk[p] === side; });
      if (winners.length === 0) return;
      var share = CONFRONTO_BASE / winners.length;
      winners.forEach(function (p) { addPts(p, share, date); });
    });

    return { points: points, weekPts: weekPts, weekActive: weekActive, potByDate: potByDate, draftByTeam: draftByTeam };
  }

  /* -------- RENDER: everything -------------------------------------------- */

  function renderAll(state) {
    lastState = state || {};
    var standings = computeStandings(lastState);
    renderLogin();
    ensureSelectedDate(lastState);
    renderRibbon(lastState);
    renderConfronto(lastState, standings);
    renderDraft(lastState);
    renderTrades(lastState);
    renderLeaderboard(standings);
    renderWeekly(lastState, standings);
    renderAdmin();
    renderAdminLog(lastState);
  }

  function isPlayer() { return !!(currentUser && !currentUser.admin); }
  function teamName(code) { return (teamByCode[code] || {}).name || code; }
  function buildByPlayerSlot(picks) {
    var m = {}; PLAYERS.forEach(function (p) { m[p] = {}; });
    Object.keys(picks || {}).forEach(function (c) {
      var pk = picks[c]; if (m[pk.player]) m[pk.player][pk.slot] = { code: c, name: teamName(c) };
    });
    return m;
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

  /* ---- ribbon (one chip per scheduled day) ---- */
  function ensureSelectedDate(state) {
    var dates = Object.keys(state.confrontos || {}).sort();
    if (selectedDate && dates.indexOf(selectedDate) >= 0) return;
    var today = todayStr(state);
    if (dates.indexOf(today) >= 0) { selectedDate = today; return; }
    var upcoming = null;
    for (var i = 0; i < dates.length; i++) { if (dates[i] >= today) { upcoming = dates[i]; break; } }
    selectedDate = upcoming || (dates.length ? dates[dates.length - 1] : today);
  }

  function renderRibbon(state) {
    var confs = state.confrontos || {};
    var dates = Object.keys(confs).sort();
    var today = todayStr(state);
    if (!dates.length) { els.confrontoRibbon.innerHTML = ""; return; }
    var DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    var html = "";
    dates.forEach(function (d) {
      var c = confs[d];
      var r = c && c.teamA && c.teamB ? (state.results || {})[matchId(d, c.teamA, c.teamB)] : null;
      var resolved = r && r.scoreA != null && r.scoreB != null;
      var p = d.split("-");
      var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      var cls = "ribbon-chip";
      if (d === selectedDate) cls += " sel";
      if (resolved) cls += " resolved";
      if (d === today) cls += " today";
      html += "<button class='" + cls + "' data-date='" + d + "'>" +
        "<span class='r-dow'>" + DOW[dt.getUTCDay()] + "</span>" +
        "<span class='r-day'>" + (+p[2]) + (resolved ? " ✓" : "") + "</span>" +
        "</button>";
    });
    els.confrontoRibbon.innerHTML = html;
    Array.prototype.forEach.call(els.confrontoRibbon.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { selectedDate = b.dataset.date; renderAll(lastState); });
    });
  }

  /* ---- confronto do dia ---- */
  function renderConfronto(state, standings) {
    var today = selectedDate || todayStr(state);
    var pickingOpen = confrontoOpen(today, state);
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
      var weakBadge = (c.weakSide === side) ? "<div class='underdog-tag'>🤝 underdog</div>" : "";
      card.innerHTML = weakBadge +
        "<img class='flag-lg' src='" + flagUrl(team.code, true) + "' alt=''>" +
        "<div class='side-name'>" + team.name + "</div>" +
        "<div class='side-count'>" + pickers.length + " palpite(s)</div>" +
        (pickers.length ? "<div class='side-pickers'>" + pickers.join(", ") + "</div>" : "");
      if (pickingOpen && !resolved && currentUser && !currentUser.admin && !myPick) {
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
    } else if (!pickingOpen) {
      status.innerHTML = "⛔ <b>Palpites encerrados</b> — o dia do confronto já começou.";
    } else {
      status.textContent = "Clique no lado que você acha que vence.";
    }
    body.appendChild(status);
  }

  function attemptConfrontoPick(side) {
    if (!currentUser || currentUser.admin) { showMessage("Entre com seu código de jogador primeiro.", "error"); return; }
    var today = selectedDate || todayStr(lastState);
    var c = (lastState.confrontos || {})[today];
    if (!c) { showMessage("Não há confronto nesse dia.", "error"); return; }
    if (!confrontoOpen(today, lastState)) { showMessage("Palpites encerrados: o dia do confronto já começou. 🔒", "error"); return; }
    var r = (lastState.results || {})[matchId(today, c.teamA, c.teamB)];
    if (r && r.scoreA != null && r.scoreB != null) { showMessage("Esse confronto já foi resolvido.", "error"); return; }
    var ref = db.ref("bolao/confrontos/" + today + "/picks/" + currentUser.name);
    ref.transaction(function (cur) {
      if (cur != null) return; // already picked -> abort
      return side;
    }, function (err, committed) {
      if (err) { showMessage("Erro: " + err.message, "error"); return; }
      if (!committed) { showMessage("Você já palpitou hoje.", "error"); return; }
      showMessage("Palpite registrado! ✅", "success");
      logAction("confronto", "palpitou lado " + side + " em " + today);
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
    updateUndoButton(picks);
  }

  function lastPick(picks) {
    var p = picks || {}, code = null, ord = -1;
    Object.keys(p).forEach(function (c) { if (p[c].order > ord) { ord = p[c].order; code = c; } });
    return code ? { code: code, player: p[code].player } : null;
  }

  // The "Desfazer" button is shown only to the player who made the most recent pick.
  function updateUndoButton(picks) {
    var last = lastPick(picks);
    els.undo.hidden = !(currentUser && !currentUser.admin && last && last.player === currentUser.name);
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
      logAction("draft", "escolheu " + team.name);
    });
  }

  /* ---- TRADES ---- */
  function renderTrades(state) {
    var picks = state.picks || {};
    var n = Object.keys(picks).length;
    var complete = n >= TOTAL_PICKS;
    var bps = buildByPlayerSlot(picks);
    var leftover = TEAMS.filter(function (t) { return !picks[t.code]; });
    var trades = state.trades || {};

    if (!complete) {
      els.tradeNotice.textContent = "Trocas e países sobrando liberam quando o draft terminar (faltam " + (TOTAL_PICKS - n) + " escolhas).";
    } else if (!isPlayer()) {
      els.tradeNotice.textContent = "Entre com seu código de jogador para propor trocas ou pegar países sobrando.";
    } else {
      els.tradeNotice.textContent = "";
    }
    els.proposeForm.hidden = !(complete && isPlayer());

    updateTradePreview(bps);
    renderTradeProposals(trades);
    renderPoolGrid(leftover, complete);
    renderTradeLog(trades);
  }

  function updateTradePreview(bps) {
    if (els.proposeForm.hidden) { els.tradePreview.innerHTML = ""; return; }
    var me = currentUser.name, slot = els.tradeSlot.value, target = els.tradeTarget.value;
    if (!target || target === me) { els.tradePreview.innerHTML = "<span class='muted'>Escolha outro jogador.</span>"; return; }
    var mine = (bps[me] || {})[slot], theirs = (bps[target] || {})[slot];
    if (!mine || !theirs) { els.tradePreview.innerHTML = "<span class='muted'>Sem time nesse slot para trocar.</span>"; return; }
    els.tradePreview.innerHTML = "Você oferece <b>" + mine.name + "</b> e recebe <b>" + theirs.name +
      "</b> de <b>" + target + "</b> (Time " + slot + ").";
  }

  function renderTradeProposals(trades) {
    els.tradeIncoming.innerHTML = "";
    if (!isPlayer()) return;
    var me = currentUser.name;
    Object.keys(trades).forEach(function (id) {
      var t = trades[id];
      if (!t || t.type !== "swap" || t.status !== "pending") return;
      if (t.to !== me && t.from !== me) return;
      var div = document.createElement("div");
      div.className = "proposal";
      if (t.to === me) {
        div.innerHTML = "<span><b>" + t.from + "</b> oferece <b>" + teamName(t.fromTeam) +
          "</b> pelo seu <b>" + teamName(t.toTeam) + "</b> (Time " + t.slot + ")</span>";
        var ok = document.createElement("button"); ok.className = "p-accept"; ok.textContent = "Aceitar";
        ok.addEventListener("click", function () { acceptTrade(id, t); });
        var no = document.createElement("button"); no.className = "p-decline"; no.textContent = "Recusar";
        no.addEventListener("click", function () { declineTrade(id, t); });
        div.appendChild(ok); div.appendChild(no);
      } else {
        div.innerHTML = "<span>Você propôs <b>" + teamName(t.fromTeam) + "</b> por <b>" + teamName(t.toTeam) +
          "</b> de <b>" + t.to + "</b> — aguardando.</span>";
        var cancel = document.createElement("button"); cancel.className = "p-decline"; cancel.textContent = "Cancelar";
        cancel.addEventListener("click", function () { cancelTrade(id, t); });
        div.appendChild(cancel);
      }
      els.tradeIncoming.appendChild(div);
    });
  }

  function renderPoolGrid(leftover, complete) {
    els.poolGrid.innerHTML = "";
    if (!complete) { els.poolGrid.innerHTML = "<span class='muted'>—</span>"; return; }
    leftover.forEach(function (t) {
      var card = document.createElement("div");
      card.className = "team-card";
      card.innerHTML = "<img class='flag-lg' alt='' src='" + flagUrl(t.code, true) + "'>" +
        "<span class='team-name'>" + t.name + "</span>";
      if (isPlayer()) {
        var row = document.createElement("div");
        row.className = "pool-actions";
        var b = document.createElement("button");
        b.textContent = "Pegar p/ Time A";
        b.title = "Trocar pelo seu Time A";
        b.addEventListener("click", function () { poolSwap(t.code, "A"); });
        row.appendChild(b);
        card.appendChild(row);
      }
      els.poolGrid.appendChild(card);
    });
  }

  function renderTradeLog(trades) {
    var arr = Object.keys(trades).map(function (id) { var t = trades[id]; t._id = id; return t; });
    arr.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!arr.length) { els.tradeLog.innerHTML = "<p class='muted'>Nenhuma troca ainda.</p>"; return; }
    els.tradeLog.innerHTML = arr.map(function (t) {
      if (t.type === "pool") {
        return "<div class='log-entry'>🔄 <b>" + t.player + "</b> trocou <b>" + teamName(t.outTeam) +
          "</b> por <b>" + teamName(t.inTeam) + "</b> (país sobrando) — Time " + t.slot + "</div>";
      }
      var prop = "<b>" + t.from + "</b> (" + teamName(t.fromTeam) + ") propôs troca com <b>" + t.to + "</b> (" + teamName(t.toTeam) + ")";
      var result = "";
      if (t.status === "accepted") result = "<div class='log-result ok'>✅ <b>" + t.to + "</b> (" + teamName(t.toTeam) + ") aceitou troca com <b>" + t.from + "</b> (" + teamName(t.fromTeam) + ")</div>";
      else if (t.status === "declined") result = "<div class='log-result no'>❌ <b>" + t.to + "</b> (" + teamName(t.toTeam) + ") recusou troca com <b>" + t.from + "</b> (" + teamName(t.fromTeam) + ")</div>";
      else if (t.status === "cancelled") result = "<div class='log-result no'>🚫 " + t.from + " cancelou a proposta</div>";
      else if (t.status === "failed") result = "<div class='log-result no'>⚠️ troca expirou (times mudaram)</div>";
      else result = "<div class='log-result'>⏳ aguardando " + t.to + "</div>";
      return "<div class='log-entry'>" + prop + result + "</div>";
    }).join("");
  }

  function proposeTrade() {
    if (!isPlayer()) { showMessage("Entre com seu código de jogador primeiro.", "error"); return; }
    var me = currentUser.name, slot = els.tradeSlot.value, target = els.tradeTarget.value;
    if (!target || target === me) { showMessage("Escolha outro jogador.", "error"); return; }
    var bps = buildByPlayerSlot(lastState.picks || {});
    var mine = (bps[me] || {})[slot], theirs = (bps[target] || {})[slot];
    if (!mine || !theirs) { showMessage("Sem time nesse slot para trocar.", "error"); return; }
    db.ref("bolao/trades").push({
      type: "swap", from: me, to: target, slot: slot,
      fromTeam: mine.code, toTeam: theirs.code, status: "pending", ts: Date.now()
    }, function (err) {
      showMessage(err ? "Erro: " + err.message : "Proposta enviada para " + target + ". ✅", err ? "error" : "success");
      if (!err) logAction("trade-propor", me + " → " + target + " (" + mine.name + " / " + theirs.name + ")");
    });
  }

  function acceptTrade(id, t) {
    if (!isPlayer() || currentUser.name !== t.to) { showMessage("Só " + t.to + " pode aceitar.", "error"); return; }
    db.ref("bolao/picks").transaction(function (picks) {
      if (!picks) return;
      var f = picks[t.fromTeam], g = picks[t.toTeam];
      if (!f || !g) return;
      if (f.player !== t.from || g.player !== t.to) return; // changed since proposal
      var tmp = f.player; f.player = g.player; g.player = tmp; // swap owners (same slot)
      return picks;
    }, function (err, committed) {
      if (err) { showMessage("Erro: " + err.message, "error"); return; }
      if (!committed) { db.ref("bolao/trades/" + id).update({ status: "failed", resolvedTs: Date.now() }); showMessage("Troca não pôde ser feita (os times mudaram).", "error"); return; }
      db.ref("bolao/trades/" + id).update({ status: "accepted", resolvedTs: Date.now() });
      showMessage("Troca aceita! ✅", "success");
      logAction("trade-aceitar", t.from + " ⇄ " + t.to + " (" + teamName(t.fromTeam) + " / " + teamName(t.toTeam) + ")");
    });
  }

  function declineTrade(id, t) {
    if (!isPlayer() || currentUser.name !== t.to) return;
    db.ref("bolao/trades/" + id).update({ status: "declined", resolvedTs: Date.now() });
    logAction("trade-recusar", t.to + " recusou " + t.from);
  }
  function cancelTrade(id, t) {
    if (!isPlayer() || currentUser.name !== t.from) return;
    db.ref("bolao/trades/" + id).update({ status: "cancelled", resolvedTs: Date.now() });
    logAction("trade-cancelar", t.from + " cancelou proposta p/ " + t.to);
  }

  function poolSwap(inCode, slot) {
    if (!isPlayer()) { showMessage("Entre com seu código de jogador primeiro.", "error"); return; }
    if (slot !== "A") { showMessage("Países sobrando só entram no Time A.", "error"); return; }
    var me = currentUser.name, swapped = { out: null };
    db.ref("bolao/picks").transaction(function (picks) {
      if (!picks) return;
      if (picks[inCode]) return; // already taken
      var outCode = null;
      Object.keys(picks).forEach(function (c) { if (picks[c].player === me && picks[c].slot === slot) outCode = c; });
      if (!outCode) return;
      var ord = picks[outCode].order;
      delete picks[outCode];
      picks[inCode] = { player: me, slot: slot, order: ord };
      swapped.out = outCode;
      return picks;
    }, function (err, committed) {
      if (err) { showMessage("Erro: " + err.message, "error"); return; }
      if (!committed) { showMessage("Não deu (país já foi pego ou você não tem time nesse slot).", "error"); return; }
      db.ref("bolao/trades").push({ type: "pool", player: me, slot: slot, outTeam: swapped.out, inTeam: inCode, status: "done", ts: Date.now() });
      showMessage("Você pegou " + teamName(inCode) + " para o seu Time " + slot + "! ✅", "success");
      logAction("pool", "pegou " + teamName(inCode) + " (Time " + slot + ")");
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
        html += "<div class='award lixo'>💩 Lixo: " + pickPhrase(LOSER_PHRASES, wk + "|" + bottom.name + "|l", bottom.name) +
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

  function renderAdminLog(state) {
    if (!els.adminLog) return;
    if (!(currentUser && currentUser.admin)) { els.adminLog.innerHTML = ""; return; }
    var log = state.adminlog || {};
    var arr = Object.keys(log).map(function (id) { return log[id]; });
    arr.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!arr.length) { els.adminLog.innerHTML = "<p class='muted'>Sem registros ainda.</p>"; return; }
    els.adminLog.innerHTML = arr.slice(0, 150).map(function (e) {
      var when = e.ts ? new Date(e.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
      var loc = [e.city, e.region, e.country].filter(Boolean).join(", ");
      var coord = (e.lat != null && e.lon != null)
        ? (" · <a href='https://maps.google.com/?q=" + e.lat + "," + e.lon + "' target='_blank' rel='noopener'>" + e.lat + "," + e.lon + "</a>")
        : "";
      return "<div class='logrow'><b>" + (e.player || "—") + "</b> · " + e.action +
        " <span class='muted'>" + (e.detail || "") + "</span><br>" +
        "<span class='muted small'>" + when + " · " + (loc || "local?") + " · " + (e.ip || "") + coord + "</span></div>";
    }).join("");
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
    var weakInput = document.querySelector('input[name="adm-weak"]:checked');
    var weak = weakInput ? weakInput.value : "B";
    db.ref("bolao/confrontos/" + date).update({ teamA: a, teamB: b, weakSide: weak }, function (err) {
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
  // Only the player who made the last pick can undo it (their own pick).
  function undoLast() {
    if (!currentUser || currentUser.admin) { showMessage("Só o último jogador que escolheu pode desfazer.", "error"); return; }
    if (!confirm("Desfazer a SUA última escolha do draft?")) return;
    var me = currentUser.name;
    db.ref("bolao/picks").transaction(function (picks) {
      if (!picks) return;
      var lastCode = null, lastOrder = -1;
      Object.keys(picks).forEach(function (c) { if (picks[c].order > lastOrder) { lastOrder = picks[c].order; lastCode = c; } });
      if (lastCode === null) return;
      if (picks[lastCode].player !== me) return; // last pick isn't yours -> abort
      delete picks[lastCode];
      return picks;
    }, function (err, committed) {
      if (err) { showMessage("Erro: " + err.message, "error"); return; }
      showMessage(committed ? "Sua última escolha foi desfeita." : "Você não fez a última escolha (nada a desfazer).", committed ? "success" : "error");
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
      confrontoRibbon: document.getElementById("confronto-ribbon"),
      confrontoBody: document.getElementById("confronto-body"),
      banner: document.getElementById("turn-banner"),
      board: document.getElementById("players-board"),
      grid: document.getElementById("teams-grid"),
      leaderboard: document.getElementById("leaderboard"),
      weeklyBody: document.getElementById("weekly-body"),
      tradeNotice: document.getElementById("trade-notice"),
      proposeForm: document.getElementById("propose-form"),
      tradeSlot: document.getElementById("trade-slot"),
      tradeTarget: document.getElementById("trade-target"),
      tradePreview: document.getElementById("trade-preview"),
      tradePropose: document.getElementById("trade-propose"),
      tradeIncoming: document.getElementById("trade-incoming"),
      poolGrid: document.getElementById("pool-grid"),
      tradeLog: document.getElementById("trade-log"),
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
      reset: document.getElementById("reset-btn"),
      adminLog: document.getElementById("admin-log")
    };
  }

  function fail(msg) { els.banner.textContent = "⚠️ " + msg; els.banner.className = "turn-banner error"; }

  function init() {
    grabEls();
    [els.admConfA, els.admConfB, els.admResA, els.admResB].forEach(fillTeamSelect);

    // trade target dropdown (all players; self is rejected at propose time)
    PLAYERS.forEach(function (p) { var o = document.createElement("option"); o.value = p; o.textContent = p; els.tradeTarget.appendChild(o); });

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
    els.tradePropose.addEventListener("click", proposeTrade);
    var refreshPreview = function () { updateTradePreview(buildByPlayerSlot(lastState.picks || {})); };
    els.tradeSlot.addEventListener("change", refreshPreview);
    els.tradeTarget.addEventListener("change", refreshPreview);

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
