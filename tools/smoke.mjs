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
