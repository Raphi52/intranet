/** Section ONBOARDING — accès à son API REST (préfixe /api/onboarding). */

import { requete } from '../../core/http.js';

const BASE = '/api/onboarding';

export const api = {
  meta: () => requete(`${BASE}/meta`),

  listerCollaborateurs: () => requete(`${BASE}/collaborateurs`),
  getFiche: (id) => requete(`${BASE}/collaborateurs/${id}`),
  creerCollaborateur: (data) =>
    requete(`${BASE}/collaborateurs`, { method: 'POST', body: JSON.stringify(data) }),
  majIdentite: (id, data) =>
    requete(`${BASE}/collaborateurs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  supprimerCollaborateur: (id) => requete(`${BASE}/collaborateurs/${id}`, { method: 'DELETE' }),

  majTache: (id, data) =>
    requete(`${BASE}/taches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  majDemande: (id, data) =>
    requete(`${BASE}/demandes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
