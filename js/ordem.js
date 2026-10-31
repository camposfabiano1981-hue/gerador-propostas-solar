/*
 * Ordens de serviço (OS) das instalações: manutenção, limpeza, visita técnica, garantia e outras demandas depois (ou fora) da obra.
 * Numeração própria OS-AAAAMMDD-NNN; quando ligada a uma instalação, a abertura e a conclusão entram no histórico da obra.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;

  const TIPOS = [
    { id: 'preventiva', label: 'Manutenção preventiva' }, { id: 'corretiva', label: 'Manutenção corretiva' }, { id: 'preditiva', label: 'Manutenção preditiva' },
    { id: 'limpeza', label: 'Limpeza dos módulos' }, { id: 'visita', label: 'Visita técnica' },
    { id: 'garantia', label: 'Garantia / troca de equipamento' }, { id: 'vistoria', label: 'Vistoria da concessionária' },
    { id: 'ampliacao', label: 'Ampliação do sistema' }, { id: 'pendencia', label: 'Pendência da instalação' }, { id: 'outro', label: 'Outro' }
  ];
  const PRIORIDADES = [
    { id: 'baixa', label: 'Baixa', cor: 'cinza' }, { id: 'normal', label: 'Normal', cor: 'azul' },
    { id: 'alta', label: 'Alta', cor: 'ambar' }, { id: 'urgente', label: 'Urgente', cor: 'erro' }
  ];
  const STATUS = [
    { id: 'aberta', label: 'Aberta', cor: 'azul' }, { id: 'agendada', label: 'Agendada', cor: 'roxo' },
    { id: 'execucao', label: 'Em execução', cor: 'ambar' }, { id: 'concluida', label: 'Concluída', cor: 'ok' }, { id: 'cancelada', label: 'Cancelada', cor: 'cinza' }
  ];
  const ABERTAS = ['aberta', 'agendada', 'execucao'];

  function rotulo(lista, id) { return (lista.find(function (x) { return x.id === id; }) || lista[0]).label; }

  /** OS em branco ou ligada a uma instalação (cliente, telefone e endereço vêm da obra). */
  function nova(ctx, inst) {
    const emp = (ctx && ctx.empresa) || {};
    const os = {
      numero: '', data: U.todayISO(), instalacaoId: '', instalacaoTitulo: '', clienteId: '', clienteNome: '', telefone: '', endereco: '', cidade: '', uf: emp.uf || '',
      tipo: 'visita', prioridade: 'normal', status: 'aberta', agendadaPara: '', concluidaEm: '', responsavel: emp.responsavel || '',
      descricao: '', servico: '', materiais: [], garantia: false, valor: '', checklist: [],
      assinaturas: { cliente: { fotoId: '', nome: '', em: '' }, tecnico: { fotoId: '', nome: '', em: '' } }
    };
    if (inst) {
      Object.assign(os, {
        instalacaoId: inst.id || '', instalacaoTitulo: inst.titulo || '', clienteId: inst.clienteId || '', clienteNome: inst.clienteNome || '',
        telefone: inst.telefone || '', endereco: inst.endereco || '', cidade: inst.cidade || '', uf: inst.uf || os.uf
      });
    }
    return os;
  }

  /** Muda a situação: conclusão com data automática (limpa ao reabrir). */
  function mudarStatus(os, novo, hoje) {
    os.status = novo;
    if (novo === 'concluida') { if (!os.concluidaEm) os.concluidaEm = hoje || U.todayISO(); } else os.concluidaEm = '';
    return os;
  }

  function aberta(os) { return ABERTAS.indexOf(os.status) >= 0; }

  /** OS em aberto com a data agendada já vencida. */
  function atrasada(os, hoje) { return aberta(os) && !!os.agendadaPara && os.agendadaPara < (hoje || U.todayISO()); }

  function resumo(os) { return os.numero + ' — ' + rotulo(TIPOS, os.tipo); }

  // modelos de checklist das manutenções (Configurações › Textos padrão)
  const CHECKLISTS = [
    { tipo: 'preventiva', chave: 'checklistPreventiva', label: 'Manutenção preventiva' },
    { tipo: 'corretiva', chave: 'checklistCorretiva', label: 'Manutenção corretiva' },
    { tipo: 'preditiva', chave: 'checklistPreditiva', label: 'Manutenção preditiva' }
  ];

  /** Inclui na OS o checklist do modelo (preventiva, corretiva ou preditiva); devolve {grupos, itens} incluídos. */
  function incluirChecklist(os, tipo, textos) {
    const m = CHECKLISTS.find(function (x) { return x.tipo === tipo; }) || CHECKLISTS[0];
    if (!Array.isArray(os.checklist)) os.checklist = [];
    const modelo = App.Checklist.doModelo((textos && textos[m.chave]) || App.DEFAULTS.textos[m.chave], m.label);
    return App.Checklist.mesclar(os.checklist, modelo);
  }

  App.Ordem = {
    TIPOS: TIPOS, PRIORIDADES: PRIORIDADES, STATUS: STATUS, ABERTAS: ABERTAS, rotulo: rotulo,
    nova: nova, mudarStatus: mudarStatus, aberta: aberta, atrasada: atrasada, resumo: resumo, CHECKLISTS: CHECKLISTS, incluirChecklist: incluirChecklist
  };
})(window.App);
