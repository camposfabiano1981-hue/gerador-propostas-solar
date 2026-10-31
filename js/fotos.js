/*
 * Fotos das instalações (etiquetas dos equipamentos…): ficam no IndexedDB do navegador — fora do armazenamento local de ~5 MB
 * usado pelos cadastros — e, com a sincronização ligada, numa cópia na nuvem (usuarios/{uid}/fotos/{id}), lida sob demanda
 * nos outros aparelhos. Os registros guardam só o id da foto. Sem conexão, a foto sobe quando a sincronização voltar.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const BANCO = 'gsp-fotos', LOJA = 'fotos';
  const CHAVE_EXCLUIR = 'gsp.fotos.excluir'; // exclusões feitas sem conexão, para apagar da nuvem depois
  const mem = {}; // navegador sem IndexedDB: só nesta sessão
  let dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok) {
      try {
        if (!window.indexedDB) { ok(null); return; }
        const req = indexedDB.open(BANCO, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(LOJA, { keyPath: 'id' }); };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return dbp;
  }

  function pedido(modo, acao, semBanco) {
    return abrir().then(function (db) {
      if (!db) return semBanco();
      return new Promise(function (ok, erro) {
        const r = acao(db.transaction(LOJA, modo).objectStore(LOJA));
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { erro(r.error); };
      });
    });
  }

  function gravarLocal(reg) { return pedido('readwrite', function (l) { return l.put(reg); }, function () { mem[reg.id] = reg; }); }
  function lerLocal(id) { return pedido('readonly', function (l) { return l.get(id); }, function () { return mem[id]; }).then(function (r) { return r || null; }); }
  function removerLocal(id) { return pedido('readwrite', function (l) { return l.delete(id); }, function () { delete mem[id]; }); }
  function listarLocal() { return pedido('readonly', function (l) { return l.getAll(); }, function () { return Object.keys(mem).map(function (k) { return mem[k]; }); }).then(function (r) { return r || []; }); }

  function nuvem() { const N = App.Nuvem; return N && N.usuario && N.gravarFoto ? N : null; }

  function lerExcluir() { try { return JSON.parse(localStorage.getItem(CHAVE_EXCLUIR) || '[]') || []; } catch (e) { return []; } }
  function gravarExcluir(l) { try { if (l.length) localStorage.setItem(CHAVE_EXCLUIR, JSON.stringify(l)); else localStorage.removeItem(CHAVE_EXCLUIR); } catch (e) { /* indisponível */ } }

  function enviar(reg) {
    const N = nuvem();
    if (!N) return Promise.resolve(false);
    return N.gravarFoto(reg.id, { dataURL: reg.dataURL, w: reg.w, h: reg.h, tipo: reg.tipo || '', nome: reg.nome || '', criadoEm: reg.criadoEm, atualizadoEm: reg.criadoEm })
      .then(function () { reg.naNuvem = true; return gravarLocal(reg); }).then(function () { return true; }, function (e) { console.error(e); return false; });
  }

  const F = {};

  /**
   * Prepara a foto tirada no celular ou escolhida no computador: lado maior até `lado` px (padrão 1280, legível para etiquetas)
   * e JPEG comprimido até ~330 kB (ou `limite` caracteres do dataURL).
   */
  F.preparar = async function (arquivo, lado, limite) {
    const img = await U.loadImage(await U.readFileAsDataURL(arquivo));
    const max = lado || 1280;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, W, H);
    let q = 0.82, url = cv.toDataURL('image/jpeg', q);
    while (url.length > (limite || 450000) && q > 0.45) { q -= 0.08; url = cv.toDataURL('image/jpeg', q); }
    return { dataURL: url, w: W, h: H };
  };

  /** Grava a foto ({dataURL, w, h} e, nos documentos anexados, {tipo, nome}) e devolve o id. */
  F.salvar = async function (foto) {
    const reg = { id: 'foto-' + U.uid(), dataURL: foto.dataURL, w: foto.w || 0, h: foto.h || 0, criadoEm: new Date().toISOString(), naNuvem: false };
    if (foto.tipo) reg.tipo = foto.tipo;
    if (foto.nome) reg.nome = foto.nome;
    await gravarLocal(reg);
    enviar(reg);
    return reg.id;
  };

  /** Foto pelo id: deste aparelho ou, se ainda não estiver aqui, da nuvem (e guarda a cópia). */
  F.obter = async function (id) {
    if (!id) return null;
    const local = await lerLocal(id);
    if (local) return local;
    const N = nuvem();
    if (!N || !N.lerFoto) return null;
    let reg = null;
    try { reg = await N.lerFoto(id); } catch (e) { console.error(e); }
    if (!reg || !reg.dataURL) return null;
    reg = { id: id, dataURL: reg.dataURL, w: reg.w || 0, h: reg.h || 0, tipo: reg.tipo || '', nome: reg.nome || '', criadoEm: reg.criadoEm || '', naNuvem: true };
    await gravarLocal(reg);
    return reg;
  };

  F.remover = async function (id) {
    if (!id) return;
    const reg = await lerLocal(id);
    await removerLocal(id);
    const N = nuvem();
    if (N && N.excluirFoto) N.excluirFoto(id).catch(function (e) { console.error(e); });
    else if (!reg || reg.naNuvem) gravarExcluir(lerExcluir().concat([id]));
  };

  /** Envia as fotos tiradas sem conexão e apaga da nuvem as excluídas nesse período (chamado quando a sincronização fica pronta). */
  F.enviarPendentes = async function () {
    const N = nuvem();
    if (!N) return 0;
    const pend = (await listarLocal()).filter(function (r) { return !r.naNuvem; });
    await Promise.all(pend.map(enviar));
    const exc = lerExcluir();
    if (exc.length && N.excluirFoto) {
      gravarExcluir([]);
      exc.forEach(function (id) { N.excluirFoto(id).catch(function (e) { console.error(e); }); });
    }
    return pend.length;
  };

  /** Apaga as fotos e documentos deste aparelho (troca de usuário); continuam na nuvem. */
  F.limpar = function () {
    Object.keys(mem).forEach(function (k) { delete mem[k]; });
    gravarExcluir([]);
    return pedido('readwrite', function (l) { return l.clear(); }, function () { /* sem IndexedDB */ }).catch(function (e) { console.error(e); });
  };

  /** Todas as fotos deste aparelho (para o backup). */
  F.todas = function () {
    return listarLocal().then(function (l) { return l.map(function (r) { return { id: r.id, dataURL: r.dataURL, w: r.w, h: r.h, tipo: r.tipo || '', nome: r.nome || '', criadoEm: r.criadoEm }; }); });
  };

  /** Restaura as fotos de um backup (as que já existirem são mantidas). */
  F.importar = async function (lista) {
    let n = 0;
    for (const r of (lista || [])) {
      if (!r || !r.id || !r.dataURL) continue;
      if (await lerLocal(r.id)) continue;
      await gravarLocal({ id: r.id, dataURL: r.dataURL, w: r.w || 0, h: r.h || 0, tipo: r.tipo || '', nome: r.nome || '', criadoEm: r.criadoEm || new Date().toISOString(), naNuvem: false });
      n++;
    }
    F.enviarPendentes();
    return n;
  };

  const LIMITE_PDF = 6 * 1024 * 1024;

  function ehPdf(arquivo) { return arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name || ''); }

  /**
   * Documento anexado (orçamento, pedido ou nota do fornecedor): o PDF como veio ou a foto reduzida (lado maior até 1800 px,
   * legível para tabelas). Devolve {fotoId, nome, tipo} para o registro.
   */
  F.salvarArquivo = async function (arquivo) {
    const pdf = ehPdf(arquivo);
    let reg;
    if (pdf) {
      if (arquivo.size > LIMITE_PDF) throw new Error('PDF com mais de 6 MB: envie só as páginas do pedido.');
      reg = { dataURL: String(await U.readFileAsDataURL(arquivo)).replace(/^data:[^;,]*/, 'data:application/pdf'), w: 0, h: 0 };
    } else reg = await F.preparar(arquivo, 1800, 1200000);
    const tipo = pdf ? 'application/pdf' : 'image/jpeg';
    const nome = arquivo.name || (pdf ? 'documento.pdf' : 'foto.jpg');
    const id = await F.salvar(Object.assign(reg, { tipo: tipo, nome: nome }));
    return { fotoId: id, nome: nome, tipo: tipo };
  };

  /** O documento anexado como arquivo (para ler de novo ou abrir). */
  F.arquivo = async function (anexo) {
    const reg = await F.obter(anexo && anexo.fotoId);
    if (!reg) return null;
    const blob = await (await fetch(reg.dataURL)).blob();
    return new File([blob], anexo.nome || reg.nome || 'documento', { type: anexo.tipo || reg.tipo || blob.type });
  };

  F.ehPdf = ehPdf;

  App.Fotos = F;
})(window.App);
