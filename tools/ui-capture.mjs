/**
 * Capture visuelle du portail (vérification UI hors-modèle, SANS dépendance npm).
 *
 * Pilote Edge en headless via le protocole CDP (WebSocket global de Node ≥ 22) :
 *   1) démarre un serveur éphémère + SQLite jetable ;
 *   2) seede un jeu de données ticketing (personne, projet, tickets multi-statuts) ;
 *   3) pré-règle l'opérateur (localStorage) pour passer le gate d'identité ;
 *   4) navigue, attend le rendu, capture des PNG + remonte les erreurs console.
 *
 * Lancement : node tools/ui-capture.mjs   → PNG dans tools/captures/, exit 0 si rendu OK.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(__dirname, 'captures');
mkdirSync(OUT, { recursive: true });

const PORT = 3998;
const DBG = 9223;
const BASE = `http://127.0.0.1:${PORT}`;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dbDir = mkdtempSync(join(tmpdir(), 'portail-ui-'));
const profil = mkdtempSync(join(tmpdir(), 'edge-prof-'));
let serveur, edge, ws, msgId = 0;
const enAttente = new Map();
const erreurs = [];

function envoyer(method, params = {}, sessionId) {
  const id = ++msgId;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    enAttente.set(id, { res, rej });
    setTimeout(() => enAttente.has(id) && (enAttente.delete(id), rej(new Error('CDP timeout ' + method))), 15000);
  });
}

async function attendrePret(url, capMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    try { const r = await fetch(url); if (r.ok) return await r.json().catch(() => true); } catch { /* */ }
    await wait(200);
  }
  throw new Error('pas prêt: ' + url);
}

async function seed() {
  const op = { 'Content-Type': 'application/json', 'X-Operateur': 'Smoke A.' };
  const post = (u, b) => fetch(BASE + u, { method: 'POST', headers: op, body: JSON.stringify(b) }).then((r) => r.json());
  const p1 = await post('/api/ticketing/personnes', { nom: 'Smoke Agent', email: 'smoke@amitel.fr' });
  const p2 = await post('/api/ticketing/personnes', { nom: 'Marie Curie', email: 'marie@amitel.fr' });
  const proj = await post('/api/ticketing/projets', { cle: 'IT', nom: 'Support informatique', couleur: '#2980B9', membres: [p1.id] });
  const t1 = await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Écran de Paul HS', type: 'incident', priorite: 'haute', assignee_id: p1.id });
  const t2 = await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Créer compte AD nouvelle recrue', type: 'demande', priorite: 'normale', assignee_id: p2.id });
  await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Mettre à jour la doc VPN', type: 'tache', priorite: 'basse' });
  // disperse les statuts pour un board parlant
  const patch = (id, b) => fetch(`${BASE}/api/ticketing/tickets/${id}`, { method: 'PATCH', headers: op, body: JSON.stringify(b) });
  await patch(t1.id, { statut: 'en_cours' });
  await patch(t2.id, { statut: 'en_attente' });
  // un 2e projet pour l'accueil
  await post('/api/ticketing/projets', { cle: 'RH', nom: 'Ressources humaines', couleur: '#8E44AD', prive: true, membres: [p1.id] });
  return proj.id;
}

async function capturer(session, hash, nom) {
  await envoyer('Page.navigate', { url: BASE + '/' + hash }, session);
  // attend le rendu réel (élément présent), pas un délai fixe
  const t0 = Date.now();
  let pret = false;
  while (Date.now() - t0 < 8000) {
    const sel = hash.includes('/p/') ? '.tk-board' : hash.includes('/t/') ? '.tk-detail' : '.grille, .vide';
    const r = await envoyer('Runtime.evaluate', { expression: `!!document.querySelector('${sel}')`, returnByValue: true }, session);
    if (r.result?.value) { pret = true; break; }
    await wait(150);
  }
  await wait(250);
  const shot = await envoyer('Page.captureScreenshot', { format: 'png' }, session);
  const chemin = join(OUT, nom + '.png');
  writeFileSync(chemin, Buffer.from(shot.data, 'base64'));
  console.log(`  capture: ${chemin} (rendu=${pret})`);
  return pret;
}

function nettoyer() {
  try { ws?.close(); } catch { /* */ }
  try { edge?.kill(); } catch { /* */ }
  try { serveur?.kill(); } catch { /* */ }
  try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* */ }
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* */ }
}

try {
  serveur = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PORTAIL_DB: join(dbDir, 'ui.db') }, stdio: 'pipe',
  });
  await attendrePret(`${BASE}/`);
  const projId = await seed();
  console.log('  données seedées, projet', projId);

  edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${DBG}`, `--user-data-dir=${profil}`, '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  const ver = await attendrePret(`http://127.0.0.1:${DBG}/json/version`);
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && enAttente.has(m.id)) {
      const { res, rej } = enAttente.get(m.id); enAttente.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      erreurs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      erreurs.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  });

  const cible = await envoyer('Target.createTarget', { url: 'about:blank' });
  const att = await envoyer('Target.attachToTarget', { targetId: cible.targetId, flatten: true });
  const session = att.sessionId;
  await envoyer('Page.enable', {}, session);
  await envoyer('Runtime.enable', {}, session);

  // passe le gate d'identité : pré-règle l'opérateur dans localStorage de l'origine
  await envoyer('Page.navigate', { url: `${BASE}/` }, session);
  await wait(500);
  await envoyer('Runtime.evaluate', {
    expression: `localStorage.setItem('portail.operateur', JSON.stringify({prenom:'Smoke',nom:'Agent'}))`,
  }, session);

  const okAccueil = await capturer(session, '#/ticketing/', 'ticketing-accueil');
  const okBoard = await capturer(session, `#/ticketing/p/${projId}`, 'ticketing-board');
  const okDetail = await capturer(session, '#/ticketing/t/1', 'ticketing-detail');

  console.log(`\n  erreurs console: ${erreurs.length}`);
  erreurs.forEach((e) => console.log('   ❌ ' + e));
  const ok = okAccueil && okBoard && okDetail && erreurs.length === 0;
  console.log(ok ? '\n✅ UI RENDU OK' : '\n❌ UI : rendu incomplet ou erreurs console');
  nettoyer();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('  exception:', e.message);
  erreurs.forEach((er) => console.log('   ❌ ' + er));
  nettoyer();
  process.exit(1);
}
