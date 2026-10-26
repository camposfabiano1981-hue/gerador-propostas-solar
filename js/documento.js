/*
 * Conteúdo da proposta como modelo de documento (parágrafos, tabelas e imagens), no layout do modelo GE.
 * O mesmo modelo é convertido em Word (js/docx.js) e em PDF (js/pdf.js), garantindo conteúdo idêntico nos dois formatos.
 *
 * Unidades seguem o WordprocessingML: espaçamentos e larguras em twips (1/20 pt, base 9.360 = largura útil do modelo),
 * tamanhos de fonte em meios-pontos (sz), bordas em oitavos de ponto e imagens em EMU.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const C = App.Calc;

  const COR = {
    AZUL: '1E3A8A', DOURADO: 'F59E0B', CINZA: '6B7280', GRAFITE: '374151',
    ZEBRA: 'EFF6FF', BRANCO: 'FFFFFF', DESTAQUE: 'DBEAFE', VERDE: '166534', VERMELHO: 'DC2626'
  };
  const AZUL = COR.AZUL, DOURADO = COR.DOURADO, CINZA = COR.CINZA, GRAFITE = COR.GRAFITE;
  const ZEBRA = COR.ZEBRA, BRANCO = COR.BRANCO, DESTAQUE = COR.DESTAQUE, VERDE = COR.VERDE, VERMELHO = COR.VERMELHO;

  /* ------------------------------------------------------------ nós do modelo */

  function lista(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function R(texto, ro) { return { tipo: 'r', texto: texto == null ? '' : String(texto), ro: ro || {} }; }
  function P(filhos, po) { return { tipo: 'p', po: po || {}, filhos: lista(filhos) }; }
  function T(texto, po, ro) { return P([R(texto, ro)], po); }
  function vazio() { return P([], { after: 100 }); }
  function IMG(ref, cx, cy, nome) { return { tipo: 'img', ref: ref, cx: cx, cy: cy, nome: nome }; }
  function TC(filhos, o) { return { tipo: 'tc', o: o || {}, filhos: lista(filhos) }; }
  function TR(celulas, cabecalho, o) { return { tipo: 'tr', cabecalho: !!cabecalho, celulas: celulas, naoQuebrar: !!(o && o.naoQuebrar) }; }
  /** o: {jc: 'center' (tabela centralizada na página), manterJunto (a tabela inteira na mesma página)} */
  function TBL(larguras, linhas, o) {
    o = o || {};
    return { tipo: 'tbl', larguras: larguras, linhas: linhas, jc: o.jc || null, manterJunto: !!o.manterJunto };
  }

  function alinhar(jc) { return jc && jc !== 'left' ? { jc: jc } : null; }

  /**
   * Tabela de dados no padrão do modelo.
   * colunas: [{t, w, jc}] — cabeçalho azul, texto branco em negrito
   * linhas: [[cel, ...]] onde cel = string | {t, b, color, sz, jc, fill}; linha.fundo = cor de fundo da linha inteira
   * o: {sz, semCabecalho}
   */
  function tabela(colunas, linhas, o) {
    o = o || {};
    const rows = [];
    if (!o.semCabecalho) {
      rows.push(TR(colunas.map(function (c) {
        return TC(T(c.t, alinhar(c.jc), { b: true, color: BRANCO }), { w: c.w, fill: c.fill || AZUL });
      }), true));
    }
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      rows.push(TR(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const col = colunas[j] || {};
        const jc = c.jc || col.jc;
        const ro = { b: c.b, color: c.color, sz: c.sz || o.sz, i: c.i };
        const conteudo = c.t === '' || c.t == null ? P([], alinhar(jc)) : T(c.t, alinhar(jc), ro);
        // atenção: não usar "lin.fill" (Array.prototype.fill) para a cor da linha
        return TC(conteudo, { w: col.w, fill: c.fill || lin.fundo || fill });
      })));
    });
    return TBL(colunas.map(function (c) { return c.w; }), rows);
  }

  /** Tabela chave/valor (1ª coluna em negrito; cabeçalho opcional). */
  function kv(larguras, linhas, cabecalho) {
    const cols = [{ t: cabecalho ? cabecalho[0] : '', w: larguras[0] }, { t: cabecalho ? cabecalho[1] : '', w: larguras[1] }];
    const lin = linhas.map(function (l) {
      const v = typeof l[1] === 'object' && l[1] !== null ? l[1] : { t: l[1] };
      return [{ t: l[0], b: true }, v];
    });
    return tabela(cols, lin, { semCabecalho: !cabecalho });
  }

  /** Tabela cujo cabeçalho é centralizado e as linhas seguem o alinhamento de cada coluna. */
  function tabelaCabecalhoCentral(cols, linhas, sz) {
    const rows = [TR(cols.map(function (c) {
      return TC(T(c.t, { jc: 'center' }, { b: true, color: BRANCO }), { w: c.w, fill: AZUL });
    }), true)];
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      rows.push(TR(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const jc = c.jc || cols[j].jc;
        return TC(T(c.t, alinhar(jc), { b: c.b, color: c.color, sz: sz }), { w: cols[j].w, fill: fill });
      })));
    });
    return TBL(cols.map(function (c) { return c.w; }), rows);
  }

  function titulo(texto) {
    return T(texto, { keepNext: true, bottom: { sz: 8, space: 2, color: AZUL }, before: 300, after: 120 }, { b: true, color: AZUL, sz: 28 });
  }

  function encaixar(wImg, hImg, maxW, maxH) {
    const r = wImg / hImg;
    let cx = maxW, cy = Math.round(maxW / r);
    if (cy > maxH) { cy = maxH; cx = Math.round(maxH * r); }
    return { cx: cx, cy: cy };
  }

  /** Nº de casas decimais significativas (até 4) — tarifas como 0,9762 mantêm as 4 casas. */
  function decimais(v) {
    for (let d = 0; d <= 4; d++) if (Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-9) return d;
    return 4;
  }

  function substituir(texto, vars) {
    return String(texto || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  /* ------------------------------------------------------------ montagem */

  /**
   * Monta o modelo do documento.
   * @param logo {w, h} dimensões do logotipo em pixels (para manter a proporção)
   * @returns {{papel, k, corpo, cabecalho, rodape}}
   */
  function montar(p, r, ctx, cliente, logo) {
    const emp = ctx.empresa;
    const textos = Object.assign({}, ctx.textos, p.textos || {});
    const prem = r.premissas;
    const papel = emp.papel === 'a4' ? { w: 11906, h: 16838 } : { w: 12240, h: 15840 };
    const k = (papel.w - 2880) / 9360;
    const hib = r.hibridoAtivo && r.hibrido;
    const arm = r.armazenamentoAtivo ? r.hibrido : null;
    const cen = r.cen;
    const temArm = !!(arm && cen && cen.n > 0);
    const temFV = r.incluiFV && r.kwp > 0;
    const conc = r.concessionaria ? r.concessionaria.nome : '';
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const cidadeUF = [r.cidade, r.uf].filter(Boolean).join(' / ');
    const inv = temFV ? r.inversor : null, mod = temFV ? r.modulo : null;
    const bat = arm ? arm.bateria : null;
    const s = r.simultaneidade;
    const H = r.fin.horizonte;
    const tf = r.tarifas;
    const tou = r.modalidade.id !== 'conv';
    const grupoA = r.grupo === 'A';
    const regraMaior = prem.regraDisponibilidade !== 'disponibilidade';
    // investimento detalhado (kit, infraestrutura, mão de obra…) ou só o valor final cheio
    const detalhar = (p.valorNaProposta || emp.valorNaProposta) !== 'total';
    let sec = 0;
    const projetos = r.projetos || [];
    // a seção de projetos realizados (quando houver) desloca o dimensionamento para o item 4
    const imagens = {};

    const vars = {
      empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/'),
      registroTipo: emp.registroTipo || '', registro: emp.registro || '', concessionaria: conc || 'concessionária',
      inversor: inv ? inv.fabricante : '', modulo: mod ? mod.fabricante : '', bateria: bat ? bat.fabricante : '',
      fdg: U.fmt(r.fdg, 3), fdgIcone: r.fdgOk ? '✅' : '⚠️', cliente: nomeCliente, cidade: r.cidade || ''
    };
    vars.fdi = vars.fdg; vars.fdiIcone = vars.fdgIcone; // marcadores antigos em textos personalizados
    const t = function (x) { return substituir(x, vars); };
    const rs = function (v) { return 'R$' + U.fmt(v, Math.max(2, decimais(v))); };

    const b = [];

    /* ---------- CAPA */
    const lc = encaixar(logo.w, logo.h, 3048000, 1638300);
    b.push(P(IMG('logo', lc.cx, lc.cy, 'Logotipo'), { before: 500, after: 360, jc: 'center' }));
    b.push(P([], { bottom: { sz: 12, space: 2, color: AZUL }, after: 360 }));
    b.push(vazio(), vazio());
    b.push(T('PROPOSTA COMERCIAL', { after: 100, jc: 'center' }, { b: true, color: AZUL, sz: 44 }));
    const tipoNome = r.bessAtivo
      ? (temFV ? 'Sistema Fotovoltaico + Armazenamento (BESS)' : 'Sistema de Armazenamento de Energia (BESS)')
      : 'Sistema Fotovoltaico ' + (hib ? 'Híbrido' : 'On-Grid');
    const subt = tipoNome + ' — ' + [temFV ? U.kwp(r.kwp) + ' kWp' : '', temArm ? U.fmtSmart(arm.capInstalada, 2) + ' kWh' : ''].filter(Boolean).join(' + ');
    b.push(T(subt, { after: 80, jc: 'center' }, { color: GRAFITE, sz: 28 }));
    b.push(vazio(), vazio());
    b.push(T(nomeCliente, { after: 80, jc: 'center' }, { b: true, color: AZUL, sz: 36 }));
    b.push(T(cidadeUF, { after: 80, jc: 'center' }, { color: CINZA, sz: 26 }));
    b.push(vazio(), vazio(), vazio());
    const capaCel = function (txt, cab, negrito) {
      return TC(T(txt, { jc: 'center' }, cab ? { b: true, color: BRANCO } : { b: negrito }), { w: 3042, fill: cab ? AZUL : null });
    };
    b.push(TBL([3042, 3042], [
      TR([capaCel('Nº da Proposta', true), capaCel('Data de Emissão', true)]),
      TR([capaCel(p.numero, false, true), capaCel(U.dataBR(p.data))]),
      TR([capaCel('Validade', true), capaCel('Tecnologia', true)]),
      TR([capaCel((p.validadeDias || emp.validadeDias) + ' dias'), capaCel(r.tecnologia)])
    ], { jc: 'center' }));
    b.push(vazio(), vazio(), vazio(), vazio(), vazio(), vazio());
    b.push(T(emp.razao, { top: { sz: 6, space: 2, color: DOURADO }, after: 40, jc: 'center' }, { b: true, color: AZUL, sz: 22 }));
    const idEmp = ['CNPJ: ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : ''].filter(Boolean).join(' │ ');
    b.push(T(idEmp, { after: 40, jc: 'center' }, { color: CINZA, sz: 18 }));
    // fim da seção da capa (sem cabeçalho/rodapé)
    b.push(T([emp.cidade, U.UF_NOMES[emp.uf] || emp.uf].filter(Boolean).join(' — '), { jc: 'center', sectPr: 'capa' }, { color: CINZA, sz: 18 }));

    /* ---------- 1. APRESENTAÇÃO */
    b.push(titulo((++sec) + '. APRESENTAÇÃO DA EMPRESA'));
    b.push(T(t(textos.apresentacao), { after: 80 }));
    b.push(vazio());

    /* ---------- PROJETOS REALIZADOS (portfólio: 2 fotos + ficha técnica por obra) */
    if (projetos.length) {
      b.push(titulo((++sec) + '. PROJETOS REALIZADOS'));
      if (textos.projetosIntro) b.push(T(t(textos.projetosIntro), { after: 60 }, { color: GRAFITE }));
      const rotSeg = {}, rotTipo = {};
      App.DEFAULTS.SEGMENTOS.forEach(function (x) { rotSeg[x.id] = x.label; });
      App.DEFAULTS.TIPOS_PROJETO.forEach(function (x) { rotTipo[x.id] = x.label; });
      const wFoto = Math.round(4500 * k * 635); // EMU (1 twip = 635 EMU), dentro da célula de 4.680
      projetos.forEach(function (pr, i) {
        const refs = ['proj' + (i + 1) + 'a', 'proj' + (i + 1) + 'b'];
        imagens[refs[0]] = pr.foto1.dataURL;
        imagens[refs[1]] = pr.foto2.dataURL;
        const local = [pr.cidade, pr.uf].filter(Boolean).join('/');
        const sub = [rotSeg[pr.segmento], rotTipo[pr.tipoSistema] ? 'Sistema ' + rotTipo[pr.tipoSistema] : '', pr.conclusao ? 'concluído em ' + pr.conclusao : '']
          .filter(Boolean).join(' · ');
        b.push(T(pr.titulo + (local ? ' — ' + local : ''), { keepNext: true, before: i ? 280 : 120, after: 20 }, { b: true, color: AZUL, sz: 22 }));
        if (sub) b.push(T(sub, { keepNext: true, after: 60 }, { color: CINZA, sz: 18 }));
        const foto = function (ref, f) {
          const cy = Math.round(wFoto * (f.w && f.h ? f.h / f.w : 0.75));
          return TC(P(IMG(ref, wFoto, cy, 'Foto do projeto ' + (i + 1)), { jc: 'center', keepNext: true }),
            { w: 4680, span: 2, semBorda: true, mar: { t: 40, b: 40, l: 60, r: 60 } });
        };
        const kwpP = U.num(pr.potenciaKwp), ger = U.num(pr.geracaoMes), eco = U.num(pr.economiaMes), red = U.num(pr.reducaoPct);
        const ficha = [];
        if (kwpP > 0) ficha.push(['Potência instalada', U.kwp(kwpP) + ' kWp']);
        if (ger > 0) ficha.push(['Geração média', U.fmt(ger, 0) + ' kWh/mês']);
        if (pr.modulos) ficha.push(['Módulos', pr.modulos]);
        if (pr.inversor) ficha.push(['Inversor', pr.inversor]);
        if (pr.armazenamento) ficha.push(['Armazenamento', pr.armazenamento]);
        if (pr.estrutura) ficha.push(['Estrutura', pr.estrutura]);
        if (eco > 0) ficha.push(['Economia média', U.brl(eco) + '/mês']);
        if (red > 0) ficha.push(['Redução da conta', U.fmtSmart(red, 1) + '%']);
        if (ger > 0) ficha.push(['CO₂ evitado', U.fmtSmart(ger * 12 * prem.fatorCO2 / 1000, 1) + ' t/ano']);
        const linhasP = [TR([foto(refs[0], pr.foto1), foto(refs[1], pr.foto2)], false, { naoQuebrar: true })];
        const nLin = Math.ceil(ficha.length / 2);
        for (let j = 0; j < nLin; j++) {
          // keepNext nas linhas que não são a última: o Word mantém o cartão inteiro na mesma página
          const po = j < nLin - 1 ? { keepNext: true } : null;
          const fill = j % 2 === 0 ? ZEBRA : BRANCO;
          const cel = [];
          [ficha[2 * j], ficha[2 * j + 1]].forEach(function (d) {
            cel.push(TC(d ? T(d[0], po, { b: true, sz: 18 }) : P([], po), { w: 2100, fill: fill }),
              TC(d ? T(d[1], po, { sz: 18 }) : P([], po), { w: 2580, fill: fill }));
          });
          linhasP.push(TR(cel, false, { naoQuebrar: true }));
        }
        b.push(TBL([2100, 2580, 2100, 2580], linhasP, { manterJunto: true }));
        if (pr.descricao) b.push(T(pr.descricao, { before: 40, after: 40 }, { i: true, color: GRAFITE, sz: 18 }));
      });
      b.push(vazio());
    }

    /* ---------- PASSO A PASSO (cronograma de execução em linha do tempo ilustrada) */
    const etapas = (textos.cronograma || []).filter(function (c) { return c && (c.etapa || c.prazo); })
      .map(function (c) { return { etapa: t(c.etapa), prazo: t(c.prazo) }; });
    if (etapas.length) {
      b.push(titulo((++sec) + '. PASSO A PASSO'));
      if (textos.passoIntro) b.push(T(t(textos.passoIntro), { keepNext: true, after: 100 }, { color: GRAFITE }));
      const pa = App.Passos.imagem(etapas);
      imagens.passos = pa.dataURL;
      const tp = encaixar(1000, Math.round(1000 * pa.proporcao), Math.round(5943600 * k), Math.round(7600000 * k));
      b.push(P(IMG('passos', tp.cx, tp.cy, 'Passo a passo do projeto'), { after: 120, jc: 'center' }));
      b.push(vazio());
    }

    /* ---------- DADOS DO CLIENTE */
    b.push(titulo((++sec) + '. DADOS DO CLIENTE E DO PROJETO'));
    const ligTxt = C.LIG_LABEL[r.ligacao] + (p.ligacaoConfirmar ? ' (premissa a confirmar)' : '');
    const dados = [['Cliente', nomeCliente]];
    if (cliente && cliente.documento) dados.push(['CPF / CNPJ', cliente.documento]);
    const endereco = p.enderecoInstalacao || (cliente ? [cliente.endereco, cliente.numero, cliente.bairro].filter(Boolean).join(', ') : '');
    if (endereco) dados.push(['Endereço de Instalação', endereco]);
    const cp = r.consumoPostos;
    const consumoTxt = U.fmt(r.consumoMedio, 0) + ' kWh/mês' + (tou
      ? ' (ponta ' + U.fmt(cp.p, 0) + (r.modalidade.id === 'branca' ? ' / intermediário ' + U.fmt(cp.i, 0) : '') + ' / fora de ponta ' + U.fmt(cp.fp, 0) + ')'
      : (p.consumoModo === 'mensal' ? ' (média de 12 meses)' : ''));
    dados.push(['Cidade / UF', cidadeUF], ['Concessionária', conc]);
    if (grupoA) {
      const d = r.demanda || {};
      dados.push(
        ['Grupo / Subgrupo', 'A — ' + r.subgrupo],
        ['Modalidade Tarifária', r.modalidade.label],
        ['Tensão de Fornecimento', p.tensao || ''],
        ['Demanda Contratada', r.modalidade.id === 'verde'
          ? U.fmtSmart(d.contr, 1) + ' kW' + (d.med && d.med !== d.contr ? ' (máxima medida ' + U.fmtSmart(d.med, 1) + ' kW)' : '')
          : 'Ponta ' + U.fmtSmart(d.contrP, 1) + ' kW / Fora de ponta ' + U.fmtSmart(d.contrFP, 1) + ' kW'],
        ['Consumo Médio Mensal', consumoTxt]
      );
    } else {
      dados.push(['Classe de Consumo', r.classe]);
      if (tou) dados.push(['Modalidade Tarifária', r.modalidade.label]);
      dados.push(
        ['Tipo de Ligação', ligTxt],
        ['Tensão de Atendimento', p.tensao || ''],
        ['Consumo Médio Mensal', consumoTxt],
        ['Custo de Disponibilidade', U.fmt(r.disponibilidade, 0) + ' kWh/mês (' + C.LIG_ADJ[r.ligacao].replace('ásica', 'ásico') + ')']
      );
    }
    dados.push(['COSIP (iluminação pública)', U.brl(r.cosip) + '/mês — não compensável']);
    if (temFV) dados.push(['Tipo de Telhado', [p.telhado, p.telhadoDetalhe].filter(Boolean).join(' — ')]);
    dados.push(['Nº da Proposta', p.numero], ['Data de Emissão', U.dataBR(p.data)], ['Validade', (p.validadeDias || emp.validadeDias) + ' dias']);
    b.push(kv([3000, 6360], dados));
    b.push(vazio());

    /* ---------- ARMAZENAMENTO */
    if (temArm) {
      const backupCen = cen.id === 'backup';
      b.push(titulo((++sec) + '. ARMAZENAMENTO DE ENERGIA' + (backupCen && arm.cargas.length ? ' E CARGAS CRÍTICAS' : (r.bessAtivo ? ' (BESS)' : ''))));
      let txt;
      if (backupCen) {
        txt = 'O sistema ' + (hib ? 'híbrido' : 'de armazenamento') + ' mantém as cargas críticas abaixo em funcionamento durante interrupções no fornecimento' +
          (conc ? ' da ' + conc : '') + ', utilizando o ' + (r.bessAtivo ? 'BESS' : 'banco de baterias') + (temFV ? ' e a geração fotovoltaica.' : '.');
      } else if (cen.id === 'ponta') {
        txt = tou
          ? 'O armazenamento carrega fora do horário de ponta' + (temFV ? ' (preferencialmente com o excedente solar)' : '') + ' e descarrega nos dias úteis durante a ponta (' +
            U.fmtSmart(prem.armazenamento.duracaoPonta, 1) + ' h), quando a energia custa ' + rs(tf.ponta) + '/kWh contra ' + rs(tf.fp) + '/kWh fora de ponta.'
          : 'Fora dos períodos de falta, as baterias armazenam a energia excedente do dia para uso noturno, reduzindo a energia injetada na rede' +
            (arm.cargas.length ? ', e mantêm reservados ' + U.fmtSmart(arm.reservaUtil, 2) + ' kWh para as cargas críticas em caso de falta de energia.' : '.');
      } else {
        const kw = cen.fin.reducaoKW1;
        txt = 'O armazenamento corta os picos de demanda em até ' + U.fmtSmart(kw, 1) + ' kW, reduzindo a demanda faturada' +
          (r.cenariosConfig.picos.readequar !== false ? ' e permitindo readequar a demanda contratada' : '') + ', além de evitar multas de ultrapassagem.';
      }
      // a ciclagem na tarifa convencional já menciona a reserva para as cargas críticas
      if (!backupCen && arm.cargas.length && !(cen.id === 'ponta' && !tou)) txt += ' Em caso de falta de energia, o sistema também pode alimentar as cargas críticas listadas.';
      b.push(T(txt, { after: 80 }, { color: GRAFITE }));
      b.push(vazio());
      if (arm.cargas.length) {
        const cargasCols = [{ t: 'Carga crítica', w: 3560 }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Potência (W)', w: 1500, jc: 'right' },
          { t: 'Uso no backup (h)', w: 1500, jc: 'center' }, { t: 'Energia (Wh)', w: 2000, jc: 'right' }];
        const cargasLin = arm.cargas.map(function (c) {
          return [c.descricao + (c.motor ? ' (motor)' : ''), U.fmtSmart(c.qtd, 2), U.fmt(c.potTotal, 0), U.fmtSmart(c.horas, 1), U.fmt(c.energia, 0)];
        });
        const tot = [{ t: 'Total', b: true }, '', { t: U.fmt(arm.potCargas, 0), b: true }, '', { t: U.fmt(arm.energiaBackup, 0), b: true }];
        tot.fundo = DESTAQUE;
        cargasLin.push(tot);
        b.push(tabela(cargasCols, cargasLin, { sz: 19 }));
        b.push(vazio());
      }
      // resumo para o cliente; os parâmetros técnicos do banco ficam no painel da proposta
      const resumoArm = [];
      if (bat) {
        resumoArm.push((r.bessAtivo ? 'Sistema de armazenamento: ' : 'Banco de baterias: ') + cen.n + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') +
          ' — ' + U.fmtSmart(arm.capInstalada, 2) + ' kWh (' + U.fmtSmart(arm.capUtil, 2) + ' kWh úteis).');
      }
      if (arm.cargas.length && arm.autonomiaEstimada != null) resumoArm.push('Autonomia estimada de ≈ ' + U.fmtSmart(arm.autonomiaEstimada, 1) + ' h com as cargas listadas.');
      if (cen.fin.reducaoKW1) resumoArm.push('Redução de demanda de ' + U.fmtSmart(cen.fin.reducaoKW1, 1) + ' kW.');
      if (resumoArm.length) b.push(T('🔋 ' + resumoArm.join(' '), { left: { sz: 12, space: 4, color: AZUL }, shd: DESTAQUE, after: 80 }, { color: AZUL }));
      b.push(vazio());
    }

    /* ---------- COMPARATIVO DE CENÁRIOS */
    if (r.comparar) {
      const av = r.cenariosAvaliados;
      const rec = r.recomendacao;
      b.push(titulo((++sec) + '. COMPARATIVO DE CENÁRIOS'));
      b.push(T(t(textos.cenariosIntro), { after: 80 }, { color: GRAFITE }));
      b.push(vazio());
      const wL = 2360;
      const wC = Math.floor((9360 - wL) / av.length);
      const cols = [{ t: 'Indicador', w: 9360 - wC * av.length }].concat(av.map(function (c) {
        const ehRec = rec && rec.id === c.id;
        return { t: c.nome + (ehRec ? ' ✅' : ''), w: wC, jc: 'center', fill: ehRec ? VERDE : null };
      }));
      const linha = function (rot, fn, negrito) {
        return [{ t: rot, b: true }].concat(av.map(function (c) {
          const ehRec = rec && rec.id === c.id;
          return { t: fn(c), jc: 'center', b: negrito || ehRec, color: ehRec ? VERDE : null, fill: ehRec ? 'DCFCE7' : null };
        }));
      };
      const tirTxt = function (f) { return f.tir != null ? U.fmt(f.tir * 100, 1) + '% a.a.' : (f.tirAcima ? '> 1.000% a.a.' : '—'); };
      const lin = [
        linha('Sistema FV', function (c) { return c.incluirFV && r.kwp ? U.kwp(r.kwp) + ' kWp' : '—'; }),
        linha('Armazenamento', function (c) { return c.n ? U.fmtSmart(c.capInstalada, 2) + ' kWh / ' + U.fmtSmart(c.potencia, 1) + ' kW' : '—'; }),
        linha('Investimento', function (c) { return U.brl(c.investimento); }, true),
        linha('Benefício no ano 1', function (c) { return U.brl(c.fin.beneficioAno1); }),
        linha('Payback simples', function (c) { return U.anosMeses(c.fin.paybackSimples); }),
        linha('Payback descontado', function (c) { return U.anosMeses(c.fin.paybackDescontado); }),
        linha('VPL ' + H + ' anos', function (c) { return U.brl(c.fin.vpl); }, true),
        linha('TIR', function (c) { return tirTxt(c.fin); }),
        linha('Autonomia em falta de energia', function (c) { return c.metricas && c.metricas.autonomiaH ? '≈ ' + U.fmtSmart(c.metricas.autonomiaH, 1) + ' h' : '—'; }),
        linha('Redução de demanda', function (c) { return c.fin.reducaoKW1 ? U.fmtSmart(c.fin.reducaoKW1, 1) + ' kW' : '—'; }),
        linha('Energia deslocada (ano 1)', function (c) { return c.fin.kwhDeslocadosAno1 ? U.fmt(c.fin.kwhDeslocadosAno1, 0) + ' kWh' : '—'; })
      ];
      b.push(tabela(cols, lin, { sz: 18 }));
      b.push(vazio());
      if (rec) {
        b.push(P([R('✅ Recomendação: ' + rec.nome, { b: true, color: VERDE, sz: 22 }),
          R('\n' + rec.motivos.map(function (m) { return '• ' + m; }).join('\n'), { color: '14532D', sz: 19 })],
        { left: { sz: 18, space: 6, color: '16A34A' }, shd: 'F0FDF4', after: 80 }));
      }
      const outros = r.cenarios.filter(function (c) { return c.ativo && !c.aplicavel; });
      if (outros.length) {
        b.push(T('Cenários não aplicáveis: ' + outros.map(function (c) { return c.nome + ' — ' + c.motivoNA; }).join(' | '), { after: 80 }, { color: CINZA, sz: 18 }));
      }
      b.push(T(rec && cen && rec.id !== cen.id
        ? 'Por opção do cliente, as seções seguintes detalham o cenário "' + cen.nome + '".'
        : 'As seções seguintes detalham o cenário recomendado.', { after: 80 }, { color: GRAFITE, sz: 18 }));
      b.push(vazio());
    }

    /* ---------- CONSUMO × GERAÇÃO */
    if (temFV) {
      b.push(titulo((++sec) + '. CONSUMO × GERAÇÃO MENSAL ESTIMADA'));
      b.push(P(IMG('grafico', Math.round(5524500 * k), Math.round(5524500 * 772 / 1800 * k), 'Grafico'), { after: 120, jc: 'center' }));
      b.push(vazio());
    }

    /* ---------- ANÁLISE FINANCEIRA */
    const f = r.fin;
    b.push(titulo((++sec) + '. ANÁLISE FINANCEIRA' + (r.comparar && cen ? ' — ' + cen.nome.toUpperCase() : '')));
    const adj = C.LIG_ADJ[r.ligacao];
    const prems = [];
    if (temFV) {
      prems.push('Simultaneidade ' + U.fmtSmart(s * 100, 1) + '% autoconsumo / ' + U.fmtSmart((1 - s) * 100, 1) + '% injetado',
        'Fio B: ' + C.fioBTexto(r.anoBase, prem, ', '),
        'TUSD Fio B R$' + U.fmt(r.tusdFioB, Math.max(2, decimais(r.tusdFioB))) + '/kWh');
    }
    if (!tou) prems.push('Tarifa ' + rs(r.tarifa) + '/kWh');
    else {
      prems.push('Tarifas: ponta ' + rs(tf.ponta) + (r.modalidade.id === 'branca' ? ' | intermediária ' + rs(tf.inter) : '') + ' | fora de ponta ' + rs(tf.fp) + '/kWh');
      if (r.modalidade.id === 'verde') prems.push('Demanda ' + rs(tf.dem) + '/kW');
      if (r.modalidade.id === 'azul') prems.push('Demanda ponta ' + rs(tf.demP) + ' | fora de ponta ' + rs(tf.demFP) + '/kW');
    }
    prems.push('Inflação tarifária ' + U.fmtSmart(prem.inflacaoTarifa * 100, 2) + '% a.a.');
    if (temFV) prems.push('Degradação módulos ' + U.fmtSmart(r.degradacaoModulos * 100, 2) + '% a.a.' + (r.degradacaoDatasheet ? ' (datasheet)' : ''));
    prems.push('TMA (' + (prem.tmaNome || 'SELIC') + ') ' + U.fmt(prem.tma * 100, 2) + '% a.a.');
    if (!grupoA) prems.push('Disponibilidade ' + adj + ' ' + U.fmt(r.disponibilidade, 0) + ' kWh/mês');
    prems.push('COSIP ' + U.brl(r.cosip) + '/mês' + (prem.reajusteCosip > 0 ? ' (reajuste ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.)' : ''));
    prems.push('Consumo ' + U.fmt(r.consumoMedio, 0) + ' kWh/mês');
    if (temArm) {
      const ar = prem.armazenamento;
      if (cen.id === 'ponta' && !tou) prems.push('Baterias: ciclagem diária de ' + U.fmtSmart(arm.capUtil * arm.eficiencia, 2) + ' kWh');
      prems.push('Armazenamento: eficiência ' + U.fmtSmart(arm.eficiencia * 100, 0) + '%, DoD ' + U.fmtSmart(arm.dod * 100, 0) + '%, degradação ' +
        U.fmtSmart(ar.degradacao * 100, 1) + '% a.a.' + (cen.id !== 'backup' && tou ? ', ' + ar.diasUteis + ' dias úteis/ano' : ''));
    }
    b.push(T('📌 Premissas: ' + prems.join(' │ '), { left: { sz: 12, space: 4, color: AZUL }, shd: DESTAQUE, after: 80 }, { color: AZUL, sz: 18 }));
    b.push(vazio());
    const destaque = function (v) { return { t: v, b: true, color: AZUL, jc: 'right' }; };
    const sub = function (v) { return { t: v, jc: 'right' }; };
    const finLin = [[{ t: '💰 Investimento Total (CAPEX)', b: true }, destaque(U.brl(r.total))]];
    if (detalhar) {
      if (r.incluiFV) {
        finLin.push(['   ↳ Kit Fotovoltaico (módulos, inversor' + (hib ? ' híbrido' : '') + ', estrutura, cabos e conectores)', sub(U.brl(r.kit))]);
      }
      if (temArm) {
        finLin.push(['   ↳ Armazenamento — ' + (r.bessAtivo ? 'BESS' : 'baterias') + ' (equipamento)', sub(U.brl(r.kitArm))],
          ['   ↳ Instalação e integração do armazenamento', sub(U.brl(r.instalArm))]);
      }
      if (r.incluiFV && r.infra > 0) finLin.push(['   ↳ Infraestrutura Elétrica CA (DPS, disjuntores, aterramento)', sub(U.brl(r.infra))]);
      if (r.incluiFV) finLin.push(['   ↳ Mão de Obra + Projeto + Instalação + Homologação', sub(U.brl(r.maoObra))]);
      if (r.incluiFV && r.outros > 0) finLin.push(['   ↳ ' + r.outrosDescricao, sub(U.brl(r.outros))]);
    }
    finLin.push(
      [{ t: '📅 Economia Mensal Ano 1', b: true }, destaque(U.brl(f.economiaMes1))],
      [{ t: '📅 Economia Anual Ano 1', b: true }, destaque(U.brl(f.economiaAno1))]
    );
    if (f.anos[0].beneficioBackup > 0) finLin.push([{ t: '🔋 Benefício de backup (prejuízos evitados/ano)', b: true }, destaque(U.brl(f.anos[0].beneficioBackup))]);
    finLin.push(
      [{ t: '⏱ Payback Simples', b: true }, destaque(U.anosMeses(f.paybackSimples))],
      [{ t: '⏱ Payback Descontado (' + (prem.tmaNome || 'SELIC') + ' ' + U.fmt(prem.tma * 100, 2) + '% a.a.)', b: true }, destaque(U.anosMeses(f.paybackDescontado))],
      [{ t: '📈 VPL ' + H + ' anos', b: true }, destaque(U.brl(f.vpl))],
      [{ t: '📈 TIR', b: true }, destaque(f.tir != null ? U.fmt(f.tir * 100, 2) + '% a.a.' : (f.tirAcima ? 'acima de 1.000% a.a.' : '—'))]
    );
    if (temFV) finLin.push([{ t: '🌿 CO₂ Evitado em ' + H + ' anos', b: true }, destaque(U.fmt(f.co2t, 1) + ' toneladas')]);
    finLin.push([{ t: '💵 Economia Total Acumulada ' + H + ' anos', b: true }, destaque(U.brl(f.economiaTotal))]);
    if (r.trocaBateria && r.trocaBateria.custo > 0) {
      finLin.push([{ t: '🔋 Substituição ' + (r.bessAtivo ? 'do BESS' : 'das baterias') + ' (ano ' + r.trocaBateria.ano + ')', b: true }, destaque(U.brl(r.trocaBateria.custo))]);
    }
    b.push(tabela([{ t: 'Indicador', w: 4200 }, { t: 'Valor', w: 5160 }], finLin));
    b.push(vazio());

    /* ---------- PROJEÇÃO DA CONTA */
    b.push(titulo((++sec) + '. PROJEÇÃO DA CONTA' + (temFV ? ' COM FIO B (LEI 14.300/2022)' : ' DE ENERGIA')));
    if (temFV) {
      const pct0 = C.pctFioB(r.anoBase, prem);
      const pctFim = prem.fioBDepois == null ? 1 : prem.fioBDepois;
      let ano100 = null;
      for (let a = r.anoBase; a <= r.anoBase + 30; a++) { if (C.pctFioB(a, prem) >= pctFim) { ano100 = a; break; } }
      const pctFinal = U.fmtSmart(pctFim * 100, 1) + '%';
      const cron = pct0 < pctFim && ano100
        ? 'O percentual sobe de ' + U.fmtSmart(pct0 * 100, 1) + '% em ' + r.anoBase + ' até ' + pctFinal + ' a partir de ' + ano100 + '.'
        : 'Em ' + r.anoBase + ' o Fio B já é cobrado em ' + U.fmtSmart(pct0 * 100, 1) + '%.';
      b.push(T('A Lei 14.300/2022 estabelece cronograma gradual de cobrança do Fio B sobre a energia compensada — a energia injetada na rede (' +
        U.fmtSmart((1 - s) * 100, 1) + '% do total gerado, conforme simultaneidade de ' + U.fmtSmart(s * 100, 1) +
        '%) e depois consumida da rede; o autoconsumo simultâneo não paga Fio B. ' + cron +
        (temArm && cen.id === 'ponta' && !tou ? ' Com a ciclagem diária das baterias, parte do excedente é armazenada e consumida no local, reduzindo a energia injetada.' : '') +
        (tou ? ' Os créditos compensam primeiro o consumo fora de ponta; o saldo é aplicado ao consumo de ponta, valorado pela tarifa fora de ponta.' : '') +
        ' A COSIP (Contribuição para Custeio da Iluminação Pública) de ' + U.brl(r.cosip) + '/mês não é compensável por geração própria e permanece em ambos os cenários' +
        (prem.reajusteCosip > 0 ? ', com reajuste projetado de ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.' : '.'),
        { after: 80 }, { color: GRAFITE }));
    } else {
      b.push(T('Projeção da fatura mensal média com e sem o sistema de armazenamento, considerando a inflação tarifária de ' +
        U.fmtSmart(prem.inflacaoTarifa * 100, 2) + '% a.a. e a degradação do armazenamento.', { after: 80 }, { color: GRAFITE }));
    }
    b.push(vazio());
    let projCols, projLin;
    if (grupoA) {
      projCols = [{ t: 'Ano', w: 640, jc: 'center' }, { t: '% Fio B', w: 640, jc: 'center' }, { t: 'Conta s/ Sistema', w: 1500, jc: 'right' },
        { t: 'Energia c/ Sist.', w: 1180, jc: 'right' }, { t: 'Demanda c/ Sist.', w: 1180, jc: 'right' }, { t: 'Custo Fio B', w: 1000, jc: 'right' },
        { t: 'Conta c/ Sistema', w: 1460, jc: 'right' }, { t: 'Economia/mês', w: 1760, jc: 'right' }];
      projLin = f.projecao.map(function (a) {
        return [{ t: String(a.ano), b: true, jc: 'center' }, { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' }, U.brl(a.contaSem), U.brl(a.contaMin),
          U.brl(a.demandaCom), U.brl(a.fioBMes), U.brl(a.contaCom), { t: U.brl(a.economiaMes), b: true, color: VERDE }];
      });
    } else if (temFV && regraMaior) {
      // art. 655-I: a conta com sistema é o maior valor (em negrito) entre as duas colunas, mais a COSIP
      projCols = [{ t: 'Ano', w: 640, jc: 'center' }, { t: '% Fio B', w: 640, jc: 'center' }, { t: 'Conta s/ Sistema', w: 1500, jc: 'right' },
        { t: 'Custo Disponib.', w: 1080, jc: 'right' }, { t: 'Energia + Fio B', w: 1080, jc: 'right' }, { t: 'COSIP', w: 900, jc: 'right' },
        { t: 'Conta c/ Sistema', w: 1560, jc: 'right' }, { t: 'Economia/mês', w: 1960, jc: 'right' }];
      projLin = f.projecao.map(function (a) {
        return [{ t: String(a.ano), b: true, jc: 'center' }, { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' }, U.brl(a.contaSem),
          { t: U.brl(a.custoDisp), b: a.minimo }, { t: U.brl(a.energiaGD), b: !a.minimo }, U.brl(a.cosip), U.brl(a.contaCom), { t: U.brl(a.economiaMes), b: true, color: VERDE }];
      });
    } else {
      projCols = [{ t: 'Ano', w: 640, jc: 'center' }, { t: '% Fio B', w: 640, jc: 'center' }, { t: 'Conta s/ Sistema', w: 1500, jc: 'right' },
        { t: tou ? 'Energia c/ Sist.' : 'Disponib. Mín.', w: 1080, jc: 'right' }, { t: 'Custo Fio B', w: 1080, jc: 'right' }, { t: 'COSIP', w: 900, jc: 'right' },
        { t: 'Conta c/ Sistema', w: 1560, jc: 'right' }, { t: 'Economia/mês', w: 1960, jc: 'right' }];
      projLin = f.projecao.map(function (a) {
        return [{ t: String(a.ano), b: true, jc: 'center' }, { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' }, U.brl(a.contaSem), U.brl(a.contaMin),
          U.brl(a.fioBMes), U.brl(a.cosip), U.brl(a.contaCom), { t: U.brl(a.economiaMes), b: true, color: VERDE }];
      });
    }
    b.push(tabelaCabecalhoCentral(projCols, projLin, 19));
    const cmes = r.contasMes;
    if (cmes && cmes.max - cmes.min > 0.5) {
      b.push(T('📆 A tabela mostra a média mensal. No ano ' + r.anoBase + ', conforme a geração de cada mês (créditos transportados entre os meses), a conta com sistema varia de ' +
        U.brl(cmes.min) + ' (' + C.MESES_CURTOS[cmes.mesMin] + ') a ' + U.brl(cmes.max) + ' (' + C.MESES_CURTOS[cmes.mesMax] + ').', { after: 60 }, { color: GRAFITE, sz: 18 }));
    }
    if (grupoA) {
      b.push(T('⚠ Valores mensais médios com impostos. Demanda faturada = maior valor entre contratada e medida; ultrapassagem acima de ' +
        U.fmtSmart(prem.armazenamento.toleranciaUltrapassagem * 100, 1) + '% cobrada em ' + U.fmtSmart(prem.armazenamento.fatorUltrapassagem, 1) + '×. ' +
        'COSIP de ' + U.brl(r.cosip) + '/mês incluída nas contas.' + (temFV ? ' Cronograma Fio B: ' + C.fioBTexto(r.anoBase, prem, ' | ') + '.' : ''),
      { after: 80 }, { color: CINZA, sz: 18 }));
    } else {
      const regraTxt = !temFV
        ? 'Disponibilidade mínima ' + adj + ': ' + U.fmt(r.disponibilidade, 0) + ' kWh/mês. '
        : (regraMaior
          ? 'Conta com sistema = maior valor entre o custo de disponibilidade (' + U.fmt(r.disponibilidade, 0) + ' kWh/mês, ligação ' + adj +
            ') e a energia não compensada + Fio B sobre a energia compensada (REN ANEEL 1.000/2021, art. 655-I) — os dois não se somam; o maior valor está em negrito. '
          : 'Disponibilidade mínima ' + adj + ': ' + U.fmt(r.disponibilidade, 0) + ' kWh/mês faturados pela tarifa; o Fio B incide sobre o restante da energia compensada. ') +
          'O Fio B não incide sobre o autoconsumo simultâneo (' + U.fmtSmart(s * 100, 1) + '%). ';
      b.push(T('⚠ ' + regraTxt + 'COSIP de ' + U.brl(r.cosip) + '/mês não compensável (' +
        (prem.reajusteCosip > 0 ? 'reajuste projetado de ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.' : 'valor nominal, sujeito a reajuste municipal') +
        '). Cronograma Fio B: ' + C.fioBTexto(r.anoBase, prem, ' | ') + '.', { after: 80 }, { color: CINZA, sz: 18 }));
    }
    b.push(vazio());

    /* ---------- FLUXO DE CAIXA */
    // economia anual = conta anual sem sistema − conta anual com sistema (que já inclui disponibilidade/energia não compensada, Fio B e COSIP)
    b.push(titulo((++sec) + '. FLUXO DE CAIXA — ' + H + ' ANOS'));
    const ajustes = f.anos.some(function (a) { return a.beneficioBackup > 0 || a.extra > 0; });
    const fcCols = ajustes
      ? [{ t: 'Ano', w: 600, jc: 'center' }, { t: temFV ? 'Geração (kWh)' : 'Energia desloc. (kWh)', w: 1100, jc: 'right' },
        { t: 'Conta anual sem sistema', w: 1500, jc: 'right' }, { t: 'Conta anual com sistema', w: 1500, jc: 'right' },
        { t: 'Economia anual', w: 1400, jc: 'right' }, { t: temArm ? 'Backup / troca de baterias' : 'Ajustes', w: 1260, jc: 'right' },
        { t: 'Fluxo acumulado', w: 2000, jc: 'right' }]
      : [{ t: 'Ano', w: 640, jc: 'center' }, { t: temFV ? 'Geração (kWh)' : 'Energia desloc. (kWh)', w: 1240, jc: 'right' },
        { t: 'Conta anual sem sistema', w: 1700, jc: 'right' }, { t: 'Conta anual com sistema', w: 1700, jc: 'right' },
        { t: 'Economia anual', w: 1640, jc: 'right' }, { t: 'Fluxo acumulado', w: 2440, jc: 'right' }];
    const linha0 = [{ t: '0', b: true, jc: 'center' }, '—', '—', '—', { t: 'Investimento', b: true }];
    if (ajustes) linha0.push('—');
    linha0.push({ t: U.brl(-r.total), b: true, color: VERMELHO });
    const fcLin = [linha0].concat(f.anos.map(function (a) {
      const lin = [{ t: String(a.ano), b: true, jc: 'center' }, U.fmt(temFV ? a.geracao : a.descarga, 0), U.brl(a.contaSem * 12), U.brl(a.contaCom * 12),
        { t: U.brl(a.economiaMes * 12), color: VERDE }];
      if (ajustes) { const aj = a.beneficioBackup - a.extra; lin.push(aj ? { t: U.brl(aj), color: aj < 0 ? VERMELHO : VERDE } : '—'); }
      lin.push({ t: U.brl(a.acumulado), b: true, color: a.acumulado < 0 ? VERMELHO : VERDE });
      return lin;
    }));
    b.push(tabelaCabecalhoCentral(fcCols, fcLin, 18));
    b.push(T('Economia anual = conta anual sem sistema − conta anual com sistema; a conta com sistema já inclui ' +
      (temFV ? (grupoA ? 'a energia não compensada, a demanda, o Fio B' : 'o custo de disponibilidade ou a energia não compensada, o Fio B') : 'a energia e a demanda') +
      ' e a COSIP. O fluxo acumulado parte do investimento de ' + U.brl(r.total) + ' no ano 0' +
      (ajustes ? ' e soma o benefício de backup' + (r.trocaBateria && r.trocaBateria.custo > 0 ? ', descontando a substituição ' + (r.bessAtivo ? 'do BESS' : 'das baterias') + ' (' + U.brl(r.trocaBateria.custo) + ' no ano ' + (r.anoBase + r.trocaBateria.ano - 1) + ')' : '') : '') +
      '. Valores com inflação tarifária de ' + U.fmtSmart(prem.inflacaoTarifa * 100, 2) + '% a.a.' + (temFV ? ' e degradação dos módulos de ' + U.fmtSmart(r.degradacaoModulos * 100, 2) + '% a.a.' : '') + '.',
    { after: 80 }, { color: CINZA, sz: 18 }));
    b.push(vazio());

    /* ---------- PAGAMENTO */
    b.push(titulo((++sec) + '. OPÇÕES DE PAGAMENTO'));
    const pgCols = [{ t: 'Modalidade', w: 3600 }, { t: 'Prazo', w: 1200, jc: 'center' }, { t: 'Parcela (R$)', w: 2280, jc: 'right' }, { t: 'Total Pago (R$)', w: 2280, jc: 'right' }];
    b.push(tabela(pgCols, r.pagamentos.map(function (pg) {
      return [pg.label, pg.prazo, U.brl(pg.parcela), { t: U.brl(pg.total), b: true }];
    })));
    b.push(T(textos.notaPagamento, { after: 80 }, { color: CINZA, sz: 18 }));
    if (p.condicoesObs) b.push(T('Observações: ' + p.condicoesObs, { after: 80 }, { color: GRAFITE, sz: 19 }));
    b.push(vazio());

    /* ---------- EQUIPAMENTOS */
    b.push(titulo((++sec) + '. LISTA DE EQUIPAMENTOS E MATERIAIS'));
    const eqCols = [{ t: '#', w: 500, jc: 'center' }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Descrição', w: 4900 }, { t: 'Garantia', w: 3160 }];
    const eqLin = r.itens.map(function (it, i) {
      return [String(i + 1), C.qtdTxt(it), it.descricao, it.garantia || ''];
    });
    if (r.incluiFV && r.infra > 0) {
      eqLin.push([{ t: '—', b: true }, '', { t: '── INFRAESTRUTURA ELÉTRICA (CA, PROTEÇÕES, ATERRAMENTO) ──', b: true }, '']);
      eqLin.push([String(r.itens.length + 1), '—', (p.infraDescricao || textos.infraDescricao) + (detalhar ? ' — ' + U.brl(r.infra) : ''), 'Conf. fabricante']);
    }
    b.push(tabela(eqCols, eqLin, { sz: 19 }));
    if (textos.garantiaInstalacao) {
      b.push(T('Garantia da instalação (' + (emp.nomeCurto || emp.razao) + '): ' + t(textos.garantiaInstalacao) + '. Equipamentos com a garantia do fabricante indicada na lista.',
        { before: 60, after: 80 }, { color: GRAFITE, sz: 18 }));
    }
    b.push(vazio());

    /* ---------- SERVIÇOS */
    b.push(titulo((++sec) + '. SERVIÇOS INCLUSOS E NÃO INCLUSOS'));
    const extraInc = hib ? textos.inclusosHibrido || [] : (r.bessAtivo ? textos.inclusosBess || [] : []);
    const extraNinc = hib ? textos.naoInclusosHibrido || [] : (r.bessAtivo ? textos.naoInclusosBess || [] : []);
    const inc = (textos.inclusos || []).concat(extraInc).map(t).filter(Boolean);
    const ninc = (textos.naoInclusos || []).concat(extraNinc).map(t).filter(Boolean);
    b.push(TBL([4680, 4680], [
      TR([TC(T('✅ Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL }), TC(T('❌ Não Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL })], true),
      TR([TC(T(inc.join('\n')), { w: 4680, fill: ZEBRA, vAlign: 'top' }), TC(T(ninc.join('\n')), { w: 4680, fill: BRANCO, vAlign: 'top' })])
    ]));
    b.push(vazio());

    /* ---------- RESPONSÁVEL TÉCNICO */
    b.push(titulo((++sec) + '. RESPONSÁVEL TÉCNICO'));
    b.push(vazio());
    const centro = { after: 80, jc: 'center' };
    const linhaAss = { top: { sz: 4, space: 0, color: '000000' }, before: 400, jc: 'center' };
    const colEmp = [
      T(String(emp.razao).toUpperCase(), centro, { b: true, color: AZUL, sz: 22 }),
      T('CNPJ: ' + emp.cnpj, centro),
      emp.registro ? T(emp.registroTipo + ' ' + emp.registro, centro) : null,
      T(emp.responsavel || '', linhaAss),
      T(emp.cargo || 'Responsável Técnico', { jc: 'center' }, { color: CINZA, sz: 18 })
    ].filter(Boolean);
    const colCli = [
      T('CLIENTE', centro, { b: true, color: AZUL, sz: 22 }),
      T(nomeCliente, centro),
      T(cidadeUF, centro, { color: CINZA }),
      T(nomeCliente, linhaAss),
      T('Contratante', { jc: 'center' }, { color: CINZA, sz: 18 })
    ];
    b.push(TBL([4680, 4680], [TR([TC(colEmp, { w: 4680, simples: true }), TC(colCli, { w: 4680, simples: true })])]));
    b.push(vazio(), vazio());
    b.push(T(t(textos.slogan), { top: { sz: 6, space: 4, color: DOURADO }, before: 100, jc: 'center' }, { color: AZUL }));

    /* ---------- cabeçalho e rodapé */
    const hl = encaixar(logo.w, logo.h, 1238250, 666750);
    const cabTexto = nomeCliente + '  |  ' + p.numero + '  |  ' + r.resumoCabecalho;
    const cabecalho = [
      TBL([3600, 5760], [TR([
        TC(P(IMG('logo', hl.cx, hl.cy, 'Logotipo')), { w: 3600, semBorda: true }),
        TC(T(cabTexto, { jc: 'right' }, { color: CINZA, sz: 16 }), { w: 5760, semBorda: true, vAlign: 'bottom' })
      ])]),
      P([], { bottom: { sz: 8, space: 2, color: AZUL } })
    ];
    const rodTexto = [emp.razao, 'CNPJ ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : '', [emp.cidade, emp.uf].filter(Boolean).join('/')]
      .filter(Boolean).join('  │  ');
    const rodape = [T(rodTexto, { top: { sz: 6, space: 2, color: AZUL }, before: 80, jc: 'center' }, { color: CINZA, sz: 16 })];

    return { papel: papel, k: k, corpo: b, cabecalho: cabecalho, rodape: rodape, imagens: imagens };
  }

  /* ------------------------------------------------------------ recursos compartilhados */

  /** Logotipo em JPEG/PNG (bytes + dataURL) com dimensões, convertendo outros formatos para PNG. */
  async function prepararLogo(dataURL) {
    const src = dataURL || App.LOGO_PADRAO;
    const img = await U.loadImage(src);
    const mime = (String(src).match(/^data:([^;,]+)/) || [])[1] || '';
    let url = src, ext;
    if (mime === 'image/jpeg' || mime === 'image/png') {
      ext = mime === 'image/png' ? 'png' : 'jpg';
    } else {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth || 600;
      cv.height = img.naturalHeight || 300;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      url = cv.toDataURL('image/png');
      ext = 'png';
    }
    return { dataURL: url, bytes: U.dataURLtoBytes(url), ext: ext, w: img.naturalWidth || 1400, h: img.naturalHeight || 752 };
  }

  /** Gráfico de produção da proposta: o mesmo do contrato, com o consumo médio (ou mês a mês, quando varia). */
  function dadosGrafico(r, ctx) {
    const prem = r.premissas || ctx.premissas;
    return App.Chart.dadosProducao({
      kwp: r.kwp, meses: C.producaoMensal(r), consumo: r.consumoMeses, rotuloConsumo: 'Consumo Médio',
      subtitulo: C.descricaoSistema(r, prem), pr: prem.pr * 100
    });
  }

  /** Calcula a proposta e reúne tudo o que os geradores precisam. */
  async function preparar(p, ctx) {
    ctx = ctx || C.contexto();
    const r = C.calcular(p, ctx);
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === p.clienteId; }) || p.clienteSnapshot || null;
    const logo = await prepararLogo(ctx.empresa.logo);
    const grafico = r.permiteFV && r.kwp > 0 ? App.Chart.producaoDataURL(dadosGrafico(r, ctx)) : null;
    const modelo = montar(p, r, ctx, cliente, logo);
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const nomeBase = 'Proposta_Solar_' + U.slug(nomeCliente) + '_' + String(p.data || U.todayISO()).replace(/-/g, '');
    return { ctx: ctx, r: r, cliente: cliente, nomeCliente: nomeCliente, logo: logo, grafico: grafico, modelo: modelo, nomeBase: nomeBase };
  }

  App.Documento = {
    montar: montar, preparar: preparar, prepararLogo: prepararLogo, dadosGrafico: dadosGrafico, COR: COR,
    // construtores de nós reaproveitados pelos demais documentos (contrato e proposta avulsa)
    nos: {
      R: R, P: P, T: T, IMG: IMG, TC: TC, TR: TR, TBL: TBL, encaixar: encaixar, substituir: substituir, decimais: decimais,
      tabela: tabela, kv: kv, titulo: titulo, vazio: vazio
    }
  };
})(window.App);
