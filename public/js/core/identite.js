/**
 * Identité de l'OPÉRATEUR (la personne qui remplit le portail — ≠ le nouveau
 * collaborateur). Identification DÉCLARATIVE et locale (localStorage) : ce n'est
 * PAS une authentification (aucun mot de passe, n'importe quel nom accepté).
 * Sert à SIGNER les actions : chaque requête porte le badge « Prénom N. ».
 */
import { badgeNom } from './ui.js';

const CLE = 'portail.operateur';

/** Opérateur courant `{ prenom, nom }`, ou `null` si non identifié / invalide. */
export function getOperateur() {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const o = JSON.parse(brut);
    const prenom = (o?.prenom || '').trim();
    const nom = (o?.nom || '').trim();
    if (!prenom || !nom) return null; // les DEUX sont requis
    return { prenom, nom };
  } catch {
    return null;
  }
}

/** Enregistre l'opérateur (longueurs plafonnées). Renvoie l'objet normalisé. */
export function setOperateur(prenom, nom) {
  const op = {
    prenom: (prenom || '').trim().slice(0, 60),
    nom: (nom || '').trim().slice(0, 60),
  };
  localStorage.setItem(CLE, JSON.stringify(op));
  return op;
}

/** Oublie l'opérateur courant (déclenche le gate au prochain rendu). */
export function effacerOperateur() {
  localStorage.removeItem(CLE);
}

/** Badge « Prénom N. » de l'opérateur courant, ou '' si non identifié. */
export function badgeOperateur() {
  const op = getOperateur();
  return op ? badgeNom(op.prenom, op.nom) : '';
}
