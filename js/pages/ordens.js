/* Ordens de serviço das instalações: lista e formulário (abertura, agendamento, execução e conclusão). */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, C = App.Calc, O = App.Ordem, I = App.Instalacao;
  const h = U.h;

  function badge(lista, id) {
    const x = lista.find(function (s) { return s.id === id; }) || lista[0];
    return UI.badge(x.label, x.cor);
  }

  /** PDF da OS (com as assinaturas colhidas na tela). */
  async function baixarPdf(os, botao) {
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = '…'; }
    try {
      const g = await App.Relatorios.pdfOS(os, C.contexto());
      U.download(g.blob, g.nome);
      UI.toast('PDF gerado: ' + g.nome, 'ok');
    } catch (e) {
      console.error(e);
      UI.toast('Falha ao gerar o PDF: ' + e.message, 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rotulo; }
    }
  }

  /** Tabela de ordens (lista geral e seção da instalação). */
  App.tabelaOrdens = function (lista, recarregar, semObra) {
    const hoje = U.todayISO();
    const tb = h('tbody');
    lista.forEach(function (os) {
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button,select')) UI.ir('#/ordem/' + os.id); } },
        h('td', h('strong', os.numero || '(sem número)'), h('div.mini', U.dataBR(os.data))),
        semObra ? null : h('td', os.clienteNome || '—', h('div.mini', os.instalacaoTitulo || [os.cidade, os.uf].filter(Boolean).join('/'))),
        h('td', O.rotulo(O.TIPOS, os.tipo), os.garantia ? h('div.mini', 'em garantia') : null),
        h('td', badge(O.PRIORIDADES, os.prioridade)),
        h('td', os.status === 'concluida' ? 'Concluída em ' + U.dataBR(os.concluidaEm) : (U.dataBR(os.agendadaPara) || '—'),
          O.atrasada(os, hoje) ? h('div', UI.badge('Atrasada', 'erro')) : null),
        h('td', badge(O.STATUS, os.status)),
        recarregar ? h('td.acoes-col', App.Visualizar.botao(function () { return App.Relatorios.pdfOS(os, C.contexto()); }, 'Ordem de serviço ' + (os.numero || '')), (function () {
          const btn = h('button.btn-formato.pdf', { type: 'button', title: 'Baixar a OS em PDF', onclick: function () { baixarPdf(os, btn); } }, 'PDF');
          return btn;
        })(), h('button.btn-icone.perigo', {
          type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
            if (await UI.confirmar('Excluir a ordem de serviço ' + (os.numero || '') + '?', 'Excluir', true)) {
              S.remove('ordens', os.id);
              UI.toast('Ordem de serviço excluída.');
              recarregar();
            }
          }
        }, '🗑')) : null));
    });
    const cols = ['Nº / abertura'].concat(semObra ? [] : ['Cliente / obra']).concat(['Tipo', 'Prioridade', 'Agendada para', 'Situação']).concat(recarregar ? [''] : []);
    return h('div.tabela-rolagem', h('table.tabela.ordens', h('thead', h('tr', cols.map(function (t) { return h('th', t); }))), tb));
  };

  /* ------------------------------------------------------------ lista */

  UI.rota('/ordens', function (cont) {
    const filtro = { q: '', status: 'abertas', tipo: '' };
    const box = h('div.card.sem-pad');
    function desenhar() {
      const hoje = U.todayISO();
      let lista = S.list('ordens');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (o) { return [o.numero, o.clienteNome, o.instalacaoTitulo, o.cidade, o.descricao].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.status === 'abertas') lista = lista.filter(O.aberta);
      else if (filtro.status === 'atrasadas') lista = lista.filter(function (o) { return O.atrasada(o, hoje); });
      else if (filtro.status) lista = lista.filter(function (o) { return o.status === filtro.status; });
      if (filtro.tipo) lista = lista.filter(function (o) { return o.tipo === filtro.tipo; });
      // urgentes e agendadas para antes primeiro; concluídas e canceladas por último
      const peso = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      lista.sort(function (a, b) {
        return (O.aberta(b) - O.aberta(a)) || (peso[a.prioridade] - peso[b.prioridade]) ||
          String(a.agendadaPara || '9').localeCompare(String(b.agendadaPara || '9')) || String(b.numero).localeCompare(String(a.numero));
      });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('ordens').length ? 'Nenhuma ordem de serviço com esses filtros.' : 'Nenhuma ordem de serviço ainda.'),
          h('a.btn.primario', { href: '#/ordem/nova' }, '+ Nova ordem de serviço')));
        return;
      }
      box.appendChild(App.tabelaOrdens(lista, desenhar));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Nº, cliente, obra ou descrição…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const selStatus = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.status = selStatus.value; desenhar(); } },
      h('option', { value: 'abertas' }, 'Em aberto'), h('option', { value: 'atrasadas' }, 'Atrasadas'), h('option', { value: '' }, 'Todas'),
      O.STATUS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    const selTipo = h('select', { 'aria-label': 'Filtrar por tipo', onchange: function () { filtro.tipo = selTipo.value; desenhar(); } },
      h('option', { value: '' }, 'Todos os tipos'), O.TIPOS.map(function (t) { return h('option', { value: t.id }, t.label); }));
    cont.appendChild(UI.cabecalho('Ordens de serviço', 'Manutenção, limpeza, visita técnica, garantia e outras demandas das instalações.', [
      busca, selStatus, selTipo, h('a.btn.primario', { href: '#/ordem/nova' }, '+ Nova ordem de serviço')
    ]));
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ formulário */

  UI.rota('/ordem/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/ordem/:id', function (cont, params) { formulario(cont, params.id); });

  function formulario(cont, id, qs) {
    const ctx = C.contexto();
    let os;
    if (id) {
      const salvo = S.get('ordens', id);
      if (!salvo) { UI.toast('Ordem de serviço não encontrada.', 'erro'); UI.ir('#/ordens'); return; }
      os = Object.assign(O.nova(ctx), U.clone(salvo));
      if (!Array.isArray(os.materiais)) os.materiais = [];
      const va = App.Assinatura.vazia;
      os.assinaturas = Object.assign({ cliente: va(), tecnico: va() }, os.assinaturas || {});
    } else {
      const inst = qs && qs.get('instalacao') ? S.get('instalacoes', qs.get('instalacao')) : null;
      os = O.nova(ctx, inst);
      os.numero = S.proximoNumero(os.data, 'os').numero;
    }
    const statusSalvo = id ? os.status : null;
    let sujo = !id;
    const inicial = id ? null : JSON.stringify(os);
    const alterado = function () { return sujo && (os.id || JSON.stringify(os) !== inicial); };
    UI.guarda = function () { return !alterado() || confirm('A ordem de serviço tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterado() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const titulo = h('h1', (id ? 'Ordem de serviço ' : 'Nova ordem de serviço ') + (os.numero || ''));
    const subt = h('p.sub');
    const atualizarTopo = function () {
      subt.textContent = [os.clienteNome, os.instalacaoTitulo ? 'Instalação: ' + os.instalacaoTitulo : ''].filter(Boolean).join(' · ') || 'Ordem de serviço sem instalação vinculada.';
    };
    atualizarTopo();
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subt), h('div.acoes',
      h('a.btn', { href: '#/ordens' }, '← Ordens de serviço'),
      h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'))));

    const colForm = h('div.form-col');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', colForm), resumo));
    const secoes = {};
    function secao(chave, tituloSec, construir) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir };
      colForm.appendChild(el);
    }
    function desenhar(chave) { const s = secoes[chave]; s.corpo.innerHTML = ''; s.construir(s.corpo); }
    const mudou = function () { sujo = true; atualizarTopo(); desenharResumo(); };

    secao('os', 'Ordem de serviço', function (c) {
      c.appendChild(UI.grade([
        { k: 'numero', label: 'Nº da OS', readonly: true, help: os.id ? 'Gerado automaticamente.' : 'Automático — confirmado ao salvar.' },
        { k: 'data', label: 'Data de abertura', type: 'date' },
        { k: 'tipo', label: 'Tipo de serviço', type: 'select', options: O.TIPOS.map(function (t) { return { v: t.id, t: t.label }; }) },
        { k: 'prioridade', label: 'Prioridade', type: 'select', options: O.PRIORIDADES.map(function (t) { return { v: t.id, t: t.label }; }) },
        { k: 'status', label: 'Situação', type: 'select', options: O.STATUS.map(function (t) { return { v: t.id, t: t.label }; }) },
        { k: 'agendadaPara', label: 'Agendada para', type: 'date' },
        { k: 'responsavel', label: 'Técnico responsável' },
        { k: 'concluidaEm', label: 'Concluída em', type: 'date' }
      ], os, function (k) {
        if (k === 'data' && !os.id) os.numero = S.proximoNumero(os.data, 'os').numero;
        if (k === 'status') O.mudarStatus(os, os.status, U.todayISO());
        if (k === 'agendadaPara' && os.agendadaPara && os.status === 'aberta') os.status = 'agendada';
        if (['data', 'status', 'agendadaPara'].indexOf(k) >= 0) desenhar('os');
        titulo.textContent = (os.id ? 'Ordem de serviço ' : 'Nova ordem de serviço ') + (os.numero || '');
        mudou();
      }, 2));
    });

    secao('local', 'Cliente e local', function (c) {
      const insts = S.list('instalacoes').slice().sort(function (a, b) { return String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'); });
      const clientes = ctx.clientes.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
      c.appendChild(UI.grade([
        { k: 'instalacaoId', label: 'Instalação', type: 'select', cls: 'span2', options: [{ v: '', t: '— sem instalação vinculada —' }].concat(insts.map(function (x) { return { v: x.id, t: x.titulo || x.clienteNome }; })),
          help: 'Traz o cliente, o telefone e o endereço da obra; a abertura e a conclusão entram no histórico da instalação.',
          onChange: function () {
            const inst = S.get('instalacoes', os.instalacaoId);
            const base = O.nova(ctx, inst);
            ['instalacaoTitulo', 'clienteId', 'clienteNome', 'telefone', 'endereco', 'cidade', 'uf'].forEach(function (k) { os[k] = base[k]; });
          } },
        { k: 'clienteId', label: 'Cliente', type: 'select', options: [{ v: '', t: '— selecione —' }].concat(clientes.map(function (x) { return { v: x.id, t: x.nome }; })),
          onChange: function () {
            const cli = ctx.clientes.find(function (x) { return x.id === os.clienteId; });
            os.clienteNome = cli ? cli.nome : '';
            if (cli && !os.telefone) os.telefone = cli.telefone || '';
            if (cli && !os.endereco) { os.endereco = [cli.endereco, cli.numero, cli.bairro].filter(Boolean).join(', '); os.cidade = cli.cidade || os.cidade; os.uf = cli.uf || os.uf; }
          } },
        { k: 'telefone', label: 'Telefone / WhatsApp', type: 'tel' },
        { k: 'endereco', label: 'Endereço', cls: 'span2' },
        { k: 'cidade', label: 'Cidade' },
        { k: 'uf', label: 'UF', type: 'select', options: [{ v: '', t: '—' }].concat(U.UFS.map(function (u) { return { v: u, t: u }; })) }
      ], os, function (k) { if (k === 'instalacaoId' || k === 'clienteId') desenhar('local'); mudou(); }, 2));
    });

    secao('servico', 'Solicitação e execução', function (c) {
      c.appendChild(UI.grade([
        { k: 'descricao', label: 'Solicitação / problema relatado', type: 'textarea', rows: 3, cls: 'span2', placeholder: 'Ex.: Inversor desligando à tarde; cliente pede limpeza dos módulos.' },
        { k: 'servico', label: 'Serviço executado', type: 'textarea', rows: 3, cls: 'span2', placeholder: 'O que foi feito, medições e recomendações.' },
        { k: 'garantia', label: 'Atendimento em garantia (sem cobrança)', type: 'checkbox' },
        { k: 'valor', label: 'Valor cobrado', type: 'money' }
      ], os, function (k) { if (k === 'garantia' && os.garantia) os.valor = ''; mudou(); if (k === 'garantia') desenhar('servico'); }, 2));
      c.appendChild(h('h4', 'Materiais utilizados'));
      c.appendChild(UI.editorLinhas(os.materiais, [
        { k: 'descricao', label: 'Material' },
        { k: 'qtd', label: 'Qtd.', w: '18%' }
      ], mudou, '+ Adicionar material', function () { return { descricao: '', qtd: '' }; }));
    });

    secao('assinaturas', 'Assinaturas', function (c) {
      const termo = App.Documento.nos.substituir(ctx.textos.termoOS || '', { empresa: ctx.empresa.razao, empresaCurta: ctx.empresa.nomeCurto || ctx.empresa.razao, cliente: os.clienteNome || 'o cliente' });
      if (termo) c.appendChild(h('div.nota.aviso', termo));
      const salvarAss = function () { mudou(); if (os.id) salvar(false); };
      c.appendChild(h('div.assinaturas-grade',
        App.Assinatura.campo('Assinatura do cliente', os.assinaturas.cliente, { nomePadrao: function () { return os.clienteNome; }, declaracao: termo }, salvarAss),
        App.Assinatura.campo('Assinatura do técnico', os.assinaturas.tecnico, { nomePadrao: function () { return os.responsavel; } }, salvarAss)));
      c.appendChild(h('p.ajuda-sec', 'O cliente assina com o dedo no celular ou tablet (ou com o mouse). As assinaturas saem no PDF da OS; sem assinatura, o PDF traz a linha para assinar à mão.'));
    });

    function desenharResumo() {
      resumo.innerHTML = '';
      const kpi = function (rot, val) { return h('div.kpi', h('span', rot), h('strong', val)); };
      resumo.appendChild(h('div.resumo-topo', badge(O.STATUS, os.status), badge(O.PRIORIDADES, os.prioridade), sujo ? UI.badge('Não salvo', 'ambar') : null,
        O.atrasada(os, U.todayISO()) ? UI.badge('Atrasada', 'erro') : null));
      resumo.appendChild(h('div.kpis',
        kpi('Tipo', O.rotulo(O.TIPOS, os.tipo)),
        kpi(os.status === 'concluida' ? 'Concluída em' : 'Agendada para', U.dataBR(os.status === 'concluida' ? os.concluidaEm : os.agendadaPara) || '—'),
        kpi('Cliente', os.clienteNome || '—'),
        kpi('Valor', os.garantia ? 'Garantia' : (U.num(os.valor) > 0 ? U.brl(U.num(os.valor)) : '—'))));
      const acao = function (novo, rotulo, cls) {
        return h('button.btn' + (cls ? '.' + cls : ''), {
          type: 'button', onclick: function () { O.mudarStatus(os, novo, U.todayISO()); mudou(); desenhar('os'); salvar(false); UI.toast('Ordem de serviço: ' + O.rotulo(O.STATUS, novo).toLowerCase() + '.', 'ok'); }
        }, rotulo);
      };
      const acoes = [];
      if (os.status === 'aberta' || os.status === 'agendada') acoes.push(acao('execucao', '▶ Iniciar execução'));
      if (O.aberta(os)) acoes.push(acao('concluida', '✓ Concluir', 'primario'));
      else acoes.push(acao('aberta', '↺ Reabrir'));
      resumo.appendChild(h('div.resumo-links', acoes));
      const btnPdf = h('button.btn', { type: 'button', onclick: function () { baixarPdf(os, btnPdf); } }, '⬇ OS em PDF');
      resumo.appendChild(h('div.resumo-links',
        h('button.btn', { type: 'button', onclick: function () { App.Visualizar.abrir(function () { return App.Relatorios.pdfOS(os, C.contexto()); }, { titulo: 'Ordem de serviço ' + (os.numero || '') }); } }, '👁 Visualizar OS'),
        btnPdf));
      if (os.instalacaoId && S.get('instalacoes', os.instalacaoId)) resumo.appendChild(h('a.btn', { href: '#/instalacao/' + os.instalacaoId }, '🏗 Abrir a instalação'));
      resumo.appendChild(h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'));
    }

    let ultimoStatus = statusSalvo;
    function salvar(avisar) {
      if (!os.clienteNome && !os.instalacaoId) { UI.toast('Escolha a instalação ou o cliente.', 'erro'); secoes.local.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      const nova = !os.id;
      let n = null;
      if (nova) { n = S.proximoNumero(os.data, 'os'); os.numero = n.numero; }
      S.save('ordens', os);
      if (n) S.reservarNumero(n.dia, n.seq, n.chave);
      // histórico da instalação: abertura e conclusão
      const inst = os.instalacaoId ? S.get('instalacoes', os.instalacaoId) : null;
      if (inst && I) {
        let txt = '';
        if (nova) txt = O.resumo(os) + ': aberta' + (os.status === 'concluida' ? ' e concluída.' : '.');
        else if (os.status === 'concluida' && ultimoStatus !== 'concluida') txt = O.resumo(os) + ': concluída.';
        else if (os.status === 'cancelada' && ultimoStatus !== 'cancelada') txt = O.resumo(os) + ': cancelada.';
        if (txt) { I.registrar(inst, txt, 'sistema'); S.save('instalacoes', inst); }
      }
      ultimoStatus = os.status;
      sujo = false;
      if (nova) { id = os.id; UI.substituirHash('#/ordem/' + os.id); titulo.textContent = 'Ordem de serviço ' + os.numero; }
      desenharResumo();
      if (avisar) UI.toast('Ordem de serviço ' + os.numero + ' salva.', 'ok');
      return true;
    }

    Object.keys(secoes).forEach(desenhar);
    desenharResumo();
  }
})(window.App);
