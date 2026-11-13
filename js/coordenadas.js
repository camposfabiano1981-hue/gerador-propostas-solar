/*
 * Coordenadas da obra: GPS do aparelho (em campo), latitude/longitude digitadas ou coladas (Google Maps, graus decimais ou
 * graus-minutos-segundos), conversão para UTM (fuso, X e Y, como na Homologação e nas pranchas) e as ruas do croqui de
 * localização pelo OpenStreetMap (rua da UC, as duas transversais e a de trás). WGS84 ≈ SIRGAS 2000 (diferença de centímetros).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  /* ------------------------------------------------------------ UTM (WGS84) */
  const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
  const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
  const BANDAS = 'CDEFGHJKLMNPQRSTUVWX';
  const rad = function (g) { return g * Math.PI / 180; };
  const grau = function (r) { return r * 180 / Math.PI; };

  function zona(lon) { return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)); }
  function banda(lat) { return BANDAS[Math.min(BANDAS.length - 1, Math.max(0, Math.floor((lat + 80) / 8)))]; }

  /** Latitude/longitude (graus) → {fuso: '21K', zona, letra, x, y} com X e Y em metros inteiros. */
  function utmDeLatLon(lat, lon, z) {
    lat = Number(lat); lon = Number(lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 84 || Math.abs(lon) > 180) return null;
    const zn = z || zona(lon), l0 = rad((zn - 1) * 6 - 180 + 3);
    const p = rad(lat), l = rad(lon);
    const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
    const N = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, Aa = c * (l - l0);
    const e4 = E2 * E2, e6 = e4 * E2;
    const M = A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p) +
      (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
    const x = K0 * N * (Aa + (1 - T + C) * Math.pow(Aa, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(Aa, 5) / 120) + 500000;
    let y = K0 * (M + N * t * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(Aa, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(Aa, 6) / 720));
    if (lat < 0) y += 10000000;
    const letra = banda(lat);
    return { fuso: zn + letra, zona: zn, letra: letra, x: Math.round(x), y: Math.round(y), xm: x, ym: y };
  }

  /** '21K' → {zona: 21, sul: true}; sem a letra, hemisfério sul (Brasil). */
  function lerFuso(fuso) {
    const m = String(fuso || '').trim().toUpperCase().match(/^(\d{1,2})\s*([C-X])?$/);
    if (!m) return null;
    const z = Number(m[1]);
    if (z < 1 || z > 60) return null;
    return { zona: z, sul: m[2] ? m[2] < 'N' : true };
  }

  /** UTM (fuso '21K', X, Y em metros) → {lat, lon}. */
  function latLonDeUtm(fuso, x, y) {
    const fz = lerFuso(fuso), X = U.num(x), Y = U.num(y);
    if (!fz || !(X > 0) || !(Y > 0)) return null;
    const xx = X - 500000, yy = fz.sul ? Y - 10000000 : Y;
    const e4 = E2 * E2, e6 = e4 * E2, e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const mu = yy / K0 / (A * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    const s1 = Math.sin(p1), c1 = Math.cos(p1), t1 = Math.tan(p1);
    const N1 = A / Math.sqrt(1 - E2 * s1 * s1), T1 = t1 * t1, C1 = EP2 * c1 * c1, R1 = A * (1 - E2) / Math.pow(1 - E2 * s1 * s1, 1.5), D = xx / (N1 * K0);
    const lat = p1 - (N1 * t1 / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    const lon = rad((fz.zona - 1) * 6 - 180 + 3) + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c1;
    return { lat: grau(lat), lon: grau(lon) };
  }

  /* ------------------------------------------------------------ leitura do que foi digitado ou colado */

  function valido(lat, lon) { return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0); }

  /**
   * Latitude e longitude de um texto: link do Google Maps (@lat,lon · q=lat,lon · !3dlat!4dlon), graus decimais com ponto ou vírgula
   * ("-19.0076, -57.6522" · "-19,0076 -57,6522") ou graus, minutos e segundos (19°00'27.4"S 57°39'07.9"W, com O/L também).
   */
  function lerLatLon(texto) {
    const s = String(texto || '').trim();
    if (!s) return null;
    let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ||
      s.match(/[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
    if (m) { const la = Number(m[1]), lo = Number(m[2]); return valido(la, lo) ? ajustar(la, lo) : null; }
    // graus, minutos e segundos
    const dms = [];
    const re = /(\d{1,3})\s*[°º]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’])?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|''))?\s*([NSLOEW])/gi;
    let d;
    while ((d = re.exec(s))) {
      const v = Number(d[1]) + U.numOr(String(d[2] || '0').replace(',', '.'), 0) / 60 + U.numOr(String(d[3] || '0').replace(',', '.'), 0) / 3600;
      const h = d[4].toUpperCase();
      dms.push({ v: /[SOW]/.test(h) ? -v : v, eixo: /[NS]/.test(h) ? 'lat' : 'lon' });
    }
    if (dms.length === 2) {
      const la = (dms.find(function (x) { return x.eixo === 'lat'; }) || {}).v, lo = (dms.find(function (x) { return x.eixo === 'lon'; }) || {}).v;
      return valido(la, lo) ? { lat: la, lon: lo } : null;
    }
    // graus decimais: dois números (ponto ou vírgula decimal)
    const nums = s.match(/-?\d{1,3}(?:[.,]\d+)?/g) || [];
    if (nums.length === 2) {
      const la = Number(nums[0].replace(',', '.')), lo = Number(nums[1].replace(',', '.'));
      return valido(la, lo) ? ajustar(la, lo) : null;
    }
    return null;
  }

  // no Brasil a latitude vai de +6 a −34 e a longitude de −34 a −74: longitude e latitude trocadas são desfeitas
  function ajustar(la, lo) {
    if (la < -35 && la >= -75 && lo <= 6 && lo >= -35) return { lat: lo, lon: la };
    return { lat: la, lon: lo };
  }

  function fmtLatLon(lat, lon) { return lat.toFixed(6) + ', ' + lon.toFixed(6); }

  /* ------------------------------------------------------------ GPS do aparelho */

  /** Posição atual pelo GPS: {lat, lon, precisao (m)}. Rejeita com a mensagem para o usuário. */
  function posicaoAtual(opcoes) {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) { rej(new Error('Este aparelho ou navegador não informa a localização.')); return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0) });
      }, function (e) {
        const msg = e && e.code === 1 ? 'Permissão de localização negada. Libere a localização para este site nas configurações do navegador.'
          : e && e.code === 3 ? 'O GPS não respondeu a tempo. Vá para um lugar aberto e tente de novo.' : 'Não foi possível obter a localização (GPS desligado?).';
        rej(new Error(msg));
      }, Object.assign({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }, opcoes || {}));
    });
  }

  /* ------------------------------------------------------------ ruas do croqui (OpenStreetMap) */

  // servidores públicos do Overpass (OpenStreetMap): o principal e espelhos — quando um está ocupado ou fora, outro responde
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
  const ESPERA = 6000;   // sem resposta do servidor em 6 s, o próximo entra na corrida
  const FORA = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'corridor', 'platform', 'proposed', 'construction', 'elevator', 'via_ferrata'];

  function host(u) { try { return new URL(u).hostname; } catch (e) { return String(u); } }

  /** GET com tempo limite; o erro diz o motivo (HTTP 429, tempo esgotado, sem resposta). */
  async function pedir(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 429 ? ' (muitas consultas)' : r.status === 504 || r.status === 503 ? ' (servidor ocupado)' : ''));
      return await r.json();
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'tempo esgotado' : (e && /^HTTP/.test(e.message) ? e.message : (e instanceof SyntaxError ? 'resposta inválida' : 'sem resposta (bloqueado ou fora do ar)')));
    } finally { if (t) clearTimeout(t); }
  }

  function erroMapa(falhas) {
    const off = typeof navigator !== 'undefined' && navigator.onLine === false;
    const e = new Error(off ? 'O aparelho está sem internet.' : 'O mapa (OpenStreetMap) não respondeu agora — ' + falhas.join('; ') + '. Tente de novo em instantes.');
    e.falhas = falhas;
    return e;
  }

  /**
   * Vias com nome num raio de `raio` m, com o desenho de cada uma (Overpass). Corrida escalonada: começa pelo servidor principal e,
   * sem resposta em 6 s (ou se ele falhar), o próximo espelho entra; vale a primeira resposta válida.
   */
  function vias(lat, lon, raio) {
    const q = '[out:json][timeout:25];way(around:' + (raio || 300) + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ')["highway"]["name"];out geom;';
    return new Promise(function (res, rej) {
      const falhas = [];
      let feito = false, prox = 0, timer = null;
      function lancar() {
        if (feito || prox >= OVERPASS.length) return;
        const base = OVERPASS[prox++];
        clearTimeout(timer); timer = setTimeout(lancar, ESPERA);
        pedir(base + '?data=' + encodeURIComponent(q), 30000).then(function (j) {
          if (feito) return;
          if (!j || !Array.isArray(j.elements)) throw new Error('resposta inválida');
          if (!j.elements.length && j.remark) throw new Error('servidor ocupado');
          feito = true; clearTimeout(timer); res(j);
        }).catch(function (e) {
          if (feito) return;
          falhas.push(host(base) + ': ' + e.message);
          if (falhas.length === OVERPASS.length) { feito = true; clearTimeout(timer); rej(erroMapa(falhas)); } else if (falhas.length >= prox) lancar();
        });
      }
      lancar();
    });
  }

  /** Só a rua do ponto (Nominatim, o endereço do OpenStreetMap), quando o Overpass não responde. */
  async function ruaDoPonto(lat, lon) {
    const j = await pedir(NOMINATIM + '?format=jsonv2&zoom=17&addressdetails=1&accept-language=pt-BR&lat=' + lat.toFixed(6) + '&lon=' + lon.toFixed(6), 15000);
    const a = (j && j.address) || {};
    return String(a.road || a.pedestrian || a.residential || '').trim();
  }

  function chave(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // geometria num plano local em metros, com o ponto da obra na origem
  function plano(lat0, lon0) {
    const kx = 111320 * Math.cos(rad(lat0)), ky = 110540;
    return function (p) { return [(p.lon - lon0) * kx, (p.lat - lat0) * ky]; };
  }
  const sub = function (a, b) { return [a[0] - b[0], a[1] - b[1]]; };
  const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1]; };
  const len = function (a) { return Math.hypot(a[0], a[1]); };
  function pontoSeg(p, a, b) {
    const ab = sub(b, a), l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t];
    return { d: len(sub(p, q)), q: q, dir: l2 > 0 ? [ab[0] / Math.sqrt(l2), ab[1] / Math.sqrt(l2)] : [1, 0] };
  }
  function cruzaSeg(a, b, c, d) {
    const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const ca = sub(c, a), t = (ca[0] * s[1] - ca[1] * s[0]) / den, u = (ca[0] * r[1] - ca[1] * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  }
  // menor distância entre duas ruas e o ponto do encontro
  function encontro(s1, s2) {
    let best = { d: Infinity, p: null };
    s1.forEach(function (g) {
      s2.forEach(function (h) {
        const x = cruzaSeg(g[0], g[1], h[0], h[1]);
        if (x) { if (best.d > 0) best = { d: 0, p: x }; return; }
        [[g[0], h], [g[1], h], [h[0], g], [h[1], g]].forEach(function (k) {
          const r = pontoSeg(k[0], k[1][0], k[1][1]);
          if (r.d < best.d) best = { d: r.d, p: [(k[0][0] + r.q[0]) / 2, (k[0][1] + r.q[1]) / 2] };
        });
      });
    });
    return best;
  }

  /**
   * Ruas do croqui a partir das vias do OpenStreetMap em volta do ponto: a da UC (a mais próxima), as transversais que cruzam a
   * rua da UC e seguem para o lado do lote (Rua 3 = a mais próxima do lote, como no desenho; Rua 2 = a do outro lado) e a de trás
   * (paralela à da UC, do lado do lote). O que não for identificado fica em branco.
   */
  function ruasDoCroqui(dados, lat, lon) {
    const P = plano(lat, lon), O = [0, 0];
    const porNome = {};
    ((dados && dados.elements) || []).forEach(function (e) {
      const nome = e.tags && String(e.tags.name || '').trim();
      if (e.type !== 'way' || !nome || FORA.indexOf(e.tags.highway) >= 0 || !Array.isArray(e.geometry) || e.geometry.length < 2) return;
      const k = chave(nome);
      const r = porNome[k] || (porNome[k] = { nome: nome, segs: [] });
      const pts = e.geometry.map(P);
      for (let i = 1; i < pts.length; i++) r.segs.push([pts[i - 1], pts[i]]);
    });
    const ruas = Object.keys(porNome).map(function (k) {
      const r = porNome[k];
      let best = { d: Infinity };
      r.segs.forEach(function (s) { const x = pontoSeg(O, s[0], s[1]); if (x.d < best.d) best = x; });
      r.dist = best.d; r.perto = best.q; r.dir = best.dir;
      return r;
    }).sort(function (a, b) { return a.dist - b.dist; });
    const out = { uc: '', r2: '', r3: '', r4: '', distUc: null, lista: ruas.map(function (r) { return { nome: r.nome, dist: Math.round(r.dist) }; }) };
    if (!ruas.length) return out;
    const uc = ruas[0], d = uc.dir;
    out.uc = uc.nome; out.distUc = Math.round(uc.dist);
    let n = uc.dist > 1 ? [-uc.perto[0] / uc.dist, -uc.perto[1] / uc.dist] : [-d[1], d[0]];
    const C = uc.perto;
    const trans = [], paral = [];
    ruas.slice(1).forEach(function (r) {
      const e = encontro(r.segs, uc.segs);
      const lado = Math.max.apply(null, r.segs.map(function (s) { return Math.max(dot(sub(s[0], C), n), dot(sub(s[1], C), n)); }));
      if (e.d <= 12 && e.p) {
        const t = dot(sub(e.p, C), d);
        if (lado > 12 && Math.abs(t) <= 300) trans.push({ nome: r.nome, t: t });
        return;
      }
      const cos = Math.abs(dot(r.dir, d)), frente = dot(sub(r.perto, C), n);
      if (cos >= 0.82 && frente > 12) paral.push({ nome: r.nome, frente: frente });
    });
    const pos = trans.filter(function (x) { return x.t > 0; }).sort(function (a, b) { return a.t - b.t; })[0];
    const neg = trans.filter(function (x) { return x.t < 0; }).sort(function (a, b) { return b.t - a.t; })[0];
    const lados = [pos, neg].filter(Boolean).sort(function (a, b) { return Math.abs(a.t) - Math.abs(b.t); });
    if (lados[0]) out.r3 = lados[0].nome;
    if (lados[1]) out.r2 = lados[1].nome;
    const tras = paral.sort(function (a, b) { return a.frente - b.frente; })[0];
    if (tras) out.r4 = tras.nome;
    return out;
  }

  /** Ruas do croqui pelas coordenadas: consulta o OpenStreetMap e escolhe a da UC, as transversais e a de trás. */
  async function buscarRuas(lat, lon) {
    try {
      return ruasDoCroqui(await vias(lat, lon, 300), lat, lon);
    } catch (e) {
      // o serviço das vias não respondeu: pelo menos a rua da UC, pelo endereço do ponto
      let uc = '';
      try { uc = await ruaDoPonto(lat, lon); } catch (e2) { if (e.falhas) e.falhas.push('nominatim.openstreetmap.org: ' + e2.message); }
      if (uc) return { uc: uc, r2: '', r3: '', r4: '', distUc: null, lista: [], parcial: e.message };
      if (e.falhas) throw erroMapa(e.falhas);
      throw e;
    }
  }

  /** Lista de fusos para a seleção: os de MS e vizinhos e o que estiver gravado (ex.: 22J). */
  function opcoesFuso(base) {
    return function (st) {
      const v = String((st && st.fuso) || (st && st.utm && st.utm.fuso) || '').trim();
      return v && base.indexOf(v) < 0 ? [v].concat(base) : base;
    };
  }

  /* ------------------------------------------------------------ barra das coordenadas (prancha e Homologação) */

  /**
   * 📍 Localização do aparelho (em campo, em frente ao padrão), ⌨️ latitude/longitude digitada ou colada e, com o croqui,
   * 🛣️ ruas pelas coordenadas. o: {alvo: objeto com utm {fuso, x, y} (e geo, gravado aqui), ruas: {uc, r2, r3, r4} | null,
   * aoMudar()}. O UTM digitado continua valendo; as ruas encontradas ficam nos campos, editáveis.
   */
  const ULTIMA = typeof WeakMap !== 'undefined' ? new WeakMap() : { has: function () { return false; }, set: function () {}, delete: function () {}, get: function () {} };
  function barra(o) {
    const UI = App.UI, h = U.h;
    const info = h('p.coord-info');
    const situacao = h('p.coord-situacao');
    // a última mensagem da busca fica na tela (a seção é redesenhada depois de preencher)
    const marcar = function (txt, tipo) {
      situacao.textContent = txt || ''; situacao.className = 'coord-situacao' + (tipo ? ' ' + tipo : '');
      if (txt && tipo) ULTIMA.set(o.alvo, { txt: txt, tipo: tipo }); else if (!txt) ULTIMA.delete(o.alvo);
    };
    if (ULTIMA.has(o.alvo)) marcar(ULTIMA.get(o.alvo).txt, ULTIMA.get(o.alvo).tipo);
    const utm = function () { return o.alvo.utm || (o.alvo.utm = {}); };
    // o ponto exato do GPS ou do digitado enquanto o UTM for o dele; UTM digitado direto: a latitude/longitude calculada
    const atual = function () {
      const u = utm(), g = o.alvo.geo;
      if (g && isFinite(g.lat) && isFinite(g.lon)) {
        const r = utmDeLatLon(g.lat, g.lon);
        if (r && r.fuso === String(u.fuso || '').trim().toUpperCase() && String(r.x) === String(u.x).trim() && String(r.y) === String(u.y).trim()) return { lat: g.lat, lon: g.lon };
      }
      return latLonDeUtm(u.fuso, u.x, u.y);
    };
    function pintar() {
      const ll = atual(), g = o.alvo.geo;
      info.textContent = ll
        ? 'Latitude, longitude: ' + fmtLatLon(ll.lat, ll.lon) + (g && g.origem === 'gps' ? ' · GPS do aparelho' + (g.precisao ? ' (± ' + g.precisao + ' m)' : '') + (g.em ? ' em ' + U.dataBR(String(g.em).slice(0, 10)) : '') : '')
        : 'Sem coordenadas: em campo, use a localização do aparelho em frente ao padrão de entrada; no escritório, digite a latitude/longitude ou o UTM.';
    }
    function aplicar(lat, lon, geo) {
      const r = utmDeLatLon(lat, lon), u = utm();
      u.fuso = r.fuso; u.x = String(r.x); u.y = String(r.y);
      o.alvo.geo = Object.assign({ lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)), em: new Date().toISOString(), origem: 'digitado' }, geo || {});
      return r;
    }
    async function preencherRuas() {
      const ll = atual();
      if (!ll) { UI.toast('Informe as coordenadas (localização do aparelho, latitude/longitude ou UTM).', 'erro'); return false; }
      UI.toast('Consultando as ruas no mapa (OpenStreetMap)…');
      let r;
      marcar('Consultando as ruas no mapa…');
      try { r = await buscarRuas(ll.lat, ll.lon); } catch (e) {
        const m = e.message + ' Enquanto isso, as ruas podem ser digitadas.';
        marcar(m, 'erro'); UI.toast(m, 'erro', 10000); return false;
      }
      if (!r.uc) { const m = 'Nenhuma rua com nome a 300 m do ponto no OpenStreetMap (comum na zona rural). Digite as ruas do croqui.'; marcar(m, 'aviso'); UI.toast(m, 'aviso', 8000); return false; }
      const novo = { uc: r.uc, r2: r.r2, r3: r.r3, r4: r.r4 }, rot = { uc: 'Rua da UC', r2: 'Rua 2', r3: 'Rua 3', r4: 'Rua 4' };
      const dif = Object.keys(novo).filter(function (k) { return novo[k] && String(o.ruas[k] || '').trim() && chave(o.ruas[k]) !== chave(novo[k]); });
      const subst = dif.length ? await UI.confirmar('No mapa: ' + dif.map(function (k) { return rot[k] + ' = ' + novo[k] + ' (hoje: ' + o.ruas[k] + ')'; }).join('; ') +
        '. Substituir pelas do mapa? Em Cancelar, só os campos vazios são preenchidos.', 'Substituir') : true;
      let n = 0;
      Object.keys(novo).forEach(function (k) { if (novo[k] && (subst || !String(o.ruas[k] || '').trim()) && o.ruas[k] !== novo[k]) { o.ruas[k] = novo[k]; n++; } });
      const vazios = Object.keys(novo).filter(function (k) { return !novo[k]; }).map(function (k) { return rot[k]; });
      const msg = 'Ruas do croqui pelo mapa: ' + [novo.uc, novo.r2, novo.r3, novo.r4].filter(Boolean).join(' · ') + '.' +
        (r.distUc > 60 ? ' A rua da UC está a ' + r.distUc + ' m do ponto: confira.' : '') +
        (r.parcial ? ' Só a rua da UC veio do mapa: o serviço das ruas vizinhas não respondeu agora — busque de novo em instantes ou digite as outras.'
          : (vazios.length ? ' Não identificada(s): ' + vazios.join(', ') + '.' : '')) + ' Confira no croqui — os campos continuam editáveis.', tipoMsg = r.parcial || vazios.length || r.distUc > 60 ? 'aviso' : 'ok';
      marcar(msg, tipoMsg); UI.toast(msg, tipoMsg, 8000);
      return n > 0;
    }
    const btnGps = h('button.btn.pequeno.btn-coord-gps', {
      type: 'button', title: 'Use em campo, em frente ao padrão de entrada', onclick: async function () {
        btnGps.disabled = true;
        UI.toast('Buscando a localização do aparelho (GPS)…');
        try {
          const p = await posicaoAtual();
          const r = aplicar(p.lat, p.lon, { origem: 'gps', precisao: p.precisao });
          UI.toast('Coordenadas pelo GPS: fuso ' + r.fuso + ', X ' + r.x + ', Y ' + r.y + (p.precisao ? ' (± ' + p.precisao + ' m)' : '') + '.' +
            (p.precisao > 30 ? ' Precisão baixa: espere o GPS estabilizar, num lugar aberto, e toque de novo.' : ''), p.precisao > 30 ? 'aviso' : 'ok');
          if (o.ruas) await preencherRuas();
          o.aoMudar();
        } catch (e) { UI.toast(e.message, 'erro'); }
        btnGps.disabled = false;
      }
    }, '📍 Usar a localização do aparelho');
    const btnDig = h('button.btn.pequeno.btn-coord-digitar', {
      type: 'button', onclick: function () {
        const ll0 = atual();
        const prev = h('p.coord-prev');
        const inp = h('input', { type: 'text', value: ll0 ? fmtLatLon(ll0.lat, ll0.lon) : '', placeholder: '-19.008620, -57.653180', autocomplete: 'off', 'aria-label': 'Latitude e longitude' });
        const ver = function () {
          const ll = lerLatLon(inp.value), r = ll && utmDeLatLon(ll.lat, ll.lon);
          prev.textContent = r ? 'Latitude ' + ll.lat.toFixed(6) + ', longitude ' + ll.lon.toFixed(6) + ' → UTM fuso ' + r.fuso + ' · X ' + r.x + ' · Y ' + r.y : (inp.value.trim() ? 'Formato não reconhecido.' : '');
          prev.classList.toggle('erro', !r && !!inp.value.trim());
        };
        inp.addEventListener('input', ver); ver();
        UI.modal({
          titulo: 'Latitude e longitude', corpo: h('div.coord-modal',
            h('p.ajuda-sec', 'Digite ou cole a latitude e a longitude — em graus decimais (-19.008620, -57.653180), em graus, minutos e segundos (19°00\'31"S 57°39\'11"O) ' +
              'ou o link do ponto no Google Maps. O fuso, o X e o Y do UTM são calculados (SIRGAS 2000 ≈ WGS84).'), inp, prev),
          acoes: [{ label: 'Cancelar' }, {
            label: 'Usar estas coordenadas', primario: true, onClick: function (fechar) {
              const ll = lerLatLon(inp.value);
              if (!ll) { UI.toast('Formato não reconhecido. Ex.: -19.008620, -57.653180', 'erro'); return false; }
              aplicar(ll.lat, ll.lon, { origem: 'digitado' });
              fechar();
              (async function () { if (o.ruas) await preencherRuas(); o.aoMudar(); })();
              return false;
            }
          }]
        });
        setTimeout(function () { inp.focus(); }, 50);
      }
    }, '⌨️ Digitar latitude e longitude');
    const btnRuas = o.ruas ? h('button.btn.pequeno.btn-coord-ruas', {
      type: 'button', title: 'Rua da UC, as transversais e a de trás pelo OpenStreetMap, a partir das coordenadas',
      onclick: async function () { btnRuas.disabled = true; if (await preencherRuas()) o.aoMudar(); btnRuas.disabled = false; }
    }, '🛣️ Buscar as ruas pelas coordenadas') : null;
    pintar();
    const box = h('div.coord-barra', h('div.barra-itens', btnGps, btnDig, btnRuas), info, situacao,
      o.ruas ? h('small.ajuda', 'As ruas vêm do OpenStreetMap (só as coordenadas são enviadas, sem dados do cliente). Confira e corrija nos campos, se precisar.') : null);
    box.pintar = pintar;
    return box;
  }

  App.Coordenadas = {
    utmDeLatLon: utmDeLatLon, latLonDeUtm: latLonDeUtm, lerFuso: lerFuso, lerLatLon: lerLatLon, fmtLatLon: fmtLatLon, zona: zona, banda: banda,
    posicaoAtual: posicaoAtual, vias: vias, ruaDoPonto: ruaDoPonto, ruasDoCroqui: ruasDoCroqui, buscarRuas: buscarRuas, opcoesFuso: opcoesFuso, barra: barra, OVERPASS: OVERPASS, NOMINATIM: NOMINATIM
  };
})(window.App);
