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
    // zoom: − / ajustar à largura / + (e o gesto de pinça no celular, Ctrl + roda no computador)
    const rotZoom = h('button.btn.pequeno.zoom-valor', { type: 'button', title: 'Ajustar à largura', onclick: function () { definirZoom(1); } }, 'Ajustar');
    const zoomBox = h('div.visualizador-zoom', { hidden: true },
      h('button.btn.pequeno.zoom-menos', { type: 'button', title: 'Diminuir', 'aria-label': 'Diminuir o zoom', onclick: function () { passoZoom(-1); } }, '−'), rotZoom,
      h('button.btn.pequeno.zoom-mais', { type: 'button', title: 'Ampliar', 'aria-label': 'Ampliar', onclick: function () { passoZoom(1); } }, '+'));
    const corpo = h('div.visualizador', h('div.visualizador-barra', status, zoomBox), paginas);
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
        if (obsPerto) obsPerto.disconnect();
        if (obsLonge) obsLonge.disconnect();
        window.removeEventListener('resize', aoRedimensionar);
        pags.forEach(function (p) { if (p.tarefa) { try { p.tarefa.cancel(); } catch (e) { /* encerrada */ } } p.cv.width = 0; p.cv.height = 0; });
        if (doc) { try { doc.destroy(); } catch (e) { /* já encerrado */ } }
        if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
    });
    const dlg = corpo.closest('dialog');
    if (dlg) dlg.classList.add('visualizar');
    // as páginas rolam dentro da própria área (a barra com o zoom fica fixa no alto)
    const rolagem = paginas;

    /*
     * Páginas nítidas: cada uma é desenhada nos pixels reais da tela (até 3× nos celulares) e no zoom escolhido — ao ampliar,
     * é redesenhada, em vez de esticar a imagem. Só as páginas à vista (e as vizinhas) ficam desenhadas; as distantes são
     * liberadas (memória do celular) e voltam ao rolar.
     */
    const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4], MAX_PX = 16e6;
    const pags = [];
    let zoom = 1, base = 760, fila = Promise.resolve(), obsPerto = null, obsLonge = null, tRedim = null;
    const dpr = function () { return Math.min(3, window.devicePixelRatio || 1); };
    const largCss = function () { return Math.round(base * zoom); };
    function tamanhos() {
      const w = largCss();
      pags.forEach(function (p) { p.cv.style.width = w + 'px'; p.cv.style.height = Math.round(w * p.h1 / p.w1) + 'px'; });
      rotZoom.textContent = zoom === 1 ? 'Ajustar' : Math.round(zoom * 100) + '%';
    }
    function escala(p) {
      const s = largCss() / p.w1 * dpr();
      return Math.min(s, Math.sqrt(MAX_PX / (p.w1 * p.h1)));
    }
    function desenhar(p) {
      fila = fila.then(async function () {
        if (fechado || !p.perto) return;
        const s = escala(p);
        if (Math.abs(p.escala - s) < 1e-3) return;
        if (p.tarefa) { try { p.tarefa.cancel(); } catch (e) { /* encerrada */ } }
        const vp = p.pg.getViewport({ scale: s });
        // desenha fora da tela e copia: a página não pisca em branco ao mudar o zoom
        const off = document.createElement('canvas');
        off.width = Math.round(vp.width); off.height = Math.round(vp.height);
        p.tarefa = p.pg.render({ canvasContext: off.getContext('2d'), viewport: vp });
        try { await p.tarefa.promise; } catch (e) { off.width = 0; return; } finally { p.tarefa = null; }
        if (fechado || !p.perto) { off.width = 0; return; }
        p.cv.width = off.width; p.cv.height = off.height;
        p.cv.getContext('2d').drawImage(off, 0, 0);
        off.width = 0;
        p.escala = s;
      }).catch(function (e) { console.error(e); });
      return fila;
    }
    function liberar(p) { if (p.escala) { p.cv.width = 0; p.cv.height = 0; p.escala = 0; } }
    function redesenharVisiveis() { pags.forEach(function (p) { if (p.perto) desenhar(p); }); }
    // mantém o ponto do meio da tela ao mudar o zoom
    function definirZoom(z, centro) {
      z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z));
      if (Math.abs(z - zoom) < 1e-3) return;
      const r = rolagem, cx = centro ? centro[0] : r.clientWidth / 2, cy = centro ? centro[1] : r.clientHeight / 2;
      const fx = (r.scrollLeft + cx) / Math.max(1, r.scrollWidth), fy = (r.scrollTop + cy) / Math.max(1, r.scrollHeight);
      zoom = z;
      tamanhos();
      r.scrollLeft = fx * r.scrollWidth - cx; r.scrollTop = fy * r.scrollHeight - cy;
      clearTimeout(tRedim); tRedim = setTimeout(redesenharVisiveis, 120);
    }
    function passoZoom(d) {
      const i = ZOOMS.findIndex(function (z) { return z >= zoom - 1e-3; });
      const atual = i < 0 ? ZOOMS.length - 1 : (Math.abs(ZOOMS[i] - zoom) < 1e-3 ? i : (d > 0 ? i - 1 : i));
      definirZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, atual + d))]);
    }
    function aoRedimensionar() {
      clearTimeout(tRedim);
      tRedim = setTimeout(function () { if (fechado) return; base = Math.max(300, paginas.clientWidth || base); tamanhos(); redesenharVisiveis(); }, 200);
    }
    // pinça (dois dedos) no celular: amplia na hora (esticando) e redesenha nítido ao soltar
    let pinca = null;
    const dist = function (t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); };
    paginas.addEventListener('touchstart', function (ev) { if (ev.touches.length === 2) pinca = { d0: dist(ev.touches), z0: zoom }; }, { passive: true });
    paginas.addEventListener('touchmove', function (ev) {
      if (!pinca || ev.touches.length !== 2) return;
      ev.preventDefault();
      const z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], pinca.z0 * dist(ev.touches) / pinca.d0));
      const rb = rolagem.getBoundingClientRect();
      definirZoom(z, [(ev.touches[0].clientX + ev.touches[1].clientX) / 2 - rb.left, (ev.touches[0].clientY + ev.touches[1].clientY) / 2 - rb.top]);
    }, { passive: false });
    paginas.addEventListener('touchend', function (ev) { if (pinca && ev.touches.length < 2) pinca = null; }, { passive: true });
    // Ctrl + roda (e a pinça do touchpad) no computador
    paginas.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const rb = rolagem.getBoundingClientRect();
      definirZoom(zoom * Math.exp(-ev.deltaY / 300), [ev.clientX - rb.left, ev.clientY - rb.top]);
    }, { passive: false });
    window.addEventListener('resize', aoRedimensionar);

    (async function () {
      try {
        gerado = await gerar();
        if (fechado) return;
        status.textContent = 'Abrindo as páginas…';
        const lib = await App.LeituraLocal.pdfjs();
        doc = await lib.getDocument({ data: new Uint8Array(await gerado.blob.arrayBuffer()), isEvalSupported: false }).promise;
        if (fechado) return;
        status.textContent = gerado.nome + ' · ' + doc.numPages + (doc.numPages === 1 ? ' página' : ' páginas');
        base = Math.max(300, paginas.clientWidth || 760);
        for (let n = 1; n <= doc.numPages && !fechado; n++) {
          const pg = await doc.getPage(n), v1 = pg.getViewport({ scale: 1 });
          const cv = h('canvas.visualizador-pagina', { role: 'img', 'aria-label': 'Página ' + n + ' de ' + doc.numPages, width: 0, height: 0 });
          const p = { n: n, pg: pg, cv: cv, w1: v1.width, h1: v1.height, escala: 0, perto: false, tarefa: null };
          cv.__pag = p;
          pags.push(p);
          paginas.appendChild(cv);
        }
        if (fechado) return;
        tamanhos();
        zoomBox.hidden = false;
        if (typeof IntersectionObserver !== 'undefined') {
          // perto da tela (uma tela acima e abaixo): desenha; longe (três telas): libera
          obsPerto = new IntersectionObserver(function (es) {
            es.forEach(function (e) { const p = e.target.__pag; if (e.isIntersecting) { p.perto = true; desenhar(p); } });
          }, { root: rolagem, rootMargin: '100% 0px' });
          obsLonge = new IntersectionObserver(function (es) {
            es.forEach(function (e) { const p = e.target.__pag; if (!e.isIntersecting) { p.perto = false; liberar(p); } });
          }, { root: rolagem, rootMargin: '300% 0px' });
          pags.forEach(function (p) { obsPerto.observe(p.cv); obsLonge.observe(p.cv); });
        } else pags.forEach(function (p) { p.perto = true; desenhar(p); });
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
