/* Componentes de interface: roteador, avisos, diálogos, campos de formulário e cadastro genérico (CRUD). */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;
  const UI = {};

  /* ------------------------------------------------------------ roteador */

  const rotas = [];
  let hashAtual = '';
  UI.guarda = null; // função que retorna false para impedir a saída da página atual

  UI.rota = function (padrao, render) {
    const nomes = [];
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, function (_, n) { nomes.push(n); return '([^/]+)'; }) + '$');
    rotas.push({ re: re, nomes: nomes, render: render });
  };

  UI.ir = function (hash) {
    if (location.hash === hash) UI.despachar(true);
    else location.hash = hash;
  };

  UI.despachar = function (forcar) {
    const hash = location.hash || '#/painel';
    if (!forcar && hash === hashAtual) return;
    if (UI.guarda && hashAtual && UI.guarda() === false) {
      history.replaceState(null, '', hashAtual);
      return;
    }
    UI.guarda = null;
    hashAtual = hash;
    const caminho = hash.replace(/^#/, '').split('?')[0] || '/painel';
    const qs = new URLSearchParams(hash.split('?')[1] || '');
    const main = document.getElementById('conteudo');
    for (const r of rotas) {
      const m = caminho.match(r.re);
      if (m) {
        const params = {};
        r.nomes.forEach(function (n, i) { params[n] = decodeURIComponent(m[i + 1]); });
        main.innerHTML = '';
        main.scrollTop = 0;
        window.scrollTo(0, 0);
        try {
          r.render(main, params, qs);
        } catch (e) {
          console.error(e);
          main.appendChild(h('div.card', h('h2', 'Erro ao abrir a página'), h('pre.erro', String(e && e.stack || e))));
        }
        UI.marcarMenu(caminho);
        document.body.classList.remove('menu-aberto');
        return;
      }
    }
    UI.ir('#/painel');
  };

  /** Troca o endereço sem recarregar a página atual (ex.: após salvar uma proposta nova). */
  UI.substituirHash = function (hash) {
    history.replaceState(null, '', hash);
    hashAtual = hash;
  };

  UI.marcarMenu = function (caminho) {
    document.querySelectorAll('.nav a').forEach(function (a) {
      const alvo = a.getAttribute('href').replace(/^#/, '');
      a.classList.toggle('ativo', caminho === alvo || (alvo !== '/painel' && caminho.indexOf(alvo + '/') === 0) ||
        (alvo === '/propostas' && caminho.indexOf('/proposta/') === 0 && caminho !== '/proposta/nova') ||
        (alvo === '/instalacoes' && caminho.indexOf('/instalacao/') === 0));
    });
  };

  /* ------------------------------------------------------------ avisos e diálogos */

  UI.toast = function (msg, tipo) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div#toasts'); document.body.appendChild(box); }
    const t = h('div.toast' + (tipo ? '.' + tipo : ''), { role: 'status' }, msg);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('saindo'); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  };

  /** o: {titulo, corpo, largo, acoes: [{label, primario, perigo, onClick(fechar), manterAberto}], aoFechar} */
  UI.modal = function (o) {
    const dlg = h('dialog.modal' + (o.largo ? '.largo' : ''));
    let fechado = false;
    const fechar = function () {
      if (fechado) return;
      fechado = true;
      dlg.close();
      dlg.remove();
      if (o.aoFechar) o.aoFechar();
    };
    const acoes = h('div.modal-acoes');
    (o.acoes || []).forEach(function (a) {
      acoes.appendChild(h('button.btn' + (a.primario ? '.primario' : '') + (a.perigo ? '.perigo' : ''), {
        type: 'button',
        onclick: function () {
          const r = a.onClick ? a.onClick(fechar) : null;
          if (r !== false && !a.manterAberto) fechar();
        }
      }, a.label));
    });
    dlg.appendChild(h('div.modal-topo', h('h2', o.titulo || ''), h('button.btn-icone', { type: 'button', 'aria-label': 'Fechar', onclick: fechar }, '×')));
    dlg.appendChild(h('div.modal-corpo', o.corpo));
    dlg.appendChild(acoes);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); fechar(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    return fechar;
  };

  UI.confirmar = function (msg, rotuloOk, perigo) {
    return new Promise(function (res) {
      UI.modal({
        titulo: 'Confirmação',
        corpo: h('p', msg),
        acoes: [
          { label: 'Cancelar', onClick: function () { res(false); } },
          { label: rotuloOk || 'Confirmar', primario: !perigo, perigo: perigo, onClick: function () { res(true); } }
        ]
      });
    });
  };

  /* ------------------------------------------------------------ campos */

  function valorExibicao(def, v) {
    if (v == null || v === '') return '';
    if (def.type === 'pct') {
      const n = U.num(v);
      return isFinite(n) ? String(U.round(n * 100, 6)).replace('.', ',') : '';
    }
    if (def.type === 'number' || def.type === 'money') {
      const n = U.num(v);
      return isFinite(n) ? String(n).replace('.', ',') : String(v);
    }
    return String(v);
  }

  function lerValor(def, el) {
    if (def.type === 'checkbox') return el.checked;
    if (def.type === 'linhas') return el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    const raw = el.value;
    if (def.type === 'pct') { const n = U.num(raw); return isFinite(n) ? n / 100 : (raw.trim() === '' ? (def.vazio != null ? def.vazio : null) : null); }
    if (def.type === 'number' || def.type === 'money') { const n = U.num(raw); return isFinite(n) ? n : (raw.trim() === '' ? (def.vazio != null ? def.vazio : '') : ''); }
    if (def.type === 'int') { const n = parseInt(raw, 10); return isFinite(n) ? n : ''; }
    return raw;
  }

  /**
   * Cria um campo ligado a `estado[def.k]`.
   * def: {k, label, type, options, placeholder, help, suffix, required, cls, rows, readonly, onChange}
   */
  UI.campo = function (def, estado, aoMudar) {
    const id = 'f_' + String(def.k).replace(/\W/g, '_') + '_' + Math.random().toString(36).slice(2, 6);
    const v = U.get(estado, def.k);
    let input;
    const tipo = def.type || 'text';
    if (tipo === 'select') {
      input = h('select', { id: id });
      const opts = typeof def.options === 'function' ? def.options(estado) : (def.options || []);
      opts.forEach(function (o) {
        const ov = typeof o === 'object' ? o.v : o;
        const ot = typeof o === 'object' ? o.t : o;
        const op = h('option', { value: ov == null ? '' : ov }, ot);
        if (String(ov == null ? '' : ov) === String(v == null ? '' : v)) op.selected = true;
        input.appendChild(op);
      });
    } else if (tipo === 'textarea' || tipo === 'linhas') {
      input = h('textarea', { id: id, rows: def.rows || (tipo === 'linhas' ? 6 : 3), placeholder: def.placeholder || '' });
      input.value = tipo === 'linhas' ? (Array.isArray(v) ? v.join('\n') : '') : (v == null ? '' : v);
    } else if (tipo === 'checkbox') {
      input = h('input', { id: id, type: 'checkbox' });
      input.checked = !!v;
    } else {
      const numerico = ['number', 'money', 'pct', 'int'].indexOf(tipo) >= 0;
      input = h('input', {
        id: id,
        type: numerico ? 'text' : tipo,
        inputmode: numerico ? 'decimal' : null,
        placeholder: def.placeholder || '',
        autocomplete: 'off'
      });
      input.value = valorExibicao(def, v);
    }
    input.setAttribute('data-k', def.k);
    if (def.readonly) input.setAttribute('readonly', '');
    if (def.required) input.setAttribute('required', '');
    const evento = tipo === 'select' || tipo === 'checkbox' ? 'change' : 'input';
    input.addEventListener(evento, function () {
      const nv = lerValor(def, input);
      U.set(estado, def.k, nv);
      if (def.onChange) def.onChange(nv, estado, input);
      if (aoMudar) aoMudar(def.k, nv);
    });

    if (tipo === 'checkbox') {
      return h('div.campo.check' + (def.cls ? '.' + def.cls : ''),
        h('label', { for: id }, input, h('span', def.label)),
        def.help ? h('small.ajuda', def.help) : null);
    }
    const sufixo = def.suffix || (tipo === 'pct' ? '%' : tipo === 'money' ? null : null);
    const prefixo = tipo === 'money' ? 'R$' : def.prefix;
    const controle = sufixo || prefixo
      ? h('div.grupo-input', prefixo ? h('span.prefixo', prefixo) : null, input, sufixo ? h('span.sufixo', sufixo) : null)
      : input;
    return h('div.campo' + (def.cls ? '.' + def.cls : ''),
      def.label ? h('label', { for: id }, def.label, def.required ? h('span.obrig', ' *') : null) : null,
      controle,
      def.help ? h('small.ajuda', typeof def.help === 'function' ? def.help(estado) : def.help) : null);
  };

  UI.grade = function (defs, estado, aoMudar, colunas) {
    const g = h('div.grade' + (colunas ? '.c' + colunas : ''));
    defs.forEach(function (d) {
      if (!d) return;
      if (d.secao) { g.appendChild(h('h4.secao-form', d.secao)); return; }
      if (d.el) { g.appendChild(d.el); return; }
      g.appendChild(UI.campo(d, estado, aoMudar));
    });
    return g;
  };

  UI.cabecalho = function (titulo, subtitulo, acoes) {
    return h('div.pagina-topo',
      h('div', h('h1', titulo), subtitulo ? h('p.sub', subtitulo) : null),
      acoes ? h('div.acoes', acoes) : null);
  };

  UI.badge = function (texto, tipo) {
    return h('span.badge' + (tipo ? '.' + tipo : ''), texto);
  };

  /* ------------------------------------------------------------ cadastro genérico */

  /**
   * cfg: {colecao, titulo, subtitulo, colunas:[{t, v(item), cls}], campos(item) → defs, novo() → obj,
   *       filtro(item) → bool, busca(item) → string, validar(item) → msg|null, aposSalvar(item), largo, rotuloNovo}
   */
  UI.crud = function (cont, cfg) {
    const S = App.Store;
    const estadoBusca = { q: '' };

    function lista() {
      let itens = S.list(cfg.colecao);
      if (cfg.filtro) itens = itens.filter(cfg.filtro);
      const q = estadoBusca.q.trim().toLowerCase();
      if (q) itens = itens.filter(function (i) { return (cfg.busca ? cfg.busca(i) : JSON.stringify(i)).toLowerCase().indexOf(q) >= 0; });
      if (cfg.ordenar) itens.sort(cfg.ordenar);
      return itens;
    }

    /** item = registro a editar; sem item, um novo — o padrão de cfg.novo() ou `inicial`, já montado (ex.: lido de um datasheet). */
    function abrir(item, inicial) {
      const novo = !item;
      const estado = novo ? (inicial ? U.clone(inicial) : cfg.novo()) : U.clone(item);
      const corpo = h('div');
      const desenhar = function () {
        corpo.innerHTML = '';
        corpo.appendChild(UI.grade(cfg.campos(estado, desenhar), estado, null, cfg.colunasForm || 2));
      };
      desenhar();
      UI.modal({
        titulo: (novo ? 'Novo — ' : 'Editar — ') + cfg.titulo,
        corpo: corpo,
        largo: cfg.largo,
        acoes: [
          { label: 'Cancelar' },
          {
            label: 'Salvar', primario: true, onClick: function () {
              if (cfg.antesSalvar) cfg.antesSalvar(estado);
              const erro = cfg.validar ? cfg.validar(estado) : null;
              if (erro) { UI.toast(erro, 'erro'); return false; }
              try {
                S.save(cfg.colecao, estado);
              } catch (e) { UI.toast(e.message, 'erro'); return false; }
              if (cfg.aposSalvar) cfg.aposSalvar(estado);
              UI.toast('Registro salvo.', 'ok');
              desenharTabela();
            }
          }
        ]
      });
    }

    const tabelaBox = h('div.card.sem-pad');
    const busca = h('input.busca', { type: 'search', placeholder: 'Pesquisar…', oninput: function () { estadoBusca.q = busca.value; desenharTabela(); } });

    function desenharTabela() {
      const itens = lista();
      tabelaBox.innerHTML = '';
      if (!itens.length) {
        tabelaBox.appendChild(h('div.vazio', h('p', estadoBusca.q ? 'Nenhum registro encontrado.' : (cfg.vazio || 'Nenhum registro cadastrado.')),
          estadoBusca.q ? null : h('button.btn.primario', { type: 'button', onclick: function () { abrir(null); } }, cfg.rotuloNovo || '+ Novo')));
        return;
      }
      const thead = h('tr', cfg.colunas.map(function (c) { return h('th' + (c.cls ? '.' + c.cls : ''), c.t); }), h('th.acoes-col', ''));
      const tbody = h('tbody');
      itens.forEach(function (it) {
        tbody.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button')) abrir(it); } },
          cfg.colunas.map(function (c) {
            const v = c.v(it);
            return h('td' + (c.cls ? '.' + c.cls : ''), v instanceof Node ? v : (v == null ? '' : String(v)));
          }),
          h('td.acoes-col',
            cfg.acoesExtras ? cfg.acoesExtras(it, desenharTabela) : null,
            h('button.btn-icone', { type: 'button', title: 'Editar', 'aria-label': 'Editar', onclick: function () { abrir(it); } }, '✎'),
            h('button.btn-icone.perigo', {
              type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
                if (cfg.podeExcluir) { const msg = cfg.podeExcluir(it); if (msg) { UI.toast(msg, 'erro'); return; } }
                if (await UI.confirmar('Excluir este registro? Esta ação não pode ser desfeita.', 'Excluir', true)) {
                  S.remove(cfg.colecao, it.id);
                  UI.toast('Registro excluído.');
                  desenharTabela();
                }
              }
            }, '🗑'))
        ));
      });
      tabelaBox.appendChild(h('div.tabela-rolagem', h('table.tabela', h('thead', thead), tbody)));
    }

    const ctrl = { atualizar: desenharTabela, abrir: abrir };
    cont.appendChild(UI.cabecalho(cfg.titulo, cfg.subtitulo, [busca].concat(cfg.acoesTopo ? cfg.acoesTopo(ctrl) : [], [
      h('button.btn.primario', { type: 'button', onclick: function () { abrir(null); } }, cfg.rotuloNovo || '+ Novo')
    ])));
    if (cfg.antesTabela) cont.appendChild(cfg.antesTabela);
    cont.appendChild(tabelaBox);
    desenharTabela();
    return ctrl;
  };

  App.UI = UI;
})(window.App);
