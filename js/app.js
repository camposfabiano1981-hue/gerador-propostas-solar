/* Inicialização da aplicação. */
(function (App) {
  'use strict';

  /** Versão publicada — a mesma usada em ?v= no index.html (evita o navegador usar arquivos antigos em cache). */
  App.VERSAO_APP = '2026.10.24.2';

  App.atualizarMarca = function () {
    const emp = App.Store.config().empresa;
    const img = document.getElementById('marca-logo');
    if (img) img.src = emp.logo || App.LOGO_PADRAO;
    const nome = document.getElementById('marca-empresa');
    if (nome) nome.textContent = emp.nomeCurto || emp.razao || '';
    document.title = 'Propostas Solar — ' + (emp.nomeCurto || emp.razao || 'Gerador');
  };

  /* ------------------------------------------------------------ aplicativo instalável (PWA) */

  // o navegador avisa (Chrome/Edge/Android) quando a instalação é possível; o pedido fica guardado para o botão do menu
  let pedidoInstalacao = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pedidoInstalacao = e;
    const btn = document.getElementById('btn-instalar');
    if (btn) btn.hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    pedidoInstalacao = null;
    const btn = document.getElementById('btn-instalar');
    if (btn) btn.hidden = true;
    if (App.UI) App.UI.toast('Aplicativo instalado. Procure o ícone Propostas Solar na área de trabalho ou na tela inicial.', 'ok');
  });

  function aplicativoAberto() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function iniciarAplicativo() {
    // service worker: abre sem internet e atualiza os arquivos a cada versão publicada (não funciona em file://)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Aplicativo offline indisponível:', e); });
    }
    const btn = document.getElementById('btn-instalar');
    if (!btn) return;
    // iPhone/iPad não têm o aviso de instalação: o botão mostra o passo a passo do Safari
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (pedidoInstalacao || (ios && !aplicativoAberto())) btn.hidden = false;
    btn.addEventListener('click', async function (ev) {
      ev.preventDefault();
      document.body.classList.remove('menu-aberto');
      if (pedidoInstalacao) {
        const pedido = pedidoInstalacao;
        pedidoInstalacao = null;
        pedido.prompt();
        const escolha = await pedido.userChoice;
        if (escolha && escolha.outcome === 'accepted') btn.hidden = true;
        return;
      }
      const h = App.U.h;
      App.UI.modal({
        titulo: 'Instalar o aplicativo',
        corpo: h('div',
          h('p', 'No iPhone e no iPad, a instalação é feita pelo Safari:'),
          h('ol',
            h('li', 'Toque no botão ', h('strong', 'Compartilhar'), ' (quadrado com a seta para cima) na barra do Safari.'),
            h('li', 'Escolha ', h('strong', 'Adicionar à Tela de Início'), '.'),
            h('li', 'Toque em ', h('strong', 'Adicionar'), '. O ícone Propostas Solar aparece na tela inicial.')),
          h('p.ajuda-sec', 'O aplicativo instalado guarda os dados separado do Safari: ao abrir pela primeira vez, entre com a conta Google em ☁️ Sincronização para trazer seus cadastros.')),
        acoes: [{ label: 'Entendi', primario: true }]
      });
    });
  }

  function iniciar() {
    try {
      App.Store.init();
    } catch (e) {
      console.error(e);
    }
    App.atualizarMarca();
    const versao = document.getElementById('versao-app');
    if (versao) versao.textContent = 'Versão ' + App.VERSAO_APP;
    document.getElementById('btn-menu').addEventListener('click', function () {
      document.body.classList.toggle('menu-aberto');
    });
    document.getElementById('veu').addEventListener('click', function () {
      document.body.classList.remove('menu-aberto');
    });
    window.addEventListener('hashchange', function () { App.UI.despachar(); });
    App.UI.despachar(true);
    // sincronização com a nuvem (Firebase), quando configurada
    const status = document.getElementById('nuvem-status');
    if (App.Nuvem) {
      App.Nuvem.observar(function (n) {
        if (!status) return;
        status.textContent = n.resumo();
        status.className = 'nuvem-status ' + n.estado;
        status.title = n.mensagem || (n.usuario ? 'Conta: ' + n.usuario.email : '');
      });
      App.Nuvem.iniciar();
    }
    iniciarAplicativo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.App);
