/* Formulário da proposta: dados, dimensionamento On-Grid/Híbrido ao vivo, materiais, preço, pagamento e geração do .docx. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS, C = App.Calc;
  const h = U.h;

  UI.rota('/proposta/nova', function (cont, params, qs) { formulario(cont, null, qs); });
  UI.rota('/proposta/:id', function (cont, params, qs) { formulario(cont, params.id, qs); });

  function normalizar(p, ctx) {
    const base = C.novaProposta(ctx);
    Object.keys(base).forEach(function (k) {
      if (p[k] === undefined && k !== '_seq' && k !== 'numero') p[k] = U.clone(base[k]);
    });
    p.premissas = Object.assign(U.clone(ctx.premissas), p.premissas || {});
    p.premissas.hibrido = Object.assign(U.clone(ctx.premissas.hibrido), (p.premissas && p.premissas.hibrido) || {});
    p.premissas.armazenamento = Object.assign(U.clone(ctx.premissas.armazenamento || D.premissas.armazenamento), (p.premissas && p.premissas.armazenamento) || {});
    if (!Array.isArray(p.consumoMensal) || p.consumoMensal.length !== 12) p.consumoMensal = Array(12).fill('');
    if (!Array.isArray(p.cargas)) p.cargas = [];
    if (!Array.isArray(p.itens)) p.itens = [];
    return p;
  }

  function assinaturaItens(itens) {
    return JSON.stringify((itens || []).map(function (i) { return [i.equipamentoId, i.descricao, i.qtd, i.unidade, i.precoUnit]; }));
  }

  function opcoesEquip(ctx, tipo, atual) {
    return ctx.equipamentos.filter(function (e) { return e.tipo === tipo && (e.ativo !== false || e.id === atual); })
      .sort(function (a, b) { return U.numOr(a.potencia || a.energia, 0) - U.numOr(b.potencia || b.energia, 0); })
      .map(function (e) { return { v: e.id, t: C.nomeEquip(e) + (U.num(e.preco) > 0 ? ' — ' + U.brl(e.preco) : '') }; });
  }

  function formulario(cont, id, qs) {
    let ctx = C.contexto();
    let p;
    if (id) {
      const salvo = S.get('propostas', id);
      if (!salvo) { UI.toast('Proposta não encontrada.', 'erro'); UI.ir('#/propostas'); return; }
      p = normalizar(U.clone(salvo), ctx);
    } else {
      p = C.novaProposta(ctx);
      p.itensSync = true;
      if (qs && qs.get('cliente')) p.clienteId = qs.get('cliente');
      if (qs && (qs.get('tipo') === 'hibrido' || qs.get('tipo') === 'bess')) p.tipoSistema = qs.get('tipo');
      if (p.tipoSistema === 'hibrido') p.cargas = U.clone(D.cargasExemplo);
    }
    const ehArm = function () { return p.tipoSistema === 'hibrido' || p.tipoSistema === 'bess'; };
    const grupoA = function () { return App.Energia.modalidade(p.modalidade).grupo === 'A'; };
    const garantirCenarios = function () { p.cenarios = C.cenariosConfig(p); return p.cenarios; };
    let r = null;
    let sujo = !id;
    let inicial = null; // estado de uma proposta nova ainda não tocada
    const alterada = function () { return sujo && (p.id || inicial === null || JSON.stringify(p) !== inicial); };
    UI.guarda = function () { return !alterada() || confirm('A proposta tem alterações não salvas. Deseja sair mesmo assim?'); };
    window.onbeforeunload = function (e) { if (alterada() && document.body.contains(cont.firstChild)) { e.preventDefault(); e.returnValue = ''; } };

    const secoes = {};
    const infos = {};

    /* ---------------- cabeçalho */
    const subtitulo = h('p.sub');
    const btnSalvar = h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar');
    const btnPdf = h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, '⬇ Proposta em PDF');
    const btnDocx = h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, '⬇ Word (.docx)');
    const titulo = h('h1', id ? 'Proposta ' + p.numero : 'Nova proposta');
    cont.appendChild(h('div.pagina-topo', h('div', titulo, subtitulo), h('div.acoes', btnSalvar, btnDocx, btnPdf)));

    const nav = h('nav.passos');
    const colForm = h('div.form-col');
    const resumo = h('aside.resumo-col');
    cont.appendChild(h('div.form-layout', h('div', nav, colForm), resumo));

    function secao(chave, tituloSec, construir, visivel) {
      const corpo = h('div.secao-corpo');
      const el = h('section.card.secao#sec-' + chave, h('h2', tituloSec), corpo);
      secoes[chave] = { el: el, corpo: corpo, construir: construir, visivel: visivel };
      colForm.appendChild(el);
      nav.appendChild(h('a', { href: 'javascript:void 0', 'data-sec': chave, onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, tituloSec));
    }

    function desenhar(chave) {
      const s = secoes[chave];
      const vis = !s.visivel || s.visivel();
      s.el.hidden = !vis;
      const link = nav.querySelector('[data-sec="' + chave + '"]');
      if (link) link.hidden = !vis;
      s.corpo.innerHTML = '';
      if (vis) s.construir(s.corpo);
    }

    function desenharTudo() { Object.keys(secoes).forEach(desenhar); }

    const atualizarDebounce = U.debounce(function () { atualizar(); }, 150);

    function mudou(k) {
      sujo = true;
      const reDesenho = {
        tipoSistema: ['sistema', 'hibrido', 'cenarios', 'materiais', 'ident'], localidadeId: ['local'], concessionariaId: ['local'], classe: ['local'],
        modalidade: ['local', 'consumo', 'cenarios'], bessComFV: ['sistema', 'cenarios', 'materiais'],
        consumoModo: ['consumo'], clienteId: ['cliente'], precoModo: ['materiais'], kitManual: ['materiais'], data: ['ident'],
        'cenarios.ativo': ['cenarios']
      };
      if (k === 'localidadeId') {
        const loc = ctx.localidades.find(function (l) { return l.id === p.localidadeId; });
        if (loc && loc.concessionariaId) p.concessionariaId = loc.concessionariaId;
      }
      if (k === 'tipoSistema') {
        p.inversorId = null;
        p.nInversores = '';
        if (p.tipoSistema === 'hibrido' && !p.cargas.length) p.cargas = U.clone(D.cargasExemplo);
        if (p.cenarios) garantirCenarios();
      }
      if (k === 'modalidade') {
        if (grupoA()) {
          p.ligacao = 'tri';
          if (p.cenarios && p.cenarios.picos) p.cenarios.picos.ativo = true;
        }
      }
      if (/^cenarios\.\w+\.ativo$/.test(k)) k = 'cenarios.ativo';
      if (k === 'data' && !p.id) {
        const n = S.proximoNumero(p.data);
        p.numero = n.numero;
        p._seq = n;
      }
      if (k === 'clienteId') {
        const cli = ctx.clientes.find(function (c) { return c.id === p.clienteId; });
        if (cli && cli.cidade) {
          const loc = ctx.localidades.find(function (l) { return U.slug(l.cidade) === U.slug(cli.cidade) && (!cli.uf || l.uf === cli.uf); });
          if (loc && loc.id !== p.localidadeId) { p.localidadeId = loc.id; if (loc.concessionariaId) p.concessionariaId = loc.concessionariaId; desenhar('local'); }
        }
      }
      (reDesenho[k] || []).forEach(desenhar);
      if (reDesenho[k]) atualizar(); else atualizarDebounce();
    }

    /* ---------------- seção: identificação */
    secao('ident', 'Identificação', function (c) {
      const tipos = h('div.opcoes-cartao.tres',
        [['ongrid', 'On-Grid', 'Conectado à rede, sem baterias. Compensação de energia (Lei 14.300).'],
          ['hibrido', 'Híbrido', 'FV + inversor híbrido e baterias: backup e uso estratégico da energia.'],
          ['bess', 'BESS', 'Armazenamento em gabinetes (com ou sem FV): ponta, picos de demanda e backup.']].map(function (o) {
          return h('button.opcao' + (p.tipoSistema === o[0] ? '.ativa' : ''), {
            type: 'button', onclick: function () { if (p.tipoSistema !== o[0]) { p.tipoSistema = o[0]; mudou('tipoSistema'); } }
          }, h('strong', o[1]), h('small', o[2]));
        }));
      c.appendChild(h('div.campo', h('label', 'Tipo de sistema'), tipos));
      c.appendChild(UI.grade([
        { k: 'numero', label: 'Nº da proposta', readonly: true, help: p.id ? 'Gerado automaticamente.' : 'Automático — confirmado ao salvar.' },
        { k: 'data', label: 'Data de emissão', type: 'date' },
        { k: 'validadeDias', label: 'Validade', type: 'int', suffix: 'dias' },
        { k: 'status', label: 'Situação', type: 'select', options: D.STATUS.map(function (s) { return { v: s.id, t: s.label }; }) }
      ], p, mudou, 4));
    });

    /* ---------------- seção: cliente */
    secao('cliente', 'Cliente', function (c) {
      const clientes = ctx.clientes.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
      const novo = h('button.btn.pequeno', {
        type: 'button', onclick: function () {
          const cli = { nome: '', documento: '', telefone: '', email: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '', observacoes: '' };
          const corpo = h('div');
          const red = function () { corpo.innerHTML = ''; corpo.appendChild(UI.grade(App.camposCliente(cli, red), cli, null, 2)); };
          red();
          UI.modal({
            titulo: 'Novo cliente', corpo: corpo, largo: true, acoes: [{ label: 'Cancelar' }, {
              label: 'Salvar cliente', primario: true, onClick: function () {
                if (!String(cli.nome || '').trim()) { UI.toast('Informe o nome do cliente.', 'erro'); return false; }
                S.save('clientes', cli);
                ctx = C.contexto();
                p.clienteId = cli.id;
                mudou('clienteId');
                UI.toast('Cliente cadastrado.', 'ok');
              }
            }]
          });
        }
      }, '+ Novo cliente');
      c.appendChild(h('div.linha-campo', UI.campo({
        k: 'clienteId', label: 'Cliente', type: 'select', required: true, cls: 'cresce',
        options: [{ v: '', t: '— selecione o cliente —' }].concat(clientes.map(function (x) { return { v: x.id, t: x.nome + (x.cidade ? ' — ' + x.cidade + (x.uf ? '/' + x.uf : '') : '') }; }))
      }, p, mudou), novo));
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      if (cli) {
        const end = [cli.endereco, cli.numero, cli.bairro].filter(Boolean).join(', ');
        c.appendChild(h('div.ficha', [
          ['CPF/CNPJ', cli.documento], ['Telefone', cli.telefone], ['E-mail', cli.email],
          ['Endereço', end], ['Cidade/UF', [cli.cidade, cli.uf].filter(Boolean).join('/')]
        ].filter(function (x) { return x[1]; }).map(function (x) { return h('div', h('span', x[0]), h('strong', x[1])); })));
        c.appendChild(UI.grade([{ k: 'enderecoInstalacao', label: 'Endereço de instalação (se diferente do cadastro)', placeholder: end || 'Rua, número, bairro', cls: 'span2' }], p, mudou));
      }
    });

    /* ---------------- seção: local e tarifa */
    secao('local', 'Local, concessionária e tarifa', function (c) {
      const loc = ctx.localidades.find(function (l) { return l.id === p.localidadeId; });
      const conc = ctx.concessionarias.find(function (x) { return x.id === p.concessionariaId; });
      const classe = D.CLASSES.find(function (x) { return x.id === p.classe; }) || D.CLASSES[0];
      const mod = App.Energia.modalidade(p.modalidade);
      const ph = function (v) { return v != null && v !== '' ? String(v).replace('.', ',') : ''; };
      const cc = conc || {};
      const br = cc.branca || {}, vd = cc.verde || {}, az = cc.azul || {};
      const tarifaCampo = function (k, label, unid, padrao) {
        return { k: k, label: label, type: 'number', prefix: 'R$', suffix: unid || '/kWh', placeholder: ph(padrao) };
      };
      const tarifas = [];
      if (mod.id === 'conv') {
        tarifas.push(tarifaCampo('tarifa', 'Tarifa com impostos', '/kWh', cc.tarifas ? cc.tarifas[classe.tarifa] : ''));
      } else if (mod.id === 'branca') {
        tarifas.push(tarifaCampo('tarifaPonta', 'Tarifa ponta', '/kWh', br.ponta), tarifaCampo('tarifaIntermediario', 'Tarifa intermediária', '/kWh', br.intermediario),
          tarifaCampo('tarifaForaPonta', 'Tarifa fora de ponta', '/kWh', br.foraPonta));
      } else {
        const src = mod.id === 'verde' ? vd : az;
        tarifas.push(tarifaCampo('tarifaPonta', 'Energia na ponta', '/kWh', src.ponta), tarifaCampo('tarifaForaPonta', 'Energia fora de ponta', '/kWh', src.foraPonta));
        if (mod.id === 'verde') tarifas.push(tarifaCampo('tarifaDemanda', 'Demanda', '/kW', vd.demanda));
        else tarifas.push(tarifaCampo('tarifaDemandaPonta', 'Demanda na ponta', '/kW', az.demandaPonta), tarifaCampo('tarifaDemandaFP', 'Demanda fora de ponta', '/kW', az.demandaForaPonta));
      }
      c.appendChild(UI.grade([
        { k: 'localidadeId', label: 'Cidade de instalação (irradiação)', type: 'select', required: true,
          options: [{ v: '', t: '— selecione —' }].concat(ctx.localidades.map(function (l) { return { v: l.id, t: l.cidade + '/' + l.uf + ' — HSP ' + U.fmtSmart(l.hsp, 2) }; })),
          help: ctx.localidades.length ? null : 'Cadastre localidades em Cadastros › Localidades.' },
        { k: 'concessionariaId', label: 'Concessionária', type: 'select', options: [{ v: '', t: '—' }].concat(ctx.concessionarias.map(function (x) { return { v: x.id, t: x.nome }; })) },
        { k: 'modalidade', label: 'Grupo e modalidade tarifária', type: 'select', options: App.Energia.MODALIDADES.map(function (m) { return { v: m.id, t: 'Grupo ' + m.grupo + ' — ' + m.label }; }) },
        mod.grupo === 'A'
          ? { k: 'subgrupo', label: 'Subgrupo', type: 'select', options: D.SUBGRUPOS_A }
          : { k: 'classe', label: 'Classe de consumo', type: 'select', options: D.CLASSES.map(function (x) { return x.id; }) },
        mod.grupo === 'B' ? { k: 'ligacao', label: 'Tipo de ligação', type: 'select', options: D.LIGACOES.map(function (x) { return { v: x.id, t: x.label }; }) } : null,
        { k: 'tensao', label: 'Tensão de atendimento', type: 'select', options: mod.grupo === 'A' ? ['13,8 kV', '23 kV', '34,5 kV', '69 kV', '220/380 V'] : D.TENSOES },
        mod.grupo === 'B' ? { k: 'ligacaoConfirmar', label: 'Tipo de ligação a confirmar (premissa)', type: 'checkbox' } : null,
        { k: 'telhado', label: 'Tipo de telhado', type: 'select', options: D.TELHADOS },
        { k: 'telhadoDetalhe', label: 'Detalhe da fixação', placeholder: 'Ex.: parafuso estrutural' },
        { secao: 'Valores da fatura (deixe em branco para usar os cadastros)' }
      ].concat(tarifas, [
        { k: 'tusdFioB', label: 'TUSD Fio B', type: 'number', prefix: 'R$', suffix: '/kWh', placeholder: ph(cc.tusdFioB) },
        { k: 'cosip', label: 'COSIP', type: 'money', suffix: '/mês', placeholder: loc && loc.cosip != null ? ph(loc.cosip) : '' },
        { k: 'hsp', label: 'HSP', type: 'number', suffix: 'kWh/m²/dia', placeholder: loc ? ph(loc.hsp) : '' }
      ]), p, mudou, 4));
      if (mod.id !== 'conv' && cc.horarioPonta) c.appendChild(h('p.ajuda-sec', 'Horário de ponta da ' + (cc.nome || 'concessionária') + ': ' + cc.horarioPonta + ' (dias úteis).'));
    });

    /* ---------------- seção: consumo */
    secao('consumo', 'Consumo de energia', function (c) {
      const mod = App.Energia.modalidade(p.modalidade);
      if (mod.id !== 'conv') {
        const kwh = function (k, label) { return { k: k, label: label, type: 'number', suffix: 'kWh/mês', required: true }; };
        const kw = function (k, label, help) { return { k: k, label: label, type: 'number', suffix: 'kW', help: help }; };
        const defs = [kwh('consumoPonta', 'Consumo na ponta (média)')];
        if (mod.id === 'branca') defs.push(kwh('consumoIntermediario', 'Consumo intermediário (média)'));
        defs.push(kwh('consumoForaPonta', 'Consumo fora de ponta (média)'));
        defs.push({ k: 'simultaneidade', label: 'Simultaneidade (autoconsumo direto)', type: 'pct', help: 'Parcela da geração consumida no momento; o restante é injetado na rede.' });
        if (mod.id === 'verde') {
          defs.push({ secao: 'Demanda (kW)' }, kw('demandaContratada', 'Demanda contratada'), kw('demandaMedida', 'Maior demanda medida', 'Em branco = igual à contratada.'));
        } else if (mod.id === 'azul') {
          defs.push({ secao: 'Demanda (kW)' }, kw('demandaContratadaPonta', 'Contratada na ponta'), kw('demandaMedidaPonta', 'Medida na ponta', 'Em branco = contratada.'),
            kw('demandaContratadaFP', 'Contratada fora de ponta'), kw('demandaMedidaFP', 'Medida fora de ponta', 'Em branco = contratada.'));
        }
        c.appendChild(UI.grade(defs, p, mudou, 4));
        infos.consumo = h('div.info');
        c.appendChild(infos.consumo);
        return;
      }
      c.appendChild(UI.grade([
        { k: 'consumoModo', label: 'Forma de informar', type: 'select', options: [{ v: 'media', t: 'Média mensal' }, { v: 'mensal', t: 'Histórico de 12 meses (fatura)' }] },
        p.consumoModo === 'mensal' ? null : { k: 'consumoMedio', label: 'Consumo médio mensal', type: 'number', suffix: 'kWh/mês', required: true },
        { k: 'simultaneidade', label: 'Simultaneidade (autoconsumo direto)', type: 'pct', help: 'Parcela da geração consumida no momento; o restante é injetado na rede.' }
      ], p, mudou, 3));
      if (p.consumoModo === 'mensal') {
        const g = h('div.meses');
        U.MESES.forEach(function (m, i) { g.appendChild(UI.campo({ k: 'consumoMensal.' + i, label: m, type: 'number' }, p, mudou)); });
        c.appendChild(h('div.campo', h('label', 'Consumo por mês (kWh)'), g));
      }
      infos.consumo = h('div.info');
      c.appendChild(infos.consumo);
    });

    /* ---------------- seção: sistema FV */
    secao('sistema', 'Dimensionamento do sistema fotovoltaico', function (c) {
      if (p.tipoSistema === 'bess') {
        c.appendChild(UI.campo({ k: 'bessComFV', label: 'Incluir sistema fotovoltaico junto com o BESS', type: 'checkbox' }, p, mudou));
        if (p.bessComFV === false) {
          c.appendChild(h('p.ajuda-sec', 'Proposta somente de armazenamento: o BESS recarrega pela rede fora da ponta. Marque a opção acima para dimensionar também um gerador FV.'));
          infos.placeModulos = h('div'); infos.placeInv = h('div'); infos.sistema = h('div.info');
          return;
        }
      }
      const tipoInv = p.tipoSistema === 'hibrido' ? 'hibrido' : 'inversor';
      infos.placeModulos = UI.campo({ k: 'nModulos', label: 'Quantidade de módulos', type: 'int', help: 'Em branco = quantidade sugerida.' }, p, mudou);
      infos.placeInv = UI.campo({ k: 'nInversores', label: 'Quantidade de inversores', type: 'int', help: 'Em branco = automático.' }, p, mudou);
      c.appendChild(UI.grade([
        { k: 'moduloId', label: 'Módulo fotovoltaico', type: 'select', required: true, cls: 'span2',
          options: [{ v: '', t: '— selecione —' }].concat(opcoesEquip(ctx, 'modulo', p.moduloId)) },
        { el: infos.placeModulos },
        { k: 'inversorId', label: tipoInv === 'hibrido' ? 'Inversor híbrido' : 'Inversor', type: 'select', cls: 'span2',
          options: function () { return [{ v: '', t: 'Automático (melhor FDI)' }].concat(opcoesEquip(ctx, tipoInv, p.inversorId)); } },
        { el: infos.placeInv }
      ], p, mudou, 3));
      infos.sistema = h('div.info');
      c.appendChild(infos.sistema);
    });

    /* ---------------- seção: armazenamento */
    secao('hibrido', 'Armazenamento — equipamento e cargas críticas', function (c) {
      const bess = p.tipoSistema === 'bess';
      c.appendChild(UI.grade([
        bess
          ? { k: 'bessId', label: 'Equipamento BESS (gabinete)', type: 'select', cls: 'span2',
            options: [{ v: '', t: 'Primeiro BESS ativo do catálogo' }].concat(opcoesEquip(ctx, 'bess', p.bessId)) }
          : { k: 'bateriaId', label: 'Bateria', type: 'select', cls: 'span2',
            options: [{ v: '', t: 'Primeira bateria ativa do catálogo' }].concat(opcoesEquip(ctx, 'bateria', p.bateriaId)) },
        { k: 'dod', label: 'DoD (profundidade de descarga)', type: 'number', suffix: '%', help: 'Em branco = DoD do equipamento.' },
        { k: 'instalArmValor', label: 'Instalação e integração do armazenamento', type: 'money',
          help: 'Em branco = ' + U.fmtSmart((p.premissas.armazenamento || D.premissas.armazenamento).instalPct * 100, 1) + '% do valor do equipamento.' }
      ], p, mudou, 4));
      c.appendChild(h('h4.secao-form', 'Cargas críticas (usadas no cenário de backup)'));
      c.appendChild(h('p.ajuda-sec', 'Liste os equipamentos que devem funcionar durante a falta de energia e por quantas horas cada um será usado nesse período.'));
      const ed = UI.editorLinhas(p.cargas, [
        { k: 'descricao', label: 'Carga crítica', placeholder: 'Ex.: Geladeira' },
        { k: 'qtd', label: 'Qtd.', type: 'number', w: '80px' },
        { k: 'potencia', label: 'Potência (W)', type: 'number', w: '120px' },
        { k: 'horas', label: 'Uso no backup (h)', type: 'number', w: '140px' }
      ], function () { mudou('cargas'); }, '+ Adicionar carga', function () { return { descricao: '', qtd: 1, potencia: '', horas: '' }; });
      c.appendChild(ed);
      c.appendChild(h('button.btn.pequeno.link', {
        type: 'button', onclick: function () { p.cargas.splice(0, p.cargas.length); D.cargasExemplo.forEach(function (x) { p.cargas.push(U.clone(x)); }); ed.redesenhar(); mudou('cargas'); }
      }, 'Carregar cargas de exemplo'));
      c.appendChild(UI.grade([{ k: 'autonomiaHoras', label: 'Autonomia desejada', type: 'number', suffix: 'h' }], p, mudou, 4));
      infos.hibrido = h('div.info');
      c.appendChild(infos.hibrido);
    }, ehArm);

    /* ---------------- seção: cenários */
    secao('cenarios', 'Cenários e recomendação', function (c) {
      const cfg = garantirCenarios();
      const mod = App.Energia.modalidade(p.modalidade);
      c.appendChild(h('p.ajuda-sec', 'Compare até 4 formas de usar o sistema na mesma proposta. A plataforma calcula investimento, economia, payback, VPL e TIR de cada uma e indica a alternativa que faz mais sentido para o cliente.'));
      c.appendChild(UI.grade([
        { k: 'objetivo', label: 'Objetivo principal do cliente', type: 'select', cls: 'span2', options: D.OBJETIVOS.map(function (o) { return { v: o.id, t: o.label }; }) },
        { k: 'cenarioEscolhido', label: 'Cenário detalhado na proposta', type: 'select', cls: 'span2',
          options: [{ v: 'auto', t: 'Automático — o recomendado' }].concat(App.Energia.CENARIOS.map(function (x) { return { v: x.id, t: x.nome }; })) }
      ], p, mudou, 4));
      const grade = h('div.cenarios-grade');
      App.Energia.CENARIOS.forEach(function (def) {
        const cc = cfg[def.id];
        const base = 'cenarios.' + def.id + '.';
        const campos = [{ k: base + 'ativo', label: 'Avaliar este cenário', type: 'checkbox' }];
        if (def.armazenamento) {
          if (p.tipoSistema !== 'bess' || p.bessComFV !== false) campos.push({ k: base + 'incluirFV', label: 'Incluir o sistema FV', type: 'checkbox' });
          campos.push({ k: base + 'n', label: p.tipoSistema === 'bess' ? 'Gabinetes BESS' : 'Baterias', type: 'int', help: 'Em branco = dimensionamento automático.' });
        }
        if (def.id === 'backup') {
          campos.push({ k: base + 'horasFaltaAno', label: 'Horas sem energia por ano', type: 'number', suffix: 'h/ano', help: 'Opcional — para valorar o backup.' },
            { k: base + 'custoHoraFalta', label: 'Prejuízo por hora sem energia', type: 'money', suffix: '/h' });
        }
        if (def.id === 'picos') {
          campos.push({ k: base + 'reducaoKW', label: 'Redução de demanda', type: 'number', suffix: 'kW',
            help: 'Em branco = ' + U.fmtSmart((p.premissas.armazenamento || D.premissas.armazenamento).reducaoDemandaPct * 100, 1) + '% da demanda medida.' },
          { k: base + 'duracaoH', label: 'Duração do pico', type: 'number', suffix: 'h', placeholder: String((p.premissas.armazenamento || D.premissas.armazenamento).duracaoPonta) });
          if (mod.id === 'azul') campos.push({ k: base + 'posto', label: 'Posto do pico', type: 'select', options: [{ v: '', t: 'Ponta' }, { v: 'foraPonta', t: 'Fora de ponta' }] });
          if (mod.id === 'verde') campos.push({ k: base + 'posto', label: 'Horário do pico', type: 'select', options: [{ v: '', t: 'Fora de ponta (comercial)' }, { v: 'ponta', t: 'Na ponta' }] });
          campos.push({ k: base + 'readequar', label: 'Readequar a demanda contratada', type: 'checkbox' });
        }
        const card = h('div.cenario-card' + (cc.ativo ? '' : '.inativo'), { 'data-cenario': def.id },
          h('div.cenario-topo', h('strong', def.nome), h('span.cenario-selo')),
          h('p.ajuda-sec', def.descricao),
          UI.grade(campos, p, mudou, 1));
        grade.appendChild(card);
      });
      c.appendChild(grade);
      infos.cenarios = h('div.comparativo');
      c.appendChild(infos.cenarios);
    }, ehArm);

    /* ---------------- seção: materiais e preço */
    let corpoItens = null;
    secao('materiais', 'Materiais e composição do preço', function (c) {
      c.appendChild(UI.campo({
        k: 'itensSync', label: 'Atualizar a lista automaticamente conforme o dimensionamento (mantém preços editados)', type: 'checkbox',
        onChange: function (v) { if (v) atualizar(true); }
      }, p, function () { sujo = true; }));
      corpoItens = h('div');
      c.appendChild(corpoItens);
      desenharItens();

      c.appendChild(h('h4.secao-form', 'Composição do preço'));
      if (p.tipoSistema === 'bess' && p.bessComFV === false) {
        c.appendChild(h('p.ajuda-sec', 'Sem sistema FV: o investimento de cada cenário é o equipamento de armazenamento + a instalação (seção Armazenamento).'));
        infos.preco = h('div.info');
        c.appendChild(infos.preco);
        return;
      }
      if (ehArm()) c.appendChild(h('p.ajuda-sec', 'Informe aqui o preço do sistema fotovoltaico. O armazenamento (equipamento + instalação) é somado automaticamente em cada cenário.'));
      const modos = h('div.opcoes-cartao.compacto', [
        ['composto', 'Valor total', 'Informe o preço final; a mão de obra é calculada (total − kit − infraestrutura).'],
        ['separado', 'Itens separados', 'Informe a mão de obra; o total é a soma de kit + infraestrutura + mão de obra.']
      ].map(function (o) {
        return h('button.opcao' + (p.precoModo === o[0] ? '.ativa' : ''), {
          type: 'button', onclick: function () { if (p.precoModo !== o[0]) { p.precoModo = o[0]; mudou('precoModo'); } }
        }, h('strong', o[1]), h('small', o[2]));
      }));
      c.appendChild(modos);
      c.appendChild(UI.grade([
        { k: 'kitManual', label: 'Informar valor do kit manualmente (cotação do distribuidor)', type: 'checkbox', cls: 'span2' },
        p.kitManual ? { k: 'kitValor', label: 'Valor do kit fotovoltaico', type: 'money' } : null,
        { k: 'infraValor', label: 'Infraestrutura elétrica CA', type: 'money', help: 'DPS, disjuntores, quadro, aterramento.' },
        p.precoModo === 'separado'
          ? { k: 'maoObraValor', label: 'Mão de obra + projeto + homologação', type: 'money', required: true }
          : { k: 'valorTotal', label: ehArm() ? 'Valor do sistema FV (sem armazenamento)' : 'Valor total da proposta', type: 'money', required: true },
        { k: 'infraDescricao', label: 'Descrição da infraestrutura CA (lista de equipamentos)', cls: 'span2' }
      ], p, mudou, 3));
      infos.preco = h('div.info');
      c.appendChild(infos.preco);
    });

    function desenharItens() {
      if (!corpoItens) return;
      corpoItens.innerHTML = '';
      const tb = h('tbody');
      const subtotais = [];
      p.itens.forEach(function (it, i) {
        const sub = h('td.num');
        subtotais.push({ el: sub, it: it });
        const editar = function (campo) {
          return function () {
            sujo = true;
            if (p.itensSync && !it.manual && campo !== 'precoUnit' && campo !== 'garantia') {
              p.itensSync = false;
              desenhar('materiais');
              UI.toast('Lista passou a ser manual (atualização automática desativada).');
            }
            sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0));
            atualizarDebounce();
          };
        };
        tb.appendChild(h('tr',
          h('td.num', String(i + 1)),
          h('td', UI.campo({ k: 'descricao' }, it, editar('descricao'))),
          h('td', { style: { width: '70px' } }, UI.campo({ k: 'qtd', type: 'number' }, it, editar('qtd'))),
          h('td', { style: { width: '72px' } }, UI.campo({ k: 'unidade', type: 'select', options: ['un', 'm', 'pt', 'cj', 'kg'] }, it, editar('unidade'))),
          h('td', { style: { width: '120px' } }, UI.campo({ k: 'precoUnit', type: 'money' }, it, editar('precoUnit'))),
          sub,
          h('td', { style: { width: '140px' } }, UI.campo({ k: 'garantia' }, it, editar('garantia'))),
          h('td.acoes-col', h('button.btn-icone.perigo', {
            type: 'button', title: 'Remover', 'aria-label': 'Remover item', onclick: function () {
              p.itens.splice(i, 1);
              if (!it.manual) p.itensSync = false;
              sujo = true;
              desenhar('materiais');
              atualizar();
            }
          }, '×'))));
        sub.textContent = U.brl(U.numOr(it.qtd, 0) * U.numOr(it.precoUnit, 0));
      });
      corpoItens.appendChild(h('div.tabela-rolagem', h('table.tabela.editavel.itens',
        h('thead', h('tr', ['#', 'Descrição', 'Qtd.', 'Un.', 'Preço unit.', 'Subtotal', 'Garantia', ''].map(function (t) { return h('th', t); }))),
        tb)));

      const selAdd = h('select', h('option', { value: '' }, '+ Adicionar item do catálogo…'));
      D.TIPOS_EQUIP.forEach(function (t) {
        const og = h('optgroup', { label: t.label });
        ctx.equipamentos.filter(function (e) { return e.tipo === t.id && e.ativo !== false; }).forEach(function (e) {
          og.appendChild(h('option', { value: e.id }, C.nomeEquip(e)));
        });
        if (og.children.length) selAdd.appendChild(og);
      });
      selAdd.addEventListener('change', function () {
        const e = ctx.equipamentos.find(function (x) { return x.id === selAdd.value; });
        if (!e) return;
        const cat = { modulo: 'modulo', inversor: 'inversor', hibrido: 'inversor', bateria: 'bateria', estrutura: 'estrutura' }[e.tipo] || 'material';
        p.itens.push({ id: U.uid(), equipamentoId: e.id, categoria: cat, descricao: C.descEquip(e), qtd: 1, unidade: e.unidade || 'un', precoUnit: U.numOr(e.preco, 0), garantia: C.garantiaEquip(e), manual: true });
        sujo = true;
        desenharItens();
        atualizar();
      });
      corpoItens.appendChild(h('div.barra-itens',
        selAdd,
        h('button.btn.pequeno', {
          type: 'button', onclick: function () {
            p.itens.push({ id: U.uid(), equipamentoId: null, categoria: 'material', descricao: 'Novo item', qtd: 1, unidade: 'un', precoUnit: 0, garantia: '', manual: true });
            sujo = true; desenharItens(); atualizar();
          }
        }, '+ Item avulso'),
        h('button.btn.pequeno', {
          type: 'button', onclick: async function () {
            if (await UI.confirmar('Regerar a lista de materiais a partir do dimensionamento atual? Itens editados manualmente serão substituídos.')) {
              p.itens = [];
              p.itensSync = true;
              sujo = true;
              desenhar('materiais');
              atualizar(true);
            }
          }
        }, '↻ Regerar lista'),
        h('span.total-itens', { 'data-total-itens': '' })));
    }

    /* ---------------- seção: financeiro e pagamento */
    secao('financeiro', 'Premissas financeiras e pagamento', function (c) {
      c.appendChild(UI.grade([
        { k: 'premissas.tma', label: 'Taxa de desconto (TMA)', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.tmaNome', label: 'Nome da taxa', placeholder: 'SELIC' },
        { k: 'premissas.inflacaoTarifa', label: 'Inflação tarifária', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.reajusteCosip', label: 'Reajuste da COSIP', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.degradacao', label: 'Degradação dos módulos', type: 'pct', suffix: '% a.a.' },
        { k: 'premissas.pr', label: 'Performance Ratio', type: 'number' },
        { k: 'premissas.horizonte', label: 'Horizonte', type: 'int', suffix: 'anos' },
        ehArm() ? { k: 'premissas.armazenamento.degradacao', label: 'Degradação do armazenamento', type: 'pct', suffix: '% a.a.' } : null,
        ehArm() ? { k: 'premissas.armazenamento.diasUteis', label: 'Dias úteis (ponta) por ano', type: 'int', suffix: 'dias' } : null,
        ehArm() ? { k: 'premissas.armazenamento.duracaoPonta', label: 'Duração do horário de ponta', type: 'number', suffix: 'h' } : null,
        ehArm() ? { k: 'premissas.armazenamento.vidaCalendario', label: 'Vida útil do armazenamento', type: 'int', suffix: 'anos' } : null,
        { el: h('div.campo', h('label', ' '), h('button.btn.pequeno', {
          type: 'button', onclick: function () {
            p.premissas = U.clone(S.config().premissas);
            sujo = true; desenhar('financeiro'); atualizar();
            UI.toast('Premissas padrão aplicadas a esta proposta.');
          }
        }, 'Aplicar premissas padrão')) }
      ], p, mudou, 4));
      c.appendChild(h('h4.secao-form', 'Opções de pagamento exibidas na proposta'));
      infos.pagamentos = h('div.lista-pagamentos');
      c.appendChild(infos.pagamentos);
    });

    /* ---------------- seção: textos */
    secao('textos', 'Textos e observações', function (c) {
      c.appendChild(UI.grade([
        { k: 'tecnologiaTexto', label: 'Tecnologia (capa)', placeholder: 'Automático' },
        { k: 'monitoramento', label: 'Monitoramento', placeholder: 'Automático (cadastro do inversor)' },
        { k: 'estruturaTexto', label: 'Estrutura de fixação (tabela de dimensionamento)', placeholder: 'Automático (a partir da lista de materiais)', cls: 'span2' },
        { k: 'condicoesObs', label: 'Observações nas condições comerciais (aparece na proposta)', type: 'textarea', cls: 'span2' },
        { k: 'observacoes', label: 'Anotações internas (não aparecem na proposta)', type: 'textarea', cls: 'span2' }
      ], p, mudou, 2));
    });

    /* ---------------- atualização */

    function linhaInfo(rotulo, valor, tipo) {
      return h('div.info-item' + (tipo ? '.' + tipo : ''), h('span', rotulo), h('strong', valor));
    }

    function atualizar(forcarSync) {
      if (p.itensSync || forcarSync) {
        const r0 = C.calcular(Object.assign({}, p, { itens: [] }), ctx);
        const antigos = p.itens || [];
        const novos = r0.itens.map(function (n) {
          const a = antigos.find(function (o) { return !o.manual && o.equipamentoId && o.equipamentoId === n.equipamentoId; });
          if (a) { n.id = a.id; n.precoUnit = a.precoUnit; n.garantia = a.garantia; n.descricao = a.descricao; }
          return n;
        }).concat(antigos.filter(function (o) { return o.manual; }));
        const mud = assinaturaItens(novos) !== assinaturaItens(antigos);
        p.itens = novos;
        if (mud) desenharItens();
      }
      r = C.calcular(p, ctx);
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      const nomeTipo = { ongrid: 'Sistema On-Grid', hibrido: 'Sistema Híbrido', bess: 'BESS' }[p.tipoSistema] || 'Sistema On-Grid';
      subtitulo.textContent = [cli ? cli.nome : 'Cliente não selecionado', nomeTipo, 'Grupo ' + r.grupo + ' ' + r.modalidade.curto, p.numero].join(' · ');
      titulo.textContent = p.id ? 'Proposta ' + p.numero : 'Nova proposta';
      const t = r.tarifas;

      if (infos.consumo) {
        const linhas = [
          linhaInfo('Consumo médio', U.fmt(r.consumoMedio, 0) + ' kWh/mês'),
          linhaInfo('Consumo anual', U.fmt(r.consumoMedio * 12, 0) + ' kWh')
        ];
        if (r.grupo === 'B') linhas.push(linhaInfo('Disponibilidade (' + C.LIG_ADJ[r.ligacao] + ')', U.fmt(r.disponibilidade, 0) + ' kWh/mês'));
        if (r.modalidade.id === 'conv') linhas.push(linhaInfo('Tarifa considerada', r.tarifa ? 'R$ ' + U.fmt(r.tarifa, 4) + '/kWh' : '—'));
        else {
          linhas.push(linhaInfo('Ponta / fora de ponta', (t.ponta ? 'R$ ' + U.fmt(t.ponta, 4) : '—') + ' / ' + (t.fp ? 'R$ ' + U.fmt(t.fp, 4) : '—') + ' por kWh'));
          if (t.ponta && t.fp) linhas.push(linhaInfo('Diferença ponta × fora de ponta', U.fmtSmart(t.ponta / t.fp, 2) + '×', 'destaque'));
        }
        if (r.grupo === 'A') {
          const sem = App.Energia.conta(t, r.consumoPostos, r.demanda, { cosip: r.cosip }, r.premissas);
          linhas.push(linhaInfo('Demanda na fatura (mês)', U.brl(sem.demanda + sem.ultrapassagem), sem.ultrapassagem > 0 ? 'alerta' : null));
          if (sem.ultrapassagem > 0) linhas.push(linhaInfo('Multa de ultrapassagem', U.brl(sem.ultrapassagem), 'alerta'));
          linhas.push(linhaInfo('Fatura estimada sem sistema', U.brl(sem.total) + '/mês'));
        }
        infos.consumo.replaceChildren.apply(infos.consumo, linhas);
      }
      if (infos.sistema && infos.placeModulos.querySelector) {
        const placeM = infos.placeModulos.querySelector('input');
        if (placeM) placeM.placeholder = r.nModulosSugerido ? 'Sugerido: ' + r.nModulosSugerido : '';
        const placeI = infos.placeInv.querySelector('input');
        if (placeI) placeI.placeholder = r.inversor ? 'Auto: ' + r.nInversores : '';
        const sug = r.inversorSugerido;
        const itensInfo = [
          linhaInfo('Potência necessária', U.fmt(r.kwpNecessario, 2) + ' kWp'),
          linhaInfo('Potência do sistema', U.kwp(r.kwp) + ' kWp', 'destaque'),
          linhaInfo('Inversor', r.inversor ? r.nInversores + ' × ' + C.nomeEquip(r.inversor) : '—'),
          linhaInfo('FDI (P inv ÷ P FV)', r.kwp ? U.fmt(r.fdi, 3) + (r.fdiOk ? ' ✅' : ' ⚠️') : '—', r.kwp && !r.fdiOk ? 'alerta' : null),
          linhaInfo('Geração mensal', U.fmt(r.geracaoMensal, 0) + ' kWh/mês'),
          linhaInfo('Geração anual (ano 1)', U.fmt(r.geracaoAnual, 0) + ' kWh'),
          linhaInfo('Cobertura do consumo', U.fmt(r.cobertura * 100, 1) + '%'),
          linhaInfo('Área aproximada', '~' + U.fmt(r.area, 0) + ' m²')
        ];
        if (r.strings) itensInfo.push(linhaInfo('Arranjo sugerido', r.strings.nStrings + ' string(s) de até ' + r.strings.porString + ' módulos (máx. ' + r.strings.maxSerie + '/string)'));
        if (!p.inversorId && sug) itensInfo.push(linhaInfo('Sugestão automática', sug.n + ' × ' + C.nomeEquip(sug.inv)));
        infos.sistema.replaceChildren.apply(infos.sistema, itensInfo);
      }
      if (infos.hibrido && r.hibrido) {
        const hb = r.hibrido;
        const u = r.unidadeArm;
        const nomeU = r.bessAtivo ? 'gabinete' : 'bateria';
        infos.hibrido.replaceChildren(
          linhaInfo('Equipamento', hb.bateria ? C.nomeEquip(hb.bateria) : '—'),
          linhaInfo('Por ' + nomeU, u ? U.fmtSmart(u.energia, 2) + ' kWh' + (u.potencia ? ' / ' + U.fmtSmart(u.potencia, 2) + ' kW' : '') + (u.preco ? ' — ' + U.brl(u.preco) : '') : '—'),
          linhaInfo('Potência das cargas críticas', U.fmtSmart(hb.potCargas / 1000, 2) + ' kW'),
          linhaInfo('Energia no backup', U.fmtSmart(hb.energiaBackup / 1000, 2) + ' kWh'),
          linhaInfo('Capacidade necessária (backup)', U.fmtSmart(hb.capNecessaria, 2) + ' kWh'),
          linhaInfo('Cenário detalhado', r.cen ? r.cen.nome + (r.cen.n ? ' — ' + r.cen.n + ' × ' + U.fmtSmart(u ? u.energia : 0, 2) + ' = ' + U.fmtSmart(hb.capInstalada, 2) + ' kWh' : '') : '—', 'destaque'),
          linhaInfo('Configuração', r.cen && r.cen.n ? hb.configuracao : '—'),
          linhaInfo('Autonomia estimada', hb.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(hb.autonomiaEstimada, 1) + ' h' : '—', hb.autonomiaEstimada != null && hb.autonomiaEstimada < hb.autonomiaHoras ? 'alerta' : null),
          linhaInfo('Potência de backup', U.fmtSmart(hb.potBackup || 0, 2) + ' kW' + (hb.potCargas ? (hb.backupOk ? ' ✅' : ' ⚠️') : ''), hb.potCargas && !hb.backupOk ? 'alerta' : null));
      }
      if (infos.cenarios) desenharComparativo();
      if (infos.preco) {
        const wp = r.kwp * 1000;
        const linhas = [];
        if (r.incluiFV || !ehArm()) {
          linhas.push(linhaInfo('Kit fotovoltaico' + (p.kitManual ? ' (manual)' : ' (soma dos itens)'), U.brl(r.kit)),
            linhaInfo('Infraestrutura CA', U.brl(r.infra)),
            linhaInfo('Mão de obra + projeto + homologação', U.brl(r.maoObra), r.maoObra < 0 ? 'alerta' : null));
        }
        if (r.kitArm || r.instalArm) linhas.push(linhaInfo('Armazenamento (equipamento)', U.brl(r.kitArm)), linhaInfo('Instalação do armazenamento', U.brl(r.instalArm)));
        linhas.push(linhaInfo(ehArm() && r.cen ? 'Investimento — ' + r.cen.nome : 'Valor total', U.brl(r.total), 'destaque'));
        if (wp > 0) linhas.push(linhaInfo('Preço por Wp', 'R$ ' + U.fmt(r.total / wp, 2) + '/Wp'));
        infos.preco.replaceChildren.apply(infos.preco, linhas);
      }
      const totItens = corpoItens && corpoItens.querySelector('[data-total-itens]');
      if (totItens) totItens.textContent = 'Soma dos itens: ' + U.brl(r.kitSoma);
      if (infos.pagamentos) desenharPagamentos();
      desenharResumo();
    }

    function desenharPagamentos() {
      const box = infos.pagamentos;
      box.innerHTML = '';
      if (!ctx.pagamentos.length) { box.appendChild(h('p.ajuda-sec', 'Nenhuma modalidade cadastrada (Cadastros › Pagamentos).')); return; }
      ctx.pagamentos.forEach(function (pg) {
        const marcado = p.pagamentosIds.indexOf(pg.id) >= 0;
        const sim = C.pagamentos(r.total, [Object.assign({}, pg, { ativo: true })])[0];
        const chk = h('input', {
          type: 'checkbox', checked: marcado, onchange: function () {
            const i = p.pagamentosIds.indexOf(pg.id);
            if (chk.checked && i < 0) p.pagamentosIds.push(pg.id);
            if (!chk.checked && i >= 0) p.pagamentosIds.splice(i, 1);
            sujo = true;
            desenharResumo();
          }
        });
        box.appendChild(h('label.pagamento', chk, h('span', sim.label), h('strong', sim.prazo + ' de ' + U.brl(sim.parcela))));
      });
    }

    const mini = h('canvas.mini-grafico', { width: 720, height: 300 });

    function valorTir(f) {
      return f.tir != null ? U.fmt(f.tir * 100, 1) + '% a.a.' : (f.tirAcima ? '> 1.000%' : '—');
    }

    function desenharComparativo() {
      const box = infos.cenarios;
      box.innerHTML = '';
      const todos = r.cenarios || [];
      document.querySelectorAll('[data-cenario]').forEach(function (card) {
        const c = todos.find(function (x) { return x.id === card.getAttribute('data-cenario'); });
        const selo = card.querySelector('.cenario-selo');
        card.classList.toggle('inativo', !(c && c.ativo));
        card.classList.toggle('recomendado', !!(r.recomendacao && c && r.recomendacao.id === c.id));
        if (!selo || !c) return;
        selo.textContent = !c.aplicavel ? 'Não se aplica' : (r.recomendacao && r.recomendacao.id === c.id ? '✅ Recomendado' : (r.cen && r.cen.id === c.id ? 'Na proposta' : ''));
        const nInput = card.querySelector('[data-k="cenarios.' + c.id + '.n"]');
        if (nInput) nInput.placeholder = c.aplicavel && c.n ? 'Auto: ' + c.n : '';
        const kwInput = card.querySelector('[data-k="cenarios.picos.reducaoKW"]');
        if (kwInput && c.id === 'picos') kwInput.placeholder = c.aplicavel ? 'Auto: ' + U.fmtSmart(C.reducaoAlvo(r, r.cenariosConfig.picos, r.premissas), 1) : '';
      });
      const av = r.cenariosAvaliados || [];
      if (!av.length) {
        box.appendChild(h('p.ajuda-sec', 'Nenhum cenário pôde ser avaliado. ' + (r.tarifas.faltando.length ? 'Informe as tarifas.' : 'Verifique consumo, equipamento e preços.')));
        return;
      }
      const linha = function (rot, fn, cls) {
        return h('tr' + (cls ? '.' + cls : ''), h('th', rot), av.map(function (c) { return h('td' + (r.recomendacao && r.recomendacao.id === c.id ? '.rec' : ''), fn(c)); }));
      };
      const u = r.unidadeArm;
      box.appendChild(h('div.tabela-rolagem', h('table.tabela.comparativo-tab',
        h('thead', h('tr', h('th', 'Indicador'), av.map(function (c) {
          return h('th' + (r.recomendacao && r.recomendacao.id === c.id ? '.rec' : ''), c.nome, r.recomendacao && r.recomendacao.id === c.id ? h('div.mini', '✅ recomendado') : null);
        }))),
        h('tbody',
          linha('Sistema FV', function (c) { return c.incluirFV && r.kwp ? U.kwp(r.kwp) + ' kWp' : '—'; }),
          linha('Armazenamento', function (c) { return c.n ? c.n + ' × ' + U.fmtSmart(u ? u.energia : 0, 2) + ' = ' + U.fmtSmart(c.capInstalada, 2) + ' kWh' : '—'; }),
          linha('Investimento', function (c) { return U.brl(c.investimento); }, 'forte'),
          linha('Benefício ano 1', function (c) { return U.brl(c.fin.beneficioAno1); }),
          linha('Payback simples', function (c) { return U.anosMeses(c.fin.paybackSimples); }),
          linha('VPL ' + (av[0].fin.horizonte) + ' anos', function (c) { return U.brl(c.fin.vpl); }, 'forte'),
          linha('TIR', function (c) { return valorTir(c.fin); }),
          linha('Autonomia (falta de energia)', function (c) { return c.metricas && c.metricas.autonomiaH ? '≈ ' + U.fmtSmart(c.metricas.autonomiaH, 1) + ' h' : '—'; }),
          linha('Redução de demanda', function (c) { return c.fin.reducaoKW1 ? U.fmtSmart(c.fin.reducaoKW1, 1) + ' kW' : '—'; }),
          linha('Energia deslocada (ano 1)', function (c) { return c.fin.kwhDeslocadosAno1 ? U.fmt(c.fin.kwhDeslocadosAno1, 0) + ' kWh' : '—'; })))));
      const naoAplic = todos.filter(function (c) { return c.ativo && !c.aplicavel; });
      if (naoAplic.length) box.appendChild(h('p.ajuda-sec', naoAplic.map(function (c) { return c.nome + ': ' + c.motivoNA; }).join(' · ')));
      if (r.recomendacao) {
        box.appendChild(h('div.recomendacao', h('strong', '✅ Recomendação: ' + r.recomendacao.nome),
          h('ul', r.recomendacao.motivos.map(function (m) { return h('li', m); }))));
      }
    }

    function desenharResumo() {
      const f = r.fin;
      resumo.innerHTML = '';
      const kpi = function (rot, val, cls) { return h('div.kpi' + (cls ? '.' + cls : ''), h('span', rot), h('strong', val)); };
      const selo = { ongrid: ['On-Grid', 'azul'], hibrido: ['Híbrido', 'roxo'], bess: ['BESS', 'roxo'] }[p.tipoSistema] || ['On-Grid', 'azul'];
      const temFV = r.incluiFV && r.kwp > 0;
      const blocos = [
        h('div.resumo-topo', UI.badge(selo[0], selo[1]), UI.badge('Grupo ' + r.grupo + ' · ' + r.modalidade.curto, 'cinza'),
          UI.badge((D.STATUS.find(function (s) { return s.id === p.status; }) || D.STATUS[0]).label, 'cinza'), sujo ? UI.badge('Não salvo', 'ambar') : null),
        r.cen && r.comparar ? h('div.cenario-escolhido', h('span', 'Cenário na proposta'), h('strong', r.cen.nome),
          r.recomendacao && r.recomendacao.id === r.cen.id ? UI.badge('Recomendado', 'ok') : (r.recomendacao ? UI.badge('Recomendado: ' + r.recomendacao.nome, 'ambar') : null)) : null,
        temFV ? h('div.kpis',
          kpi('Potência', U.kwp(r.kwp) + ' kWp', 'grande'),
          kpi('Módulos', r.modulo ? r.nModulos + ' × ' + r.modulo.potencia + ' Wp' : '—'),
          kpi('Inversor', r.inversor ? r.nInversores + ' × ' + U.fmtSmart(r.inversor.potencia, 2) + ' kW' : '—'),
          kpi('FDI', r.kwp ? U.fmt(r.fdi, 3) : '—', r.kwp && !r.fdiOk ? 'alerta' : null),
          kpi('Geração', U.fmt(r.geracaoMensal, 0) + ' kWh/mês'),
          kpi('Cobertura', U.fmt(r.cobertura * 100, 0) + '%')) : null,
        r.hibrido && r.cen && r.cen.n ? h('div.kpis',
          kpi(r.bessAtivo ? 'BESS' : 'Baterias', U.fmtSmart(r.hibrido.capInstalada || 0, 2) + ' kWh', temFV ? null : 'grande'),
          kpi('Potência armaz.', U.fmtSmart(r.hibrido.potenciaArm || 0, 2) + ' kW'),
          kpi('Autonomia', r.hibrido.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(r.hibrido.autonomiaEstimada, 1) + ' h' : '—'),
          r.fin.reducaoKW1 ? kpi('Redução demanda', U.fmtSmart(r.fin.reducaoKW1, 1) + ' kW') : null) : null,
        h('div.kpis',
          kpi('Investimento', U.brl(r.total), 'grande'),
          kpi('Economia mês 1', U.brl(f.economiaMes1), 'verde'),
          kpi('Payback', r.total > 0 ? U.anosMeses(f.paybackSimples) : '—'),
          kpi('Payback desc.', r.total > 0 ? U.anosMeses(f.paybackDescontado) : '—'),
          kpi('TIR', valorTir(f)),
          kpi('VPL ' + f.horizonte + ' anos', U.brl(f.vpl))),
        temFV ? mini : null
      ];
      blocos.forEach(function (b) { if (b) resumo.appendChild(b); });
      if (temFV) App.Chart.desenhar(mini, { consumo: r.consumoMeses, geracao: r.geracaoMeses, titulo: 'Consumo × Geração — ' + U.kwp(r.kwp) + ' kWp' });
      if (r.alertas.length) {
        resumo.appendChild(h('ul.alertas', r.alertas.map(function (a) { return h('li.' + a.nivel, a.msg); })));
      } else {
        resumo.appendChild(h('p.tudo-ok', '✅ Dimensionamento sem alertas.'));
      }
      resumo.appendChild(h('div.resumo-acoes',
        h('button.btn', { type: 'button', onclick: function () { salvar(true); } }, 'Salvar'),
        h('button.btn', { type: 'button', onclick: function () { gerar('docx'); } }, '⬇ Word'),
        h('button.btn.primario', { type: 'button', onclick: function () { gerar('pdf'); } }, '⬇ PDF')));
    }

    /* ---------------- salvar / gerar */

    function salvar(avisar) {
      if (!p.clienteId) { UI.toast('Selecione o cliente antes de salvar.', 'erro'); secoes.cliente.el.scrollIntoView({ behavior: 'smooth' }); return false; }
      const cli = ctx.clientes.find(function (x) { return x.id === p.clienteId; });
      const novo = !p.id;
      if (novo) {
        // número definitivo atribuído no primeiro salvamento: sempre o próximo livre da data de emissão
        const n = S.proximoNumero(p.data);
        p.numero = n.numero;
        p._seq = n;
      }
      const seq = p._seq;
      delete p._seq;
      p.clienteNome = cli ? cli.nome : '';
      p.resumo = {
        kwp: r.incluiFV ? r.kwp : 0, total: r.total, kwh: r.hibrido && r.cen && r.cen.n ? r.hibrido.capInstalada : 0,
        payback: r.fin.paybackSimples, geracao: r.geracaoMensal, cidade: r.cidade,
        cenario: r.comparar && r.cen ? r.cen.nome : '', grupo: r.grupo + ' ' + r.modalidade.curto
      };
      try { S.save('propostas', p); } catch (e) { UI.toast(e.message, 'erro'); return false; }
      if (seq) S.reservarNumero(seq.dia, seq.seq);
      sujo = false;
      if (novo) UI.substituirHash('#/proposta/' + p.id);
      desenhar('ident');
      atualizar();
      if (avisar) UI.toast('Proposta ' + p.numero + ' salva.', 'ok');
      return true;
    }

    async function gerar(formato) {
      atualizar();
      const erros = r.alertas.filter(function (a) { return a.nivel === 'erro'; });
      if (!p.clienteId) { UI.toast('Selecione o cliente.', 'erro'); return; }
      if (erros.length) {
        const continuar = await UI.confirmar('Há pendências no dimensionamento: ' + erros.map(function (e) { return e.msg; }).join(' ') + ' Gerar mesmo assim?', 'Gerar mesmo assim');
        if (!continuar) return;
      }
      if (sujo && !salvar(false)) return;
      const botao = formato === 'pdf' ? btnPdf : btnDocx;
      const rotulo = botao.textContent;
      botao.disabled = true;
      botao.textContent = 'Gerando…';
      try {
        const g = formato === 'pdf' ? await App.Pdf.gerar(p, ctx) : await App.Docx.gerar(p, ctx);
        U.download(g.blob, g.nome);
        UI.toast('Proposta gerada: ' + g.nome, 'ok');
      } catch (e) {
        console.error(e);
        UI.toast('Falha ao gerar o documento: ' + e.message, 'erro');
      } finally {
        botao.disabled = false;
        botao.textContent = rotulo;
      }
    }

    desenharTudo();
    atualizar();
    // proposta nova ainda não alterada pelo usuário: sair sem pedir confirmação
    if (!id) inicial = JSON.stringify(p);
  }
})(window.App);
