import { IMPORTATORE_PREDEFINITO } from './config.js';

export const PREDEFINITE = {
  linguaSpiegazioni: 'it',      // it | en
  retention: 0.9,
  breveCarte: 20,
  breveMinuti: 10,
  margineInizio: 0.15,
  margineFine: 0.25,
  velocitaLenta: 0.75,
  ignoraIntercalari: true,
  shadowing: true,
  linguaVoce: 'en-US',
  soglie: { primoSotto100: true, aiutoDa: 2, riascoltiDa: 3, rivelata: true },
  importatore: IMPORTATORE_PREDEFINITO,
};

export function unisci(salvate) {
  return { ...PREDEFINITE, ...salvate, soglie: { ...PREDEFINITE.soglie, ...(salvate?.soglie || {}) } };
}
