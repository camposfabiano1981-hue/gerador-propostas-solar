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
   * Regras de segurança do Firestore. Dados da empresa em usuarios/{uid do dono}: o dono (a conta Google informada) e a equipe
   * cadastrada em equipe/{e-mail} (perfil, base e ativo) — administrador tudo; vendedor tudo menos o financeiro; técnico
   * instalações e OS (e consulta clientes e equipamentos). A equipe só é gerida pelo administrador. As páginas públicas
   * (acompanhamento/{código}) são lidas só pelo código do link, sem listar.
   */
  N.regras = function (email) {
    const conta = String(email || 'SEU-EMAIL@gmail.com').trim().toLowerCase();
    const fin = "['lancamentos', 'contasFin', 'categoriasFin']";
    return "rules_version = '2';\n" +
      'service cloud.firestore {\n' +
      '  match /databases/{database}/documents {\n' +
      '    function logado() { return request.auth != null && request.auth.token.email != null; }\n' +
      '    function email() { return request.auth.token.email.lower(); }\n' +
      '    function dono() { return logado() && email() == "' + conta + '" && request.auth.token.email_verified == true; }\n' +
      '    function cadastro() { return get(/databases/$(database)/documents/equipe/$(email())).data; }\n' +
      // equipe: e-mail confirmado (login com Google ou senha redefinida pelo link) ou a conta de senha criada pelo administrador (uid no cadastro)
      '    function membro() { return logado() && exists(/databases/$(database)/documents/equipe/$(email())) && cadastro().ativo == true\n' +
      "      && (request.auth.token.email_verified == true || cadastro().get('uid', '') == request.auth.uid); }\n" +
      '    function admin() { return dono() || (membro() && cadastro().perfil == "admin"); }\n' +
      '    function daEmpresa(uid) { return (dono() && request.auth.uid == uid) || (membro() && cadastro().base == uid); }\n' +
      '    function le(col) {\n' +
      '      return dono() || cadastro().perfil == "admin"\n' +
      '        || (cadastro().perfil == "vendedor" && !(col in ' + fin + '))\n' +
      "        || (cadastro().perfil == \"tecnico\" && col in ['instalacoes', 'ordens', 'clientes', 'equipamentos', 'config', 'fotos']);\n" +
      '    }\n' +
      '    function grava(col) {\n' +
      '      return dono() || cadastro().perfil == "admin"\n' +
      '        || (cadastro().perfil == "vendedor" && !(col in ' + fin + '))\n' +
      "        || (cadastro().perfil == \"tecnico\" && col in ['instalacoes', 'ordens', 'config', 'fotos']);\n" +
      '    }\n' +
      '    match /usuarios/{uid}/partes/{parte} {\n' +
      "      allow read: if daEmpresa(uid) && le(parte.split('__')[0]);\n" +
      "      allow write: if daEmpresa(uid) && grava(parte.split('__')[0]);\n" +
      '    }\n' +
      '    match /usuarios/{uid}/{col}/{id} {\n' +
      "      allow read: if col != 'partes' && daEmpresa(uid) && le(col);\n" +
      "      allow write: if col != 'partes' && daEmpresa(uid) && grava(col);\n" +
      '    }\n' +
      '    match /equipe/{conta} {\n' +
      '      allow get: if logado() && email() == conta;\n' +
      '      allow read, write: if admin();\n' +
      '    }\n' +
      '    match /acompanhamento/{codigo} {\n' +
      '      allow get: if true;\n' +
      '      allow create, update, delete: if dono() || membro();\n' +
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
    if (/operation-not-allowed/.test(c)) return 'Este método de login não está ativado no Firebase (Authentication › Método de login › E-mail/senha ou Google).';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'E-mail ou senha incorretos.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas seguidas. Aguarde alguns minutos ou use "Esqueci a senha".';
    if (/invalid-email/.test(c)) return 'E-mail inválido.';
    if (/email-already-in-use/.test(c)) return 'Já existe uma conta com este e-mail.';
    if (/weak-password/.test(c)) return 'Senha fraca: use pelo menos 6 caracteres.';
    if (/user-disabled/.test(c)) return 'Esta conta foi desativada no Firebase.';
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
        if (u) iniciarSync(u).catch(function (e) { console.error(e); definirEstado('erro', traduzir(e)); });
        else { pararSync(); N.usuario = null; if (N.estado !== 'naoAutorizado') definirEstado('desconectado'); }
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

  /** Login com e-mail e senha (contas da equipe criadas pelo administrador). */
  N.entrarComSenha = async function (email, senha) {
    if (!fb) await N.iniciar();
    if (!fb) throw new Error(N.mensagem || 'Sincronização não configurada.');
    try { await fb.m.auth.signInWithEmailAndPassword(fb.auth, String(email || '').trim(), senha || ''); } catch (e) { throw new Error(traduzir(e)); }
  };

  /** E-mail do Firebase para criar ou trocar a senha. */
  N.redefinirSenha = async function (email) {
    if (!fb) await N.iniciar();
    if (!fb) throw new Error(N.mensagem || 'Sincronização não configurada.');
    try { await fb.m.auth.sendPasswordResetEmail(fb.auth, String(email || '').trim()); } catch (e) { throw new Error(traduzir(e)); }
  };

  /** Sai da conta; com limpar, apaga os dados da empresa deste aparelho (aparelho compartilhado ou de outra pessoa). */
  N.sair = async function (limpar) {
    if (!fb) return;
    pararSync();
    N.usuario = null;
    App.Acesso.gravarSessao(null);
    if (limpar) App.Store.limparDados();
    await fb.m.auth.signOut(fb.auth);
  };

  /* ------------------------------------------------------------ leitura e gravação no Firestore */

  // dados da empresa: usuarios/{uid do dono} — o dono usa a própria conta; a equipe, a base do cadastro dela
  function base() { return (N.usuario && (N.usuario.base || N.usuario.uid)) || ''; }
  function refDoc(col, id) { return fb.m.fs.doc(fb.db, 'usuarios', base(), col, id); }
  function refParte(col, id, i) { return fb.m.fs.doc(fb.db, 'usuarios', base(), 'partes', col + '__' + id + '__' + i); }

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
    if (App.Acesso && !App.Acesso.podeGravar(col, N.usuario.perfil)) return; // coleção fora do perfil: fica só neste aparelho
    if (col !== 'config') (conhecidos[col] = conhecidos[col] || {})[id] = true;
    acompanhar(gravarDoc(col, id, obj));
  }

  function enviarExclusao(col, id, ts) {
    if (!N.usuario || !fb) return;
    if (App.Acesso && !App.Acesso.podeGravar(col, N.usuario.perfil)) return;
    if (conhecidos[col]) delete conhecidos[col][id];
    acompanhar(fb.m.fs.setDoc(refDoc(col, id), { excluido: true, partes: 0, atualizadoEm: ts || new Date().toISOString() }));
  }

  /* ------------------------------------------------------------ equipe (administrador) */

  const CHAVE_EQUIPE = 'gsp.equipe';
  function guardarEquipe(lista) { try { localStorage.setItem(CHAVE_EQUIPE, JSON.stringify(lista)); } catch (e) { /* indisponível */ } }

  /** Equipe guardada neste aparelho (para escolher o vendedor da proposta, sem consultar a nuvem). */
  N.equipeLocal = function () { try { return JSON.parse(localStorage.getItem(CHAVE_EQUIPE) || '[]') || []; } catch (e) { return []; } };

  /** Erro da equipe: recusa do Firebase (regras sem a equipe ou publicadas com outro e-mail) marcada para a tela orientar. */
  function erroEquipe(e) {
    const regras = /permission-denied/.test((e && e.code) || '');
    const x = new Error(regras ? 'O Firebase recusou o acesso à equipe: as regras publicadas no Firestore ainda não têm a equipe (são de uma versão anterior) ou foram publicadas com outro e-mail.' : traduzir(e));
    x.regras = regras;
    return x;
  }

  /** Endereços do console do Firebase deste projeto (regras do Firestore e métodos de login). */
  N.console = function () {
    const id = (N.config() || {}).projectId || '';
    const b = 'https://console.firebase.google.com/project/' + encodeURIComponent(id);
    return { regras: b + '/firestore/rules', login: b + '/authentication/providers', projeto: id };
  };

  N.equipe = {
    /** Pessoas cadastradas na base da empresa. */
    listar: async function () {
      if (!N.usuario || !fb) throw new Error('Entre na sua conta para ver a equipe.');
      const fs = fb.m.fs;
      let snap;
      try { snap = await fs.getDocs(fs.query(fs.collection(fb.db, 'equipe'), fs.where('base', '==', base()))); } catch (e) { throw erroEquipe(e); }
      const lista = snap.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
      guardarEquipe(lista.map(function (m) { return { email: m.email, nome: m.nome, perfil: m.perfil, ativo: m.ativo !== false }; }));
      return lista;
    },
    /** Cadastra ou altera uma pessoa (perfil, nome, ativo) na base da empresa. */
    salvar: async function (m) {
      if (!N.usuario || !fb) throw new Error('Entre na sua conta para gerir a equipe.');
      const email = String(m.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
      const reg = { email: email, nome: String(m.nome || '').trim() || email, perfil: m.perfil || 'vendedor', ativo: m.ativo !== false, base: base(), uid: m.uid || '',
        criadoEm: m.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString(), criadoPor: m.criadoPor || N.usuario.email };
      try { await fb.m.fs.setDoc(fb.m.fs.doc(fb.db, 'equipe', email), reg); } catch (e) { throw erroEquipe(e); }
      return reg;
    },
    remover: async function (email) {
      if (!N.usuario || !fb) throw new Error('Entre na sua conta para gerir a equipe.');
      try { await fb.m.fs.deleteDoc(fb.m.fs.doc(fb.db, 'equipe', String(email).toLowerCase())); } catch (e) { throw erroEquipe(e); }
    },
    /**
     * Cria a conta de login (e-mail e senha) sem trocar a conta de quem está usando: um segundo app do Firebase faz o cadastro e sai.
     * Devolve {criada, uid} — criada false quando o e-mail já tinha conta; {semSenha: true} quando o login por e-mail e senha não
     * está ativado no Firebase (a pessoa ainda pode entrar com Google, se o e-mail for uma conta Google).
     */
    criarConta: async function (email, senha) {
      if (!fb) throw new Error('Sincronização não configurada.');
      const app2 = fb.m.app.initializeApp(N.config(), 'equipe-' + Date.now());
      try {
        const auth2 = fb.m.auth.getAuth(app2);
        const cred = await fb.m.auth.createUserWithEmailAndPassword(auth2, String(email).trim(), senha);
        await fb.m.auth.signOut(auth2);
        return { criada: true, uid: (cred && cred.user && cred.user.uid) || '' };
      } catch (e) {
        const c = (e && e.code) || '';
        if (/email-already-in-use/.test(c)) return { criada: false, uid: '' };
        if (/operation-not-allowed|admin-restricted-operation/.test(c)) return { criada: false, uid: '', semSenha: true };
        throw new Error(traduzir(e));
      } finally {
        try { await fb.m.app.deleteApp(app2); } catch (e) { /* encerrado */ }
      }
    }
  };

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

  const COLECOES = function () {
    const lista = App.Acesso && N.usuario ? App.Acesso.colecoes(N.usuario.perfil) : App.Store.COLECOES;
    return lista.concat(['config']);
  };

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

  /**
   * Quem entrou: cadastrado na equipe (equipe/{e-mail}: perfil, base da empresa, ativo) ou o dono da conta (a base é a própria
   * conta; as regras do Firestore confirmam pelo e-mail). Sem internet, vale a sessão guardada neste aparelho.
   */
  async function identificar(u) {
    const email = String(u.email || '').trim().toLowerCase();
    const anterior = App.Acesso.sessao();
    let cad = null, erro = null;
    if (email) {
      try { const s = await fb.m.fs.getDoc(fb.m.fs.doc(fb.db, 'equipe', email)); if (s.exists()) cad = s.data(); } catch (e) { erro = e; }
    }
    if (erro && !/permission-denied/.test(erro.code || '') && anterior && anterior.uid === u.uid) return anterior;
    if (cad) {
      if (cad.ativo === false) return { bloqueado: true };
      // conta de senha que não é a criada pelo administrador e sem e-mail confirmado: as regras recusam
      if (!u.emailVerified && (cad.uid || '') !== u.uid) {
        return { bloqueado: true, motivo: 'Este acesso ainda não foi confirmado. Se o seu e-mail é do Google (Gmail), use "Entrar com Google"; senão, peça ao administrador para enviar o e-mail de senha (🔑 Senha em Equipe e acessos) e crie a senha pelo link.' };
      }
      return { uid: u.uid, email: email, nome: cad.nome || u.displayName || email, perfil: cad.perfil || 'vendedor', base: cad.base || u.uid, dono: false };
    }
    return { uid: u.uid, email: email, nome: u.displayName || email, perfil: 'admin', base: u.uid, dono: true };
  }

  async function naoAutorizado(msg) {
    pararSync();
    N.usuario = null;
    App.Acesso.gravarSessao(null);
    App.Acesso.aplicarMenu();
    definirEstado('naoAutorizado', msg);
    try { await fb.m.auth.signOut(fb.auth); } catch (e) { /* já saiu */ }
    definirEstado('naoAutorizado', msg);
  }

  function erroOuvinte(col, e) {
    if (/permission-denied/.test((e && e.code) || '') && N.usuario && !primeira[col]) {
      naoAutorizado(N.usuario.dono
        ? 'Este e-mail não tem acesso à base da empresa. Se você faz parte da equipe, peça ao administrador para cadastrar o seu e-mail (e publicar as regras do Firestore com os perfis).'
        : 'O Firebase recusou o acesso deste perfil. O administrador precisa publicar as regras do Firestore com os perfis (Configurações › Sincronização (nuvem) › passo 5).');
      return;
    }
    definirEstado('erro', traduzir(e));
  }

  async function iniciarSync(u) {
    pararSync();
    const s = await identificar(u);
    if (s.bloqueado) { await naoAutorizado(s.motivo || 'Seu acesso está desativado. Fale com o administrador.'); return; }
    const anterior = App.Acesso.sessao();
    // outra pessoa, outro perfil (ou a primeira entrada da equipe) neste aparelho: começa sem os dados locais, para não misturar,
    // não enviar à empresa nem manter o que o perfil novo não vê — a nuvem devolve o que ele pode ler
    const trocou = anterior ? (anterior.uid !== s.uid || anterior.base !== s.base || anterior.perfil !== s.perfil) : !s.dono;
    if (trocou) App.Store.limparDados();
    App.Acesso.gravarSessao(s);
    N.usuario = { uid: s.uid, email: s.email, nome: s.nome, base: s.base, perfil: s.perfil, dono: s.dono };
    App.Acesso.aplicarMenu();
    if (trocou) reabrirTela();
    primeira = {}; conhecidos = {}; filas = {}; enviadosNaEntrada = 0;
    definirEstado('sincronizando');
    COLECOES().forEach(function (col) {
      const ref = fb.m.fs.collection(fb.db, 'usuarios', base(), col);
      ouvintes.push(fb.m.fs.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
        filas[col] = (filas[col] || Promise.resolve()).then(function () { return tratar(col, snap); }).catch(function (e) { console.error(e); });
      }, function (e) { erroOuvinte(col, e); }));
    });
  }

  /** Depois de trocar os dados locais (outra pessoa ou outro perfil): reabre a tela, ou vai ao início do perfil se ela não for dele. */
  function reabrirTela() {
    if (!App.UI || (App.Portao && App.Portao.visivel())) return; // a tela de login cuida disso ao sair
    const c = (location.hash || '').replace(/^#/, '').split('?')[0];
    if (c && !App.Acesso.rota(c)) App.UI.ir('#' + App.Acesso.inicio());
    else App.UI.despachar(true);
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
    App.Store.COLECOES.filter(function (col) { return App.Acesso.podeGravar(col, N.usuario.perfil); }).forEach(function (col) {
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
      case 'naoAutorizado': return '⛔ Acesso não autorizado';
      default: return '☁️ Sincronização';
    }
  };

  App.Nuvem = N;
})(window.App);
