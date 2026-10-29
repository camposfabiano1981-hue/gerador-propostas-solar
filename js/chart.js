/* Gráfico "Estimativa de produção mensal" (proposta e contrato) desenhado em canvas. */
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
   * Gráfico "Estimativa de produção mensal" da proposta e do contrato: barras de geração com rótulos, linha tracejada do
   * consumo (reta com o consumo médio/contratado ou mês a mês quando varia) e quadro-resumo (total, média, melhor e pior mês).
   * @param {HTMLCanvasElement} cv
   * @param {{meses:number[], consumo:(number|number[]), rotuloConsumo:string, titulo:string, subtitulo:string, rodape:string, compacto:boolean}} d
   *   compacto: miniatura da tela (letras maiores, sem subtítulo, quadro-resumo e rodapé)
   */
  function desenharProducao(cv, d) {
    const W = cv.width, H = cv.height;
    const k = W / 1800;
    const AZUL = '#0D5B8F', LARANJA = '#E8A020';
    const g = cv.getContext('2d');
    const fk = d.compacto ? 2.1 : 1.2; // textos legíveis com a imagem em ~14,7 cm (ou na miniatura da tela)
    const px = function (v) { return Math.round(v * k * fk) + 'px '; };
    g.save();
    g.fillStyle = '#F5F9FD';
    g.fillRect(0, 0, W, H);

    const m = d.compacto ? { l: 150 * k, r: 20 * k, t: 150 * k, b: 80 * k } : { l: 92 * k, r: 20 * k, t: 74 * k, b: 74 * k };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = AZUL;
    g.font = 'bold ' + px(25) + FONTE;
    g.fillText(d.titulo || 'ESTIMATIVA DE PRODUÇÃO MENSAL', W / 2, (d.compacto ? 38 : 24) * k);
    if (d.subtitulo && !d.compacto) {
      g.fillStyle = '#6B7280';
      g.font = px(16) + FONTE;
      g.fillText(d.subtitulo, W / 2, 50 * k);
    }

    const meses = d.meses.map(function (v) { return isFinite(v) ? v : 0; });
    const consMes = Array.isArray(d.consumo) ? d.consumo.map(function (v) { return isFinite(v) && v > 0 ? v : 0; }) : null;
    const variaMes = !!(consMes && Math.max.apply(null, consMes) - Math.min.apply(null, consMes) >= 0.5);
    const consumo = consMes ? (variaMes ? 0 : consMes[0]) : (isFinite(d.consumo) && d.consumo > 0 ? d.consumo : 0);
    const vmax = Math.max.apply(null, meses.concat([consumo, 1], variaMes ? consMes : []));
    const folga = d.compacto ? 1.12 : 1.35; // folga no topo para o quadro-resumo e a legenda
    const passo = passoBonito(vmax * folga, d.compacto ? 4 : 7);
    const topo = Math.ceil((vmax * folga) / passo) * passo;
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

    if (consumo || variaMes) {
      const yc = function (i) { return y(variaMes ? consMes[i] : consumo); };
      g.strokeStyle = LARANJA;
      g.lineWidth = 4 * k;
      g.setLineDash([14 * k, 8 * k]);
      g.beginPath();
      meses.forEach(function (v, i) { if (i) g.lineTo(cx(i), yc(i)); else g.moveTo(cx(i), yc(i)); });
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = LARANJA;
      meses.forEach(function (v, i) { g.beginPath(); g.arc(cx(i), yc(i), 6 * k, 0, Math.PI * 2); g.fill(); });
    }

    // legenda (canto superior direito)
    const itens = [];
    const rotC = d.rotuloConsumo || 'Consumo Contratado';
    if (variaMes) itens.push({ cor: LARANJA, linha: true, t: 'Consumo Mensal (kWh)' });
    else if (consumo) itens.push({ cor: LARANJA, linha: true, t: rotC + ': ' + U.fmt(consumo, 0) + ' kWh/mês' });
    itens.push({ cor: AZUL, t: 'Geração Estimada (kWh)' });
    g.font = px(17) + FONTE;
    if (d.compacto) {
      // miniatura: legenda numa linha, abaixo do título
      const larg = itens.map(function (it) { return g.measureText(it.t).width + 90 * k; });
      let x = (W - larg.reduce(function (a, b) { return a + b; }, 0)) / 2;
      const yy = 98 * k;
      itens.forEach(function (it, i) {
        g.fillStyle = it.cor; g.strokeStyle = it.cor;
        if (it.linha) {
          g.lineWidth = 6 * k; g.setLineDash([14 * k, 8 * k]);
          g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 60 * k, yy); g.stroke(); g.setLineDash([]);
        } else g.fillRect(x + 6 * k, yy - 12 * k, 48 * k, 24 * k);
        g.fillStyle = '#111827'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(it.t, x + 72 * k, yy);
        x += larg[i];
      });
      g.restore();
      return;
    }
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

  /**
   * Título e rodapé do gráfico de produção (os mesmos na proposta e no contrato).
   * o: {kwp, meses, consumo, rotuloConsumo, subtitulo, pr (% de eficiência)}
   */
  function dadosProducao(o) {
    const kwp = U.num(o.kwp) > 0 ? U.kwp(U.num(o.kwp)) : '';
    return {
      meses: o.meses, consumo: o.consumo, rotuloConsumo: o.rotuloConsumo, subtitulo: o.subtitulo || '',
      titulo: 'ESTIMATIVA DE PRODUÇÃO MENSAL  –  SISTEMA FOTOVOLTAICO' + (kwp ? '  ' + kwp + ' kWp' : ''),
      rodape: 'Fonte: Atlas Brasileiro de Energia Solar – INPE/LABREN, 2ª Ed. (2017) | CRESESB/SunData  •  Cálculo: ' + (kwp ? kwp + ' kWp × ' : '') +
        'HSP mensal × eficiência ' + U.fmtSmart(U.numOr(o.pr, 80), 1) + '%'
    };
  }

  /** Gráfico de produção como PNG (1800×772 px, mesma proporção da imagem do modelo de contrato). */
  function producaoDataURL(d) {
    const cv = document.createElement('canvas');
    cv.width = 1800;
    cv.height = 772;
    desenharProducao(cv, d);
    return cv.toDataURL('image/png');
  }

  /**
   * Gráfico do saldo acumulado (proposta): barra vermelha enquanto o investimento não se pagou e verde depois,
   * com a marcação do ano em que ele se paga e o saldo final.
   * @param {{pontos: {rot: string, v: number}[], marca: string, sub: string, final: string}} d
   *   marca: texto do balão no ano do retorno; final: rótulo do saldo do último ano
   */
  function saldoDataURL(d) {
    const W = 1800, H = 690;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    // faixa no alto (m.t) para o rótulo do saldo final, acima da última barra
    const m = { l: 170, r: 30, t: 96, b: 80 };
    const vs = d.pontos.map(function (p) { return p.v; });
    const max = Math.max.apply(null, vs.concat([1])), min = Math.min.apply(null, vs.concat([0]));
    const passo = passoBonito(max - Math.min(0, min), 4);
    const topo = Math.ceil(max / passo) * passo, base = Math.min(0, min * 1.5);
    const pw = W - m.l - m.r, ph = H - m.t - m.b, bw = pw / d.pontos.length;
    const y = function (v) { return m.t + (topo - v) / (topo - base) * ph; };
    const rotulo = function (v) {
      if (v === 0) return '0';
      if (Math.abs(v) >= 1e6) return U.fmt(v / 1e6, 1) + ' mi';
      return U.fmt(v / 1000, 0) + ' mil';
    };
    g.textBaseline = 'middle';
    for (let v = 0; v <= topo + 1; v += passo) {
      g.strokeStyle = v === 0 ? '#94A3B8' : '#E5E7EB';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(m.l, y(v)); g.lineTo(W - m.r, y(v)); g.stroke();
      g.fillStyle = '#6B7280';
      g.font = '26px ' + FONTE;
      g.textAlign = 'right';
      g.fillText(rotulo(v), m.l - 14, y(v));
    }
    let iPay = -1;
    d.pontos.forEach(function (p, i) {
      if (iPay < 0 && i > 0 && p.v >= 0) iPay = i;
      const x = m.l + i * bw + bw * 0.16, w = bw * 0.68, y0 = y(0), y1 = y(p.v);
      g.fillStyle = p.v < 0 ? '#EF4444' : (i === iPay ? '#F6A81C' : '#22C55E');
      g.fillRect(x, Math.min(y0, y1), w, Math.max(3, Math.abs(y1 - y0)));
      const ultimo = i === d.pontos.length - 1;
      if ((i % 4 === 0 && i < d.pontos.length - 2) || ultimo) {
        g.fillStyle = '#475569';
        g.font = '24px ' + FONTE;
        g.textAlign = 'center';
        g.fillText(p.rot, x + w / 2, H - m.b + 40);
      }
    });
    if (iPay > 0 && d.marca) {
      const xp = m.l + iPay * bw + bw / 2;
      g.save();
      g.setLineDash([10, 10]);
      g.strokeStyle = '#F6A81C';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(xp, y(0) - 12); g.lineTo(xp, m.t + 70); g.stroke();
      g.restore();
      g.font = 'bold 28px ' + FONTE;
      const wb = Math.max(g.measureText(d.marca).width, (function () { g.font = '25px ' + FONTE; return g.measureText(d.sub || '').width; })()) + 44;
      const xb = Math.min(xp + 14, W - m.r - wb);
      g.fillStyle = '#FFF7E6';
      g.strokeStyle = '#F6A81C';
      g.lineWidth = 3;
      g.beginPath();
      if (g.roundRect) g.roundRect(xb, m.t + 6, wb, 92, 18); else g.rect(xb, m.t + 6, wb, 92);
      g.fill(); g.stroke();
      g.textAlign = 'left';
      g.fillStyle = '#92400E';
      g.font = 'bold 28px ' + FONTE;
      g.fillText(d.marca, xb + 22, m.t + 38);
      g.font = '25px ' + FONTE;
      g.fillText(d.sub || '', xb + 22, m.t + 74);
    }
    if (d.final) {
      g.fillStyle = '#15803D';
      g.font = 'bold 38px ' + FONTE;
      g.textAlign = 'right';
      g.fillText(d.final, W - m.r, Math.min(m.t / 2, y(max) - 34));
    }
    return { dataURL: cv.toDataURL('image/png'), proporcao: H / W };
  }

  App.Chart = { desenharProducao: desenharProducao, producaoDataURL: producaoDataURL, dadosProducao: dadosProducao, saldoDataURL: saldoDataURL };
})(window.App);
