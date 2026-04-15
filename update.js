(function () {
  'use strict';

  const DIAGONAL_NAMES = ['DIAGONAL CLUB ESP. A', 'Diagonal'];

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function isDiagonalTeamName(name) {
    const n = normalizeText(name);
    return DIAGONAL_NAMES.some(team => normalizeText(team) === n) || n.includes('diagonal');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAllMatches() {
    return safeArray(window.MATCHES);
  }

  function getAllPlayers() {
    return safeArray(window.PLAYERS);
  }

  function getPlayerMap() {
    const map = {};
    getAllPlayers().forEach(player => {
      if (player && player.id) map[player.id] = player;
    });
    return map;
  }

  function getPlayerName(playerId) {
    const map = getPlayerMap();
    const p = map[playerId];
    if (!p) return playerId || '-';
    return p.name || p.nom || p.fullName || playerId;
  }

  function parseResult(res) {
    const r = normalizeText(res);
    if (r === 'g' || r === 'w' || r === 'win' || r === 'p') return 'W';
    if (r === 'e' || r === 'd' || r === 'draw') return 'D';
    if (r === 'p' || r === 'l' || r === 'loss') return 'L';

    return null;
  }

  function getPointsFromResult(res) {
    const r = normalizeText(res);
    if (r === 'g' || r === 'w' || r === 'win') return 3;
    if (r === 'e' || r === 'd' || r === 'draw') return 1;
    if (r === 'p' || r === 'l' || r === 'loss') return 0;

    if (r === 'v') return 3;
    return 0;
  }

  function parseMatchDate(match) {
    if (!match || !match.date) return null;
    const d = new Date(match.date + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseMatchDateTime(match) {
    if (!match || !match.date) return null;

    const time = match.time && /^\d{2}:\d{2}$/.test(match.time) ? match.time : '00:00';
    const dt = new Date(match.date + 'T' + time + ':00');
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function getTimeSlot(time) {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;

    const parts = time.split(':').map(Number);
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;

    const minutes = (parts[0] * 60) + parts[1];

    if (minutes < 12 * 60) return 'mañana';
    if (minutes < 16 * 60) return 'mediodía';
    return 'tarde';
  }

  function enrichMatch(match) {
    const enriched = { ...match };
    enriched.time = match.time && /^\d{2}:\d{2}$/.test(match.time) ? match.time : null;
    enriched.timeSlot = getTimeSlot(enriched.time);
    enriched.points = getPointsFromResult(match.res);
    enriched.datetime = enriched.time ? (match.date + 'T' + enriched.time) : (match.date || null);
    return enriched;
  }

  function getEnrichedMatches() {
    return getAllMatches().map(enrichMatch);
  }

  function getDiagonalMatches() {
    return getEnrichedMatches().filter(match => {
      return isDiagonalTeamName(match.home) || isDiagonalTeamName(match.away);
    });
  }

  function sortMatchesAsc(matches) {
    return safeArray(matches).slice().sort((a, b) => {
      const da = parseMatchDateTime(a);
      const db = parseMatchDateTime(b);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      return ta - tb;
    });
  }

  function sortMatchesDesc(matches) {
    return safeArray(matches).slice().sort((a, b) => {
      const da = parseMatchDateTime(a);
      const db = parseMatchDateTime(b);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      return tb - ta;
    });
  }

  function getPlayedMatches() {
    return getDiagonalMatches().filter(match => {
      return typeof match.gf === 'number' && typeof match.gc === 'number';
    });
  }

  function getUpcomingMatches() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return getDiagonalMatches().filter(match => {
      const d = parseMatchDate(match);
      return d && d >= today && (typeof match.gf !== 'number' || typeof match.gc !== 'number');
    });
  }

  function getLastPlayedMatch() {
    const played = sortMatchesDesc(getPlayedMatches());
    return played.length ? played[0] : null;
  }

  function getNextMatch() {
    const upcoming = sortMatchesAsc(getUpcomingMatches());
    return upcoming.length ? upcoming[0] : null;
  }

  function getMatchLabel(match) {
    if (!match) return '-';
    const rival = isDiagonalTeamName(match.home) ? match.away : match.home;
    const loc = normalizeText(match.loc) === 'c' ? 'Casa' : 'Fuera';
    return `J${match.j || '-'} - ${loc} vs ${rival || '-'}`;
  }

  function getScoreLabel(match) {
    if (!match || typeof match.gf !== 'number' || typeof match.gc !== 'number') return '-';
    return `${match.gf}-${match.gc}`;
  }

  function getTimeLabel(match) {
    if (!match || !match.time) return '-';
    return match.time;
  }

  function getTimeSlotStats(matches) {
    const stats = {
      mañana: { played: 0, wins: 0, draws: 0, losses: 0, pts: 0, gf: 0, gc: 0 },
      mediodía: { played: 0, wins: 0, draws: 0, losses: 0, pts: 0, gf: 0, gc: 0 },
      tarde: { played: 0, wins: 0, draws: 0, losses: 0, pts: 0, gf: 0, gc: 0 }
    };

    safeArray(matches).forEach(match => {
      if (!match.timeSlot) return;
      if (typeof match.gf !== 'number' || typeof match.gc !== 'number') return;

      const row = stats[match.timeSlot];
      if (!row) return;

      row.played += 1;
      row.gf += match.gf;
      row.gc += match.gc;
      row.pts += getPointsFromResult(match.res);

      const r = parseResult(match.res);
      if (r === 'W') row.wins += 1;
      else if (r === 'D') row.draws += 1;
      else if (r === 'L') row.losses += 1;
    });

    return stats;
  }

  function getCriticalGoalsStats(matches) {
    const stats = {
      firstHalfLast5: { gf: 0, gc: 0 },
      secondHalfLast5: { gf: 0, gc: 0 }
    };

    safeArray(matches).forEach(match => {
      safeArray(match.goals).forEach(goal => {
        const min = Number(goal.min);
        if (Number.isNaN(min)) return;

        if (min >= 31 && min <= 35) {
          if (goal.type === 'gf') stats.firstHalfLast5.gf += 1;
          if (goal.type === 'gc') stats.firstHalfLast5.gc += 1;
        }

        if (min >= 66 && min <= 70) {
          if (goal.type === 'gf') stats.secondHalfLast5.gf += 1;
          if (goal.type === 'gc') stats.secondHalfLast5.gc += 1;
        }
      });
    });

    return stats;
  }

  function getEarlyYellowImpact(matches) {
    const stats = {
      withEarlyYellow: { played: 0, gcAfterYellow: 0, pts: 0 },
      withoutEarlyYellow: { played: 0, gcComparable: 0, pts: 0 }
    };

    safeArray(matches).forEach(match => {
      const yellows = safeArray(match.yellows);
      const earlyYellow = yellows.some(card => Number(card.min) <= 10);

      if (earlyYellow) {
        stats.withEarlyYellow.played += 1;
        stats.withEarlyYellow.pts += getPointsFromResult(match.res);

        safeArray(match.goals).forEach(goal => {
          if (goal.type === 'gc' && Number(goal.min) > 10) {
            stats.withEarlyYellow.gcAfterYellow += 1;
          }
        });
      } else {
        stats.withoutEarlyYellow.played += 1;
        stats.withoutEarlyYellow.pts += getPointsFromResult(match.res);

        safeArray(match.goals).forEach(goal => {
          if (goal.type === 'gc' && Number(goal.min) > 10) {
            stats.withoutEarlyYellow.gcComparable += 1;
          }
        });
      }
    });

    return stats;
  }

  function getPlayerMinutesSummary(matches) {
    const summary = {};

    safeArray(matches).forEach(match => {
      safeArray(match.titulars).forEach(p => {
        const id = p.id;
        if (!id) return;

        if (!summary[id]) {
          summary[id] = { id, name: getPlayerName(id), matches: 0, starts: 0, totalMinutes: 0 };
        }

        summary[id].matches += 1;
        summary[id].starts += 1;
        summary[id].totalMinutes += typeof p.d === 'number' ? p.d : 70;
      });

      safeArray(match.suplents).forEach(p => {
        const id = p.id;
        if (!id) return;

        if (!summary[id]) {
          summary[id] = { id, name: getPlayerName(id), matches: 0, starts: 0, totalMinutes: 0 };
        }

        summary[id].matches += 1;
        summary[id].totalMinutes += typeof p.d === 'number' ? p.d : 0;
      });
    });

    return Object.values(summary).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  function buildSummary() {
    const matches = getPlayedMatches();
    const sorted = sortMatchesAsc(matches);

    const total = {
      played: sorted.length,
      wins: 0,
      draws: 0,
      losses: 0,
      pts: 0,
      gf: 0,
      gc: 0
    };

    sorted.forEach(match => {
      total.gf += Number(match.gf) || 0;
      total.gc += Number(match.gc) || 0;
      total.pts += getPointsFromResult(match.res);

      const r = parseResult(match.res);
      if (r === 'W') total.wins += 1;
      else if (r === 'D') total.draws += 1;
      else if (r === 'L') total.losses += 1;
    });

    return {
      total,
      timeSlots: getTimeSlotStats(sorted),
      criticalGoals: getCriticalGoalsStats(sorted),
      earlyYellowImpact: getEarlyYellowImpact(sorted),
      playerMinutes: getPlayerMinutesSummary(sorted),
      lastMatch: getLastPlayedMatch(),
      nextMatch: getNextMatch()
    };
  }

  function renderTimeSlotAnalysis(container) {
    if (!container) return;

    const summary = buildSummary();
    const slots = summary.timeSlots;

    const rows = ['mañana', 'mediodía', 'tarde'].map(slot => {
      const s = slots[slot];
      const ppg = s.played ? (s.pts / s.played).toFixed(2) : '-';
      const avgGf = s.played ? (s.gf / s.played).toFixed(2) : '-';
      const avgGc = s.played ? (s.gc / s.played).toFixed(2) : '-';

      return `
        <tr>
          <td>${escapeHtml(slot)}</td>
          <td>${s.played}</td>
          <td>${s.wins}</td>
          <td>${s.draws}</td>
          <td>${s.losses}</td>
          <td>${s.pts}</td>
          <td>${ppg}</td>
          <td>${avgGf}</td>
          <td>${avgGc}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="analysis-card">
        <h3>Franja horaria</h3>
        <table>
          <thead>
            <tr>
              <th>Franja</th>
              <th>J</th>
              <th>G</th>
              <th>E</th>
              <th>P</th>
              <th>Pts</th>
              <th>Pts/J</th>
              <th>GF/J</th>
              <th>GC/J</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderQuickInfo() {
    const lastEl = document.querySelector('[data-last-match]');
    const nextEl = document.querySelector('[data-next-match]');
    const summaryEl = document.querySelector('[data-team-summary]');

    const summary = buildSummary();

    if (lastEl && summary.lastMatch) {
      lastEl.innerHTML = `
        <strong>${escapeHtml(getMatchLabel(summary.lastMatch))}</strong><br>
        Resultado: ${escapeHtml(getScoreLabel(summary.lastMatch))}<br>
        Hora: ${escapeHtml(getTimeLabel(summary.lastMatch))}<br>
        Franja: ${escapeHtml(summary.lastMatch.timeSlot || '-')}
      `;
    }

    if (nextEl && summary.nextMatch) {
      nextEl.innerHTML = `
        <strong>${escapeHtml(getMatchLabel(summary.nextMatch))}</strong><br>
        Fecha: ${escapeHtml(summary.nextMatch.date || '-')}<br>
        Hora: ${escapeHtml(getTimeLabel(summary.nextMatch))}<br>
        Franja: ${escapeHtml(summary.nextMatch.timeSlot || '-')}
      `;
    }

    if (summaryEl) {
      summaryEl.innerHTML = `
        <strong>Resumen</strong><br>
        J: ${summary.total.played} -
        G: ${summary.total.wins} -
        E: ${summary.total.draws} -
        P: ${summary.total.losses} -
        GF: ${summary.total.gf} -
        GC: ${summary.total.gc} -
        Pts: ${summary.total.pts}
      `;
    }
  }

  function init() {
    renderQuickInfo();

    const timeSlotContainer = document.querySelector('[data-analysis-timeslots]');
    if (timeSlotContainer) renderTimeSlotAnalysis(timeSlotContainer);
  }

  window.DIAGONAL_UPDATE = {
    getTimeSlot,
    getEnrichedMatches,
    getDiagonalMatches,
    getPlayedMatches,
    getUpcomingMatches,
    getLastPlayedMatch,
    getNextMatch,
    getTimeSlotStats,
    getCriticalGoalsStats,
    getEarlyYellowImpact,
    getPlayerMinutesSummary,
    buildSummary,
    init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
