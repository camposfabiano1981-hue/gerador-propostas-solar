/* Inicialização da aplicação. */
(function (App) {
  'use strict';

  /** Versão publicada — a mesma usada em ?v= no index.html (evita o navegador usar arquivos antigos em cache). */
  App.VERSAO_APP = '2026.10.22.2';

  App.atualizarMarca = function () {
    const emp = App.Store.config().empresa;
    const img = document.getElementById('marca-logo');
    if (img) img.src = emp.logo || App.LOGO_PADRAO;
    const nome = document.getElementById('marca-empresa');
    if (nome) nome.textContent = emp.nomeCurto || emp.razao || '';
    document.title = 'Propostas Solar — ' + (emp.nomeCurto || emp.razao || 'Gerador');
  };

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.App);
