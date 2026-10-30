/*
 * PDFs da execução: ordem de serviço, relatório de instalação (termo de entrega), com as assinaturas colhidas na tela e,
 * no relatório, as fotos dos equipamentos com as legendas, e pedido de compra para o fornecedor. Mesmo motor de documento da proposta (App.Pdf), sem capa.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const N = App.Documento.nos;
  const R = N.R, P = N.P, T = N.T, TC = N.TC, TR = N.TR, TBL = N.TBL, IMG = N.IMG;
  const COR = App.Documento.COR;
  const AZUL = COR.AZUL, CINZA = COR.CINZA, GRAFITE = COR.GRAFITE, BRANCO = COR.BRANCO, DOURADO = COR.DOURADO;
  const BORDA = { sz: 4, cor: 'DBEAFE' };
  const EMU_POL = 914400;

  function papelDe(emp) { return emp.papel === 'a4' ? { w: 11906, h: 16838 } : { w: 12240, h: 15840 }; }

  function secao(texto) {
    return P([R(texto, { b: true, color: AZUL, sz: 24 })], { keepNext: true, before: 220, after: 100, bottom: { sz: 6, space: 3, color: 'BFDBFE' } });
  }

  /** Faixa do título: tipo do documento, número e situação. */
  function faixa(titulo, sub, chips) {
    const dir = (chips || []).filter(Boolean).map(function (c, i) {
      return P([R(c[0] + ' ', { color: '475569', sz: 17 }), R(c[1], { b: true, color: c[2] || AZUL, sz: 20 })], { jc: 'right', after: i === chips.length - 1 ? 0 : 40 });
    });
    return TBL([5960, 3400], [TR([
      TC([T(titulo, { after: 30 }, { b: true, color: BRANCO, sz: 34 }), T(sub, null, { color: 'DBEAFE', sz: 20 })],
        { w: 5960, fill: AZUL, borda: { sz: 4, cor: AZUL }, mar: { t: 160, b: 160, l: 280, r: 160 } }),
      TC(dir.length ? dir : P([]), { w: 3400, fill: 'F8FAFF', borda: { sz: 4, cor: AZUL }, mar: { t: 160, b: 160, l: 160, r: 240 } })
    ], false, { naoQuebrar: true })]);
  }

  /** Pares rótulo/valor em duas colunas (rótulo pequeno em cinza, valor em destaque); valores longos ocupam a linha inteira. */
  function pares(lista) {
    const itens = lista.filter(function (x) { return x && x[1] != null && String(x[1]).trim() !== ''; });
    const cel = function (x, w, span) {
      return TC(x ? [T(x[0], { after: 10 }, { color: CINZA, sz: 15 }), T(String(x[1]), null, { b: true, color: GRAFITE, sz: 19 })] : P([]),
        { w: w, span: span, fill: 'F8FAFC', borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 55, b: 55, l: 160, r: 120 }, vAlign: 'top' });
    };
    const longo = function (x) { return String(x[1]).length > 55; };
    const linhas = [];
    let i = 0;
    while (i < itens.length) {
      const a = itens[i];
      if (longo(a)) { linhas.push(TR([cel(a, 9360, 2)], false, { naoQuebrar: true })); i++; continue; }
      const par = itens[i + 1] && !longo(itens[i + 1]) ? itens[i + 1] : null;
      linhas.push(TR([cel(a, 4680), cel(par, 4680)], false, { naoQuebrar: true }));
      i += par ? 2 : 1;
    }
    return TBL([4680, 4680], linhas.length ? linhas : [TR([cel(null, 4680), cel(null, 4680)])]);
  }

  /** Texto em quadro claro (solicitação, serviço executado, termo). */
  function quadro(texto, o) {
    o = o || {};
    const paragrafos = String(texto || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return TBL([9360], [TR([TC(paragrafos.length ? paragrafos.map(function (x, i) { return T(x, { after: i === paragrafos.length - 1 ? 0 : 80 }, { color: o.cor || GRAFITE, sz: o.sz || 20, i: !!o.italico }); })
      : T('—', null, { color: CINZA }), { w: 9360, fill: o.fundo || 'F8FAFF', borda: o.borda || BORDA, mar: { t: 100, b: 100, l: 220, r: 220 } })], false, { naoQuebrar: true })]);
  }

  function tabela(cols, linhas, sz) {
    const rows = [TR(cols.map(function (c) { return TC(T(c.t, { jc: c.jc || 'left' }, { b: true, color: BRANCO, sz: 17 }), { w: c.w, fill: AZUL, borda: { sz: 4, cor: AZUL }, mar: { t: 70, b: 70, l: 120, r: 120 } }); }), true)];
    linhas.forEach(function (l, i) {
      rows.push(TR(l.map(function (v, j) {
        const x = v && typeof v === 'object' && !v.tipo ? v : { t: v };
        return TC(T(x.t == null ? '' : String(x.t), { jc: cols[j].jc || 'left' }, { sz: sz || 18, b: !!x.b, color: x.color || GRAFITE }),
          { w: cols[j].w, fill: x.fill || (i % 2 ? 'F8FAFC' : BRANCO), borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 60, b: 60, l: 120, r: 120 } });
      }), false, { naoQuebrar: true }));
    });
    return TBL(cols.map(function (c) { return c.w; }), rows);
  }

  /**
   * Bloco de aceite (não se divide entre páginas): título, termo e as assinaturas lado a lado — a imagem colhida na tela
   * (ou espaço em branco para assinar à mão) sobre a linha, com nome, papel e data alinhados.
   */
  function blocoAceite(titulo, termo, lista, imagens) {
    const n = lista.length, w = Math.floor(9360 / n), larg = lista.map(function () { return w; });
    const linhas = [TR([TC(P([R(titulo, { b: true, color: AZUL, sz: 24 })], { bottom: { sz: 6, space: 3, color: 'BFDBFE' }, after: 100 }),
      { w: w * n, span: n, semBorda: true, mar: { t: 0, b: 0, l: 0, r: 0 } })], false, { naoQuebrar: true })];
    if (termo) {
      linhas.push(TR([TC(T(termo, null, { i: true, color: '57534E', sz: 17 }), { w: w * n, span: n, fill: 'FFFBEB', borda: { sz: 4, cor: 'FDE68A' }, mar: { t: 100, b: 100, l: 220, r: 220 } })], false, { naoQuebrar: true }));
    }
    linhas.push(TR(lista.map(function (a) {
      let filho = P([], { before: 760, after: 0 });
      if (a.ref && imagens[a.ref]) {
        const tam = N.encaixar(a.w || 900, a.h || 300, Math.round(2.6 * EMU_POL), Math.round(0.7 * EMU_POL));
        filho = P(IMG(a.ref, tam.cx, tam.cy, 'Assinatura de ' + (a.nome || a.papel)), { jc: 'center', after: 0 });
      }
      return TC(filho, { w: w, semBorda: true, mar: { t: 160, b: 0, l: 300, r: 300 }, vAlign: 'bottom' });
    }), false, { naoQuebrar: true }));
    linhas.push(TR(lista.map(function (a) {
      return TC([
        T(a.nome || ' ', { top: { sz: 6, space: 4, color: '334155' }, jc: 'center', before: 40, after: 10 }, { b: true, sz: 19 }),
        T(a.papel, { jc: 'center', after: 10 }, { color: CINZA, sz: 16 }),
        T(a.em ? 'Assinado na tela em ' + App.Assinatura.dataHora(a.em) : 'Data: ____/____/________', { jc: 'center' }, { color: CINZA, sz: 15 })
      ], { w: w, semBorda: true, mar: { t: 0, b: 0, l: 300, r: 300 }, vAlign: 'top' });
    }), false, { naoQuebrar: true }));
    return TBL(larg, linhas, { manterJunto: true });
  }

  /** Assinantes do bloco de aceite a partir de {cliente, tecnico} do registro. */
  function assinantes(as, rec, cliente, tecnico, papelTecnico) {
    as = as || {};
    const um = function (x, ref, nome, papel) {
      const assinado = !!(x && x.fotoId && rec.imagens[ref]);
      return { ref: assinado ? ref : null, w: (rec.dims[ref] || {}).w, h: (rec.dims[ref] || {}).h, nome: (x && x.nome) || nome, papel: papel, em: x && x.fotoId ? x.em : '' };
    };
    return [um(as.cliente, 'assCliente', cliente, 'Cliente'), um(as.tecnico, 'assTecnico', tecnico, papelTecnico)];
  }

  /** Logotipo, imagens das assinaturas e das fotos (App.Fotos) já carregadas. */
  async function carregar(ctx, refs) {
    const logo = await App.Documento.prepararLogo(ctx.empresa.logo);
    const imagens = {}, dims = {};
    for (const ref of Object.keys(refs)) {
      const f = refs[ref] ? await App.Fotos.obter(refs[ref]) : null;
      if (f && f.dataURL) { imagens[ref] = f.dataURL; dims[ref] = { w: f.w, h: f.h }; }
    }
    return { logo: logo, imagens: imagens, dims: dims };
  }

  function cabecalhoRodape(emp, logo, texto) {
    const hl = N.encaixar(logo.w, logo.h, 1238250, 666750);
    const cabecalho = [
      TBL([3600, 5760], [TR([
        TC(P(IMG('logo', hl.cx, hl.cy, 'Logotipo')), { w: 3600, semBorda: true }),
        TC([T(emp.razao, { jc: 'right', after: 10 }, { b: true, color: AZUL, sz: 18 }),
          T(texto, { jc: 'right' }, { color: CINZA, sz: 16 })], { w: 5760, semBorda: true, vAlign: 'bottom' })
      ])]),
      P([], { bottom: { sz: 8, space: 2, color: AZUL } })
    ];
    const contato = [emp.telefone ? 'WhatsApp ' + emp.telefone : '', emp.email || '', [emp.cidade, emp.uf].filter(Boolean).join('/')].filter(Boolean).join('  │  ');
    const rodape = [
      T(emp.razao + '  │  CNPJ ' + emp.cnpj + (emp.registro ? '  │  ' + emp.registroTipo + ' ' + emp.registro : ''), { top: { sz: 6, space: 2, color: AZUL }, before: 80, jc: 'center', after: 0 }, { color: CINZA, sz: 15 }),
      contato ? T(contato, { jc: 'center' }, { color: CINZA, sz: 15 }) : P([])
    ];
    return { cabecalho: cabecalho, rodape: rodape };
  }

  function vars(ctx, cliente) {
    const emp = ctx.empresa;
    return { empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cliente: cliente || 'o cliente', registroTipo: emp.registroTipo || '', cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/') };
  }

  /* ------------------------------------------------------------ ordem de serviço */

  function montarOS(os, ctx, rec) {
    const O = App.Ordem;
    const emp = ctx.empresa;
    const papel = papelDe(emp);
    const k = (papel.w - 2880) / 9360;
    const inst = os.instalacaoId ? (ctx.instalacoes || []).find(function (x) { return x.id === os.instalacaoId; }) : null;
    const st = O.STATUS.find(function (s) { return s.id === os.status; }) || O.STATUS[0];
    const pr = O.PRIORIDADES.find(function (s) { return s.id === os.prioridade; }) || O.PRIORIDADES[1];
    const corSt = { ok: '15803D', ambar: 'B45309', roxo: '6D28D9', cinza: '475569', azul: AZUL, erro: 'DC2626' };
    const b = [];
    b.push(faixa('ORDEM DE SERVIÇO', os.numero + '  ·  aberta em ' + U.dataBR(os.data), [
      ['Situação:', st.label, corSt[st.cor]], ['Prioridade:', pr.label, corSt[pr.cor]], ['Tipo:', O.rotulo(O.TIPOS, os.tipo), AZUL]
    ]));
    b.push(secao('Cliente e local do atendimento'));
    b.push(pares([
      ['Cliente', os.clienteNome], ['Telefone / WhatsApp', os.telefone],
      ['Endereço', os.endereco], ['Cidade / UF', [os.cidade, os.uf].filter(Boolean).join(' / ')],
      inst ? ['Instalação', inst.titulo] : null,
      inst ? ['Sistema', [inst.kwp > 0 ? U.kwp(inst.kwp) + ' kWp' : '', inst.kwh > 0 ? U.fmtSmart(inst.kwh, 2) + ' kWh' : '', (inst.placas && inst.placas.inversor && inst.placas.inversor.modelo) ? 'inversor ' + [inst.placas.inversor.marca, inst.placas.inversor.modelo].filter(Boolean).join(' ') : ''].filter(Boolean).join(' · ')] : null
    ]));
    b.push(secao('Atendimento'));
    b.push(pares([
      ['Tipo de serviço', O.rotulo(O.TIPOS, os.tipo)], ['Técnico responsável', os.responsavel],
      ['Agendada para', U.dataBR(os.agendadaPara)], ['Concluída em', U.dataBR(os.concluidaEm)],
      ['Cobrança', os.garantia ? 'Atendimento em garantia (sem cobrança)' : (U.num(os.valor) > 0 ? U.brl(U.num(os.valor)) : 'A combinar')]
    ]));
    b.push(secao('Solicitação / problema relatado'));
    b.push(quadro(os.descricao));
    b.push(secao('Serviço executado'));
    b.push(quadro(os.servico, { fundo: 'F0FDF4', borda: { sz: 4, cor: 'BBF7D0' } }));
    const mats = (os.materiais || []).filter(function (m) { return m && (m.descricao || m.qtd); });
    if (mats.length) {
      b.push(secao('Materiais utilizados'));
      b.push(tabela([{ t: '#', w: 700, jc: 'center' }, { t: 'Material', w: 6860 }, { t: 'Qtd.', w: 1800, jc: 'center' }],
        mats.map(function (m, i) { return [String(i + 1), m.descricao || '', m.qtd || '']; })));
    }
    const termo = N.substituir(ctx.textos.termoOS || '', vars(ctx, os.clienteNome));
    b.push(P([], { after: 160 }));
    b.push(blocoAceite('Aceite e assinaturas', termo, assinantes(os.assinaturas, rec, os.clienteNome, os.responsavel, 'Técnico responsável — ' + (emp.nomeCurto || emp.razao)), rec.imagens));
    const cr = cabecalhoRodape(emp, rec.logo, 'Ordem de serviço ' + os.numero);
    return { papel: papel, k: k, corpo: b, cabecalho: cr.cabecalho, rodape: cr.rodape, imagens: rec.imagens };
  }

  async function pdfOS(os, ctx) {
    ctx = Object.assign({}, ctx || App.Calc.contexto(), { instalacoes: App.Store.list('instalacoes') });
    const as = os.assinaturas || {};
    const rec = await carregar(ctx, { assCliente: as.cliente && as.cliente.fotoId, assTecnico: as.tecnico && as.tecnico.fotoId });
    const modelo = montarOS(os, ctx, rec);
    const out = await App.Pdf.pacote(modelo, { logo: rec.logo }, { titulo: 'Ordem de serviço ' + os.numero + (os.clienteNome ? ' — ' + os.clienteNome : ''), assunto: 'Ordem de serviço', autor: ctx.empresa.razao });
    return { blob: out.blob, nome: 'OS_' + os.numero + (os.clienteNome ? '_' + U.slug(os.clienteNome) : '') + '.pdf', modelo: modelo };
  }

  /* ------------------------------------------------------------ relatório de instalação */

  function montarInstalacao(inst, ctx, rec) {
    const I = App.Instalacao;
    const emp = ctx.empresa;
    const papel = papelDe(emp);
    const k = (papel.w - 2880) / 9360;
    const st = I.STATUS.find(function (s) { return s.id === I.status(inst); }) || I.STATUS[0];
    const pr = I.progresso(inst), pc = I.progressoChecklist(inst);
    const b = [];
    b.push(faixa('RELATÓRIO DE INSTALAÇÃO', inst.titulo || inst.clienteNome || '', [
      ['Situação:', st.label, st.id === 'concluida' ? '15803D' : AZUL],
      ['Etapas:', pr.feitas + ' de ' + pr.total + ' concluídas', AZUL],
      pc.total ? ['Checklist:', pc.feitos + ' de ' + pc.total + ' itens', AZUL] : null
    ]));
    b.push(secao('Cliente e obra'));
    b.push(pares([
      ['Cliente', inst.clienteNome], ['Telefone / WhatsApp', inst.telefone],
      ['Endereço da instalação', inst.endereco], ['Cidade / UF', [inst.cidade, inst.uf].filter(Boolean).join(' / ')],
      ['Proposta', inst.propostaNumero], ['Responsável técnico', inst.responsavel],
      ['Equipe', inst.equipe], ['Conclusão', U.dataBR(I.previsaoConclusao(inst)) + (st.id === 'concluida' ? '' : ' (prevista)')]
    ]));
    // sistema instalado
    const pl = inst.placas || {};
    const linhaEq = function (rot, x, un) {
      if (!x || !(x.marca || x.modelo)) return null;
      return [{ t: rot, b: true }, [x.marca, x.modelo].filter(Boolean).join(' '), U.num(x.potencia) > 0 ? U.fmtSmart(U.num(x.potencia), 2) + ' ' + un : '—',
        U.num(x.quantidade) > 0 ? U.fmtSmart(U.num(x.quantidade), 0) : '—', x.serie || '—'];
    };
    const eqLin = [linhaEq('Módulos', pl.modulo, 'Wp'), linhaEq('Inversor', pl.inversor, 'kW')].filter(Boolean);
    const eq = inst.equipamentos || {};
    if (eq.armazenamento) eqLin.push([{ t: 'Baterias', b: true }, eq.armazenamento, '—', '—', '—']);
    b.push(secao('Sistema instalado'));
    b.push(pares([
      ['Potência', [inst.kwp > 0 ? U.kwp(inst.kwp) + ' kWp' : '', inst.kwh > 0 ? U.fmtSmart(inst.kwh, 2) + ' kWh de armazenamento' : ''].filter(Boolean).join(' + ')],
      ['Estrutura / telhado', eq.estrutura]
    ]));
    if (eqLin.length) {
      b.push(P([], { after: 80 }));
      b.push(tabela([{ t: 'Equipamento', w: 1500 }, { t: 'Marca e modelo', w: 3460 }, { t: 'Potência', w: 1300, jc: 'center' }, { t: 'Qtd.', w: 900, jc: 'center' }, { t: 'Nº de série / lote', w: 2200 }], eqLin, 17));
    }
    // fotos das etiquetas
    const fotos = Object.keys(rec.imagens).filter(function (r) { return /^foto/.test(r); });
    if (fotos.length) {
      b.push(secao('Fotos dos equipamentos'));
      const wc = 3120, linhas = [];
      for (let i = 0; i < fotos.length; i += 3) {
        const cel = [];
        for (let j = 0; j < 3; j++) {
          const ref = fotos[i + j];
          if (!ref) { cel.push(TC(P([]), { w: wc, semBorda: true })); continue; }
          const d = rec.dims[ref] || { w: 4, h: 3 };
          const tam = N.encaixar(d.w, d.h, Math.round(1.95 * EMU_POL), Math.round(1.6 * EMU_POL));
          cel.push(TC([P(IMG(ref, tam.cx, tam.cy, rec.legendas[ref]), { jc: 'center', after: 30, keepNext: true }), T(rec.legendas[ref], { jc: 'center' }, { color: CINZA, sz: 15 })],
            { w: wc, borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 80, b: 80, l: 60, r: 60 }, vAlign: 'top' }));
        }
        linhas.push(TR(cel, false, { naoQuebrar: true }));
      }
      b.push(TBL([wc, wc, wc], linhas));
    }
    // etapas
    b.push(secao('Etapas da instalação'));
    b.push(tabela([{ t: '#', w: 600, jc: 'center' }, { t: 'Etapa', w: 4760 }, { t: 'Previsto', w: 1300, jc: 'center' }, { t: 'Concluída em', w: 1400, jc: 'center' }, { t: 'Situação', w: 1300, jc: 'center' }],
      (inst.etapas || []).map(function (e, i) {
        const ok = e.status === 'concluida';
        return [String(i + 1), e.titulo || '', U.dataBR(e.previsto) || '—', U.dataBR(e.concluidoEm) || '—',
          { t: ok ? '✓ Concluída' : (e.status === 'andamento' ? 'Em andamento' : 'A fazer'), b: ok, color: ok ? '15803D' : (e.status === 'andamento' ? AZUL : CINZA) }];
      }), 17));
    // checklist
    const grupos = inst.checklistInstalacao || [];
    if (grupos.length) {
      b.push(secao('Checklist da instalação'));
      const linhas = [];
      grupos.forEach(function (g) {
        const feitos = (g.itens || []).filter(function (x) { return x.ok; }).length;
        linhas.push(TR([TC(P([R(g.titulo, { b: true, color: BRANCO, sz: 18 }), R(g.naoSeAplica ? '   não se aplica' : '   ' + feitos + ' de ' + (g.itens || []).length, { color: 'DBEAFE', sz: 16 })]),
          { w: 9360, span: 3, fill: AZUL, borda: { sz: 4, cor: AZUL }, mar: { t: 70, b: 70, l: 140, r: 120 } })], false, { naoQuebrar: true }));
        if (g.naoSeAplica) return;
        (g.itens || []).forEach(function (it, i) {
          const fundo = i % 2 ? 'F8FAFC' : BRANCO;
          linhas.push(TR([
            TC(T(it.ok ? '✓' : '○', { jc: 'center' }, { b: true, color: it.ok ? '15803D' : '94A3B8', sz: 20 }), { w: 600, fill: fundo, borda: { sz: 4, cor: 'E2E8F0' } }),
            TC(T(it.texto || '', null, { sz: 17, color: GRAFITE }), { w: 5760, fill: fundo, borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 50, b: 50, l: 120, r: 120 } }),
            TC(T(it.obs || '', null, { sz: 16, color: '475569', i: true }), { w: 3000, fill: fundo, borda: { sz: 4, cor: 'E2E8F0' }, mar: { t: 50, b: 50, l: 120, r: 120 } })
          ], false, { naoQuebrar: true }));
        });
      });
      b.push(TBL([600, 5760, 3000], linhas));
    }
    // dados da obra
    const dados = [['Unidade consumidora (UC)', inst.uc], ['Nº da ART', inst.art], ['Protocolo de homologação', inst.protocolo], ['Medidor bidirecional', inst.medidor], ['Ligação (início da geração)', U.dataBR(inst.ligacao)]];
    if (dados.some(function (x) { return x[1]; })) { b.push(secao('Documentos e concessionária')); b.push(pares(dados)); }
    // ordens de serviço da obra
    const O = App.Ordem;
    const ordens = (ctx.ordens || []).filter(function (o) { return o.instalacaoId === inst.id; });
    if (ordens.length && O) {
      b.push(secao('Ordens de serviço'));
      b.push(tabela([{ t: 'Nº', w: 2200 }, { t: 'Tipo', w: 3260 }, { t: 'Abertura', w: 1300, jc: 'center' }, { t: 'Situação', w: 2600, jc: 'center' }],
        ordens.map(function (o) { return [o.numero, O.rotulo(O.TIPOS, o.tipo), U.dataBR(o.data), O.rotulo(O.STATUS, o.status) + (o.concluidaEm ? ' em ' + U.dataBR(o.concluidaEm) : '')]; }), 17));
    }
    // termo e assinaturas
    const termo = N.substituir(ctx.textos.termoInstalacao || '', vars(ctx, inst.clienteNome));
    b.push(P([], { after: 160 }));
    b.push(blocoAceite('Termo de entrega e aceite', termo, assinantes(inst.assinaturas, rec, inst.clienteNome, inst.responsavel, 'Responsável técnico — ' + (emp.nomeCurto || emp.razao)), rec.imagens));
    if (ctx.textos.slogan) b.push(T(N.substituir(ctx.textos.slogan, vars(ctx, inst.clienteNome)), { top: { sz: 6, space: 4, color: DOURADO }, before: 300, jc: 'center' }, { color: AZUL, sz: 18 }));
    const cr = cabecalhoRodape(emp, rec.logo, 'Relatório de instalação' + (inst.clienteNome ? ' — ' + inst.clienteNome : ''));
    return { papel: papel, k: k, corpo: b, cabecalho: cr.cabecalho, rodape: cr.rodape, imagens: rec.imagens };
  }

  async function pdfInstalacao(inst, ctx) {
    ctx = Object.assign({}, ctx || App.Calc.contexto(), { ordens: App.Store.list('ordens') });
    const as = inst.assinaturas || {};
    const refs = { assCliente: as.cliente && as.cliente.fotoId, assTecnico: as.tecnico && as.tecnico.fotoId };
    const legendas = {};
    const pl = inst.placas || {};
    [['modulo', 'Módulos'], ['inversor', 'Inversor']].forEach(function (x) {
      const leg = (pl[x[0]] && pl[x[0]].legendas) || {};
      ((pl[x[0]] && pl[x[0]].fotos) || []).forEach(function (id, i, l) {
        const ref = 'foto' + x[0] + i;
        refs[ref] = id;
        // legenda digitada na instalação ou a padrão
        legendas[ref] = String(leg[id] || '').trim() || x[1] + (l.length > 1 ? ' — foto ' + (i + 1) : '');
      });
    });
    const rec = await carregar(ctx, refs);
    rec.legendas = legendas;
    const modelo = montarInstalacao(inst, ctx, rec);
    const out = await App.Pdf.pacote(modelo, { logo: rec.logo }, { titulo: 'Relatório de instalação — ' + (inst.clienteNome || inst.titulo || ''), assunto: 'Relatório de instalação e termo de entrega', autor: ctx.empresa.razao });
    return { blob: out.blob, nome: 'Relatorio_Instalacao_' + U.slug(inst.clienteNome || inst.titulo || 'obra') + '_' + U.todayISO().replace(/-/g, '') + '.pdf', modelo: modelo };
  }

  /* ------------------------------------------------------------ pedido de compra */

  function montarCompra(c, ctx, rec) {
    const Cp = App.Compra;
    const emp = ctx.empresa;
    const papel = papelDe(emp);
    const k = (papel.w - 2880) / 9360;
    const f = c.fornecedor || {};
    const t = Cp.totais(c);
    const itens = (c.itens || []).filter(function (it) { return String(it.descricao || '').trim(); });
    const st = Cp.SITUACOES.find(function (s) { return s.id === c.situacao; }) || Cp.SITUACOES[0];
    const corSt = { ok: '15803D', azul: AZUL, cinza: '475569', erro: 'DC2626' };
    const obra = c.instalacaoId ? (ctx.instalacoes || []).find(function (x) { return x.id === c.instalacaoId; }) : null;
    const b = [];
    b.push(faixa('PEDIDO DE COMPRA', c.numero + '  ·  emitido em ' + U.dataBR(c.data), [
      ['Situação:', st.label, corSt[st.cor]], ['Itens:', String(itens.length), AZUL], ['Total:', U.brl(t.total), AZUL]
    ]));
    b.push(secao('Fornecedor'));
    b.push(pares([
      ['Fornecedor', f.nome], ['CNPJ', f.cnpj], ['Telefone', f.telefone], ['Cidade', f.cidade],
      ['Vendedor / contato', c.vendedor], ['Orçamento / pedido do fornecedor', c.docFornecedor]
    ]));
    b.push(secao('Comprador'));
    b.push(pares([
      ['Empresa', emp.razaoSocial || emp.razao], ['CNPJ', emp.cnpj],
      ['Endereço', [emp.endereco, emp.bairro].filter(Boolean).join(', ')], ['Cidade / UF', [emp.cidade, emp.uf].filter(Boolean).join(' / ')],
      ['Telefone / WhatsApp', emp.telefone], ['E-mail', emp.email],
      ['Responsável pela compra', emp.responsavel], obra ? ['Obra de destino', obra.titulo || obra.clienteNome] : null
    ]));
    if (c.condicao || c.prazoEntrega) {
      b.push(secao('Condições'));
      b.push(pares([['Condição de pagamento', c.condicao], ['Prazo de entrega', c.prazoEntrega]]));
    }
    b.push(secao('Itens do pedido'));
    b.push(tabela([{ t: '#', w: 480, jc: 'center' }, { t: 'Código', w: 1000 }, { t: 'Descrição', w: 3980 }, { t: 'Un.', w: 560, jc: 'center' },
      { t: 'Qtd.', w: 760, jc: 'right' }, { t: 'Preço unit.', w: 1240, jc: 'right' }, { t: 'Total', w: 1340, jc: 'right' }],
      itens.map(function (it, i) {
        return [String(i + 1), it.codigo || '—', (it.descricao || '') + (it.marca ? ' — ' + it.marca : ''), it.unidade || 'un',
          U.fmtSmart(U.numOr(it.qtd, 0), 3), U.brl(U.numOr(it.preco, 0)), { t: U.brl(Cp.totalItem(it)), b: true }];
      }), 16));
    // totais à direita
    const linhaTot = function (rot, val, forte) {
      return TR([
        TC(P([]), { w: 5600, semBorda: true }),
        TC(T(rot, { jc: 'right' }, { color: forte ? BRANCO : CINZA, sz: forte ? 19 : 17, b: !!forte }), { w: 2260, fill: forte ? AZUL : 'F8FAFC', borda: { sz: 4, cor: forte ? AZUL : 'E2E8F0' }, mar: { t: 60, b: 60, l: 120, r: 120 } }),
        TC(T(val, { jc: 'right' }, { color: forte ? BRANCO : GRAFITE, sz: forte ? 21 : 18, b: true }), { w: 1500, fill: forte ? AZUL : BRANCO, borda: { sz: 4, cor: forte ? AZUL : 'E2E8F0' }, mar: { t: 60, b: 60, l: 120, r: 120 } })
      ], false, { naoQuebrar: true });
    };
    const tot = [linhaTot('Soma dos itens', U.brl(t.itens))];
    if (t.desconto) tot.push(linhaTot('Desconto', '− ' + U.brl(t.desconto)));
    if (t.frete) tot.push(linhaTot('Frete', U.brl(t.frete)));
    if (t.outras) tot.push(linhaTot('Outras despesas', U.brl(t.outras)));
    tot.push(linhaTot('Total do pedido', U.brl(t.total), true));
    b.push(P([], { after: 80 }));
    b.push(TBL([5600, 2260, 1500], tot, { manterJunto: true }));
    if (String(c.observacoes || '').trim()) {
      b.push(secao('Observações'));
      b.push(quadro(c.observacoes));
    }
    const termo = 'Favor confirmar o recebimento deste pedido, o prazo de entrega e emitir a nota fiscal em nome de ' + (emp.razaoSocial || emp.razao) +
      (emp.cnpj ? ' (CNPJ ' + emp.cnpj + ')' : '') + ', com o número ' + c.numero + ' na observação.';
    b.push(P([], { after: 160 }));
    b.push(blocoAceite('Autorização', termo, [
      { nome: emp.responsavel || emp.razao, papel: 'Comprador — ' + (emp.nomeCurto || emp.razao) },
      { nome: f.nome || ' ', papel: 'Fornecedor — de acordo' }
    ], rec.imagens));
    const cr = cabecalhoRodape(emp, rec.logo, 'Pedido de compra ' + c.numero);
    return { papel: papel, k: k, corpo: b, cabecalho: cr.cabecalho, rodape: cr.rodape, imagens: rec.imagens };
  }

  async function pdfCompra(c, ctx) {
    ctx = Object.assign({}, ctx || App.Calc.contexto(), { instalacoes: App.Store.list('instalacoes') });
    const rec = await carregar(ctx, {});
    const modelo = montarCompra(c, ctx, rec);
    const forn = (c.fornecedor && c.fornecedor.nome) || '';
    const out = await App.Pdf.pacote(modelo, { logo: rec.logo }, { titulo: 'Pedido de compra ' + c.numero + (forn ? ' — ' + forn : ''), assunto: 'Pedido de compra', autor: ctx.empresa.razao });
    return { blob: out.blob, nome: 'Pedido_' + c.numero + (forn ? '_' + U.slug(forn) : '') + '.pdf', modelo: modelo };
  }

  App.Relatorios = { montarOS: montarOS, pdfOS: pdfOS, montarInstalacao: montarInstalacao, pdfInstalacao: pdfInstalacao, montarCompra: montarCompra, pdfCompra: pdfCompra };
})(window.App);
