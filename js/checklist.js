/*
 * Checklists editáveis (instalação e ordem de serviço): grupos com itens {texto, ok, obs}. Os modelos ficam em Configurações ›
 * Textos padrão, uma linha por item e "# Título" abrindo cada grupo. Incluir um modelo acrescenta os grupos e itens que faltam,
 * sem duplicar e sem desfazer o que já foi marcado ou anotado.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;

  function norm(x) { return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function item(texto) { return { texto: String(texto || '').trim(), ok: false, obs: '' }; }

  function grupo(titulo, itens) { return { id: 'g-' + U.uid(), titulo: String(titulo || '').trim() || 'Grupo', naoSeAplica: false, itens: (itens || []).map(item) }; }

  /** Modelo em linhas ("# Grupo" e os itens abaixo) → grupos. Itens antes do primeiro título entram no grupo `padrao`. */
  function doModelo(linhas, padrao) {
    const out = [];
    let atual = null;
    (Array.isArray(linhas) ? linhas : String(linhas || '').split('\n')).forEach(function (l) {
      const t = String(l || '').trim();
      if (!t) return;
      const m = t.match(/^#+\s*(.+)$/);
      if (m) { atual = { titulo: m[1].trim(), itens: [] }; out.push(atual); return; }
      if (!atual) { atual = { titulo: padrao || 'Checklist', itens: [] }; out.push(atual); }
      atual.itens.push(t.replace(/^[-•*]\s*/, ''));
    });
    return out;
  }

  /**
   * Acrescenta o modelo aos grupos: grupo com o mesmo título recebe os itens que faltam (mesmo texto, ignorando acentos e
   * maiúsculas); grupo novo entra no fim. Devolve {grupos, itens} incluídos.
   */
  function mesclar(grupos, modelo) {
    let ng = 0, ni = 0;
    (modelo || []).forEach(function (m) {
      let g = grupos.find(function (x) { return norm(x.titulo) === norm(m.titulo); });
      if (!g) { g = grupo(m.titulo, []); grupos.push(g); ng++; }
      if (!Array.isArray(g.itens)) g.itens = [];
      m.itens.forEach(function (t) {
        if (g.itens.some(function (x) { return norm(x.texto) === norm(t); })) return;
        g.itens.push(item(t)); ni++;
      });
    });
    return { grupos: ng, itens: ni };
  }

  /** Altura do texto do item conforme o conteúdo (o texto quebra em linhas em vez de ficar cortado). */
  function ajustar(el) {
    if (!el || !el.isConnected) return;
    el.style.height = 'auto';
    if (el.scrollHeight) el.style.height = el.scrollHeight + 'px';
  }

  function progresso(grupos) {
    let feitos = 0, total = 0;
    (grupos || []).forEach(function (g) {
      if (g.naoSeAplica) return;
      (g.itens || []).forEach(function (it) { total++; if (it.ok) feitos++; });
    });
    return { feitos: feitos, total: total };
  }

  /**
   * Editor: cada grupo com o título editável, o progresso, "não se aplica", remover; itens com marcar, texto e observação
   * editáveis e remover; incluir item e novo grupo.
   * o: {aoMudar(), redesenhar(), aoMarcar(grupo, item, ok), placeholderObs, acoes: [elementos extras no rodapé]}
   */
  function editor(grupos, o) {
    o = o || {};
    const box = h('div.checklist-editor');
    const texto = function (it) {
      const t = h('textarea.check-texto', {
        rows: 1, 'aria-label': 'Item do checklist',
        oninput: function () { it.texto = t.value.replace(/\s*\n\s*/g, ' '); ajustar(t); o.aoMudar(); },
        onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); t.blur(); } },
        onfocus: function () { ajustar(t); }
      });
      t.value = it.texto || '';
      return t;
    };
    grupos.forEach(function (g, gi) {
      if (!Array.isArray(g.itens)) g.itens = [];
      const feitos = g.itens.filter(function (x) { return x.ok; }).length;
      const completo = g.itens.length && feitos === g.itens.length;
      const card = h('div.checklist-grupo' + (g.naoSeAplica ? '.na' : (completo ? '.completo' : '')));
      const titulo = h('input.checklist-titulo', { type: 'text', value: g.titulo || '', 'aria-label': 'Título do grupo', oninput: function () { g.titulo = titulo.value; o.aoMudar(); } });
      card.appendChild(h('div.checklist-grupo-topo', titulo,
        g.naoSeAplica ? App.UI.badge('Não se aplica', 'cinza') : App.UI.badge(feitos + '/' + g.itens.length, completo ? 'ok' : 'cinza'),
        App.UI.campo({ k: 'naoSeAplica', label: 'Não se aplica', type: 'checkbox' }, g, function () { o.aoMudar(); o.redesenhar(); }),
        h('button.btn-icone.perigo', {
          type: 'button', title: 'Remover o grupo', 'aria-label': 'Remover o grupo ' + (g.titulo || ''), onclick: async function () {
            if (!(await App.UI.confirmar('Remover o grupo "' + (g.titulo || '') + '" e os ' + g.itens.length + ' itens dele?', 'Remover', true))) return;
            grupos.splice(gi, 1); o.aoMudar(); o.redesenhar();
          }
        }, '🗑')));
      if (!g.naoSeAplica) {
        g.itens.forEach(function (it, j) {
          const cb = h('input', { type: 'checkbox', 'aria-label': 'Concluído', onchange: function () { if (o.aoMarcar) o.aoMarcar(g, it, cb.checked); else it.ok = cb.checked; o.aoMudar(); o.redesenhar(); } });
          cb.checked = !!it.ok;
          card.appendChild(h('div.check-linha' + (it.ok ? '.ok' : ''),
            cb,
            texto(it),
            h('input.check-obs', { type: 'text', value: it.obs || '', placeholder: o.placeholderObs || 'medição / observação', 'aria-label': 'Observação do item', oninput: function (ev) { it.obs = ev.target.value; o.aoMudar(); } }),
            h('button.btn-icone.perigo', { type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { g.itens.splice(j, 1); o.aoMudar(); o.redesenhar(); } }, '×')));
        });
        const novo = h('input', { type: 'text', placeholder: 'Novo item em "' + (g.titulo || 'grupo') + '"', onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); add(); } } });
        const add = function () { const tx = novo.value.trim(); if (!tx) return; g.itens.push(item(tx)); o.aoMudar(); o.redesenhar(); };
        card.appendChild(h('div.checklist-novo', novo, h('button.btn.pequeno', { type: 'button', onclick: add }, '+ Item')));
      }
      box.appendChild(card);
    });
    const nomeGrupo = h('input', { type: 'text', placeholder: 'Nome do novo grupo (ex.: Aterramento)', onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addGrupo(); } } });
    const addGrupo = function () { const t = nomeGrupo.value.trim(); if (!t) { App.UI.toast('Digite o nome do grupo.', 'erro'); return; } grupos.push(grupo(t, [])); o.aoMudar(); o.redesenhar(); };
    // depois de entrar na página: cada item com a altura do próprio texto
    requestAnimationFrame(function () { box.querySelectorAll('textarea.check-texto').forEach(ajustar); });
    box.appendChild(h('div.checklist-rodape', h('div.checklist-novo', nomeGrupo, h('button.btn.pequeno', { type: 'button', onclick: addGrupo }, '+ Novo grupo')), o.acoes || null));
    return box;
  }

  App.Checklist = { norm: norm, item: item, grupo: grupo, doModelo: doModelo, mesclar: mesclar, progresso: progresso, editor: editor };
})(window.App);
