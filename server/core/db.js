/**
 * Connexion SQLite PARTAGÉE par tout le portail.
 *
 * Une seule base, un seul fichier — chaque section (onboarding, docs, …) y
 * déclare SES propres tables via son module `db.js`. C'est le socle commun
 * réutilisable : aucune section ne rouvre la base elle-même.
 *
 * Le chemin du fichier est surchargé par la variable d'env `PORTAIL_DB`
 * (utilisé par les tests/smoke pour pointer sur une base jetable).
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

// Nom de fichier conservé (onboarding.db) pour ne PAS orpheliner les données
// existantes — c'est le même fichier, partagé désormais par toutes les sections.
const DB_PATH = process.env.PORTAIL_DB || join(DATA_DIR, 'onboarding.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
