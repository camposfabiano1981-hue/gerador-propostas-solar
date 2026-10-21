/*
 * Geração da proposta em Word (.docx): converte o modelo de js/documento.js em WordprocessingML,
 * reproduzindo o layout do modelo GE (capa, cabeçalho/rodapé, títulos com filete azul, tabelas zebradas).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  const RID_IMAGEM = { logo: 'rIdLogo', grafico: 'rIdGrafico' };

  /** Imagens adicionais do modelo (ex.: fotos de projetos): ref → {rid, arquivo, dataURL}. */
  function imagensExtras(modelo) {
    const out = {};
    Object.keys(modelo.imagens || {}).sort().forEach(function (ref, i) {
      const url = modelo.imagens[ref];
      const ext = /^data:image\/png/.test(url) ? 'png' : 'jpg';
      out[ref] = { rid: 'rIdImg' + (i + 1), arquivo: 'media/img' + (i + 1) + '.' + ext, dataURL: url };
    });
    return out;
  }

  function x(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  function rPr(o) {
    o = o || {};
    let s = '';
    if (o.b) s += '<w:b/><w:bCs/>';
    if (o.i) s += '<w:i/><w:iCs/>';
    if (o.color) s += '<w:color w:val="' + o.color + '"/>';
    if (o.sz) s += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
    if (o.u) s += '<w:u w:val="single"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }

  function borda(lado, b) {
    return '<w:' + lado + ' w:val="single" w:sz="' + b.sz + '" w:space="' + (b.space || 0) + '" w:color="' + (b.color || 'auto') + '"/>';
  }

  const MARGENS_CAPA = { top: 720, right: 1440, bottom: 720, left: 1440, header: 708, footer: 708 };
  const MARGENS_CONTEUDO = { top: 1080, right: 1440, bottom: 1080, left: 1440, header: 708, footer: 708 };

  function pgMar(m) {
    return '<w:pgMar w:top="' + m.top + '" w:right="' + m.right + '" w:bottom="' + m.bottom + '" w:left="' + m.left + '" w:header="' + m.header + '" w:footer="' + m.footer + '" w:gutter="0"/>';
  }

  function secaoCapa(papel, m) {
    return '<w:sectPr><w:pgSz w:w="' + papel.w + '" w:h="' + papel.h + '"/>' + pgMar(m || MARGENS_CAPA) + '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  }

  function secaoConteudo(papel, m) {
    return '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>' +
      '<w:pgSz w:w="' + papel.w + '" w:h="' + papel.h + '"/>' + pgMar(m || MARGENS_CONTEUDO) +
      '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  }

  function bordasCelula(b) {
    return '<w:tcBorders>' + ['top', 'left', 'bottom', 'right'].map(function (l) {
      return '<w:' + l + ' w:val="single" w:sz="' + (b.sz || 4) + '" w:space="0" w:color="' + (b.cor || 'auto') + '"/>';
    }).join('') + '</w:tcBorders>';
  }

  function margensCelula(m) {
    return '<w:tcMar><w:top w:w="' + m.t + '" w:type="dxa"/><w:left w:w="' + m.l + '" w:type="dxa"/><w:bottom w:w="' + m.b + '" w:type="dxa"/><w:right w:w="' + m.r + '" w:type="dxa"/></w:tcMar>';
  }

  /** Serializador do modelo para WordprocessingML. */
  function Serializador(modelo) {
    this.papel = modelo.papel;
    this.k = modelo.k;
    this.margensCapa = modelo.margensCapa;
    this.idImg = 10;
    const extras = imagensExtras(modelo);
    this.rids = Object.assign({}, RID_IMAGEM);
    Object.keys(extras).forEach(function (ref) { this.rids[ref] = extras[ref].rid; }, this);
  }

  Serializador.prototype.w = function (v) { return Math.round(v * this.k); };

  Serializador.prototype.pPr = function (o) {
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
    if (o.ind) s += '<w:ind w:left="' + o.ind + '"/>';
    if (o.jc) s += '<w:jc w:val="' + o.jc + '"/>';
    if (o.sectPr) s += secaoCapa(this.papel, this.margensCapa);
    return s ? '<w:pPr>' + s + '</w:pPr>' : '';
  };

  Serializador.prototype.run = function (n) {
    // espaço não separável após "R$" evita que o símbolo fique sozinho numa linha das tabelas estreitas
    const linhas = n.texto.replace(/R\$ (?=-?\d)/g, 'R$ ').split('\n');
    const pr = rPr(n.ro);
    return linhas.map(function (l, i) {
      return '<w:r>' + pr + (i > 0 ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + x(l) + '</w:t></w:r>';
    }).join('');
  };

  Serializador.prototype.imagem = function (n) {
    const id = this.idImg++;
    const rId = this.rids[n.ref];
    return '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + n.cx + '" cy="' + n.cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="' + x(n.nome) + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="' + x(n.nome) + '"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rId + '"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + n.cx + '" cy="' + n.cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  Serializador.prototype.tc = function (n) {
    const o = n.o;
    const conteudo = this.lista(n.filhos);
    let pr = '<w:tcW w:w="' + this.w(o.w) + '" w:type="dxa"/>';
    if (o.span) pr += '<w:gridSpan w:val="' + o.span + '"/>';
    if (o.simples) {
      // célula "crua" (bloco de assinatura do modelo): só largura
      return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + (conteudo || '<w:p/>') + '</w:tc>';
    }
    pr += o.semBorda ? TC_SEM_BORDA : (o.borda ? bordasCelula(o.borda) : TC_BORDERS);
    if (o.fill) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>';
    if (o.mar) pr += margensCelula(o.mar);
    else if (!o.semBorda) pr += TC_MAR;
    pr += '<w:vAlign w:val="' + (o.vAlign || 'center') + '"/>';
    return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + (conteudo || '<w:p/>') + '</w:tc>';
  };

  Serializador.prototype.no = function (n) {
    const self = this;
    switch (n.tipo) {
      case 'p': return '<w:p>' + this.pPr(n.po) + this.lista(n.filhos) + '</w:p>';
      case 'r': return this.run(n);
      case 'img': return this.imagem(n);
      case 'tc': return this.tc(n);
      case 'tr': {
        const trPr = (n.naoQuebrar ? '<w:cantSplit/>' : '') + (n.cabecalho ? '<w:tblHeader/>' : '');
        return '<w:tr>' + TBL_PREX + (trPr ? '<w:trPr>' + trPr + '</w:trPr>' : '') + this.lista(n.celulas) + '</w:tr>';
      }
      case 'tbl': {
        const ws = n.larguras.map(function (v) { return self.w(v); });
        const total = ws.reduce(function (s, v) { return s + v; }, 0);
        return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/>' + (n.jc ? '<w:jc w:val="' + n.jc + '"/>' : '') +
          TBL_BORDERS + TBL_CELLMAR + TBL_LOOK + '</w:tblPr>' +
          '<w:tblGrid>' + ws.map(function (v) { return '<w:gridCol w:w="' + v + '"/>'; }).join('') + '</w:tblGrid>' + this.lista(n.linhas) + '</w:tbl>';
      }
      default: return '';
    }
  };

  Serializador.prototype.lista = function (nos) {
    const self = this;
    return (nos || []).map(function (n) { return self.no(n); }).join('');
  };

  /** Converte o modelo nas partes XML do documento (corpo, cabeçalho e rodapé). */
  function serializar(modelo) {
    const s = new Serializador(modelo);
    const documento = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document ' + NS + '><w:body>' +
      s.lista(modelo.corpo) + secaoConteudo(modelo.papel, modelo.margens) + '</w:body></w:document>';
    const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:hdr ' + NS + '>' + s.lista(modelo.cabecalho) + '</w:hdr>';
    const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:ftr ' + NS + '>' + s.lista(modelo.rodape) + '</w:ftr>';
    return { documento: documento, header: header, footer: footer };
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
   * Monta o pacote .docx a partir de um modelo de documento.
   * rec: {logo: {bytes, ext}, grafico: dataURL (opcional)}; meta: {titulo, autor}
   * Imagens adicionais vêm do próprio modelo (modelo.imagens: ref → dataURL JPEG/PNG).
   */
  async function pacote(modelo, rec, meta) {
    const partes = serializar(modelo);
    const agora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const logo = rec.logo;

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
      '<dc:title>' + x(meta.titulo) + '</dc:title>' +
      '<dc:creator>' + x(meta.autor) + '</dc:creator><cp:lastModifiedBy>' + x(meta.autor) + '</cp:lastModifiedBy>' +
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
    const relsDoc = [
      ['rId1', RT + 'styles', 'styles.xml'],
      ['rId2', RT + 'settings', 'settings.xml'],
      ['rId3', RT + 'fontTable', 'fontTable.xml'],
      ['rId4', RT + 'theme', 'theme/theme1.xml'],
      ['rIdHeader', RT + 'header', 'header1.xml'],
      ['rIdFooter', RT + 'footer', 'footer1.xml'],
      ['rIdLogo', RT + 'image', 'media/logo.' + logo.ext]
    ];
    if (rec.grafico) relsDoc.push(['rIdGrafico', RT + 'image', 'media/grafico.png']);
    const extras = imagensExtras(modelo);
    Object.keys(extras).forEach(function (ref) { relsDoc.push([extras[ref].rid, RT + 'image', extras[ref].arquivo]); });
    zip.add('word/_rels/document.xml.rels', rels(relsDoc));
    zip.add('word/_rels/header1.xml.rels', rels([['rIdLogo', RT + 'image', 'media/logo.' + logo.ext]]));
    zip.add('word/media/logo.' + logo.ext, logo.bytes);
    if (rec.grafico) zip.add('word/media/grafico.png', App.U.dataURLtoBytes(rec.grafico));
    Object.keys(extras).forEach(function (ref) { zip.add('word/' + extras[ref].arquivo, App.U.dataURLtoBytes(extras[ref].dataURL)); });
    return zip.gerar('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  /**
   * Gera o .docx da proposta.
   * @returns {Promise<{blob: Blob, nome: string, resultado: object}>}
   */
  async function gerar(p, ctx) {
    const d = await App.Documento.preparar(p, ctx);
    const blob = await pacote(d.modelo, { logo: d.logo, grafico: d.grafico },
      { titulo: 'Proposta Comercial ' + p.numero + ' — ' + d.nomeCliente, autor: d.ctx.empresa.razao });
    return { blob: blob, nome: d.nomeBase + '.docx', resultado: d.r };
  }

  App.Docx = { gerar: gerar, serializar: serializar, pacote: pacote };
})(window.App);
