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
    return DIAGONAL_NAMES.some(function (team) {
      return normalizeText(team) === n;
    }) || n.includes('diagonal');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toTimestamp(value) {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function compareByDateThenMatchday(a, b) {
    const da = toTimestamp(a.date);
    const db = toTimestamp(b.date);

    if (da !== db) return da - db;

    return Number(a.j || 0) - Number(b.j || 0);
  }

  function getAllMatches() {
    return safeArray(window.MATCHES);
  }

  function getAllPlayers() {
    const src = window.PLAYERS;

    if (Array.isArray(src)) {
      return src.map(function (player, index) {
        return {
          id: player.id || player.playerId || String(index),
          ...player
        };
      });
    }

    if (src && typeof src === 'object') {
      return Object.keys(src).map(function (id) {
        const player = src[id] || {};
        return {
          id: id,
          ...player
        };
      });
    }

    return [];
  }

  function getRawUpcomingMatches() {
    return safeArray(window.UPCOMING);
  }

  function getAllStandings() {
    return safeArray(window.STANDINGS);
  }

  function getPlayedMatchdaySet() {
    const played = new Set();

    getAllMatches().forEach(function (match) {
      const j = Number(match.j || 0);
      if (j > 0) played.add(j);
    });

    return played;
  }

  function getSeasonTotalMatchdays() {
    let maxJ = 0;

    getAllMatches().forEach(function (match) {
      maxJ = Math.max(maxJ, Number(match.j || 0));
    });

    getRawUpcomingMatches().forEach(function (match) {
      maxJ = Math.max(maxJ, Number(match.j || 0));
    });

    getAllStandings().forEach(function (row) {
      maxJ = Math.max(maxJ, Number(row.j || 0));
    });

    return maxJ || 0;
  }

  function getPendingFlag(j) {
    const total = getSeasonTotalMatchdays();
    const played = Number(j || 0);
    return total > 0 && played < total;
  }

  function getUpcomingMatches() {
    const playedMatchdays = getPlayedMatchdaySet();

    return getRawUpcomingMatches()
      .filter(function (match) {
        return !playedMatchdays.has(Number(match.j || 0));
      })
      .slice()
      .sort(compareByDateThenMatchday);
  }

  function getUpcomingMatch() {
    const pending = getUpcomingMatches();
    return pending[0] || null;
  }

  function getRemainingUpcomingMatches() {
    const pending = getUpcomingMatches();
    return pending.slice(1);
  }

  function getMatchPerspective(match) {
    const homeIsDiagonal = isDiagonalTeamName(match.home);
    const awayIsDiagonal = isDiagonalTeamName(match.away);

    let gf = 0;
    let gc = 0;
    let rival = '';
    let venue = '';
    let score = '';

    if (homeIsDiagonal) {
      gf = Number(match.gf || 0);
      gc = Number(match.gc || 0);
      rival = match.away || match.rival || '';
      venue = 'C';
      score = gf + '-' + gc;
    } else if (awayIsDiagonal) {
      gf = Number(match.gc || 0);
      gc = Number(match.gf || 0);
      rival = match.home || match.rival || '';
      venue = 'F';
      score = gf + '-' + gc;
    }

    return {
      gf: gf,
      gc: gc,
      rival: rival,
      venue: venue,
      score: score,
      result: match.res || '',
      homeIsDiagonal: homeIsDiagonal,
      awayIsDiagonal: awayIsDiagonal
    };
  }

  function computeDiagonalStatsFromMatches() {
    const matches = getAllMatches()
      .slice()
      .sort(compareByDateThenMatchday);

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let gf = 0;
    let gc = 0;

    matches.forEach(function (match) {
      const p = getMatchPerspective(match);

      if (!p.homeIsDiagonal && !p.awayIsDiagonal) return;

      gf += p.gf;
      gc += p.gc;

      if (match.res === 'G') wins += 1;
      else if (match.res === 'E') draws += 1;
      else if (match.res === 'P') losses += 1;
    });

    return {
      played: wins + draws + losses,
      wins: wins,
      draws: draws,
      losses: losses,
      points: wins * 3 + draws,
      gf: gf,
      gc: gc,
      gd: gf - gc
    };
  }

  function enrichStandingsRow(row) {
    const pts = Number(row.pts || 0);
    const j = Number(row.j || 0);
    const gf = Number(row.gf || 0);
    const gc = Number(row.gc || 0);

    return {
      ...row,
      pos: Number(row.pos || 0),
      pts: pts,
      j: j,
      g: Number(row.g || 0),
      e: Number(row.e || 0),
      p: Number(row.p || 0),
      gf: gf,
      gc: gc,
      gd: gf - gc,
      ppg: j ? +(pts / j).toFixed(2) : 0,
      pending: getPendingFlag(j)
    };
  }

  function getStandingsData() {
    return getAllStandings().map(enrichStandingsRow);
  }

  function getOfficialTable() {
    return getStandingsData().slice().sort(function (a, b) {
      return (
        a.pos - b.pos ||
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        String(a.team || '').localeCompare(String(b.team || ''))
      );
    });
  }

  function getPerformanceTable() {
    return getStandingsData().slice().sort(function (a, b) {
      return (
        b.ppg - a.ppg ||
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        String(a.team || '').localeCompare(String(b.team || ''))
      );
    });
  }

  function getDiagonalStanding() {
    return getStandingsData().find(function (row) {
      return isDiagonalTeamName(row.team);
    }) || null;
  }

  function getStatusBadge(row) {
    if (row.pending) {
      return '<span class="badge pending">Game in hand</span>';
    }
    return '<span class="badge good">Level</span>';
  }

  function renderStandingsTable(targetId, mode) {
    const container = document.getElementById(targetId);
    if (!container) return;

    const data = mode === 'ppg' ? getPerformanceTable() : getOfficialTable();

    if (!data.length) {
      container.innerHTML = '<div class="empty">No standings data available.</div>';
      return;
    }

    container.innerHTML =
      '<div class="table-wrap">' +
        '<table>' +
          '<thead>' +
            '<tr>' +
              '<th>#</th>' +
              '<th>Equipo</th>' +
              '<th>Pts</th>' +
              '<th>J</th>' +
              '<th>G</th>' +
              '<th>E</th>' +
              '<th>P</th>' +
              '<th>GF</th>' +
              '<th>GC</th>' +
              '<th>DG</th>' +
              '<th>PPG</th>' +
              '<th>Estado</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            data.map(function (row, idx) {
              const rank = mode === 'ppg' ? idx + 1 : row.pos;
              const diagonalClass = isDiagonalTeamName(row.team) ? 'diagonal' : '';
              return (
                '<tr class="' + diagonalClass + '">' +
                  '<td>' + rank + '</td>' +
                  '<td>' + escapeHtml(row.team) + '</td>' +
                  '<td><strong>' + row.pts + '</strong></td>' +
                  '<td>' + row.j + '</td>' +
                  '<td>' + row.g + '</td>' +
                  '<td>' + row.e + '</td>' +
                  '<td>' + row.p + '</td>' +
                  '<td>' + row.gf + '</td>' +
                  '<td>' + row.gc + '</td>' +
                  '<td>' + (row.gd > 0 ? '+' : '') + row.gd + '</td>' +
                  '<td>' + row.ppg.toFixed(2) + '</td>' +
                  '<td>' + getStatusBadge(row) + '</td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function getRecentDiagonalMatches(limit) {
    const max = Number(limit || 5);

    return getAllMatches()
      .filter(function (match) {
        const p = getMatchPerspective(match);
        return p.homeIsDiagonal || p.awayIsDiagonal;
      })
      .slice()
      .sort(compareByDateThenMatchday)
      .slice(-max)
      .reverse()
      .map(function (match) {
        const p = getMatchPerspective(match);
        return {
          ...match,
          diagonalGf: p.gf,
          diagonalGc: p.gc,
          rival: p.rival,
          venue: p.venue,
          score: p.score
        };
      });
  }

  function getTopScorers(limit) {
    const max = Number(limit || 12);
    const players = getAllPlayers();
    const goalsByPlayer = {};

    getAllMatches().forEach(function (match) {
      safeArray(match.goals).forEach(function (goal) {
        if (goal.type === 'gf' && goal.playerId) {
          goalsByPlayer[goal.playerId] = (goalsByPlayer[goal.playerId] || 0) + 1;
        }
      });
    });

    return players
      .map(function (player) {
        return {
          id: player.id,
          name: player.name || player.nom || player.player || player.id || '',
          number: player.activeDorsal || player.number || player.dorsal || '',
          goals: goalsByPlayer[player.id] || 0
        };
      })
      .sort(function (a, b) {
        return b.goals - a.goals || String(a.name).localeCompare(String(b.name));
      })
      .slice(0, max);
  }

  function getRefereeStats() {
    const refs = {};

    getAllMatches().forEach(function (match) {
      const name = match.ref || 'Unknown';

      if (!refs[name]) {
        refs[name] = {
          name: name,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0
        };
      }

      refs[name].matches += 1;

      if (match.res === 'G') refs[name].wins += 1;
      else if (match.res === 'E') refs[name].draws += 1;
      else if (match.res === 'P') refs[name].losses += 1;
    });

    return Object.values(refs).sort(function (a, b) {
      return b.matches - a.matches || a.name.localeCompare(b.name);
    });
  }

  function simulateDiagonalScenario(extraPoints) {
    const simulated = getStandingsData().map(function (row) {
      return { ...row };
    });

    const diagonal = simulated.find(function (row) {
      return isDiagonalTeamName(row.team);
    });

    if (!diagonal) return null;

    diagonal.j += 1;
    diagonal.pts += Number(extraPoints || 0);

    if (extraPoints === 3) diagonal.g += 1;
    else if (extraPoints === 1) diagonal.e += 1;
    else diagonal.p += 1;

    diagonal.gd = diagonal.gf - diagonal.gc;
    diagonal.ppg = diagonal.j ? +(diagonal.pts / diagonal.j).toFixed(2) : 0;
    diagonal.pending = getPendingFlag(diagonal.j);

    const officialSorted = simulated.slice().sort(function (a, b) {
      return (
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        String(a.team || '').localeCompare(String(b.team || ''))
      );
    });

    const ppgSorted = simulated.slice().sort(function (a, b) {
      return (
        b.ppg - a.ppg ||
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        String(a.team || '').localeCompare(String(b.team || ''))
      );
    });

    return {
      pts: diagonal.pts,
      j: diagonal.j,
      ppg: diagonal.ppg,
      officialPos: officialSorted.findIndex(function (row) {
        return isDiagonalTeamName(row.team);
      }) + 1,
      ppgPos: ppgSorted.findIndex(function (row) {
        return isDiagonalTeamName(row.team);
      }) + 1
    };
  }

  window.safeArray = safeArray;
  window.escapeHtml = escapeHtml;
  window.getAllMatches = getAllMatches;
  window.getAllPlayers = getAllPlayers;
  window.getRawUpcomingMatches = getRawUpcomingMatches;
  window.getUpcomingMatches = getUpcomingMatches;
  window.getUpcomingMatch = getUpcomingMatch;
  window.getRemainingUpcomingMatches = getRemainingUpcomingMatches;
  window.getSeasonTotalMatchdays = getSeasonTotalMatchdays;
  window.getMatchPerspective = getMatchPerspective;
  window.computeDiagonalStatsFromMatches = computeDiagonalStatsFromMatches;
  window.enrichStandingsRow = enrichStandingsRow;
  window.getStandingsData = getStandingsData;
  window.getOfficialTable = getOfficialTable;
  window.getPerformanceTable = getPerformanceTable;
  window.getDiagonalStanding = getDiagonalStanding;
  window.renderStandingsTable = renderStandingsTable;
  window.getRecentDiagonalMatches = getRecentDiagonalMatches;
  window.getTopScorers = getTopScorers;
  window.getRefereeStats = getRefereeStats;
  window.simulateDiagonalScenario = simulateDiagonalScenario;
})();
