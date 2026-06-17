/** Cache des métadonnées onboarding (chargées une seule fois, sans course). */
import { api } from './api.js';

export const store = { meta: null };

let enCours = null; // promesse en vol, partagée par les appels concurrents

export async function chargerMeta() {
  if (store.meta) return store.meta;
  if (!enCours) {
    enCours = api
      .meta()
      .then((m) => {
        store.meta = m;
        enCours = null;
        return m;
      })
      .catch((e) => {
        enCours = null; // permet un nouvel essai après échec
        throw e;
      });
  }
  return enCours;
}
