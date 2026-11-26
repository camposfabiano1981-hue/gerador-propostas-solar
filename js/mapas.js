/*
 * Mapas da planta de localização: a imagem centrada no ponto da UC pela fonte escolhida —
 *  - Google (Maps Static API, satélite com as ruas e os nomes: maptype=hybrid), com a chave da empresa (Configurações › Empresa);
 *  - Esri (satélite World Imagery com as ruas e os nomes da Esri por cima), sem chave;
 *  - OpenStreetMap (mapa de ruas; também o mapa de situação da cidade);
 *  - imagem enviada pelo projetista (ex.: print do Google Maps ou Google Earth), sem escala.
 * Devolve a imagem em JPEG (bytes), os metros por pixel (para a escala gráfica) e o crédito exigido pela fonte.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const M = {};

  M.FONTES = [
    { v: 'auto', t: 'Automático: Google com a chave; sem ela, Esri' },
    { v: 'google', t: 'Google — satélite com ruas (precisa da chave)' },
    { v: 'esri', t: 'Esri — satélite com ruas (sem chave)' },
    { v: 'osm', t: 'OpenStreetMap — mapa de ruas (sem chave)' },
    { v: 'imagem', t: 'Imagem enviada (print do Google Maps/Earth)' }
  ];
  M.CREDITOS = {
    google: 'Mapa: Google',
    esri: 'Imagem: Esri, Maxar, Earthstar Geographics · Ruas: Esri, HERE, Garmin, © OpenStreetMap',
    osm: '© OpenStreetMap contributors',
    imagem: ''
  };
  M.CAMADAS = {
    esri: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
    osm: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
  };
  M.ZOOM_PADRAO = 17;

  /** Metros por pixel na latitude e no zoom (pixel de 256 por bloco). */
  M.metrosPorPixel = function (lat, zoom) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom); };

  /** Configuração de mapas da empresa (Configurações › Empresa › Mapas). */
  M.config = function (empresa) {
    const e = empresa || (App.Store && App.Store.config().empresa) || {};
    const m = e.mapas || {};
    return { googleKey: String(m.googleKey || '').trim(), fonte: m.fonte || 'auto' };
  };

  /** Fonte efetiva: 'auto' vira Google quando há chave, senão Esri; Google sem chave também cai na Esri. */
  M.fonteEfetiva = function (fonte, cfg) {
    const f = fonte || cfg.fonte || 'auto';
    if (f === 'auto') return cfg.googleKey ? 'google' : 'esri';
    if (f === 'google' && !cfg.googleKey) return 'esri';
    return f;
  };

  /** Endereço da imagem do Google (Maps Static API): tamanho até 640 × 640 e escala 2 (o dobro de pixels). */
  M.urlGoogle = function (lat, lon, zoom, larg, alt, chave, tipo) {
    const w = Math.min(640, Math.round(larg)), h = Math.min(640, Math.round(alt));
    return 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat.toFixed(6) + ',' + lon.toFixed(6) + '&zoom=' + zoom + '&size=' + w + 'x' + h +
      '&scale=2&maptype=' + (tipo || 'hybrid') + '&format=jpg&language=pt-BR&region=BR&key=' + encodeURIComponent(chave);
  };

  /** Blocos (tiles) que cobrem uma janela de larg × alt pixels centrada no ponto. */
  M.blocos = function (lat, lon, zoom, larg, alt) {
    const n = Math.pow(2, zoom);
    const px = (lon + 180) / 360 * n * 256;
    const py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256;
    const x0 = px - larg / 2, y0 = py - alt / 2, out = [];
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + larg) / 256); tx++) {
      for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + alt) / 256); ty++) out.push({ x: tx, y: ty, dx: Math.round(tx * 256 - x0), dy: Math.round(ty * 256 - y0) });
    }
    return out;
  };

  function carregarImagem(src) {
    return new Promise(function (res, rej) {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('não foi possível carregar ' + String(src).split('?')[0])); };
      im.src = src;
    });
  }
  function canvasParaJpeg(cv, q) {
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) { if (!b) return rej(new Error('falha ao gerar a imagem do mapa')); b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }, rej); }, 'image/jpeg', q || 0.85);
    });
  }

  /** Mosaico dos blocos das camadas (a 1ª por baixo) numa imagem JPEG. */
  async function mosaico(camadas, lat, lon, zoom, larg, alt) {
    const cv = document.createElement('canvas');
    cv.width = larg; cv.height = alt;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, larg, alt);
    const bl = M.blocos(lat, lon, zoom, larg, alt);
    for (const url of camadas) {
      const ims = await Promise.all(bl.map(function (b) { return carregarImagem(url.replace('{z}', zoom).replace('{x}', b.x).replace('{y}', b.y)).catch(function () { return null; }); }));
      if (ims.every(function (x) { return !x; })) throw new Error('mapa indisponível (sem acesso aos servidores de mapas)');
      ims.forEach(function (im, i) { if (im) g.drawImage(im, bl[i].dx, bl[i].dy); });
    }
    return canvasParaJpeg(cv, 0.84);
  }

  /** Imagem do usuário (print) em JPEG de até 1600 px de largura. */
  async function imagemEnviada(dataURL) {
    const im = await carregarImagem(dataURL);
    const k = Math.min(1, 1600 / im.naturalWidth);
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(im, 0, 0, cv.width, cv.height);
    return { bytes: await canvasParaJpeg(cv, 0.86), larg: cv.width, alt: cv.height };
  }

  /**
   * Imagem do mapa: o = {lat, lon, zoom, larg, alt (pixels finais), fonte, empresa, imagemDataURL}.
   * Devolve {bytes (JPEG), larg, alt, mPorPx (null sem escala), fonte, credito}.
   */
  M.imagem = async function (o) {
    const cfg = M.config(o.empresa);
    let fonte = M.fonteEfetiva(o.fonte, cfg);
    const z = o.zoom || M.ZOOM_PADRAO;
    if (fonte === 'imagem') {
      if (!o.imagemDataURL) throw new Error('Envie a imagem do mapa (print do Google Maps ou Google Earth) ou escolha outra fonte.');
      const r = await imagemEnviada(o.imagemDataURL);
      return { bytes: r.bytes, larg: r.larg, alt: r.alt, mPorPx: null, fonte: fonte, credito: '' };
    }
    if (fonte === 'google') {
      const w = Math.round(Math.min(640, o.larg / 2)), h = Math.round(Math.min(640, o.alt / 2));
      const resp = await fetch(M.urlGoogle(o.lat, o.lon, z, w, h, cfg.googleKey)).catch(function () { return null; });
      if (resp && resp.ok && /image/.test(resp.headers.get('content-type') || '')) {
        return { bytes: new Uint8Array(await resp.arrayBuffer()), larg: w * 2, alt: h * 2, mPorPx: M.metrosPorPixel(o.lat, z) / 2, fonte: 'google', credito: M.CREDITOS.google };
      }
      // chave recusada (site não autorizado, API não ativada, cota) ou sem rede: segue pela Esri e avisa
      o.aviso = 'A chave do Google foi recusada (' + (resp ? 'HTTP ' + resp.status : 'sem conexão') + '): confira a chave e as restrições em Configurações › Empresa › Mapas. Usado o mapa da Esri.';
      fonte = 'esri';
    }
    const bytes = await mosaico(M.CAMADAS[fonte] || M.CAMADAS.esri, o.lat, o.lon, z, Math.round(o.larg), Math.round(o.alt));
    return { bytes: bytes, larg: Math.round(o.larg), alt: Math.round(o.alt), mPorPx: M.metrosPorPixel(o.lat, z), fonte: fonte, credito: M.CREDITOS[fonte] || '', aviso: o.aviso };
  };

  /** Mapa de situação (a cidade, OpenStreetMap). */
  M.situacao = async function (lat, lon, larg, alt, zoom) {
    const z = zoom || 13;
    const bytes = await mosaico(M.CAMADAS.osm, lat, lon, z, larg, alt);
    return { bytes: bytes, larg: larg, alt: alt, mPorPx: M.metrosPorPixel(lat, z), credito: M.CREDITOS.osm };
  };

  /** Testa a chave do Google com uma imagem pequena: {ok, status, msg}. */
  M.testarChave = async function (chave) {
    if (!String(chave || '').trim()) return { ok: false, msg: 'Informe a chave.' };
    try {
      const r = await fetch(M.urlGoogle(-19.0087, -57.653, 15, 64, 64, String(chave).trim(), 'roadmap'));
      if (r.ok && /image/.test(r.headers.get('content-type') || '')) return { ok: true, status: r.status, msg: 'Chave funcionando: a planta de localização sai com o satélite do Google.' };
      const t = await r.text().catch(function () { return ''; });
      return { ok: false, status: r.status, msg: 'O Google recusou a chave (HTTP ' + r.status + '). ' + (/referer|referrer/i.test(t) ? 'O endereço do app não está liberado nas restrições da chave.' :
        /not activated|not enabled|disabled/i.test(t) ? 'Ative a Maps Static API no projeto.' : /billing/i.test(t) ? 'Ative o faturamento do projeto no Google Cloud.' : 'Confira a chave, a API ativada e as restrições.') };
    } catch (e) { return { ok: false, msg: 'Sem conexão com o Google.' }; }
  };

  App.Mapas = M;
})(window.App);
