// Service worker: l'app si apre anche senza rete (i video e Gemini no, ovviamente).
// File dell'app: prima la rete, poi la copia salvata. Librerie del CDN: copia salvata (hanno versione fissa).
const CACHE = 'ascolta-v1';
const GUSCIO = [
  './', 'index.html', 'manifest.webmanifest', 'css/stile.css', 'icone/icona.svg', 'catalogo/catalogo.json',
  'js/app.js', 'js/lib.js', 'js/config.js', 'js/dati.js', 'js/ai.js', 'js/importa.js', 'js/player.js', 'js/voce.js',
  'js/testo.js', 'js/ripasso.js', 'js/impostazioni.js',
  'js/ui/comuni.js', 'js/ui/esercizi.js', 'js/ui/home.js', 'js/ui/catalogo.js', 'js/ui/studio.js',
  'js/ui/ripassa.js', 'js/ui/statistiche.js', 'js/ui/impostazioni.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // no-cache: ricontrolla sempre col server, così dopo un aggiornamento non si mescolano file vecchi e nuovi.
    const rete = e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request, { cache: 'no-cache' });
    e.respondWith(rete.then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return res;
    })));
  }
  // Supabase, YouTube, Google: sempre dalla rete.
});
