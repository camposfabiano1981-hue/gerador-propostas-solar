/*
 * Página pública "Acompanhe sua obra" (acompanhe.html?o=código): lê acompanhamento/{código} do Firestore pela API REST,
 * sem login (as regras liberam só a leitura pelo código), e mostra o progresso, as etapas com datas, a previsão de conclusão,
 * as fotos (quando ligadas) e o contato da empresa. Projeto do Firebase: o de js/nuvem-config.js ou o informado no link (p, k).
 */
(function () {
  'use strict';

  const pagina = document.getElementById('pagina');
  const qs = new URLSearchParams(location.search);
  const codigo = qs.get('o') || '';
  const cfg = window.App && window.App.NUVEM_CONFIG || {};
  const projeto = qs.get('p') || cfg.projectId || '';
  const chave = qs.get('k') || cfg.apiKey || '';

  function el(tag, cls, filhos) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    (Array.isArray(filhos) ? filhos : (filhos == null ? [] : [filhos])).forEach(function (f) {
      if (f == null || f === false) return;
      e.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
    return e;
  }

  function dataBR(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function numero(v, casas) {
    return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas == null ? 2 : casas });
  }

  function telefoneWhats(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.length >= 12 && d.indexOf('55') === 0) return d;
    d = d.replace(/^0+/, '');
    return d.length === 10 || d.length === 11 ? '55' + d : '';
  }

  function aviso(titulo, texto) {
    pagina.replaceChildren(el('div', 'card aviso', [el('h1', null, titulo), el('p', null, texto)]));
  }

  function ampliar(src, legenda) {
    const z = el('div', 'zoom', [el('img', null), legenda ? el('p', null, legenda) : null]);
    z.querySelector('img').src = src;
    z.querySelector('img').alt = legenda || 'Foto da obra';
    z.addEventListener('click', function () { z.remove(); });
    document.body.appendChild(z);
  }

  function desenhar(d) {
    const emp = d.empresa || {};
    const etapas = d.etapas || [];
    const pr = d.progresso || { feitas: 0, total: etapas.length };
    const pct = pr.total ? Math.round(pr.feitas / pr.total * 100) : 0;
    const concluida = pr.total > 0 && pr.feitas === pr.total;
    document.title = 'Acompanhe sua obra' + (emp.nome ? ' — ' + emp.nome : '');
    const blocos = [];

    // empresa
    const logo = emp.logo ? el('img') : null;
    if (logo) { logo.src = emp.logo; logo.alt = 'Logotipo ' + (emp.nome || ''); }
    blocos.push(el('header', 'topo', [logo, el('div', null, [el('strong', null, emp.razao || emp.nome || ''), el('small', null, 'Acompanhamento da instalação')])]));

    // resumo
    const s = d.sistema || {};
    const chips = [];
    chips.push(el('span', 'chip', 'Sistema ' + (s.tipo || 'On-Grid')));
    if (s.kwp > 0) chips.push(el('span', 'chip', numero(s.kwp, 2) + ' kWp'));
    if (s.kwh > 0) chips.push(el('span', 'chip', numero(s.kwh, 2) + ' kWh de baterias'));
    if (s.cidade) chips.push(el('span', 'chip', s.cidade + (s.uf ? '/' + s.uf : '')));
    const barra = el('div', 'barra' + (concluida ? ' feita' : ''), el('span'));
    barra.firstChild.style.width = pct + '%';
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-valuenow', String(pct));
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    const sit = d.situacao || {};
    const concluidaEm = concluida ? etapas.reduce(function (m, e) { return e.concluidoEm > m ? e.concluidoEm : m; }, '') : '';
    blocos.push(el('section', 'card', [
      el('h1', 'ola', 'Olá' + (d.cliente ? ', ' + d.cliente : '') + '! 👋'),
      el('p', 'sub', concluida ? 'A instalação do seu sistema solar foi concluída. Obrigado pela confiança!' : 'Acompanhe aqui cada etapa da instalação do seu sistema solar.'),
      el('div', 'sistema', chips),
      el('div', 'progresso', [
        el('div', 'progresso-topo', [el('strong', null, pct + '%'), el('span', 'situacao ' + (sit.id || ''), sit.label || '')]),
        barra,
        el('div', 'previsao', [pr.feitas + ' de ' + pr.total + ' etapas concluídas',
          concluida ? (concluidaEm ? ' · concluída em ' + dataBR(concluidaEm) : '') : (d.previsaoConclusao ? ' · previsão de conclusão: ' + dataBR(d.previsaoConclusao) : '')])
      ])
    ]));

    // etapas
    const itens = etapas.map(function (e, i) {
      const st = e.status === 'concluida' ? 'concluida' : (e.status === 'andamento' ? 'andamento' : 'pendente');
      let data = '';
      if (st === 'concluida') data = 'Concluída' + (e.concluidoEm ? ' em ' + dataBR(e.concluidoEm) : '');
      else if (st === 'andamento') data = 'Em andamento' + (e.iniciadoEm ? ' desde ' + dataBR(e.iniciadoEm) : '') + (e.previsto ? ' · previsão ' + dataBR(e.previsto) : '');
      else data = e.previsto ? 'Prevista para ' + dataBR(e.previsto) : 'A fazer';
      return el('li', st, [el('span', 'marca', st === 'concluida' ? '✓' : String(i + 1)), el('div', null, [el('div', 'etapa-titulo', e.titulo || 'Etapa ' + (i + 1)), el('div', 'etapa-data', data)])]);
    });
    blocos.push(el('section', 'card', [el('h2', null, 'Etapas da instalação'), el('ol', 'linha-tempo', itens)]));

    // fotos
    if ((d.fotos || []).length) {
      blocos.push(el('section', 'card', [el('h2', null, 'Fotos da obra'), el('div', 'fotos', d.fotos.map(function (f) {
        const img = el('img');
        img.src = f.src;
        img.alt = f.legenda || 'Foto da obra';
        img.loading = 'lazy';
        img.addEventListener('click', function () { ampliar(f.src, f.legenda); });
        return el('figure', null, [img, f.legenda ? el('figcaption', null, f.legenda) : null]);
      }))]));
    }

    // contato
    const contatos = [];
    const zap = telefoneWhats(emp.telefone);
    if (zap) {
      const a = el('a', 'botao whats', '💬 Falar no WhatsApp');
      a.href = 'https://wa.me/' + zap + '?text=' + encodeURIComponent('Olá! Estou acompanhando a instalação do meu sistema solar' + (d.cliente ? ' (' + d.cliente + ')' : '') + ' e tenho uma dúvida.');
      a.target = '_blank';
      a.rel = 'noopener';
      contatos.push(a);
    }
    if (emp.email) { const a = el('a', 'botao', '✉️ ' + emp.email); a.href = 'mailto:' + emp.email; contatos.push(a); }
    if (contatos.length) blocos.push(el('section', 'card', [el('h2', null, 'Ficou com alguma dúvida?'), el('div', 'contato', contatos)]));

    const atualizar = el('button', null, '↻ Atualizar');
    atualizar.type = 'button';
    atualizar.addEventListener('click', carregar);
    const em = new Date(d.atualizadoEm || '');
    blocos.push(el('p', 'rodape', [isNaN(em) ? '' : 'Atualizado em ' + em.toLocaleDateString('pt-BR') + ' às ' + em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ', atualizar]));
    pagina.replaceChildren.apply(pagina, blocos);
  }

  async function carregar() {
    if (!codigo || !projeto || !chave) { aviso('Link incompleto', 'Confira se o link foi copiado inteiro ou peça um novo à empresa responsável pela instalação.'); return; }
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projeto) + '/databases/(default)/documents/acompanhamento/' +
      encodeURIComponent(codigo) + '?key=' + encodeURIComponent(chave);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.status === 404) { aviso('Acompanhamento não encontrado', 'Este link não está mais ativo. Fale com a empresa responsável pela instalação para receber o link atualizado.'); return; }
      if (!r.ok) { aviso('Acompanhamento indisponível no momento', 'Tente de novo em alguns minutos. Se continuar, fale com a empresa responsável pela instalação.'); return; }
      const doc = await r.json();
      const json = doc && doc.fields && doc.fields.json && doc.fields.json.stringValue;
      if (!json) { aviso('Acompanhamento indisponível no momento', 'Tente de novo em alguns minutos.'); return; }
      desenhar(JSON.parse(json));
    } catch (e) {
      aviso('Sem conexão', 'Não foi possível carregar o acompanhamento. Verifique a internet e tente de novo.');
    }
  }

  carregar();
})();
