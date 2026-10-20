/* Configurações: empresa, premissas técnicas/financeiras, textos padrão da proposta e backup dos dados. */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, S = App.Store, D = App.DEFAULTS;
  const h = U.h;

  /** Editor de linhas (lista de objetos) com inclusão, exclusão e reordenação. */
  UI.editorLinhas = function (lista, colunas, aoMudar, rotuloAdd, novaLinha) {
    const box = h('div.editor-linhas');
    function desenhar() {
      box.innerHTML = '';
      const tb = h('tbody');
      lista.forEach(function (lin, i) {
        tb.appendChild(h('tr',
          colunas.map(function (c) {
            const campo = UI.campo({ k: c.k, type: c.type, options: c.options, placeholder: c.placeholder, suffix: c.suffix }, lin, function () { if (aoMudar) aoMudar(); });
            return h('td' + (c.cls ? '.' + c.cls : ''), { style: c.w ? { width: c.w } : null }, campo);
          }),
          h('td.acoes-col',
            h('button.btn-icone', { type: 'button', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0, onclick: function () { lista.splice(i - 1, 0, lista.splice(i, 1)[0]); desenhar(); if (aoMudar) aoMudar(); } }, '↑'),
            h('button.btn-icone.perigo', { type: 'button', title: 'Remover', 'aria-label': 'Remover', onclick: function () { lista.splice(i, 1); desenhar(); if (aoMudar) aoMudar(); } }, '×'))
        ));
      });
      box.appendChild(h('table.tabela.editavel', h('thead', h('tr', colunas.map(function (c) { return h('th', c.label); }), h('th.acoes-col', ''))), tb));
      box.appendChild(h('button.btn.pequeno', {
        type: 'button', onclick: function () {
          const n = novaLinha ? novaLinha() : {};
          lista.push(n); desenhar(); if (aoMudar) aoMudar();
        }
      }, rotuloAdd || '+ Adicionar linha'));
    }
    desenhar();
    box.redesenhar = desenhar;
    return box;
  };

  function rodapeSalvar(onSalvar, extra) {
    return h('div.barra-salvar', extra || null, h('button.btn.primario', { type: 'button', onclick: onSalvar }, 'Salvar alterações'));
  }

  /* ------------------------------------------------------------ empresa */

  UI.rota('/empresa', function (cont) {
    const emp = U.clone(S.config().empresa);
    let sujo = false;
    const marcar = function () { sujo = true; };
    UI.guarda = function () { return !sujo || confirm('Há alterações não salvas. Deseja sair mesmo assim?'); };

    const prev = h('img.logo-preview', { alt: 'Logotipo', src: emp.logo || App.LOGO_PADRAO });
    const arquivo = h('input', {
      type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async function () {
        const f = arquivo.files[0];
        if (!f) return;
        if (f.size > 1.5 * 1024 * 1024) { UI.toast('Use uma imagem de até 1,5 MB.', 'erro'); return; }
        emp.logo = await U.readFileAsDataURL(f);
        prev.src = emp.logo;
        marcar();
      }
    });
    const logoBox = h('div.campo.span2', h('label', 'Logotipo (capa e cabeçalho da proposta)'),
      h('div.logo-box', prev, h('div', arquivo,
        h('button.btn.pequeno', { type: 'button', onclick: function () { emp.logo = null; prev.src = App.LOGO_PADRAO; marcar(); } }, 'Usar logotipo padrão'),
        h('small.ajuda', 'PNG ou JPG, preferencialmente horizontal (proporção ≈ 1,9 : 1).'))));

    cont.appendChild(UI.cabecalho('Empresa', 'Dados que aparecem na capa, cabeçalho, rodapé e bloco de assinatura da proposta.'));
    cont.appendChild(h('div.card', UI.grade([
      { k: 'razao', label: 'Razão social / nome da empresa', required: true, cls: 'span2' },
      { k: 'nomeCurto', label: 'Nome curto', help: 'Usado em "Garantia Instalação …".' },
      { k: 'cnpj', label: 'CNPJ' },
      { k: 'registroTipo', label: 'Conselho / registro', placeholder: 'CFT-BR, CREA…' },
      { k: 'registro', label: 'Nº do registro' },
      { k: 'cidade', label: 'Cidade' },
      { k: 'uf', label: 'UF', type: 'select', options: U.UFS },
      { k: 'responsavel', label: 'Responsável técnico' },
      { k: 'cargo', label: 'Cargo do responsável', placeholder: 'Engenheiro Responsável' },
      { k: 'telefone', label: 'Telefone' },
      { k: 'email', label: 'E-mail', type: 'email' },
      { secao: 'Proposta' },
      { k: 'prefixo', label: 'Prefixo do nº da proposta', help: 'Formato: PREFIXO-AAAAMMDD-NNN' },
      { k: 'validadeDias', label: 'Validade padrão', type: 'int', suffix: 'dias' },
      { k: 'papel', label: 'Tamanho do papel', type: 'select', options: [{ v: 'letter', t: 'Carta (igual ao modelo)' }, { v: 'a4', t: 'A4' }] },
      { el: logoBox },
      { secao: 'Contratos (dados ficam apenas neste navegador)' },
      { k: 'razaoSocial', label: 'Razão social (contratos)', cls: 'span2' },
      { k: 'nomeFantasia', label: 'Nome fantasia' },
      { k: 'crea', label: 'Registro CREA' },
      { k: 'endereco', label: 'Endereço (rua, nº)' },
      { k: 'bairro', label: 'Bairro' },
      { k: 'cep', label: 'CEP' },
      { k: 'horarioAtendimento', label: 'Horário de atendimento' },
      { k: 'sloganContrato', label: 'Frase do cabeçalho do contrato', cls: 'span2' },
      { k: 'prefixoContrato', label: 'Prefixo do nº do contrato', help: 'Formato: PREFIXO-AAAAMMDD-NNN' },
      { secao: 'Dados bancários (aparecem no contrato)' },
      { k: 'banco.banco', label: 'Banco' },
      { k: 'banco.agencia', label: 'Agência' },
      { k: 'banco.conta', label: 'Conta corrente' },
      { k: 'banco.titular', label: 'Titular' },
      { k: 'banco.documento', label: 'CPF/CNPJ do titular' },
      { k: 'banco.pix', label: 'Chave PIX' }
    ], emp, marcar)));
    cont.appendChild(rodapeSalvar(function () {
      if (!String(emp.razao || '').trim()) { UI.toast('Informe a razão social.', 'erro'); return; }
      try { S.salvarConfig('empresa', emp); } catch (e) { UI.toast(e.message, 'erro'); return; }
      sujo = false;
      App.atualizarMarca();
      UI.toast('Dados da empresa salvos.', 'ok');
    }));
  });

  /* ------------------------------------------------------------ premissas */

  UI.rota('/premissas', function (cont) {
    const prem = U.clone(S.config().premissas);
    let sujo = false;
    const marcar = function () { sujo = true; };
    UI.guarda = function () { return !sujo || confirm('Há alterações não salvas. Deseja sair mesmo assim?'); };

    cont.appendChild(UI.cabecalho('Premissas técnicas e financeiras', 'Valores padrão aplicados às NOVAS propostas (cada proposta guarda uma cópia que pode ser ajustada).'));

    cont.appendChild(h('div.card', h('h3', 'Geração e dimensionamento'), UI.grade([
      { k: 'pr', label: 'Performance Ratio (PR)', type: 'number', help: 'Ex.: 0,80' },
      { k: 'degradacao', label: 'Degradação anual dos módulos', type: 'pct' },
      { k: 'simultaneidade', label: 'Simultaneidade (autoconsumo direto)', type: 'pct', help: 'Parcela da geração consumida na hora (não paga Fio B); o restante é injetado e paga Fio B quando compensado.' },
      { k: 'areaModulo', label: 'Área por módulo (padrão)', type: 'number', suffix: 'm²' },
      { k: 'fdgMin', label: 'FDG mínimo', type: 'number', help: 'FDG (fator de dimensionamento global) = potência FV (Pcc) ÷ potência do inversor (Pca)' },
      { k: 'fdgMax', label: 'FDG máximo', type: 'number', help: 'Acima dele o inversor limita a potência (clipping).' },
      { k: 'fdgAlvo', label: 'FDG alvo (seleção automática)', type: 'number' },
      { k: 'fatorVocFrio', label: 'Fator de correção Voc (frio)', type: 'number', help: 'Usado na verificação de strings.' },
      { secao: 'Custo de disponibilidade (kWh/mês)' },
      { k: 'disponibilidade.mono', label: 'Monofásica', type: 'number', suffix: 'kWh' },
      { k: 'disponibilidade.bi', label: 'Bifásica', type: 'number', suffix: 'kWh' },
      { k: 'disponibilidade.tri', label: 'Trifásica', type: 'number', suffix: 'kWh' },
      { k: 'regraDisponibilidade', label: 'Conta mínima com geração (grupo B)', type: 'select', cls: 'span2', options: [
        { v: 'maior', t: 'Maior valor: disponibilidade ou energia não compensada + Fio B' },
        { v: 'disponibilidade', t: 'Disponibilidade + Fio B sobre o restante da energia compensada' }
      ], help: '1ª opção: REN ANEEL 1.000/2021, art. 655-I (os dois não se somam). 2ª: leitura adotada por algumas distribuidoras. A COSIP é somada à parte.' },
      { secao: 'Limite de referência de potência por tipo de ligação (alerta)' },
      { k: 'limiteKwp.mono', label: 'Monofásica', type: 'number', suffix: 'kWp' },
      { k: 'limiteKwp.bi', label: 'Bifásica', type: 'number', suffix: 'kWp' },
      { k: 'limiteKwp.tri', label: 'Trifásica', type: 'number', suffix: 'kWp' }
    ], prem, marcar, 3)));

    cont.appendChild(h('div.card', h('h3', 'Financeiro'), UI.grade([
      { k: 'inflacaoTarifa', label: 'Inflação tarifária', type: 'pct', suffix: '% a.a.' },
      { k: 'reajusteCosip', label: 'Reajuste anual da COSIP', type: 'pct', suffix: '% a.a.', help: '0% = COSIP fixa (valor nominal).' },
      { k: 'reajustarTusd', label: 'Reajustar a TUSD Fio B pela inflação tarifária', type: 'checkbox' },
      { k: 'tma', label: 'Taxa de desconto (TMA)', type: 'pct', suffix: '% a.a.', help: 'Usada no VPL e no payback descontado.' },
      { k: 'tmaNome', label: 'Nome da taxa', placeholder: 'SELIC' },
      { k: 'horizonte', label: 'Horizonte de análise', type: 'int', suffix: 'anos' },
      { k: 'fatorCO2', label: 'Fator de emissão', type: 'number', suffix: 'kg CO₂/kWh' }
    ], prem, marcar, 3)));

    const fioBEd = UI.editorLinhas(prem.fioB, [
      { k: 'ano', label: 'Ano', type: 'int' },
      { k: 'pct', label: '% do Fio B cobrado', type: 'pct' }
    ], marcar, '+ Adicionar ano', function () {
      const ult = prem.fioB.length ? prem.fioB[prem.fioB.length - 1].ano + 1 : new Date().getFullYear();
      return { ano: ult, pct: 1 };
    });
    cont.appendChild(h('div.card', h('h3', 'Cronograma do Fio B — Lei 14.300/2022'), fioBEd,
      UI.grade([{ k: 'fioBDepois', label: 'Percentual após o último ano da tabela', type: 'pct' }], prem, marcar, 3)));

    cont.appendChild(h('div.card', h('h3', 'Sistemas híbridos (baterias)'), UI.grade([
      { k: 'hibrido.dod', label: 'DoD padrão (se a bateria não informar)', type: 'pct' },
      { k: 'hibrido.eficiencia', label: 'Eficiência bateria + inversor', type: 'pct' },
      { k: 'hibrido.fatorSegurancaInversor', label: 'Fator de segurança da potência de backup', type: 'number', help: 'Potência de backup ≥ fator × cargas críticas.' },
      { k: 'hibrido.autonomiaHoras', label: 'Autonomia padrão', type: 'number', suffix: 'h' },
      { k: 'hibrido.trocaBateriaAno', label: 'Substituir baterias no ano', type: 'int', help: '0 = não considerar substituição no fluxo de caixa.' },
      { k: 'hibrido.trocaBateriaPct', label: 'Custo da substituição', type: 'pct', suffix: '% do preço atual' }
    ], prem, marcar, 3)));

    cont.appendChild(rodapeSalvar(function () {
      prem.fioB = prem.fioB.filter(function (x) { return isFinite(x.ano) && x.ano > 0; }).map(function (x) { return { ano: Number(x.ano), pct: U.numOr(x.pct, 0) }; });
      S.salvarConfig('premissas', prem);
      sujo = false;
      UI.toast('Premissas salvas. Valem para as próximas propostas.', 'ok');
    }, h('button.btn', {
      type: 'button', onclick: async function () {
        if (await UI.confirmar('Restaurar todas as premissas para os valores padrão?')) {
          S.salvarConfig('premissas', U.clone(D.premissas));
          sujo = false;
          UI.despachar(true);
          UI.toast('Premissas padrão restauradas.', 'ok');
        }
      }
    }, 'Restaurar padrão')));
  });

  /* ------------------------------------------------------------ textos */

  UI.rota('/textos', function (cont) {
    const tx = U.clone(S.config().textos);
    let sujo = false;
    const marcar = function () { sujo = true; };
    UI.guarda = function () { return !sujo || confirm('Há alterações não salvas. Deseja sair mesmo assim?'); };

    cont.appendChild(UI.cabecalho('Textos padrão da proposta', 'Conteúdo das seções fixas do documento.'));
    cont.appendChild(h('div.card.dica', h('strong', 'Marcadores disponíveis: '),
      '{empresa}, {empresaCurta}, {cidadeEmpresa}, {registroTipo}, {registro}, {concessionaria}, {inversor}, {modulo}, {bateria}, {cliente}, {cidade}, {fdg}, {fdgIcone}, {secDim}. ',
      'Eles são substituídos pelos dados de cada proposta.'));

    cont.appendChild(h('div.card', h('h3', 'Apresentação e encerramento'), UI.grade([
      { k: 'apresentacao', label: 'Apresentação da empresa (seção 1)', type: 'textarea', rows: 4, cls: 'span2' },
      { k: 'slogan', label: 'Frase final (slogan)', cls: 'span2' },
      { k: 'garantiaInstalacao', label: 'Garantia da instalação' },
      { k: 'infraDescricao', label: 'Descrição padrão da infraestrutura CA' },
      { k: 'notaPagamento', label: 'Nota abaixo das opções de pagamento', cls: 'span2' }
    ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Serviços (um por linha)'), UI.grade([
      { k: 'inclusos', label: '✅ Inclusos', type: 'linhas', rows: 9 },
      { k: 'naoInclusos', label: '❌ Não inclusos', type: 'linhas', rows: 9 },
      { k: 'inclusosHibrido', label: '✅ Inclusos adicionais — sistemas híbridos', type: 'linhas', rows: 3 },
      { k: 'naoInclusosHibrido', label: '❌ Não inclusos adicionais — sistemas híbridos', type: 'linhas', rows: 3 },
      { k: 'inclusosBess', label: '✅ Inclusos adicionais — BESS', type: 'linhas', rows: 3 },
      { k: 'naoInclusosBess', label: '❌ Não inclusos adicionais — BESS', type: 'linhas', rows: 3 },
      { k: 'cenariosIntro', label: 'Introdução do comparativo de cenários', type: 'textarea', rows: 3, cls: 'span2' }
    ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Propostas avulsas (serviços complementares)'), UI.grade([
      { k: 'avulsaApresentacao', label: 'Apresentação', type: 'textarea', rows: 3, cls: 'span2' },
      { k: 'avulsaGarantia', label: 'Garantia padrão dos serviços', type: 'textarea', rows: 2, cls: 'span2' },
      { k: 'avulsaInclusos', label: '✅ Inclusos', type: 'linhas', rows: 4 },
      { k: 'avulsaNaoInclusos', label: '❌ Não inclusos', type: 'linhas', rows: 4 }
    ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Cronograma de execução'), UI.editorLinhas(tx.cronograma, [
      { k: 'etapa', label: 'Descrição da etapa' },
      { k: 'prazo', label: 'Prazo estimado', w: '30%' }
    ], marcar, '+ Adicionar etapa', function () { return { etapa: '', prazo: '' }; })));

    cont.appendChild(h('div.card', h('h3', 'Conformidade legal e técnica'), UI.editorLinhas(tx.conformidade, [
      { k: 'norma', label: 'Norma / referência', w: '32%' },
      { k: 'descricao', label: 'Descrição' }
    ], marcar, '+ Adicionar norma', function () { return { norma: '', descricao: '' }; }),
    h('h4.secao-form', 'Adicionais para sistemas híbridos'),
    UI.editorLinhas(tx.conformidadeHibrido, [
      { k: 'norma', label: 'Norma / referência', w: '32%' },
      { k: 'descricao', label: 'Descrição' }
    ], marcar, '+ Adicionar norma', function () { return { norma: '', descricao: '' }; })));

    cont.appendChild(rodapeSalvar(function () {
      S.salvarConfig('textos', tx);
      sujo = false;
      UI.toast('Textos salvos.', 'ok');
    }, h('button.btn', {
      type: 'button', onclick: async function () {
        if (await UI.confirmar('Restaurar todos os textos para o padrão do modelo?')) {
          S.salvarConfig('textos', U.clone(D.textos));
          sujo = false;
          UI.despachar(true);
        }
      }
    }, 'Restaurar padrão')));
  });

  /* ------------------------------------------------------------ modelo de contrato */

  UI.rota('/modelo-contrato', function (cont) {
    const modelo = U.clone(S.config().contrato);
    let sujo = false;
    const marcar = function () { sujo = true; };
    UI.guarda = function () { return !sujo || confirm('Há alterações não salvas. Deseja sair mesmo assim?'); };
    cont.appendChild(UI.cabecalho('Modelo de contrato', 'Cláusulas e termo de garantia usados nos NOVOS contratos (cada contrato guarda uma cópia que pode ser ajustada).'));
    cont.appendChild(h('div.card', App.editorModeloContrato(modelo, marcar)));
    cont.appendChild(rodapeSalvar(function () {
      S.salvarConfig('contrato', modelo);
      sujo = false;
      UI.toast('Modelo de contrato salvo.', 'ok');
    }, h('button.btn', {
      type: 'button', onclick: async function () {
        if (await UI.confirmar('Restaurar o modelo de contrato padrão?')) {
          S.salvarConfig('contrato', undefined);
          sujo = false;
          UI.despachar(true);
          UI.toast('Modelo padrão restaurado.', 'ok');
        }
      }
    }, 'Restaurar padrão')));
  });

  /* ------------------------------------------------------------ backup */

  UI.rota('/dados', function (cont) {
    const kb = Math.round(S.uso() / 1024);
    const arquivo = h('input', {
      type: 'file', accept: 'application/json,.json', onchange: async function () {
        const f = arquivo.files[0];
        if (!f) return;
        try {
          const dados = JSON.parse(await U.readFileAsText(f));
          if (!(await UI.confirmar('Importar este backup substituirá TODOS os dados atuais. Continuar?', 'Importar', true))) return;
          S.importar(dados);
          App.atualizarMarca();
          UI.toast('Backup importado com sucesso.', 'ok');
          UI.ir('#/painel');
        } catch (e) {
          UI.toast('Não foi possível importar: ' + e.message, 'erro');
        } finally { arquivo.value = ''; }
      }
    });
    cont.appendChild(UI.cabecalho('Backup e dados', 'Os dados ficam salvos neste navegador (armazenamento local).'));
    cont.appendChild(h('div.card.dica',
      h('p', h('strong', 'Importante: '), 'cada navegador/computador tem sua própria base. Para usar em outro computador ou não perder informações ao limpar o navegador, exporte o backup regularmente e importe no outro equipamento.'),
      h('p', 'Uso atual: ', h('strong', U.fmt(kb, 0) + ' KB'), ' (limite típico do navegador: ~5.000 KB).')));
    cont.appendChild(h('div.grade-cards',
      h('div.card',
        h('h3', 'Exportar backup'),
        h('p', 'Baixa um arquivo .json com empresa, premissas, textos, cadastros e propostas.'),
        h('button.btn.primario', {
          type: 'button', onclick: function () {
            const blob = new Blob([JSON.stringify(S.exportar(), null, 1)], { type: 'application/json' });
            U.download(blob, 'backup-propostas-solar-' + U.todayISO() + '.json');
          }
        }, 'Exportar .json')),
      h('div.card',
        h('h3', 'Importar backup'),
        h('p', 'Restaura um arquivo exportado anteriormente (substitui os dados atuais).'),
        arquivo),
      h('div.card',
        h('h3', 'Restaurar padrões'),
        h('p', 'Apaga todos os dados e recarrega os cadastros de exemplo.'),
        h('button.btn.perigo', {
          type: 'button', onclick: async function () {
            if (await UI.confirmar('Apagar TODOS os dados (clientes, propostas e cadastros) e restaurar os padrões?', 'Apagar e restaurar', true)) {
              S.restaurarPadroes();
              App.atualizarMarca();
              UI.toast('Dados restaurados para o padrão.', 'ok');
              UI.ir('#/painel');
            }
          }
        }, 'Restaurar padrões'))));
  });
})(window.App);
