/* Gráfico de barras "Consumo × Geração Mensal Estimada" desenhado em canvas (mesmo estilo do modelo de proposta). */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const FONTE = '"DejaVu Sans", "Segoe UI", Arial, sans-serif';

  function passoBonito(max, alvoTicks) {
    const bruto = max / alvoTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n = bruto / mag;
    const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return f * mag;
  }

  /**
   * Desenha o gráfico no canvas informado.
   * @param {HTMLCanvasElement} cv
   * @param {{consumo:number[], geracao:number[], titulo:string}} d
   */
  function desenhar(cv, d) {
    const W = cv.width, H = cv.height;
    const k = W / 1800; // escala relativa ao tamanho de referência 1800×750
    const g = cv.getContext('2d');
    g.save();
    g.fillStyle = '#F8FAFC';
    g.fillRect(0, 0, W, H);

    const m = { l: 100 * k, r: 18 * k, t: 62 * k, b: 82 * k };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;

    // Título
    g.fillStyle = '#1E3A8A';
    g.font = 'bold ' + Math.round(26 * k) + 'px ' + FONTE;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.titulo || 'Consumo × Geração Mensal Estimada', m.l + pw / 2, 28 * k);

    const vals = d.consumo.concat(d.geracao).filter(function (v) { return isFinite(v); });
    const vmax = Math.max.apply(null, vals.concat([1]));
    const passo = passoBonito(vmax * 1.05, 8);
    const topo = Math.ceil((vmax * 1.05) / passo) * passo;
    const y = function (v) { return m.t + ph - (v / topo) * ph; };

    // Grade e rótulos do eixo Y
    g.font = Math.round(19 * k) + 'px ' + FONTE;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; v <= topo + 1e-9; v += passo) {
      const yy = Math.round(y(v)) + 0.5;
      if (v > 0) {
        g.strokeStyle = '#E5E7EB';
        g.lineWidth = 1.5 * k;
        g.beginPath(); g.moveTo(m.l, yy); g.lineTo(m.l + pw, yy); g.stroke();
      }
      g.fillStyle = '#374151';
      g.fillText(U.fmtSmart(v, 1), m.l - 12 * k, yy);
    }

    // Barras
    const grupos = 12;
    const gw = pw / (grupos + 0.6);
    const bw = gw * 0.35;
    const x0 = m.l + gw * 0.8;
    for (let i = 0; i < grupos; i++) {
      const cx = x0 + i * gw;
      const c = d.consumo[i] || 0, ge = d.geracao[i] || 0;
      g.fillStyle = '#6B7280';
      g.fillRect(cx - bw, y(c), bw, y(0) - y(c));
      g.fillStyle = '#3B82F6';
      g.fillRect(cx, y(ge), bw, y(0) - y(ge));
      g.fillStyle = '#374151';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.font = Math.round(19 * k) + 'px ' + FONTE;
      g.fillText(U.MESES[i], cx, y(0) + 12 * k);
    }

    // Eixos (sem bordas superior e direita)
    g.strokeStyle = '#1F2937';
    g.lineWidth = 2 * k;
    g.beginPath();
    g.moveTo(m.l, m.t - 4 * k); g.lineTo(m.l, y(0)); g.lineTo(m.l + pw, y(0));
    g.stroke();

    // Títulos dos eixos
    g.fillStyle = '#374151';
    g.font = Math.round(21 * k) + 'px ' + FONTE;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText('Mês', m.l + pw / 2, H - 10 * k);
    g.save();
    g.translate(28 * k, m.t + ph / 2);
    g.rotate(-Math.PI / 2);
    g.textBaseline = 'middle';
    g.fillText('Energia (kWh)', 0, 0);
    g.restore();

    // Legenda
    const itens = [['#6B7280', 'Consumo (kWh)'], ['#3B82F6', 'Geração Estimada (kWh)']];
    g.font = Math.round(19 * k) + 'px ' + FONTE;
    const lw = Math.max.apply(null, itens.map(function (it) { return g.measureText(it[1]).width; })) + 70 * k;
    const lh = 30 * k;
    const lx = m.l + pw / 2 - lw / 2, ly = m.t + 6 * k;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.strokeStyle = '#D1D5DB';
    g.lineWidth = 1.5 * k;
    g.beginPath();
    g.rect(lx, ly, lw, lh * itens.length + 14 * k);
    g.fill(); g.stroke();
    itens.forEach(function (it, i) {
      const yy = ly + 7 * k + lh * i + lh / 2;
      g.fillStyle = it[0];
      g.fillRect(lx + 12 * k, yy - 8 * k, 36 * k, 16 * k);
      g.fillStyle = '#111827';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(it[1], lx + 58 * k, yy);
    });
    g.restore();
  }

  /** Gera o PNG do gráfico (Uint8Array) com 1800×750 px. */
  function png(d) {
    const cv = document.createElement('canvas');
    cv.width = 1800;
    cv.height = 750;
    desenhar(cv, d);
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) {
        if (!b) { rej(new Error('Falha ao gerar a imagem do gráfico.')); return; }
        b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }, rej);
      }, 'image/png');
    });
  }

  App.Chart = { desenhar: desenhar, png: png };
})(window.App);
