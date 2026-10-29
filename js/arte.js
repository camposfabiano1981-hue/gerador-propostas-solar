/*
 * Artes da proposta desenhadas em canvas (iguais no Word e no PDF): faixa da capa com o sol da marca e a
 * ilustração "Como funciona" (com ou sem baterias). Desenhos próprios, em traço simples.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const FONTE = '"DejaVu Sans", "Segoe UI", Arial, sans-serif';
  const AZUL = '#1E3A8A', AZUL2 = '#2563EB', OURO = '#F6A81C', VERDE = '#15803D';

  function canvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /**
   * Faixa da capa: arco azul que sobe do rodapé, com o sol dourado em círculos concêntricos à direita.
   * A última faixa de pixels é azul sólido (#1E3A8A), para emendar com o quadro azul da capa logo abaixo.
   */
  function faixaCapa() {
    const W = 1800, H = 520;
    const cv = canvas(W, H);
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    const base = H * 0.58;
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, base + 70);
    g.bezierCurveTo(W * 0.3, base - 150, W * 0.7, base - 150, W, base + 70);
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = AZUL;
    g.fill();
    const cx = W * 0.84, cy = H * 0.42;
    [0, 1, 2, 3].forEach(function (i) {
      g.beginPath();
      g.arc(cx, cy, 120 + i * 62, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(246, 168, 28, ' + (0.9 - i * 0.2) + ')';
      g.lineWidth = 6;
      g.stroke();
    });
    g.beginPath();
    g.arc(cx, cy, 72, 0, Math.PI * 2);
    g.fillStyle = OURO;
    g.fill();
    // emenda: base reta e sólida
    g.fillStyle = AZUL;
    g.fillRect(0, H - 6, W, 6);
    return { dataURL: cv.toDataURL('image/png'), proporcao: H / W };
  }

  function numero(g, x, y, n) {
    g.beginPath();
    g.arc(x, y, 38, 0, Math.PI * 2);
    g.fillStyle = OURO;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#FFFFFF';
    g.stroke();
    g.fillStyle = '#1F2937';
    g.font = 'bold 42px ' + FONTE;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), x, y + 2);
  }

  function linha(g, d, cor, larg, tracejado) {
    const p = new Path2D(d);
    g.save();
    g.strokeStyle = cor;
    g.lineWidth = larg;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (tracejado) g.setLineDash(tracejado);
    g.stroke(p);
    g.restore();
  }

  function forma(g, d, preenchimento, contorno, larg) {
    const p = new Path2D(d);
    if (preenchimento) { g.fillStyle = preenchimento; g.fill(p); }
    if (contorno) { g.strokeStyle = contorno; g.lineWidth = larg || 2; g.stroke(p); }
    return p;
  }

  /**
   * Ilustração "Como funciona": sol, módulos no telhado, inversor, consumo da casa, medidor bidirecional e rede,
   * com os passos numerados. Com `bateria`, mostra o banco de baterias ao lado do inversor.
   * Coordenadas em uma base 720 × 330 (desenhada em escala 2,5).
   */
  function comoFunciona(o) {
    o = o || {};
    const E = 2.5, W = 720 * E, H = 330 * E;
    const cv = canvas(W, H);
    const g = cv.getContext('2d');
    g.scale(E, E);
    // céu e chão
    const ceu = g.createLinearGradient(0, 0, 0, 330);
    ceu.addColorStop(0, '#DBEAFE');
    ceu.addColorStop(1, '#F8FAFC');
    g.fillStyle = ceu;
    g.fillRect(0, 0, 720, 330);
    g.fillStyle = '#D1FAE5';
    g.fillRect(0, 268, 720, 62);
    linha(g, 'M0 268H720', '#A7F3D0', 3);
    // sol e raios de luz
    g.save();
    g.translate(78, 70);
    g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fillStyle = OURO; g.fill();
    for (let a = 0; a < 360; a += 45) {
      g.save(); g.rotate(a * Math.PI / 180); linha(g, 'M0 -42V-54', OURO, 6); g.restore();
    }
    g.restore();
    linha(g, 'M112 92 L232 142', OURO, 3, [7, 7]);
    // casa
    forma(g, 'M180 268V170h210v98z', '#FFFFFF', '#CBD5E1', 2);
    forma(g, 'M160 176L285 96l125 80z', '#E2E8F0', '#94A3B8', 2);
    const telhado = forma(g, 'M205 158L285 107l81 51z', '#1D4ED8', null);
    g.save();
    g.clip(telhado);
    g.strokeStyle = '#93C5FD';
    g.lineWidth = 1.4;
    for (let x = 205; x < 370; x += 22) { g.beginPath(); g.moveTo(x, 100); g.lineTo(x, 160); g.stroke(); }
    for (let y = 107; y < 160; y += 16) { g.beginPath(); g.moveTo(200, y); g.lineTo(370, y); g.stroke(); }
    g.restore();
    forma(g, 'M205 158L285 107l81 51z', null, AZUL, 2);
    forma(g, 'M270 210h34v58h-34z', '#CBD5E1');
    forma(g, 'M205 196h40v32h-40z', '#BFDBFE', '#94A3B8', 1);
    // inversor (e baterias)
    forma(g, 'M330 198h34v44h-34z', AZUL);
    linha(g, 'M340 212h14M340 220h10', '#93C5FD', 3);
    linha(g, 'M347 158V198', '#EF4444', 3);
    linha(g, 'M347 242V256H316', AZUL2, 3);
    if (o.bateria) {
      forma(g, 'M296 226h26v42h-26z', '#0F766E');
      forma(g, 'M303 222h12v4h-12z', '#0F766E');
      linha(g, 'M302 240h14M302 250h14', '#99F6E4', 3);
      linha(g, 'M322 236H330', '#0F766E', 3);
    }
    // medidor e rede
    linha(g, 'M390 238H470', AZUL2, 3);
    forma(g, 'M480 208h46a10 10 0 0 1 10 10v40a10 10 0 0 1 -10 10h-46a10 10 0 0 1 -10 -10v-40a10 10 0 0 1 10 -10z', '#FFFFFF', AZUL, 3);
    linha(g, 'M484 230h38M522 230l-7-6M522 230l-7 6M522 248h-38M484 248l7-6M484 248l7 6', VERDE, 3);
    linha(g, 'M536 238H618', AZUL2, 3, [8, 6]);
    linha(g, 'M640 268V92M612 108h56M618 132h44', '#475569', 7);
    linha(g, 'M640 92 C690 110 700 160 720 170', '#475569', 2);
    // créditos
    forma(g, 'M549 120h60a9 9 0 0 1 9 9v22a9 9 0 0 1 -9 9h-60a9 9 0 0 1 -9 -9v-22a9 9 0 0 1 9 -9z', '#ECFDF5', VERDE, 2);
    g.fillStyle = VERDE;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = 'bold 12px ' + FONTE;
    g.fillText('CRÉDITOS', 579, 137);
    g.font = '12px ' + FONTE;
    g.fillText('em kWh', 579, 152);
    // passos numerados (escala do desenho: o raio do número é 15)
    g.save();
    g.scale(1 / E, 1 / E);
    const pts = [[255, 92], [372, 190], [214, 252], [503, 198], [668, 228]];
    if (o.bateria) pts.push([290, 214]);
    pts.forEach(function (p, i) { numero(g, p[0] * E, p[1] * E, i + 1); });
    g.restore();
    return { dataURL: cv.toDataURL('image/png'), proporcao: H / W };
  }

  App.Arte = { faixaCapa: faixaCapa, comoFunciona: comoFunciona };
})(window.App);
