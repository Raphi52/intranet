/** Cache des métadonnées chargées une seule fois au démarrage. */
import { api } from './api.js';

export const store = { meta: null };

export async function chargerMeta() {
  if (!store.meta) {
    store.meta = await api.meta();
  }
  return store.meta;
}
