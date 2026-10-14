/** Standalone CI document only. Never imported by product runtime. */
import { origin, videoId, publisher, providerFailure } from './official-nissan-embed-policy.mjs';
export const pageCss = `*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:#eee;color:#111;font:16px system-ui}header,footer{padding:16px;max-width:1000px;margin:auto}header{min-height:110vh}h1{font-size:24px}main{width:min(960px,calc(100% - 32px));margin:0 auto}#player{display:block;width:100%;height:auto;aspect-ratio:16/9;min-width:200px;min-height:200px;border:0}#status{min-height:4em;margin:16px 0}footer{min-height:150vh}a{color:#0645ad}`;
export const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Official Nissan embed compatibility QA</title><link rel="stylesheet" href="/page.css"><script defer src="/page.js"></script><script defer src="https://www.youtube.com/iframe_api"></script></head><body><header><h1>Official Nissan embed compatibility QA</h1><p>Standalone CI origin. This is not the production site.</p><p><a href="${publisher.replaceAll('&', '&amp;')}">Nissan publisher page</a></p><p>Scroll down to view the unchanged YouTube player. Only one player is present.</p></header><main><iframe id="player" title="Nissan GT-R: The ultimate high-speed camera car" width="960" height="540" src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&amp;autoplay=0&amp;controls=1&amp;playsinline=1&amp;origin=${encodeURIComponent(origin)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><p id="status" role="status">Waiting for YouTube readiness. Readiness does not establish playback.</p></main><footer><p>Offscreen pause and return target.</p></footer></body></html>`;

// Browser code runs as a real script served only by the CI-local HTTP server.
// Its snapshot consists solely of real API return values and measured viewport geometry.
export function installProbe() {
  const frame = document.getElementById('player'), status = document.getElementById('status');
  const evidence = { ready: false, terminal: null, events: [], attempts: 0, epoch: 0 };
  let player, wasEligible = false, attemptedEpoch = -1, visibilityPause = false, automaticResume = true;
  const geometry = () => {
    const rect = frame.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ratio: width * height / (rect.width * rect.height), visible: document.visibilityState === 'visible' };
  };
  const event = (kind, values = {}) => { if (evidence.events.length < 400) evidence.events.push({ kind, at: performance.now(), ...values }); };
  const snapshot = () => ({ ...evidence, events: [...evidence.events], ...geometry(), state: evidence.ready ? player.getPlayerState() : null, currentTime: evidence.ready ? player.getCurrentTime() : null, muted: evidence.ready ? player.isMuted() : null, playerCount: document.querySelectorAll('iframe').length, userActivation: { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive } });
  const terminal = (kind, values = {}) => {
    if (evidence.terminal) return;
    evidence.terminal = { kind, ...values }; automaticResume = false;
    event('terminal', evidence.terminal); status.textContent = `Stopped: ${kind}. No retry or click fallback.`;
    if (evidence.ready) player.pauseVideo();
  };
  const reconcile = () => {
    const { ratio, visible, rect } = geometry(), eligible = visible && ratio > .5;
    if (eligible && !wasEligible) evidence.epoch++;
    wasEligible = eligible;
    if (!evidence.ready || evidence.terminal) return;
    if (rect.width < 200 || rect.height < 200) return terminal('player-below-minimum-size');
    if (!eligible && player.getPlayerState() === 1) {
      visibilityPause = true; event('visibility-pause-request', { ratio, visible, currentTime: player.getCurrentTime() }); player.pauseVideo();
    } else if (eligible && automaticResume && attemptedEpoch !== evidence.epoch) {
      attemptedEpoch = evidence.epoch; visibilityPause = false; evidence.attempts++;
      if (!player.isMuted()) return terminal('mute-not-confirmed');
      event('autoplay-request', { ratio, visible, currentTime: player.getCurrentTime(), epoch: evidence.epoch, muted: player.isMuted(), userActivation: { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive } });
      player.playVideo();
    }
  };
  window.onYouTubeIframeAPIReady = () => {
    event('iframe-api-ready');
    player = new YT.Player('player', { events: {
      onReady: () => { evidence.ready = true; player.mute(); event('onReady'); status.textContent = 'Player ready. Playback and visible moving frames are still unverified.'; reconcile(); },
      onStateChange: ({ data }) => {
        event('state-change', { state: data, currentTime: player.getCurrentTime(), ...geometry() });
        if (data === 2 && !visibilityPause && !evidence.terminal) automaticResume = false;
        if (data === 1) { status.textContent = 'YouTube reports PLAYING. Time and actual visible screenshots are assessed separately.'; reconcile(); }
      },
      onAutoplayBlocked: () => terminal('autoplay-blocked'),
      onError: ({ data }) => terminal('provider-error', { provider: failure(data) }),
    } });
  };
  // Page-owned failures remain explicit. No provider-response replacement or media access.
  addEventListener('securitypolicyviolation', e => terminal('qa-csp-violation', { directive: e.effectiveDirective, blockedOrigin: (() => { try { return new URL(e.blockedURI).origin; } catch { return e.blockedURI; } })() }));
  new IntersectionObserver(() => { event('intersection', geometry()); reconcile(); }, { threshold: [0, .5, .5001, 1] }).observe(frame);
  addEventListener('visibilitychange', reconcile); addEventListener('scroll', reconcile, { passive: true });
  window.officialNissanProbe = Object.freeze({ snapshot });
}
export const pageJs = `const failure = ${providerFailure.toString()};\n(${installProbe.toString()})();\n`;
