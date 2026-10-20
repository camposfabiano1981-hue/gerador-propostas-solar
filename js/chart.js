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

  /** Gera o gráfico como PNG (data URL) com 1800×750 px — usado no .docx e no PDF. */
  function dataURL(d) {
    const cv = document.createElement('canvas');
    cv.width = 1800;
    cv.height = 750;
    desenhar(cv, d);
    return cv.toDataURL('image/png');
  }

  /**
   * Gráfico "Estimativa de produção mensal" do contrato: barras de geração com rótulos, linha tracejada do consumo
   * contratado e quadro-resumo (total, média, melhor e pior mês).
   * @param {HTMLCanvasElement} cv
   * @param {{meses:number[], consumo:number, titulo:string, subtitulo:string, rodape:string}} d
   */
  function desenharProducao(cv, d) {
    const W = cv.width, H = cv.height;
    const k = W / 1800;
    const AZUL = '#0D5B8F', LARANJA = '#E8A020';
    const g = cv.getContext('2d');
    const px = function (v) { return Math.round(v * k * 1.2) + 'px '; }; // textos legíveis com a imagem em ~14,7 cm
    g.save();
    g.fillStyle = '#F5F9FD';
    g.fillRect(0, 0, W, H);

    const m = { l: 92 * k, r: 20 * k, t: 74 * k, b: 74 * k };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = AZUL;
    g.font = 'bold ' + px(25) + FONTE;
    g.fillText(d.titulo || 'ESTIMATIVA DE PRODUÇÃO MENSAL', W / 2, 24 * k);
    if (d.subtitulo) {
      g.fillStyle = '#6B7280';
      g.font = px(16) + FONTE;
      g.fillText(d.subtitulo, W / 2, 50 * k);
    }

    const meses = d.meses.map(function (v) { return isFinite(v) ? v : 0; });
    const consumo = isFinite(d.consumo) && d.consumo > 0 ? d.consumo : 0;
    const vmax = Math.max.apply(null, meses.concat([consumo, 1]));
    const passo = passoBonito(vmax * 1.35, 7);
    const topo = Math.ceil((vmax * 1.35) / passo) * passo; // folga no topo para o quadro-resumo e a legenda
    const y = function (v) { return m.t + ph - (v / topo) * ph; };

    g.font = px(17) + FONTE;
    g.textAlign = 'right';
    for (let v = 0; v <= topo + 1e-9; v += passo) {
      const yy = Math.round(y(v)) + 0.5;
      g.strokeStyle = '#DDE3EA';
      g.lineWidth = 1.2 * k;
      g.beginPath(); g.moveTo(m.l, yy); g.lineTo(m.l + pw, yy); g.stroke();
      g.fillStyle = '#374151';
      g.fillText(U.fmt(v, 0), m.l - 10 * k, yy);
    }

    const gw = pw / 12;
    const bw = gw * 0.62;
    const cx = function (i) { return m.l + gw * (i + 0.5); };
    meses.forEach(function (v, i) {
      g.fillStyle = AZUL;
      g.fillRect(cx(i) - bw / 2, y(v), bw, y(0) - y(v));
      g.fillStyle = AZUL;
      g.font = 'bold ' + px(16) + FONTE;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(U.fmt(v, 0), cx(i), y(v) - 5 * k);
      g.fillStyle = '#374151';
      g.font = px(18) + FONTE;
      g.textBaseline = 'top';
      g.fillText(U.MESES[i], cx(i), y(0) + 10 * k);
    });

    if (consumo) {
      g.strokeStyle = LARANJA;
      g.lineWidth = 4 * k;
      g.setLineDash([14 * k, 8 * k]);
      g.beginPath(); g.moveTo(cx(0), y(consumo)); g.lineTo(cx(11), y(consumo)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = LARANJA;
      meses.forEach(function (v, i) { g.beginPath(); g.arc(cx(i), y(consumo), 6 * k, 0, Math.PI * 2); g.fill(); });
    }

    // legenda (canto superior direito)
    const itens = [];
    if (consumo) itens.push({ cor: LARANJA, linha: true, t: 'Consumo Contratado: ' + U.fmt(consumo, 0) + ' kWh/mês' });
    itens.push({ cor: AZUL, t: 'Geração Estimada (kWh)' });
    g.font = px(17) + FONTE;
    const lw = Math.max.apply(null, itens.map(function (it) { return g.measureText(it.t).width; })) + 72 * k;
    const lh = 32 * k;
    const lx = m.l + pw - lw - 4 * k, ly = m.t - 8 * k;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.strokeStyle = AZUL;
    g.lineWidth = 1.5 * k;
    g.beginPath(); g.rect(lx, ly, lw, lh * itens.length + 12 * k); g.fill(); g.stroke();
    itens.forEach(function (it, i) {
      const yy = ly + 6 * k + lh * i + lh / 2;
      g.fillStyle = it.cor;
      g.strokeStyle = it.cor;
      if (it.linha) {
        g.lineWidth = 4 * k;
        g.setLineDash([10 * k, 6 * k]);
        g.beginPath(); g.moveTo(lx + 10 * k, yy); g.lineTo(lx + 50 * k, yy); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(lx + 30 * k, yy, 6 * k, 0, Math.PI * 2); g.fill();
      } else {
        g.fillRect(lx + 12 * k, yy - 7 * k, 36 * k, 14 * k);
      }
      g.fillStyle = '#111827';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(it.t, lx + 60 * k, yy);
    });

    // quadro-resumo (canto superior esquerdo)
    const total = meses.reduce(function (a, b) { return a + b; }, 0);
    const max = Math.max.apply(null, meses), min = Math.min.apply(null, meses);
    const nomes = function (v) { return meses.map(function (x, i) { return Math.round(x) === Math.round(v) ? U.MESES[i] : null; }).filter(Boolean).join('/'); };
    const linhas = [
      ['TOTAL ANUAL:', U.fmt(total, 0) + ' kWh'],
      ['MÉDIA MENSAL:', U.fmt(total / 12, 0) + ' kWh'],
      ['MELHOR MÊS:', U.fmt(max, 0) + ' kWh  (' + nomes(max) + ')'],
      ['PIOR MÊS:', U.fmt(min, 0) + ' kWh  (' + nomes(min) + ')']
    ];
    const mono = px(16) + '"Consolas", "DejaVu Sans Mono", "Courier New", monospace';
    g.font = mono;
    const c1 = Math.max.apply(null, linhas.map(function (l) { return g.measureText(l[0]).width; })) + 14 * k;
    const bwq = c1 + Math.max.apply(null, linhas.map(function (l) { return g.measureText(l[1]).width; })) + 24 * k;
    const bx = m.l + 10 * k, by = m.t - 8 * k, lhq = 28 * k;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = AZUL;
    g.lineWidth = 2 * k;
    g.beginPath(); g.rect(bx, by, bwq, lhq * linhas.length + 12 * k); g.fill(); g.stroke();
    g.fillStyle = AZUL;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    linhas.forEach(function (l, i) {
      const yy = by + 6 * k + lhq * i + lhq / 2;
      g.fillText(l[0], bx + 10 * k, yy);
      g.fillText(l[1], bx + 10 * k + c1, yy);
    });

    if (d.rodape) {
      g.fillStyle = '#8A8F98';
      g.font = 'italic ' + px(15) + FONTE;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(d.rodape, W / 2, H - 10 * k);
    }
    g.restore();
  }

  /** Gráfico de produção do contrato como PNG (1800×772 px, mesma proporção da imagem do modelo). */
  function producaoDataURL(d) {
    const cv = document.createElement('canvas');
    cv.width = 1800;
    cv.height = 772;
    desenharProducao(cv, d);
    return cv.toDataURL('image/png');
  }

  App.Chart = { desenhar: desenhar, dataURL: dataURL, desenharProducao: desenharProducao, producaoDataURL: producaoDataURL };
})(window.App);
