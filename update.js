#!/usr/bin/env node
'use strict';

/**
 * update.js — Busca actas publicadas en fcf.cat y actualiza MATCHES en v2.html
 *
 * Uso:
 *   node update.js            — actualiza v2.html si hay actas nuevas
 *   node update.js --dry-run  — muestra qué añadiría sin escribir nada
 *   node update.js --debug    — guarda HTML descargado en ./debug/ para inspección
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const HTML_FILE = path.join(__dirname, 'v2.html');
const DRY_RUN   = process.argv.includes('--dry-run');
const DEBUG     = process.argv.includes('--debug');

if (DEBUG) fs.mkdirSync(path.join(__dirname, 'debug'), { recursive: true });

// ═══════════════════════════════════════════════════════════════════
// UPCOMING — jornadas pendientes con URLs directas del acta en fcf.cat
// ═══════════════════════════════════════════════════════════════════
const UPCOMING_URLS = [
  { j:22, loc:'F', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/escola-f-angel-pedraza-a/1i14/diagonal-club-esp-a' },
  { j:23, loc:'C', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/diagonal-club-esp-a/1i14/les-corts-de-barcelona-club-esp-a' },
  { j:24, loc:'F', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/pa-barc-anguera-c/1i14/diagonal-club-esp-a' },
  { j:25, loc:'C', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/diagonal-club-esp-a/1i14/escola-de-futbol-premier-barcelona-a' },
  { j:26, loc:'F', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/sants-ue-b/1i14/diagonal-club-esp-a' },
  { j:27, loc:'C', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/diagonal-club-esp-a/1i14/escola-collblanc-torrassa-ce-a' },
  { j:28, loc:'F', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/lhospitalet-centre-esports-c/1i14/diagonal-club-esp-a' },
  { j:29, loc:'C', url:'https://www.fcf.cat/acta/2526/futbol-11/infantil-primera-divisio-s14/grup-9/1i14/diagonal-club-esp-a/1i14/sarria-cp-b' },
];

// ═══════════════════════════════════════════════════════════════════
// HTTP — GET con soporte de redirecciones
// ═══════════════════════════════════════════════════════════════════
function get(url, hops = 5) {
  return new Promise((resolve, reject) => {
    if (hops === 0) return reject(new Error('Too many redirects: ' + url));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent'     : 'Mozilla/5.0 (compatible; bot/1.0)',
        'Accept'         : 'text/html',
        'Accept-Language': 'ca,es;q=0.9',
      }
    }, res => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.resume();
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return get(next, hops - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, html: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
    req.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Leer PLAYERS y jornadas ya cargadas de v2.html
// ═══════════════════════════════════════════════════════════════════
function readV2() {
  const raw = fs.readFileSync(HTML_FILE, 'utf8');

  // Extraer PLAYERS usando conteo de llaves
  let PLAYERS = {};
  const pIdx = raw.indexOf('var PLAYERS = {');
  if (pIdx !== -1) {
    let depth = 0, i = pIdx + 'var PLAYERS = '.length, start = i;
    while (i < raw.length) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    try { PLAYERS = new Function('return ' + raw.slice(start, i))(); }
    catch (e) { console.warn('⚠️  No se pudo parsear PLAYERS:', e.message); }
  }

  // Jornadas ya presentes en MATCHES (solo dentro del array MATCHES, no UPCOMING)
  const played = new Set();
  const matchesStart = raw.indexOf('var MATCHES = [');
  if (matchesStart !== -1) {
    let depth = 0, i = matchesStart;
    while (i < raw.length) {
      if (raw[i] === '[') depth++;
      else if (raw[i] === ']') { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    const matchesSlice = raw.slice(matchesStart, i);
    for (const m of matchesSlice.matchAll(/\{j:(\d+),/g)) played.add(parseInt(m[1]));
  }

  return { raw, PLAYERS, played };
}

// ═══════════════════════════════════════════════════════════════════
// Helpers HTML
// ═══════════════════════════════════════════════════════════════════
function strip(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════
// ¿Está publicada el acta? (marcador = X-Y, no HH:MM)
// ═══════════════════════════════════════════════════════════════════
function isPublished(html) {
  const m = html.match(/class="acta-marcador"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
  if (!m) return false;
  const c = strip(m[1]);
  return /^\d+\s*[-–]\s*\d+$/.test(c);
}

// ═══════════════════════════════════════════════════════════════════
// Mapear nombre del acta → playerId en PLAYERS
// ═══════════════════════════════════════════════════════════════════
function findPlayer(name, dorsal, PLAYERS) {
  if (!name) return null;
  const n = norm(name);

  for (const [id, p] of Object.entries(PLAYERS)) {
    if (norm(p.name) === n) return id;
  }
  const tokens = n.split(' ').filter(t => t.length > 2);
  if (tokens.length) {
    for (const [id, p] of Object.entries(PLAYERS)) {
      const pTokens = norm(p.name).split(' ');
      const dorsalOk = dorsal < 0 || p.allDorsals.includes(dorsal);
      if (pTokens.includes(tokens[0]) && dorsalOk) return id;
    }
  }
  if (dorsal > 0) {
    for (const [id, p] of Object.entries(PLAYERS)) {
      if (p.activeDorsal === dorsal) return id;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Extraer filas de la tabla con el header indicado
// ═══════════════════════════════════════════════════════════════════
function extractTableRows(sectionHtml, headerText) {
  const re = new RegExp('<th[^>]*>' + headerText + '<\\/th>[\\s\\S]*?<\\/table>');
  const t = sectionHtml.match(re);
  if (!t) return [];
  return [...t[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => ({
    cells: [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => strip(c[1])),
    raw  : r[1],
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Parsear una acta publicada
// ═══════════════════════════════════════════════════════════════════
function parseActa(html, loc, PLAYERS) {
  // ── Fecha ──────────────────────────────────────────────────────
  const dateM = html.match(/print-acta-data[^>]*>Data:\s*(\d{2})-(\d{2})-(\d{4})/);
  const date  = dateM ? `${dateM[3]}-${dateM[2]}-${dateM[1]}` : null;

  // ── Jornada ────────────────────────────────────────────────────
  const jM = html.match(/Jornada\s+(\d+)/i);
  const j  = jM ? parseInt(jM[1]) : null;

  // ── Equipos — usamos el primer bloque acta-head (antes del sticky) ──
  const headBlock  = html.match(/class="acta-head"([\s\S]*?)(?=class="acta-head")/);
  const equipsHtml = headBlock ? headBlock[1] : html;
  const teams = [];
  for (const m of equipsHtml.matchAll(/class="acta-equip"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g)) {
    const t = strip(m[1]);
    if (t && !teams.includes(t)) teams.push(t);
    if (teams.length === 2) break;
  }
  const home = teams[0] || null;
  const away = teams[1] || null;

  // ── Marcador ───────────────────────────────────────────────────
  const scoreHtml = html.match(/class="acta-marcador"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
  const scoreM    = scoreHtml ? strip(scoreHtml[1]).match(/(\d+)\s*[-–]\s*(\d+)/) : null;
  if (!scoreM) return null;

  const homeGoals = parseInt(scoreM[1]);
  const awayGoals = parseInt(scoreM[2]);
  const gf  = loc === 'C' ? homeGoals : awayGoals;
  const gc  = loc === 'C' ? awayGoals : homeGoals;
  const res = gf > gc ? 'G' : gf < gc ? 'P' : 'E';

  // ── Árbitro ────────────────────────────────────────────────────
  let ref = null, refDel = null;
  const refSection = html.match(/Àrbitres<\/th>[\s\S]*?<\/table>/);
  if (refSection) {
    for (const { cells } of extractTableRows(refSection[0], 'Àrbitres')) {
      if (cells.length >= 2 && /àrbitre/i.test(cells[0])) {
        ref    = cells[1] || null;
        refDel = cells[2] || null;
        break;
      }
    }
  }

  // ── Jugadores ──────────────────────────────────────────────────
  // Hay dos col-md-4 con Titulars/Suplents: [local] [central] [visitante]
  // local = playerCols[0], visitante = playerCols[1]
  const playerColRe = /(<table class="acta-table">[\s\S]*?<th[^>]*>Titulars<\/th>[\s\S]*?<\/table>[\s\S]*?<table class="acta-table">[\s\S]*?<th[^>]*>Suplents<\/th>[\s\S]*?<\/table>)/g;
  const playerCols  = [...html.matchAll(playerColRe)].map(m => m[1]);
  const ourCol      = loc === 'C' ? playerCols[0] : playerCols[playerCols.length - 1];

  const titulars = [], suplents = [], yellows = [], reds = [];

  if (ourCol) {
    const parsePlayerTable = (header, target) => {
      for (const { cells, raw: rowRaw } of extractTableRows(ourCol, header)) {
        if (cells.length < 2 || !/^\d+$/.test(cells[0])) continue;
        const dorsal = parseInt(cells[0]);
        const name   = cells[1];
        const id     = findPlayer(name, dorsal, PLAYERS);
        if (id) target.push({ id, d: dorsal });
        if (rowRaw.includes('groga-s'))    yellows.push({ playerId: id || null, d: dorsal });
        if (rowRaw.includes('vermella-s')) reds.push({ playerId: id || null, d: dorsal });
      }
    };
    parsePlayerTable('Titulars', titulars);
    parsePlayerTable('Suplents', suplents);
  }

  // ── Goles ──────────────────────────────────────────────────────
  const goals      = [];
  const golSection = html.match(/Gols<\/th>[\s\S]*?<\/table>/);
  if (golSection) {
    for (const { cells, raw: rowRaw } of extractTableRows(golSection[0], 'Gols')) {
      if (cells.length < 3) continue;

      let min = null;
      for (const c of cells) {
        const mm = c.match(/(\d{1,3})['´']/);
        if (mm) { min = parseInt(mm[1]); break; }
      }
      // También buscar en HTML raw (el minuto puede ir en un div)
      if (min === null) {
        const mm = rowRaw.match(/(\d{1,3})[''´]/);
        if (mm) min = parseInt(mm[1]);
      }
      if (min === null || min < 1 || min > 120) continue;

      const playerName = cells[1] || '';
      const isOwn      = rowRaw.includes('gol-propia');

      // Determinar equipo por escudo (src de imagen en primera celda)
      const firstCellHtml = (rowRaw.match(/<td[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '';
      const escudoSrc     = (firstCellHtml.match(/src="([^"]+)"/) || [])[1] || '';
      let isOurTeam = null;
      if (escudoSrc) isOurTeam = escudoSrc.toLowerCase().includes('diagonal');

      let type, playerId;
      if (isOwn) {
        const id = findPlayer(playerName, -1, PLAYERS);
        type = id ? 'gc' : 'gf';
        playerId = null;
      } else if (isOurTeam === true) {
        type = 'gf';
        playerId = findPlayer(playerName, -1, PLAYERS);
      } else if (isOurTeam === false) {
        type = 'gc';
        playerId = null;
      } else {
        const id = findPlayer(playerName, -1, PLAYERS);
        type = id ? 'gf' : 'gc';
        playerId = id || null;
      }

      goals.push({ min, type, playerId });
    }
  }

  return { j, date, loc, home, away, gf, gc, res, ref, refDel, titulars, suplents, goals, yellows, reds };
}

// ═══════════════════════════════════════════════════════════════════
// Serializar al formato de v2.html
// ═══════════════════════════════════════════════════════════════════
function q(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function serArr(arr) {
  return '[' + arr.map(o =>
    '{' + Object.entries(o).map(([k, v]) => k + ':' + q(v)).join(',') + '}'
  ).join(',') + ']';
}
function serMatch(m) {
  return `  {j:${m.j},date:${q(m.date)},loc:${q(m.loc)},home:${q(m.home)},away:${q(m.away)},gf:${m.gf},gc:${m.gc},res:${q(m.res)},\n` +
    `   ref:${q(m.ref)},refDel:${q(m.refDel)},\n` +
    `   titulars:${serArr(m.titulars)},\n` +
    `   suplents:${serArr(m.suplents)},\n` +
    `   goals:${serArr(m.goals)},\n` +
    `   yellows:${serArr(m.yellows)},reds:${serArr(m.reds)}}`;
}

// ═══════════════════════════════════════════════════════════════════
// Insertar nuevos partidos en MATCHES dentro de v2.html
// ═══════════════════════════════════════════════════════════════════
function patchV2(raw, newMatches) {
  const start = raw.indexOf('var MATCHES = [');
  if (start === -1) throw new Error('"var MATCHES = [" no encontrado en v2.html');

  let depth = 0, i = start;
  while (i < raw.length) {
    if (raw[i] === '[') depth++;
    else if (raw[i] === ']') { depth--; if (depth === 0) break; }
    i++;
  }

  const insert = ',\n\n' + newMatches.map(serMatch).join(',\n\n') + '\n';
  return raw.slice(0, i) + insert + raw.slice(i);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log('📖  Leyendo v2.html...');
  const { raw, PLAYERS, played } = readV2();
  console.log(`    Jornadas cargadas : ${[...played].sort((a, b) => a - b).join(', ')}`);
  console.log(`    Jugadores en dict : ${Object.keys(PLAYERS).length}`);

  const pending = UPCOMING_URLS.filter(u => !played.has(u.j));
  if (!pending.length) {
    console.log('\n✅  Todas las jornadas ya están cargadas.');
    return;
  }
  console.log(`\n🔍  Jornadas pendientes: ${pending.map(u => 'J' + u.j).join(', ')}\n`);

  const newMatches = [];

  for (const { j, loc, url } of pending) {
    process.stdout.write(`⬇️   J${j} (${loc === 'C' ? 'casa' : 'fuera'})  `);

    let res;
    try { res = await get(url); }
    catch (e) { console.log(`❌  Error: ${e.message}`); continue; }

    if (res.status !== 200) { console.log(`❌  HTTP ${res.status}`); continue; }
    if (DEBUG) fs.writeFileSync(path.join(__dirname, 'debug', `j${j}.html`), res.html);

    if (!isPublished(res.html)) { console.log('⏳  Sin publicar todavía'); continue; }

    const match = parseActa(res.html, loc, PLAYERS);
    if (!match) { console.log('⚠️   No se pudo parsear'); continue; }

    console.log(`✅  ${match.home} ${match.gf}–${match.gc} ${match.away}  (${match.res})`);
    if (match.titulars.length) console.log(`     Titulares : ${match.titulars.map(p => p.id).join(', ')}`);
    if (match.suplents.length) console.log(`     Suplentes : ${match.suplents.map(p => p.id).join(', ')}`);
    if (match.goals.length)    console.log(`     Goles     : ${match.goals.map(g => `${g.min}' ${g.type}${g.playerId ? ' (' + g.playerId + ')' : ''}`).join(', ')}`);
    if (match.yellows.length)  console.log(`     Amarillas : ${match.yellows.map(y => y.playerId || '?').join(', ')}`);
    if (match.reds.length)     console.log(`     Rojas     : ${match.reds.map(r => r.playerId || '?').join(', ')}`);

    newMatches.push(match);
  }

  console.log('');

  if (!newMatches.length) {
    console.log('ℹ️   No hay actas nuevas publicadas. Vuelve a ejecutar después del partido.');
    return;
  }

  if (DRY_RUN) {
    console.log('🔍  DRY RUN — se añadirían:');
    newMatches.forEach(m => console.log(`    J${m.j}  ${m.date}  ${m.home} ${m.gf}–${m.gc} ${m.away}`));
    console.log('\nEjecuta sin --dry-run para aplicar los cambios.');
    return;
  }

  console.log(`✏️   Actualizando v2.html con ${newMatches.length} partido(s) nuevo(s)...`);
  fs.writeFileSync(HTML_FILE, patchV2(raw, newMatches), 'utf8');
  console.log('✅  ¡Hecho! Recuerda actualizar también CLAS y UPCOMING si procede.');
}

main().catch(e => {
  console.error('\n💥  Error:', e.message);
  if (DEBUG) console.error(e.stack);
  process.exit(1);
});
