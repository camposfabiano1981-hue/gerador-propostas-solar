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
      { k: 'projetosNaProposta', label: 'Projetos realizados por proposta', type: 'int', help: 'Seção após a apresentação (Cadastros › Projetos realizados). 0 = não incluir.' },
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
    // assinatura guardada do responsável técnico: gravada na hora (independe do "Salvar alterações")
    const assResp = Object.assign(App.Assinatura.vazia(), emp.assinaturaResponsavel || {});
    cont.appendChild(h('div.card.assinatura-guardada-card', h('h3', 'Assinatura do responsável técnico'),
      h('p.ajuda-sec', 'Grave uma vez (na tela ou pela foto da assinatura em papel branco). Nas instalações e ordens de serviço, o administrador aplica com um clique em "⭐ Usar assinatura guardada" no campo do técnico.'),
      h('div.assinaturas-grade', App.Assinatura.campo('Assinatura guardada', assResp, { nomePadrao: function () { return emp.responsavel; } }, function () {
        const c = S.config().empresa;
        c.assinaturaResponsavel = assResp.fotoId ? U.clone(assResp) : null;
        S.salvarConfig('empresa', c);
        emp.assinaturaResponsavel = c.assinaturaResponsavel;
        UI.toast(assResp.fotoId ? 'Assinatura do responsável técnico guardada.' : 'Assinatura guardada removida.', 'ok');
      }))));
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
      { k: 'areaModulo', label: 'Área por módulo (padrão)', type: 'number', suffix: 'm²', help: 'Quando o módulo não tem área nem dimensões cadastradas.' },
      { k: 'fdgMin', label: 'FDG mínimo', type: 'number', help: 'FDG (fator de dimensionamento global) = potência FV (Pcc) ÷ potência do inversor (Pca)' },
      { k: 'fdgMax', label: 'FDG máximo', type: 'number', help: 'Acima dele o inversor limita a potência (clipping).' },
      { k: 'fdgAlvo', label: 'FDG alvo (seleção automática)', type: 'number' },
      { k: 'fatorVocFrio', label: 'Fator de correção Voc (frio)', type: 'number', help: 'Usado quando o módulo não tem coeficiente de Voc cadastrado.' },
      { k: 'tempMinima', label: 'Temperatura mínima da célula', type: 'number', suffix: '°C', help: 'Voc no frio = Voc × (1 + |coef. Voc| × (25 − T mín.)). Use a mínima histórica do local.' },
      { k: 'tempMaxCelula', label: 'Temperatura máxima da célula', type: 'number', suffix: '°C', help: 'Vmp no calor, conferido com a faixa MPPT mínima do inversor.' },
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

    prem.preco = Object.assign({}, D.premissas.preco, prem.preco || {});
    cont.appendChild(h('div.card', h('h3', 'Preço da proposta'),
      h('p.ajuda-sec', 'Valor final = (kit + instalação por módulo + infraestrutura CA + outros valores) ÷ (1 − % lucro − % comissão). ' +
        'Lucro e comissão são percentuais do valor final; na proposta, os dois entram na linha de mão de obra + projeto + instalação + homologação.'),
      UI.grade([
        { k: 'instalacaoFaixa1', label: 'Instalação por módulo — faixa 1 (automática)', type: 'money', suffix: '/módulo' },
        { k: 'instalacaoFaixa2', label: 'Instalação por módulo — faixa 2', type: 'money', suffix: '/módulo' },
        { k: 'lucroPct', label: 'Lucro padrão', type: 'pct', suffix: '% do valor final' },
        { k: 'comissaoPct', label: 'Comissão', type: 'pct', suffix: '% do valor final' }
      ], prem.preco, marcar, 3)));

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
      { k: 'hibrido.eficiencia', label: 'Eficiência do ciclo bateria + inversor', type: 'pct', help: 'Usada quando a bateria não informa a sua. Híbrido com bateria no barramento CC: 92–97%.' },
      { k: 'hibrido.fatorSegurancaInversor', label: 'Fator de segurança da potência de backup', type: 'number', help: 'Inversor e baterias ≥ fator × potência das cargas críticas.' },
      { k: 'hibrido.consumoProprioW', label: 'Consumo próprio do inversor híbrido', type: 'number', suffix: 'W', help: 'Ligado 24 h; entra no dimensionamento e na conta. Usado quando o inversor não informa o seu.' },
      { k: 'hibrido.utilizacaoMin', label: 'Utilização mínima do banco na ciclagem', type: 'pct', help: 'Energia ciclada por dia ÷ capacidade disponível, no mês de menor geração.' },
      { k: 'hibrido.fatorPartida', label: 'Pico de partida de motores', type: 'number', suffix: '× potência', help: 'Partida direta de compressores e bombas: 5–8×. Comparado ao surto do inversor.' },
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
      '{empresa}, {empresaCurta}, {cidadeEmpresa}, {registroTipo}, {registro}, {concessionaria}, {inversor}, {modulo}, {bateria}, {cliente}, {cidade}, {fdg}, {fdgIcone}. ',
      'Eles são substituídos pelos dados de cada proposta.'));

    cont.appendChild(h('div.card', h('h3', 'Apresentação e encerramento'), UI.grade([
      { k: 'apresentacao', label: 'Apresentação da empresa', type: 'textarea', rows: 4, cls: 'span2' },
      { k: 'projetosIntro', label: 'Introdução da seção Projetos realizados', type: 'textarea', rows: 2, cls: 'span2' },
      { k: 'slogan', label: 'Frase final (slogan)', cls: 'span2' },
      { k: 'garantiaInstalacao', label: 'Garantia da instalação' },
      { k: 'infraDescricao', label: 'Descrição padrão da infraestrutura CA' },
      { k: 'notaPagamento', label: 'Nota abaixo das opções de pagamento', cls: 'span2' }
    ], tx, marcar),
    h('h4', 'Por que escolher a empresa (diferenciais)'),
    h('p.ajuda-sec', 'Cartões da Apresentação da empresa, abaixo do texto. O ícone é opcional (um emoji). Logo depois vem o cartão do responsável técnico (Configurações › Empresa).'),
    UI.editorLinhas(tx.diferenciais, [
      { k: 'icone', label: 'Ícone', w: '9%' },
      { k: 'titulo', label: 'Título', w: '28%' },
      { k: 'texto', label: 'Descrição' }
    ], marcar, '+ Adicionar diferencial', function () { return { icone: '', titulo: '', texto: '' }; })));

    cont.appendChild(h('div.card', h('h3', 'Serviços (um por linha)'), UI.grade([
      { k: 'inclusos', label: '✅ Inclusos', type: 'linhas', rows: 9 },
      { k: 'naoInclusos', label: '❌ Não inclusos', type: 'linhas', rows: 9 },
      { k: 'inclusosHibrido', label: '✅ Inclusos adicionais — sistemas híbridos', type: 'linhas', rows: 3 },
      { k: 'naoInclusosHibrido', label: '❌ Não inclusos adicionais — sistemas híbridos', type: 'linhas', rows: 3 },
      { k: 'inclusosBess', label: '✅ Inclusos adicionais — BESS', type: 'linhas', rows: 3 },
      { k: 'naoInclusosBess', label: '❌ Não inclusos adicionais — BESS', type: 'linhas', rows: 3 },
      { k: 'cenariosIntro', label: 'Introdução do comparativo de cenários', type: 'textarea', rows: 3, cls: 'span2' }
    ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Checklist da instalação (um item por linha)'),
      h('p.ajuda-sec', 'Itens que entram em cada nova obra em Execução › Instalações, em três grupos. Em cada obra dá para marcar, anotar medições, incluir e remover itens.'),
      UI.grade([
        { k: 'checklistEstrutura', label: '🏗️ Estrutura de fixação e módulos', type: 'linhas', rows: 9, cls: 'span2' },
        { k: 'checklistStringBox', label: '🔒 String box', type: 'linhas', rows: 7 },
        { k: 'checklistInversor', label: '🔌 Inversor', type: 'linhas', rows: 7 }
      ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Termos de aceite (assinados pelo cliente)'),
      h('p.ajuda-sec', 'Aparecem acima das assinaturas no PDF da ordem de serviço e do relatório de instalação, e na janela em que o cliente assina.'),
      UI.grade([
        { k: 'termoOS', label: 'Ordem de serviço', type: 'textarea', rows: 3, cls: 'span2' },
        { k: 'termoInstalacao', label: 'Relatório de instalação (termo de entrega)', type: 'textarea', rows: 3, cls: 'span2' }
      ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Avisos ao cliente pelo WhatsApp (instalações)'),
      h('p.ajuda-sec', 'Mensagens prontas que abrem no WhatsApp ao concluir uma etapa da instalação e ao enviar o link de acompanhamento. Marcadores: ',
        '{cliente} (primeiro nome), {etapa}, {numeroEtapa}, {totalEtapas}, {proxima} (próxima etapa e data, ou "todas concluídas"), {progresso}, {link} (página de acompanhamento) e {empresa}. ',
        'Uma linha cujos marcadores ficarem vazios (ex.: {link} sem página de acompanhamento) sai da mensagem. Use *texto* para negrito no WhatsApp.'),
      UI.grade([
        { k: 'avisoEtapa', label: 'Etapa concluída', type: 'textarea', rows: 7, cls: 'span2' },
        { k: 'avisoLink', label: 'Envio do link de acompanhamento', type: 'textarea', rows: 5, cls: 'span2' },
        { k: 'avisoConclusao', label: 'Instalação concluída (com o relatório)', type: 'textarea', rows: 8, cls: 'span2',
          help: 'Botão 📲 depois de concluir a instalação. Marcadores: {cliente}, {sistema} (ex.: " de 5,6 kWp"), {data} (conclusão), {link} (relatório de instalação em PDF), {acompanhamento} (página da obra) e {empresa}.' }
      ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Envio dos documentos pelo WhatsApp'),
      h('p.ajuda-sec', 'Mensagens do botão 📲 Enviar ao cliente das propostas, propostas avulsas e ordens de serviço. Marcadores: {cliente} (primeiro nome), {numero}, {validade} (propostas), ',
        '{tipo} e {situacao} (OS), {link} (página com o PDF) e {empresa}. Sem a sincronização ligada, a linha do {link} sai e o PDF vai pelo compartilhamento do aparelho.'),
      UI.grade([
        { k: 'envioProposta', label: 'Proposta de energia solar', type: 'textarea', rows: 6, cls: 'span2' },
        { k: 'envioAvulsa', label: 'Proposta avulsa (serviços)', type: 'textarea', rows: 6, cls: 'span2' },
        { k: 'envioOS', label: 'Ordem de serviço', type: 'textarea', rows: 6, cls: 'span2' }
      ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Propostas avulsas (serviços complementares)'), UI.grade([
      { k: 'avulsaApresentacao', label: 'Apresentação', type: 'textarea', rows: 3, cls: 'span2' },
      { k: 'avulsaGarantia', label: 'Garantia padrão dos serviços', type: 'textarea', rows: 2, cls: 'span2' },
      { k: 'avulsaInclusos', label: '✅ Inclusos', type: 'linhas', rows: 4 },
      { k: 'avulsaNaoInclusos', label: '❌ Não inclusos', type: 'linhas', rows: 4 }
    ], tx, marcar)));

    cont.appendChild(h('div.card', h('h3', 'Passo a passo (cronograma de execução)'),
      h('p.ajuda-sec', 'As mesmas etapas viram o roteiro de cada obra em Execução › Instalações (o prazo estimado calcula as datas previstas). Na proposta, aparecem como linha do tempo ilustrada logo após Projetos realizados — fica fora da proposta até você marcar a opção abaixo.'),
      UI.grade([
        { k: 'passoNaProposta', label: 'Incluir o passo a passo na proposta', type: 'checkbox', cls: 'span2' },
        { k: 'passoIntro', label: 'Frase de abertura', type: 'textarea', rows: 2, cls: 'span2' }
      ], tx, marcar),
      UI.editorLinhas(tx.cronograma, [
        { k: 'etapa', label: 'Descrição da etapa' },
        { k: 'prazo', label: 'Prazo estimado', w: '30%' }
      ], marcar, '+ Adicionar etapa', function () { return { etapa: '', prazo: '' }; })));

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

  /* ------------------------------------------------------------ leitura de datasheet (IA) */

  UI.rota('/ia', function (cont) {
    const IA = App.IA;
    const estado = IA.config();
    const status = h('p.ajuda-sec');
    cont.appendChild(UI.cabecalho('Leitura de datasheet (IA)', 'Cadastro de módulos, inversores, microinversores, híbridos e baterias a partir do datasheet, com a API do Claude (Anthropic).'));
    cont.appendChild(h('div.card.dica',
      h('p', h('strong', 'Sem IA: '), 'o “📄 Ler datasheet” também lê o PDF no próprio navegador, de graça e sem chave (escolha “No navegador”). Funciona com PDFs que têm texto; confira os campos lidos, porque cada fabricante monta a tabela de um jeito.'),
      h('p', h('strong', 'Com IA: '), 'em Cadastros › Equipamentos, use “📄 Ler datasheet” e escolha o PDF (ou uma foto) da ficha técnica, ou “🔎 Pesquisar datasheet” e informe o modelo: ' +
        'a IA procura o datasheet oficial na internet e o lê. O botão 🔄 de cada item atualiza o cadastro pelo datasheet mais recente. ' +
        'Os itens entram marcados como “Revisar” até você conferir e salvar.'),
      h('p', h('strong', 'Chave de API: '), 'crie uma chave no Console da Anthropic (platform.claude.com, em API Keys) e defina um limite de gastos para ela. ' +
        'A chave fica salva só neste navegador — não vai para o backup, para a nuvem nem para outro lugar além da própria API da Anthropic (em outro aparelho, cadastre a chave nele também).'),
      h('p', h('strong', 'Custo: '), 'cobrado pela Anthropic na sua conta, por tokens (e US$ 0,01 por busca na web, na pesquisa). Uma ficha técnica de poucas páginas costuma custar alguns centavos de dólar no Opus 5.5 ' +
        '(o valor estimado aparece ao final de cada leitura). Se o filtro de segurança do modelo recusar o documento, o pedido é refeito automaticamente no modelo indicado pela Anthropic (Opus 5.5 e Sonnet 5.5).')));
    const salvar = function () {
      try { IA.salvarConfig(estado); UI.toast('Configuração salva.', 'ok'); } catch (e) { UI.toast(e.message, 'erro'); }
    };
    cont.appendChild(h('div.card',
      UI.grade([
        { k: 'chave', label: 'Chave de API da Anthropic', type: 'password', placeholder: 'sk-ant-…', cls: 'span2', help: 'Começa com sk-ant-. Para remover, apague o campo e salve.' },
        { k: 'modelo', label: 'Modelo', type: 'select', options: IA.MODELOS.map(function (m) { return { v: m.id, t: m.nome }; }), cls: 'span2' }
      ], estado, null, 2),
      h('div.barra-itens',
        h('button.btn.primario', { type: 'button', onclick: salvar }, 'Salvar'),
        h('button.btn', {
          type: 'button', onclick: async function (ev) {
            const b = ev.currentTarget;
            b.disabled = true;
            status.textContent = 'Testando…';
            try {
              const nome = await IA.testar(estado);
              status.textContent = '✅ Chave válida — ' + nome + '.';
            } catch (e) { status.textContent = '⚠️ ' + e.message; } finally { b.disabled = false; }
          }
        }, 'Testar chave')),
      status));
  });

  /* ------------------------------------------------------------ sincronização (nuvem) */

  UI.rota('/nuvem', function (cont) {
    const N = App.Nuvem;
    cont.appendChild(UI.cabecalho('Sincronização (nuvem)', 'Os mesmos dados no computador, no celular e no tablet: login com a conta Google e cópia no Firebase (Google), atualizada em tempo real.'));

    // situação atual, atualizada enquanto a tela estiver aberta
    const situacao = h('div');
    const acoes = h('div.barra-itens');
    const caixa = h('div.card', h('h3', 'Situação neste aparelho'), situacao, acoes);
    cont.appendChild(caixa);
    let desenhou = false;
    const parar = N.observar(function (n) {
      // a tela foi trocada: deixa de acompanhar
      if (desenhou && !caixa.isConnected) { setTimeout(parar); return; }
      desenhou = true;
      situacao.innerHTML = '';
      acoes.innerHTML = '';
      situacao.appendChild(h('p', h('strong', n.resumo())));
      if (n.usuario) situacao.appendChild(h('p', 'Conta: ', h('strong', n.usuario.email || n.usuario.nome)));
      if (n.pendentes) situacao.appendChild(h('p', n.pendentes + ' alteração(ões) aguardando envio.'));
      if (n.ultimaSync && n.usuario) situacao.appendChild(h('p.ajuda-sec', 'Última sincronização: ' + new Date(n.ultimaSync).toLocaleString('pt-BR')));
      if (n.mensagem) situacao.appendChild(h('p.ajuda-sec', '⚠️ ' + n.mensagem));
      if (n.estado === 'naoConfigurado') situacao.appendChild(h('p.ajuda-sec', 'Para ligar, siga o passo a passo abaixo (uma vez só) e cole a configuração do Firebase.'));
      if (n.configurada() && !n.usuario && n.estado !== 'conectando') {
        acoes.appendChild(h('button.btn.primario', {
          type: 'button', onclick: async function (ev) {
            ev.currentTarget.disabled = true;
            try { await n.entrar(); } catch (e) { UI.toast(e.message, 'erro'); } finally { ev.currentTarget.disabled = false; }
          }
        }, 'Entrar com Google'));
      }
      if (n.usuario) {
        acoes.appendChild(h('button.btn', {
          type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Sair da conta neste aparelho? Os dados continuam aqui e na nuvem, mas as alterações deixam de ser sincronizadas até você entrar de novo.', 'Sair'))) return;
            try { await n.sair(); } catch (e) { UI.toast(e.message, 'erro'); }
          }
        }, 'Sair da conta'));
      }
    });

    // configuração do projeto Firebase
    const origem = N.origemConfig();
    const cfgAtual = N.config();
    const estado = { texto: '' };
    const conectar = function () {
      let cfg;
      try { cfg = N.lerConfig(estado.texto); } catch (e) { UI.toast(e.message, 'erro'); return; }
      try { N.salvarConfig(cfg); } catch (e) { UI.toast(e.message, 'erro'); return; }
      UI.toast('Configuração salva. Conectando…', 'ok');
      setTimeout(function () { location.reload(); }, 600);
    };
    const cfgCard = h('div.card', h('h3', 'Projeto Firebase'));
    if (cfgAtual) {
      cfgCard.appendChild(h('p', 'Projeto: ', h('strong', cfgAtual.projectId), origem === 'site' ? ' — configuração publicada no site (vale para todos os aparelhos).' : ' — configuração colada neste aparelho.'));
    }
    const remover = origem !== 'aparelho' ? null : h('button.btn.perigo', {
      type: 'button', onclick: async function () {
        if (!(await UI.confirmar('Remover a configuração do Firebase deste aparelho? Os dados locais continuam aqui; a sincronização é desligada neste aparelho.', 'Remover', true))) return;
        try { await N.sair(); } catch (e) { /* já desconectado */ }
        N.salvarConfig(null);
        location.reload();
      }
    }, 'Remover deste aparelho');
    if (origem !== 'site') {
      cfgCard.appendChild(UI.grade([
        { k: 'texto', label: cfgAtual ? 'Trocar a configuração (firebaseConfig)' : 'Configuração do app web (firebaseConfig)', type: 'textarea', rows: 9, cls: 'span2',
          placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…firebaseapp.com",\n  projectId: "…",\n  storageBucket: "…",\n  messagingSenderId: "…",\n  appId: "…"\n};',
          help: 'Cole o trecho copiado no passo 6 (pode colar o bloco inteiro do console). Não é senha: o acesso aos dados depende do login e das regras do passo 5.' }
      ], estado, null, 2));
      cfgCard.appendChild(h('div.barra-itens', h('button.btn.primario', { type: 'button', onclick: conectar }, 'Salvar e conectar'), remover));
    }
    cont.appendChild(cfgCard);

    // passo a passo
    const emailRegras = { email: (N.usuario && N.usuario.email) || '' };
    const regras = h('pre.regras-nuvem', N.regras(emailRegras.email));
    const campoEmail = UI.grade([{ k: 'email', label: 'E-mail Google do dono da conta (administrador principal)', type: 'text', placeholder: 'voce@gmail.com', cls: 'span2' }],
      emailRegras, function () { regras.textContent = N.regras(emailRegras.email); }, 2);
    const copiar = h('button.btn', {
      type: 'button', onclick: async function () {
        try { await navigator.clipboard.writeText(regras.textContent); UI.toast('Regras copiadas.', 'ok'); } catch (e) {
          const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(regras); sel.removeAllRanges(); sel.addRange(r);
          UI.toast('Selecionei o texto: copie com Ctrl+C.', 'info');
        }
      }
    }, 'Copiar regras');
    const passo = function (n, titulo) { return h('li', h('strong', titulo), Array.prototype.slice.call(arguments, 2)); };
    // regras atualizadas (perfis da equipe e páginas públicas): quem já tinha publicado as antigas precisa publicar de novo
    if (cfgAtual) {
      cont.appendChild(h('div.card.dica',
        h('p', h('strong', 'Equipe com login (versão 2026.10.31.2): '), 'as regras do Firestore têm os perfis (administrador, vendedor e técnico), a coleção ',
          h('code', 'equipe'), ' (com a confirmação do e-mail de quem entra) e as páginas públicas (', h('code', 'match /acompanhamento/{codigo}'), '). Se você publicou as regras antes desta versão, abra o passo a passo abaixo, ',
          'copie as regras do passo 5 e publique de novo na aba Regras do Firestore. Para a equipe entrar com e-mail e senha, ative também ', h('strong', 'E-mail/senha'), ' (passo 2).')));
    }
    // já configurado: o passo a passo fica recolhido (consulta)
    cont.appendChild(h('details.card.passos-card', { open: !cfgAtual },
      h('summary', h('h3', 'Passo a passo para ligar (uma vez só, de graça)')),
      h('ol.passos-nuvem',
        passo(1, 'Crie o projeto: ', 'entre em console.firebase.google.com com a sua conta Google › “Criar um projeto” (ex.: genesis-propostas). O Google Analytics pode ficar desativado. O plano gratuito (Spark) é suficiente.'),
        passo(2, 'Ative o login: ', 'menu Criação › Authentication › “Vamos começar” › Método de login › Google › Ativar › Salvar (o dono entra com Google). ',
          'Depois, Adicionar novo provedor › ', h('strong', 'E-mail/senha'), ' › Ativar › Salvar (técnicos, vendedores e administradores da equipe entram com e-mail e senha).'),
        passo(3, 'Autorize este endereço: ', 'Authentication › Configurações › Domínios autorizados › Adicionar domínio: ', h('code', location.hostname || 'localhost'), '.'),
        passo(4, 'Crie o banco: ', 'Criação › Firestore Database › Criar banco de dados › local ', h('code', 'southamerica-east1 (São Paulo)'), ' › iniciar no modo de produção.'),
        passo(5, 'Proteja os dados: ', 'na aba Regras do Firestore, apague o texto, cole as regras abaixo (com o e-mail do dono) e clique em Publicar. ',
          'Elas liberam a base da empresa para o dono e para quem estiver cadastrado em Equipe e acessos, cada um conforme o perfil (o financeiro, só para administradores).',
          campoEmail, regras, h('div.barra-itens', copiar)),
        passo(6, 'Copie a configuração: ', 'engrenagem ⚙️ › Configurações do projeto › Seus apps › ícone Web (</>) › dê um apelido e registre (sem Firebase Hosting). Copie o bloco firebaseConfig e cole no campo “Projeto Firebase” acima.'),
        passo(7, 'Entre em cada aparelho: ', 'o dono clica em “Entrar com Google” com a mesma conta no computador, no celular e no tablet (no primeiro login, tudo o que já está cadastrado no aparelho sobe para a nuvem e é mantido). ',
          'A equipe é cadastrada em ', h('a', { href: '#/equipe' }, 'Configurações › Equipe e acessos'), ' e entra com o e-mail e a senha.')),
      origem === 'site' ? null : h('p.ajuda-sec', 'Se preferir não colar a configuração em cada aparelho, envie o bloco firebaseConfig para ser publicado no site: aí basta entrar com Google.')));

    cont.appendChild(h('div.card.dica',
      h('p', h('strong', 'Sincroniza: '), 'clientes, cadastros (equipamentos, concessionárias, localidades, pagamentos, serviços), propostas, propostas avulsas, contratos, instalações, ordens de serviço, pedidos de compra, ',
        'financeiro (só para administradores), projetos realizados (com fotos), dados da empresa, premissas, textos, modelo do contrato e numeração. Cada perfil da equipe recebe só o que pode ver.'),
      h('p', h('strong', 'Não sincroniza (fica em cada aparelho): '), 'a chave da API do Claude e o modelo escolhido (cadastre a chave em cada aparelho em que for usar a IA), o modo de leitura do datasheet e a configuração do Firebase colada aqui.'),
      h('p', h('strong', 'Primeiro login: '), 'os registros já existentes neste aparelho são enviados e mantidos; se outro aparelho já tiver enviado os dele, as duas bases são somadas. Quando o mesmo registro foi alterado nos dois, vale a alteração mais recente.'),
      h('p', h('strong', 'Sem internet: '), 'a plataforma continua funcionando; as alterações ficam na fila e são enviadas quando a conexão voltar. O backup .json (Backup e dados) continua disponível.'),
      h('p', h('strong', 'Espaço: '), 'cada navegador guarda até ~5 MB; muitas fotos em Projetos realizados ocupam esse limite mais rápido. Na nuvem, o plano gratuito tem 1 GB.')));
  });

  /* ------------------------------------------------------------ backup */

  function emTodos() { return App.Nuvem && App.Nuvem.usuario ? ' — inclusive na nuvem e nos outros aparelhos conectados' : ''; }

  UI.rota('/dados', function (cont) {
    const kb = Math.round(S.uso() / 1024);
    const arquivo = h('input', {
      type: 'file', accept: 'application/json,.json', onchange: async function () {
        const f = arquivo.files[0];
        if (!f) return;
        try {
          const dados = JSON.parse(await U.readFileAsText(f));
          if (!(await UI.confirmar('Importar este backup substituirá TODOS os dados atuais' + emTodos() + '. Continuar?', 'Importar', true))) return;
          S.importar(dados);
          if (App.Fotos && Array.isArray(dados.fotos)) await App.Fotos.importar(dados.fotos);
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
      h('p', h('strong', 'Importante: '), App.Nuvem && App.Nuvem.usuario
        ? 'a sincronização (nuvem) está ligada: os dados também ficam no Firebase e nos outros aparelhos conectados. O backup .json continua sendo uma cópia de segurança extra.'
        : 'cada navegador/computador tem sua própria base. Para usar em vários aparelhos, ligue a ☁️ Sincronização (nuvem); ou exporte o backup regularmente e importe no outro equipamento.'),
      h('p', 'Uso atual: ', h('strong', U.fmt(kb, 0) + ' KB'), ' (limite típico do navegador: ~5.000 KB).')));
    cont.appendChild(h('div.grade-cards',
      h('div.card',
        h('h3', 'Exportar backup'),
        h('p', 'Baixa um arquivo .json com empresa, premissas, textos, cadastros, propostas, instalações e as fotos das etiquetas.'),
        h('button.btn.primario', {
          type: 'button', onclick: async function () {
            const dados = S.exportar();
            if (App.Fotos) dados.fotos = await App.Fotos.todas();
            const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
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
            if (await UI.confirmar('Apagar TODOS os dados (clientes, propostas e cadastros)' + emTodos() + ' e restaurar os padrões?', 'Apagar e restaurar', true)) {
              S.restaurarPadroes();
              App.atualizarMarca();
              UI.toast('Dados restaurados para o padrão.', 'ok');
              UI.ir('#/painel');
            }
          }
        }, 'Restaurar padrões'))));
    const removidos = S.removidosV7();
    if (removidos.length) {
      // cópia de segurança do antigo catálogo de inversores, microinversores, híbridos e baterias (atualização da base v7)
      const box = h('div.card',
        h('h3', 'Equipamentos do catálogo antigo'),
        h('p', 'Na atualização para o cadastro pelo datasheet, ' + removidos.length + ' equipamento(s) sem uso em propostas (módulos, inversores e baterias) foram retirados. ' +
          'Restaure-os se tiver preços ou dados que queira aproveitar — voltam inativos, para revisão com o datasheet.'),
        h('div.barra-itens',
          h('button.btn', { type: 'button', onclick: function () {
            const n = S.restaurarRemovidosV7();
            UI.toast(n + ' equipamento(s) restaurado(s) como inativos.', 'ok');
            box.remove();
          } }, 'Restaurar'),
          h('button.btn.perigo', { type: 'button', onclick: async function () {
            if (await UI.confirmar('Descartar a cópia dos equipamentos do catálogo antigo?', 'Descartar', true)) { S.descartarRemovidosV7(); box.remove(); }
          } }, 'Descartar cópia')));
      cont.appendChild(box);
    }
  });
})(window.App);
