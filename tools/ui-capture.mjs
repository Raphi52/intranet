/**
 * Capture visuelle du portail (vérification UI hors-modèle, SANS dépendance npm).
 * Pilote Edge headless via CDP (WebSocket natif de Node ≥ 22).
 *   1) serveur éphémère + SQLite jetable ; 2) seed authentifié (admin → comptes,
 *   projet, tickets) ; 3) capture l'écran de login, puis se connecte et capture
 *   le board, la page comptes (admin) et l'accueil. PNG dans tools/captures/.
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
const ADMIN = { email: 'admin@amitel.fr', password: 'admin-cap-123' };

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

// --- Seed authentifié (côté serveur, cookie admin) -------------------------
async function seed() {
  const cookieJar = (r) => { const sc = r.headers.get('set-cookie') || ''; const m = sc.match(/sid=([^;]+)/); return m ? `sid=${m[1]}` : ''; };
  const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }) });
  const cookie = cookieJar(lr);
  const post = (u, b) => fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(b) }).then((r) => r.json());
  const patch = (u, b) => fetch(BASE + u, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(b) });
  const u1 = await post('/api/auth/users', { nom: 'Paul Martin', email: 'paul@amitel.fr', motDePasse: 'motdepasse', service: 'Développement', role: 'membre' });
  const u2 = await post('/api/auth/users', { nom: 'Marie Curie', email: 'marie@amitel.fr', motDePasse: 'motdepasse', service: 'Support', role: 'membre' });
  const proj = await post('/api/ticketing/projets', { cle: 'IT', nom: 'Support informatique', couleur: '#2980B9', membres: [u1.id, u2.id] });
  const t1 = await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Écran de Paul HS', type: 'incident', priorite: 'haute', assignee_id: u1.id });
  const t2 = await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Créer compte AD recrue', type: 'demande', priorite: 'normale', assignee_id: u2.id });
  await post(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'Mettre à jour la doc VPN', type: 'tache', priorite: 'basse' });
  await patch(`/api/ticketing/tickets/${t1.id}`, { statut: 'en_cours' });
  await patch(`/api/ticketing/tickets/${t2.id}`, { statut: 'en_attente' });
  // Onboarding : une fiche à nom TRÈS long pour vérifier la troncature (ellipsis) des cards.
  await post('/api/onboarding/collaborateurs', { prenom: 'Jean-Baptiste', nom: 'De La Tour Du Pin Chambly Montmorency Laval De La Roche Aymon Très Long', intitule_poste: 'Responsable adjoint du pôle exploitation et coordination inter-services régionaux' });
  // Publications (mur d'accueil) — une épinglée + une normale.
  const annonce = await post('/api/publications', { titre: 'Bienvenue sur le nouveau portail', corps: 'Le portail Amitel s\'enrichit : onboarding, tickets, comptes et désormais ce mur de publications. Bonne navigation !' });
  await patch(`/api/publications/${annonce.id}/epingle`, { epingle: true });
  await post('/api/publications', { titre: 'Maintenance vendredi 18h', corps: 'Une courte interruption de service est prévue vendredi en fin de journée.' });
  // Événements : un événement + 2 inscrits (via leurs comptes) pour montrer le compteur + les noms.
  const evt = await post('/api/evenements', { titre: 'Afterwork de juin', lieu: 'Terrasse du 3e', date_event: '2099-06-27 18:30', description: 'Boissons et tapas offerts — venez nombreux !' });
  const cookieDe = async (email) => {
    const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse' }) });
    const m = (r.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
    return m ? `sid=${m[1]}` : '';
  };
  for (const email of ['paul@amitel.fr', 'marie@amitel.fr']) {
    const ck = await cookieDe(email);
    await fetch(`${BASE}/api/evenements/${evt.id}/participation`, { method: 'POST', headers: { Cookie: ck } });
  }
  return proj.id;
}

async function capturer(session, hash, nom, selecteur) {
  await envoyer('Page.navigate', { url: BASE + '/' + hash }, session);
  const t0 = Date.now();
  let pret = false;
  while (Date.now() - t0 < 8000) {
    const r = await envoyer('Runtime.evaluate', { expression: `!!document.querySelector('${selecteur}')`, returnByValue: true }, session);
    if (r.result?.value) { pret = true; break; }
    await wait(150);
  }
  await wait(300);
  const shot = await envoyer('Page.captureScreenshot', { format: 'png' }, session);
  writeFileSync(join(OUT, nom + '.png'), Buffer.from(shot.data, 'base64'));
  console.log(`  capture: ${nom}.png (rendu=${pret})`);
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
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PORTAIL_DB: join(dbDir, 'ui.db'), ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password }, stdio: 'pipe',
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

  // Capture par CHANGEMENT DE HASH (sans reload) — garde la session SPA vivante après login.
  async function capturerHash(hash, nom, selecteur, pleinePage = false) {
    await envoyer('Runtime.evaluate', { expression: `location.hash=${JSON.stringify(hash)}`, returnByValue: true }, session);
    const t0 = Date.now();
    let pret = false;
    while (Date.now() - t0 < 8000) {
      const r = await envoyer('Runtime.evaluate', { expression: `!!document.querySelector('${selecteur}')`, returnByValue: true }, session);
      if (r.result?.value) { pret = true; break; }
      await wait(150);
    }
    await wait(300);
    const shot = await envoyer('Page.captureScreenshot', { format: 'png', captureBeyondViewport: pleinePage }, session);
    writeFileSync(join(OUT, nom + '.png'), Buffer.from(shot.data, 'base64'));
    console.log(`  capture: ${nom}.png (rendu=${pret})`);
    return pret;
  }

  // 1) Écran de login (aucune session)
  const okLogin = await capturer(session, '', 'login', '.gate');

  // 2) Connexion via le VRAI formulaire (remplit + soumet) → session SPA vivante
  await envoyer('Runtime.evaluate', {
    expression: `(()=>{const e=document.getElementById('login-email'),p=document.getElementById('login-mdp');if(!e||!p)return 'no-form';e.value=${JSON.stringify(ADMIN.email)};p.value=${JSON.stringify(ADMIN.password)};document.getElementById('login-form').requestSubmit();return 'ok';})()`,
    returnByValue: true,
  }, session);
  // attend la connexion effective (le badge opérateur apparaît dans l'en-tête)
  let connecte = false;
  for (let i = 0; i < 40; i++) {
    const r = await envoyer('Runtime.evaluate', { expression: `!!document.querySelector('.op-badge')`, returnByValue: true }, session);
    if (r.result?.value) { connecte = true; break; }
    await wait(150);
  }
  if (!connecte) erreurs.push('connexion UI : badge opérateur non apparu après soumission du formulaire');

  // 3) Vues connectées (navigation par hash, sans reload)
  const okBoard = await capturerHash(`#/ticketing/p/${projId}`, 'board', '.tk-board');
  const okAdmin = await capturerHash('#/admin/', 'admin', '.tk-tbl');
  const okEvt = await capturerHash('#/evenements/', 'evenements', '.evt-liste');
  const okOnb = await capturerHash('#/onboarding/', 'onboarding', '.grille, .vide');
  const okAccueil = await capturerHash('#/', 'accueil', '.pub', true);

  console.log(`\n  erreurs console: ${erreurs.length}`);
  erreurs.forEach((e) => console.log('   ❌ ' + e));
  const ok = okLogin && okBoard && okAdmin && okEvt && okOnb && okAccueil && erreurs.length === 0;
  console.log(ok ? '\n✅ UI RENDU OK' : '\n❌ UI : rendu incomplet ou erreurs console');
  nettoyer();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error('  exception:', e.message);
  erreurs.forEach((er) => console.log('   ❌ ' + er));
  nettoyer();
  process.exit(1);
}
