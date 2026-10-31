/* Instalações: lista das obras e ficha de cada uma (etapas, checklist, dados da obra e histórico). */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, C = App.Calc, I = App.Instalacao;
  const h = U.h;

  function statusBadge(inst) {
    const st = I.STATUS.find(function (x) { return x.id === I.status(inst); }) || I.STATUS[0];
    return UI.badge(st.label, st.cor);
  }

  function barra(inst) {
    const pr = I.progresso(inst);
    return h('div.progresso-box', h('div.progresso', { title: pr.feitas + ' de ' + pr.total + ' etapas' }, h('span', { style: { width: Math.round(pr.pct * 100) + '%' } })),
      h('small', pr.feitas + ' de ' + pr.total + ' etapas'));
  }

  /** Instalação já criada para a proposta (uma por proposta). */
  function daProposta(propostaId) {
    return propostaId ? S.list('instalacoes').find(function (x) { return x.propostaId === propostaId; }) || null : null;
  }

  /** Abre a instalação da proposta ou começa uma nova a partir dela. */
  App.abrirInstalacao = function (p) {
    const inst = daProposta(p.id);
    UI.ir(inst ? '#/instalacao/' + inst.id : '#/instalacao/nova?proposta=' + p.id);
  };
  App.instalacaoDaProposta = daProposta;

  /** Propostas aprovadas que ainda não têm instalação. */
  function aprovadasSemInstalacao() {
    const com = {};
    S.list('instalacoes').forEach(function (x) { if (x.propostaId) com[x.propostaId] = true; });
    return S.list('propostas').filter(function (p) { return p.status === 'aprovada' && !com[p.id]; })
      .sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
  }
  App.aprovadasSemInstalacao = aprovadasSemInstalacao;

  /* ------------------------------------------------------------ lista */

  function tabela(lista, recarregar) {
    const hoje = U.todayISO();
    const tb = h('tbody');
    lista.forEach(function (inst) {
      const atual = I.etapaAtual(inst);
      const atraso = I.atrasadas(inst, hoje);
      const st = I.status(inst);
      const n = atual ? inst.etapas.indexOf(atual) + 1 : 0;
      tb.appendChild(h('tr', { onclick: function (e) { if (!e.target.closest('button')) UI.ir('#/instalacao/' + inst.id); } },
        h('td', h('strong', inst.titulo || inst.clienteNome || 'Instalação'), h('div.mini', inst.propostaNumero ? 'Proposta ' + inst.propostaNumero : 'Sem proposta de origem')),
        h('td', inst.clienteNome || '—', h('div.mini', [inst.cidade, inst.uf].filter(Boolean).join('/'))),
        h('td', st === 'concluida' ? '✅ Todas concluídas' : (atual ? n + '. ' + atual.titulo : '—'),
          atual && atual.status === 'andamento' ? h('div.mini', 'em andamento') : null),
        h('td', barra(inst)),
        h('td', U.dataBR(I.previsaoConclusao(inst)) || '—', atraso.length && st !== 'pausada' ? h('div', UI.badge(atraso.length === 1 ? '1 etapa atrasada' : atraso.length + ' etapas atrasadas', 'erro')) : null),
        h('td', statusBadge(inst)),
        h('td.acoes-col', App.Visualizar.botao(function () { return App.Relatorios.pdfInstalacao(inst, C.contexto()); }, 'Relatório de instalação — ' + (inst.titulo || inst.clienteNome || '')), h('button.btn-icone.perigo', {
          type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async function () {
            if (await UI.confirmar('Excluir a instalação "' + (inst.titulo || inst.clienteNome) + '"? O histórico da obra será perdido.', 'Excluir', true)) {
              if (inst.acompanhamento && inst.acompanhamento.token) App.Acompanhamento.despublicar(inst.acompanhamento.token);
              S.remove('instalacoes', inst.id);
              UI.toast('Instalação excluída.');
              recarregar();
            }
          }
        }, '🗑'))));
    });
    return h('div.tabela-rolagem', h('table.tabela.instalacoes',
      h('thead', h('tr', ['Obra', 'Cliente', 'Etapa atual', 'Progresso', 'Previsão de conclusão', 'Situação', ''].map(function (t) { return h('th', t); }))), tb));
  }

  UI.rota('/instalacoes', function (cont) {
    const filtro = { q: '', status: '' };
    const box = h('div.card.sem-pad');
    const hoje = U.todayISO();
    function desenhar() {
      let lista = S.list('instalacoes');
      const q = filtro.q.trim().toLowerCase();
      if (q) lista = lista.filter(function (x) { return [x.titulo, x.clienteNome, x.cidade, x.propostaNumero].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (filtro.status === 'atrasadas') lista = lista.filter(function (x) { return I.status(x) === 'andamento' && I.atrasadas(x, hoje).length; });
      else if (filtro.status === 'abertas') lista = lista.filter(function (x) { return ['iniciar', 'andamento'].indexOf(I.status(x)) >= 0; });
      else if (filtro.status) lista = lista.filter(function (x) { return I.status(x) === filtro.status; });
      // em andamento primeiro, depois as que terminam antes
      const ordem = { andamento: 0, iniciar: 1, pausada: 2, concluida: 3, cancelada: 4 };
      lista.sort(function (a, b) {
        return (ordem[I.status(a)] - ordem[I.status(b)]) || String(I.previsaoConclusao(a) || '9').localeCompare(String(I.previsaoConclusao(b) || '9'));
      });
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(h('div.vazio', h('p', S.list('instalacoes').length ? 'Nenhuma instalação encontrada com esses filtros.'
          : 'Nenhuma instalação ainda. Quando uma proposta for aprovada, inicie a instalação por ela (botão 🏗) ou crie uma em branco.'),
        h('a.btn.primario', { href: '#/instalacao/nova' }, '+ Nova instalação')));
        return;
      }
      box.appendChild(tabela(lista, desenhar));
    }
    const busca = h('input.busca', { type: 'search', placeholder: 'Cliente, cidade ou proposta…', oninput: function () { filtro.q = busca.value; desenhar(); } });
    const selStatus = h('select', { 'aria-label': 'Filtrar por situação', onchange: function () { filtro.status = selStatus.value; desenhar(); } },
      h('option', { value: '' }, 'Todas'), h('option', { value: 'abertas' }, 'A iniciar e em andamento'), h('option', { value: 'atrasadas' }, 'Com etapa atrasada'),
      I.STATUS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    cont.appendChild(UI.cabecalho('Instalações', 'Obras das propostas aprovadas: etapas, prazos, checklist e histórico de cada instalação.', [
      busca, selStatus, h('a.btn.primario', { href: '#/instalacao/nova' }, '+ Nova instalação')
    ]));
    const pend = aprovadasSemInstalacao();
    if (pend.length) {
      cont.appendChild(h('div.card.dica', h('p', h('strong', pend.length === 1 ? '1 proposta aprovada ainda sem instalação:' : pend.length + ' propostas aprovadas ainda sem instalação:')),
        h('div.chips-propostas', pend.slice(0, 8).map(function (p) {
          return h('a.btn.pequeno', { href: '#/instalacao/nova?proposta=' + p.id }, '🏗 ' + p.numero + ' — ' + (p.clienteNome || 'sem cliente'));
        }))));
    }
    cont.appendChild(box);
    desenhar();
  });

  /* ------------------------------------------------------------ ficha da instalação */

  UI.rota('/instalacao/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/instalacao/:id', function (cont, params) { formulario(cont, params.id); });

  function normalizar(inst, ctx) {
    const base = I.nova(ctx);
    // instalações gravadas antes do checklist e dos equipamentos instalados: completa pela proposta de origem
    if (inst.placas === undefined || inst.checklistInstalacao === undefined) {
      const prop = inst.propostaId ? S.get('propostas', inst.propostaId) : null;
      const ref = prop ? I.deProposta(prop, ctx) : base;
      if (inst.placas === undefined) inst.placas = ref.placas;
      if (inst.checklistInstalacao === undefined) inst.checklistInstalacao = ref.checklistInstalacao;
    }
    // instalações gravadas antes dos materiais consumidos: o previsto vem da lista de materiais CA da proposta
    if (inst.materiais === undefined) {
      const prop = inst.propostaId ? S.get('propostas', inst.propostaId) : null;
      inst.materiais = prop ? App.Materiais.daProposta(prop) : [];
    }
    Object.keys(base).forEach(function (k) { if (inst[k] === undefined) inst[k] = U.clone(base[k]); });
    inst.equipamentos = Object.assign(U.clone(base.equipamentos), inst.equipamentos || {});
    const pv = I.placasVazias();
    inst.placas.modulo = Object.assign(pv.modulo, inst.placas.modulo || {});
    inst.placas.inversor = Object.assign(pv.inversor, inst.placas.inversor || {});
    ['modulo', 'inversor'].forEach(function (k) {
      if (!Array.isArray(inst.placas[k].fotos)) inst.placas[k].fotos = [];
      if (!inst.placas[k].legendas || typeof inst.placas[k].legendas !== 'object' || Array.isArray(inst.placas[k].legendas)) inst.placas[k].legendas = {};
      I.vincularCadastro(inst.placas[k], ctx.equipamentos, k);
    });
    // sem marca e modelo: puxa da proposta de origem
    if (!inst.placas.modulo.modelo && !inst.placas.inversor.modelo && inst.propostaId) {
      const prop = S.get('propostas', inst.propostaId);
      if (prop) I.placasDaProposta(inst, prop, ctx);
    }
    inst.checklistInstalacao.forEach(function (g) { if (!Array.isArray(g.itens)) g.itens = []; });
    const va = App.Assinatura.vazia;
    inst.assinaturas = Object.assign({ cliente: va(), tecnico: va() }, inst.assinaturas || {});
    if (!Array.isArray(inst.etapas)) inst.etapas = [];
    if (!Array.isArray(inst.historico)) inst.historico = [];
    inst.etapas.forEach(function (e) { if (!Array.isArray(e.checklist)) e.checklist = []; if (!e.id) e.id = 'et-' + U.uid(); });
    return inst;
  }

  const MAX_FOTOS = 6;

  /**
   * Fotos do equipamento (etiqueta e instalação): botões para tirar a foto com a câmera ou escolher imagens, miniaturas
   * (deste aparelho ou da nuvem) com legenda digitada (opcional; sem ela, o relatório usa a padrão), ampliar e remover.
   */
  function campoFotos(rotulo, lista, legendas, padrao, aoMudar, aoDigitar) {
    const F = App.Fotos;
    const box = h('div.campo.campo-fotos');
    const grade = h('div.fotos-grade');
    const botoes = h('div.fotos-botoes');
    async function incluir(arquivos) {
      const arqs = Array.prototype.slice.call(arquivos, 0, MAX_FOTOS - lista.length);
      for (const a of arqs) {
        try { lista.push(await F.salvar(await F.preparar(a))); } catch (e) { console.error(e); UI.toast('Não foi possível ler a imagem. Use JPG ou PNG.', 'erro'); }
      }
      aoMudar();
      desenhar();
    }
    const seletor = function (cls, texto, camera) {
      const input = h('input', { type: 'file', accept: 'image/*', multiple: camera ? null : true, capture: camera ? 'environment' : null,
        onchange: function () { const fs = input.files; const l = Array.prototype.slice.call(fs); input.value = ''; incluir(l); } });
      return h('label.btn.pequeno.' + cls, input, texto);
    };
    function desenhar() {
      grade.innerHTML = '';
      lista.forEach(function (fid, i) {
        const aviso = h('span.foto-aviso', 'carregando…');
        const img = h('img', { alt: (legendas[fid] || padrao + ' — foto ' + (i + 1)), hidden: true });
        F.obter(fid).then(function (f) {
          if (f) { img.src = f.dataURL; img.hidden = false; aviso.remove(); } else aviso.textContent = 'foto na nuvem — entre na sincronização para ver';
        });
        img.addEventListener('click', function () {
          UI.modal({ titulo: legendas[fid] || rotulo, largo: true, corpo: h('img.foto-ampliada', { src: img.src, alt: legendas[fid] || rotulo }), acoes: [{ label: 'Fechar' }] });
        });
        const legenda = h('textarea.foto-legenda', {
          rows: 2, value: legendas[fid] || '', maxlength: 90, placeholder: padrao + ' — foto ' + (i + 1), 'aria-label': 'Legenda da foto ' + (i + 1),
          oninput: function () { const v = legenda.value.trim(); if (v) legendas[fid] = legenda.value; else delete legendas[fid]; if (aoDigitar) aoDigitar(); }
        });
        grade.appendChild(h('div.foto-card',
          h('div.foto-mini', aviso, img, h('button.btn-icone.perigo.foto-remover', {
            type: 'button', title: 'Remover foto', 'aria-label': 'Remover foto', onclick: async function () {
              if (!(await UI.confirmar('Remover esta foto?', 'Remover', true))) return;
              await F.remover(fid);
              lista.splice(lista.indexOf(fid), 1);
              delete legendas[fid];
              aoMudar();
              desenhar();
            }
          }, '×')),
          legenda));
      });
      botoes.innerHTML = '';
      if (lista.length < MAX_FOTOS) {
        botoes.appendChild(seletor('foto-camera', '📷 Tirar foto', true));
        botoes.appendChild(seletor('foto-escolher', '🖼️ Escolher imagens', false));
        botoes.appendChild(h('small.ajuda', lista.length ? (MAX_FOTOS - lista.length) + ' de ' + MAX_FOTOS + ' fotos disponíveis. A legenda é opcional e sai no relatório.' : 'Até ' + MAX_FOTOS + ' fotos (etiqueta, equipamento instalado…). A legenda é opcional e sai no relatório.'));
      } else botoes.appendChild(h('small.ajuda', 'Limite de ' + MAX_FOTOS + ' fotos. Remova uma para incluir outra.'));
    }
    desenhar();
    box.appendChild(h('label', rotulo));
    box.appendChild(grade);
    box.appendChild(botoes);
    return box;
  }

  function formulario(cont, id, qs) {
    const ctx = C.contexto();
    let inst;
    if (id) {
      const salvo = S.get('instalacoes', id);
      if (!salvo) { UI.toast('Instalação não encontrada.', 'erro'); UI.ir('#/instalacoes'); return; }
      inst = normalizar(U.clone(salvo), ctx);
    } else {
      const prop = qs && qs.get('proposta') ? S.get('propostas', qs.get('proposta')) : null;
      const existente = prop ? daProposta(prop.id) : null;
      if (existente) { UI.substituirHash('#/instalacao/' + existente.id); formulario(cont, existente.id); return; }
      inst = prop ? I.deProposta(prop, ctx) : I.nova(ctx);
    }
    let sujo = !id;
    const inicial = id ? null : JSON.stringify(inst);
    const alterado = function () { return sujo && (inst.id || JSON.stringify(inst) !== inicial); };
    UI.guarda = function () { return !alterado() || confirm('A instalação tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterado() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const titulo = h('h1', id ? 'Instalação' : 'Nova instalação');
    const subt = h('p.sub');
    const atualizarTopo = function () {
      titulo.textContent = (id || inst.id ? 'Instalação' : 'Nova instalação') + (inst.clienteNome ? ' — ' + inst.clienteNome : '');
      subt.textContent = inst.propostaNumero ? 'Proposta ' + inst.propostaNumero + (inst.valor && App.Acesso.veValores() ? ' · ' + U.brl(inst.valor) : '') : 'Instalação sem proposta de origem.';
    };
    atualizarTopo();
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subt), h('div.acoes',
      h('a.btn', { href: '#/instalacoes' }, '← Instalações'),
      h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'))));

    const colForm = h('div.form-col');
    const nav = h('nav.passos');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', nav, colForm), resumo));
    const secoes = {};
    function secao(chave, tituloSec, construir) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir };
      colForm.appendChild(el);
      nav.appendChild(h('a', { href: 'javascript:void 0', onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, tituloSec));
    }
    function desenhar(chave) { const s = secoes[chave]; s.corpo.innerHTML = ''; s.construir(s.corpo); }
    const mudou = function () { sujo = true; atualizarTopo(); desenharResumo(); };

    /* ---------- obra */
    secao('obra', 'Obra', function (c) {
      const props = S.list('propostas').slice().sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      const estado = { propostaId: inst.propostaId || '' };
      c.appendChild(h('div.linha-campo',
        h('div.cresce', UI.campo({ k: 'propostaId', label: 'Proposta de origem', type: 'select', options: [{ v: '', t: '— nenhuma —' }].concat(props.map(function (p) {
          return { v: p.id, t: p.numero + ' — ' + (p.clienteNome || 'sem cliente') + (p.status === 'aprovada' ? ' (aprovada)' : '') };
        })) }, estado)),
        h('button.btn', {
          type: 'button', onclick: async function () {
            const prop = estado.propostaId ? S.get('propostas', estado.propostaId) : null;
            if (!prop) { UI.toast('Selecione a proposta.', 'erro'); return; }
            const outra = daProposta(prop.id);
            if (outra && outra.id !== inst.id) { UI.toast('A proposta ' + prop.numero + ' já tem uma instalação.', 'erro'); return; }
            if (!(await UI.confirmar('Importar cliente, endereço, sistema e equipamentos da proposta ' + prop.numero + '? As etapas e o histórico desta instalação são mantidos.', 'Importar'))) return;
            const novo = I.deProposta(prop, ctx);
            ['propostaId', 'propostaNumero', 'clienteId', 'clienteNome', 'telefone', 'endereco', 'cidade', 'uf', 'tipoSistema', 'kwp', 'kwh', 'valor', 'titulo',
              'equipamentos', 'geracaoMes', 'economiaMes', 'reducaoPct', 'segmento'].forEach(function (k) { inst[k] = novo[k]; });
            I.placasDaProposta(inst, prop, ctx); // módulo e inversor da proposta (mantém nº de série e fotos)
            I.registrar(inst, 'Dados importados da proposta ' + prop.numero + '.', 'sistema');
            mudou();
            Object.keys(secoes).forEach(desenhar);
            UI.toast('Dados importados da proposta ' + prop.numero + '.', 'ok');
          }
        }, 'Importar dados da proposta')));
      const clientes = ctx.clientes.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
      c.appendChild(UI.grade([
        { k: 'titulo', label: 'Nome da obra', cls: 'span2', placeholder: 'Ex.: João Silva — 5,6 kWp On-Grid' },
        { k: 'clienteId', label: 'Cliente', type: 'select', options: [{ v: '', t: '— selecione —' }].concat(clientes.map(function (x) { return { v: x.id, t: x.nome }; })),
          onChange: function () {
            const cli = ctx.clientes.find(function (x) { return x.id === inst.clienteId; });
            inst.clienteNome = cli ? cli.nome : '';
            if (cli && !inst.telefone) inst.telefone = cli.telefone || '';
          } },
        { k: 'telefone', label: 'Telefone / WhatsApp do cliente', type: 'tel' },
        { k: 'endereco', label: 'Endereço da instalação', cls: 'span2' },
        { k: 'cidade', label: 'Cidade' },
        { k: 'uf', label: 'UF', type: 'select', options: [{ v: '', t: '—' }].concat(U.UFS.map(function (u) { return { v: u, t: u }; })) },
        { k: 'situacao', label: 'Situação da obra', type: 'select', options: I.SITUACOES.map(function (s) { return { v: s.id, t: s.label }; }),
          help: 'Ativa: a situação segue as etapas (a iniciar, em andamento, concluída).' },
        { k: 'inicioPrevisto', label: 'Início previsto', type: 'date', help: 'As previsões das etapas são contadas a partir desta data.' },
        { k: 'responsavel', label: 'Responsável técnico' },
        { k: 'equipe', label: 'Equipe de instalação', placeholder: 'Ex.: Equipe 1 — Carlos e Pedro' },
        { k: 'fotosLink', label: 'Link das fotos da obra', type: 'url', cls: 'span2', placeholder: 'https://… (pasta do Google Drive, álbum do Google Fotos…)',
          help: 'As fotos ficam na sua pasta da nuvem; aqui guardamos só o link, sem ocupar o armazenamento do app.' },
        { k: 'observacoes', label: 'Observações internas', type: 'textarea', rows: 2, cls: 'span2' }
      ], inst, function (k) {
        if (k === 'situacao') I.registrar(inst, 'Situação da obra: ' + (I.SITUACOES.find(function (s) { return s.id === inst.situacao; }) || {}).label + '.', 'sistema');
        if (k === 'inicioPrevisto') { I.preverDatas(inst); desenhar('etapas'); }
        if (k === 'situacao') desenhar('historico');
        mudou();
      }, 2));
      if (inst.fotosLink && /^https?:\/\//i.test(inst.fotosLink)) c.appendChild(h('a.btn.pequeno', { href: inst.fotosLink, target: '_blank', rel: 'noopener' }, '📷 Abrir fotos da obra'));
    });

    /* ---------- etapas */
    secao('etapas', 'Etapas', function (c) {
      const hoje = U.todayISO();
      c.appendChild(h('div.nota', 'As etapas vêm do cronograma de execução (Configurações › Textos padrão › Passo a passo). ',
        'As previsões somam o prazo de cada etapa a partir do início previsto; ajuste a data de uma etapa quando precisar.'));
      const lista = h('div.etapas');
      inst.etapas.forEach(function (e, i) {
        const atrasada = e.status !== 'concluida' && e.previsto && e.previsto < hoje && inst.situacao !== 'cancelada';
        const card = h('div.etapa.' + e.status + (atrasada ? '.atrasada' : ''));
        const acao = function (novo, rotulo, cls) {
          return h('button.btn.pequeno' + (cls ? '.' + cls : ''), {
            type: 'button', onclick: function () {
              I.mudarEtapa(inst, e, novo, U.todayISO());
              mudou();
              desenhar('etapas'); desenhar('historico');
              if (inst.id) salvar(false);
              UI.toast(rotulo === '✓ Concluir' ? 'Etapa concluída' + (inst.id ? ' e salva.' : '.') : (novo === 'andamento' ? 'Etapa em andamento.' : 'Etapa reaberta.'), 'ok');
              if (novo === 'concluida' && perguntarAviso()) avisarEtapa(e);
            }
          }, rotulo);
        };
        const stEtapa = I.STATUS_ETAPA.find(function (s) { return s.id === e.status; }) || I.STATUS_ETAPA[0];
        card.appendChild(h('div.etapa-topo',
          h('span.etapa-num', e.status === 'concluida' ? '✓' : String(i + 1)),
          h('div.etapa-titulo', UI.campo({ k: 'titulo', placeholder: 'Descrição da etapa' }, e, mudou)),
          UI.badge(stEtapa.label, e.status === 'concluida' ? 'ok' : (e.status === 'andamento' ? 'azul' : 'cinza')),
          atrasada ? UI.badge('Atrasada', 'erro') : null,
          e.status === 'pendente' ? acao('andamento', '▶ Iniciar') : null,
          e.status === 'concluida' ? h('button.btn.pequeno.btn-avisar' + (e.avisadoEm ? '.avisado' : ''), {
            type: 'button', title: e.avisadoEm ? 'Cliente avisado em ' + App.Assinatura.dataHora(e.avisadoEm) + ' — clique para avisar de novo' : 'Avisar o cliente pelo WhatsApp',
            onclick: function () { avisarEtapa(e); }
          }, e.avisadoEm ? '📲 Avisado ✓' : '📲 Avisar cliente') : null,
          e.status !== 'concluida' ? acao('concluida', '✓ Concluir', 'primario') : acao('andamento', '↺ Reabrir'),
          h('span.etapa-ordem',
            h('button.btn-icone', { type: 'button', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0, onclick: function () {
              inst.etapas.splice(i - 1, 0, inst.etapas.splice(i, 1)[0]); I.preverDatas(inst); mudou(); desenhar('etapas');
            } }, '↑'),
            h('button.btn-icone.perigo', { type: 'button', title: 'Remover etapa', 'aria-label': 'Remover etapa', onclick: async function () {
              if (!(await UI.confirmar('Remover a etapa "' + (e.titulo || i + 1) + '"?', 'Remover', true))) return;
              inst.etapas.splice(i, 1); I.preverDatas(inst); mudou(); desenhar('etapas');
            } }, '×'))));
        card.appendChild(h('div.etapa-datas', UI.grade([
          { k: 'prazo', label: 'Prazo estimado', placeholder: 'Ex.: 5 dias úteis' },
          { k: 'previsto', label: 'Previsto para', type: 'date' },
          { k: 'iniciadoEm', label: 'Iniciada em', type: 'date' },
          { k: 'concluidoEm', label: 'Concluída em', type: 'date' }
        ], e, function (k) {
          if (k === 'prazo') I.preverDatas(inst);
          mudou();
          if (k === 'prazo' || k === 'concluidoEm') desenhar('etapas');
        }, 4)));
        // checklist da etapa
        const ck = h('div.checklist');
        e.checklist.forEach(function (item, j) {
          const cb = h('input', { type: 'checkbox', onchange: function () { item.ok = cb.checked; mudou(); } });
          cb.checked = !!item.ok;
          ck.appendChild(h('div.checklist-item', h('label', cb, h('span', item.texto)),
            h('button.btn-icone.perigo', { type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { e.checklist.splice(j, 1); mudou(); desenhar('etapas'); } }, '×')));
        });
        const novoItem = h('input', { type: 'text', placeholder: 'Novo item do checklist (ex.: aterramento conferido)', onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); add(); } } });
        const add = function () {
          const tx = novoItem.value.trim();
          if (!tx) return;
          e.checklist.push({ texto: tx, ok: false });
          mudou(); desenhar('etapas');
        };
        const feitos = e.checklist.filter(function (x) { return x.ok; }).length;
        card.appendChild(h('details.etapa-mais', { open: !!(e.checklist.length || e.obs) },
          h('summary', 'Checklist' + (e.checklist.length ? ' (' + feitos + '/' + e.checklist.length + ')' : '') + ' e observações'),
          ck, h('div.checklist-novo', novoItem, h('button.btn.pequeno', { type: 'button', onclick: add }, '+ Item')),
          UI.campo({ k: 'obs', label: 'Observações da etapa', type: 'textarea', rows: 2 }, e, mudou)));
        lista.appendChild(card);
      });
      c.appendChild(lista);
      c.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { inst.etapas.push(I.novaEtapa('', '')); I.preverDatas(inst); mudou(); desenhar('etapas'); } }, '+ Adicionar etapa'),
        h('button.btn.pequeno', { type: 'button', onclick: function () { I.preverDatas(inst); mudou(); desenhar('etapas'); UI.toast('Previsões recalculadas.'); } }, '↻ Recalcular previsões')));
    });

    /* ---------- avisos ao cliente: WhatsApp a cada etapa e página "Acompanhe sua obra" */
    const A = App.Acompanhamento;
    const linkPagina = function () { const a = inst.acompanhamento; return a && a.ativo && a.token ? A.linkAcompanhamento(a.token) : ''; };
    const perguntarAviso = function () { try { return localStorage.getItem('crm.aviso.perguntar') !== 'nao'; } catch (e) { return true; } };
    let situacaoEl = null;
    const pintarSituacao = function (s) {
      if (!situacaoEl || !inst.acompanhamento) return;
      s = s || A.situacao(inst.acompanhamento.token);
      situacaoEl.className = 'situacao-publicacao' + (s && (s.estado === 'erro' || s.estado === 'semNuvem') ? ' erro' : '');
      situacaoEl.replaceChildren();
      if (!s) { situacaoEl.textContent = 'A página é atualizada a cada gravação da instalação.'; return; }
      if (s.estado === 'ok') situacaoEl.textContent = '✅ ' + (s.teste ? s.mensagem : 'Página atualizada às ' + App.Assinatura.dataHora(s.em).split(' às ')[1] + '.');
      else if (s.estado === 'enviando') situacaoEl.textContent = '⏳ ' + s.mensagem;
      else { situacaoEl.appendChild(document.createTextNode('⚠️ ' + s.mensagem + ' ')); situacaoEl.appendChild(h('a', { href: '#/nuvem' }, 'Abrir Sincronização (nuvem)')); }
    };
    const publicarPagina = function () { if (inst.acompanhamento && inst.acompanhamento.ativo) A.publicar(inst, ctx, pintarSituacao); };

    /** Janela do aviso: a mensagem (editável) e o botão que abre o WhatsApp com ela, na conversa do cliente. */
    function avisarCliente(texto, aoEnviar, o) {
      o = o || {};
      const est = { texto: texto, naoPerguntar: !perguntarAviso() };
      const guardar = function () { if (o.etapa) { try { localStorage.setItem('crm.aviso.perguntar', est.naoPerguntar ? 'nao' : 'sim'); } catch (e) { /* indisponível */ } } };
      const tel = A.telefoneWhats(inst.telefone);
      UI.modal({
        titulo: o.titulo || 'Avisar o cliente pelo WhatsApp',
        corpo: h('div.aviso-whats',
          h('p.ajuda-sec', tel ? 'Para: ' + (inst.clienteNome || 'cliente') + ' — ' + inst.telefone : '⚠️ Telefone do cliente não informado (seção Obra): o WhatsApp vai pedir para escolher o contato.'),
          UI.campo({ k: 'texto', label: 'Mensagem (pode editar antes de enviar)', type: 'textarea', rows: 10 }, est),
          o.dicaLink && !linkPagina() ? h('p.nota', 'Dica: crie o link de acompanhamento na seção Avisos ao cliente; ele passa a ir junto nas mensagens.') : null,
          o.etapa ? UI.campo({ k: 'naoPerguntar', label: 'Não perguntar ao concluir as próximas etapas (o botão 📲 de cada etapa continua disponível)', type: 'checkbox' }, est) : null),
        acoes: [
          { label: 'Agora não', onClick: guardar },
          { label: '📲 Abrir o WhatsApp', primario: true, onClick: function () { guardar(); window.open(A.linkWhats(inst.telefone, est.texto), '_blank'); if (aoEnviar) aoEnviar(); } }
        ]
      });
    }

    function avisarEtapa(e) {
      const n = inst.etapas.indexOf(e) + 1;
      avisarCliente(A.mensagemEtapa(inst, ctx, e, linkPagina()), function () {
        e.avisadoEm = new Date().toISOString();
        I.registrar(inst, '📲 Cliente avisado pelo WhatsApp: etapa ' + n + ' — ' + e.titulo + ' concluída.', 'nota');
        mudou(); desenhar('etapas'); desenhar('historico');
        if (inst.id) salvar(false);
      }, { etapa: true, dicaLink: true, titulo: 'Avisar o cliente: etapa ' + n + ' concluída' });
    }

    function enviarLink() {
      avisarCliente(A.mensagemLink(inst, ctx, linkPagina()), function () {
        I.registrar(inst, '📲 Link de acompanhamento enviado ao cliente pelo WhatsApp.', 'nota');
        mudou(); desenhar('historico');
        if (inst.id) salvar(false);
      }, { titulo: 'Enviar o link de acompanhamento' });
    }

    secao('avisos', 'Avisos ao cliente', function (c) {
      c.appendChild(h('p.ajuda-sec', 'Ao concluir cada etapa, o app abre o WhatsApp com a mensagem pronta para o cliente — é só apertar enviar (sem custo, pelo seu próprio WhatsApp). ',
        'O texto é editável em Configurações › Textos padrão; cada aviso fica no histórico e a etapa mostra "📲 Avisado ✓".'));
      if (!A.telefoneWhats(inst.telefone)) c.appendChild(h('p.nota.aviso', 'Informe o telefone / WhatsApp do cliente na seção Obra para a mensagem já abrir na conversa dele.'));
      c.appendChild(h('h3.sub-avisos', '🔗 Página "Acompanhe sua obra"'));
      const a = inst.acompanhamento;
      const N = App.Nuvem;
      if (!a || !a.ativo) {
        c.appendChild(h('p.ajuda-sec', 'Um link só desta obra para o cliente ver as etapas, o progresso e a previsão de conclusão — e, se você quiser, as fotos dos equipamentos. ',
          'Sem valores, endereço ou telefone. A página se atualiza a cada gravação da instalação.'));
        c.appendChild(h('div.barra-itens', h('button.btn.primario', {
          type: 'button', onclick: function () {
            if (!inst.id && !salvar(false)) return;
            inst.acompanhamento = { token: A.novoToken(), ativo: true, fotos: false, criadoEm: new Date().toISOString() };
            I.registrar(inst, 'Link de acompanhamento criado para o cliente.', 'sistema');
            mudou(); salvar(false); desenhar('avisos'); desenhar('historico');
            enviarLink();
          }
        }, '🔗 Criar link de acompanhamento')));
        if (!N || !N.usuario) c.appendChild(h('p.nota.aviso', 'A página usa a sincronização (nuvem): entre com a sua conta Google em ', h('a', { href: '#/nuvem' }, 'Configurações › Sincronização (nuvem)'), ' neste aparelho.'));
        return;
      }
      const link = linkPagina();
      const campoLink = h('input.link-acompanhamento', { type: 'text', readonly: true, value: link, 'aria-label': 'Link de acompanhamento', onfocus: function () { campoLink.select(); } });
      c.appendChild(h('div.linha-campo', h('div.cresce', campoLink),
        h('button.btn', {
          type: 'button', onclick: async function () {
            try { await navigator.clipboard.writeText(link); UI.toast('Link copiado.', 'ok'); } catch (e) { campoLink.select(); UI.toast('Selecione o link e copie (Ctrl+C).'); }
          }
        }, '📋 Copiar'),
        h('a.btn', { href: link, target: '_blank', rel: 'noopener' }, '↗ Abrir')));
      c.appendChild(h('div.barra-itens', h('button.btn.primario', { type: 'button', onclick: enviarLink }, '📲 Enviar o link pelo WhatsApp')));
      c.appendChild(UI.campo({ k: 'fotos', label: 'Mostrar as fotos dos equipamentos (com as legendas) na página do cliente', type: 'checkbox' }, a, function () { mudou(); if (inst.id) salvar(false); }));
      situacaoEl = h('p.situacao-publicacao');
      c.appendChild(situacaoEl);
      pintarSituacao();
      c.appendChild(h('div.barra-itens',
        h('button.btn.pequeno', { type: 'button', onclick: function () { if (inst.id) salvar(false); publicarPagina(); } }, '↻ Atualizar a página agora'),
        h('button.btn.pequeno', {
          type: 'button', onclick: async function (ev) {
            const b = ev.currentTarget;
            b.disabled = true;
            pintarSituacao({ estado: 'enviando', mensagem: 'Testando o link como o cliente…' });
            const s = await A.testarLink(a.token);
            b.disabled = false;
            pintarSituacao(Object.assign({ teste: true }, s));
          }
        }, '🔎 Testar o link'),
        h('button.btn.pequeno.perigo', {
          type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Desativar o link? O cliente deixa de ver a página; um link novo pode ser criado depois.', 'Desativar', true))) return;
            A.despublicar(a.token);
            inst.acompanhamento = { ativo: false };
            I.registrar(inst, 'Link de acompanhamento desativado.', 'sistema');
            mudou(); if (inst.id) salvar(false); desenhar('avisos'); desenhar('historico');
          }
        }, 'Desativar o link')));
    });

    /* ---------- equipamentos instalados (do cadastro ou digitados, nº de série e fotos das etiquetas) */
    secao('equipamentos', 'Equipamentos instalados', function (c) {
      const prop = inst.propostaId ? S.get('propostas', inst.propostaId) : null;
      c.appendChild(h('div.linha-campo',
        h('p.ajuda-sec.cresce', 'Módulo e inversor vêm da proposta; escolha outro da lista do cadastro ou, se não estiver cadastrado, digite marca e modelo. ',
          'As fotos (etiquetas e equipamentos instalados) ficam neste aparelho e na nuvem, sem ocupar o armazenamento do app, e saem no relatório com a legenda digitada.'),
        prop ? h('button.btn.pequeno', {
          type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Puxar marca, modelo, potência e quantidade do módulo e do inversor da proposta ' + prop.numero + '? Nº de série e fotos são mantidos.', 'Puxar'))) return;
            if (I.placasDaProposta(inst, prop, ctx)) { mudou(); desenhar('equipamentos'); UI.toast('Módulo e inversor da proposta ' + prop.numero + '.', 'ok'); }
            else UI.toast('A proposta ' + prop.numero + ' não tem módulo e inversor definidos.', 'erro');
          }
        }, '↻ Puxar da proposta') : null));
      const fotoMudou = function () { mudou(); if (inst.id) salvar(false); };
      const bloco = function (qual, titulo, un, rotFotos, padraoFotos) {
        const pl = inst.placas[qual];
        const lista = I.opcoesCadastro(ctx.equipamentos, qual);
        const doCadastro = !!(pl.equipamentoId && lista.some(function (e) { return e.id === pl.equipamentoId; }));
        if (!doCadastro) pl.equipamentoId = '';
        const escolha = UI.campo({ k: 'equipamentoId', label: 'Equipamento', type: 'select',
          options: [{ v: '', t: lista.length ? '✏️ Não está no cadastro — digitar marca e modelo' : '✏️ Digitar marca e modelo (nenhum cadastrado)' }].concat(lista.map(function (e) {
            return { v: e.id, t: [e.fabricante, e.modelo].filter(Boolean).join(' ') + (U.num(e.potencia) > 0 ? ' — ' + U.fmtSmart(U.num(e.potencia), 2) + ' ' + un : '') + (e.ativo === false ? ' (inativo)' : '') };
          })),
          help: doCadastro ? 'Do cadastro de equipamentos. Para digitar outro, escolha "Não está no cadastro".' : (lista.length ? 'Digitado. Para usar um equipamento cadastrado, escolha na lista.' : 'Cadastre em Cadastros › Equipamentos para escolher da lista.')
        }, pl, function () {
          I.placaDoCadastro(pl, lista.find(function (e) { return e.id === pl.equipamentoId; }) || null);
          mudou(); desenhar('equipamentos');
        });
        escolha.classList.add('span-all');
        const defs = [
          { el: escolha },
          { k: 'marca', label: 'Marca', readonly: doCadastro }, { k: 'modelo', label: 'Modelo', cls: 'span2', readonly: doCadastro },
          { k: 'quantidade', label: 'Quantidade', type: 'int' },
          { k: 'potencia', label: 'Potência', type: 'number', suffix: un, readonly: doCadastro },
          { k: 'serie', label: qual === 'modulo' ? 'Nº de série / lote' : 'Nº de série', cls: qual === 'modulo' ? 'span-all' : 'span2',
            placeholder: qual === 'modulo' ? 'Um ou mais, separados por vírgula' : '' }
        ];
        return h('div.equip-instalado', h('h3', titulo), UI.grade(defs, pl, mudou, 4), campoFotos(rotFotos, pl.fotos, pl.legendas, padraoFotos, fotoMudou, mudou));
      };
      c.appendChild(bloco('modulo', '☀️ Módulos fotovoltaicos', 'Wp', 'Fotos dos módulos (etiqueta e instalação)', 'Módulos'));
      c.appendChild(bloco('inversor', '🔌 Inversor (ou microinversores)', 'kW', 'Fotos do inversor (etiqueta e instalação)', 'Inversor'));
    });

    /* ---------- materiais consumidos (infraestrutura CA) */
    secao('materiais', 'Materiais consumidos', function (c) {
      const prop = inst.propostaId ? S.get('propostas', inst.propostaId) : null;
      const daProp = prop ? App.Materiais.daProposta(prop) : [];
      c.appendChild(h('p.ajuda-sec', 'Materiais da infraestrutura CA usados nesta obra. O previsto vem da lista de materiais CA da proposta; lance o usado ',
        '(ou os itens dos pedidos de compra da obra). O consumo real serve de base para o custo da próxima proposta.'));
      const botoes = [];
      if (daProp.length) {
        botoes.push(h('button.btn.pequeno', {
          type: 'button', onclick: function () {
            const n = App.Materiais.puxarProposta(inst, prop);
            mudou(); desenhar('materiais');
            UI.toast(n + ' material(is) previsto(s) na proposta ' + prop.numero + '.', 'ok');
          }
        }, '↻ Puxar previsto da proposta'));
      }
      // pedidos de compra: fora do perfil do técnico
      if (App.Acesso.podeLer('compras')) {
        botoes.push(h('button.btn.pequeno', { type: 'button', onclick: lancarPedido }, '🛒 Lançar pedido de compra'));
        if (inst.id) botoes.push(h('a.btn.pequeno', { href: '#/compra/nova?instalacao=' + inst.id }, '+ Novo pedido para esta obra'));
      }
      c.appendChild(App.Materiais.editor(inst.materiais, {
        equipamentos: ctx.equipamentos, modo: 'instalacao', botoes: botoes,
        vazio: prop ? 'A proposta ' + prop.numero + ' não tem lista de materiais CA. Lance os pedidos de compra da obra ou adicione os materiais usados.' : 'Lance os pedidos de compra da obra ou adicione os materiais usados.'
      }, mudou));
      if (prop && prop.infraModo !== 'lista' && App.Calc.infraValor(prop) > 0) {
        c.appendChild(h('p.ajuda-sec', 'Orçado na proposta (valor informado da infraestrutura CA): ' + U.brl(App.Calc.infraValor(prop)) + '.'));
      }
    });

    /** Lança os itens de um pedido de compra (os desta obra primeiro) como materiais usados. */
    function lancarPedido() {
      const compras = S.list('compras').filter(function (x) { return x.situacao !== 'cancelado' && (x.itens || []).length; }).sort(function (a, b) {
        return ((b.instalacaoId === inst.id) - (a.instalacaoId === inst.id)) || String(b.data).localeCompare(String(a.data));
      });
      if (!compras.length) { UI.toast('Nenhum pedido de compra com itens. Cadastre em Execução › Pedidos de compra.', 'erro'); return; }
      const est = { compra: compras[0].id };
      const corpo = h('div',
        h('p.ajuda-sec', 'Os itens do pedido entram como usados nesta obra, com o custo de aquisição (desconto e frete rateados). Itens iguais aos já lançados somam à quantidade.'),
        UI.campo({ k: 'compra', label: 'Pedido de compra', type: 'select', options: compras.map(function (x) {
          const t = App.Compra.totais(x);
          return { v: x.id, t: x.numero + ' — ' + ((x.fornecedor && x.fornecedor.nome) || 'fornecedor') + ' · ' + x.itens.length + ' itens · ' + U.brl(t.total) +
            (x.instalacaoId === inst.id ? ' (desta obra)' : '') + ((inst.comprasLancadas || []).indexOf(x.id) >= 0 ? ' — já lançado' : '') };
        }) }, est));
      UI.modal({
        titulo: 'Lançar pedido de compra', corpo: corpo, acoes: [
          { label: 'Cancelar' },
          {
            label: 'Lançar itens', primario: true, onClick: async function () {
              const cp = S.get('compras', est.compra);
              if (!cp) return;
              if ((inst.comprasLancadas || []).indexOf(cp.id) >= 0 && !(await UI.confirmar('O pedido ' + cp.numero + ' já foi lançado nesta obra. Lançar de novo (as quantidades somam)?', 'Lançar de novo'))) return;
              const n = App.Materiais.lancarCompra(inst, cp);
              I.registrar(inst, 'Pedido de compra ' + cp.numero + ' lançado nos materiais consumidos (' + n + ' itens).', 'sistema');
              if (!cp.instalacaoId && inst.id) { cp.instalacaoId = inst.id; S.save('compras', cp); }
              mudou(); desenhar('materiais'); desenhar('historico');
              if (inst.id) salvar(false);
              UI.toast(n + ' item(ns) do pedido ' + cp.numero + ' lançado(s) nos materiais consumidos.', 'ok');
            }
          }
        ]
      });
    }

    /* ---------- checklist da instalação (três grupos) */
    secao('checklist', 'Checklist da instalação', function (c) {
      c.appendChild(h('p.ajuda-sec', 'Itens padrão em Configurações › Textos padrão › Checklist da instalação. Use a observação para anotar medições (ex.: Voc da string 1 = 412 V).'));
      inst.checklistInstalacao.forEach(function (g) {
        const feitos = g.itens.filter(function (x) { return x.ok; }).length;
        const completo = g.itens.length && feitos === g.itens.length;
        const card = h('div.checklist-grupo' + (g.naoSeAplica ? '.na' : (completo ? '.completo' : '')));
        card.appendChild(h('div.checklist-grupo-topo', h('h3', g.titulo),
          g.naoSeAplica ? UI.badge('Não se aplica', 'cinza') : UI.badge(feitos + '/' + g.itens.length, completo ? 'ok' : 'cinza'),
          UI.campo({ k: 'naoSeAplica', label: 'Não se aplica nesta obra', type: 'checkbox' }, g, function () { mudou(); desenhar('checklist'); })));
        if (!g.naoSeAplica) {
          g.itens.forEach(function (it, j) {
            const cb = h('input', { type: 'checkbox', onchange: function () { I.marcarItem(inst, g, it, cb.checked); mudou(); desenhar('checklist'); desenhar('historico'); } });
            cb.checked = !!it.ok;
            card.appendChild(h('div.check-linha' + (it.ok ? '.ok' : ''),
              h('label', cb, h('span', it.texto)),
              h('input.check-obs', { type: 'text', value: it.obs || '', placeholder: 'medição / observação', 'aria-label': 'Observação do item', oninput: function (ev) { it.obs = ev.target.value; mudou(); } }),
              h('button.btn-icone.perigo', { type: 'button', title: 'Remover item', 'aria-label': 'Remover item', onclick: function () { g.itens.splice(j, 1); mudou(); desenhar('checklist'); } }, '×')));
          });
          const novo = h('input', { type: 'text', placeholder: 'Novo item de ' + g.titulo.toLowerCase(), onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); add(); } } });
          const add = function () { const tx = novo.value.trim(); if (!tx) return; g.itens.push({ texto: tx, ok: false, obs: '' }); mudou(); desenhar('checklist'); };
          card.appendChild(h('div.checklist-novo', novo, h('button.btn.pequeno', { type: 'button', onclick: add }, '+ Item')));
        }
        c.appendChild(card);
      });
    });

    /* ---------- dados da obra */
    secao('dados', 'Dados da obra', function (c) {
      c.appendChild(UI.grade([
        { secao: 'Concessionária e documentos' },
        { k: 'uc', label: 'Unidade consumidora (UC)' },
        { k: 'art', label: 'Nº da ART' },
        { k: 'protocolo', label: 'Nº do protocolo de homologação' },
        { k: 'medidor', label: 'Nº do medidor bidirecional' },
        { k: 'ligacao', label: 'Data da ligação (início da geração)', type: 'date' },
        { secao: 'Sistema' },
        { k: 'tipoSistema', label: 'Tipo de sistema', type: 'select', options: App.DEFAULTS.TIPOS_PROJETO.map(function (o) { return { v: o.id, t: o.label }; }) },
        { k: 'segmento', label: 'Segmento', type: 'select', options: App.DEFAULTS.SEGMENTOS.map(function (o) { return { v: o.id, t: o.label }; }) },
        { k: 'kwp', label: 'Potência FV', type: 'number', suffix: 'kWp' },
        { k: 'kwh', label: 'Armazenamento', type: 'number', suffix: 'kWh' },
        { k: 'valor', label: 'Valor da obra', type: 'money' },
        { k: 'equipamentos.armazenamento', label: 'Baterias / BESS', cls: 'span2' },
        { k: 'equipamentos.estrutura', label: 'Estrutura / telhado', cls: 'span2' }
      ], inst, mudou, 2));
    });

    /* ---------- termo de entrega e assinaturas */
    secao('assinaturas', 'Termo de entrega e assinaturas', function (c) {
      const termo = App.Documento.nos.substituir(ctx.textos.termoInstalacao || '', { empresa: ctx.empresa.razao, empresaCurta: ctx.empresa.nomeCurto || ctx.empresa.razao, cliente: inst.clienteNome || 'o cliente' });
      if (termo) c.appendChild(h('div.nota.aviso', termo));
      const salvarAss = function () { mudou(); if (inst.id) salvar(false); };
      c.appendChild(h('div.assinaturas-grade',
        App.Assinatura.campo('Assinatura do cliente', inst.assinaturas.cliente, { nomePadrao: function () { return inst.clienteNome; }, declaracao: termo }, salvarAss),
        App.Assinatura.campo('Assinatura do responsável técnico', inst.assinaturas.tecnico, { nomePadrao: function () { return inst.responsavel; } }, salvarAss)));
      c.appendChild(h('p.ajuda-sec', 'Na entrega da obra, o cliente assina com o dedo no celular ou tablet. As assinaturas saem no relatório de instalação em PDF (botão no resumo); sem assinatura, o PDF traz a linha para assinar à mão.'));
    });

    /* ---------- ordens de serviço */
    secao('ordens', 'Ordens de serviço', function (c) {
      if (!inst.id) { c.appendChild(h('p.ajuda-sec', 'Salve a instalação para abrir ordens de serviço ligadas a ela.')); return; }
      const lista = S.list('ordens').filter(function (o) { return o.instalacaoId === inst.id; })
        .sort(function (a, b) { return String(b.numero).localeCompare(String(a.numero)); });
      c.appendChild(h('div.barra-itens', h('a.btn.pequeno.primario', { href: '#/ordem/nova?instalacao=' + inst.id }, '+ Nova ordem de serviço'),
        h('span.ajuda-sec', 'Manutenção, limpeza, visita técnica, garantia e outras demandas desta instalação.')));
      if (!lista.length) { c.appendChild(h('p.ajuda-sec', 'Nenhuma ordem de serviço para esta instalação.')); return; }
      c.appendChild(App.tabelaOrdens(lista, null, true));
    });

    /* ---------- histórico */
    secao('historico', 'Histórico', function (c) {
      const nota = h('input', { type: 'text', placeholder: 'Ex.: Kit entregue no local; cliente informado da vistoria.', onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); registrar(); } } });
      const registrar = function () {
        const tx = nota.value.trim();
        if (!tx) return;
        I.registrar(inst, tx, 'nota');
        mudou(); desenhar('historico');
      };
      c.appendChild(h('div.checklist-novo', nota, h('button.btn.pequeno', { type: 'button', onclick: registrar }, 'Registrar')));
      if (!inst.historico.length) { c.appendChild(h('p.ajuda-sec', 'As mudanças de etapa e as anotações aparecem aqui, da mais recente para a mais antiga.')); return; }
      const icone = { etapa: '🔧', nota: '📝', sistema: 'ℹ️' };
      c.appendChild(h('ul.historico', inst.historico.map(function (ev) {
        const d = new Date(ev.data);
        const quando = isNaN(d) ? '' : U.dataBR(ev.data.slice(0, 10)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return h('li', h('time', quando), h('span', (icone[ev.tipo] || '•') + ' ' + ev.texto));
      })));
    });

    /* ---------- resumo */
    function desenharResumo() {
      const hoje = U.todayISO();
      const pr = I.progresso(inst);
      const atual = I.etapaAtual(inst);
      const atraso = I.atrasadas(inst, hoje);
      const st = I.status(inst);
      resumo.innerHTML = '';
      const kpi = function (rot, val, cls) { return h('div.kpi' + (cls ? '.' + cls : ''), h('span', rot), h('strong', val)); };
      resumo.appendChild(h('div.resumo-topo', statusBadge(inst), sujo ? UI.badge('Não salvo', 'ambar') : null));
      resumo.appendChild(h('div.progresso-resumo', h('div.progresso.grande', h('span', { style: { width: Math.round(pr.pct * 100) + '%' } })),
        h('strong', Math.round(pr.pct * 100) + '%'), h('small', pr.feitas + ' de ' + pr.total + ' etapas concluídas')));
      resumo.appendChild(h('div.kpis',
        kpi('Etapa atual', st === 'concluida' ? 'Todas concluídas' : (atual ? (inst.etapas.indexOf(atual) + 1) + '. ' + atual.titulo : '—')),
        kpi(st === 'concluida' ? 'Concluída em' : 'Previsão de conclusão', U.dataBR(I.previsaoConclusao(inst)) || '—'),
        kpi('Sistema', [inst.kwp > 0 ? U.kwp(inst.kwp) + ' kWp' : '', inst.kwh > 0 ? U.fmtSmart(inst.kwh, 2) + ' kWh' : ''].filter(Boolean).join(' + ') || '—'),
        App.Acesso.veValores() ? kpi('Valor', inst.valor ? U.brl(inst.valor) : '—') : null,
        (function () { const pc = I.progressoChecklist(inst); return kpi('Checklist', pc.total ? pc.feitos + ' de ' + pc.total + ' itens' : '—'); })(),
        (function () {
          const rm = App.Materiais.resumo(inst, inst.propostaId ? S.get('propostas', inst.propostaId) : null);
          if (!rm.itens && !rm.orcado) return kpi('Materiais CA', '—');
          const el = kpi('Materiais CA', rm.usado > 0 ? U.brl(rm.usado) + ' usado' : 'nada lançado');
          if (rm.base > 0) el.appendChild(h('small', 'previsto ' + U.brl(rm.base) + (rm.usado > 0 ? ' · ' + (rm.diferenca > 0 ? '+' : '') + U.brl(rm.diferenca) : '')));
          return el;
        })(),
        kpi('Ordens de serviço', inst.id ? (function () {
          const os = S.list('ordens').filter(function (o) { return o.instalacaoId === inst.id; });
          const ab = os.filter(App.Ordem.aberta).length;
          return os.length ? ab + ' em aberto · ' + os.length + ' no total' : 'nenhuma';
        })() : '—')));
      if (atraso.length && st !== 'pausada') {
        resumo.appendChild(h('ul.alertas', atraso.map(function (e) {
          return h('li.erro', 'Atrasada: ' + (inst.etapas.indexOf(e) + 1) + '. ' + e.titulo + ' (previsto para ' + U.dataBR(e.previsto) + ')');
        })));
      }
      const links = [];
      if (inst.propostaId && S.get('propostas', inst.propostaId) && App.Acesso.podeLer('propostas')) {
        links.push(h('a.btn', { href: '#/proposta/' + inst.propostaId }, '📄 Abrir proposta'));
        links.push(h('a.btn', { href: '#/contrato/novo?proposta=' + inst.propostaId }, '✍ Gerar contrato'));
      }
      if (st === 'concluida' && inst.id && App.Acesso.podeGravar('projetos')) {
        const proj = S.list('projetos').find(function (x) { return x.instalacaoId === inst.id; });
        links.push(proj ? h('a.btn', { href: '#/projetos' }, '📸 Ver em Projetos realizados') : h('button.btn', {
          type: 'button', onclick: function () {
            const novo = S.save('projetos', I.paraProjeto(inst));
            I.registrar(inst, 'Cadastrada em Projetos realizados (faltam as 2 fotos).', 'sistema');
            salvar(false);
            desenhar('historico');
            UI.toast('Projeto "' + novo.titulo + '" criado em Projetos realizados. Adicione as 2 fotos para ele entrar nas propostas.', 'ok');
          }
        }, '📸 Cadastrar em Projetos realizados'));
      }
      const btnRel = h('button.btn', {
        type: 'button', onclick: async function () {
          btnRel.disabled = true; const rot = btnRel.textContent; btnRel.textContent = 'Gerando…';
          try { const g = await App.Relatorios.pdfInstalacao(inst, ctx); U.download(g.blob, g.nome); UI.toast('PDF gerado: ' + g.nome, 'ok'); }
          catch (e) { console.error(e); UI.toast('Falha ao gerar o PDF: ' + e.message, 'erro'); }
          finally { btnRel.disabled = false; btnRel.textContent = rot; }
        }
      }, '⬇ Relatório de instalação (PDF)');
      links.unshift(btnRel);
      links.unshift(h('button.btn', { type: 'button', onclick: function () {
        App.Visualizar.abrir(function () { return App.Relatorios.pdfInstalacao(inst, ctx); }, { titulo: 'Relatório de instalação — ' + (inst.titulo || inst.clienteNome || '') });
      } }, '👁 Visualizar relatório'));
      if (links.length) resumo.appendChild(h('div.resumo-links', links));
      resumo.appendChild(h('button.btn.primario', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'));
    }

    function salvar(avisar) {
      if (!String(inst.titulo || '').trim() && !inst.clienteNome) { UI.toast('Informe o nome da obra ou o cliente.', 'erro'); secoes.obra.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      if (!String(inst.titulo || '').trim()) inst.titulo = inst.clienteNome;
      const novo = !inst.id;
      S.save('instalacoes', inst);
      sujo = false;
      if (novo) { id = inst.id; UI.substituirHash('#/instalacao/' + inst.id); desenhar('ordens'); }
      publicarPagina();
      atualizarTopo();
      desenharResumo();
      if (avisar) UI.toast('Instalação salva.', 'ok');
      return true;
    }

    Object.keys(secoes).forEach(desenhar);
    desenharResumo();
  }
})(window.App);
