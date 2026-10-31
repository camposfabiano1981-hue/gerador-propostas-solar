/*
 * Service worker do aplicativo instalado (PWA): abre sem internet e mantém os arquivos atualizados.
 * - Página (index.html): primeiro a rede (versão publicada mais recente); sem internet, a cópia guardada.
 * - Arquivos do app (js/css/ícones, com ?v= da versão) e bibliotecas dos CDNs (versões fixas): cópia guardada, senão a rede.
 * - Firebase (login e banco), API do Claude e demais endereços passam direto, sem cache; a página pública do cliente
 *   (acompanhe.html) e a do documento enviado (ver.html) também, sem virar a cópia do app.
 * A versão abaixo acompanha a do app (index.html e js/app.js): ao publicar, o navegador instala este arquivo novo e limpa o cache antigo.
 */
const VERSAO = '2026.10.31.6';
const CACHE = 'propostas-solar-' + VERSAO;
const CDNS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (ev) {
  ev.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    // a página e tudo o que ela carrega na abertura (scripts, estilos e ícones locais)
    const resp = await fetch('./index.html', { cache: 'no-store' });
    const html = await resp.clone().text();
    await cache.put('./index.html', resp);
    const locais = ['./', './manifest.webmanifest'];
    html.replace(/(?:src|href)="([^"#:]+)"/g, function (_, u) { if (!/^(data|https?|mailto):/.test(u)) locais.push(u); return _; });
    await Promise.all(locais.map(function (u) {
      return cache.add(new Request(u, { cache: 'no-store' })).catch(function () { /* arquivo opcional */ });
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil((async function () {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(function (n) { return n.indexOf('propostas-solar-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin;
  // página pública de acompanhamento do cliente: sempre da rede, fora do cache do app
  if (local && /\/(acompanhe|ver)\.html$/.test(url.pathname)) return;
  if (req.mode === 'navigate' && local) {
    const ehApp = /\/(index\.html)?$/.test(url.pathname);
    ev.respondWith((async function () {
      try {
        const resp = await fetch(req);
        if (resp.ok && ehApp) { const c = await caches.open(CACHE); c.put('./index.html', resp.clone()); }
        return resp;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  if (!local && CDNS.indexOf(url.hostname) < 0) return;
  ev.respondWith((async function () {
    const guardado = await caches.match(req);
    if (guardado) return guardado;
    const resp = await fetch(req);
    if (resp.ok || resp.type === 'opaque') { const c = await caches.open(CACHE); c.put(req, resp.clone()); }
    return resp;
  })());
});
