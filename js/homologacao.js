/*
 * Homologação na Energisa: memorial do "Formulário de Orçamento de Conexão de Geração Distribuída" (planilha oficial V6).
 * Monta os dados das páginas a partir do cliente, da proposta aprovada e da instalação (o que é automático) e dos campos do
 * projetista (relação de carga com o fator de demanda, padrão de entrada, proteções, coordenadas UTM…), com as fórmulas da
 * planilha. Os equipamentos seguem a lista oficial da distribuidora (fabricante e modelo com o código); fora da lista, entram
 * como OUTROS / OUTRO e o modelo vai para as Observações. O PDF é gerado sobre o modelo oficial (js/homologacao-pdf.js).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  // ------------------------------------------------------------ tabelas da planilha (aba CONFIG)
  const TENSOES = {
    EAC: ['127', '220', '7,9kV', '19,9kV', '13,8kV', '34,5kV'], EMT: ['127', '220', '254', '380', '13.8kV', '34.5kV'],
    EMS: ['127', '220', '254', '13.8kV', '34.5kV'], ERO: ['127/220', '115/230', '120/240', '220/380', '254/440', '7.9/13.8', '19.9/34.5', '69kV', '138kV'],
    ETO: ['220/380', '440', '13.8kV', '34.5kV', '69kV', '138kV'], EPB: ['220', '380', '7,9kV', '13.8kV', '69kV'],
    ESE: ['115/230', '127/220', '220/380', '7,96/13,8kV'], EMR: ['127', '220', '380', '230', '115', '11.4kV', '22kV'],
    ESS: ['127/220', '127/254', '6,58/11,4kV', '7,96/13,8kV', '34,5kV', '40kV', '69kV', '88kV', '138kV']
  };
  const CONTATOS = {
    EAC: ['Energisa Acre', '(68) 99250-6039', 'projetosterceirosac@energisa.com.br', 'DCMD/COPC', '(68) 9 9233-0341'],
    EMR: ['Energisa Minas Rio', '0800-032-5454', 'microgeracao.emr@energisa.com.br', 'DCMD/COPE', 'https://l.ead.me/bbThiX'],
    EMS: ['Energisa Mato Grosso do Sul', '(67) 3398-5057', 'projetosparticulares.ems@energisa.com.br', 'DCMD/SPRO', '(67) 3398-5057'],
    EMT: ['Energisa Mato Grosso', '(65) 3926-5647', 'gd.analisetecnicaemt@energisa.com.br', 'DCMD/GD', 'https://l.ead.me/bbThiX'],
    EPB: ['Energisa Paraiba', '(83) 2106-7241', 'projetos.pb@energisa.com.br', 'DCMD/COPC', '(83) 9135-5540'],
    ESS: ['Energisa Sul Sudeste', '(18) 3902-3500', 'geracaodistribuida.ess@energisa.com.br', 'DPCM/COPC', 'https://api.whatsapp.com/send?phone=5518991203365'],
    ERO: ['Energisa Rondônia', '(69) 98406-9603', 'projetos.ero@energisa.com.br', 'DCMD/COPC', 'https://l.ead.me/bbThiX'],
    ESE: ['Energisa Sergipe', '(79) 2106-1563', 'projetos.se@energisa.com.br', 'DCMD/COPC', 'https://l.ead.me/bbThiX'],
    ETO: ['Energisa Tocantins', '(63) 3219-5094', 'geracaodistribuida.eto@energisa.com.br', 'DCMD/COPC', 'https://l.ead.me/bbThiX']
  };
  const DISTRIBUIDORAS = [['EMS', /mato grosso do sul|\bms\b/], ['EMT', /mato grosso\b|\bmt\b/], ['EAC', /acre|\bac\b/], ['ERO', /rond[oô]nia|\bro\b/],
    ['ETO', /tocantins|\bto\b/], ['EPB', /para[ií]ba|borborema|\bpb\b/], ['ESE', /sergipe|\bse\b/], ['EMR', /minas|rio|\bmg\b|\brj\b/],
    ['ESS', /sul sudeste|sul-sudeste|\bss\b|paran[aá]|s[aã]o paulo|\bsp\b|\bpr\b/]];
  const CLASSES = ['RESIDENCIAL', 'COMERCIAL', 'INDUSTRIAL', 'RURAL', 'PODER PÚBLICO', 'SERVIÇO PÚBLICO'];
  const CONEXOES = ['MONOFÁSICO', 'BIFÁSICO', 'TRIFÁSICO'];
  const RAMAIS = ['AÉREO', 'SUBTERRÂNEO'];
  const MODALIDADES = ['Compensação local', 'Autoconsumo remoto', 'Múltiplas Unidades Consumidoras', 'Geração compartilhada'];
  const FUSOS = ['18K', '19K', '20K', '21K', '22K', '23K', '24K', '25K'];
  const TRAFOS = ['0', '1', '5', '10', '15', '25', '30', '45', '75', '100', '112.5', '150', '225', '300', '500', '750', '1000', '1250', '1500', '2000', '2500', '2800', '3000', '3500', '4000', '4500', '5000', 'Outra potência'];
  const FONTES = ['SOLAR FOTOVOLTAICA', 'COGERAÇÃO QUALIFICADA', 'HIDRÁULICA', 'BIOMASSA', 'EÓLICA', 'OUTROS (ESPECIFICAR NO CAMPO OBSERVAÇÃO)'];
  const TIPOS_GERACAO = ['Empregando máquina síncrona sem conversor', 'Empregando conversor eletrônico/inversor', 'Mista', 'Outra (especificar no campo observação):'];
  const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  // itens do formulário (aba FORMULARIO): código e resumo
  const ITENS = [
    ['1', 'Documentos de identificação do consumidor (art. 67 da REN 1.000/2021)'], ['1.1', 'Pessoa jurídica: constituição, registro e representantes legais'],
    ['1.2', 'Pessoa física: CPF e documento de identidade com foto'], ['1.3', 'Endereço das instalações e meio de comunicação'],
    ['1.4', 'Declaração descritiva da carga instalada'], ['1.5', 'Cargas que possam provocar perturbações'], ['1.6', 'Atividades desenvolvidas nas instalações'],
    ['1.7', 'Licença ou declaração (áreas protegidas)'], ['1.8', 'Comprovante de propriedade ou posse do imóvel'], ['1.9', 'Ponto de conexão de interesse (opcional)'],
    ['2.1', 'Documento de responsabilidade técnica (ART/TRT)'], ['2.2', 'Local do padrão ou da subestação de entrada'], ['2.3', 'Diagrama unifilar, de blocos e memorial descritivo'],
    ['2.4', 'Relatório de ensaio dos conversores (inversores)'], ['2.5', 'Dados para o registro da central geradora (ANEEL)'], ['2.6', 'Lista de UCs participantes da compensação (opcional)'],
    ['2.7', 'Instrumento jurídico (múltiplas UCs / compartilhada)'], ['2.8', 'Cogeração qualificada (caso aplicável)'], ['2.9', 'Segurança de barragens (fontes hídricas)'],
    ['2.10', 'Centrais despacháveis: armazenamento (art. 655-B)'], ['2.11', 'Garantia de Fiel Cumprimento (art. 655-C)'],
    ['3.1', 'Vistoria após a aprovação do orçamento (SIM/NÃO)'], ['3.2', 'Renunciar ao direito de desistir do orçamento'], ['3.3', 'Receber contratos e cobrança junto com o orçamento'],
    ['3.4', 'Declaração de conformidade das instalações (obrigatória)']
  ];
  // tabela da potência máxima disponibilizada (tensão | tipo | disjuntor → kW máx.); a planilha só preenche quando a tensão confere
  const POTENCIA_DISP = [['127/220', 'MONOFÁSICO', 30, 3.8], ['127/220', 'MONOFÁSICO', 50, 6.3], ['127/220', 'MONOFÁSICO', 70, 8.8], ['127/220', 'BIFÁSICO', 40, 10.1],
    ['127/220', 'BIFÁSICO', 50, 12.7], ['127/220', 'BIFÁSICO', 70, 17.7], ['127/220', 'TRIFÁSICO', 40, 14], ['127/220', 'TRIFÁSICO', 50, 17.5], ['127/220', 'TRIFÁSICO', 80, 24.5],
    ['127/220', 'TRIFÁSICO', 100, 35.1], ['127/220', 'TRIFÁSICO', 150, 52.5], ['127/220', 'TRIFÁSICO', 200, 75], ['220', 'MONOFÁSICO', 30, 5], ['220', 'MONOFÁSICO', 40, 7.5],
    ['220', 'MONOFÁSICO', 50, 10], ['220/380', 'MONOFÁSICO', 30, 6], ['220/380', 'MONOFÁSICO', 50, 11], ['220/380', 'MONOFÁSICO', 70, 15.4], ['220/380', 'BIFÁSICO', 40, 17.6],
    ['220/380', 'BIFÁSICO', 50, 22], ['220/380', 'BIFÁSICO', 70, 26.3], ['220/380', 'TRIFÁSICO', 40, 24], ['220/380', 'TRIFÁSICO', 50, 30], ['220/380', 'TRIFÁSICO', 70, 42.39],
    ['220/380', 'TRIFÁSICO', 100, 60.54], ['220/380', 'TRIFÁSICO', 125, 75]];
  const LIMITES = { cargas: 20, modulos: 10, inversores: 10, gd: 5, beneficiarias: 10 };
  const OUTROS = 'OUTROS', OUTRO = 'OUTRO';

  // ------------------------------------------------------------ carregamento sob demanda (modelo, mapa e listas oficiais)
  const cache = {};
  function asset(nome, tipo) {
    if (!cache[nome]) {
      cache[nome] = fetch('assets/energisa/' + nome + '?v=' + encodeURIComponent(App.VERSAO_APP || '1')).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + nome);
        return tipo === 'json' ? r.json() : r.arrayBuffer();
      }).catch(function (e) { delete cache[nome]; throw e; });
    }
    return cache[nome];
  }
  const listas = function () { return asset('listas-v6.json', 'json'); };
  const mapa = function () { return asset('mapa-v6.json', 'json'); };
  const modelo = function () { return asset('memorial-gd-v6.pdf', 'bin'); };
  /** Fontes do memorial (recortes Latin-1 de Arimo = métrica Arial e de Carlito = métrica Calibri), servidas pelo próprio site. */
  const ARQ_FONTES = { AB: 'Arimo-Bold.ttf', A: 'Arimo-Regular.ttf', CB: 'MemorialC-Bold.ttf', C: 'MemorialC-Regular.ttf' };
  const fonte = function (k) { return asset('fontes/' + ARQ_FONTES[k], 'bin'); };

  /**
   * Texto que as fontes do memorial conseguem desenhar (Latin-1 + pontuação comum): aspas e travessões "inteligentes" viram
   * os simples, letras acentuadas fora do Latin-1 perdem o acento, quebras viram espaço (exceto nas áreas) e o resto sai.
   */
  const EXTRAS_PDF = '\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2264\u2265\u2212';
  function textoPdf(v, multilinha) {
    let t = String(v == null ? '' : v).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\u00A0\u2007\u202F]/g, ' ');
    if (!multilinha) t = t.replace(/\n+/g, ' ');
    let out = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (ch === '\n' || (c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF) || EXTRAS_PDF.indexOf(ch) >= 0) { out += ch; continue; }
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (base && base !== ch && /^[\x20-\x7E\u00A0-\u00FF]+$/.test(base)) out += base;
    }
    return out;
  }

  // ------------------------------------------------------------ formatação (como a planilha mostra)
  function num(v) { const n = U.num(v); return isFinite(n) ? n : 0; }
  function tem(v) { return v !== '' && v != null && isFinite(U.num(v)); }
  /** Formato "Geral" do Excel em português: até 10 algarismos significativos, sem zeros à direita. */
  function geral(v) {
    if (!tem(v)) return '';
    const n = Number(U.num(v).toPrecision(10));
    return String(n).replace('.', ',');
  }
  function dec2(v) { return tem(v) ? U.num(v).toFixed(2).replace('.', ',') : ''; }
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function telefone(v) {
    const d = digitos(v);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d[2] + ' ' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return String(v || '');
  }
  function documento(v) {
    const d = digitos(v);
    if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    return String(v || '');
  }
  function cep(v) { const d = digitos(v); return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : String(v || ''); }
  function maiusc(v) { return String(v == null ? '' : v).toLocaleUpperCase('pt-BR'); }
  function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function chave(s) { return semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // ------------------------------------------------------------ distribuidora e listas
  function distribuidora(nome) {
    const s = semAcento(nome).toLowerCase();
    if (!s) return 'EMS';
    const m = DISTRIBUIDORAS.find(function (d) { return d[1].test(s); });
    return m ? m[0] : 'EMS';
  }
  function contatos(dist) {
    const c = CONTATOS[dist] || CONTATOS.EMS;
    return { empresa: c[0], telefone: c[1], email: c[2], area: c[3], link: c[4] };
  }
  function tensoes(dist) { return TENSOES[dist] || TENSOES.EMS; }
  /** Lista oficial da distribuidora: {modulos: {fabricante: [modelos]}, inversores: {...}} (fabricante e modelo com o código). */
  function listaDe(L, dist) { return (L && L.distribuidoras && (L.distribuidoras[dist] || L.distribuidoras.EMS)) || { modulos: {}, inversores: {} }; }
  function nomeDoCodigo(s) { const m = String(s || '').match(/^\s*\d+\s*-\s*(.+)$/); return m ? m[1] : String(s || ''); }

  /**
   * Fabricante e modelo da lista oficial para o equipamento do CRM. Devolve {fab, modelo, situacao: 'lista' | 'modelo' | 'fora'}:
   * 'lista' = os dois na lista; 'modelo' = fabricante na lista e modelo fora (modelo OUTRO); 'fora' = OUTROS / OUTRO.
   */
  function casar(lista, fabricante, modeloCrm, potencia) {
    const fabs = Object.keys(lista || {});
    const kf = chave(fabricante);
    let fab = null;
    if (kf) {
      let melhor = 0;
      fabs.forEach(function (f) {
        const kn = chave(nomeDoCodigo(f));
        if (!kn) return;
        let p = 0;
        if (kn === kf) p = 3;
        else if (kn.length >= 3 && kf.length >= 3 && (kn.indexOf(kf) === 0 || kf.indexOf(kn) === 0)) p = 2;
        else if (kf.length >= 4 && kn.indexOf(kf) >= 0) p = 1;
        if (p > melhor) { melhor = p; fab = f; }
      });
    }
    if (!fab) return { fab: OUTROS, modelo: OUTRO, situacao: 'fora' };
    const km = chave(modeloCrm);
    const pot = String(Math.round(num(potencia) >= 100 ? num(potencia) : num(potencia) * 1000) || '');
    let mod = null, melhor = 0;
    (lista[fab] || []).forEach(function (m) {
      const kn = chave(nomeDoCodigo(m));
      if (!kn || !km) return;
      let p = 0;
      if (kn === km) p = 4;
      else if (km.length >= 6 && kn.indexOf(km) >= 0) p = 3;
      else if (kn.length >= 6 && km.indexOf(kn) >= 0) p = 2;
      if (p && pot && kn.indexOf(pot) >= 0) p += 0.5;
      if (p > melhor) { melhor = p; mod = m; }
    });
    return mod ? { fab: fab, modelo: mod, situacao: 'lista' } : { fab: fab, modelo: OUTRO, situacao: 'modelo' };
  }

  function situacao(lista, fab, modelo) {
    if (!fab || fab === OUTROS) return 'fora';
    if (!modelo || modelo === OUTRO) return 'modelo';
    return (lista[fab] || []).indexOf(modelo) >= 0 ? 'lista' : 'modelo';
  }

  // ------------------------------------------------------------ dados iniciais (automáticos do CRM)
  function classeDe(p) {
    const c = semAcento((p && p.classe) || '').toLowerCase();
    if (/rural/.test(c)) return 'RURAL';
    if (/comercial/.test(c)) return 'COMERCIAL';
    if (/industrial/.test(c)) return 'INDUSTRIAL';
    if (/publico/.test(c)) return 'PODER PÚBLICO';
    return 'RESIDENCIAL';
  }
  function conexaoDe(lig) { return { mono: 'MONOFÁSICO', bi: 'BIFÁSICO', tri: 'TRIFÁSICO' }[lig] || 'BIFÁSICO'; }
  function tensaoPadrao(dist, conexao) {
    const ts = tensoes(dist);
    if (ts.indexOf('127') >= 0 && ts.indexOf('220') >= 0) return conexao === 'MONOFÁSICO' ? '127' : '220';
    return ts[0] || '';
  }
  function cidadeLista(c) { return String(c || '').trim(); }

  function novaLinhaEquip(tipo) { return tipo === 'inv' ? { qtd: '', fab: '', modelo: '', pot: '', tensao: '', crm: '' } : { qtd: '', fab: '', modelo: '', area: '', pot: '', crm: '' }; }

  /** Linha de equipamento (módulo ou inversor) a partir do cadastro/placa, já casada com a lista oficial. */
  function linhaEquip(tipo, eq, placa, qtd, lista, dist) {
    const fabricante = (eq && eq.fabricante) || (placa && placa.marca) || '';
    const mod = (eq && eq.modelo) || (placa && placa.modelo) || '';
    const potW = num((eq && eq.potencia) || (placa && placa.potencia));
    const salvo = eq && eq.energisa && eq.energisa[dist];
    const c = salvo && salvo.fab ? { fab: salvo.fab, modelo: salvo.modelo || OUTRO } : casar(lista, fabricante, mod, potW);
    const crm = [fabricante, mod].filter(Boolean).join(' ').trim();
    if (tipo === 'mod') {
      const kw = potW > 0 ? potW / 1000 : 0;
      const area = eq && App.Calc && App.Calc.areaModulo ? num(App.Calc.areaModulo(eq)) : 0;
      return { qtd: qtd > 0 ? String(qtd) : '', fab: c.fab, modelo: c.modelo, area: area > 0 && qtd > 0 ? geral(U.round(area * qtd, 2)) : '', pot: kw > 0 ? geral(kw) : '',
        crm: crm, equipamentoId: eq ? eq.id : '' };
    }
    const tensao = eq && eq.tensao ? (String(eq.tensao).match(/\d+/) || [''])[0] : '';
    return { qtd: qtd > 0 ? String(qtd) : '', fab: c.fab, modelo: c.modelo, pot: potW > 0 ? geral(potW) : '', tensao: tensao, crm: crm, equipamentoId: eq ? eq.id : '' };
  }

  function checklistPadrao(docCliente) {
    const pj = digitos(docCliente).length === 14;
    const o = { '1': 'X', '1.4': 'X', '2.1': 'X', '2.3': 'X', '2.4': 'X', '3.1': 'NÃO', '3.4': 'X' };
    o[pj ? '1.1' : '1.2'] = 'X';
    return o;
  }

  /**
   * Memorial inicial da instalação: cliente (cadastro), proposta aprovada (classe, ligação, equipamentos) e instalação (UC, placas,
   * previsão), com os padrões do último memorial do projetista (Configurações › homologacao). L = listas oficiais.
   */
  function sugerir(inst, ctx, L, padroes) {
    const S = App.Store;
    const prop = inst.propostaId && S ? S.get('propostas', inst.propostaId) : null;
    const cli = (inst.clienteId && S && S.get('clientes', inst.clienteId)) || (prop && prop.clienteId && S && S.get('clientes', prop.clienteId)) || {};
    const conc = (App.Instalacao && App.Instalacao.concessionariaDe ? App.Instalacao.concessionariaDe(inst, ctx) : '') || inst.concessionaria || '';
    const dist = distribuidora(conc);
    const lista = listaDe(L, dist);
    let r = null;
    try { r = prop ? App.Calc.calcular(U.clone(prop), ctx) : null; } catch (e) { r = null; }
    const eqs = (ctx && ctx.equipamentos) || (S ? S.list('equipamentos') : []);
    const porId = function (id) { return id ? eqs.find(function (e) { return e.id === id; }) || null : null; };
    const pl = inst.placas || {};
    const pm = pl.modulo || {}, pi = pl.inversor || {};
    const eqMod = porId(pm.equipamentoId) || (r && r.modulo) || null;
    const eqInv = porId(pi.equipamentoId) || (r && r.inversor) || null;
    const qMod = num(pm.quantidade) || (r ? num(r.nModulos) : 0);
    const qInv = num(pi.quantidade) || (r ? num(r.nInversores) : 0);
    const conexao = conexaoDe((prop && prop.ligacao) || '');
    const tel = digitos(cli.telefone || inst.telefone);
    const pad = padroes || {};
    const previsao = App.Instalacao && App.Instalacao.previsaoConclusao ? App.Instalacao.previsaoConclusao(inst) : '';
    const dPrev = previsao ? new Date(previsao + 'T12:00:00') : null;
    const concluida = App.Instalacao && App.Instalacao.status ? App.Instalacao.status(inst) === 'concluida' : false;
    const classe = classeDe(prop);
    const h = {
      versao: 'V6', distribuidora: dist,
      uc: inst.uc || '', classe: classe, titular: cli.nome || inst.clienteNome || '', logradouro: cli.endereco || '', numero: cli.numero || '',
      bairro: cli.bairro || '', cidade: cidadeLista(cli.cidade || inst.cidade), uf: cli.uf || inst.uf || 'MS', cep: digitos(cli.cep), email: cli.email || '',
      telefone: tel.length === 10 ? tel : '', celular: tel.length === 10 ? '' : tel, documento: digitos(cli.documento),
      tensao: pad.tensao && tensoes(dist).indexOf(pad.tensao) >= 0 ? pad.tensao : tensaoPadrao(dist, conexao), conexao: conexao, ramal: pad.ramal || 'AÉREO',
      potInstalada: '', fonte: FONTES[0], tipoGeracao: TIPOS_GERACAO[1], resp: { nome: '', telefone: '', email: '' },
      cargas: [], checklist: checklistPadrao(cli.documento),
      padrao: { disjGeral: '', fatorPot: pad.fatorPot || '0,92', modalidade: pad.modalidade || MODALIDADES[0], potTrafo: '', hastes: pad.hastes || '1' },
      protecoes: { dpsCa: pad.dpsCa || '', disjCa: '', dpsCc: pad.dpsCc || '', disjCc: '' },
      utm: { fuso: pad.fuso || '21K', x: '', y: '' },
      tipoTensao: pad.tipoTensao || 'BAIXA', cabos: pad.cabos || '1', bitolas: { fase: pad.bitFase || '', neutro: pad.bitNeutro || '', terra: pad.bitTerra || '' },
      gdInstalado: concluida ? 'SIM' : 'NÃO',
      previsao: { mes: dPrev ? MESES[dPrev.getMonth()] : '', ano: dPrev ? String(dPrev.getFullYear()) : '' },
      zona: classe === 'RURAL' ? 'RURAL' : (pad.zona || 'URBANO'),
      modulos: eqMod || pm.modelo ? [linhaEquip('mod', eqMod, pm, qMod, lista.modulos, dist)] : [],
      inversores: eqInv || pi.modelo ? [linhaEquip('inv', eqInv, pi, qInv, lista.inversores, dist)] : [],
      gd: { modulos: [], inversores: [] }, beneficiarias: [], observacoes: '', assinarProjetista: true,
      atualizadoEm: new Date().toISOString()
    };
    if (concluida) h.checklist['3.1'] = 'SIM';
    // tensão nominal do inversor: a do cadastro ou, sem ela, a de atendimento da UC
    h.inversores.forEach(function (x) { if (!x.tensao) x.tensao = /^\d+$/.test(h.tensao) && num(h.tensao) >= 200 ? h.tensao : '220'; });
    return h;
  }

  /** Atualiza os dados do cliente e da proposta (cabeçalho) mantendo os campos do projetista. */
  function puxarCrm(h, inst, ctx, L, padroes) {
    const n = sugerir(inst, ctx, L, padroes);
    ['distribuidora', 'uc', 'classe', 'titular', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'cep', 'email', 'telefone', 'celular', 'documento', 'conexao']
      .forEach(function (k) { if (n[k] !== '' && n[k] != null) h[k] = n[k]; });
    if (!h.modulos.length) h.modulos = n.modulos;
    if (!h.inversores.length) h.inversores = n.inversores;
    if (tensoes(h.distribuidora).indexOf(h.tensao) < 0) h.tensao = n.tensao;
    return h;
  }

  /** Padrões do projetista guardados a cada memorial gerado (pré-preenchem o próximo). */
  function padroesDe(h) {
    return { tensao: h.tensao, ramal: h.ramal, fatorPot: h.padrao.fatorPot, modalidade: h.padrao.modalidade, hastes: h.padrao.hastes, dpsCa: h.protecoes.dpsCa,
      dpsCc: h.protecoes.dpsCc, fuso: h.utm.fuso, tipoTensao: h.tipoTensao, cabos: h.cabos, bitFase: h.bitolas.fase, bitNeutro: h.bitolas.neutro, bitTerra: h.bitolas.terra, zona: h.zona };
  }

  // ------------------------------------------------------------ fórmulas da planilha
  function calcular(h) {
    const cargas = (h.cargas || []).slice(0, LIMITES.cargas).map(function (c) {
      const kw = tem(c.w) && tem(c.qtd) ? num(c.w) * num(c.qtd) / 1000 : null;
      const dem = kw != null && tem(c.fator) ? num(c.fator) * kw : null;
      return { qtd: c.qtd, equip: c.equip, w: c.w, fator: c.fator, kw: kw, dem: dem };
    });
    const totKw = cargas.reduce(function (s, c) { return s + (c.kw || 0); }, 0);
    const totDem = cargas.reduce(function (s, c) { return s + (c.dem || 0); }, 0);
    const soma = function (rows, f) { return (rows || []).reduce(function (s, x) { return s + f(x); }, 0); };
    const mods = (h.modulos || []).slice(0, LIMITES.modulos), invs = (h.inversores || []).slice(0, LIMITES.inversores);
    const gm = ((h.gd && h.gd.modulos) || []).slice(0, LIMITES.gd), gi = ((h.gd && h.gd.inversores) || []).slice(0, LIMITES.gd);
    const sub = function (x) { return tem(x.qtd) && tem(x.pot) ? num(x.qtd) * num(x.pot) : 0; };
    const modTot = soma(mods, sub), invTot = soma(invs, sub), gdModTot = soma(gm, sub), gdInvTot = soma(gi, sub);
    const area = function (x) { return tem(x.area) ? num(x.area) : 0; };
    const potGeracao = Math.min(modTot, invTot) + Math.min(gdModTot, gdInvTot);
    const fases = { 'MONOFÁSICO': 1, 'BIFÁSICO': 2, 'TRIFÁSICO': 3 }[h.conexao] || '';
    const linhaDisp = POTENCIA_DISP.find(function (t) { return t[0] === String(h.tensao) && t[1] === h.conexao && t[2] === num(h.padrao && h.padrao.disjGeral); });
    return {
      cargas: cargas, totKw: totKw, totDem: totDem, potInstalada: tem(h.potInstalada) ? num(h.potInstalada) : totDem,
      mods: mods, invs: invs, gm: gm, gi: gi, modTot: modTot, invTot: invTot, gdModTot: gdModTot, gdInvTot: gdInvTot,
      modArea: soma(mods, area), gdArea: soma(gm, area), modQtd: soma(mods, function (x) { return num(x.qtd); }), invQtd: soma(invs, function (x) { return num(x.qtd); }),
      potGeracao: potGeracao, nFases: fases, potDisponibilizada: linhaDisp ? linhaDisp[3] : null,
      beneficiarias: (h.beneficiarias || []).filter(function (b) { return String(b.uc || '').trim(); }).slice(0, LIMITES.beneficiarias),
      temGd: gm.some(function (x) { return tem(x.qtd); }) || gi.some(function (x) { return tem(x.qtd); })
    };
  }

  /** Observações do memorial: aviso das UCs beneficiárias, modelos fora da lista oficial e o texto do projetista. */
  function observacoes(h, L) {
    const lista = listaDe(L, h.distribuidora);
    const c = calcular(h);
    const linhas = [];
    if (c.beneficiarias.length) linhas.push('>>>POSSUI UC BENEFICIÁRIA<<<');
    const fora = [];
    c.mods.forEach(function (m) { if (tem(m.qtd) && situacao(lista.modulos, m.fab, m.modelo) !== 'lista' && m.crm) fora.push('MODELO MODULO: ' + maiusc(m.crm)); });
    c.invs.forEach(function (m) { if (tem(m.qtd) && situacao(lista.inversores, m.fab, m.modelo) !== 'lista' && m.crm) fora.push('MODELO INVERSOR: ' + maiusc(m.crm)); });
    if (fora.length) linhas.push(fora.join(' - '));
    if (String(h.observacoes || '').trim()) linhas.push(String(h.observacoes).trim());
    return linhas.join('\n');
  }

  /** Páginas do PDF (na ordem da planilha): as condicionais entram quando há GD existente / UCs beneficiárias. */
  function paginas(h) {
    const c = calcular(h);
    return ['solicitacao', 'carga', 'checklist'].concat(c.temGd ? ['gd'] : [], ['memorial', 'memorial2'], c.beneficiarias.length ? ['beneficiarias'] : [], ['diagrama']);
  }

  /** Valores de cada campo do mapa ("pagina.campo" → texto), com os formatos da planilha. */
  function valores(h, L) {
    const c = calcular(h);
    const v = {};
    const put = function (k, x) { if (x !== '' && x != null) v[k] = String(x); };
    const ct = contatos(h.distribuidora);
    const tel = telefone(h.telefone), cel = telefone(h.celular);
    const resp = h.resp || {};
    const doc = documento(h.documento), cepF = cep(h.cep);
    // página 1 — solicitação
    [['uc', h.uc], ['classe', h.classe], ['titular', h.titular], ['logradouro', h.logradouro], ['numero', h.numero], ['bairro', h.bairro], ['uf', h.uf], ['cep', cepF],
      ['email', h.email], ['cidade', h.cidade], ['celular', cel], ['telefone', tel], ['cpf', doc], ['potInstalada', dec2(c.potInstalada)], ['tensao', h.tensao],
      ['conexao', h.conexao], ['ramal', h.ramal], ['potGeracao', dec2(c.potGeracao)], ['fonte', h.fonte], ['tipoGeracao', h.tipoGeracao],
      ['distEmpresa', ct.empresa], ['distTelefone', ct.telefone], ['distEmail', ct.email], ['distArea', ct.area], ['distLink', ct.link],
      ['respNome', resp.nome || h.titular], ['respTelefone', telefone(resp.telefone || h.celular || h.telefone)], ['respEmail', resp.email || h.email]]
      .forEach(function (x) { put('solicitacao.' + x[0], x[1]); });
    // página 2 — relação de carga
    [['uc', h.uc], ['classe', h.classe], ['titular', h.titular], ['logradouro', h.logradouro], ['numero', h.numero], ['bairro', h.bairro], ['cidade', h.cidade],
      ['uf', h.uf], ['cep', cepF], ['email', h.email], ['celular', cel], ['telefone', tel], ['cpf', doc]].forEach(function (x) { put('carga.' + x[0], x[1]); });
    c.cargas.forEach(function (l, i) {
      const p = 'carga.l' + (i + 1) + '_';
      put(p + 'qtd', l.qtd); put(p + 'equip', maiusc(l.equip)); put(p + 'w', geral(l.w)); put(p + 'kw', l.kw != null ? geral(l.kw) : ''); put(p + 'fator', geral(l.fator)); put(p + 'dem', l.dem != null ? dec2(l.dem) : '');
    });
    put('carga.totKw', geral(c.totKw)); put('carga.totDem', dec2(c.totDem));
    // página 3 — checklist
    Object.keys(h.checklist || {}).forEach(function (k) { if (h.checklist[k]) put('checklist.k' + k, h.checklist[k]); });
    // GD existente
    c.gm.forEach(function (m, i) {
      const p = 'gd.mod' + (i + 1) + '_';
      if (!tem(m.qtd)) return;
      put(p + 'qtd', m.qtd); put(p + 'fab', m.fab); put(p + 'modelo', m.modelo); put(p + 'area', geral(m.area)); put(p + 'pot', geral(m.pot)); put(p + 'sub', geral(num(m.qtd) * num(m.pot)));
    });
    c.gi.forEach(function (m, i) {
      const p = 'gd.inv' + (i + 1) + '_';
      if (!tem(m.qtd)) return;
      put(p + 'qtd', m.qtd); put(p + 'fab', m.fab); put(p + 'modelo', m.modelo); put(p + 'pot', geral(m.pot)); put(p + 'sub', geral(num(m.qtd) * num(m.pot))); put(p + 'tensao', m.tensao);
    });
    put('gd.areaTot', geral(c.gdArea) + 'm²'); put('gd.potTot', geral(c.gdModTot)); put('gd.invTot', geral(c.gdInvTot));
    // memorial descritivo
    const pd = h.padrao || {}, pr = h.protecoes || {}, b = h.bitolas || {}, utm = h.utm || {};
    [['uc', maiusc(h.uc)], ['classe', maiusc(h.classe)], ['cpf', doc], ['titular', maiusc(h.titular)], ['logradouro', maiusc(h.logradouro)], ['numero', h.numero],
      ['bairro', maiusc(h.bairro)], ['cidade', maiusc(h.cidade)], ['email', h.email], ['uf', h.uf], ['cep', cepF], ['telefone', digitos(h.telefone)], ['celular', digitos(h.celular)],
      ['nFases', c.nFases], ['ramal', h.ramal], ['tipoPadrao', h.conexao], ['tensao', h.tensao], ['disjGeral', pd.disjGeral], ['fatorPot', pd.fatorPot],
      ['dpsCa', pr.dpsCa], ['disjCa', pr.disjCa], ['dpsCc', pr.dpsCc], ['disjCc', pr.disjCc], ['modalidade', pd.modalidade], ['potTrafo', pd.potTrafo], ['hastes', pd.hastes],
      ['fuso', utm.fuso], ['utmX', utm.x], ['utmY', utm.y], ['tipoTensao', h.tipoTensao], ['cabos', h.cabos], ['potGeracao', dec2(c.potGeracao)],
      ['bitFase', b.fase], ['bitNeutro', b.neutro], ['bitTerra', b.terra], ['gdInstalado', h.gdInstalado], ['mes', h.previsao && h.previsao.mes], ['ano', h.previsao && h.previsao.ano],
      ['zona', h.zona], ['observacoes', observacoes(h, L)], ['modAreaTot', geral(c.modArea) + 'm²'], ['modPotTot', geral(c.modTot)], ['invPotTot', geral(c.invTot)]]
      .forEach(function (x) { put('memorial.' + x[0], x[1]); });
    c.mods.forEach(function (m, i) {
      const p = 'memorial.mod' + (i + 1) + '_';
      if (!tem(m.qtd)) return;
      put(p + 'qtd', m.qtd); put(p + 'fab', m.fab); put(p + 'modelo', m.modelo); put(p + 'area', geral(m.area)); put(p + 'pot', geral(m.pot)); put(p + 'sub', geral(num(m.qtd) * num(m.pot)));
    });
    c.invs.forEach(function (m, i) {
      const p = 'memorial.inv' + (i + 1) + '_';
      if (!tem(m.qtd)) return;
      put(p + 'qtd', m.qtd); put(p + 'fab', m.fab); put(p + 'modelo', m.modelo); put(p + 'pot', geral(m.pot)); put(p + 'sub', geral(num(m.qtd) * num(m.pot))); put(p + 'tensao', m.tensao);
    });
    // UCs beneficiárias
    if (c.beneficiarias.length) {
      [['uc', h.uc], ['classe', maiusc(h.classe)], ['titular', maiusc(h.titular)], ['logradouro', maiusc(h.logradouro)], ['numero', h.numero], ['bairro', maiusc(h.bairro)],
        ['cidade', maiusc(h.cidade)], ['email', h.email], ['uf', maiusc(h.uf)], ['cep', cepF], ['celular', cel], ['telefone', tel], ['cpf', doc]]
        .forEach(function (x) { put('beneficiarias.' + x[0], x[1]); });
      c.beneficiarias.forEach(function (bn, i) {
        const p = 'beneficiarias.l' + (i + 1) + '_';
        put(p + 'uc', bn.uc); put(p + 'nome', maiusc(bn.nome)); put(p + 'cpf', documento(bn.cpf)); put(p + 'endereco', maiusc(bn.endereco)); put(p + 'pct', geral(bn.pct));
      });
      put('beneficiarias.pctTotal', geral(c.beneficiarias.reduce(function (s, bn) { return s + num(bn.pct); }, 0)));
    }
    // diagrama unifilar (repete os valores digitados; rótulos com os espaços das fórmulas da planilha)
    const lista = function (rows, campo) { return rows.filter(function (x) { return tem(x.qtd); }).map(function (x) { return x[campo]; }).join(','); };
    [['tensao', h.tensao], ['nFases', c.nFases], ['cabos', h.cabos], ['bitFase', b.fase], ['bitNeutro', b.neutro], ['bitTerra', b.terra], ['protecao', pd.disjGeral],
      ['modFab', lista(c.mods, 'fab')], ['modModelo', lista(c.mods, 'modelo')], ['modQtd', geral(c.modQtd)], ['modPot', geral(c.modTot) + ' kWp'],
      ['invFab', lista(c.invs, 'fab')], ['invModelo', lista(c.invs, 'modelo')], ['invQtd', geral(c.invQtd)], ['invPot', geral(c.invTot) + ' kW'],
      ['dpsCa', pr.dpsCa], ['dpsCc', pr.dpsCc], ['uc', h.uc], ['titular', maiusc(h.titular)], ['logradouro', maiusc([h.logradouro, h.numero].filter(Boolean).join(', '))],
      ['bairro', maiusc(h.bairro)], ['cidade', maiusc(h.cidade)], ['cep', digitos(h.cep)], ['fuso', utm.fuso], ['utmX', utm.x], ['utmY', utm.y],
      ['dDisjGeral', (pd.disjGeral || '') + 'A'], ['dDisjCa', ' '.repeat(17) + (pr.disjCa || '') + 'A'], ['dDpsCa', '  ' + (pr.dpsCa || '') + 'kA'],
      ['dDisjCc', ' '.repeat(13) + (pr.disjCc || '') + 'A'], ['dDpsCc', (pr.dpsCc || '') + 'kA'], ['dInvPot', geral(c.invTot) + ' kW'], ['dModPot', geral(c.modTot) + ' kWp'],
      ['dTensao', (h.tensao || '') + 'V']].forEach(function (x) { put('diagrama.' + x[0], x[1]); });
    return v;
  }

  /**
   * Células com a formatação condicional da planilha "vazia → hachura vermelha" (campos obrigatórios) que ficam vazias nas páginas
   * do memorial: [{pagina, campo, r: [x0, y0, x1, y1]}]. Preenchida, a célula fica branca, como no Excel.
   */
  function vermelhas(vals, mapa, pags) {
    const idx = {};
    (pags || mapa.paginas).forEach(function (k) { idx[mapa.paginas.indexOf(k)] = k; });
    return (mapa.condicionais || []).filter(function (c) {
      return idx[c.p] !== undefined && !String(vals[c.campo] == null ? '' : vals[c.campo]).trim();
    }).map(function (c) { return { pagina: idx[c.p], campo: c.campo, r: c.r }; });
  }

  /** Campos obrigatórios da planilha que faltam (mesma lista da validação da aba SAIDA) e regras das UCs beneficiárias. */
  function pendencias(h) {
    const c = calcular(h);
    const p = [];
    const falta = function (cond, txt) { if (cond) p.push(txt); };
    falta(!String(h.uc || '').trim(), 'Código do cliente (UC)');
    falta(!String(h.titular || '').trim(), 'Titular da UC');
    falta(!digitos(h.documento), 'CPF/CNPJ do titular');
    falta(!tem(h.padrao.disjGeral), 'Disjuntor geral (A)');
    falta(!tem(h.padrao.fatorPot), 'Fator de potência');
    falta(!h.padrao.modalidade, 'Modalidade');
    falta(!h.conexao, 'Tipo de conexão');
    falta(!h.utm.fuso, 'Coordenada (fuso)');
    falta(!digitos(h.utm.x), 'Coordenada X (UTM)');
    falta(!digitos(h.utm.y), 'Coordenada Y (UTM)');
    falta(!h.tensao, 'Tensão de fornecimento');
    falta(!h.previsao.mes, 'Previsão de ligação (mês)');
    falta(!h.previsao.ano, 'Previsão de ligação (ano)');
    falta(!(c.totKw > 0), 'Relação de carga (carga instalada)');
    falta(!tem(h.cabos), 'Cabos por fase');
    falta(!h.zona, 'Zona de atendimento');
    falta(!tem(h.bitolas.fase), 'Bitola do cabo fase');
    falta(!tem(h.bitolas.neutro), 'Bitola do cabo neutro');
    falta(!tem(h.bitolas.terra), 'Bitola do cabo terra');
    falta(!tem(h.padrao.hastes), 'Número de hastes');
    falta(!(c.potGeracao > 0), 'Potência de geração (módulos e inversores)');
    falta(!h.gdInstalado, 'Sistema GD já instalado?');
    falta(c.invs.some(function (x) { return tem(x.qtd) && !String(x.tensao || '').trim(); }), 'Tensão nominal do inversor');
    falta(!c.invs.some(function (x) { return tem(x.qtd) && x.modelo; }), 'Modelo do inversor');
    falta(!c.mods.some(function (x) { return tem(x.qtd) && x.modelo; }), 'Modelo do módulo');
    falta(!tem(h.protecoes.dpsCa) || !tem(h.protecoes.disjCa) || !tem(h.protecoes.dpsCc) || !tem(h.protecoes.disjCc), 'Proteções (DPS e disjuntores CA e CC)');
    falta(!(h.checklist || {})['3.1'], 'Item 3.1 do formulário (vistoria)');
    if (c.beneficiarias.length) {
      const soma = c.beneficiarias.reduce(function (s, b) { return s + num(b.pct); }, 0);
      falta(soma > 100 + 1e-9, 'UCs beneficiárias: a soma dos percentuais passa de 100%');
      falta(c.beneficiarias.some(function (b) { return digitos(b.uc) && digitos(b.uc) === digitos(h.uc); }), 'UCs beneficiárias: a UC beneficiária deve ser diferente da geradora');
    }
    return p;
  }

  /** Nome do arquivo como a planilha: TITULAR_UC_código.pdf */
  function nomeArquivo(h) {
    const t = semAcento(maiusc(h.titular || 'MEMORIAL')).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    return t + '_UC_' + (digitos(h.uc) || 'SEM_UC') + '.pdf';
  }

  App.Homologacao = {
    TENSOES: TENSOES, CLASSES: CLASSES, CONEXOES: CONEXOES, RAMAIS: RAMAIS, MODALIDADES: MODALIDADES, FUSOS: FUSOS, TRAFOS: TRAFOS, FONTES: FONTES,
    TIPOS_GERACAO: TIPOS_GERACAO, MESES: MESES, ITENS: ITENS, LIMITES: LIMITES, OUTROS: OUTROS, OUTRO: OUTRO,
    listas: listas, mapa: mapa, modelo: modelo, fonte: fonte, ARQ_FONTES: ARQ_FONTES, textoPdf: textoPdf, distribuidora: distribuidora, contatos: contatos, tensoes: tensoes, listaDe: listaDe, casar: casar, situacao: situacao,
    sugerir: sugerir, puxarCrm: puxarCrm, padroesDe: padroesDe, calcular: calcular, observacoes: observacoes, paginas: paginas, valores: valores,
    pendencias: pendencias, vermelhas: vermelhas, nomeArquivo: nomeArquivo, novaLinhaEquip: novaLinhaEquip, checklistPadrao: checklistPadrao,
    fmt: { geral: geral, dec2: dec2, telefone: telefone, documento: documento, cep: cep, digitos: digitos }
  };
})(window.App);
