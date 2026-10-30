/*
 * Avisos ao cliente durante a instalação: mensagem pronta no WhatsApp a cada etapa concluída (o usuário só aperta enviar) e a
 * página pública "Acompanhe sua obra" (acompanhe.html), com as etapas, o progresso e, se ligado, as fotos dos equipamentos —
 * sem valores, endereço nem telefone do cliente. A página lê acompanhamento/{token} do Firestore, gravado ao salvar a instalação.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const MAX_FOTOS = 6;

  /** Código do link (22 caracteres aleatórios, impossível de adivinhar). */
  function novoToken() {
    const b = new Uint8Array(22);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ALFABETO[x % ALFABETO.length]; }).join('');
  }

  function primeiroNome(nome) {
    const p = String(nome || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }

  /** Número para o WhatsApp (55 + DDD + número); vazio quando não houver telefone. */
  function telefoneWhats(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length >= 12 && d.indexOf('55') === 0) return d;
    d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) return '55' + d;
    return d.length >= 8 ? d : '';
  }

  /** Link que abre a conversa com a mensagem pronta (sem número, o WhatsApp pede para escolher o contato). */
  function linkWhats(tel, texto) {
    return 'https://wa.me/' + telefoneWhats(tel) + '?text=' + encodeURIComponent(texto || '');
  }

  /** Endereço da página do cliente; com a configuração da nuvem só neste aparelho, o projeto vai no próprio link. */
  function linkAcompanhamento(token, base) {
    const raiz = base || (location.origin + location.pathname.replace(/[^/]*$/, ''));
    let u = raiz + 'acompanhe.html?o=' + encodeURIComponent(token);
    const N = App.Nuvem;
    if (N && N.origemConfig && N.origemConfig() === 'aparelho') {
      const c = N.config();
      u += '&p=' + encodeURIComponent(c.projectId) + '&k=' + encodeURIComponent(c.apiKey);
    }
    return u;
  }

  /** Preenche {marcadores}; linhas cujos marcadores ficaram todos vazios saem da mensagem. */
  function preencher(modelo, v) {
    return String(modelo || '').split('\n').map(function (linha) {
      const ks = linha.match(/\{(\w+)\}/g) || [];
      const vazios = ks.filter(function (k) { const x = v[k.slice(1, -1)]; return x == null || x === ''; });
      if (ks.length && vazios.length === ks.length) return null;
      return linha.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : m; });
    }).filter(function (l) { return l !== null; }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function variaveis(inst, ctx, etapa, link) {
    const I = App.Instalacao;
    const et = inst.etapas || [];
    const n = et.indexOf(etapa) + 1;
    const pr = I.progresso(inst);
    const prox = et.find(function (e, i) { return i >= n && e.status !== 'concluida'; }) || et.find(function (e) { return e !== etapa && e.status !== 'concluida'; });
    const emp = ctx.empresa || {};
    let proxima = '';
    if (pr.total && pr.feitas === pr.total) proxima = 'Todas as etapas foram concluídas: seu sistema está pronto! 🎉';
    else if (prox) proxima = 'Próxima etapa: ' + prox.titulo + (prox.previsto ? ', prevista para ' + U.dataBR(prox.previsto) : '') + '.';
    return {
      cliente: primeiroNome(inst.clienteNome) || 'cliente', etapa: etapa ? etapa.titulo || '' : '', numeroEtapa: n || '', totalEtapas: et.length,
      proxima: proxima, progresso: pr.total ? Math.round(pr.pct * 100) + '% concluído (' + pr.feitas + ' de ' + pr.total + ' etapas)' : '',
      link: link || '', empresa: emp.nomeCurto || emp.razao || ''
    };
  }

  /** Mensagem do WhatsApp para a etapa concluída (modelo em Configurações › Textos padrão). */
  function mensagemEtapa(inst, ctx, etapa, link) {
    return preencher((ctx.textos && ctx.textos.avisoEtapa) || App.DEFAULTS.textos.avisoEtapa, variaveis(inst, ctx, etapa, link));
  }

  /** Mensagem com o link da página de acompanhamento. */
  function mensagemLink(inst, ctx, link) {
    return preencher((ctx.textos && ctx.textos.avisoLink) || App.DEFAULTS.textos.avisoLink, variaveis(inst, ctx, null, link));
  }

  /* ------------------------------------------------------------ página pública */

  function reduzir(dataURL, lado, q) {
    return U.loadImage(dataURL).then(function (img) {
      const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k));
      cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = cv.getContext('2d');
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', q || 0.78);
    });
  }

  const miniaturas = {}; // fotoId → miniatura (não refaz a cada gravação)

  /** Fotos dos equipamentos para a página: miniaturas de até 720 px com a legenda digitada (ou a padrão). */
  async function fotosPublicas(inst) {
    const pl = inst.placas || {};
    const lista = [];
    [['modulo', 'Módulos'], ['inversor', 'Inversor']].forEach(function (x) {
      const p = pl[x[0]] || {}, leg = p.legendas || {};
      (p.fotos || []).forEach(function (id, i, l) { lista.push({ id: id, legenda: String(leg[id] || '').trim() || x[1] + (l.length > 1 ? ' — foto ' + (i + 1) : '') }); });
    });
    const out = [];
    for (const f of lista.slice(0, MAX_FOTOS)) {
      if (!miniaturas[f.id]) {
        const reg = await App.Fotos.obter(f.id);
        if (!reg || !reg.dataURL) continue;
        miniaturas[f.id] = await reduzir(reg.dataURL, 720, 0.72);
      }
      out.push({ src: miniaturas[f.id], legenda: f.legenda });
    }
    return out;
  }

  /**
   * O que a página pública mostra: primeiro nome do cliente, cidade, sistema, etapas com datas, previsão e as fotos (se ligadas).
   * Sem valores, endereço nem telefone do cliente. o: {logo, fotos}
   */
  function dadosPublicos(inst, ctx, o) {
    o = o || {};
    const I = App.Instalacao;
    const emp = ctx.empresa || {};
    const pr = I.progresso(inst);
    const st = I.status(inst);
    const atual = I.etapaAtual(inst);
    return {
      v: 1,
      empresa: { nome: emp.nomeCurto || emp.razao || '', razao: emp.razao || '', telefone: emp.telefone || '', email: emp.email || '', site: emp.site || '', logo: o.logo || '' },
      cliente: primeiroNome(inst.clienteNome),
      sistema: { tipo: { hibrido: 'Híbrido', bess: 'BESS' }[inst.tipoSistema] || 'On-Grid', kwp: U.numOr(inst.kwp, 0), kwh: U.numOr(inst.kwh, 0), cidade: inst.cidade || '', uf: inst.uf || '' },
      situacao: { id: st, label: (I.STATUS.find(function (s) { return s.id === st; }) || I.STATUS[0]).label },
      progresso: { feitas: pr.feitas, total: pr.total },
      previsaoConclusao: I.previsaoConclusao(inst) || '',
      etapas: (inst.etapas || []).map(function (e) {
        return { titulo: e.titulo || '', status: e.status || 'pendente', previsto: e.previsto || '', iniciadoEm: e.iniciadoEm || '', concluidoEm: e.concluidoEm || '', atual: e === atual };
      }),
      fotos: o.fotos || [],
      atualizadoEm: new Date().toISOString()
    };
  }

  const publicados = {}; // token → conteúdo já publicado (sem a data), para não gravar de novo o mesmo
  const situacao = {};   // token → {estado: 'enviando' | 'ok' | 'erro' | 'semNuvem', em, mensagem}

  function avisarSituacao(token, s, aoMudar) { situacao[token] = s; if (aoMudar) aoMudar(s); }

  /** Publica (ou atualiza) a página do cliente. Devolve a situação; aoMudar(s) acompanha o envio. */
  async function publicar(inst, ctx, aoMudar) {
    const a = inst.acompanhamento;
    if (!a || !a.ativo || !a.token) return { estado: 'desligado' };
    const N = App.Nuvem;
    if (!N || !N.usuario || !N.publicarAcompanhamento) {
      const s = { estado: 'semNuvem', mensagem: 'Ligue a sincronização (nuvem) neste aparelho para publicar a página do cliente.' };
      avisarSituacao(a.token, s, aoMudar);
      return s;
    }
    try {
      let logo = '';
      try { logo = await reduzir(ctx.empresa.logo || App.LOGO_PADRAO, 360, 0.86); } catch (e) { logo = ''; }
      const d = dadosPublicos(inst, ctx, { logo: logo, fotos: a.fotos ? await fotosPublicas(inst) : [] });
      const chave = JSON.stringify(Object.assign({}, d, { atualizadoEm: '' }));
      if (publicados[a.token] === chave && situacao[a.token] && situacao[a.token].estado === 'ok') return situacao[a.token];
      avisarSituacao(a.token, { estado: 'enviando', mensagem: 'Publicando a página do cliente…' }, aoMudar);
      await N.publicarAcompanhamento(a.token, d);
      publicados[a.token] = chave;
      const s = { estado: 'ok', em: d.atualizadoEm, mensagem: 'Página do cliente atualizada.' };
      avisarSituacao(a.token, s, aoMudar);
      return s;
    } catch (e) {
      console.error(e);
      const negado = /permission|permiss/i.test((e && (e.code || '')) + ' ' + (e && e.message));
      const s = { estado: 'erro', mensagem: negado ? 'O Firebase recusou a gravação: atualize as regras do Firestore (Configurações › Sincronização (nuvem) › regras de segurança) para incluir a página de acompanhamento.'
        : 'Não foi possível publicar a página do cliente: ' + ((e && e.message) || e) };
      avisarSituacao(a.token, s, aoMudar);
      return s;
    }
  }

  /** Tira a página do ar (o link deixa de funcionar). */
  function despublicar(token) {
    delete publicados[token];
    delete situacao[token];
    const N = App.Nuvem;
    if (N && N.usuario && N.removerAcompanhamento) return N.removerAcompanhamento(token).catch(function (e) { console.error(e); });
    return Promise.resolve();
  }

  App.Acompanhamento = {
    novoToken: novoToken, primeiroNome: primeiroNome, telefoneWhats: telefoneWhats, linkWhats: linkWhats, linkAcompanhamento: linkAcompanhamento,
    preencher: preencher, mensagemEtapa: mensagemEtapa, mensagemLink: mensagemLink, dadosPublicos: dadosPublicos, publicar: publicar, despublicar: despublicar,
    situacao: function (token) { return situacao[token] || null; }
  };
})(window.App);
