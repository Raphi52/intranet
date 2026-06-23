/**
 * Test de la MIGRATION tk_people -> users (le morceau le plus risqué de l'auth).
 *
 * Pré-crée une base à l'ANCIEN schéma (tk_people + FK vers tk_people, avec données),
 * démarre le serveur (qui migre au boot), puis vérifie EN BASE : tk_people supprimée,
 * personnes recopiées dans users (ids préservés), FK des tickets/membres repointées.
 * Out-of-model (lecture SQLite directe). Lancement : node tools/test-migration.mjs
 */
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = 3996;
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = mkdtempSync(join(tmpdir(), 'portail-mig-'));
const DB = join(dbDir, 'old.db');

let echecs = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const ko = (m) => { console.error(`  ❌ ${m}`); echecs++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1) Fabrique une base à l'ANCIEN schéma (tk_people + FK dessus) + données ---
console.log('\n[migration] pré-seed base ancien-schéma');
{
  const db = new Database(DB);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE tk_people (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', actif INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tk_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, cle TEXT NOT NULL UNIQUE, nom TEXT DEFAULT '', couleur TEXT DEFAULT '#C0392B', description TEXT DEFAULT '', prive INTEGER DEFAULT 0, archive INTEGER DEFAULT 0, seq INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), created_par TEXT DEFAULT '');
    CREATE TABLE tk_project_members (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE, person_id INTEGER NOT NULL REFERENCES tk_people(id) ON DELETE CASCADE, role TEXT DEFAULT 'membre', UNIQUE(project_id, person_id));
    CREATE TABLE tk_project_statuses (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE, cle TEXT NOT NULL, label TEXT NOT NULL, ordre INTEGER DEFAULT 0, terminal INTEGER DEFAULT 0, UNIQUE(project_id, cle));
    CREATE TABLE tk_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE, numero INTEGER NOT NULL, titre TEXT DEFAULT '', description TEXT DEFAULT '', type TEXT DEFAULT 'demande', priorite TEXT DEFAULT 'normale', statut TEXT DEFAULT 'a_faire', assignee_id INTEGER REFERENCES tk_people(id) ON DELETE SET NULL, demandeur TEXT DEFAULT '', echeance TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), created_par TEXT DEFAULT '', updated_par TEXT DEFAULT '', UNIQUE(project_id, numero));
    CREATE TABLE tk_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE, corps TEXT DEFAULT '', auteur TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tk_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE, champ TEXT NOT NULL, ancienne TEXT DEFAULT '', nouvelle TEXT DEFAULT '', auteur TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tk_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE, nom TEXT DEFAULT '', stocke TEXT DEFAULT '', taille INTEGER DEFAULT 0, mime TEXT DEFAULT '', auteur TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tk_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL REFERENCES tk_people(id) ON DELETE CASCADE, ticket_id INTEGER REFERENCES tk_tickets(id) ON DELETE CASCADE, type TEXT DEFAULT '', message TEXT DEFAULT '', lu INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
  `);
  // Données : une personne (id 5), un projet, un membre (5), un ticket assigné à 5, une notif pour 5.
  db.prepare(`INSERT INTO tk_people (id, nom, email) VALUES (5, 'Jean Ancien', 'jean@amitel.fr')`).run();
  db.prepare(`INSERT INTO tk_projects (id, cle, nom) VALUES (1, 'OLD', 'Projet historique')`).run();
  db.prepare(`INSERT INTO tk_project_members (project_id, person_id, role) VALUES (1, 5, 'admin')`).run();
  db.prepare(`INSERT INTO tk_project_statuses (project_id, cle, label, ordre, terminal) VALUES (1, 'a_faire', 'À faire', 0, 0)`).run();
  db.prepare(`INSERT INTO tk_tickets (id, project_id, numero, titre, assignee_id) VALUES (1, 1, 1, 'Ticket historique', 5)`).run();
  db.prepare(`INSERT INTO tk_notifications (person_id, ticket_id, type, message) VALUES (5, 1, 'assignation', 'Ticket assigné : Ticket historique')`).run();
  db.close();
}

// --- 2) Démarre le serveur (migre au boot) ---------------------------------
console.log('[migration] démarrage serveur (déclenche la migration)');
const serveur = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PORTAIL_DB: DB, ADMIN_EMAIL: 'admin@amitel.fr', ADMIN_PASSWORD: 'mig-123' },
  stdio: 'pipe',
});
let logServeur = '';
serveur.stdout.on('data', (d) => (logServeur += d));
serveur.stderr.on('data', (d) => (logServeur += d));

async function attendrePret(capMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch { /* */ }
    await wait(200);
  }
  return false;
}

try {
  if (!(await attendrePret())) {
    ko(`serveur non démarré (migration a peut-être planté)\n${logServeur}`);
  } else {
    ok('serveur démarré (migration exécutée au boot)');
    // --- 3) Vérif EN BASE (lecture directe, out-of-model) ------------------
    const db = new Database(DB, { readonly: true });
    const tkPeople = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tk_people'`).get();
    !tkPeople ? ok('tk_people supprimée après migration') : ko('tk_people existe encore (migration incomplète)');

    const u = db.prepare(`SELECT * FROM users WHERE id = 5`).get();
    u && u.nom === 'Jean Ancien' && u.email === 'jean@amitel.fr'
      ? ok('personne migrée dans users (id 5 préservé, nom/email)')
      : ko(`personne non migrée correctement (${JSON.stringify(u)})`);

    const tk = db.prepare(`SELECT assignee_id FROM tk_tickets WHERE id = 1`).get();
    tk && tk.assignee_id === 5 ? ok('FK ticket : assignee_id=5 préservé (repointé vers users)') : ko(`assignee_id ticket inattendu (${JSON.stringify(tk)})`);

    const mem = db.prepare(`SELECT person_id FROM tk_project_members WHERE project_id = 1`).get();
    mem && mem.person_id === 5 ? ok('FK membre : person_id=5 préservé') : ko(`membre inattendu (${JSON.stringify(mem)})`);

    const notif = db.prepare(`SELECT person_id FROM tk_notifications WHERE id = 1`).get();
    notif && notif.person_id === 5 ? ok('FK notif : person_id=5 préservé') : ko(`notif inattendue (${JSON.stringify(notif)})`);

    // La FK pointe-t-elle bien vers users maintenant ? (insérer un ticket assigné à un user créé)
    const fk = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tk_tickets'`).get();
    fk && /REFERENCES users\(id\)/.test(fk.sql) ? ok('schéma tk_tickets : FK assignee_id -> users(id)') : ko('FK tk_tickets ne pointe pas vers users');
    db.close();
  }
} catch (e) {
  ko(`exception: ${e.message}`);
} finally {
  // Teardown soigné (évite l'assertion libuv UV_HANDLE_CLOSING au exit sur Windows) :
  // détache les pipes du process enfant AVANT de le tuer, puis sortie naturelle via exitCode.
  try { serveur.stdout?.removeAllListeners(); serveur.stderr?.removeAllListeners(); serveur.stdout?.destroy(); serveur.stderr?.destroy(); } catch { /* */ }
  try { serveur.kill(); serveur.unref(); } catch { /* */ }
  await wait(300);
  try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* */ }
}

console.log(`\n${echecs === 0 ? '✅ MIGRATION OK' : `❌ MIGRATION ROUGE (${echecs} échec(s))`}\n`);
process.exitCode = echecs === 0 ? 0 : 1;
