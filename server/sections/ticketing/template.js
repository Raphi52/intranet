/**
 * Section TICKETING — modèle « métier » par défaut (centralisé, personnalisable).
 *
 * Comme l'onboarding centralise sa checklist ici, le ticketing centralise ses
 * valeurs par défaut : workflow (statuts), priorités, types, SLA. Un nouveau
 * projet est SEEDÉ avec ces statuts ; il peut ensuite diverger (config par projet).
 */

// --- Workflow par défaut : statuts ordonnés, dont les terminaux (= « résolu »).
// `cle` = stocké en base (stable) ; `label` = affiché ; `terminal` = ferme le ticket.
export const STATUTS_DEFAUT = [
  { cle: 'a_faire', label: 'À faire', ordre: 0, terminal: 0 },
  { cle: 'en_cours', label: 'En cours', ordre: 1, terminal: 0 },
  { cle: 'en_attente', label: 'En attente', ordre: 2, terminal: 0 },
  { cle: 'resolu', label: 'Résolu', ordre: 3, terminal: 1 },
  { cle: 'ferme', label: 'Fermé', ordre: 4, terminal: 1 },
];

// --- Priorités (ordre = sévérité croissante). Pilotent le SLA + le tri.
export const PRIORITES = ['basse', 'normale', 'haute', 'critique'];
export const PRIORITE_DEFAUT = 'normale';

// --- Types de ticket (liste fermée, extensible ici).
export const TYPES = ['incident', 'demande', 'tache', 'question'];
export const TYPE_DEFAUT = 'demande';

// --- Rôles dans un projet (honor-system, pas de vrai contrôle d'accès).
export const ROLES = ['admin', 'agent', 'membre'];
export const ROLE_DEFAUT = 'membre';

// --- SLA : délai cible (en HEURES) avant échéance, par priorité.
// L'échéance d'un ticket = date de création + ce délai (si pas d'échéance explicite).
export const SLA_HEURES = {
  critique: 4,
  haute: 24,
  normale: 72,
  basse: 168,
};

// Couleur projet par défaut (charte Amitel : rouge). Palette indicative pour l'UI.
export const COULEUR_DEFAUT = '#C0392B';
export const COULEURS = ['#C0392B', '#2980B9', '#27AE60', '#8E44AD', '#D35400', '#16A085', '#2C3E50'];
