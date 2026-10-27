// Librerie esterne, a versione fissa. Niente build: si caricano come moduli ES dal CDN.
export {
  h, html, render, createContext, useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
export { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm';
