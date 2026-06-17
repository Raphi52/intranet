/** Wrapper fetch générique du portail (partagé par toutes les sections). */

export async function requete(url, options = {}) {
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
