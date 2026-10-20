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
  function TR(celulas, cabecalho) { return { tipo: 'tr', cabecalho: !!cabecalho, celulas: celulas }; }
  function TBL(larguras, linhas) { return { tipo: 'tbl', larguras: larguras, linhas: linhas }; }

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
    let sec = 0;
    const secDimNum = 3;

    const vars = {
      empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/'),
      registroTipo: emp.registroTipo || '', registro: emp.registro || '', concessionaria: conc || 'concessionária',
      inversor: inv ? inv.fabricante : '', modulo: mod ? mod.fabricante : '', bateria: bat ? bat.fabricante : '',
      fdi: U.fmt(r.fdi, 3), fdiIcone: r.fdiOk ? '✅' : '⚠️', secDim: String(secDimNum), cliente: nomeCliente, cidade: r.cidade || ''
    };
    const t = function (x) { return substituir(x, vars); };
    const rs = function (v) { return 'R$' + U.fmt(v, Math.max(2, decimais(v))); };
    const nomeArm = r.bessAtivo ? 'BESS' : 'baterias';

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
    ]));
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

    /* ---------- 2. DADOS DO CLIENTE */
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

    /* ---------- 3. DIMENSIONAMENTO */
    b.push(titulo((++sec) + '. DIMENSIONAMENTO TÉCNICO'));
    const u = r.unidadeArm;
    const linhaArm = temArm && bat ? cen.n + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') + ' — ' +
      U.fmtSmart(arm.capInstalada, 2) + ' kWh' + (arm.potenciaArm ? ' / ' + U.fmtSmart(arm.potenciaArm, 2) + ' kW' : '') + (bat.quimica ? ' (' + bat.quimica + ')' : '') : '—';
    const dim = [];
    if (temFV) {
      const ef = mod && mod.eficiencia ? 'Ef. ' + U.fmtSmart(mod.eficiencia, 2) + '%' : '';
      const modExtra = [ef, mod && mod.detalhe ? String(mod.detalhe).toLowerCase() : ''].filter(Boolean).join(', ');
      dim.push(
        ['Potência Total do Sistema', U.kwp(r.kwp) + ' kWp'],
        ['Módulos Fotovoltaicos', mod ? r.nModulos + ' módulos × ' + mod.potencia + ' Wp — ' + [mod.fabricante, mod.tecnologia, mod.modelo].filter(Boolean).join(' ') + (modExtra ? ' (' + modExtra + ')' : '') : '—'],
        [hib ? 'Inversor Híbrido' : 'Inversor', inv ? r.nInversores + ' × ' + [inv.fabricante, inv.modelo].filter(Boolean).join(' ') + ' — ' + C.specInversor(inv) : '—']
      );
      if (temArm) dim.push([r.bessAtivo ? 'Armazenamento (BESS)' : 'Banco de Baterias', linhaArm]);
      dim.push(
        ['FDI (fator dimensional)', U.fmt(r.fdi, 3) + (r.fdiOk ? ' ✅ — dentro da faixa recomendada (' + U.fmt(prem.fdiMin, 2) + '–' + U.fmt(prem.fdiMax, 2) + ')' : ' ⚠️ — ver alerta técnico abaixo')],
        ['Estrutura de Fixação', r.estruturaTexto || '—'],
        ['Geração Mensal Estimada', U.fmt(r.geracaoMensal, 0) + ' kWh/mês'],
        ['Geração Anual Estimada (Ano 1)', U.fmt(r.geracaoAnual, 0) + ' kWh/ano'],
        ['Cobertura do Consumo', U.fmt(r.cobertura * 100, 1) + '% do consumo médio (' + U.fmt(r.consumoMedio, 0) + ' kWh/mês) ' + (r.cobertura >= 0.95 ? '✅' : '⚠️')],
        ['Área Ocupada Aproximada', '~' + U.fmt(r.area, 0) + ' m² (' + r.nModulos + ' mód × ' + U.fmtSmart(r.areaModulo, 2) + ' m²)'],
        ['HSP ' + [r.cidade, r.uf].filter(Boolean).join('/') + (r.localidade && r.localidade.fonte ? ' (' + r.localidade.fonte + ')' : ''), U.fmtSmart(r.hsp, 2) + ' kWh/m²/dia'],
        ['Performance Ratio (PR)', U.fmt(prem.pr, 2)],
        ['Simultaneidade Adotada', U.fmtSmart(s * 100, 1) + '% autoconsumo direto / ' + U.fmtSmart((1 - s) * 100, 1) + '% injetado na rede' +
          (temArm && cen.id === 'ponta' ? ' (+ armazenamento diário nas baterias)' : '')],
        ['Monitoramento', r.monitoramento]
      );
    } else {
      dim.push(
        ['Armazenamento (BESS)', linhaArm],
        ['Capacidade Útil', temArm ? U.fmtSmart(arm.capUtil, 2) + ' kWh (DoD ' + U.fmtSmart(arm.dod * 100, 0) + '%)' : '—'],
        ['Eficiência de Ciclo', temArm ? U.fmtSmart(arm.eficiencia * 100, 1) + '%' : '—'],
        ['Estratégia de Operação', cen ? cen.nome : '—'],
        ['Recarga', 'Pela rede da concessionária, fora do horário de ponta']
      );
    }
    b.push(kv([3800, 5560], dim, ['Parâmetro', 'Valor']));
    b.push(vazio());
    if (temFV && !r.fdiOk && inv) {
      const msg = '⚠ Alerta técnico: FDI ' + U.fmt(r.fdi, 3) + ' (potência do inversor ÷ potência FV) fora da faixa recomendada (' +
        U.fmt(prem.fdiMin, 2) + '–' + U.fmt(prem.fdiMax, 2) + '). ' +
        (r.fdi < prem.fdiMin
          ? 'O inversor (' + U.fmtSmart(r.potInversores, 2) + ' kW) é menor que o gerador FV (' + U.kwp(r.kwp) + ' kWp) e poderá limitar a potência nos horários de maior irradiação (clipping); a geração real pode ficar ligeiramente abaixo da estimada.'
          : 'O inversor (' + U.fmtSmart(r.potInversores, 2) + ' kW) está superdimensionado em relação ao gerador FV (' + U.kwp(r.kwp) + ' kWp), elevando o custo sem ganho de geração.');
      b.push(T(msg, { after: 80 }, { color: VERMELHO, sz: 18 }));
    } else {
      b.push(vazio());
    }

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
          : 'Fora dos períodos de falta, as baterias armazenam a energia excedente do dia para uso noturno, reduzindo a energia injetada na rede e o custo do Fio B.';
      } else {
        const kw = cen.fin.reducaoKW1;
        txt = 'O armazenamento corta os picos de demanda em até ' + U.fmtSmart(kw, 1) + ' kW, reduzindo a demanda faturada' +
          (r.cenariosConfig.picos.readequar !== false ? ' e permitindo readequar a demanda contratada' : '') + ', além de evitar multas de ultrapassagem.';
      }
      if (!backupCen && arm.cargas.length) txt += ' Em caso de falta de energia, o sistema também pode alimentar as cargas críticas listadas.';
      b.push(T(txt, { after: 80 }, { color: GRAFITE }));
      b.push(vazio());
      if (arm.cargas.length) {
        const cargasCols = [{ t: 'Carga crítica', w: 3560 }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Potência (W)', w: 1500, jc: 'right' },
          { t: 'Uso no backup (h)', w: 1500, jc: 'center' }, { t: 'Energia (Wh)', w: 2000, jc: 'right' }];
        const cargasLin = arm.cargas.map(function (c) {
          return [c.descricao, U.fmtSmart(c.qtd, 2), U.fmt(c.potTotal, 0), U.fmtSmart(c.horas, 1), U.fmt(c.energia, 0)];
        });
        const tot = [{ t: 'Total', b: true }, '', { t: U.fmt(arm.potCargas, 0), b: true }, '', { t: U.fmt(arm.energiaBackup, 0), b: true }];
        tot.fundo = DESTAQUE;
        cargasLin.push(tot);
        b.push(tabela(cargasCols, cargasLin, { sz: 19 }));
        b.push(vazio());
      }
      const fs = prem.hibrido.fatorSegurancaInversor;
      const linhas = [];
      if (arm.cargas.length) {
        linhas.push(
          ['Potência das Cargas Críticas', U.fmtSmart(arm.potCargas / 1000, 2) + ' kW'],
          ['Energia Necessária no Backup', U.fmtSmart(arm.energiaBackup / 1000, 2) + ' kWh'],
          ['Autonomia Desejada', U.fmtSmart(arm.autonomiaHoras, 1) + ' h'],
          ['Capacidade Necessária', U.fmtSmart(arm.capNecessaria, 2) + ' kWh (DoD ' + U.fmtSmart(arm.dod * 100, 0) + '% / eficiência ' + U.fmtSmart(arm.eficiencia * 100, 0) + '%)']
        );
      }
      linhas.push(
        [r.bessAtivo ? 'Sistema de Armazenamento' : 'Banco de Baterias', bat ? cen.n + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') + ' — ' + U.fmtSmart(bat.energia, 2) + ' kWh = ' + U.fmtSmart(arm.capInstalada, 2) + ' kWh' : '—'],
        ['Configuração', arm.configuracao || '—'],
        ['Capacidade Útil', U.fmtSmart(arm.capUtil, 2) + ' kWh (DoD ' + U.fmtSmart(arm.dod * 100, 0) + '%)']
      );
      if (arm.potenciaArm && isFinite(arm.potenciaArm)) linhas.push(['Potência de Descarga', U.fmtSmart(arm.potenciaArm, 2) + ' kW']);
      if (arm.cargas.length) {
        linhas.push(['Autonomia Estimada', arm.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(arm.autonomiaEstimada, 1) + ' h com as cargas listadas ' + (arm.autonomiaEstimada + 1e-9 >= arm.autonomiaHoras ? '✅' : '⚠️') : '—']);
        linhas.push([hib ? 'Potência de Backup do Inversor' : 'Potência de Backup', U.fmtSmart(arm.potBackup, 2) + ' kW ' + (arm.backupOk ? '✅ (≥ ' + U.fmtSmart(fs, 2) + ' × cargas críticas)' : '⚠️ (abaixo de ' + U.fmtSmart(fs, 2) + ' × cargas críticas)')]);
      }
      if (cen.fin.kwhDeslocadosAno1) linhas.push(['Energia Deslocada (ano 1)', U.fmt(cen.fin.kwhDeslocadosAno1, 0) + ' kWh/ano']);
      if (cen.fin.reducaoKW1) linhas.push(['Redução de Demanda', U.fmtSmart(cen.fin.reducaoKW1, 1) + ' kW']);
      linhas.push(['Vida Útil Estimada', U.fmtSmart(cen.vidaArmAnos, 1) + ' anos' + (r.trocaBateria ? ' (substituição prevista no ano ' + (r.anoBase + r.trocaBateria.ano - 1) + ')' : '')]);
      linhas.push(['Modo de Operação', cen.id === 'ponta' ? (tou ? 'Deslocamento para o horário de ponta (arbitragem tarifária)' : 'Backup + ciclagem diária (autoconsumo noturno)')
        : (cen.id === 'picos' ? 'Redução de picos de demanda (peak shaving)' : 'Backup (armazenamento reservado para falta de energia)')]);
      b.push(kv([3800, 5560], linhas, ['Parâmetro', 'Valor']));
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
      b.push(P(IMG('grafico', Math.round(5524500 * k), Math.round(2301875 * k), 'Grafico'), { after: 120, jc: 'center' }));
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
    if (temFV) prems.push('Degradação módulos ' + U.fmtSmart(prem.degradacao * 100, 2) + '% a.a.');
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
    if (r.incluiFV) {
      finLin.push(['   ↳ Kit Fotovoltaico (módulos, inversor' + (hib ? ' híbrido' : '') + ', estrutura, cabos e conectores)', sub(U.brl(r.kit))]);
    }
    if (temArm) {
      finLin.push(['   ↳ Armazenamento — ' + (r.bessAtivo ? 'BESS' : 'baterias') + ' (equipamento)', sub(U.brl(r.kitArm))],
        ['   ↳ Instalação e integração do armazenamento', sub(U.brl(r.instalArm))]);
    }
    if (r.incluiFV && r.infra > 0) finLin.push(['   ↳ Infraestrutura Elétrica CA (DPS, disjuntores, aterramento)', sub(U.brl(r.infra))]);
    if (r.incluiFV) finLin.push(['   ↳ Mão de Obra + Projeto + Instalação + Homologação', sub(U.brl(r.maoObra))]);
    finLin.push(
      [{ t: '📅 Economia Mensal Ano 1' + (temFV ? ' (sim. ' + U.fmtSmart(s * 100, 1) + '%)' : ''), b: true }, destaque(U.brl(f.economiaMes1))],
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
      b.push(T('A Lei 14.300/2022 estabelece cronograma gradual de cobrança do Fio B sobre a energia injetada (' + U.fmtSmart((1 - s) * 100, 1) +
        '% do total gerado, conforme simultaneidade de ' + U.fmtSmart(s * 100, 1) + '%). ' + cron +
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
    if (grupoA) {
      b.push(T('⚠ Valores mensais médios com impostos. Demanda faturada = maior valor entre contratada e medida; ultrapassagem acima de ' +
        U.fmtSmart(prem.armazenamento.toleranciaUltrapassagem * 100, 1) + '% cobrada em ' + U.fmtSmart(prem.armazenamento.fatorUltrapassagem, 1) + '×. ' +
        'COSIP de ' + U.brl(r.cosip) + '/mês incluída nas contas.' + (temFV ? ' Cronograma Fio B: ' + C.fioBTexto(r.anoBase, prem, ' | ') + '.' : ''),
      { after: 80 }, { color: CINZA, sz: 18 }));
    } else {
      b.push(T('⚠ Fio B incide sobre a energia injetada (' + U.fmtSmart((1 - s) * 100, 1) + '%). Disponibilidade mínima ' + adj + ': ' +
        U.fmt(r.disponibilidade, 0) + ' kWh/mês. COSIP de ' + U.brl(r.cosip) + '/mês não compensável (' +
        (prem.reajusteCosip > 0 ? 'reajuste projetado de ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.' : 'valor nominal, sujeito a reajuste municipal') +
        '). Cronograma Fio B: ' + C.fioBTexto(r.anoBase, prem, ' | ') + '.', { after: 80 }, { color: CINZA, sz: 18 }));
    }
    b.push(vazio());

    /* ---------- FLUXO DE CAIXA */
    b.push(titulo((++sec) + '. FLUXO DE CAIXA — ' + H + ' ANOS'));
    const fcCols = [{ t: 'Ano', w: 680, jc: 'center' }, { t: temFV ? 'Geração (kWh)' : 'Energia desloc. (kWh)', w: 1100, jc: 'right' },
      { t: tou ? 'Tarifa FP (R$/kWh)' : 'Tarifa (R$/kWh)', w: 1000, jc: 'right' },
      { t: '% Fio B', w: 700, jc: 'center' }, { t: 'Econ. Bruta (R$)', w: 1300, jc: 'right' }, { t: 'Custo Fio B (R$)', w: 1200, jc: 'right' },
      { t: 'Econ. Líq. (R$)', w: 1280, jc: 'right' }, { t: 'Acumulado (R$)', w: 2100, jc: 'right' }];
    const fcLin = f.anos.map(function (a) {
      return [{ t: String(a.ano), b: true, jc: 'center' }, U.fmt(temFV ? a.geracao : a.descarga, 0), 'R$ ' + U.fmt(a.tarifa, 4), { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' },
        U.brl(a.bruta), U.brl(a.fioB), U.brl(a.liq), { t: U.brl(a.acumulado), color: a.acumulado < 0 ? VERMELHO : VERDE }];
    });
    b.push(tabelaCabecalhoCentral(fcCols, fcLin, 18));
    if (r.trocaBateria && r.trocaBateria.custo > 0) {
      b.push(T('🔋 A economia líquida do ano ' + (r.anoBase + r.trocaBateria.ano - 1) + ' já desconta a substituição ' + (r.bessAtivo ? 'do BESS' : 'do banco de baterias') + ' (' + U.brl(r.trocaBateria.custo) + ').', { after: 80 }, { color: CINZA, sz: 18 }));
    }
    b.push(vazio());

    /* ---------- PAGAMENTO */
    b.push(titulo((++sec) + '. OPÇÕES DE PAGAMENTO'));
    const pgCols = [{ t: 'Modalidade', w: 3600 }, { t: 'Prazo', w: 1200, jc: 'center' }, { t: 'Parcela (R$)', w: 2280, jc: 'right' }, { t: 'Total Pago (R$)', w: 2280, jc: 'right' }];
    b.push(tabela(pgCols, r.pagamentos.map(function (pg) {
      return [pg.label, pg.prazo, U.brl(pg.parcela), { t: U.brl(pg.total), b: true }];
    })));
    b.push(T(textos.notaPagamento, { after: 80 }, { color: CINZA, sz: 18 }));
    b.push(vazio());

    /* ---------- EQUIPAMENTOS */
    b.push(titulo((++sec) + '. LISTA DE EQUIPAMENTOS E MATERIAIS'));
    const eqCols = [{ t: '#', w: 500, jc: 'center' }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Descrição', w: 4900 }, { t: 'Garantia', w: 3160 }];
    const eqLin = r.itens.map(function (it, i) {
      return [String(i + 1), C.qtdTxt(it), it.descricao, it.garantia || ''];
    });
    if (r.incluiFV && r.infra > 0) {
      eqLin.push([{ t: '—', b: true }, '', { t: '── INFRAESTRUTURA ELÉTRICA (CA, PROTEÇÕES, ATERRAMENTO) ──', b: true }, '']);
      eqLin.push([String(r.itens.length + 1), '—', (p.infraDescricao || textos.infraDescricao) + ' — ' + U.brl(r.infra), 'Conf. fabricante']);
    }
    b.push(tabela(eqCols, eqLin, { sz: 19 }));
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

    /* ---------- CRONOGRAMA */
    b.push(titulo((++sec) + '. CRONOGRAMA DE EXECUÇÃO'));
    b.push(tabela([{ t: 'Etapa', w: 600, jc: 'center' }, { t: 'Descrição', w: 5560 }, { t: 'Prazo Estimado', w: 3200, jc: 'center' }],
      (textos.cronograma || []).map(function (c, i) { return [{ t: String(i + 1), b: true }, t(c.etapa), t(c.prazo)]; })));
    b.push(vazio());

    /* ---------- CONDIÇÕES COMERCIAIS */
    b.push(titulo((++sec) + '. CONDIÇÕES COMERCIAIS'));
    const cond = [['Valor Total da Proposta', { t: U.brl(r.total), b: true }]];
    if (r.incluiFV) cond.push([hib && temArm ? 'Kit Fotovoltaico (com inversor híbrido)' : 'Kit Fotovoltaico Completo', U.brl(r.kit)]);
    if (temArm) cond.push(['Armazenamento (' + nomeArm + ') + Instalação', U.brl(r.kitArm + r.instalArm)]);
    if (r.incluiFV && r.infra > 0) cond.push(['Infraestrutura Elétrica CA', U.brl(r.infra)]);
    if (r.incluiFV) cond.push(['Mão de Obra + Projeto + Instalação + Homologação', U.brl(r.maoObra)]);
    cond.push(['Validade da Proposta', (p.validadeDias || emp.validadeDias) + ' dias a partir da data de emissão']);
    if (mod) cond.push(['Garantia Módulos ' + mod.fabricante, C.garantiaModulo(mod)]);
    const garFab = function (e) { return U.num(e.garantia) > 0 ? e.garantia + ' anos (conforme fabricante)' : 'Conforme fabricante'; };
    if (inv) cond.push(['Garantia Inversor ' + inv.fabricante, garFab(inv)]);
    if (bat && temArm) cond.push([(r.bessAtivo ? 'Garantia BESS ' : 'Garantia Baterias ') + bat.fabricante, garFab(bat)]);
    cond.push(['Garantia Instalação ' + (emp.nomeCurto || emp.razao), textos.garantiaInstalacao]);
    if (p.condicoesObs) cond.push(['Observações', p.condicoesObs]);
    b.push(kv([3600, 5760], cond));
    b.push(vazio());

    /* ---------- CONFORMIDADE */
    b.push(titulo((++sec) + '. CONFORMIDADE LEGAL E TÉCNICA'));
    const conf = (textos.conformidade || []).concat(r.bessAtivo ? textos.conformidadeBess || [] : (hib ? textos.conformidadeHibrido || [] : []));
    b.push(kv([2800, 6560], conf.map(function (c) { return [t(c.norma), t(c.descricao)]; })));
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

    return { papel: papel, k: k, corpo: b, cabecalho: cabecalho, rodape: rodape };
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

  /** Calcula a proposta e reúne tudo o que os geradores precisam. */
  async function preparar(p, ctx) {
    ctx = ctx || C.contexto();
    const r = C.calcular(p, ctx);
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === p.clienteId; }) || p.clienteSnapshot || null;
    const logo = await prepararLogo(ctx.empresa.logo);
    const grafico = App.Chart.dataURL({
      consumo: r.consumoMeses, geracao: r.geracaoMeses,
      titulo: 'Consumo × Geração Mensal Estimada — ' + U.kwp(r.kwp) + ' kWp'
    });
    const modelo = montar(p, r, ctx, cliente, logo);
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const nomeBase = 'Proposta_Solar_' + U.slug(nomeCliente) + '_' + String(p.data || U.todayISO()).replace(/-/g, '');
    return { ctx: ctx, r: r, cliente: cliente, nomeCliente: nomeCliente, logo: logo, grafico: grafico, modelo: modelo, nomeBase: nomeBase };
  }

  App.Documento = {
    montar: montar, preparar: preparar, prepararLogo: prepararLogo, COR: COR,
    // construtores de nós reaproveitados pelos demais documentos (contrato e proposta avulsa)
    nos: {
      R: R, P: P, T: T, IMG: IMG, TC: TC, TR: TR, TBL: TBL, encaixar: encaixar, substituir: substituir, decimais: decimais,
      tabela: tabela, kv: kv, titulo: titulo, vazio: vazio
    }
  };
})(window.App);
