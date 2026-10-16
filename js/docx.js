/*
 * Geração da proposta em Word (.docx) reproduzindo o layout do modelo GE (capa, cabeçalho/rodapé,
 * títulos com filete azul, tabelas com cabeçalho #1E3A8A e linhas zebradas #EFF6FF).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const C = App.Calc;

  const AZUL = '1E3A8A', DOURADO = 'F59E0B', CINZA = '6B7280', GRAFITE = '374151';
  const ZEBRA = 'EFF6FF', BRANCO = 'FFFFFF', DESTAQUE = 'DBEAFE', VERDE = '166534', VERMELHO = 'DC2626';

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  function x(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ------------------------------------------------------------ primitivas WordprocessingML */

  function rPr(o) {
    o = o || {};
    let s = '';
    if (o.b) s += '<w:b/><w:bCs/>';
    if (o.i) s += '<w:i/><w:iCs/>';
    if (o.color) s += '<w:color w:val="' + o.color + '"/>';
    if (o.sz) s += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }

  function run(texto, o) {
    // espaço não separável após "R$" evita que o símbolo fique sozinho numa linha das tabelas estreitas
    const linhas = String(texto == null ? '' : texto).replace(/R\$ (?=-?\d)/g, 'R$ ').split('\n');
    const pr = rPr(o);
    return linhas.map(function (l, i) {
      return '<w:r>' + pr + (i > 0 ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + x(l) + '</w:t></w:r>';
    }).join('');
  }

  function borda(lado, b) {
    return '<w:' + lado + ' w:val="single" w:sz="' + b.sz + '" w:space="' + (b.space || 0) + '" w:color="' + (b.color || 'auto') + '"/>';
  }

  function pPr(o) {
    o = o || {};
    let s = '';
    if (o.keepNext) s += '<w:keepNext/>';
    if (o.top || o.bottom || o.left) {
      s += '<w:pBdr>' + (o.top ? borda('top', o.top) : '') + (o.left ? borda('left', o.left) : '') + (o.bottom ? borda('bottom', o.bottom) : '') + '</w:pBdr>';
    }
    if (o.shd) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>';
    if (o.before != null || o.after != null) {
      s += '<w:spacing' + (o.before != null ? ' w:before="' + o.before + '"' : '') + (o.after != null ? ' w:after="' + o.after + '"' : '') + '/>';
    }
    if (o.jc) s += '<w:jc w:val="' + o.jc + '"/>';
    if (o.sectPr) s += o.sectPr;
    return s ? '<w:pPr>' + s + '</w:pPr>' : '';
  }

  function P(conteudo, po) {
    return '<w:p>' + pPr(po) + (conteudo || '') + '</w:p>';
  }

  function T(texto, po, ro) {
    return P(run(texto, ro), po);
  }

  function vazio() {
    return P('', { after: 100 });
  }

  /* ------------------------------------------------------------ tabelas */

  const TBL_BORDERS = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (l) {
    return '<w:' + l + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
  }).join('') + '</w:tblBorders>';
  const TBL_CELLMAR = '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>';
  const TBL_LOOK = '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>';
  const TBL_PREX = '<w:tblPrEx><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPrEx>';
  const TC_BORDERS = '<w:tcBorders>' + ['top', 'left', 'bottom', 'right'].map(function (l) {
    return '<w:' + l + ' w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
  }).join('') + '</w:tcBorders>';
  const TC_SEM_BORDA = '<w:tcBorders>' + ['top', 'left', 'bottom', 'right'].map(function (l) {
    return '<w:' + l + ' w:val="none" w:sz="0" w:space="0" w:color="FFFFFF"/>';
  }).join('') + '</w:tcBorders>';
  const TC_MAR = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';

  function Doc(larguraUtil) {
    this.k = larguraUtil / 9360;
    this.idImg = 10;
  }

  Doc.prototype.w = function (v) { return Math.round(v * this.k); };

  Doc.prototype.tc = function (conteudo, o) {
    o = o || {};
    let pr = '<w:tcW w:w="' + this.w(o.w) + '" w:type="dxa"/>';
    if (o.span) pr += '<w:gridSpan w:val="' + o.span + '"/>';
    if (o.simples) {
      // célula "crua" (bloco de assinatura do modelo): só largura
      return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + (conteudo || '<w:p/>') + '</w:tc>';
    }
    pr += o.semBorda ? TC_SEM_BORDA : TC_BORDERS;
    if (o.fill) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>';
    if (!o.semBorda) pr += TC_MAR;
    pr += '<w:vAlign w:val="' + (o.vAlign || 'center') + '"/>';
    return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + (conteudo || '<w:p/>') + '</w:tc>';
  };

  Doc.prototype.tr = function (celulas, cabecalho) {
    return '<w:tr>' + TBL_PREX + (cabecalho ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + celulas + '</w:tr>';
  };

  Doc.prototype.tbl = function (larguras, linhas) {
    const self = this;
    const ws = larguras.map(function (v) { return self.w(v); });
    const total = ws.reduce(function (s, v) { return s + v; }, 0);
    return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/>' + TBL_BORDERS + TBL_CELLMAR + TBL_LOOK + '</w:tblPr>' +
      '<w:tblGrid>' + ws.map(function (v) { return '<w:gridCol w:w="' + v + '"/>'; }).join('') + '</w:tblGrid>' + linhas + '</w:tbl>';
  };

  /**
   * Tabela de dados no padrão do modelo.
   * colunas: [{t, w, jc}] — cabeçalho azul, texto branco em negrito
   * linhas: [[cel, ...]] onde cel = string | {t, b, color, sz, jc, fill}
   * o: {sz, semCabecalho, zebraInicio}
   */
  Doc.prototype.tabela = function (colunas, linhas, o) {
    o = o || {};
    const self = this;
    let xml = '';
    if (!o.semCabecalho) {
      xml += this.tr(colunas.map(function (c) {
        return self.tc(T(c.t, c.jc && c.jc !== 'left' ? { jc: c.jc } : null, { b: true, color: BRANCO }), { w: c.w, fill: AZUL });
      }).join(''), true);
    }
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      xml += self.tr(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const col = colunas[j] || {};
        const jc = c.jc || col.jc;
        const ro = { b: c.b, color: c.color, sz: c.sz || o.sz, i: c.i };
        const conteudo = c.t === '' || c.t == null ? P('', jc && jc !== 'left' ? { jc: jc } : null) : T(c.t, jc && jc !== 'left' ? { jc: jc } : null, ro);
        return self.tc(conteudo, { w: col.w, fill: c.fill || lin.fill || fill });
      }).join(''));
    });
    return this.tbl(colunas.map(function (c) { return c.w; }), xml);
  };

  /** Tabela chave/valor (sem cabeçalho, 1ª coluna em negrito). */
  Doc.prototype.kv = function (larguras, linhas, cabecalho) {
    const cols = [{ t: cabecalho ? cabecalho[0] : '', w: larguras[0] }, { t: cabecalho ? cabecalho[1] : '', w: larguras[1] }];
    const lin = linhas.map(function (l) {
      const v = typeof l[1] === 'object' && l[1] !== null ? l[1] : { t: l[1] };
      return [{ t: l[0], b: true }, v];
    });
    return this.tabela(cols, lin, { semCabecalho: !cabecalho });
  };

  Doc.prototype.imagem = function (rId, cx, cy, nome) {
    const id = this.idImg++;
    return '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="' + x(nome) + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="' + x(nome) + '"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rId + '"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

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

  /* ------------------------------------------------------------ logotipo */

  async function prepararLogo(dataURL) {
    const src = dataURL || App.LOGO_PADRAO;
    const img = await U.loadImage(src);
    const mime = (String(src).match(/^data:([^;,]+)/) || [])[1] || '';
    let bytes, ext;
    if (mime === 'image/jpeg' || mime === 'image/png') {
      bytes = U.dataURLtoBytes(src);
      ext = mime === 'image/png' ? 'png' : 'jpg';
    } else {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth || 600;
      cv.height = img.naturalHeight || 300;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      bytes = U.dataURLtoBytes(cv.toDataURL('image/png'));
      ext = 'png';
    }
    return { bytes: bytes, ext: ext, w: img.naturalWidth || 1400, h: img.naturalHeight || 752 };
  }

  /* ------------------------------------------------------------ documento */

  function montarDocumento(p, r, ctx, cliente, logo) {
    const emp = ctx.empresa;
    const textos = Object.assign({}, ctx.textos, p.textos || {});
    const prem = r.premissas;
    const papel = emp.papel === 'a4' ? { w: 11906, h: 16838 } : { w: 12240, h: 15840 };
    const doc = new Doc(papel.w - 2880);
    const hib = r.hibridoAtivo && r.hibrido;
    const conc = r.concessionaria ? r.concessionaria.nome : '';
    const nomeCliente = (cliente && cliente.nome) || 'Cliente';
    const cidadeUF = [r.cidade, r.uf].filter(Boolean).join(' / ');
    const inv = r.inversor, mod = r.modulo;
    const bat = hib ? hib.bateria : null;
    const s = r.simultaneidade;
    const H = r.fin.horizonte;
    let sec = 0;
    const secDimNum = 3;

    const vars = {
      empresa: emp.razao, empresaCurta: emp.nomeCurto || emp.razao, cidadeEmpresa: [emp.cidade, emp.uf].filter(Boolean).join('/'),
      registroTipo: emp.registroTipo || '', registro: emp.registro || '', concessionaria: conc || 'concessionária',
      inversor: inv ? inv.fabricante : '', modulo: mod ? mod.fabricante : '', bateria: bat ? bat.fabricante : '',
      fdi: U.fmt(r.fdi, 3), fdiIcone: r.fdiOk ? '✅' : '⚠️', secDim: String(secDimNum), cliente: nomeCliente, cidade: r.cidade || ''
    };
    const t = function (s) { return substituir(s, vars); };

    let b = '';

    /* ---------- CAPA */
    const lc = encaixar(logo.w, logo.h, 3048000, 1638300);
    b += P(doc.imagem('rIdLogo', lc.cx, lc.cy, 'Logotipo'), { before: 500, after: 360, jc: 'center' });
    b += P('', { bottom: { sz: 12, space: 2, color: AZUL }, after: 360 });
    b += vazio() + vazio();
    b += T('PROPOSTA COMERCIAL', { after: 100, jc: 'center' }, { b: true, color: AZUL, sz: 44 });
    const subt = 'Sistema Fotovoltaico ' + (hib ? 'Híbrido' : 'On-Grid') + ' — ' + U.kwp(r.kwp) + ' kWp' +
      (hib && bat ? ' + ' + U.fmtSmart(hib.capInstalada, 2) + ' kWh' : '');
    b += T(subt, { after: 80, jc: 'center' }, { color: GRAFITE, sz: 28 });
    b += vazio() + vazio();
    b += T(nomeCliente, { after: 80, jc: 'center' }, { b: true, color: AZUL, sz: 36 });
    b += T(cidadeUF, { after: 80, jc: 'center' }, { color: CINZA, sz: 26 });
    b += vazio() + vazio() + vazio();
    const capaCel = function (txt, cab, negrito) {
      return doc.tc(T(txt, { jc: 'center' }, cab ? { b: true, color: BRANCO } : { b: negrito }), { w: 3042, fill: cab ? AZUL : null });
    };
    b += doc.tbl([3042, 3042],
      doc.tr(capaCel('Nº da Proposta', true) + capaCel('Data de Emissão', true)) +
      doc.tr(capaCel(p.numero, false, true) + capaCel(U.dataBR(p.data))) +
      doc.tr(capaCel('Validade', true) + capaCel('Tecnologia', true)) +
      doc.tr(capaCel((p.validadeDias || emp.validadeDias) + ' dias') + capaCel(r.tecnologia)));
    b += vazio() + vazio() + vazio() + vazio() + vazio() + vazio();
    b += T(emp.razao, { top: { sz: 6, space: 2, color: DOURADO }, after: 40, jc: 'center' }, { b: true, color: AZUL, sz: 22 });
    const idEmp = ['CNPJ: ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : ''].filter(Boolean).join(' │ ');
    b += T(idEmp, { after: 40, jc: 'center' }, { color: CINZA, sz: 18 });
    const sect1 = '<w:sectPr><w:pgSz w:w="' + papel.w + '" w:h="' + papel.h + '"/><w:pgMar w:top="720" w:right="1440" w:bottom="720" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';
    b += T([emp.cidade, U.UF_NOMES[emp.uf] || emp.uf].filter(Boolean).join(' — '), { jc: 'center', sectPr: sect1 }, { color: CINZA, sz: 18 });

    /* ---------- 1. APRESENTAÇÃO */
    b += titulo((++sec) + '. APRESENTAÇÃO DA EMPRESA');
    b += T(t(textos.apresentacao), { after: 80 });
    b += vazio();

    /* ---------- 2. DADOS DO CLIENTE */
    b += titulo((++sec) + '. DADOS DO CLIENTE E DO PROJETO');
    const ligTxt = C.LIG_LABEL[r.ligacao] + (p.ligacaoConfirmar ? ' (premissa a confirmar)' : '');
    const dados = [['Cliente', nomeCliente]];
    if (cliente && cliente.documento) dados.push(['CPF / CNPJ', cliente.documento]);
    const endereco = p.enderecoInstalacao || (cliente ? [cliente.endereco, cliente.numero, cliente.bairro].filter(Boolean).join(', ') : '');
    if (endereco) dados.push(['Endereço de Instalação', endereco]);
    dados.push(
      ['Cidade / UF', cidadeUF],
      ['Concessionária', conc],
      ['Classe de Consumo', r.classe],
      ['Tipo de Ligação', ligTxt],
      ['Tensão de Atendimento', p.tensao || ''],
      ['Consumo Médio Mensal', U.fmt(r.consumoMedio, 0) + ' kWh/mês' + (p.consumoModo === 'mensal' ? ' (média de 12 meses)' : '')],
      ['Custo de Disponibilidade', U.fmt(r.disponibilidade, 0) + ' kWh/mês (' + C.LIG_ADJ[r.ligacao].replace('ásica', 'ásico') + ')'],
      ['COSIP (iluminação pública)', U.brl(r.cosip) + '/mês — não compensável'],
      ['Tipo de Telhado', [p.telhado, p.telhadoDetalhe].filter(Boolean).join(' — ')],
      ['Nº da Proposta', p.numero],
      ['Data de Emissão', U.dataBR(p.data)],
      ['Validade', (p.validadeDias || emp.validadeDias) + ' dias']
    );
    b += doc.kv([3000, 6360], dados);
    b += vazio();

    /* ---------- 3. DIMENSIONAMENTO */
    b += titulo((++sec) + '. DIMENSIONAMENTO TÉCNICO');
    const ef = mod && mod.eficiencia ? 'Ef. ' + U.fmtSmart(mod.eficiencia, 2) + '%' : '';
    const modExtra = [ef, mod && mod.detalhe ? String(mod.detalhe).toLowerCase() : ''].filter(Boolean).join(', ');
    const dim = [
      ['Potência Total do Sistema', U.kwp(r.kwp) + ' kWp'],
      ['Módulos Fotovoltaicos', mod ? r.nModulos + ' módulos × ' + mod.potencia + ' Wp — ' + [mod.fabricante, mod.tecnologia, mod.modelo].filter(Boolean).join(' ') + (modExtra ? ' (' + modExtra + ')' : '') : '—'],
      [hib ? 'Inversor Híbrido' : 'Inversor', inv ? r.nInversores + ' × ' + [inv.fabricante, inv.modelo].filter(Boolean).join(' ') + ' — ' + C.specInversor(inv) : '—']
    ];
    if (hib) {
      dim.push(['Banco de Baterias', bat ? hib.nBaterias + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') + ' — ' +
        U.fmtSmart(hib.capInstalada, 2) + ' kWh' + (bat.quimica ? ' (' + bat.quimica + ')' : '') : '—']);
    }
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
        (hib && hib.usoBateria === 'ciclagem' ? ' (+ armazenamento diário nas baterias)' : '')],
      ['Monitoramento', r.monitoramento]
    );
    b += doc.kv([3800, 5560], dim, ['Parâmetro', 'Valor']);
    b += vazio();
    if (!r.fdiOk && inv && r.kwp > 0) {
      const msg = '⚠ Alerta técnico: FDI ' + U.fmt(r.fdi, 3) + ' (potência do inversor ÷ potência FV) fora da faixa recomendada (' +
        U.fmt(prem.fdiMin, 2) + '–' + U.fmt(prem.fdiMax, 2) + '). ' +
        (r.fdi < prem.fdiMin
          ? 'O inversor (' + U.fmtSmart(r.potInversores, 2) + ' kW) é menor que o gerador FV (' + U.kwp(r.kwp) + ' kWp) e poderá limitar a potência nos horários de maior irradiação (clipping); a geração real pode ficar ligeiramente abaixo da estimada.'
          : 'O inversor (' + U.fmtSmart(r.potInversores, 2) + ' kW) está superdimensionado em relação ao gerador FV (' + U.kwp(r.kwp) + ' kWp), elevando o custo sem ganho de geração.');
      b += T(msg, { after: 80 }, { color: VERMELHO, sz: 18 });
    } else {
      b += vazio();
    }

    /* ---------- (Híbrido) ARMAZENAMENTO */
    if (hib) {
      b += titulo((++sec) + '. ARMAZENAMENTO DE ENERGIA E CARGAS CRÍTICAS');
      b += T('O sistema híbrido mantém as cargas críticas abaixo em funcionamento durante interrupções no fornecimento' +
        (conc ? ' da ' + conc : '') + ', utilizando o banco de baterias e a geração fotovoltaica.' +
        (hib.usoBateria === 'ciclagem' ? ' Fora dos períodos de falta, as baterias armazenam a energia excedente do dia para uso noturno, reduzindo a energia injetada na rede e o custo do Fio B.' : ''),
        { after: 80 }, { color: GRAFITE });
      b += vazio();
      const cargasCols = [{ t: 'Carga crítica', w: 3560 }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Potência (W)', w: 1500, jc: 'right' },
        { t: 'Uso no backup (h)', w: 1500, jc: 'center' }, { t: 'Energia (Wh)', w: 2000, jc: 'right' }];
      const cargasLin = hib.cargas.map(function (c) {
        return [c.descricao, U.fmtSmart(c.qtd, 2), U.fmt(c.potTotal, 0), U.fmtSmart(c.horas, 1), U.fmt(c.energia, 0)];
      });
      const tot = [{ t: 'Total', b: true }, '', { t: U.fmt(hib.potCargas, 0), b: true }, '', { t: U.fmt(hib.energiaBackup, 0), b: true }];
      tot.fill = DESTAQUE;
      cargasLin.push(tot);
      b += doc.tabela(cargasCols, cargasLin, { sz: 19 });
      b += vazio();
      const fs = prem.hibrido.fatorSegurancaInversor;
      b += doc.kv([3800, 5560], [
        ['Potência das Cargas Críticas', U.fmtSmart(hib.potCargas / 1000, 2) + ' kW'],
        ['Energia Necessária no Backup', U.fmtSmart(hib.energiaBackup / 1000, 2) + ' kWh'],
        ['Autonomia Desejada', U.fmtSmart(hib.autonomiaHoras, 1) + ' h'],
        ['Capacidade Necessária', U.fmtSmart(hib.capNecessaria, 2) + ' kWh (DoD ' + U.fmtSmart(hib.dod * 100, 0) + '% / eficiência ' + U.fmtSmart(hib.eficiencia * 100, 0) + '%)'],
        ['Banco de Baterias', bat ? hib.nBaterias + ' × ' + [bat.fabricante, bat.modelo].filter(Boolean).join(' ') + ' — ' + U.fmtSmart(bat.energia, 2) + ' kWh = ' + U.fmtSmart(hib.capInstalada, 2) + ' kWh' : '—'],
        ['Configuração do Banco', hib.configuracao || '—'],
        ['Capacidade Útil', U.fmtSmart(hib.capUtil, 2) + ' kWh (DoD ' + U.fmtSmart(hib.dod * 100, 0) + '%)'],
        ['Autonomia Estimada', hib.autonomiaEstimada != null ? '≈ ' + U.fmtSmart(hib.autonomiaEstimada, 1) + ' h com as cargas listadas ' + (hib.autonomiaEstimada + 1e-9 >= hib.autonomiaHoras ? '✅' : '⚠️') : '—'],
        ['Potência de Backup do Inversor', U.fmtSmart(hib.potBackup, 2) + ' kW ' + (hib.backupOk ? '✅ (≥ ' + U.fmtSmart(fs, 2) + ' × cargas críticas)' : '⚠️ (abaixo de ' + U.fmtSmart(fs, 2) + ' × cargas críticas)')],
        ['Modo de Operação', hib.usoBateria === 'ciclagem' ? 'Backup + ciclagem diária (autoconsumo noturno)' : 'Backup (baterias reservadas para falta de energia)']
      ], ['Parâmetro', 'Valor']);
      b += vazio();
    }

    /* ---------- CONSUMO × GERAÇÃO */
    b += titulo((++sec) + '. CONSUMO × GERAÇÃO MENSAL ESTIMADA');
    b += P(doc.imagem('rIdGrafico', Math.round(5524500 * doc.k), Math.round(2301875 * doc.k), 'Grafico'), { after: 120, jc: 'center' });
    b += vazio();

    /* ---------- ANÁLISE FINANCEIRA */
    const f = r.fin;
    const a1 = f.anos[0];
    b += titulo((++sec) + '. ANÁLISE FINANCEIRA');
    const adj = C.LIG_ADJ[r.ligacao];
    const prems = [
      'Simultaneidade ' + U.fmtSmart(s * 100, 1) + '% autoconsumo / ' + U.fmtSmart((1 - s) * 100, 1) + '% injetado',
      'Fio B: ' + C.fioBTexto(r.anoBase, prem, ', '),
      'TUSD Fio B R$' + U.fmt(r.tusdFioB, Math.max(2, decimais(r.tusdFioB))) + '/kWh',
      'Tarifa R$' + U.fmt(r.tarifa, Math.max(2, decimais(r.tarifa))) + '/kWh',
      'Inflação tarifária ' + U.fmtSmart(prem.inflacaoTarifa * 100, 2) + '% a.a.',
      'Degradação módulos ' + U.fmtSmart(prem.degradacao * 100, 2) + '% a.a.',
      'TMA (' + (prem.tmaNome || 'SELIC') + ') ' + U.fmt(prem.tma * 100, 2) + '% a.a.',
      'Disponibilidade ' + adj + ' ' + U.fmt(r.disponibilidade, 0) + ' kWh/mês',
      'COSIP ' + U.brl(r.cosip) + '/mês' + (prem.reajusteCosip > 0 ? ' (reajuste ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.)' : ''),
      'Consumo ' + U.fmt(r.consumoMedio, 0) + ' kWh/mês'
    ];
    if (hib && hib.usoBateria === 'ciclagem') prems.push('Baterias: ciclagem diária de ' + U.fmtSmart(hib.capUtil * hib.eficiencia, 2) + ' kWh');
    b += T('📌 Premissas: ' + prems.join(' │ '), { left: { sz: 12, space: 4, color: AZUL }, shd: DESTAQUE, after: 80 }, { color: AZUL, sz: 18 });
    b += vazio();
    const destaque = function (v) { return { t: v, b: true, color: AZUL, jc: 'right' }; };
    const sub = function (v) { return { t: v, jc: 'right' }; };
    const finLin = [
      [{ t: '💰 Investimento Total (CAPEX)', b: true }, destaque(U.brl(r.total))],
      ['   ↳ ' + (hib ? 'Kit Fotovoltaico + Baterias (módulos, inversor híbrido, baterias, estrutura, cabos e conectores)' : 'Kit Fotovoltaico (módulos, inversor, estrutura, cabos e conectores)'), sub(U.brl(r.kit))]
    ];
    if (r.infra > 0) finLin.push(['   ↳ Infraestrutura Elétrica CA (DPS, disjuntores, aterramento)', sub(U.brl(r.infra))]);
    finLin.push(['   ↳ Mão de Obra + Projeto + Instalação + Homologação', sub(U.brl(r.maoObra))]);
    finLin.push(
      [{ t: '📅 Economia Mensal Ano 1 (sim. ' + U.fmtSmart(s * 100, 1) + '%)', b: true }, destaque(U.brl(f.economiaMes1))],
      [{ t: '📅 Economia Anual Ano 1', b: true }, destaque(U.brl(f.economiaAno1))],
      [{ t: '⏱ Payback Simples', b: true }, destaque(U.anosMeses(f.paybackSimples))],
      [{ t: '⏱ Payback Descontado (' + (prem.tmaNome || 'SELIC') + ' ' + U.fmt(prem.tma * 100, 2) + '% a.a.)', b: true }, destaque(U.anosMeses(f.paybackDescontado))],
      [{ t: '📈 VPL ' + H + ' anos', b: true }, destaque(U.brl(f.vpl))],
      [{ t: '📈 TIR', b: true }, destaque(f.tir != null ? U.fmt(f.tir * 100, 2) + '% a.a.' : (f.tirAcima ? 'acima de 1.000% a.a.' : '—'))],
      [{ t: '🌿 CO₂ Evitado em ' + H + ' anos', b: true }, destaque(U.fmt(f.co2t, 1) + ' toneladas')],
      [{ t: '💵 Economia Total Acumulada ' + H + ' anos', b: true }, destaque(U.brl(f.economiaTotal))]
    );
    if (r.trocaBateria && r.trocaBateria.custo > 0) {
      finLin.push([{ t: '🔋 Substituição das baterias (ano ' + r.trocaBateria.ano + ')', b: true }, destaque(U.brl(r.trocaBateria.custo))]);
    }
    b += doc.tabela([{ t: 'Indicador', w: 4200 }, { t: 'Valor', w: 5160 }], finLin);
    b += vazio();

    /* ---------- PROJEÇÃO DA CONTA */
    b += titulo((++sec) + '. PROJEÇÃO DA CONTA COM FIO B (LEI 14.300/2022)');
    const pct0 = C.pctFioB(r.anoBase, prem);
    let ano100 = null;
    for (let a = r.anoBase; a <= r.anoBase + 30; a++) { if (C.pctFioB(a, prem) >= (prem.fioBDepois == null ? 1 : prem.fioBDepois)) { ano100 = a; break; } }
    const pctFinal = U.fmtSmart((prem.fioBDepois == null ? 1 : prem.fioBDepois) * 100, 1) + '%';
    const cron = pct0 < (prem.fioBDepois == null ? 1 : prem.fioBDepois) && ano100
      ? 'O percentual sobe de ' + U.fmtSmart(pct0 * 100, 1) + '% em ' + r.anoBase + ' até ' + pctFinal + ' a partir de ' + ano100 + '.'
      : 'Em ' + r.anoBase + ' o Fio B já é cobrado em ' + U.fmtSmart(pct0 * 100, 1) + '%.';
    b += T('A Lei 14.300/2022 estabelece cronograma gradual de cobrança do Fio B sobre a energia injetada (' + U.fmtSmart((1 - s) * 100, 1) +
      '% do total gerado, conforme simultaneidade de ' + U.fmtSmart(s * 100, 1) + '%). ' + cron +
      (hib && hib.usoBateria === 'ciclagem' ? ' Com a ciclagem diária das baterias, parte do excedente é armazenada e consumida no local, reduzindo a energia injetada.' : '') +
      ' A COSIP (Contribuição para Custeio da Iluminação Pública) de ' + U.brl(r.cosip) + '/mês não é compensável por geração própria e permanece em ambos os cenários' +
      (prem.reajusteCosip > 0 ? ', com reajuste projetado de ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.' : '.'),
      { after: 80 }, { color: GRAFITE });
    b += vazio();
    const projCols = [{ t: 'Ano', w: 640, jc: 'center' }, { t: '% Fio B', w: 640, jc: 'center' }, { t: 'Conta s/ Sistema', w: 1500, jc: 'right' },
      { t: 'Disponib. Mín.', w: 1080, jc: 'right' }, { t: 'Custo Fio B', w: 1080, jc: 'right' }, { t: 'COSIP', w: 900, jc: 'right' },
      { t: 'Conta c/ Sistema', w: 1560, jc: 'right' }, { t: 'Economia/mês', w: 1960, jc: 'right' }];
    const projHead = projCols.map(function (c) { return { t: c.t, w: c.w, jc: 'center' }; });
    const projLin = f.projecao.map(function (a) {
      return [{ t: String(a.ano), b: true, jc: 'center' }, { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' }, U.brl(a.contaSem), U.brl(a.contaMin),
        U.brl(a.fioBMes), U.brl(a.cosip), U.brl(a.contaCom), { t: U.brl(a.economiaMes), b: true, color: VERDE }];
    });
    b += tabelaComCabecalhoProprio(doc, projHead, projCols, projLin, 19);
    b += T('⚠ Fio B incide sobre a energia injetada (' + U.fmtSmart((1 - s) * 100, 1) + '%). Disponibilidade mínima ' + adj + ': ' +
      U.fmt(r.disponibilidade, 0) + ' kWh/mês. COSIP de ' + U.brl(r.cosip) + '/mês não compensável (' +
      (prem.reajusteCosip > 0 ? 'reajuste projetado de ' + U.fmtSmart(prem.reajusteCosip * 100, 2) + '% a.a.' : 'valor nominal, sujeito a reajuste municipal') +
      '). Cronograma Fio B: ' + C.fioBTexto(r.anoBase, prem, ' | ') + '.', { after: 80 }, { color: CINZA, sz: 18 });
    b += vazio();

    /* ---------- FLUXO DE CAIXA */
    b += titulo((++sec) + '. FLUXO DE CAIXA — ' + H + ' ANOS');
    const fcCols = [{ t: 'Ano', w: 680, jc: 'center' }, { t: 'Geração (kWh)', w: 1100, jc: 'right' }, { t: 'Tarifa (R$/kWh)', w: 1000, jc: 'right' },
      { t: '% Fio B', w: 700, jc: 'center' }, { t: 'Econ. Bruta (R$)', w: 1300, jc: 'right' }, { t: 'Custo Fio B (R$)', w: 1200, jc: 'right' },
      { t: 'Econ. Líq. (R$)', w: 1280, jc: 'right' }, { t: 'Acumulado (R$)', w: 2100, jc: 'right' }];
    const fcHead = fcCols.map(function (c) { return { t: c.t, w: c.w, jc: 'center' }; });
    const fcLin = f.anos.map(function (a) {
      return [{ t: String(a.ano), b: true, jc: 'center' }, U.fmt(a.geracao, 0), 'R$ ' + U.fmt(a.tarifa, 4), { t: U.fmtSmart(a.pctFioB * 100, 1) + '%', jc: 'center' },
        U.brl(a.bruta), U.brl(a.fioB), U.brl(a.liq), { t: U.brl(a.acumulado), color: a.acumulado < 0 ? VERMELHO : VERDE }];
    });
    b += tabelaComCabecalhoProprio(doc, fcHead, fcCols, fcLin, 18);
    if (r.trocaBateria && r.trocaBateria.custo > 0) {
      b += T('🔋 A economia líquida do ano ' + (r.anoBase + r.trocaBateria.ano - 1) + ' já desconta a substituição do banco de baterias (' + U.brl(r.trocaBateria.custo) + ').', { after: 80 }, { color: CINZA, sz: 18 });
    }
    b += vazio();

    /* ---------- PAGAMENTO */
    b += titulo((++sec) + '. OPÇÕES DE PAGAMENTO');
    const pgCols = [{ t: 'Modalidade', w: 3600 }, { t: 'Prazo', w: 1200, jc: 'center' }, { t: 'Parcela (R$)', w: 2280, jc: 'right' }, { t: 'Total Pago (R$)', w: 2280, jc: 'right' }];
    b += doc.tabela(pgCols, r.pagamentos.map(function (pg) {
      return [pg.label, pg.prazo, U.brl(pg.parcela), { t: U.brl(pg.total), b: true }];
    }));
    b += T(textos.notaPagamento, { after: 80 }, { color: CINZA, sz: 18 });
    b += vazio();

    /* ---------- EQUIPAMENTOS */
    b += titulo((++sec) + '. LISTA DE EQUIPAMENTOS E MATERIAIS');
    const eqCols = [{ t: '#', w: 500, jc: 'center' }, { t: 'Qtd.', w: 800, jc: 'center' }, { t: 'Descrição', w: 4900 }, { t: 'Garantia', w: 3160 }];
    const eqLin = r.itens.map(function (it, i) {
      return [String(i + 1), C.qtdTxt(it), it.descricao, it.garantia || ''];
    });
    if (r.infra > 0) {
      eqLin.push([{ t: '—', b: true }, '', { t: '── INFRAESTRUTURA ELÉTRICA (CA, PROTEÇÕES, ATERRAMENTO) ──', b: true }, '']);
      eqLin.push([String(r.itens.length + 1), '—', (p.infraDescricao || textos.infraDescricao) + ' — ' + U.brl(r.infra), 'Conf. fabricante']);
    }
    b += doc.tabela(eqCols, eqLin, { sz: 19 });
    b += vazio();

    /* ---------- SERVIÇOS */
    b += titulo((++sec) + '. SERVIÇOS INCLUSOS E NÃO INCLUSOS');
    const inc = (textos.inclusos || []).concat(hib ? textos.inclusosHibrido || [] : []).map(t).filter(Boolean);
    const ninc = (textos.naoInclusos || []).concat(hib ? textos.naoInclusosHibrido || [] : []).map(t).filter(Boolean);
    b += doc.tbl([4680, 4680],
      doc.tr(doc.tc(T('✅ Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL }) + doc.tc(T('❌ Não Inclusos', null, { b: true, color: BRANCO }), { w: 4680, fill: AZUL }), true) +
      doc.tr(doc.tc(T(inc.join('\n')), { w: 4680, fill: ZEBRA, vAlign: 'top' }) + doc.tc(T(ninc.join('\n')), { w: 4680, fill: BRANCO, vAlign: 'top' })));
    b += vazio();

    /* ---------- CRONOGRAMA */
    b += titulo((++sec) + '. CRONOGRAMA DE EXECUÇÃO');
    b += doc.tabela([{ t: 'Etapa', w: 600, jc: 'center' }, { t: 'Descrição', w: 5560 }, { t: 'Prazo Estimado', w: 3200, jc: 'center' }],
      (textos.cronograma || []).map(function (c, i) { return [{ t: String(i + 1), b: true }, t(c.etapa), t(c.prazo)]; }));
    b += vazio();

    /* ---------- CONDIÇÕES COMERCIAIS */
    b += titulo((++sec) + '. CONDIÇÕES COMERCIAIS');
    const cond = [['Valor Total da Proposta', { t: U.brl(r.total), b: true }],
      [hib ? 'Kit Fotovoltaico + Baterias' : 'Kit Fotovoltaico Completo', U.brl(r.kit)]];
    if (r.infra > 0) cond.push(['Infraestrutura Elétrica CA', U.brl(r.infra)]);
    cond.push(['Mão de Obra + Projeto + Instalação + Homologação', U.brl(r.maoObra)]);
    cond.push(['Validade da Proposta', (p.validadeDias || emp.validadeDias) + ' dias a partir da data de emissão']);
    if (mod) cond.push(['Garantia Módulos ' + mod.fabricante, C.garantiaModulo(mod)]);
    const garFab = function (e) { return U.num(e.garantia) > 0 ? e.garantia + ' anos (conforme fabricante)' : 'Conforme fabricante'; };
    if (inv) cond.push(['Garantia Inversor ' + inv.fabricante, garFab(inv)]);
    if (bat) cond.push(['Garantia Baterias ' + bat.fabricante, garFab(bat)]);
    cond.push(['Garantia Instalação ' + (emp.nomeCurto || emp.razao), textos.garantiaInstalacao]);
    if (p.condicoesObs) cond.push(['Observações', p.condicoesObs]);
    b += doc.kv([3600, 5760], cond);
    b += vazio();

    /* ---------- CONFORMIDADE */
    b += titulo((++sec) + '. CONFORMIDADE LEGAL E TÉCNICA');
    const conf = (textos.conformidade || []).concat(hib ? textos.conformidadeHibrido || [] : []);
    b += doc.kv([2800, 6560], conf.map(function (c) { return [t(c.norma), t(c.descricao)]; }));
    b += vazio();

    /* ---------- RESPONSÁVEL TÉCNICO */
    b += titulo((++sec) + '. RESPONSÁVEL TÉCNICO');
    b += vazio();
    const centro = { after: 80, jc: 'center' };
    const linhaAss = { top: { sz: 4, space: 0, color: '000000' }, before: 400, jc: 'center' };
    const colEmp = T(String(emp.razao).toUpperCase(), centro, { b: true, color: AZUL, sz: 22 }) +
      T('CNPJ: ' + emp.cnpj, centro) +
      (emp.registro ? T(emp.registroTipo + ' ' + emp.registro, centro) : '') +
      T(emp.responsavel || '', linhaAss) +
      T(emp.cargo || 'Responsável Técnico', { jc: 'center' }, { color: CINZA, sz: 18 });
    const colCli = T('CLIENTE', centro, { b: true, color: AZUL, sz: 22 }) +
      T(nomeCliente, centro) +
      T(cidadeUF, centro, { color: CINZA }) +
      T(nomeCliente, linhaAss) +
      T('Contratante', { jc: 'center' }, { color: CINZA, sz: 18 });
    b += doc.tbl([4680, 4680], doc.tr(doc.tc(colEmp, { w: 4680, simples: true }) + doc.tc(colCli, { w: 4680, simples: true })));
    b += vazio() + vazio();
    b += T(t(textos.slogan), { top: { sz: 6, space: 4, color: DOURADO }, before: 100, jc: 'center' }, { color: AZUL });

    const sect2 = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>' +
      '<w:pgSz w:w="' + papel.w + '" w:h="' + papel.h + '"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
      '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';

    const documento = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document ' + NS + '><w:body>' + b + sect2 + '</w:body></w:document>';

    /* ---------- cabeçalho e rodapé */
    const hl = encaixar(logo.w, logo.h, 1238250, 666750);
    const cabTexto = nomeCliente + '  |  ' + p.numero + '  |  ' + r.resumoCabecalho;
    const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:hdr ' + NS + '>' +
      doc.tbl([3600, 5760], doc.tr(
        doc.tc(P(doc.imagem('rIdLogo', hl.cx, hl.cy, 'Logotipo')), { w: 3600, semBorda: true }) +
        doc.tc(T(cabTexto, { jc: 'right' }, { color: CINZA, sz: 16 }), { w: 5760, semBorda: true, vAlign: 'bottom' })
      )) +
      P('', { bottom: { sz: 8, space: 2, color: AZUL } }) +
      '</w:hdr>';
    const rodTexto = [emp.razao, 'CNPJ ' + emp.cnpj, emp.registro ? emp.registroTipo + ' ' + emp.registro : '', [emp.cidade, emp.uf].filter(Boolean).join('/')]
      .filter(Boolean).join('  │  ');
    const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:ftr ' + NS + '>' +
      T(rodTexto, { top: { sz: 6, space: 2, color: AZUL }, before: 80, jc: 'center' }, { color: CINZA, sz: 16 }) +
      '</w:ftr>';

    return { documento: documento, header: header, footer: footer };
  }

  /** Tabela cujo cabeçalho tem alinhamento diferente das linhas (centralizado), como no modelo. */
  function tabelaComCabecalhoProprio(doc, head, cols, linhas, sz) {
    let xml = doc.tr(head.map(function (c) {
      return doc.tc(T(c.t, { jc: 'center' }, { b: true, color: BRANCO }), { w: c.w, fill: AZUL });
    }).join(''), true);
    linhas.forEach(function (lin, i) {
      const fill = i % 2 === 0 ? ZEBRA : BRANCO;
      xml += doc.tr(lin.map(function (cel, j) {
        const c = typeof cel === 'object' && cel !== null ? cel : { t: cel };
        const jc = c.jc || cols[j].jc;
        return doc.tc(T(c.t, jc && jc !== 'left' ? { jc: jc } : null, { b: c.b, color: c.color, sz: sz }), { w: cols[j].w, fill: fill });
      }).join(''));
    });
    return doc.tbl(cols.map(function (c) { return c.w; }), xml);
  }

  function settingsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/>' +
      '<w:characterSpacingControl w:val="doNotCompress"/>' +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
      '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>' +
      '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>' +
      '<w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/></w:compat>' +
      '<w:themeFontLang w:val="pt-BR"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>';
  }

  function contentTypes() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
      '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';
  }

  function rels(itens) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      itens.map(function (i) { return '<Relationship Id="' + i[0] + '" Type="' + i[1] + '" Target="' + i[2] + '"/>'; }).join('') + '</Relationships>';
  }

  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

  /**
   * Gera o .docx da proposta.
   * @returns {Promise<{blob: Blob, nome: string}>}
   */
  async function gerar(p, ctx) {
    ctx = ctx || C.contexto();
    const r = C.calcular(p, ctx);
    const cliente = (ctx.clientes || []).find(function (c) { return c.id === p.clienteId; }) || p.clienteSnapshot || null;
    const logo = await prepararLogo(ctx.empresa.logo);
    const grafico = await App.Chart.png({
      consumo: r.consumoMeses, geracao: r.geracaoMeses,
      titulo: 'Consumo × Geração Mensal Estimada — ' + U.kwp(r.kwp) + ' kWp'
    });
    const partes = montarDocumento(p, r, ctx, cliente, logo);
    const agora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const nomeCli = (cliente && cliente.nome) || 'Cliente';

    const zip = new App.Zip();
    zip.add('[Content_Types].xml', contentTypes());
    zip.add('_rels/.rels', rels([
      ['rId1', RT + 'officeDocument', 'word/document.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', RT + 'extended-properties', 'docProps/app.xml']
    ]));
    zip.add('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x('Proposta Comercial ' + p.numero + ' — ' + nomeCli) + '</dc:title>' +
      '<dc:creator>' + x(ctx.empresa.razao) + '</dc:creator><cp:lastModifiedBy>' + x(ctx.empresa.razao) + '</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + agora + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + agora + '</dcterms:modified>' +
      '</cp:coreProperties>');
    zip.add('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Gerador de Propostas Solar</Application></Properties>');
    zip.add('word/document.xml', partes.documento);
    zip.add('word/styles.xml', App.docxParts.styles);
    zip.add('word/settings.xml', settingsXml());
    zip.add('word/fontTable.xml', App.docxParts.fontTable);
    zip.add('word/theme/theme1.xml', App.docxParts.theme);
    zip.add('word/header1.xml', partes.header);
    zip.add('word/footer1.xml', partes.footer);
    zip.add('word/_rels/document.xml.rels', rels([
      ['rId1', RT + 'styles', 'styles.xml'],
      ['rId2', RT + 'settings', 'settings.xml'],
      ['rId3', RT + 'fontTable', 'fontTable.xml'],
      ['rId4', RT + 'theme', 'theme/theme1.xml'],
      ['rIdHeader', RT + 'header', 'header1.xml'],
      ['rIdFooter', RT + 'footer', 'footer1.xml'],
      ['rIdLogo', RT + 'image', 'media/logo.' + logo.ext],
      ['rIdGrafico', RT + 'image', 'media/grafico.png']
    ]));
    zip.add('word/_rels/header1.xml.rels', rels([['rIdLogo', RT + 'image', 'media/logo.' + logo.ext]]));
    zip.add('word/media/logo.' + logo.ext, logo.bytes);
    zip.add('word/media/grafico.png', grafico);

    const blob = await zip.gerar('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const nome = 'Proposta_Solar_' + U.slug(nomeCli) + '_' + String(p.data || U.todayISO()).replace(/-/g, '') + '.docx';
    return { blob: blob, nome: nome, resultado: r };
  }

  App.Docx = { gerar: gerar, _montar: montarDocumento };
})(window.App);
