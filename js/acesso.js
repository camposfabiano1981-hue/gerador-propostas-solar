/*
 * Acesso por perfil: administrador (tudo), vendedor (tudo, menos o financeiro e as configurações) e técnico (instalações e
 * ordens de serviço). Define as telas do menu, as coleções sincronizadas e as que cada perfil grava — as regras do Firestore
 * (App.Nuvem.regras) repetem a mesma matriz no servidor. Sem a sincronização configurada, o app é de um usuário só (administrador).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const PERFIS = [
    { id: 'admin', label: 'Administrador', desc: 'Tudo, inclusive o financeiro, as configurações e a equipe.' },
    { id: 'vendedor', label: 'Vendedor', desc: 'Propostas (com custos), clientes, contratos, instalações, OS e compras — sem o financeiro e as configurações.' },
    { id: 'tecnico', label: 'Técnico', desc: 'Instalações e ordens de serviço (etapas, checklist, fotos, materiais e assinaturas), sem valores das propostas.' }
  ];

  // coleções do financeiro: só o administrador lê e grava
  const FINANCEIRO = ['lancamentos', 'contasFin', 'categoriasFin'];
  // técnico: grava instalações e OS; consulta clientes e equipamentos
  const TECNICO_GRAVA = ['instalacoes', 'ordens'];
  const TECNICO_LE = ['clientes', 'equipamentos'];

  // telas por perfil (prefixos do endereço); o administrador abre todas
  const ROTAS_VENDEDOR_FORA = ['/financeiro', '/empresa', '/premissas', '/textos', '/modelo-contrato', '/dados', '/equipe'];
  const ROTAS_TECNICO = ['/instalacoes', '/instalacao/', '/ordens', '/ordem/', '/nuvem', '/conta'];

  const CHAVE = 'gsp.sessao';

  /** Sessão deste aparelho: {uid, email, nome, perfil, base, dono} (gravada no login; vale também sem internet). */
  function sessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; }
  }

  function gravarSessao(s) {
    try { if (s) localStorage.setItem(CHAVE, JSON.stringify(s)); else localStorage.removeItem(CHAVE); } catch (e) { /* indisponível */ }
  }

  /** Perfil em uso: o da sessão; sem a sincronização configurada (uso local, de uma pessoa só), administrador. */
  function perfil() {
    const N = App.Nuvem;
    if (!N || !N.configurada || !N.configurada()) return 'admin';
    const s = sessao();
    return s && s.perfil ? s.perfil : 'admin';
  }

  function rotulo(id) { return (PERFIS.find(function (p) { return p.id === id; }) || PERFIS[0]).label; }

  /** Coleções sincronizadas para o perfil (todas as que ele lê). */
  function colecoes(p, todas) {
    const lista = todas || (App.Store ? App.Store.COLECOES : []);
    p = p || perfil();
    if (p === 'admin') return lista.slice();
    if (p === 'vendedor') return lista.filter(function (c) { return FINANCEIRO.indexOf(c) < 0; });
    return lista.filter(function (c) { return TECNICO_GRAVA.indexOf(c) >= 0 || TECNICO_LE.indexOf(c) >= 0; });
  }

  function podeLer(col, p) {
    p = p || perfil();
    if (col === 'config' || col === 'fotos') return true;
    return colecoes(p, [col]).length === 1;
  }

  function podeGravar(col, p) {
    p = p || perfil();
    if (col === 'config' || col === 'fotos') return true; // numeração dos documentos e fotos das obras
    if (p === 'tecnico') return TECNICO_GRAVA.indexOf(col) >= 0;
    return podeLer(col, p);
  }

  /** Tela liberada para o perfil (caminho sem o #, ex.: /financeiro/dre). */
  function rota(caminho, p) {
    p = p || perfil();
    const c = String(caminho || '/');
    if (p === 'admin') return true;
    const comeca = function (x) { return c === x || c.indexOf(x.replace(/\/$/, '') + '/') === 0 || (x.slice(-1) === '/' && c.indexOf(x) === 0); };
    if (p === 'vendedor') return !ROTAS_VENDEDOR_FORA.some(comeca);
    return ROTAS_TECNICO.some(comeca);
  }

  /** Tela inicial do perfil. */
  function inicio(p) { return (p || perfil()) === 'tecnico' ? '/instalacoes' : '/painel'; }

  /** O perfil vê valores de propostas e contratos (o técnico, não). */
  function veValores(p) { return (p || perfil()) !== 'tecnico'; }

  /** Atualiza o menu lateral: esconde as telas e os grupos sem acesso e mostra quem está usando. */
  function aplicarMenu() {
    const p = perfil();
    document.querySelectorAll('.nav a[href^="#/"]').forEach(function (a) {
      a.hidden = !rota(a.getAttribute('href').slice(1).split('?')[0], p);
    });
    // grupo sem nenhuma tela visível também some
    document.querySelectorAll('.nav .nav-grupo').forEach(function (g) {
      let x = g.nextElementSibling, algum = false;
      while (x && !x.classList.contains('nav-grupo')) { if (x.tagName === 'A' && !x.hidden) algum = true; x = x.nextElementSibling; }
      g.hidden = !algum;
    });
    const chip = document.getElementById('usuario-chip');
    if (chip) {
      const s = sessao();
      const N = App.Nuvem;
      chip.hidden = !(N && N.configurada && N.configurada() && s);
      if (s) chip.replaceChildren(document.createTextNode('👤 ' + (s.nome || s.email || '')), (function () { const sm = document.createElement('small'); sm.textContent = rotulo(s.perfil) + (s.dono ? ' · dono da conta' : ''); return sm; })());
    }
  }

  App.Acesso = {
    PERFIS: PERFIS, FINANCEIRO: FINANCEIRO, TECNICO_GRAVA: TECNICO_GRAVA, TECNICO_LE: TECNICO_LE,
    sessao: sessao, gravarSessao: gravarSessao, perfil: perfil, rotulo: rotulo, colecoes: colecoes, podeLer: podeLer, podeGravar: podeGravar,
    rota: rota, inicio: inicio, veValores: veValores, aplicarMenu: aplicarMenu
  };
})(window.App);
