/**
 * Section DÉMO — « Process & docs internes ».
 *
 * Squelette volontairement minimal : sa SEULE raison d'être est de PROUVER
 * l'extensibilité du portail — elle est ajoutée en créant ce dossier + 1 ligne
 * dans `server/sections/index.js`, SANS toucher au code de l'onboarding.
 *
 * Contenu = quelques liens internes statiques (pas de base de données).
 * À remplacer par la vraie logique le jour où cette section sera développée.
 */

import { Router } from 'express';

const LIENS = [
  { titre: 'Procédures internes', url: '#', description: 'Modes opératoires et process de l’équipe.' },
  { titre: 'Outils Amitel', url: '#', description: 'Accès rapide aux applications métier.' },
  { titre: 'Base de connaissances', url: '#', description: 'FAQ et documentation partagée.' },
];

const router = Router();
router.get('/liens', (_req, res) => res.json(LIENS));

export default {
  id: 'docs',
  label: 'Docs internes',
  icon: '📚',
  description: 'Procédures, outils et base de connaissances (à venir).',
  basePath: '/api/docs',
  register(app) {
    // basePath = source unique du préfixe. Section à 1 route → router défini en
    // ligne ici ; extraire dans un routes.js dédié dès qu'il y aura >1 route.
    app.use(this.basePath, router);
  },
};
