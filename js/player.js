// Player YouTube (IFrame API) con stop automatico a fine segmento.
// L'API non ha eventi di tempo precisi: si controlla getCurrentTime() ogni ~30 ms.

let promessaApi = null;

export function caricaApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  promessaApi ||= new Promise((ok, ko) => {
    const prima = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prima?.(); ok(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { promessaApi = null; ko(new Error('Impossibile caricare il player di YouTube: controlla la connessione.')); };
    document.head.appendChild(s);
  });
  return promessaApi;
}

export class Lettore {
  constructor(elemento, videoId, { onStato } = {}) {
    this.videoId = videoId;
    this.timer = null;
    this.onStato = onStato;
    this.pronto = caricaApi().then(YT => new Promise((ok, ko) => {
      this.player = new YT.Player(elemento, {
        videoId,
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, fs: 0, enablejsapi: 1 },
        events: {
          onReady: () => { this.togliSottotitoli(); ok(this); },
          onStateChange: e => { if (e.data === 1) this.togliSottotitoli(); this.onStato?.(e.data); },
          onError: e => {
            const msg = { 2: 'ID del video non valido.', 5: 'Il video non si può riprodurre qui.', 100: 'Video non trovato o privato.', 101: "L'autore non permette di incorporare questo video.", 150: "L'autore non permette di incorporare questo video." }[e.data];
            this.errore = msg || 'Errore del player YouTube.';
            this.onStato?.('errore', this.errore);
            ko(new Error(this.errore));
          },
        },
      });
    }));
  }

  // I sottotitoli di YouTube rovinerebbero il dettato.
  togliSottotitoli() {
    try { this.player.unloadModule('captions'); this.player.unloadModule('cc'); } catch { /* non tutti i video li hanno */ }
  }

  tempo() { return this.player?.getCurrentTime?.() || 0; }
  durata() { return this.player?.getDuration?.() || 0; }
  velocita(v) { try { this.player.setPlaybackRate(v); } catch { /* ignorato */ } }
  pausa() { this.fermaControllo(); try { this.player.pauseVideo(); } catch { /* ignorato */ } }
  riproduci() { this.fermaControllo(); this.player.playVideo(); }
  vaiA(t) { this.player.seekTo(Math.max(0, t), true); }

  async cambiaVideo(videoId, inizio = 0) {
    await this.pronto;
    if (videoId === this.videoId) return;
    this.videoId = videoId;
    this.player.cueVideoById({ videoId, startSeconds: inizio });
  }

  fermaControllo() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  // Riproduce [inizio, fine] con i margini e si ferma da solo. onFine viene chiamata alla pausa.
  riproduciSegmento(inizio, fine, { velocita = 1, prima = 0.15, dopo = 0.25, onFine } = {}) {
    this.fermaControllo();
    const da = Math.max(0, inizio - prima);
    const a = fine + dopo;
    const p = this.player;
    try { p.setPlaybackRate(velocita); } catch { /* ignorato */ }
    p.seekTo(da, true);
    p.playVideo();
    const partito = performance.now();
    this.timer = setInterval(() => {
      const t = p.getCurrentTime();
      // dopo il seek il tempo può restare indietro per qualche istante
      const seekFatto = t >= da - 0.3 && t <= a + 2;
      if (!seekFatto && performance.now() - partito < 1500) return;
      if (t >= a || p.getPlayerState() === 0) {
        this.fermaControllo();
        p.pauseVideo();
        onFine?.();
      }
    }, 30);
  }

  distruggi() { this.fermaControllo(); try { this.player?.destroy(); } catch { /* ignorato */ } }
}

// Durata di un video senza mostrarlo: serve all'import con Gemini.
export async function durataVideo(videoId) {
  const YT = await caricaApi();
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px';
  document.body.appendChild(div);
  const interno = document.createElement('div');
  div.appendChild(interno);
  try {
    return await new Promise((ok, ko) => {
      const p = new YT.Player(interno, {
        videoId, playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            let tentativi = 0;
            const prova = () => {
              const d = p.getDuration();
              if (d > 0) ok(d); else if (++tentativi > 20) ko(new Error('Durata del video non disponibile.')); else setTimeout(prova, 250);
            };
            prova();
          },
          onError: () => ko(new Error('Video non riproducibile.')),
        },
      });
      setTimeout(() => ko(new Error('YouTube non risponde.')), 15000);
    });
  } finally { div.remove(); }
}
