/**
 * Smoke test du Portail Amitel — signal de boucle (hors-modèle).
 *
 * 1) Vérifie la SYNTAXE de tous les modules JS (node --check).
 * 2) Démarre un serveur ÉPHÉMÈRE (port dédié + base SQLite jetable) et teste le
 *    parcours réel DERRIÈRE L'AUTH : login, sessions vérifiées, onboarding, docs,
 *    ticketing (confidentialité réelle par compte). Le portail exige une session.
 *
 * Sortie : exit 0 = tout vert ; exit 1 = au moins un échec. Lancement : node tools/smoke.mjs
 */

import { execSync, spawn } from 'node:child_process';
import { readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let echecs = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const ko = (m) => {
  console.error(`  ❌ ${m}`);
  echecs++;
};

// --- 1) Syntax-check de tous les .js -------------------------------------
function listerJs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'data' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listerJs(p));
    else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}

console.log('\n[1/2] Syntaxe des modules JS');
const fichiers = [...listerJs(join(ROOT, 'server')), ...listerJs(join(ROOT, 'public', 'js')), ...listerJs(join(ROOT, 'tools'))];
for (const f of fichiers) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    ko(`syntaxe: ${f.replace(ROOT, '.')}\n${e.stderr?.toString() || e.message}`);
  }
}
if (echecs === 0) ok(`${fichiers.length} modules JS sans erreur de syntaxe`);

// --- 2) Parcours HTTP réel sur serveur éphémère --------------------------
const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'portail-smoke-'));
const DB = join(dbDir, 'smoke.db');
const ADMIN = { email: 'admin@amitel.fr', password: 'admin-test-123' };

console.log('\n[2/2] Parcours HTTP (serveur éphémère, derrière auth)');
const serveur = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PORTAIL_DB: DB, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password },
  stdio: 'pipe',
});
let logServeur = '';
serveur.stdout.on('data', (d) => (logServeur += d));
serveur.stderr.on('data', (d) => (logServeur += d));

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendrePret(capMs = 15000) {
  const debut = Date.now();
  while (Date.now() - debut < capMs) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await attendre(200);
  }
  return false;
}

// Cookie de session courant (admin par défaut). f() l'attache automatiquement.
let COOKIE = '';
const extraireCookie = (resp) => {
  const sc = resp.headers.get('set-cookie') || '';
  const m = sc.match(/sid=([^;]+)/);
  return m ? `sid=${m[1]}` : '';
};
function f(url, { method = 'GET', body, cookie = COOKIE, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h['Cookie'] = cookie;
  return fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}
async function jget(url, cookie = COOKIE) {
  const r = await f(url, { cookie });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  return { status: r.status, cookie: extraireCookie(r), body: await r.json().catch(() => null) };
}

function nettoyer() {
  try { serveur.kill(); } catch { /* ignore */ }
  try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  if (!(await attendrePret())) {
    ko(`le serveur n'a pas démarré en 15s\n${logServeur}`);
  } else {
    ok('serveur démarré');

    // a) Shell + entrée front servis (PUBLICS, pas derrière l'auth)
    const racine = await fetch(`${BASE}/`);
    const html = await racine.text();
    racine.status === 200 && /Portail Amitel/.test(html) && /id="app"/.test(html)
      ? ok('shell HTML servi (titre « Portail Amitel »)')
      : ko(`shell HTML inattendu (status ${racine.status})`);
    const appjs = await fetch(`${BASE}/js/core/app.js`);
    appjs.status === 200 ? ok('/js/core/app.js servi') : ko(`/js/core/app.js status ${appjs.status}`);

    // --- AUTH : la garde mord, login fonctionne -----------------------------
    const sansSession = await fetch(`${BASE}/api/onboarding/meta`);
    sansSession.status === 401 ? ok('auth: /api sans session → 401 (anti-usurpation)') : ko(`auth: attendu 401 sans session, reçu ${sansSession.status}`);
    const mauvais = await login(ADMIN.email, 'mauvais');
    mauvais.status === 401 ? ok('auth: mauvais mot de passe → 401') : ko(`auth: mauvais mdp attendu 401, reçu ${mauvais.status}`);
    const cnx = await login(ADMIN.email, ADMIN.password);
    if (cnx.status === 200 && cnx.cookie && cnx.body?.role === 'admin') {
      COOKIE = cnx.cookie;
      ok('auth: login admin → 200 + session (rôle admin)');
    } else {
      ko(`auth: login admin échoué (status ${cnx.status})`);
    }
    const moi = await jget('/api/auth/me');
    moi.status === 200 && moi.body?.email === ADMIN.email ? ok('auth: GET /me renvoie le compte connecté') : ko(`auth: /me inattendu (status ${moi.status})`);
    const adminId = moi.body?.id;
    // garde anti-lockout : le SEUL admin ne peut pas se rétrograder ni se désactiver (409, aucun changement)
    const selfDemote = await f(`/api/auth/users/${adminId}`, { method: 'PUT', body: { role: 'membre' } });
    const selfDisable = await f(`/api/auth/users/${adminId}`, { method: 'PUT', body: { actif: false } });
    const selfNull = await f(`/api/auth/users/${adminId}`, { method: 'PUT', body: { actif: null } }); // bypass re-audit
    selfDemote.status === 409 && selfDisable.status === 409 && selfNull.status === 409
      ? ok('auth: dernier admin protégé contre le lockout (409 rétrograde + désactive + actif:null)')
      : ko(`auth: lockout admin NON protégé (demote=${selfDemote.status}, disable=${selfDisable.status}, null=${selfNull.status})`);

    // b) Onboarding (authentifié) : meta + round-trip + cascade + échéances + validations
    const meta = await jget('/api/onboarding/meta');
    meta.status === 200 && Array.isArray(meta.body?.services) ? ok('GET /api/onboarding/meta (services + parties)') : ko(`/api/onboarding/meta inattendu (status ${meta.status})`);

    const cre = await f('/api/onboarding/collaborateurs', { method: 'POST', body: { prenom: 'Smoke', nom: 'Test' } });
    const fiche = await cre.json().catch(() => null);
    if (cre.status === 201 && fiche?.id && fiche.parties?.length > 0) {
      ok(`POST collaborateur → id=${fiche.id}, ${fiche.parties.length} parties générées`);
      const relu = await jget(`/api/onboarding/collaborateurs/${fiche.id}`);
      relu.status === 200 && relu.body?.id === fiche.id ? ok('GET fiche relue') : ko(`GET fiche relue (status ${relu.status})`);
      const premiereTache = fiche.parties.flatMap((p) => p.taches)[0];
      if (premiereTache) {
        const patch = await f(`/api/onboarding/taches/${premiereTache.id}`, { method: 'PATCH', body: { fait: true } });
        const tj = await patch.json().catch(() => null);
        patch.status === 200 && tj?.fait === true ? ok('PATCH tâche (fait=true)') : ko(`PATCH tâche (status ${patch.status})`);
      }
      const del = await f(`/api/onboarding/collaborateurs/${fiche.id}`, { method: 'DELETE' });
      del.status === 204 ? ok('DELETE collaborateur (204)') : ko(`DELETE status ${del.status}`);
    } else {
      ko(`POST collaborateur inattendu (status ${cre.status})`);
    }

    const patchDemande = (id, body) => f(`/api/onboarding/demandes/${id}`, { method: 'PATCH', body }).then((r) => r.json().catch(() => null));
    const creA = await f('/api/onboarding/collaborateurs', { method: 'POST', body: { prenom: 'Acces', nom: 'Test' } });
    const ficheA = await creA.json().catch(() => null);
    const dem = ficheA?.demandes?.[0];
    if (dem) {
      const act = await patchDemande(dem.id, { demande: true });
      const sec = act?.fiche?.parties?.find((p) => p.cle === 'acces');
      sec && sec.taches.length > 0 && sec.taches.every((t) => t.demande_id === dem.id)
        ? ok(`demande activée → section accès (${sec.taches.length} tâches générées)`)
        : ko('activation demande : section accès / tâches non générées');
      const sousTache = act.fiche.parties.find((p) => p.cle === 'acces').taches[0];
      await f(`/api/onboarding/taches/${sousTache.id}`, { method: 'PATCH', body: { fait: true } });
      const bloque = await patchDemande(dem.id, { demande: false });
      bloque?.confirmation?.faites === 1 && bloque.fiche === undefined
        ? ok('garde-fou : retrait bloqué tant que non confirmé (tâche faite)')
        : ko('garde-fou retrait : confirmation attendue non renvoyée');
      const retire = await patchDemande(dem.id, { demande: false, confirmer: true });
      retire?.demande === false && !retire.fiche.parties.some((p) => p.cle === 'acces')
        ? ok('retrait confirmé : section accès supprimée')
        : ko('retrait confirmé : section accès toujours présente');
    } else {
      ko('création fiche pour test accès : aucune demande trouvée');
    }
    await f(`/api/onboarding/collaborateurs/${ficheA.id}`, { method: 'DELETE' });

    const creE = await f('/api/onboarding/collaborateurs', { method: 'POST', body: { prenom: 'Echeance', nom: 'Test', date_entree: '2099-01-10' } });
    const ficheE = await creE.json().catch(() => null);
    const tachesE = ficheE?.parties?.flatMap((p) => p.taches) || [];
    const tAD = tachesE.find((t) => t.libelle === 'Création du compte AD');
    const tMat = tachesE.find((t) => t.libelle === 'Valider le besoin matériel avec la direction');
    tAD?.echeance === '2099-01-10' && tMat?.echeance === '2099-01-03' && tAD.en_retard === false
      ? ok('feature #2 : échéances calculées (J / J-7) et pas « en retard » si futures')
      : ko(`feature #2 : échéances inattendues (AD=${tAD?.echeance}, Mat=${tMat?.echeance})`);
    await f(`/api/onboarding/collaborateurs/${ficheE.id}`, { method: 'DELETE' });

    const bad = await f('/api/onboarding/collaborateurs', { method: 'POST', body: { prenom: 'X', service: 'PasUnService' } });
    bad.status === 400 ? ok('fix #7 : POST avec service hors liste rejeté (400)') : ko(`fix #7 : 400 attendu, reçu ${bad.status}`);

    // #1 : input nom nettoyé (retours de ligne/contrôle retirés, plafonné) — ne casse pas les cards
    const sale = await f('/api/onboarding/collaborateurs', { method: 'POST', body: { prenom: 'Inj', nom: 'A'.repeat(300) + '\nLigne2\tTab' } });
    const saleJ = await sale.json().catch(() => null);
    sale.status === 201 && saleJ && !/[\r\n\t]/.test(saleJ.nom) && saleJ.nom.length <= 120
      ? ok('onboarding #1 : nom nettoyé (sans saut de ligne, plafonné ≤120)')
      : ko(`onboarding #1 : input non nettoyé (len=${saleJ?.nom?.length}, ctrl=${/[\r\n\t]/.test(saleJ?.nom || '')})`);
    if (saleJ?.id) await f(`/api/onboarding/collaborateurs/${saleJ.id}`, { method: 'DELETE' });

    const liste = await jget('/api/onboarding/collaborateurs');
    Array.isArray(liste.body) && liste.body.every((c) => c.progression && typeof c.progression.total === 'number')
      ? ok('fix #1 : GET /collaborateurs renvoie la progression agrégée')
      : ko('fix #1 : progression manquante/mal formée');

    // c) Docs (authentifié)
    const docs = await jget('/api/docs/liens');
    docs.status === 200 && Array.isArray(docs.body) && docs.body.length > 0
      ? ok(`GET /api/docs/liens (section démo, ${docs.body.length} liens)`)
      : ko(`/api/docs/liens inattendu (status ${docs.status})`);

    // d) Comptes : l'admin crée des comptes (= registre fusionné) -----------
    const creerCompte = (nom, email, role = 'membre', service = '') =>
      f('/api/auth/users', { method: 'POST', body: { nom, email, motDePasse: 'motdepasse', role, service } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const agentR = await creerCompte('Smoke Agent', 'agent@amitel.fr', 'membre', 'Développement');
    const autreR = await creerCompte('Autre Personne', 'autre@amitel.fr', 'membre', 'Support');
    const agent = agentR.body, autre = autreR.body;
    agentR.status === 201 && agent?.id && autreR.status === 201 && autre?.id
      ? ok(`comptes: admin crée 2 comptes (registre) — agent#${agent.id}, autre#${autre.id}`)
      : ko(`comptes: création échouée (agent ${agentR.status}, autre ${autreR.status})`);
    const reg = await jget('/api/ticketing/personnes');
    Array.isArray(reg.body) && reg.body.some((p) => p.id === agent.id)
      ? ok('comptes: les comptes alimentent le registre ticketing (assignables)')
      : ko('comptes: registre ticketing ne reflète pas les comptes');
    // garde admin : un non-admin ne crée pas de compte
    const cAgent = (await login('agent@amitel.fr', 'motdepasse')).cookie;
    const tentative = await f('/api/auth/users', { method: 'POST', cookie: cAgent, body: { nom: 'X', email: 'x@amitel.fr', motDePasse: 'motdepasse' } });
    tentative.status === 403 ? ok('comptes: création réservée à l\'admin (403 pour un membre)') : ko(`comptes: non-admin a pu créer (status ${tentative.status})`);
    const cAutre = (await login('autre@amitel.fr', 'motdepasse')).cookie;

    // e) Ticketing : cycle de vie (admin) ----------------------------------
    const projR = await f('/api/ticketing/projets', { method: 'POST', body: { cle: 'IT', nom: 'Informatique', membres: [agent.id] } });
    const proj = await projR.json().catch(() => null);
    projR.status === 201 && proj?.cle === 'IT' && proj.statuts?.length === 5
      ? ok(`ticketing: projet créé (clé ${proj.cle}, ${proj.statuts.length} statuts)`)
      : ko(`ticketing: création projet (status ${projR.status})`);
    const roleCreateur = proj.membres?.find((m) => m.person_id === adminId)?.role;
    const roleAgent = proj.membres?.find((m) => m.person_id === agent.id)?.role;
    roleCreateur === 'admin' && roleAgent === 'membre'
      ? ok('ticketing: rôles projet (créateur=admin, membre ajouté=membre)')
      : ko(`ticketing: rôles membres incorrects (créateur=${roleCreateur}, agent=${roleAgent})`);

    const tkR = await f(`/api/ticketing/projets/${proj.id}/tickets`, { method: 'POST', body: { titre: 'Écran HS', type: 'incident', priorite: 'haute', assignee_id: agent.id } });
    const tk = await tkR.json().catch(() => null);
    tkR.status === 201 && tk?.cle === 'IT-1' && tk.assignee?.id === agent.id && tk.echeance
      ? ok(`ticketing: ticket créé (${tk.cle}, assigné agent, échéance SLA)`)
      : ko(`ticketing: création ticket (status ${tkR.status}, cle ${tk?.cle})`);

    const transR = await f(`/api/ticketing/tickets/${tk.id}`, { method: 'PATCH', body: { statut: 'en_cours' } });
    const trans = await transR.json().catch(() => null);
    transR.status === 200 && trans?.statut === 'en_cours' && trans.historique?.some((h) => h.champ === 'statut' && h.nouvelle === 'en_cours')
      ? ok('ticketing: transition statut + historique journalisé')
      : ko(`ticketing: transition statut (status ${transR.status})`);

    const comR = await f(`/api/ticketing/tickets/${tk.id}/commentaires`, { method: 'POST', body: { corps: 'Pris en charge.' } });
    const com = await comR.json().catch(() => null);
    comR.status === 201 && com?.commentaires?.length === 1 ? ok('ticketing: commentaire ajouté') : ko(`ticketing: commentaire (status ${comR.status})`);

    const listeT = await jget('/api/ticketing/tickets?statut=en_cours');
    Array.isArray(listeT.body) && listeT.body.some((t) => t.id === tk.id) ? ok('ticketing: liste filtrée par statut') : ko('ticketing: liste filtrée');

    // notifs : l'agent (assigné) lit SES notifs ; un autre compte → 403
    const notifAgent = await jget(`/api/ticketing/personnes/${agent.id}/notifications`, cAgent);
    notifAgent.status === 200 && notifAgent.body?.some((n) => n.type === 'assignation') && notifAgent.body?.some((n) => n.type === 'commentaire')
      ? ok('ticketing: notifs in-app (assignation + commentaire) pour l\'assigné')
      : ko(`ticketing: notifs assigné (status ${notifAgent.status})`);
    const notifAutre = await f(`/api/ticketing/personnes/${agent.id}/notifications`, { cookie: cAutre });
    notifAutre.status === 403 ? ok('ticketing: notifs d\'autrui refusées (403)') : ko(`ticketing: fuite notif cross-compte (status ${notifAutre.status})`);

    // validations
    const badStatut = await f(`/api/ticketing/tickets/${tk.id}`, { method: 'PATCH', body: { statut: 'zombie' } });
    badStatut.status === 400 ? ok('ticketing: statut hors workflow rejeté (400)') : ko(`ticketing: statut invalide (status ${badStatut.status})`);
    const badAssignee = await f(`/api/ticketing/projets/${proj.id}/tickets`, { method: 'POST', body: { titre: 'x', assignee_id: 99999 } });
    badAssignee.status === 400 ? ok('ticketing: assignee inexistant rejeté (400)') : ko(`ticketing: assignee inexistant (status ${badAssignee.status})`);
    const badCouleur = await f('/api/ticketing/projets', { method: 'POST', body: { cle: 'XX', nom: 'X', couleur: 'red;url(//x)' } });
    badCouleur.status === 400 ? ok('ticketing: couleur non-hex rejetée (400)') : ko(`ticketing: couleur libre (status ${badCouleur.status})`);

    // f) Confidentialité RÉELLE par compte (projet privé) -------------------
    const privR = await f('/api/ticketing/projets', { method: 'POST', body: { cle: 'RH', nom: 'RH confidentiel', prive: true, membres: [agent.id] } });
    const priv = await privR.json().catch(() => null);
    const vusAgent = await jget('/api/ticketing/projets', cAgent);
    const vusAutre = await jget('/api/ticketing/projets', cAutre);
    const agentVoit = Array.isArray(vusAgent.body) && vusAgent.body.some((p) => p.id === priv.id);
    const autreMasque = Array.isArray(vusAutre.body) && !vusAutre.body.some((p) => p.id === priv.id);
    agentVoit && autreMasque ? ok('ticketing: projet privé visible MEMBRE / masqué non-membre (par compte)') : ko(`ticketing: confidentialité liste (membre=${agentVoit}, masqué=${autreMasque})`);

    const privTkR = await f(`/api/ticketing/projets/${priv.id}/tickets`, { method: 'POST', body: { titre: 'Dossier RH', priorite: 'haute' } });
    const privTk = await privTkR.json().catch(() => null);
    const accAgent = await f(`/api/ticketing/tickets/${privTk.id}`, { cookie: cAgent });
    const accAutreTk = await f(`/api/ticketing/tickets/${privTk.id}`, { cookie: cAutre });
    const accAutreProj = await f(`/api/ticketing/projets/${priv.id}`, { cookie: cAutre });
    accAgent.status === 200 && accAutreTk.status === 404 && accAutreProj.status === 404
      ? ok('ticketing: accès unitaire privé — membre 200 / non-membre 404 (ticket+projet)')
      : ko(`ticketing: FUITE accès unitaire (membre=${accAgent.status}, autre-tk=${accAutreTk.status}, autre-proj=${accAutreProj.status})`);

    // mutations privées par un non-membre → 404 (incl. anti-escalade ajout-membre)
    const mPatch = await f(`/api/ticketing/tickets/${privTk.id}`, { method: 'PATCH', cookie: cAutre, body: { statut: 'en_cours' } });
    const mDel = await f(`/api/ticketing/tickets/${privTk.id}`, { method: 'DELETE', cookie: cAutre });
    const mCom = await f(`/api/ticketing/tickets/${privTk.id}/commentaires`, { method: 'POST', cookie: cAutre, body: { corps: 'intrus' } });
    const mPut = await f(`/api/ticketing/projets/${priv.id}`, { method: 'PUT', cookie: cAutre, body: { nom: 'pirate' } });
    const mMembre = await f(`/api/ticketing/projets/${priv.id}/membres`, { method: 'POST', cookie: cAutre, body: { person_id: autre.id } });
    [mPatch, mDel, mCom, mPut, mMembre].every((r) => r.status === 404)
      ? ok('ticketing: mutations privées bloquées non-membre (patch/del/com/put/ajout-membre = anti-escalade)')
      : ko(`ticketing: FUITE mutation privée (patch=${mPatch.status} del=${mDel.status} com=${mCom.status} put=${mPut.status} membre=${mMembre.status})`);
    const memPatch = await f(`/api/ticketing/tickets/${privTk.id}`, { method: 'PATCH', cookie: cAgent, body: { statut: 'en_cours' } });
    memPatch.status === 200 ? ok('ticketing: membre peut muter son projet privé (pas de régression)') : ko(`ticketing: régression membre privé (status ${memPatch.status})`);

    // #3 drag-to-assign : ticket LIBRE déplacé par un membre -> auto-assigné ; déplacer celui d'un autre -> 403 ; admin exempt
    const libreR = await f(`/api/ticketing/projets/${proj.id}/tickets`, { method: 'POST', body: { titre: 'À prendre' } });
    const libre = await libreR.json().catch(() => null);
    const prise = await f(`/api/ticketing/tickets/${libre.id}`, { method: 'PATCH', cookie: cAgent, body: { statut: 'en_cours' } });
    const priseJ = await prise.json().catch(() => null);
    prise.status === 200 && priseJ?.assignee?.id === agent.id
      ? ok('ticketing #3 : ticket libre déplacé → auto-assigné au déplaceur')
      : ko(`ticketing #3 : drag-to-assign (status ${prise.status}, assignee ${priseJ?.assignee?.id})`);
    const vol = await f(`/api/ticketing/tickets/${libre.id}`, { method: 'PATCH', cookie: cAutre, body: { statut: 'en_attente' } });
    vol.status === 403 ? ok('ticketing #3 : déplacer le ticket d\'un autre = interdit (403)') : ko(`ticketing #3 : vol de ticket non bloqué (status ${vol.status})`);
    const adminMove = await f(`/api/ticketing/tickets/${libre.id}`, { method: 'PATCH', body: { statut: 'a_faire' } });
    adminMove.status === 200 ? ok('ticketing #3 : admin peut déplacer tout ticket') : ko(`ticketing #3 : admin move (status ${adminMove.status})`);

    const stats = await jget('/api/ticketing/stats');
    stats.status === 200 && typeof stats.body?.total === 'number' && stats.body.parStatut
      ? ok(`ticketing: stats agrégées (${stats.body.total} ticket(s))`)
      : ko(`ticketing: stats (status ${stats.status})`);

    const delTk = await f(`/api/ticketing/tickets/${tk.id}`, { method: 'DELETE' });
    delTk.status === 204 ? ok('ticketing: suppression ticket (204, cascade)') : ko(`ticketing: suppression (status ${delTk.status})`);

    // g) Durcissement : throttle anti-brute-force sur le login (en dernier — neutralise l'IP après coup)
    let throttle429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await login('inconnu@amitel.fr', 'x');
      if (r.status === 429) { throttle429 = true; break; }
    }
    throttle429 ? ok('auth: throttle login après tentatives répétées (429)') : ko('auth: throttle login absent (brute-force non limité)');

    const inconnu = await jget('/api/onboarding/nexistepas');
    inconnu.status === 404 ? ok('route API inconnue → 404 JSON') : ko(`route inconnue status ${inconnu.status}`);
  }
} catch (e) {
  ko(`exception: ${e.message}\n${e.stack}`);
} finally {
  nettoyer();
}

console.log(`\n${echecs === 0 ? '✅ SMOKE VERT' : `❌ SMOKE ROUGE (${echecs} échec(s))`}\n`);
process.exit(echecs === 0 ? 0 : 1);
