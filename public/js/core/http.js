/** Wrapper fetch générique du portail (partagé par toutes les sections). */

import { badgeOperateur } from './identite.js';

export async function requete(url, options = {}) {
  // Signature de l'opérateur courant : en-tête X-Operateur (badge « Prénom N. »,
  // encodé pour rester ASCII). Le serveur l'attribue aux actions.
  const badge = badgeOperateur();
  const reponse = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(badge ? { 'X-Operateur': encodeURIComponent(badge) } : {}),
      ...(options.headers || {}),
    },
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
