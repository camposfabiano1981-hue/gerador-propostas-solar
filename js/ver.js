/*
 * Página pública do documento enviado ao cliente (ver.html?d=código): lê acompanhamento/doc-{código} e as partes do PDF pela
 * API REST do Firestore, sem login, mostra as páginas (PDF.js, também no celular) e os botões para baixar o PDF e falar com a
 * empresa. Projeto do Firebase: o de js/nuvem-config.js ou o informado no link (p, k).
 */
(function () {
  'use strict';

  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs';
  const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs';
  const pagina = document.getElementById('pagina');
  const qs = new URLSearchParams(location.search);
  const codigo = qs.get('d') || '';
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

  function telefoneWhats(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.length >= 12 && d.indexOf('55') === 0) return d;
    d = d.replace(/^0+/, '');
    return d.length === 10 || d.length === 11 ? '55' + d : '';
  }

  function aviso(titulo, texto, detalhe) {
    pagina.replaceChildren(el('div', 'card aviso', [el('h1', null, titulo), el('p', null, texto), detalhe ? el('p', 'detalhe', detalhe) : null]));
  }

  function url(id) {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projeto) + '/databases/(default)/documents/acompanhamento/' +
      encodeURIComponent(id) + '?key=' + encodeURIComponent(chave);
  }

  async function ler(id) {
    const r = await fetch(url(id), { cache: 'no-store' });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.texto = await r.text().catch(function () { return ''; }); throw e; }
    return (await r.json()).fields || {};
  }

  function bytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function desenharPaginas(dados, caixa, status) {
    try {
      const lib = await import(PDFJS_URL);
      lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
      const doc = await lib.getDocument({ data: dados.slice(0), isEvalSupported: false }).promise;
      status.textContent = doc.numPages + (doc.numPages === 1 ? ' página' : ' páginas');
      const largura = Math.max(300, caixa.clientWidth || 760);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const vp = pg.getViewport({ scale: largura / pg.getViewport({ scale: 1 }).width * dpr });
        const cv = document.createElement('canvas');
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', 'Página ' + n + ' de ' + doc.numPages);
        caixa.appendChild(cv);
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      }
    } catch (e) {
      status.textContent = 'Não foi possível mostrar as páginas aqui. Toque em “Baixar o PDF” para abrir o documento.';
    }
  }

  function desenhar(meta, dados) {
    const emp = meta.empresa || {};
    document.title = (meta.tipo || 'Documento') + (meta.numero ? ' ' + meta.numero : '') + (emp.nome ? ' — ' + emp.nome : '');
    const blob = new Blob([dados], { type: 'application/pdf' });
    const href = URL.createObjectURL(blob);
    const logo = emp.logo ? el('img') : null;
    if (logo) { logo.src = emp.logo; logo.alt = 'Logotipo ' + (emp.nome || ''); }
    const baixar = el('a', 'botao principal', '⬇ Baixar o PDF');
    baixar.href = href;
    baixar.download = meta.arquivo || 'documento.pdf';
    const acoes = [baixar];
    const zap = telefoneWhats(emp.telefone);
    if (zap) {
      const a = el('a', 'botao whats', '💬 Falar no WhatsApp');
      a.href = 'https://wa.me/' + zap + '?text=' + encodeURIComponent('Olá! Recebi ' + (meta.tipo ? 'a ' + meta.tipo.toLowerCase() : 'o documento') + (meta.numero ? ' nº ' + meta.numero : '') + ' e tenho uma dúvida.');
      a.target = '_blank';
      a.rel = 'noopener';
      acoes.push(a);
    }
    const status = el('p', 'paginas-status', 'Carregando as páginas…');
    const caixa = el('div', 'paginas');
    pagina.replaceChildren(
      el('header', 'topo', [logo, el('div', null, [el('strong', null, emp.razao || emp.nome || ''), el('small', null, meta.tipo || 'Documento')])]),
      el('section', 'card', [
        el('h1', 'ola', 'Olá' + (meta.cliente ? ', ' + meta.cliente : '') + '! 👋'),
        el('p', 'sub', 'Aqui está ' + (meta.tipo ? 'a sua ' + meta.tipo.toLowerCase() : 'o seu documento') + '.'),
        el('p', 'doc-numero', [meta.numero ? 'Nº ' + meta.numero : '', meta.validade ? ' · válida até ' + meta.validade : '']),
        el('div', 'acoes-doc', acoes)
      ]),
      status, caixa);
    desenharPaginas(dados, caixa, status);
  }

  async function carregar() {
    if (!codigo || !projeto || !chave) { aviso('Link incompleto', 'Confira se o link foi copiado inteiro ou peça um novo à empresa.'); return; }
    try {
      const f = await ler('doc-' + codigo);
      const meta = JSON.parse((f.json && f.json.stringValue) || '{}');
      const n = Math.max(1, meta.partes || 1);
      const partes = await Promise.all(Array.from({ length: n }, function (_, i) { return ler('doc-' + codigo + '-' + (i + 1)); }));
      const b64 = partes.map(function (p) { return (p.parte && p.parte.stringValue) || ''; }).join('');
      if (!b64) throw Object.assign(new Error('vazio'), { status: 500 });
      desenhar(meta, bytes(b64));
    } catch (e) {
      if (e.status === 404) aviso('Documento não encontrado', 'Este link não está mais ativo. Fale com a empresa para receber o documento atualizado.');
      else if (e.status === 403) {
        aviso('Documento ainda não liberado', 'A empresa está concluindo a configuração do envio. Tente de novo mais tarde.',
          /refer/i.test(e.texto || '') ? 'Para a empresa: a chave do Firebase (apiKey) não permite este endereço — libere-o nas restrições da chave.'
            : 'Para a empresa: o Firebase negou a leitura (403). Publique as regras do Firestore do passo 5 de Configurações › Sincronização (nuvem).');
      } else if (e.status) aviso('Documento indisponível no momento', 'Tente de novo em alguns minutos.', 'Código ' + e.status + '.');
      else aviso('Sem conexão', 'Não foi possível abrir o documento. Verifique a internet e tente de novo.');
    }
  }

  carregar();
})();
