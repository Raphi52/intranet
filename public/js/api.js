/** Petites fonctions d'accès à l'API REST du serveur. */

async function requete(url, options = {}) {
  const reponse = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!reponse.ok) {
    let message = `Erreur ${reponse.status}`;
    try {
      const corps = await reponse.json();
      if (corps?.erreur) message = corps.erreur;
    } catch {
      /* réponse non-JSON, on garde le message par défaut */
    }
    throw new Error(message);
  }
  if (reponse.status === 204) return null;
  return reponse.json();
}

export const api = {
  meta: () => requete('/api/meta'),

  listerCollaborateurs: () => requete('/api/collaborateurs'),
  getFiche: (id) => requete(`/api/collaborateurs/${id}`),
  creerCollaborateur: (data) =>
    requete('/api/collaborateurs', { method: 'POST', body: JSON.stringify(data) }),
  majIdentite: (id, data) =>
    requete(`/api/collaborateurs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  supprimerCollaborateur: (id) =>
    requete(`/api/collaborateurs/${id}`, { method: 'DELETE' }),

  majTache: (id, data) =>
    requete(`/api/taches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  majDemande: (id, data) =>
    requete(`/api/demandes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
