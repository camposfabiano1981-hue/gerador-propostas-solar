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
  E.MODELOS_PLANTA = [{ v: 'a4', t: 'A4 em pé — satélite com ruas, quadros, norte, escala e situação' }, { v: 'a3', t: 'A3 deitado — mapa de ruas, satélite e o croqui do projeto' }];
  // trechos da prancha A de uma folha (pontos do modelo): diagramas com as legendas, o canto do diagrama de blocos que entra no recorte
  // (coberto de branco), o diagrama do armazenamento (híbrido/off-grid) e o croqui de localização
  E.RECORTE = { diagramas: [150, 845, 1295, 1640], blocos: [1277, 1440, 1295, 1640], armazenamento: [1298, 826, 1854, 1038], croqui: [1340, 1105, 1858, 1445] };
  const A4 = [595.28, 841.89], A3 = [1190.55, 841.89];

  function str(v) { return v == null ? '' : String(v).trim(); }
  /** Texto nas fontes padrão do PDF (WinAnsi): o que não existe nelas sai do texto. */
  function wa(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, ''); }
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
    return {
      empresa: str(emp.razao) || str(emp.nomeCurto), logo: emp.logo || App.LOGO_PADRAO || null, cidade: [str(emp.cidade), str(emp.uf)].filter(Boolean).join('/'),
      rtNome: ef.rtNome, rtRegistro: ef.rtRegistro, art: str(pr.art), cliente: str(cli.nome), endereco: end, uc: str(pr.uc),
      distribuidora: str(o.distribuidora) || 'Energisa', data: App.Pranchas.fmt.dataBR(pr.data), revisao: str(pr.revisao) || '0',
      utm: pr.utm || {}
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

  /** Folha A4 da planta de localização. m: mapa principal; s: mapa de situação (ou null). */
  async function plantaA4(P, doc, f, fb, d, ll, m, s, arq) {
    const W = A4[0], H = A4[1], pg = doc.addPage(A4);
    const T = Object.assign(ferramentas(P, pg, f, fb), { fonte: f });
    T.ret(20, 20, W - 40, H - 40, { borderWidth: 1 });
    const mx = 28, my = 186, mw = W - 56, mh = H - 28 - my;
    const img = await doc.embedJpg(m.bytes);
    const k = cobrir(P, pg, img, mx, my, mw, mh, m.larg, m.alt);
    T.ret(mx, my, mw, mh);
    const cx = mx + mw / 2, cy = my + mh / 2, comEscala = m.mPorPx > 0;
    if (comEscala) pino(P, pg, T, cx, cy);
    const quadro = function (x, y, w, titulo, ls, alvo) {
      const h = 16 + ls.length * 11;
      if (alvo) T.lin(alvo[0], alvo[1], x, y - h / 2, 0.9);
      pg.drawRectangle({ x: x, y: y - h, width: w, height: h, color: T.BR, borderWidth: 0.8, borderColor: T.PRETO });
      T.t(titulo, x + 6, y - 11, 8, { b: true, cor: T.AZ });
      ls.forEach(function (l, i) { T.t(l, x + 6, y - 22 - i * 11, 7.5, { max: w - 12 }); });
    };
    const u = d.utm, qx = Math.min(cx + 70, mx + mw - 212), lat = ll.lat.toFixed(6).replace('.', ','), lon = ll.lon.toFixed(6).replace('.', ',');
    quadro(qx, Math.min(cy + 190, my + mh - 12), 204, 'PADRÃO DE ENTRADA', ['Latitude: ' + lat + '°   Longitude: ' + lon + '°', 'UTM (SIRGAS 2000) — Fuso ' + str(u.fuso),
      'X: ' + str(u.x) + ' m   Y: ' + str(u.y) + ' m'], comEscala ? [cx + 3, cy + 22] : null);
    const endCurto = d.endereco.replace(/,?\s*Cep:?\s*[\d.-]+/i, '');
    quadro(qx, Math.min(cy + 110, my + mh - 92), 204, 'UNIDADE CONSUMIDORA', [d.cliente, 'UC: ' + (d.uc || '—') + '   ·   ' + d.distribuidora, endCurto], comEscala ? [cx + 8, cy + 14] : null);
    norte(P, pg, T, mx + 30, my + mh - 40);
    if (comEscala) escalaGrafica(P, pg, T, mx + 12, my + 26, m.mPorPx / k);
    if (s) {
      const sit = await doc.embedJpg(s.bytes);
      const sw = 150, sh = sw * s.alt / s.larg, sx = mx + mw - sw - 8, sy = my + 8;
      pg.drawRectangle({ x: sx - 2, y: sy - 2, width: sw + 4, height: sh + 16, color: T.BR, borderColor: T.PRETO, borderWidth: 0.7 });
      pg.drawImage(sit, { x: sx, y: sy, width: sw, height: sh });
      T.t('SITUAÇÃO', sx + 2, sy + sh + 4, 6.5, { b: true });
      if (comEscala) {
        // área da planta no mapa de situação
        const ks = sw / s.larg, aw = (mw / k) * m.mPorPx / s.mPorPx * ks, ah = (mh / k) * m.mPorPx / s.mPorPx * ks;
        pg.drawRectangle({ x: sx + sw / 2 - aw / 2, y: sy + sh / 2 - ah / 2, width: Math.max(aw, 3), height: Math.max(ah, 3), borderColor: T.VERM, borderWidth: 1.2 });
      }
      T.t(s.credito, sx + 2, sy + 2, 5, { cor: T.CIN });
    }
    if (m.credito) {
      const wc = f.widthOfTextAtSize(wa(m.credito), 5) + 6;
      pg.drawRectangle({ x: mx, y: my, width: wc, height: 10, color: T.BR, opacity: 0.85 });
      T.t(m.credito, mx + 3, my + 3, 5);
    }
    await carimboA4(doc, pg, T, f, d, arq, comEscala ? 'Gráfica' : 'Sem escala');
  }

  /** Folha A3 da planta de localização: mapa de ruas, satélite e o croqui do projeto. */
  async function plantaA3(P, doc, f, fb, d, ll, ruas, sat, emb, arq) {
    const W = A3[0], H = A3[1], pg = doc.addPage(A3);
    const T = Object.assign(ferramentas(P, pg, f, fb), { fonte: f });
    T.ret(15, 15, W - 30, H - 30, { borderWidth: 1.2 });
    T.t('PLANTA DE LOCALIZAÇÃO', 30, H - 48, 18, { b: true, cor: T.AZ });
    T.t('Endereço: ' + d.endereco + '   ·   Coordenadas: ' + latLonTxt(ll) + '   ·   UTM ' + str(d.utm.fuso) + '  X ' + str(d.utm.x) + '  Y ' + str(d.utm.y), 30, H - 66, 8.5, { cor: T.CIN, max: W - 60 });
    const mx = 30, my = 112, mw = 705, mh = Math.min(H - 92 - my, mw * ruas.alt / ruas.larg);
    T.t('MAPA DE LOCALIZAÇÃO — RUAS', mx, my + mh + 8, 10, { b: true });
    const ir = await doc.embedJpg(ruas.bytes);
    const k = cobrir(P, pg, ir, mx, my, mw, mh, ruas.larg, ruas.alt);
    T.ret(mx, my, mw, mh, { borderWidth: 0.8 });
    pino(P, pg, T, mx + mw / 2, my + mh / 2);
    norte(P, pg, T, mx + mw - 30, my + mh - 34);
    escalaGrafica(P, pg, T, mx + 12, my + 26, ruas.mPorPx / k);
    if (ruas.credito) T.t(ruas.credito, mx + mw - 4, my + 4, 6, { al: 'r', cor: T.CIN });
    const sx = 755, sw = W - 30 - sx, sh = sw * 0.68, sy = H - 92 - sh;
    T.t('IMAGEM DE SATÉLITE', sx, sy + sh + 8, 10, { b: true });
    const is = await doc.embedJpg(sat.bytes);
    cobrir(P, pg, is, sx, sy, sw, sh, sat.larg, sat.alt);
    T.ret(sx, sy, sw, sh, { borderWidth: 0.8 });
    if (sat.mPorPx > 0) pino(P, pg, T, sx + sw / 2, sy + sh / 2);
    if (sat.credito) { const wc = f.widthOfTextAtSize(wa(sat.credito), 5.5) + 6; pg.drawRectangle({ x: sx + sw - wc, y: sy, width: wc, height: 10, color: T.BR, opacity: 0.85 }); T.t(sat.credito, sx + sw - 3, sy + 3, 5.5, { al: 'r' }); }
    if (emb) {
      const c = E.RECORTE.croqui, kc = Math.min(sw / (c[2] - c[0]), (sy - 30 - 112) / (c[3] - c[1])), cw = (c[2] - c[0]) * kc, ch = (c[3] - c[1]) * kc;
      T.t('CROQUI DE LOCALIZAÇÃO (DO PROJETO)', sx, 112 + ch + 8, 10, { b: true });
      pg.drawPage(emb, { x: sx, y: 112, width: cw, height: ch });
      T.ret(sx, 112, cw, ch, { borderWidth: 0.8 });
    }
    await carimboA3(doc, pg, T, Object.assign({ latlon: latLonTxt(ll) }, d), arq, 'indicada');
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
    if (modelo === 'a3') {
      const sat = await Ma.imagem(Object.assign({}, o, { larg: 1000, alt: 680 }));
      if (sat.aviso) avisos.push(sat.aviso);
      const ruas = await Ma.imagem(Object.assign({}, o, { fonte: 'osm', zoom: Math.min(19, zoom + 1), larg: 1400, alt: 1040 }));
      return { sat: sat, ruas: ruas };
    }
    const m = await Ma.imagem(Object.assign({}, o, { larg: 1100, alt: 1280 }));
    if (m.aviso) avisos.push(m.aviso);
    let s = null;
    try { s = await Ma.situacao(ll.lat, ll.lon, 520, 400, 13); } catch (e) { avisos.push('Mapa de situação indisponível (' + e.message + ').'); }
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
        await plantaA3(P, n.doc, n.f, n.fb, d, ll, mp.ruas, mp.sat, emb, a);
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
