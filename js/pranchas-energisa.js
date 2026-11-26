/*
 * Arquivos da prancha para o portal da Energisa, cada um com o seu carimbo (empresa, logotipo, RT, ART, cliente, UC, distribuidora):
 *  1. Planta de localização — A4 em pé: satélite com as ruas (Google com a chave da empresa, Esri ou imagem enviada), marcador da UC,
 *     quadros do padrão de entrada (latitude/longitude e UTM) e da unidade consumidora, norte, escala gráfica e mapa de situação;
 *     ou A3 deitado: mapa de ruas, satélite e o croqui do projeto;
 *  2. Projeto elétrico — a prancha completa, como configurada (estilo A, B ou os dois; uma ou duas folhas);
 *  3. Diagramas unifilar e multifilar — A3 deitado, recortados da prancha A (vetor, sem redesenhar); com baterias, uma 2ª folha com o
 *     diagrama do armazenamento.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const E = {};

  E.ARQUIVOS = [
    { id: 'planta', num: 'FV-001', titulo: 'PLANTA DE LOCALIZAÇÃO', arquivo: '1 - Planta de localizacao' },
    { id: 'projeto', num: 'FV-002', titulo: 'PROJETO ELÉTRICO', arquivo: '2 - Projeto eletrico' },
    { id: 'diagramas', num: 'FV-003', titulo: 'DIAGRAMAS UNIFILAR E MULTIFILAR', arquivo: '3 - Diagramas unifilar e multifilar' }
  ];
  E.MODELOS_PLANTA = [{ v: 'a4', t: 'A4 em pé — satélite com ruas, quadros, norte, escala e situação' }, { v: 'a3', t: 'A3 deitado — o mapa da A4 com situação, dados da localização e o croqui do projeto' }];
  // trechos da prancha A de uma folha (pontos do modelo): diagramas com as legendas, o canto do diagrama de blocos que entra no recorte
  // (coberto de branco), o diagrama do armazenamento (híbrido/off-grid) e o croqui de localização
  E.RECORTE = { diagramas: [150, 845, 1295, 1640], blocos: [1277, 1440, 1295, 1640], armazenamento: [1298, 826, 1854, 1038], croqui: [1340, 1105, 1858, 1445] };
  const A4 = [595.28, 841.89], A3 = [1190.55, 841.89];

  function str(v) { return v == null ? '' : String(v).trim(); }
  /** Texto nas fontes padrão do PDF (WinAnsi): o que não existe nelas sai do texto. */
  function wa(s) { return String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, ''); }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /** Nome do arquivo: "1 - Planta de localizacao - Cliente - UC 123.pdf". */
  E.nomeArquivo = function (pr, id) {
    const a = E.ARQUIVOS.find(function (x) { return x.id === id; }) || E.ARQUIVOS[0];
    const cli = semAcento(str(pr.cliente && pr.cliente.nome)).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return [a.arquivo, cli, str(pr.uc) ? 'UC ' + str(pr.uc) : ''].filter(Boolean).join(' - ') + '.pdf';
  };

  /** Latitude e longitude da UC: as do GPS/digitadas (quando batem com o UTM) ou convertidas do UTM da prancha. */
  E.coordenadas = function (pr) {
    const C = App.Coordenadas, u = pr.utm || {};
    const g = pr.geo;
    if (g && isFinite(g.lat) && isFinite(g.lon)) return { lat: Number(g.lat), lon: Number(g.lon) };
    const ll = C && C.latLonDeUtm ? C.latLonDeUtm(u.fuso, u.x, u.y) : null;
    return ll && isFinite(ll.lat) && isFinite(ll.lon) ? ll : null;
  };

  /** Dados do carimbo. */
  E.dadosCarimbo = function (pr, ctx, o) {
    o = o || {};
    const emp = (ctx && ctx.empresa) || (App.Store ? App.Store.config().empresa : {}) || {};
    const ef = App.Pranchas.efetivos(pr, ctx);
    const cli = pr.cliente || {};
    const end = str(cli.endereco).replace(/\.$/, '');
    const mc = end.match(/-\s*([^-,]+?)\s*-\s*([A-Z]{2})$/);
    return {
      empresa: str(emp.razao) || str(emp.nomeCurto), logo: emp.logo || App.LOGO_PADRAO || null, cidade: [str(emp.cidade), str(emp.uf)].filter(Boolean).join('/'),
      rtNome: ef.rtNome, rtRegistro: ef.rtRegistro, art: str(pr.art), cliente: str(cli.nome), endereco: end, uc: str(pr.uc),
      distribuidora: str(o.distribuidora) || 'Energisa', data: App.Pranchas.fmt.dataBR(pr.data), revisao: str(pr.revisao) || '0',
      utm: pr.utm || {}, cidadeObra: mc ? (mc[1] + '/' + mc[2]).toLocaleUpperCase('pt-BR') : ''
    };
  };

  /** Quebra o endereço em até 2 linhas pela largura. */
  function linhas(font, s, tam, larg, max) {
    const out = [];
    let cur = '';
    wa(s).split(' ').forEach(function (p) {
      const t = cur ? cur + ' ' + p : p;
      if (cur && font.widthOfTextAtSize(t, tam) > larg) { out.push(cur); cur = p; } else cur = t;
    });
    if (cur) out.push(cur);
    if (out.length > max) { out.length = max; out[max - 1] += '…'; }
    return out;
  }

  function ferramentas(P, pg, f, fb) {
    const PRETO = P.rgb(0, 0, 0);
    const t = function (s, x, y, tam, o) {
      o = o || {};
      let txt = wa(s), size = tam;
      const fonte = o.b ? fb : f;
      if (o.max) while (size > tam * 0.6 && fonte.widthOfTextAtSize(txt, size) > o.max) size -= 0.25;
      const w = fonte.widthOfTextAtSize(txt, size);
      pg.drawText(txt, { x: o.al === 'c' ? x - w / 2 : (o.al === 'r' ? x - w : x), y: y, size: size, font: fonte, color: o.cor || PRETO });
      return w;
    };
    const ret = function (x, y, w, h, o) { pg.drawRectangle(Object.assign({ x: x, y: y, width: w, height: h, borderWidth: 0.7, borderColor: PRETO }, o || {})); };
    const lin = function (x1, y1, x2, y2, e) { pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: e || 0.7, color: PRETO }); };
    return { t: t, ret: ret, lin: lin, PRETO: PRETO, CIN: P.rgb(0.4, 0.42, 0.47), AZ: P.rgb(0.12, 0.23, 0.54), BR: P.rgb(1, 1, 1), VERM: P.rgb(0.86, 0.15, 0.15) };
  }

  async function logoImg(doc, dataURL) {
    if (!dataURL || !/^data:image\/(png|jpe?g)/.test(dataURL)) return null;
    try {
      const b = App.PranchasPdf.bytesDeDataUrl(dataURL);
      return /png/.test(dataURL.slice(0, 20)) ? await doc.embedPng(b) : await doc.embedJpg(b);
    } catch (e) { return null; }
  }

  /** Carimbo da folha A4 (faixa inferior em 4 linhas). */
  async function carimboA4(doc, pg, T, f, d, arq, escala) {
    const x0 = 28, x1 = A4[0] - 28, y0 = 28, h = 150, xm = 300;
    const rot = function (s, x, y) { T.t(s, x, y, 5.5, { cor: T.CIN }); };
    T.ret(x0, y0, x1 - x0, h, { borderWidth: 0.9 });
    const lh = [y0 + h - 42, y0 + h - 76, y0 + h - 110];
    lh.forEach(function (y) { T.lin(x0, y, x1, y); });
    T.lin(xm, y0 + h, xm, y0);
    const lg = await logoImg(doc, d.logo);
    let xe = x0 + 6;
    if (lg) { const k = Math.min(70 / lg.width, 34 / lg.height); pg.drawImage(lg, { x: x0 + 4, y: lh[0] + 4, width: lg.width * k, height: lg.height * k }); xe = x0 + 82; }
    rot('EMPRESA', xe, y0 + h - 9); T.t(d.empresa, xe, y0 + h - 22, 8.5, { b: true, max: xm - xe - 6 }); T.t(d.cidade, xe, y0 + h - 33, 7);
    rot('CLIENTE / PROPRIETÁRIO', xm + 5, y0 + h - 9); T.t(d.cliente, xm + 5, y0 + h - 24, 9, { b: true, max: x1 - xm - 10 });
    rot('TÍTULO DO DESENHO', x0 + 5, lh[0] - 9); T.t(arq.titulo, x0 + 5, lh[0] - 26, 12, { b: true, cor: T.AZ, max: xm - x0 - 10 });
    rot('LOCAL', xm + 5, lh[0] - 9);
    linhas(T.fonte, d.endereco, 7.5, x1 - xm - 10, 2).forEach(function (l, i) { T.t(l, xm + 5, lh[0] - 21 - i * 9, 7.5); });
    [160, 400].forEach(function (x) { T.lin(x, lh[1], x, lh[2]); });
    rot('RESPONSÁVEL TÉCNICO', x0 + 5, lh[1] - 9); T.t(d.rtNome, x0 + 5, lh[1] - 20, 7, { max: 125 }); T.t(d.rtRegistro, x0 + 5, lh[1] - 29, 7, { max: 125 });
    rot('ART / TRT', 165, lh[1] - 9); T.t(d.art || '—', 165, lh[1] - 22, 8, { max: 130 });
    rot('UNIDADE CONSUMIDORA', xm + 5, lh[1] - 9); T.t(d.uc || '—', xm + 5, lh[1] - 22, 8.5, { b: true, max: 95 });
    rot('DISTRIBUIDORA', 405, lh[1] - 9); T.t(d.distribuidora, 405, lh[1] - 22, 7.5, { max: x1 - 410 });
    const c4 = [x0, 120, 200, xm, 400, 470, x1];
    c4.slice(1, -1).forEach(function (x) { T.lin(x, lh[2], x, y0); });
    [['ESCALA', escala], ['DATA', d.data], ['UNIDADE', 'metros'], ['Nº DO DESENHO', arq.num], ['REVISÃO', d.revisao], ['FOLHA', '1/1']].forEach(function (c, i) {
      rot(c[0], c4[i] + 5, lh[2] - 9); T.t(c[1], c4[i] + 5, lh[2] - 24, 8.5, { b: i === 3, max: c4[i + 1] - c4[i] - 8 });
    });
  }

  /** Carimbo das folhas A3 (faixa inferior em colunas). */
  async function carimboA3(doc, pg, T, d, arq, escala, folha) {
    const W = A3[0], y0 = 15, h = 78, cols = [15, 110, 380, 700, 915, W - 15];
    T.ret(15, y0, W - 30, h, { borderWidth: 1.2 });
    for (let i = 1; i < cols.length - 1; i++) T.lin(cols[i], y0, cols[i], y0 + h, 0.8);
    const rot = function (s, x, y) { T.t(s, x, y, 6.5, { cor: T.CIN }); };
    const lg = await logoImg(doc, d.logo);
    if (lg) { const k = Math.min(86 / lg.width, 60 / lg.height); pg.drawImage(lg, { x: 20 + (86 - lg.width * k) / 2, y: y0 + (h - lg.height * k) / 2, width: lg.width * k, height: lg.height * k }); }
    rot('EMPRESA / RESPONSÁVEL TÉCNICO', cols[1] + 7, y0 + h - 11); T.t(d.empresa, cols[1] + 7, y0 + h - 25, 9.5, { b: true, max: 255 });
    T.t(d.rtNome, cols[1] + 7, y0 + h - 39, 8.5, { max: 255 }); T.t(d.rtRegistro, cols[1] + 7, y0 + h - 51, 8.5, { max: 255 }); T.t('ART/TRT: ' + (d.art || '—'), cols[1] + 7, y0 + h - 63, 8.5);
    rot('PROPRIETÁRIO / LOCAL', cols[2] + 7, y0 + h - 11); T.t(d.cliente, cols[2] + 7, y0 + h - 25, 9.5, { b: true, max: 305 });
    linhas(T.fonte, d.endereco, 7.5, 305, 2).forEach(function (l, i) { T.t(l, cols[2] + 7, y0 + h - 38 - i * 9, 7.5); });
    T.t('UC: ' + (d.uc || '—') + '   ·   ' + d.distribuidora, cols[2] + 7, y0 + h - 63, 8.5, { max: 305 });
    rot('COORDENADAS', cols[3] + 7, y0 + h - 11); T.t('UTM ' + str(d.utm.fuso) + ' (SIRGAS 2000)', cols[3] + 7, y0 + h - 25, 8.5, { b: true });
    T.t('X: ' + str(d.utm.x) + '   Y: ' + str(d.utm.y), cols[3] + 7, y0 + h - 39, 8.5); if (d.latlon) T.t(d.latlon, cols[3] + 7, y0 + h - 51, 8);
    rot('FOLHA', cols[4] + 7, y0 + h - 11); T.t(arq.titulo, cols[4] + 7, y0 + h - 27, 12, { b: true, cor: T.AZ, max: W - 15 - cols[4] - 14 });
    T.t('Nº ' + arq.num + '   ·   Rev. ' + d.revisao, cols[4] + 7, y0 + h - 42, 8);
    T.t('Escala: ' + escala + '     Data: ' + d.data + '     Folha: ' + (folha || '1/1'), cols[4] + 7, y0 + h - 63, 8);
  }

  function latLonTxt(ll) { return Math.abs(ll.lat).toFixed(5).replace('.', ',') + '° ' + (ll.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(ll.lon).toFixed(5).replace('.', ',') + '° ' + (ll.lon < 0 ? 'O' : 'L'); }

  /** Imagem desenhada cobrindo o quadro (recorte central) — devolve a escala usada (pontos por pixel). */
  function cobrir(P, pg, img, x, y, w, h, larg, alt) {
    const k = Math.max(w / larg, h / alt), iw = larg * k, ih = alt * k;
    pg.pushOperators(P.pushGraphicsState(), P.rectangle(x, y, w, h), P.clip(), P.endPath());
    pg.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
    pg.pushOperators(P.popGraphicsState());
    return k;
  }
  function norte(P, pg, T, x, y) {
    pg.drawCircle({ x: x, y: y, size: 17, color: T.BR, opacity: 0.9, borderColor: T.PRETO, borderWidth: 0.6 });
    pg.drawSvgPath('M 0 -13 L 6 7 L 0 3 L -6 7 Z', { x: x, y: y, color: T.PRETO });
    T.t('N', x, y + 8, 7, { b: true, al: 'c' });
  }
  function escalaGrafica(P, pg, T, x, y, mPt) {
    const passos = [20, 50, 100, 200, 500];
    const L = passos.find(function (m) { return m / mPt >= 70; }) || 500, Lpt = L / mPt;
    pg.drawRectangle({ x: x - 6, y: y - 9, width: Lpt + 42, height: 24, color: T.BR, opacity: 0.9 });
    [0, 1, 2, 3].forEach(function (i) { pg.drawRectangle({ x: x + i * Lpt / 4, y: y, width: Lpt / 4, height: 4, color: i % 2 ? T.BR : T.PRETO, borderColor: T.PRETO, borderWidth: 0.5 }); });
    T.t('0', x - 2, y + 6, 6); T.t(String(L / 2), x + Lpt / 2, y + 6, 6, { al: 'c' }); T.t(L + ' m', x + Lpt - 6, y + 6, 6); T.t('Escala gráfica', x, y - 7, 5.5, { cor: T.CIN });
  }
  function pino(P, pg, T, x, y) {
    pg.drawSvgPath('M 0 0 C -9 -10 -11 -15 -11 -20 A 11 11 0 1 1 11 -20 C 11 -15 9 -10 0 0 Z', { x: x, y: y, color: T.VERM, borderColor: T.BR, borderWidth: 1.2 });
    pg.drawCircle({ x: x, y: y + 20, size: 4, color: T.BR });
  }

  /**
   * O mapa da planta (satélite com ruas) num quadro: imagem cobrindo o quadro, marcador da UC, quadros do padrão de entrada e da UC
   * com as linhas de chamada, norte, escala gráfica e o crédito da fonte. o: {qLarg (largura dos quadros), tam (letra)}.
   * Devolve a escala da imagem (pontos por pixel).
   */
  async function mapaComDados(P, doc, pg, T, f, m, x, y, w, h, d, ll, o) {
    o = o || {};
    const img = await doc.embedJpg(m.bytes);
    const k = cobrir(P, pg, img, x, y, w, h, m.larg, m.alt);
    T.ret(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2, comEscala = m.mPorPx > 0, tam = o.tam || 7.5, lh = tam + 3.5, qw = o.qLarg || 204;
    if (comEscala) pino(P, pg, T, cx, cy);
    const quadro = function (qx, qy, titulo, ls, alvo) {
      const qh = 16 + ls.length * lh;
      if (alvo) T.lin(alvo[0], alvo[1], qx, qy - qh / 2, 0.9);
      pg.drawRectangle({ x: qx, y: qy - qh, width: qw, height: qh, color: T.BR, borderWidth: 0.8, borderColor: T.PRETO });
      T.t(titulo, qx + 6, qy - 11, tam + 0.5, { b: true, cor: T.AZ });
      ls.forEach(function (l, i) { T.t(l, qx + 6, qy - 11 - (i + 1) * lh, tam, { max: qw - 12 }); });
      return qh;
    };
    const u = d.utm, lat = ll.lat.toFixed(6).replace('.', ','), lon = ll.lon.toFixed(6).replace('.', ',');
    const endCurto = d.endereco.replace(/,?\s*Cep:?\s*[\d.-]+/i, '');
    // quadros acima e à direita do marcador, sempre dentro do mapa
    const qx = Math.min(cx + w * 0.12, x + w - qw - 8), q1 = Math.min(cy + h * 0.30, y + h - 10);
    const h1 = quadro(qx, q1, 'PADRÃO DE ENTRADA', ['Latitude: ' + lat + '°   Longitude: ' + lon + '°', 'UTM (SIRGAS 2000) — Fuso ' + str(u.fuso), 'X: ' + str(u.x) + ' m   Y: ' + str(u.y) + ' m'],
      comEscala ? [cx + 3, cy + 22] : null);
    quadro(qx, q1 - h1 - 14, 'UNIDADE CONSUMIDORA', [d.cliente, 'UC: ' + (d.uc || '—') + '   ·   ' + d.distribuidora, endCurto], comEscala ? [cx + 8, cy + 14] : null);
    norte(P, pg, T, x + 30, y + h - 34);
    if (comEscala) escalaGrafica(P, pg, T, x + 12, y + 26, m.mPorPx / k);
    if (m.credito) {
      const wc = f.widthOfTextAtSize(wa(m.credito), 5.5) + 6;
      pg.drawRectangle({ x: x + w - wc, y: y, width: wc, height: 10, color: T.BR, opacity: 0.85 });
      T.t(m.credito, x + w - 3, y + 3, 5.5, { al: 'r' });
    }
    return { k: k, comEscala: comEscala };
  }

  /** Mapa de situação (a cidade) com a área da planta marcada. */
  async function situacao(P, doc, pg, T, s, m, mk, x, y, w, h, area) {
    const sit = await doc.embedJpg(s.bytes);
    const ks = cobrir(P, pg, sit, x, y, w, h, s.larg, s.alt);
    T.ret(x, y, w, h);
    if (m.mPorPx > 0) {
      const aw = area[0] / mk * m.mPorPx / s.mPorPx * ks, ah = area[1] / mk * m.mPorPx / s.mPorPx * ks;
      pg.drawRectangle({ x: x + w / 2 - aw / 2, y: y + h / 2 - ah / 2, width: Math.max(aw, 3), height: Math.max(ah, 3), borderColor: T.VERM, borderWidth: 1.2 });
    }
    T.t(s.credito, x + 3, y + 3, 5, { cor: T.CIN });
  }

  /** Folha A4 da planta de localização. m: mapa principal; s: mapa de situação (ou null). */
  async function plantaA4(P, doc, f, fb, d, ll, m, s, arq) {
    const W = A4[0], H = A4[1], pg = doc.addPage(A4);
    const T = Object.assign(ferramentas(P, pg, f, fb), { fonte: f });
    T.ret(20, 20, W - 40, H - 40, { borderWidth: 1 });
    const mx = 28, my = 186, mw = W - 56, mh = H - 28 - my;
    const r = await mapaComDados(P, doc, pg, T, f, m, mx, my, mw, mh, d, ll);
    if (s) {
      // no canto de baixo, à direita (acima do crédito do mapa)
      const sw = 150, sh = sw * s.alt / s.larg, sx = mx + mw - sw - 8, sy = my + 16;
      pg.drawRectangle({ x: sx - 2, y: sy - 2, width: sw + 4, height: sh + 16, color: T.BR, borderColor: T.PRETO, borderWidth: 0.7 });
      T.t('SITUAÇÃO', sx + 2, sy + sh + 4, 6.5, { b: true });
      await situacao(P, doc, pg, T, s, m, r.k, sx, sy, sw, sh, [mw, mh]);
    }
    await carimboA4(doc, pg, T, f, d, arq, r.comEscala ? 'Gráfica' : 'Sem escala');
  }

  /**
   * Folha A3 da planta de localização: o mapa da A4 (satélite com ruas, quadros, norte e escala) ocupando a esquerda e, na coluna
   * da direita, com a mesma largura, o mapa de situação, os dados da localização e o croqui do projeto.
   */
  async function plantaA3(P, doc, f, fb, d, ll, m, s, emb, arq) {
    const W = A3[0], H = A3[1], pg = doc.addPage(A3);
    const T = Object.assign(ferramentas(P, pg, f, fb), { fonte: f });
    T.ret(15, 15, W - 30, H - 30, { borderWidth: 1.2 });
    T.t('PLANTA DE LOCALIZAÇÃO', 30, H - 45, 18, { b: true, cor: T.AZ });
    T.t(d.endereco + '   ·   ' + latLonTxt(ll) + '   ·   UTM ' + str(d.utm.fuso) + '  X ' + str(d.utm.x) + '  Y ' + str(d.utm.y), 30, H - 62, 8.5, { cor: T.CIN, max: W - 60 });
    const topo = H - 74, base = 108, gap = 14;
    // mapa principal à esquerda, da base ao topo
    const mx = 30, mw = 770, my = base, mh = topo - base;
    const r = await mapaComDados(P, doc, pg, T, f, m, mx, my, mw, mh, d, ll, { qLarg: 236, tam: 8.5 });
    // coluna da direita
    const cx = mx + mw + 16, cw = W - 30 - cx, tit = function (t, y) { T.t(t, cx, y + 5, 9.5, { b: true }); };
    let y = topo;
    if (s) {
      const sh = Math.round(cw * 0.70);
      y -= 16; tit('SITUAÇÃO — ' + (d.cidadeObra || 'MUNICÍPIO'), y - 1);
      await situacao(P, doc, pg, T, s, m, r.k, cx, y - sh - 4, cw, sh, [mw, mh]);
      y -= sh + 4 + gap;
    }
    // dados da localização
    const dados = [['Latitude', ll.lat.toFixed(6).replace('.', ',') + '°'], ['Longitude', ll.lon.toFixed(6).replace('.', ',') + '°'],
      ['UTM (SIRGAS 2000)', 'Fuso ' + str(d.utm.fuso) + '  ·  X ' + str(d.utm.x) + '  ·  Y ' + str(d.utm.y)], ['Unidade consumidora', (d.uc || '—') + '   ·   ' + d.distribuidora]];
    const dh = 16 + dados.length * 15;
    y -= 16; tit('DADOS DA LOCALIZAÇÃO', y - 1);
    T.ret(cx, y - dh - 4, cw, dh);
    dados.forEach(function (l, i) {
      const yy = y - 4 - 14 - i * 15;
      T.t(l[0], cx + 7, yy, 7, { cor: T.CIN });
      T.t(l[1], cx + 92, yy, 8.5, { b: i === 3, max: cw - 98 });
    });
    y -= dh + 4 + gap;
    // croqui do projeto (vetor), no espaço que sobra até a base
    if (emb) {
      const c = E.RECORTE.croqui, disp = y - 16 - base, kc = Math.min(cw / (c[2] - c[0]), disp / (c[3] - c[1]));
      const cwi = (c[2] - c[0]) * kc, chi = (c[3] - c[1]) * kc;
      y -= 16; tit('CROQUI DE LOCALIZAÇÃO (DO PROJETO)', y - 1);
      const yc = y - 4 - chi;
      pg.drawRectangle({ x: cx, y: base, width: cw, height: y - 4 - base, borderWidth: 0.7, borderColor: T.PRETO });
      pg.drawPage(emb, { x: cx + (cw - cwi) / 2, y: Math.max(base, yc - (yc - base) / 2), width: cwi, height: chi });
    }
    await carimboA3(doc, pg, T, Object.assign({ latlon: latLonTxt(ll) }, d), arq, r.comEscala ? 'gráfica' : 'sem escala');
  }

  /** Folha(s) A3 dos diagramas recortados da prancha A de uma folha. */
  async function diagramas(P, doc, f, fb, d, src, comArm, ll, arq) {
    const W = A3[0], H = A3[1];
    const folhas = [{ r: E.RECORTE.diagramas, titulo: 'DIAGRAMAS UNIFILAR E MULTIFILAR', mascara: E.RECORTE.blocos }];
    if (comArm) folhas.push({ r: E.RECORTE.armazenamento, titulo: 'DIAGRAMA DO ARMAZENAMENTO (BATERIAS)' });
    for (let i = 0; i < folhas.length; i++) {
      const fo = folhas[i], c = fo.r, pg = doc.addPage(A3);
      const T = Object.assign(ferramentas(P, pg, f, fb), { fonte: f });
      T.ret(15, 15, W - 30, H - 30, { borderWidth: 1.2 });
      T.t(fo.titulo, 30, H - 48, 18, { b: true, cor: T.AZ });
      const emb = await doc.embedPage(src.getPage(0), { left: c[0], bottom: c[1], right: c[2], top: c[3] });
      const aw = W - 60, ah = H - 60 - 112, k = Math.min(aw / (c[2] - c[0]), ah / (c[3] - c[1]));
      const w = (c[2] - c[0]) * k, h = (c[3] - c[1]) * k, x = (W - w) / 2, y = 108;
      pg.drawPage(emb, { x: x, y: y, width: w, height: h });
      if (fo.mascara) { const mk = fo.mascara; pg.drawRectangle({ x: x + (mk[0] - c[0]) * k, y: y + (mk[1] - c[1]) * k, width: (mk[2] - mk[0]) * k + 1, height: (mk[3] - mk[1]) * k + 1, color: T.BR }); }
      await carimboA3(doc, pg, T, Object.assign({ latlon: latLonTxt(ll) }, d), arq, 'sem escala', (i + 1) + '/' + folhas.length);
    }
  }

  async function novoDoc(P, titulo, d) {
    const doc = await P.PDFDocument.create();
    const f = await doc.embedFont(P.StandardFonts.Helvetica), fb = await doc.embedFont(P.StandardFonts.HelveticaBold);
    doc.setTitle(titulo + ' — ' + (d.cliente || '') + (d.uc ? ' — UC ' + d.uc : ''));
    doc.setProducer('CRM Solar'); doc.setCreator('CRM Solar — arquivos para a distribuidora');
    return { doc: doc, f: f, fb: fb };
  }

  async function bytesDe(blob) { return new Uint8Array(await blob.arrayBuffer()); }

  /** Mapas da planta: o principal (e, no A3, o de ruas) e o de situação. */
  async function mapasDaPlanta(pr, ctx, ll, modelo, avisos) {
    const Ma = App.Mapas, pl = pr.planta || {}, emp = (ctx && ctx.empresa) || {};
    let foto = null;
    if (pl.fonte === 'imagem' && pl.fotoId && App.Fotos) { const x = await App.Fotos.obter(pl.fotoId); foto = x && x.dataURL; }
    const zoom = Math.round(U.num(pl.zoom)) || Ma.ZOOM_PADRAO;
    const o = { lat: ll.lat, lon: ll.lon, zoom: zoom, fonte: pl.fonte || '', empresa: emp, imagemDataURL: foto };
    // A4 em pé: 1100 × 1280; A3 deitado: 1280 × 1110 (no Google, 640 × 555 com escala 2)
    const m = await Ma.imagem(Object.assign({}, o, modelo === 'a3' ? { larg: 1280, alt: 1110 } : { larg: 1100, alt: 1280 }));
    if (m.aviso) avisos.push(m.aviso);
    let s = null;
    try { s = modelo === 'a3' ? await Ma.situacao(ll.lat, ll.lon, 720, 504, 14) : await Ma.situacao(ll.lat, ll.lon, 520, 400, 13); } catch (e) { avisos.push('Mapa de situação indisponível (' + e.message + ').'); }
    return { m: m, s: s };
  }

  /**
   * Gera os arquivos: {arquivos: [{id, nome, titulo, blob, paginas}], avisos}. o: {ctx, distribuidora, so: ['planta'|'projeto'|'diagramas']}.
   */
  E.gerar = async function (pr, o) {
    o = o || {};
    const ctx = o.ctx;
    await App.PranchasPdf.carregarLibs();
    const P = window.PDFLib, Pr = App.Pranchas;
    const ll = E.coordenadas(pr);
    if (!ll) throw new Error('Informe as coordenadas da UC na prancha (UTM ou GPS) para gerar a planta de localização.');
    const d = E.dadosCarimbo(pr, ctx, o), avisos = [], so = o.so || ['planta', 'projeto', 'diagramas'], arqs = [];
    const arq = function (id) { return E.ARQUIVOS.find(function (x) { return x.id === id; }); };
    // projeto elétrico: a prancha como configurada; a prancha A de uma folha dá os recortes (diagramas e croqui)
    let proj = null;
    if (so.indexOf('projeto') >= 0) proj = await App.PranchasPdf.gerar(pr, { ctx: ctx });
    const precisaA1 = so.indexOf('diagramas') >= 0 || (so.indexOf('planta') >= 0 && (pr.planta && pr.planta.modelo) === 'a3');
    let a1 = null;
    if (precisaA1) {
      const mesma = proj && Pr.estilosDe(pr).join() === 'A' && Pr.folhasA(pr) === 1;
      const b = mesma ? proj.blob : (await App.PranchasPdf.gerar(Object.assign(U.clone(pr), { estilo: 'A', folhasA: '1' }), { ctx: ctx })).blob;
      a1 = await P.PDFDocument.load(await bytesDe(b));
    }
    if (so.indexOf('planta') >= 0) {
      const modelo = (pr.planta && pr.planta.modelo) === 'a3' ? 'a3' : 'a4', a = arq('planta');
      const mp = await mapasDaPlanta(pr, ctx, ll, modelo, avisos);
      const n = await novoDoc(P, 'Planta de localização', d);
      if (modelo === 'a3') {
        const c = E.RECORTE.croqui, emb = a1 ? await n.doc.embedPage(a1.getPage(0), { left: c[0], bottom: c[1], right: c[2], top: c[3] }) : null;
        await plantaA3(P, n.doc, n.f, n.fb, d, ll, mp.m, mp.s, emb, a);
      } else await plantaA4(P, n.doc, n.f, n.fb, d, ll, mp.m, mp.s, a);
      arqs.push({ id: 'planta', titulo: a.titulo, nome: E.nomeArquivo(pr, 'planta'), blob: new Blob([await n.doc.save()], { type: 'application/pdf' }), paginas: 1 });
    }
    if (proj) arqs.push({ id: 'projeto', titulo: arq('projeto').titulo, nome: E.nomeArquivo(pr, 'projeto'), blob: proj.blob, paginas: proj.paginas });
    if (so.indexOf('diagramas') >= 0) {
      const a = arq('diagramas'), n = await novoDoc(P, 'Diagramas unifilar e multifilar', d), comArm = !!(Pr.comBaterias && Pr.comBaterias(pr));
      await diagramas(P, n.doc, n.f, n.fb, d, a1, comArm, ll, a);
      arqs.push({ id: 'diagramas', titulo: a.titulo, nome: E.nomeArquivo(pr, 'diagramas'), blob: new Blob([await n.doc.save()], { type: 'application/pdf' }), paginas: comArm ? 2 : 1 });
    }
    return { arquivos: arqs, avisos: avisos };
  };

  /** Os arquivos num ZIP (para guardar ou enviar de uma vez). */
  E.zip = async function (arquivos) {
    const z = new App.Zip();
    for (const a of arquivos) z.add(a.nome, new Uint8Array(await a.blob.arrayBuffer()));
    return z.gerar('application/zip');
  };

  App.PranchasEnergisa = E;
})(window.App);
