/** Section TICKETING — cache léger (métadonnées + registre + projets). */

import { api } from './api.js';

export const store = { meta: null, personnes: [], projets: [] };

/** Garantit meta chargée (référentiels statiques). */
export async function chargerMeta() {
  if (!store.meta) store.meta = await api.meta();
  return store.meta;
}

/** Recharge personnes + projets (après une mutation). */
export async function rafraichir() {
  const [personnes, projets] = await Promise.all([api.listerPersonnes(), api.listerProjets()]);
  store.personnes = personnes;
  store.projets = projets;
  return store;
}

export async function charger() {
  await chargerMeta();
  await rafraichir();
  return store;
}

export const personneNom = (id) => store.personnes.find((p) => p.id === id)?.nom || '';

// Libellés de priorité (source unique, partagée board + détail).
export const PRIO_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute', critique: 'Critique' };
