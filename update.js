function enrichStandingsRow(row) {
  return {
    ...row,
    gd: (row.gf || 0) - (row.gc || 0),
    ppg: row.j ? +(row.pts / row.j).toFixed(2) : 0,
    pending: row.j < 23
  };
}

function getStandingsData() {
  if (typeof STANDINGS === 'undefined' || !Array.isArray(STANDINGS)) {
    return [];
  }
  return STANDINGS.map(enrichStandingsRow);
}

function getOfficialTable() {
  return [...getStandingsData()].sort((a, b) =>
    (a.pos || 999) - (b.pos || 999) ||
    b.pts - a.pts ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    a.team.localeCompare(b.team)
  );
}

function getPerformanceTable() {
  return [...getStandingsData()].sort((a, b) =>
    b.ppg - a.ppg ||
    b.pts - a.pts ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    a.team.localeCompare(b.team)
  );
}

function getDiagonalStanding() {
  return getStandingsData().find(row => row.team === 'DIAGONAL CLUB ESP. A') || null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusBadge(row) {
  if (row.pending) {
    return '<span class="badge pending">Game in hand</span>';
  }
  return '<span class="badge ok">Level</span>';
}

function renderStandingsTable(targetId, mode) {
  const container = document.getElementById(targetId);
  if (!container) return;

  const data = mode === 'ppg' ? getPerformanceTable() : getOfficialTable();

  if (!data.length) {
    container.innerHTML = '<p>No standings data available.</p>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Equipo</th>
          <th>Pts</th>
          <th>J</th>
          <th>G</th>
          <th>E</th>
          <th>P</th>
          <th>GF</th>
          <th>GC</th>
          <th>DG</th>
          <th>PPG</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((row, idx) => {
          const rank = mode === 'ppg' ? idx + 1 : row.pos;
          const isDiagonal = row.team === 'DIAGONAL CLUB ESP. A';

          return `
            <tr class="${isDiagonal ? 'diagonal' : ''}">
              <td>${rank}</td>
              <td>${escapeHtml(row.team)}</td>
              <td>${row.pts}</td>
              <td>${row.j}</td>
              <td>${row.g}</td>
              <td>${row.e}</td>
              <td>${row.p}</td>
              <td>${row.gf}</td>
              <td>${row.gc}</td>
              <td>${row.gd > 0 ? '+' : ''}${row.gd}</td>
              <td>${row.ppg.toFixed(2)}</td>
              <td>${getStatusBadge(row)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function simulateDiagonalScenario(extraPoints) {
  const simulated = getStandingsData().map(row => ({ ...row }));
  const diagonal = simulated.find(row => row.team === 'DIAGONAL CLUB ESP. A');

  if (!diagonal) return null;

  diagonal.j += 1;
  diagonal.pts += extraPoints;

  if (extraPoints === 3) diagonal.g += 1;
  else if (extraPoints === 1) diagonal.e += 1;
  else diagonal.p += 1;

  diagonal.gd = diagonal.gf - diagonal.gc;
  diagonal.ppg = diagonal.j ? +(diagonal.pts / diagonal.j).toFixed(2) : 0;
  diagonal.pending = diagonal.j < 23;

  const officialSorted = [...simulated].sort((a, b) =>
    b.pts - a.pts ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    a.team.localeCompare(b.team)
  );

  const ppgSorted = [...simulated].sort((a, b) =>
    b.ppg - a.ppg ||
    b.pts - a.pts ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    a.team.localeCompare(b.team)
  );

  return {
    pts: diagonal.pts,
    j: diagonal.j,
    ppg: diagonal.ppg,
    officialPos: officialSorted.findIndex(row => row.team === diagonal.team) + 1,
    ppgPos: ppgSorted.findIndex(row => row.team === diagonal.team) + 1
  };
}
