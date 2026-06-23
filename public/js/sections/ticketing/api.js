/** Section TICKETING — accès à son API REST (préfixe /api/ticketing). */

import { requete } from '../../core/http.js';

const BASE = '/api/ticketing';
const qs = (o = {}) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null);
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
};

export const api = {
  meta: () => requete(`${BASE}/meta`),
  stats: () => requete(`${BASE}/stats`),

  // Personnes (registre)
  listerPersonnes: () => requete(`${BASE}/personnes`),
  creerPersonne: (data) => requete(`${BASE}/personnes`, { method: 'POST', body: JSON.stringify(data) }),
  majPersonne: (id, data) => requete(`${BASE}/personnes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  supprimerPersonne: (id) => requete(`${BASE}/personnes/${id}`, { method: 'DELETE' }),
  notifications: (personId) => requete(`${BASE}/personnes/${personId}/notifications`),

  // Projets
  listerProjets: () => requete(`${BASE}/projets`),
  getProjet: (id) => requete(`${BASE}/projets/${id}`),
  creerProjet: (data) => requete(`${BASE}/projets`, { method: 'POST', body: JSON.stringify(data) }),
  majProjet: (id, data) => requete(`${BASE}/projets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  supprimerProjet: (id) => requete(`${BASE}/projets/${id}`, { method: 'DELETE' }),
  ajouterMembre: (id, data) => requete(`${BASE}/projets/${id}/membres`, { method: 'POST', body: JSON.stringify(data) }),
  retirerMembre: (id, personId) => requete(`${BASE}/projets/${id}/membres/${personId}`, { method: 'DELETE' }),

  // Tickets
  listerTickets: (filtres) => requete(`${BASE}/tickets${qs(filtres)}`),
  getTicket: (id) => requete(`${BASE}/tickets/${id}`),
  creerTicket: (projetId, data) => requete(`${BASE}/projets/${projetId}/tickets`, { method: 'POST', body: JSON.stringify(data) }),
  majTicket: (id, data) => requete(`${BASE}/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  supprimerTicket: (id) => requete(`${BASE}/tickets/${id}`, { method: 'DELETE' }),
  commenter: (id, corps) => requete(`${BASE}/tickets/${id}/commentaires`, { method: 'POST', body: JSON.stringify({ corps }) }),
};
