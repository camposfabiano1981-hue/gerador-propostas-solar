/* "Passo a passo" da proposta: linha do tempo com as etapas do cronograma de execução, desenhada em canvas (Word e PDF). */
window.App = window.App || {};

(function (App) {
  'use strict';

  const FONTE = '"DejaVu Sans", "Segoe UI", Arial, sans-serif';
  // cor do círculo e cor do texto (o amarelo ganha um tom mais escuro para ser legível sobre o branco)
  const CORES = [
    ['#12A4B6', '#0E8796'], ['#4CAF50', '#3B8E3F'], ['#F9B928', '#C98A00'], ['#F68B3B', '#D9681A'],
    ['#EF4136', '#D02C22'], ['#8E5BD8', '#7340BE'], ['#1F7BD8', '#1563B4'], ['#0F9D7E', '#0B7F66']
  ];
  const W = 1800, CX = W / 2, R = 100, VAO = 52;
  const F_PASSO = 46, F_TEXTO = 40, F_PRAZO = 36, LH = 50;

  function quebrar(g, texto, larg) {
    const linhas = [];
    String(texto || '').split(/\n/).forEach(function (par) {
      let atual = '';
      par.split(/\s+/).filter(Boolean).forEach(function (p) {
        const tenta = atual ? atual + ' ' + p : p;
        if (atual && g.measureText(tenta).width > larg) { linhas.push(atual); atual = p; } else atual = tenta;
      });
      if (atual) linhas.push(atual);
    });
    return linhas;
  }

  /** Linhas de texto de cada etapa e a altura do bloco (rótulo, descrição e prazo). */
  function medir(g, etapas) {
    const larg = CX - R - VAO - 30;
    return etapas.map(function (e) {
      g.font = F_TEXTO + 'px ' + FONTE;
      const linhas = quebrar(g, e.etapa, larg);
      g.font = 'italic ' + F_PRAZO + 'px ' + FONTE;
      const prazo = e.prazo ? quebrar(g, 'Prazo estimado: ' + e.prazo, larg) : [];
      return { linhas: linhas, prazo: prazo, altura: F_PASSO + 18 + linhas.length * LH + (prazo.length ? 10 + prazo.length * (F_PRAZO + 10) : 0) };
    });
  }

  /**
   * Desenha a linha do tempo: círculos numerados ligados por uma faixa vertical colorida, com o texto de cada etapa
   * alternando à direita (ímpares) e à esquerda (pares).
   * @param {{etapa: string, prazo: string}[]} etapas
   * @returns {HTMLCanvasElement}
   */
  function desenhar(etapas) {
    const cv = document.createElement('canvas');
    const g0 = cv.getContext('2d');
    const blocos = medir(g0, etapas);
    // os textos alternam de lado: cada bloco só precisa caber entre as etapas vizinhas do mesmo lado (duas etapas)
    const maiorBloco = Math.max.apply(null, blocos.map(function (b) { return b.altura; }));
    const passo = Math.max(2 * R + 50, Math.ceil((maiorBloco + 50) / 2));
    // margens: o círculo ou o texto da primeira/última etapa (o que for maior)
    const topo = Math.max(R + 20, blocos[0].altura / 2 + 16);
    const base = Math.max(R + 20, blocos[blocos.length - 1].altura / 2 + 16);
    cv.width = W;
    cv.height = Math.round(topo + base + passo * (etapas.length - 1));
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, cv.width, cv.height);
    const yDe = function (i) { return topo + i * passo; };
    const cor = function (i) { return CORES[i % CORES.length]; };

    // faixa vertical: cada trecho com a cor do círculo mais próximo
    for (let i = 0; i < etapas.length - 1; i++) {
      const y0 = yDe(i), y1 = yDe(i + 1), meio = (y0 + y1) / 2;
      g.fillStyle = cor(i)[0];
      g.fillRect(CX - 17, y0, 34, meio - y0);
      g.fillStyle = cor(i + 1)[0];
      g.fillRect(CX - 17, meio, 34, y1 - meio);
    }

    etapas.forEach(function (e, i) {
      const y = yDe(i), c = cor(i);
      g.save();
      g.shadowColor = 'rgba(15, 23, 42, 0.22)';
      g.shadowBlur = 16;
      g.shadowOffsetY = 5;
      g.beginPath();
      g.arc(CX, y, R, 0, Math.PI * 2);
      g.fillStyle = c[0];
      g.fill();
      g.restore();
      g.beginPath();
      g.arc(CX, y, R - 9, 0, Math.PI * 2);
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.stroke();
      g.save();
      g.fillStyle = '#FFFFFF';
      g.shadowColor = 'rgba(0, 0, 0, 0.25)';
      g.shadowBlur = 6;
      g.shadowOffsetY = 3;
      g.font = 'bold 112px ' + FONTE;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), CX, y + 6);
      g.restore();

      // texto: à direita nas etapas ímpares, à esquerda (alinhado ao círculo) nas pares
      const dir = i % 2 === 0;
      const x = dir ? CX + R + VAO : CX - R - VAO;
      const b = blocos[i];
      let yy = y - b.altura / 2;
      g.textAlign = dir ? 'left' : 'right';
      g.textBaseline = 'top';
      g.fillStyle = c[1];
      g.font = 'bold ' + F_PASSO + 'px ' + FONTE;
      g.fillText('PASSO ' + (i + 1), x, yy);
      yy += F_PASSO + 18;
      g.fillStyle = '#334155';
      g.font = F_TEXTO + 'px ' + FONTE;
      b.linhas.forEach(function (l) { g.fillText(l, x, yy); yy += LH; });
      if (b.prazo.length) {
        yy += 10;
        g.fillStyle = '#64748B';
        g.font = 'italic ' + F_PRAZO + 'px ' + FONTE;
        b.prazo.forEach(function (l) { g.fillText(l, x, yy); yy += F_PRAZO + 10; });
      }
    });
    return cv;
  }

  /** PNG (dataURL) e proporção altura ÷ largura da linha do tempo. */
  function imagem(etapas) {
    const cv = desenhar(etapas);
    return { dataURL: cv.toDataURL('image/png'), proporcao: cv.height / cv.width };
  }

  App.Passos = { desenhar: desenhar, imagem: imagem, CORES: CORES };
})(window.App);
