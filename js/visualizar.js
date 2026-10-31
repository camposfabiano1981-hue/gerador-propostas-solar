/*
 * Visualização dos documentos no próprio app (propostas, propostas avulsas, ordens de serviço, pedidos de compra e relatório
 * de instalação): as páginas do PDF desenhadas com o PDF.js — funciona também no celular, onde o navegador não mostra PDF
 * dentro da página —, com os botões para imprimir, baixar e abrir em nova aba.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;

  /**
   * Abre a janela de visualização. gerar() devolve a promessa de {blob, nome}: o PDF é gerado ao abrir, do registro como está na tela.
   * o: {titulo}. Devolve a função que fecha a janela.
   */
  function abrir(gerar, o) {
    o = o || {};
    const UI = App.UI;
    const status = h('p.visualizador-status', 'Gerando o documento…');
    const paginas = h('div.visualizador-paginas');
    const corpo = h('div.visualizador', status, paginas);
    let gerado = null, doc = null, fechado = false, url = null;
    const semDocumento = function () { UI.toast('Aguarde: o documento ainda está sendo gerado.'); return false; };
    const fechar = UI.modal({
      titulo: o.titulo || 'Visualizar documento', largo: true, corpo: corpo,
      acoes: [
        {
          label: '🖨 Imprimir', manterAberto: true, onClick: function () {
            if (!gerado) return semDocumento();
            imprimirBlob(gerado.blob, gerado.nome);
            return false;
          }
        },
        {
          label: 'Abrir em nova aba', manterAberto: true, onClick: function () {
            if (!gerado) return semDocumento();
            if (!url) url = URL.createObjectURL(gerado.blob);
            if (!window.open(url, '_blank')) U.download(gerado.blob, gerado.nome);
            return false;
          }
        },
        {
          label: '⬇ Baixar PDF', primario: true, manterAberto: true, onClick: function () {
            if (!gerado) return semDocumento();
            U.download(gerado.blob, gerado.nome);
            UI.toast('PDF baixado: ' + gerado.nome, 'ok');
            return false;
          }
        },
        { label: 'Fechar' }
      ],
      aoFechar: function () {
        fechado = true;
        if (doc) { try { doc.destroy(); } catch (e) { /* já encerrado */ } }
        if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
    });
    const dlg = corpo.closest('dialog');
    if (dlg) dlg.classList.add('visualizar');
    (async function () {
      try {
        gerado = await gerar();
        if (fechado) return;
        status.textContent = 'Abrindo as páginas…';
        const lib = await App.LeituraLocal.pdfjs();
        doc = await lib.getDocument({ data: new Uint8Array(await gerado.blob.arrayBuffer()), isEvalSupported: false }).promise;
        if (fechado) return;
        status.textContent = gerado.nome + ' · ' + doc.numPages + (doc.numPages === 1 ? ' página' : ' páginas');
        const largura = Math.max(300, paginas.clientWidth || 760);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= doc.numPages && !fechado; n++) {
          const pg = await doc.getPage(n);
          const vp = pg.getViewport({ scale: largura / pg.getViewport({ scale: 1 }).width * dpr });
          const cv = h('canvas.visualizador-pagina', { role: 'img', 'aria-label': 'Página ' + n + ' de ' + doc.numPages });
          cv.width = Math.round(vp.width);
          cv.height = Math.round(vp.height);
          paginas.appendChild(cv);
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        }
      } catch (e) {
        console.error(e);
        if (fechado) return;
        status.classList.add('erro');
        status.textContent = gerado ? 'Não foi possível mostrar as páginas aqui (' + e.message + '). Use “Baixar PDF” ou “Abrir em nova aba”.'
          : 'Não foi possível gerar o documento: ' + e.message;
      }
    })();
    return fechar;
  }

  /**
   * Imprime o PDF: carrega numa moldura invisível e abre a janela de impressão do navegador. Onde a página não consegue
   * imprimir o PDF (celular, Safari), abre o PDF em nova aba (ou baixa), para imprimir de lá.
   */
  function imprimirBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const alternativa = function () {
      if (!window.open(url, '_blank')) U.download(blob, nome);
      App.UI.toast('Use a opção Imprimir do PDF aberto.', 'info');
    };
    const movel = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent));
    if (movel) { alternativa(); return; }
    const anterior = document.getElementById('moldura-impressao');
    if (anterior) anterior.remove();
    const fr = h('iframe#moldura-impressao', { title: 'Impressão', 'aria-hidden': 'true', style: { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0' } });
    fr.onload = function () {
      setTimeout(function () {
        try { fr.contentWindow.focus(); fr.contentWindow.print(); window.__impressoes = (window.__impressoes || 0) + 1; } catch (e) { alternativa(); }
      }, 150);
    };
    fr.src = url;
    document.body.appendChild(fr);
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }

  /** Gera o documento e imprime (botões 🖨 das telas). gerar(): promessa de {blob, nome}. */
  async function imprimir(gerar) {
    App.UI.toast('Preparando a impressão…');
    const g = await gerar();
    imprimirBlob(g.blob, g.nome);
  }

  /** Botão 👁 das listas (ao lado de PDF/DOCX). */
  function botao(gerar, titulo) {
    return h('button.btn-formato.ver', { type: 'button', title: 'Visualizar', 'aria-label': 'Visualizar ' + (titulo || 'documento'), onclick: function () { abrir(gerar, { titulo: titulo }); } }, '👁');
  }

  App.Visualizar = { abrir: abrir, botao: botao, imprimir: imprimir, imprimirBlob: imprimirBlob };
})(window.App);
