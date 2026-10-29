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
    return N.gravarFoto(reg.id, { dataURL: reg.dataURL, w: reg.w, h: reg.h, criadoEm: reg.criadoEm, atualizadoEm: reg.criadoEm })
      .then(function () { reg.naNuvem = true; return gravarLocal(reg); }).then(function () { return true; }, function (e) { console.error(e); return false; });
  }

  const F = {};

  /**
   * Prepara a foto tirada no celular ou escolhida no computador: lado maior até `lado` px (padrão 1280, legível para etiquetas)
   * e JPEG comprimido até ~330 kB.
   */
  F.preparar = async function (arquivo, lado) {
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
    while (url.length > 450000 && q > 0.45) { q -= 0.08; url = cv.toDataURL('image/jpeg', q); }
    return { dataURL: url, w: W, h: H };
  };

  /** Grava a foto ({dataURL, w, h}) e devolve o id. */
  F.salvar = async function (foto) {
    const reg = { id: 'foto-' + U.uid(), dataURL: foto.dataURL, w: foto.w || 0, h: foto.h || 0, criadoEm: new Date().toISOString(), naNuvem: false };
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
    reg = { id: id, dataURL: reg.dataURL, w: reg.w || 0, h: reg.h || 0, criadoEm: reg.criadoEm || '', naNuvem: true };
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

  /** Todas as fotos deste aparelho (para o backup). */
  F.todas = function () {
    return listarLocal().then(function (l) { return l.map(function (r) { return { id: r.id, dataURL: r.dataURL, w: r.w, h: r.h, criadoEm: r.criadoEm }; }); });
  };

  /** Restaura as fotos de um backup (as que já existirem são mantidas). */
  F.importar = async function (lista) {
    let n = 0;
    for (const r of (lista || [])) {
      if (!r || !r.id || !r.dataURL) continue;
      if (await lerLocal(r.id)) continue;
      await gravarLocal({ id: r.id, dataURL: r.dataURL, w: r.w || 0, h: r.h || 0, criadoEm: r.criadoEm || new Date().toISOString(), naNuvem: false });
      n++;
    }
    F.enviarPendentes();
    return n;
  };

  App.Fotos = F;
})(window.App);
