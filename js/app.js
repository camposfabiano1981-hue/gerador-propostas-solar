/* Inicialização da aplicação. */
(function (App) {
  'use strict';

  /** Versão publicada — a mesma usada em ?v= no index.html (evita o navegador usar arquivos antigos em cache). */
  App.VERSAO_APP = '2026.10.29.12';

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

  /** Navegador e aparelho, para explicar a instalação quando o navegador não oferece o botão próprio. */
  function ambiente() {
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    // navegador embutido em outro aplicativo (Claude, WhatsApp, Instagram, Facebook…): não instala
    const embutido = /; wv\)|FBAN|FBAV|Instagram|Line\/|WhatsApp|Claude/i.test(ua) || (ios && !/Safari\//.test(ua));
    return {
      ios: ios, android: android, embutido: embutido,
      safari: ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua),
      samsung: /SamsungBrowser/i.test(ua), edge: /Edg(A|iOS)?\//.test(ua), firefox: /Firefox|FxiOS/i.test(ua)
    };
  }

  function passosInstalacao() {
    const h = App.U.h;
    const a = ambiente();
    const link = location.origin + location.pathname;
    if (a.embutido) {
      return h('div',
        h('p', 'A plataforma foi aberta dentro de outro aplicativo, que não permite instalar.'),
        h('ol',
          h('li', 'Toque no menu (⋮ ou ⋯) desta tela e escolha ', h('strong', a.ios ? 'Abrir no Safari' : 'Abrir no Chrome'), ' (ou “Abrir no navegador”).'),
          h('li', 'Se não houver essa opção, copie o endereço abaixo e cole no ', h('strong', a.ios ? 'Safari' : 'Chrome'), '.'),
          h('li', 'Lá, toque de novo em ', h('strong', '📲 Instalar aplicativo'), '.')),
        h('p', h('code', link)));
    }
    if (a.ios) {
      return h('div',
        h('p', a.safari ? 'No iPhone e no iPad, a instalação é feita pelo Safari:' : 'No iPhone e no iPad, a instalação é feita pelo botão Compartilhar do navegador (no Safari é o caminho mais garantido):'),
        h('ol',
          h('li', 'Toque no botão ', h('strong', 'Compartilhar'), ' (quadrado com a seta para cima)' + (a.safari ? ' na barra do Safari.' : ', na barra de endereço.')),
          h('li', 'Role as opções e escolha ', h('strong', 'Adicionar à Tela de Início'), '.'),
          h('li', 'Toque em ', h('strong', 'Adicionar'), '. O ícone Propostas Solar aparece na tela inicial.')),
        h('p.ajuda-sec', 'O aplicativo instalado guarda os dados separado do navegador: ao abrir pela primeira vez, entre com a conta Google em ☁️ Sincronização para trazer seus cadastros.'));
    }
    if (a.android) {
      return h('div',
        h('p', 'No Android:'),
        h('ol', a.samsung
          ? [h('li', 'Toque no menu ', h('strong', '≡'), ' do Samsung Internet.'), h('li', 'Escolha ', h('strong', 'Adicionar página a › Tela inicial'), '.')]
          : [h('li', 'Toque no menu ', h('strong', '⋮'), ' do Chrome (canto superior direito).'), h('li', 'Escolha ', h('strong', 'Instalar app'), ' (ou ', h('strong', 'Adicionar à tela inicial › Instalar'), ').'),
            h('li', 'Confirme. O ícone Propostas Solar aparece na tela inicial e na gaveta de aplicativos.')]),
        h('p.ajuda-sec', 'Se a opção não aparecer, recarregue a página e aguarde alguns segundos.'));
    }
    if (a.firefox) {
      return h('div', h('p', 'O Firefox no computador não instala aplicativos. Abra o endereço abaixo no ', h('strong', 'Chrome'), ' ou no ', h('strong', 'Edge'), ' e clique em 📲 Instalar aplicativo.'), h('p', h('code', link)));
    }
    return h('div',
      h('p', 'No computador (' + (a.edge ? 'Edge' : 'Chrome') + '):'),
      h('ol', a.edge
        ? [h('li', 'Clique no ícone de instalar (quadrados com +) no lado direito da barra de endereço; ou'), h('li', 'menu ', h('strong', '⋯ › Aplicativos › Instalar este site como aplicativo'), '.')]
        : [h('li', 'Clique no ícone de instalar (monitor com seta) no lado direito da barra de endereço; ou'), h('li', 'menu ', h('strong', '⋮ › Transmitir, salvar e compartilhar › Instalar página como app'), '.')]),
      h('p.ajuda-sec', 'Se a opção não aparecer, atualize com Ctrl+F5 e aguarde alguns segundos. O ícone vai para a área de trabalho, o menu Iniciar e a barra de tarefas.'));
  }

  function iniciarAplicativo() {
    // service worker: abre sem internet e atualiza os arquivos a cada versão publicada (não funciona em file://)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Aplicativo offline indisponível:', e); });
    }
    const btn = document.getElementById('btn-instalar');
    if (!btn) return;
    // fica visível enquanto o app não estiver instalado/aberto como aplicativo; sem o aviso do navegador, mostra o passo a passo
    btn.hidden = aplicativoAberto();
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
      App.UI.modal({ titulo: 'Instalar o aplicativo', corpo: passosInstalacao(), acoes: [{ label: 'Entendi', primario: true }] });
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
