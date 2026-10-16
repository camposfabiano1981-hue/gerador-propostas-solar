/* Inicialização da aplicação. */
(function (App) {
  'use strict';

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
