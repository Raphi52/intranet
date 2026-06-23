/**
 * Smoke test du Portail Amitel — signal de boucle (hors-modèle).
 *
 * 1) Vérifie la SYNTAXE de tous les modules JS (node --check) — une erreur de
 *    syntaxe rend la SPA blanche sans rien casser au build (il n'y a pas de build).
 * 2) Démarre un serveur ÉPHÉMÈRE (port dédié + base SQLite jetable) et teste le
 *    parcours réel : shell, section onboarding (round-trip DB complet) et section
 *    démo (preuve d'extensibilité).
 *
 * Sortie : exit 0 = tout vert ; exit 1 = au moins un échec (détaillé).
 * Lancement : node tools/smoke.mjs
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

console.log('\n[2/2] Parcours HTTP (serveur éphémère)');
const serveur = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PORTAIL_DB: DB },
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
    await attendre(200); // fréquence de polling, pas un délai fixe
  }
  return false;
}

async function jget(url) {
  const r = await fetch(BASE + url);
  return { status: r.status, body: await r.json().catch(() => null) };
}

function nettoyer() {
  try {
    serveur.kill();
  } catch {
    /* ignore */
  }
  try {
    rmSync(dbDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

try {
  if (!(await attendrePret())) {
    ko(`le serveur n'a pas démarré en 15s\n${logServeur}`);
  } else {
    ok('serveur démarré');

    // a) Shell servi + neutre (titre Amitel, conteneur SPA)
    const racine = await fetch(`${BASE}/`);
    const html = await racine.text();
    if (racine.status === 200 && /Portail Amitel/.test(html) && /id="app"/.test(html)) {
      ok('shell HTML servi (titre « Portail Amitel »)');
    } else {
      ko(`shell HTML inattendu (status ${racine.status})`);
    }

    // b) Entrée front servie
    const appjs = await fetch(`${BASE}/js/core/app.js`);
    appjs.status === 200 ? ok('/js/core/app.js servi') : ko(`/js/core/app.js status ${appjs.status}`);

    // c) Section onboarding : meta
    const meta = await jget('/api/onboarding/meta');
    if (meta.status === 200 && Array.isArray(meta.body?.services) && Array.isArray(meta.body?.parties)) {
      ok('GET /api/onboarding/meta (services + parties)');
    } else {
      ko(`/api/onboarding/meta inattendu (status ${meta.status})`);
    }

    // d) Round-trip DB : créer → lire → cocher une tâche → supprimer
    const cre = await fetch(`${BASE}/api/onboarding/collaborateurs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom: 'Smoke', nom: 'Test' }),
    });
    const fiche = await cre.json().catch(() => null);
    if (cre.status === 201 && fiche?.id && Array.isArray(fiche.parties) && fiche.parties.length > 0) {
      ok(`POST collaborateur → id=${fiche.id}, ${fiche.parties.length} parties générées`);

      const relu = await jget(`/api/onboarding/collaborateurs/${fiche.id}`);
      relu.status === 200 && relu.body?.id === fiche.id
        ? ok('GET fiche relue')
        : ko(`GET fiche relue inattendu (status ${relu.status})`);

      const premiereTache = fiche.parties.flatMap((p) => p.taches)[0];
      if (premiereTache) {
        const patch = await fetch(`${BASE}/api/onboarding/taches/${premiereTache.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fait: true }),
        });
        const tj = await patch.json().catch(() => null);
        patch.status === 200 && tj?.fait === true
          ? ok('PATCH tâche (fait=true)')
          : ko(`PATCH tâche inattendu (status ${patch.status})`);
      }

      const del = await fetch(`${BASE}/api/onboarding/collaborateurs/${fiche.id}`, { method: 'DELETE' });
      del.status === 204 ? ok('DELETE collaborateur (204)') : ko(`DELETE status ${del.status}`);
    } else {
      ko(`POST collaborateur inattendu (status ${cre.status})`);
    }

    // d-bis) Demande d'accès → tâches de procédure (cascade + garde-fou)
    const patchDemande = (id, body) =>
      fetch(`${BASE}/api/onboarding/demandes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json().catch(() => null));

    const creA = await fetch(`${BASE}/api/onboarding/collaborateurs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom: 'Acces', nom: 'Test' }),
    });
    const ficheA = await creA.json().catch(() => null);
    const dem = ficheA?.demandes?.[0];
    if (dem) {
      // Activation → section « acces » créée avec ses sous-tâches
      const act = await patchDemande(dem.id, { demande: true });
      const sec = act?.fiche?.parties?.find((p) => p.cle === 'acces');
      if (act?.demande === true && sec && sec.taches.length > 0 && sec.taches.every((t) => t.demande_id === dem.id)) {
        ok(`demande activée → section accès (${sec.taches.length} tâches générées)`);
      } else {
        ko('activation demande : section accès / tâches non générées comme attendu');
      }

      // Cocher une sous-tâche puis tenter de retirer SANS confirmer → garde-fou
      const sousTache = act.fiche.parties.find((p) => p.cle === 'acces').taches[0];
      await fetch(`${BASE}/api/onboarding/taches/${sousTache.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fait: true }),
      });
      const bloque = await patchDemande(dem.id, { demande: false });
      bloque?.confirmation?.faites === 1 && bloque.fiche === undefined
        ? ok('garde-fou : retrait bloqué tant que non confirmé (tâche faite)')
        : ko('garde-fou retrait : confirmation attendue non renvoyée');

      // Confirmer → suppression, section accès disparaît
      const retire = await patchDemande(dem.id, { demande: false, confirmer: true });
      retire?.demande === false && !retire.fiche.parties.some((p) => p.cle === 'acces')
        ? ok('retrait confirmé : section accès supprimée')
        : ko('retrait confirmé : section accès toujours présente');
    } else {
      ko('création fiche pour test accès : aucune demande trouvée');
    }
    await fetch(`${BASE}/api/onboarding/collaborateurs/${ficheA.id}`, { method: 'DELETE' });

    // d-ter) Échéances projetées (feature #2 — date_entree + offset par libellé, calcul UTC)
    const creE = await fetch(`${BASE}/api/onboarding/collaborateurs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom: 'Echeance', nom: 'Test', date_entree: '2099-01-10' }),
    });
    const ficheE = await creE.json().catch(() => null);
    const tachesE = ficheE?.parties?.flatMap((p) => p.taches) || [];
    const tAD = tachesE.find((t) => t.libelle === 'Création du compte AD'); // offset 0
    const tMat = tachesE.find((t) => t.libelle === 'Valider le besoin matériel avec la direction'); // offset -7
    if (tAD?.echeance === '2099-01-10' && tMat?.echeance === '2099-01-03' && tAD.en_retard === false) {
      ok('feature #2 : échéances calculées (J / J-7) et pas « en retard » si futures');
    } else {
      ko(`feature #2 : échéances inattendues (AD=${tAD?.echeance}, Mat=${tMat?.echeance}, retard=${tAD?.en_retard})`);
    }
    await fetch(`${BASE}/api/onboarding/collaborateurs/${ficheE.id}`, { method: 'DELETE' });

    // d-quater) Validation POST (#7) : service hors liste fermée → 400
    const bad = await fetch(`${BASE}/api/onboarding/collaborateurs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom: 'X', service: 'PasUnService' }),
    });
    bad.status === 400
      ? ok('fix #7 : POST avec service hors liste rejeté (400)')
      : ko(`fix #7 : 400 attendu pour service invalide, reçu ${bad.status}`);

    // d-quinquies) Liste dashboard (#1) : progression agrégée par fiche présente
    const liste = await jget('/api/onboarding/collaborateurs');
    const listeOk =
      Array.isArray(liste.body) &&
      liste.body.every((c) => c.progression && typeof c.progression.total === 'number');
    listeOk
      ? ok('fix #1 : GET /collaborateurs renvoie la progression agrégée (JOIN, plus de N+1)')
      : ko('fix #1 : progression manquante/mal formée dans la liste');

    // e) Section DÉMO (preuve d'extensibilité) : ajoutée sans toucher onboarding
    const docs = await jget('/api/docs/liens');
    const docsValide =
      docs.status === 200 &&
      Array.isArray(docs.body) &&
      docs.body.length > 0 &&
      docs.body.every((l) => l && typeof l.titre === 'string' && l.titre.length > 0);
    docsValide
      ? ok(`GET /api/docs/liens (section démo, ${docs.body.length} liens structurés)`)
      : ko(`/api/docs/liens inattendu (status ${docs.status})`);

    // g) Section TICKETING : registre → projet → cycle de vie ticket complet
    // Opérateur réaliste = BADGE « Prénom N. » (la personne registre 'Smoke Agent' a pour badge 'Smoke A.').
    const opH = { 'Content-Type': 'application/json', 'X-Operateur': 'Smoke A.' };
    const jpost = (url, body, headers = opH) =>
      fetch(BASE + url, { method: 'POST', headers, body: JSON.stringify(body) });

    const persR = await jpost('/api/ticketing/personnes', { nom: 'Smoke Agent', email: 'smoke@amitel.fr' });
    const pers = await persR.json().catch(() => null);
    persR.status === 201 && pers?.id
      ? ok(`ticketing: personne registre créée (id=${pers.id})`)
      : ko(`ticketing: création personne (status ${persR.status})`);

    const projR = await jpost('/api/ticketing/projets', { cle: 'IT', nom: 'Informatique', membres: [pers?.id] });
    const proj = await projR.json().catch(() => null);
    projR.status === 201 && proj?.id && proj.cle === 'IT' && proj.statuts?.length === 5
      ? ok(`ticketing: projet créé (clé ${proj.cle}, ${proj.statuts.length} statuts seedés)`)
      : ko(`ticketing: création projet (status ${projR.status}, statuts ${proj?.statuts?.length})`);

    const tkR = await jpost(`/api/ticketing/projets/${proj.id}/tickets`, {
      titre: 'Écran HS', type: 'incident', priorite: 'haute', assignee_id: pers.id,
    });
    const tk = await tkR.json().catch(() => null);
    tkR.status === 201 && tk?.id && tk.cle === 'IT-1' && tk.assignee?.id === pers.id && tk.echeance
      ? ok(`ticketing: ticket créé (${tk.cle}, assigné, échéance SLA ${tk.echeance})`)
      : ko(`ticketing: création ticket (status ${tkR.status}, cle ${tk?.cle}, ech ${tk?.echeance})`);

    const transR = await fetch(`${BASE}/api/ticketing/tickets/${tk.id}`, {
      method: 'PATCH', headers: opH, body: JSON.stringify({ statut: 'en_cours' }),
    });
    const trans = await transR.json().catch(() => null);
    transR.status === 200 && trans?.statut === 'en_cours' &&
    trans.historique?.some((h) => h.champ === 'statut' && h.nouvelle === 'en_cours')
      ? ok('ticketing: transition statut + historique journalisé')
      : ko(`ticketing: transition statut (status ${transR.status})`);

    const comR = await jpost(`/api/ticketing/tickets/${tk.id}/commentaires`, { corps: 'Pris en charge.' });
    const com = await comR.json().catch(() => null);
    comR.status === 201 && com?.commentaires?.length === 1
      ? ok('ticketing: commentaire ajouté')
      : ko(`ticketing: commentaire (status ${comR.status})`);

    const listeT = await jget('/api/ticketing/tickets?statut=en_cours');
    Array.isArray(listeT.body) && listeT.body.some((t) => t.id === tk.id)
      ? ok('ticketing: liste filtrée par statut')
      : ko('ticketing: liste filtrée par statut');

    // notifs : assignation (création) + commentaire ; lecture réservée au propriétaire (badge « Smoke A. »)
    const notifR = await fetch(`${BASE}/api/ticketing/personnes/${pers.id}/notifications`, { headers: { 'X-Operateur': 'Smoke A.' } });
    const notifs = await notifR.json().catch(() => null);
    notifR.status === 200 && Array.isArray(notifs) && notifs.some((n) => n.type === 'assignation') && notifs.some((n) => n.type === 'commentaire')
      ? ok('ticketing: notifs in-app assignation + commentaire pour l\'assigné')
      : ko(`ticketing: notifs in-app (status ${notifR.status}, types ${Array.isArray(notifs) ? notifs.map((n) => n.type) : '?'})`);
    const notifAutre = await fetch(`${BASE}/api/ticketing/personnes/${pers.id}/notifications`, { headers: { 'X-Operateur': 'Autre P.' } });
    notifAutre.status === 403 ? ok('ticketing: notifs d\'autrui refusées (403)') : ko(`ticketing: fuite notif cross-personne (status ${notifAutre.status})`);

    // Validations renforcées (correctifs judge) : statut hors workflow, assignee inexistant, couleur libre
    const badStatut = await fetch(`${BASE}/api/ticketing/tickets/${tk.id}`, { method: 'PATCH', headers: opH, body: JSON.stringify({ statut: 'zombie' }) });
    badStatut.status === 400 ? ok('ticketing: statut hors workflow rejeté (400)') : ko(`ticketing: statut invalide accepté (status ${badStatut.status})`);
    const badAssignee = await jpost(`/api/ticketing/projets/${proj.id}/tickets`, { titre: 'x', assignee_id: 99999 });
    badAssignee.status === 400 ? ok('ticketing: assignee_id inexistant rejeté (400)') : ko(`ticketing: assignee inexistant accepté (status ${badAssignee.status})`);
    const badCouleur = await jpost('/api/ticketing/projets', { cle: 'XX', nom: 'X', couleur: 'red;url(//x)' });
    badCouleur.status === 400 ? ok('ticketing: couleur non-hex rejetée (400)') : ko(`ticketing: couleur libre acceptée (status ${badCouleur.status})`);

    // Projet privé : visible pour le membre, masqué pour un non-membre (honor-system)
    const privR = await jpost('/api/ticketing/projets', { cle: 'RH', nom: 'RH confidentiel', prive: true, membres: [pers.id] });
    const priv = await privR.json().catch(() => null);
    // L'opérateur réel n'envoie que son BADGE « Prénom N. » : membre « Smoke Agent » -> badge « Smoke A. ».
    const vusMembre = await (await fetch(`${BASE}/api/ticketing/projets`, { headers: { 'X-Operateur': 'Smoke A.' } })).json();
    const vusAutre = await (await fetch(`${BASE}/api/ticketing/projets`, { headers: { 'X-Operateur': 'Autre P.' } })).json();
    const membreVoit = Array.isArray(vusMembre) && vusMembre.some((p) => p.id === priv?.id);
    const autreMasque = Array.isArray(vusAutre) && !vusAutre.some((p) => p.id === priv?.id);
    membreVoit && autreMasque
      ? ok('ticketing: projet privé visible membre / masqué non-membre (liste)')
      : ko(`ticketing: confidentialité liste projet privé (membre=${membreVoit}, masqué=${autreMasque})`);

    // ACCÈS UNITAIRE (correctif judge) : un non-membre ne lit PAS un projet/ticket privé par id direct
    const privTkR = await jpost(`/api/ticketing/projets/${priv.id}/tickets`, { titre: 'Dossier RH confidentiel', priorite: 'haute' });
    const privTk = await privTkR.json().catch(() => null);
    const accMembre = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}`, { headers: { 'X-Operateur': 'Smoke A.' } });
    const accAutre = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}`, { headers: { 'X-Operateur': 'Autre P.' } });
    const projAutre = await fetch(`${BASE}/api/ticketing/projets/${priv.id}`, { headers: { 'X-Operateur': 'Autre P.' } });
    accMembre.status === 200 && accAutre.status === 404 && projAutre.status === 404
      ? ok('ticketing: accès unitaire privé bloqué pour non-membre (404 ticket + projet)')
      : ko(`ticketing: FUITE accès unitaire (membre=${accMembre.status}, ticket-autre=${accAutre.status}, projet-autre=${projAutre.status})`);

    // MUTATIONS privées bloquées pour non-membre + anti-escalade de privilège (correctif re-audit)
    const autreH = { 'Content-Type': 'application/json', 'X-Operateur': 'Autre P.' };
    const mPatch = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}`, { method: 'PATCH', headers: autreH, body: JSON.stringify({ statut: 'en_cours' }) });
    const mDel = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}`, { method: 'DELETE', headers: autreH });
    const mCom = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}/commentaires`, { method: 'POST', headers: autreH, body: JSON.stringify({ corps: 'intrus' }) });
    const mPut = await fetch(`${BASE}/api/ticketing/projets/${priv.id}`, { method: 'PUT', headers: autreH, body: JSON.stringify({ nom: 'pirate' }) });
    const mMembre = await fetch(`${BASE}/api/ticketing/projets/${priv.id}/membres`, { method: 'POST', headers: autreH, body: JSON.stringify({ person_id: pers.id }) });
    [mPatch, mDel, mCom, mPut, mMembre].every((r) => r.status === 404)
      ? ok('ticketing: mutations privées bloquées pour non-membre (404 patch/del/commentaire/put/ajout-membre = anti-escalade)')
      : ko(`ticketing: FUITE mutation privée (patch=${mPatch.status} del=${mDel.status} com=${mCom.status} put=${mPut.status} membre=${mMembre.status})`);
    const memPatch = await fetch(`${BASE}/api/ticketing/tickets/${privTk.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Operateur': 'Smoke A.' }, body: JSON.stringify({ statut: 'en_cours' }) });
    memPatch.status === 200 ? ok('ticketing: membre peut muter son projet privé (pas de régression)') : ko(`ticketing: régression mutation membre privé (status ${memPatch.status})`);

    const stats = await jget('/api/ticketing/stats');
    stats.status === 200 && typeof stats.body?.total === 'number' && stats.body.parStatut
      ? ok(`ticketing: stats agrégées (${stats.body.total} ticket(s), ${stats.body.enRetard} en retard)`)
      : ko(`ticketing: stats agrégées (status ${stats.status})`);

    const delTk = await fetch(`${BASE}/api/ticketing/tickets/${tk.id}`, { method: 'DELETE' });
    delTk.status === 204 ? ok('ticketing: suppression ticket (204, cascade)') : ko(`ticketing: suppression ticket (status ${delTk.status})`);

    // f) Route API inconnue → 404 JSON
    const inconnu = await jget('/api/onboarding/nexistepas');
    inconnu.status === 404 ? ok('route API inconnue → 404 JSON') : ko(`route inconnue status ${inconnu.status}`);
  }
} catch (e) {
  ko(`exception: ${e.message}`);
} finally {
  nettoyer();
}

console.log(`\n${echecs === 0 ? '✅ SMOKE VERT' : `❌ SMOKE ROUGE (${echecs} échec(s))`}\n`);
process.exit(echecs === 0 ? 0 : 1);
