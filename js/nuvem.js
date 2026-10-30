/*
 * Sincronização com o Firebase (Google): login com a conta Google e cópia dos dados no Cloud Firestore, atualizada em
 * tempo real entre os aparelhos e guardada em fila quando estiver sem internet. O armazenamento do navegador continua
 * sendo o que a plataforma lê; a chave da API do Claude e as preferências do aparelho não sobem para a nuvem.
 *
 * Dados: usuarios/{uid}/{coleção}/{id} = {json, partes, atualizadoEm, excluido}; configuração em usuarios/{uid}/config/geral.
 * Registros grandes (fotos) são divididos em usuarios/{uid}/partes/{coleção}__{id}__{n} (limite de 1 MiB por documento).
 * Fotos das instalações (App.Fotos): usuarios/{uid}/fotos/{id}, gravadas ao tirar e lidas sob demanda (fora das coleções acompanhadas).
 * Página pública do cliente (App.Acompanhamento): acompanhamento/{código} = {json, atualizadoEm}, lida sem login pela acompanhe.html;
 * documentos enviados ao cliente (App.Envio): acompanhamento/doc-{código} e as partes do PDF, lidos pela ver.html.
 * Conflitos: vale a versão com a data de alteração (atualizadoEm) mais recente; exclusões ficam marcadas (excluido: true).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const VERSAO_SDK = '12.19.0';
  const BASE_SDK = 'https://www.gstatic.com/firebasejs/' + VERSAO_SDK + '/';
  const CHAVE_CFG = 'gsp.nuvem';
  const PARTE = 300000; // caracteres por documento: folga para o limite de 1 MiB mesmo com acentos (UTF-8)
  const EPOCA = '1970-01-01T00:00:00.000Z';
  const CAMPOS_CFG = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

  const N = { estado: 'desligado', usuario: null, pendentes: 0, mensagem: '', ultimaSync: null };
  let fb = null;          // {m: módulos do SDK, app, auth, db}
  let ouvintes = [];      // cancelamento dos onSnapshot
  let primeira = {};      // coleção → primeira leitura concluída
  let conhecidos = {};    // coleção → ids existentes na nuvem (não excluídos)
  let filas = {};         // coleção → promessa (processa os snapshots em ordem)
  let enviadosNaEntrada = 0;
  const observadores = [];

  /* ------------------------------------------------------------ configuração do projeto Firebase */

  /** Configuração do app web do Firebase: a colada neste aparelho ou a publicada em js/nuvem-config.js. */
  N.config = function () {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE_CFG) || 'null');
      if (c && c.apiKey && c.projectId) return c;
    } catch (e) { /* sem configuração local */ }
    return App.NUVEM_CONFIG && App.NUVEM_CONFIG.apiKey ? App.NUVEM_CONFIG : null;
  };

  N.configurada = function () { return !!N.config(); };

  /** Lê o objeto firebaseConfig colado do console (JSON ou o trecho em JavaScript). */
  N.lerConfig = function (texto) {
    const cfg = {};
    String(texto || '').replace(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g, function (_, k, v) {
      if (CAMPOS_CFG.indexOf(k) >= 0) cfg[k] = v.trim();
      return _;
    });
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
      throw new Error('Configuração incompleta: copie o objeto firebaseConfig inteiro (apiKey, authDomain, projectId e appId).');
    }
    return cfg;
  };

  N.salvarConfig = function (cfg) {
    try {
      if (cfg) localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg)); else localStorage.removeItem(CHAVE_CFG);
    } catch (e) { throw new Error('Não foi possível salvar a configuração neste navegador.'); }
  };

  /**
   * Regras de segurança do Firestore: só a conta Google informada lê e grava os próprios dados. A página "Acompanhe sua obra"
   * (acompanhamento/{código}) pode ser lida por quem tem o link — só pelo código, sem listar as obras — e só essa conta grava.
   */
  N.regras = function (email) {
    const conta = String(email || 'SEU-EMAIL@gmail.com').trim().toLowerCase();
    return "rules_version = '2';\n" +
      'service cloud.firestore {\n' +
      '  match /databases/{database}/documents {\n' +
      '    match /usuarios/{uid}/{documento=**} {\n' +
      '      allow read, write: if request.auth != null && request.auth.uid == uid\n' +
      '        && request.auth.token.email == "' + conta + '";\n' +
      '    }\n' +
      '    match /acompanhamento/{codigo} {\n' +
      '      allow get: if true;\n' +
      '      allow create, update, delete: if request.auth != null && request.auth.token.email == "' + conta + '";\n' +
      '    }\n' +
      '  }\n' +
      '}\n';
  };

  /** De onde vem a configuração em uso: 'aparelho' (colada aqui), 'site' (js/nuvem-config.js) ou null. */
  N.origemConfig = function () {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE_CFG) || 'null');
      if (c && c.apiKey && c.projectId) return 'aparelho';
    } catch (e) { /* sem configuração local */ }
    return App.NUVEM_CONFIG && App.NUVEM_CONFIG.apiKey ? 'site' : null;
  };

  /* ------------------------------------------------------------ estado e avisos */

  /** Chama fn(N) agora e a cada mudança de estado; devolve a função que cancela o acompanhamento. */
  N.observar = function (fn) {
    observadores.push(fn);
    fn(N);
    return function () { const i = observadores.indexOf(fn); if (i >= 0) observadores.splice(i, 1); };
  };

  function definirEstado(estado, mensagem) {
    N.estado = estado;
    N.mensagem = mensagem || '';
    if (estado === 'ok') N.ultimaSync = new Date().toISOString();
    observadores.slice().forEach(function (fn) { try { fn(N); } catch (e) { console.error(e); } });
  }

  function traduzir(e) {
    const c = (e && e.code) || '';
    if (/permission-denied/.test(c)) return 'Sem permissão no banco da nuvem: confira as regras de segurança do Firestore e o e-mail autorizado.';
    if (/unauthorized-domain/.test(c)) return 'Este endereço não está autorizado no Firebase (Authentication › Configurações › Domínios autorizados): adicione ' + location.hostname + '.';
    if (/operation-not-allowed/.test(c)) return 'O login com Google não está ativado no Firebase (Authentication › Método de login › Google).';
    if (/network-request-failed|unavailable/.test(c)) return 'Sem conexão com a nuvem no momento.';
    if (/internal-error/.test(c)) return 'Não foi possível abrir o login do Google: verifique a internet e se ' + (location.hostname || 'este endereço') + ' está nos domínios autorizados do Firebase.';
    if (/invalid-api-key|api-key-not-valid/.test(c)) return 'Configuração do Firebase inválida (apiKey). Cole de novo o firebaseConfig.';
    return (e && e.message) || String(e);
  }

  /* ------------------------------------------------------------ inicialização e login */

  async function carregarSdk() {
    const mods = await Promise.all([import(BASE_SDK + 'firebase-app.js'), import(BASE_SDK + 'firebase-auth.js'), import(BASE_SDK + 'firebase-firestore.js')]);
    return { app: mods[0], auth: mods[1], fs: mods[2] };
  }

  /** Liga a sincronização (se houver configuração): carrega o SDK e acompanha o login. */
  N.iniciar = async function () {
    App.Store.ganchos = { aoSalvar: aoSalvar, aoRemover: aoRemover, aoSalvarConfig: aoSalvarConfig, aoSubstituirTudo: aoSubstituirTudo };
    if (!N.configurada()) { definirEstado('naoConfigurado'); return; }
    if (fb) return;
    definirEstado('conectando');
    let m;
    try { m = await carregarSdk(); } catch (e) { definirEstado('erro', 'Não foi possível carregar o Firebase (verifique a internet).'); return; }
    try {
      const app = m.app.initializeApp(N.config());
      const auth = m.auth.getAuth(app);
      let db;
      try {
        // cópia local do banco (IndexedDB): funciona sem internet e envia as alterações quando a conexão volta
        db = m.fs.initializeFirestore(app, { localCache: m.fs.persistentLocalCache({ tabManager: m.fs.persistentMultipleTabManager() }) });
      } catch (e) { db = m.fs.getFirestore(app); }
      fb = { m: m, app: app, auth: auth, db: db };
      m.auth.getRedirectResult(auth).catch(function (e) { definirEstado('erro', traduzir(e)); });
      m.auth.onAuthStateChanged(auth, function (u) {
        if (u) iniciarSync(u);
        else { pararSync(); N.usuario = null; definirEstado('desconectado'); }
      });
    } catch (e) {
      fb = null;
      definirEstado('erro', traduzir(e));
    }
  };

  N.entrar = async function () {
    if (!fb) await N.iniciar();
    if (!fb) throw new Error(N.mensagem || 'Sincronização não configurada.');
    const prov = new fb.m.auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: 'select_account' });
    try {
      await fb.m.auth.signInWithPopup(fb.auth, prov);
    } catch (e) {
      const c = (e && e.code) || '';
      if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return;
      // celulares e navegadores que bloqueiam janelas: login na própria página
      if (/popup-blocked|operation-not-supported/.test(c)) { await fb.m.auth.signInWithRedirect(fb.auth, prov); return; }
      throw new Error(traduzir(e));
    }
  };

  N.sair = async function () {
    if (!fb) return;
    pararSync();
    await fb.m.auth.signOut(fb.auth);
  };

  /* ------------------------------------------------------------ leitura e gravação no Firestore */

  function refDoc(col, id) { return fb.m.fs.doc(fb.db, 'usuarios', N.usuario.uid, col, id); }
  function refParte(col, id, i) { return fb.m.fs.doc(fb.db, 'usuarios', N.usuario.uid, 'partes', col + '__' + id + '__' + i); }

  async function gravarDoc(col, id, obj) {
    const json = JSON.stringify(obj);
    const ts = obj.atualizadoEm || EPOCA;
    if (json.length <= PARTE) {
      await fb.m.fs.setDoc(refDoc(col, id), { json: json, partes: 0, atualizadoEm: ts, excluido: false });
      return;
    }
    const n = Math.ceil(json.length / PARTE);
    const lote = fb.m.fs.writeBatch(fb.db);
    for (let i = 0; i < n; i++) lote.set(refParte(col, id, i), { texto: json.slice(i * PARTE, (i + 1) * PARTE) });
    lote.set(refDoc(col, id), { partes: n, atualizadoEm: ts, excluido: false });
    await lote.commit();
  }

  async function lerDoc(col, id, dados) {
    if (!(dados.partes > 0)) return JSON.parse(dados.json);
    const partes = await Promise.all(Array.from({ length: dados.partes }, function (_, i) { return fb.m.fs.getDoc(refParte(col, id, i)); }));
    return JSON.parse(partes.map(function (p) { return (p.data() || {}).texto || ''; }).join(''));
  }

  /** Estado depois de cada envio: fila, sem internet, sincronizado. */
  function estadoAtual() {
    if (!N.usuario) return N.estado;
    if (navigator.onLine === false) return 'semInternet';
    if (!todasLidas()) return 'sincronizando';
    return N.pendentes ? 'enviando' : 'ok';
  }

  // sem internet, o Firestore guarda a gravação na fila local e só conclui a promessa quando ela chega ao servidor
  function acompanhar(promessa) {
    N.pendentes++;
    definirEstado(estadoAtual());
    return promessa.then(function () {
      N.pendentes--;
      definirEstado(estadoAtual());
    }, function (e) {
      N.pendentes--;
      definirEstado('erro', traduzir(e));
    });
  }

  function enviar(col, id, obj) {
    if (!N.usuario || !fb) return;
    if (col !== 'config') (conhecidos[col] = conhecidos[col] || {})[id] = true;
    acompanhar(gravarDoc(col, id, obj));
  }

  function enviarExclusao(col, id, ts) {
    if (!N.usuario || !fb) return;
    if (conhecidos[col]) delete conhecidos[col][id];
    acompanhar(fb.m.fs.setDoc(refDoc(col, id), { excluido: true, partes: 0, atualizadoEm: ts || new Date().toISOString() }));
  }

  /* ------------------------------------------------------------ página pública "Acompanhe sua obra" */

  /** Grava a página do cliente em acompanhamento/{código} (lida sem login, só por quem tem o link). */
  N.publicarAcompanhamento = function (codigo, dados) {
    if (!N.usuario || !fb) return Promise.reject(new Error('Sincronização desligada.'));
    const p = fb.m.fs.setDoc(fb.m.fs.doc(fb.db, 'acompanhamento', codigo), { json: JSON.stringify(dados), atualizadoEm: dados.atualizadoEm || new Date().toISOString() });
    acompanhar(p);
    return p;
  };

  N.removerAcompanhamento = function (codigo) {
    if (!N.usuario || !fb) return Promise.reject(new Error('Sincronização desligada.'));
    const p = fb.m.fs.deleteDoc(fb.m.fs.doc(fb.db, 'acompanhamento', codigo));
    acompanhar(p);
    return p;
  };

  const PARTE_DOC = 700000; // caracteres do PDF (base64) por documento público

  /**
   * PDF enviado ao cliente (App.Envio): acompanhamento/{id} = {json (tipo, número, empresa, partes…)} e o arquivo em base64 em
   * acompanhamento/{id}-1, -2…, lidos sem login só pelo código do link. Partes que sobraram de uma versão maior são apagadas.
   */
  N.publicarDocumento = function (id, meta, base64) {
    if (!N.usuario || !fb) return Promise.reject(new Error('Sincronização desligada.'));
    const fs = fb.m.fs, lote = fs.writeBatch(fb.db);
    const ref = function (x) { return fs.doc(fb.db, 'acompanhamento', x); };
    const n = Math.max(1, Math.ceil(base64.length / PARTE_DOC));
    for (let i = 0; i < n; i++) lote.set(ref(id + '-' + (i + 1)), { parte: base64.slice(i * PARTE_DOC, (i + 1) * PARTE_DOC) });
    for (let i = n; i < n + 4; i++) lote.delete(ref(id + '-' + (i + 1)));
    lote.set(ref(id), { json: JSON.stringify(Object.assign({}, meta, { partes: n })), atualizadoEm: meta.atualizadoEm || new Date().toISOString() });
    const p = lote.commit();
    acompanhar(p);
    return p;
  };

  N.removerDocumento = async function (id) {
    if (!N.usuario || !fb) throw new Error('Sincronização desligada.');
    const fs = fb.m.fs;
    const ref = function (x) { return fs.doc(fb.db, 'acompanhamento', x); };
    let n = 0;
    try { const snap = await fs.getDoc(ref(id)); if (snap.exists()) n = (JSON.parse(snap.data().json || '{}').partes || 0); } catch (e) { n = 0; }
    const lote = fs.writeBatch(fb.db);
    lote.delete(ref(id));
    for (let i = 0; i < n + 4; i++) lote.delete(ref(id + '-' + (i + 1)));
    const p = lote.commit();
    acompanhar(p);
    return p;
  };

  /* ------------------------------------------------------------ fotos (lidas sob demanda) */

  N.gravarFoto = function (id, obj) {
    if (!N.usuario || !fb) return Promise.reject(new Error('Sincronização desligada.'));
    const p = gravarDoc('fotos', id, obj);
    acompanhar(p);
    return p;
  };

  N.lerFoto = async function (id) {
    if (!N.usuario || !fb) return null;
    const snap = await fb.m.fs.getDoc(refDoc('fotos', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    return d.excluido ? null : lerDoc('fotos', id, d);
  };

  N.excluirFoto = async function (id) {
    if (!N.usuario || !fb) throw new Error('Sincronização desligada.');
    const snap = await fb.m.fs.getDoc(refDoc('fotos', id));
    const n = snap.exists() ? (snap.data().partes || 0) : 0;
    const lote = fb.m.fs.writeBatch(fb.db);
    for (let i = 0; i < n; i++) lote.delete(refParte('fotos', id, i));
    lote.delete(refDoc('fotos', id));
    await lote.commit();
  };

  /* ------------------------------------------------------------ sincronização */

  const COLECOES = function () { return App.Store.COLECOES.concat(['config']); };

  function todasLidas() { return COLECOES().every(function (c) { return primeira[c]; }); }

  function tsLocal(col, id) {
    if (col === 'config') return App.Store.configBruta().atualizadoEm || '';
    const item = App.Store.get(col, id);
    return item ? (item.atualizadoEm || '') : (App.Store.excluidos(col)[id] || '');
  }

  /**
   * Aplica um documento da nuvem se ele for mais novo que o deste aparelho. Se for mais antigo (ex.: gravação atrasada
   * de um aparelho que estava sem internet), reenvia a versão deste aparelho para a nuvem voltar à mais recente.
   */
  async function aplicar(col, id, d, reenviarSeAntigo) {
    const tsR = d.atualizadoEm || EPOCA;
    const tsL = tsLocal(col, id);
    if (tsR < tsL && reenviarSeAntigo) {
      if (col === 'config') enviar('config', 'geral', App.Store.configBruta());
      else if (App.Store.get(col, id)) enviar(col, id, App.Store.get(col, id));
      else if (App.Store.excluidos(col)[id] && !d.excluido) enviarExclusao(col, id, App.Store.excluidos(col)[id]);
      return false;
    }
    if (tsR <= tsL) return false;
    if (d.excluido) {
      if (col === 'config') return false;
      const existia = !!App.Store.get(col, id);
      App.Store.excluirRemoto(col, id, tsR);
      return existia;
    }
    const obj = await lerDoc(col, id, d);
    if (col !== 'config') App.Store.aplicarRemoto(col, obj);
    else if (App.Store.aplicarConfigRemota(obj)) enviar('config', 'geral', App.Store.configBruta());
    return true;
  }

  /** Primeira leitura de uma coleção: traz o que é mais novo na nuvem e envia o que é mais novo (ou só existe) aqui. */
  async function mesclar(col, docs) {
    const remotos = {};
    docs.forEach(function (d) { remotos[d.id] = d.data(); });
    conhecidos[col] = {};
    Object.keys(remotos).forEach(function (id) { if (!remotos[id].excluido) conhecidos[col][id] = true; });
    let mudou = false;
    for (const id of Object.keys(remotos)) {
      try { mudou = (await aplicar(col, id, remotos[id])) || mudou; } catch (e) { console.error(e); }
    }
    if (col === 'config') {
      const c = App.Store.configBruta();
      const r = remotos.geral;
      if (Object.keys(c).length > 1 && (!r || (c.atualizadoEm || EPOCA) > (r.atualizadoEm || EPOCA))) { enviar('config', 'geral', c); enviadosNaEntrada++; }
    } else {
      App.Store.list(col).forEach(function (o) {
        const r = remotos[o.id];
        if (!r || (o.atualizadoEm || EPOCA) > (r.atualizadoEm || EPOCA)) { enviar(col, o.id, o); enviadosNaEntrada++; }
      });
      const exc = App.Store.excluidos(col);
      Object.keys(exc).forEach(function (id) {
        const r = remotos[id];
        if (r && !r.excluido && exc[id] > (r.atualizadoEm || EPOCA)) enviarExclusao(col, id, exc[id]);
      });
    }
    return mudou;
  }

  async function tratar(col, snap) {
    let mudou = false;
    if (!primeira[col]) {
      // aparelho conectado: espera a resposta do servidor (a cópia local pode estar vazia ou desatualizada)
      if (snap.metadata && snap.metadata.fromCache && navigator.onLine !== false) return;
      mudou = await mesclar(col, snap.docs);
      primeira[col] = true;
      if (todasLidas()) {
        if (enviadosNaEntrada) App.UI.toast(enviadosNaEntrada + ' registro(s) deste aparelho enviados para a nuvem.', 'ok');
        enviadosNaEntrada = 0;
        // fotos tiradas sem conexão
        if (App.Fotos) App.Fotos.enviarPendentes().catch(function (e) { console.error(e); });
        definirEstado(estadoAtual());
      }
    } else {
      for (const ch of snap.docChanges()) {
        if (ch.doc.metadata && ch.doc.metadata.hasPendingWrites) continue; // alteração feita neste aparelho
        if (ch.type === 'removed') continue;
        const d = ch.doc.data();
        if (col !== 'config') { if (d.excluido) delete (conhecidos[col] || {})[ch.doc.id]; else (conhecidos[col] = conhecidos[col] || {})[ch.doc.id] = true; }
        try { mudou = (await aplicar(col, ch.doc.id, d, true)) || mudou; } catch (e) { console.error(e); }
      }
      if (todasLidas()) definirEstado(estadoAtual());
    }
    if (mudou) avisarMudanca(col);
  }

  function iniciarSync(u) {
    pararSync();
    N.usuario = { uid: u.uid, email: u.email || '', nome: u.displayName || '' };
    primeira = {}; conhecidos = {}; filas = {}; enviadosNaEntrada = 0;
    definirEstado('sincronizando');
    COLECOES().forEach(function (col) {
      const ref = fb.m.fs.collection(fb.db, 'usuarios', N.usuario.uid, col);
      ouvintes.push(fb.m.fs.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
        filas[col] = (filas[col] || Promise.resolve()).then(function () { return tratar(col, snap); }).catch(function (e) { console.error(e); });
      }, function (e) { definirEstado('erro', traduzir(e)); }));
    });
  }

  function pararSync() {
    ouvintes.forEach(function (fn) { try { fn(); } catch (e) { /* já cancelado */ } });
    ouvintes = [];
  }

  /* ------------------------------------------------------------ alterações feitas neste aparelho */

  function aoSalvar(col, obj) { enviar(col, obj.id, obj); }
  function aoRemover(col, id, ts) { enviarExclusao(col, id, ts); }
  function aoSalvarConfig(c) { enviar('config', 'geral', c); }

  /** Importação de backup ou restauração dos padrões: a nuvem passa a espelhar a base deste aparelho. */
  function aoSubstituirTudo() {
    if (!N.usuario || !fb) return;
    const ts = new Date().toISOString();
    App.Store.COLECOES.forEach(function (col) {
      const locais = {};
      App.Store.list(col).forEach(function (o) { locais[o.id] = true; enviar(col, o.id, o); });
      Object.keys(conhecidos[col] || {}).forEach(function (id) { if (!locais[id]) enviarExclusao(col, id, ts); });
    });
    enviar('config', 'geral', App.Store.configBruta());
  }

  /* ------------------------------------------------------------ tela */

  let avisoPendente = null;
  function avisarMudanca() {
    clearTimeout(avisoPendente);
    avisoPendente = setTimeout(function () {
      if (App.atualizarMarca) App.atualizarMarca();
      // formulário aberto (ou janela de edição): não recarrega para não perder o que está sendo digitado
      if (document.querySelector('dialog[open]') || App.UI.guarda) {
        App.UI.toast('Dados atualizados em outro aparelho. Ao sair desta tela, a lista será atualizada.', 'info');
        return;
      }
      App.UI.despachar(true);
    }, 400);
  }

  window.addEventListener('online', function () { if (N.usuario) definirEstado(estadoAtual()); });
  window.addEventListener('offline', function () { if (N.usuario) definirEstado('semInternet'); });

  /** Texto curto do estado (menu lateral). */
  N.resumo = function () {
    switch (N.estado) {
      case 'naoConfigurado': return '☁️ Sincronização desligada';
      case 'conectando': return '☁️ Conectando…';
      case 'desconectado': return '☁️ Entrar para sincronizar';
      case 'sincronizando': return '☁️ Sincronizando…';
      case 'enviando': return '☁️ Enviando ' + N.pendentes + ' alteração(ões)…';
      case 'semInternet': return '📴 Sem internet' + (N.pendentes ? ' — ' + N.pendentes + ' alteração(ões) na fila' : ' — dados guardados');
      case 'ok': return '☁️ Sincronizado';
      case 'erro': return '⚠️ Erro na sincronização';
      default: return '☁️ Sincronização';
    }
  };

  App.Nuvem = N;
})(window.App);
