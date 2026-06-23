/** Wrapper fetch générique du portail (partagé par toutes les sections). */

export async function requete(url, options = {}) {
  // L'identité vient de la SESSION (cookie HttpOnly) : credentials:'include' l'envoie.
  // Plus d'en-tête falsifiable ; le serveur attribue les actions au compte connecté.
  const reponse = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  // Session absente/expirée : on signale au shell de réafficher l'écran de connexion.
  if (reponse.status === 401) {
    window.dispatchEvent(new CustomEvent('portail:401'));
    throw new Error('Session expirée — reconnectez-vous.');
  }
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
