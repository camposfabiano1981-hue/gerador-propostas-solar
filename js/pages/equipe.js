/*
 * Acesso: tela de login (o app só abre depois de entrar, quando a sincronização está configurada), Equipe e acessos
 * (administrador: cadastra técnicos, vendedores e administradores, com conta de e-mail e senha) e Minha conta.
 */
(function (App) {
  'use strict';

  const U = App.U, UI = App.UI, A = App.Acesso;
  const h = U.h;

  /* ------------------------------------------------------------ tela de login (portão) */

  const Portao = {};
  let portao = null, msgEl = null, visivel = false;

  function montar() {
    if (portao) return portao;
    const emp = App.Store.config().empresa;
    const est = { email: '', senha: '' };
    msgEl = h('p.portao-msg', { role: 'alert', hidden: true });
    const campoEmail = UI.campo({ k: 'email', label: 'E-mail', type: 'email', placeholder: 'seu@email.com' }, est);
    const campoSenha = UI.campo({ k: 'senha', label: 'Senha', type: 'password' }, est);
    const botao = h('button.btn.primario.portao-entrar', { type: 'submit' }, 'Entrar');
    const form = h('form.portao-form', {
      onsubmit: async function (ev) {
        ev.preventDefault();
        if (!est.email || !est.senha) { mostrarMsg('Informe o e-mail e a senha.', true); return; }
        botao.disabled = true; botao.textContent = 'Entrando…';
        try { await App.Nuvem.entrarComSenha(est.email, est.senha); mostrarMsg('Verificando o acesso…'); }
        catch (e) { mostrarMsg(e.message, true); }
        finally { botao.disabled = false; botao.textContent = 'Entrar'; }
      }
    }, campoEmail, campoSenha, botao);
    portao = h('div#portao.portao', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Entrar no CRM Solar' },
      h('div.portao-caixa',
        h('img.portao-logo', { src: emp.logo || App.LOGO_PADRAO, alt: 'Logotipo' }),
        h('h1', 'CRM Solar'),
        h('p.portao-sub', (emp.nomeCurto || emp.razao || '') + ' — entre com o seu e-mail e a senha cadastrados pelo administrador.'),
        msgEl,
        form,
        h('div.portao-links',
          h('button.link-anexo', {
            type: 'button', onclick: async function () {
              if (!est.email) { mostrarMsg('Digite o seu e-mail acima e clique de novo em "Esqueci a senha".', true); return; }
              try { await App.Nuvem.redefinirSenha(est.email); mostrarMsg('Enviamos um e-mail para ' + est.email + ' com o link para criar uma nova senha (confira também o spam).'); }
              catch (e) { mostrarMsg(e.message, true); }
            }
          }, 'Esqueci a senha')),
        h('div.portao-ou', h('span', 'ou')),
        h('button.btn.portao-google', { type: 'button', onclick: function () { App.Nuvem.entrar().catch(function (e) { mostrarMsg(e.message, true); }); } }, 'Entrar com Google'),
        h('p.portao-rodape', 'Com Google: o dono da conta e quem da equipe tem e-mail do Google (Gmail).'),
        h('p.portao-rodape', 'Versão ' + App.VERSAO_APP)));
    document.body.appendChild(portao);
    return portao;
  }

  function mostrarMsg(t, erro) {
    if (!msgEl) return;
    msgEl.textContent = t || '';
    msgEl.hidden = !t;
    msgEl.classList.toggle('erro', !!erro);
  }

  function mostrar(msg, erro) {
    montar();
    portao.hidden = false;
    document.body.classList.add('bloqueado');
    visivel = true;
    if (msg !== undefined) mostrarMsg(msg, erro);
  }

  function esconder() {
    if (portao) portao.hidden = true;
    document.body.classList.remove('bloqueado');
    if (!visivel) return;
    visivel = false;
    A.aplicarMenu();
    // tela de outro perfil (ex.: o painel, para o técnico): vai para o início do perfil
    const caminho = (location.hash || '').replace(/^#/, '').split('?')[0];
    if (caminho && !A.rota(caminho)) App.UI.ir('#' + A.inicio());
    else App.UI.despachar(true);
  }

  /** Acompanha o login: sem a sincronização configurada não há portão (uso local, de uma pessoa só). */
  Portao.iniciar = function () {
    const N = App.Nuvem;
    if (!N || !N.configurada()) return;
    // com sessão guardada, o app abre já (inclusive sem internet); sem ela, espera o login
    if (!A.sessao()) mostrar('');
    N.observar(function (n) {
      if (n.estado === 'naoAutorizado') { mostrar(n.mensagem, true); return; }
      if (n.estado === 'desconectado') { mostrar(visivel ? undefined : ''); return; }
      if (n.estado === 'erro' && !n.usuario && !A.sessao()) { mostrar(n.mensagem, true); return; }
      if (n.usuario) esconder();
    });
  };

  Portao.visivel = function () { return visivel; };
  App.Portao = Portao;

  /* ------------------------------------------------------------ minha conta */

  UI.rota('/conta', function (cont) {
    const N = App.Nuvem;
    const s = A.sessao();
    cont.appendChild(UI.cabecalho('Minha conta', 'Quem está usando o CRM Solar neste aparelho.'));
    if (!N || !N.configurada() || !s) {
      cont.appendChild(h('div.card', h('p', 'O CRM Solar está em uso local (sem login). Para usar com a equipe, configure a sincronização em ', h('a', { href: '#/nuvem' }, 'Sincronização (nuvem)'), '.')));
      return;
    }
    const opc = { limpar: !s.dono };
    cont.appendChild(h('div.card',
      h('div.kpis.conta-kpis',
        h('div.kpi', h('span', 'Nome'), h('strong', s.nome || '—')),
        h('div.kpi', h('span', 'E-mail'), h('strong', s.email || '—')),
        h('div.kpi', h('span', 'Perfil'), h('strong', A.rotulo(s.perfil) + (s.dono ? ' (dono da conta)' : ''))),
        h('div.kpi', h('span', 'Acesso'), h('strong', (A.PERFIS.find(function (p) { return p.id === s.perfil; }) || {}).desc || '—'))),
      h('div.barra-itens',
        h('button.btn', {
          type: 'button', onclick: async function () {
            try { await N.redefinirSenha(s.email); UI.toast('Enviamos para ' + s.email + ' o link para trocar a senha.', 'ok'); } catch (e) { UI.toast(e.message, 'erro'); }
          }
        }, '🔑 Trocar minha senha')),
      h('h4.secao-form', 'Sair'),
      UI.campo({ k: 'limpar', label: 'Apagar os dados da empresa deste aparelho ao sair (recomendado em aparelho compartilhado; voltam pela nuvem no próximo login)', type: 'checkbox' }, opc),
      h('div.barra-itens', h('button.btn.perigo', {
        type: 'button', onclick: async function () {
          if (N.pendentes && !(await UI.confirmar('Há ' + N.pendentes + ' alteração(ões) ainda não enviadas para a nuvem. Sair mesmo assim? Elas podem se perder.', 'Sair', true))) return;
          await N.sair(opc.limpar);
          UI.toast('Você saiu da conta.', 'ok');
        }
      }, 'Sair da conta'))));
  });

  /* ------------------------------------------------------------ equipe e acessos (administrador) */

  const MSG_SEM_SENHA = 'O login por e-mail e senha não está ativado no Firebase: no console, Authentication › Método de login › Adicionar novo provedor › E-mail/senha › Ativar › Salvar.';

  /** E-mail de conta Google (Gmail/Googlemail): a pessoa pode entrar com "Entrar com Google". */
  function contaGoogle(email) { return /@(gmail|googlemail)\.com$/i.test(String(email || '').trim()); }

  function senhaAleatoria() {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[x % 56]; }).join('') + '#9';
  }

  /** Cartão com o passo a passo para publicar as regras (quando o Firebase recusa a equipe): copiar e abrir o console. */
  function cartaoRegras(msg) {
    const N = App.Nuvem;
    const c = N.console();
    const sess = A.sessao() || {};
    const pre = h('pre.regras-nuvem', N.regras(sess.dono ? sess.email : ''));
    const copiar = h('button.btn.primario', {
      type: 'button', onclick: async function () {
        try { await navigator.clipboard.writeText(pre.textContent); UI.toast('Regras copiadas. Cole no Firebase e clique em Publicar.', 'ok'); } catch (e) {
          const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
          pre.parentElement.open = true;
          UI.toast('Selecionei o texto das regras: copie com Ctrl+C.', 'info');
        }
      }
    }, '📋 Copiar regras');
    return h('div.card.cartao-regras',
      h('h3', '⚠️ Publique as regras novas do Firestore'),
      h('p', msg),
      h('ol.passos-regras',
        h('li', 'Clique em ', h('strong', '📋 Copiar regras'), (sess.dono ? ' (já estão com o seu e-mail, ' + sess.email + ').' : ' — confira o e-mail do dono da conta em Sincronização (nuvem) › passo 5.')),
        h('li', 'Clique em ', h('strong', 'Abrir as regras no Firebase'), ' (entre com a sua conta Google), apague todo o texto da aba Regras e cole.'),
        h('li', 'Clique em ', h('strong', 'Publicar'), ', aguarde um minuto e recarregue esta página.')),
      h('div.barra-itens', copiar, h('a.btn', { href: c.regras, target: '_blank', rel: 'noopener' }, '↗ Abrir as regras no Firebase')),
      h('details', h('summary', 'Ver as regras'), pre));
  }

  UI.rota('/equipe', function (cont) {
    const N = App.Nuvem;
    cont.appendChild(UI.cabecalho('Equipe e acessos', 'Técnicos, vendedores e administradores entram com e-mail e senha; cada perfil vê só o que precisa.',
      N && N.usuario ? [h('button.btn.primario', { type: 'button', onclick: adicionar }, '+ Adicionar pessoa')] : null));
    cont.appendChild(h('div.card.dica',
      h('p', h('strong', 'Perfis: '), A.PERFIS.map(function (p) { return p.label + ' — ' + p.desc; }).join(' ')),
      h('p', h('strong', 'Antes do primeiro cadastro (uma vez só, no console do Firebase): '), '1) Authentication › Método de login › Adicionar novo provedor › ', h('strong', 'E-mail/senha'), ' › Ativar › Salvar (',
        h('a', { href: N && N.configurada() ? N.console().login : '#/nuvem', target: '_blank', rel: 'noopener' }, 'abrir no Firebase'), '); ',
        '2) publique as regras do Firestore com os perfis (', h('a', { href: '#/nuvem' }, 'Sincronização (nuvem)'), ' › passo 5, ou ', h('a', { href: N && N.configurada() ? N.console().regras : '#/nuvem', target: '_blank', rel: 'noopener' }, 'abrir as regras no Firebase'),
        '). As regras garantem no servidor o que cada perfil pode ler e gravar.'),
      h('p', h('strong', 'E-mail do Google (Gmail): '), 'a pessoa também pode entrar com "Entrar com Google", mesmo sem o E-mail/senha ativado no Firebase.')));
    const box = h('div.card.sem-pad');
    cont.appendChild(box);
    if (!N || !N.usuario) {
      box.appendChild(h('div.vazio', h('p', 'Entre na sua conta (sincronização ligada) para gerir a equipe.')));
      return;
    }
    let lista = [];
    async function carregar() {
      box.replaceChildren(h('p.ajuda-sec', { style: { padding: '16px' } }, 'Carregando a equipe…'));
      try { lista = await N.equipe.listar(); } catch (e) { box.replaceChildren(e.regras ? cartaoRegras(e.message) : h('div.vazio', h('p', '⚠️ ' + e.message))); return; }
      desenhar();
    }
    function desenhar() {
      const tb = h('tbody');
      const eu = A.sessao() || {};
      tb.appendChild(h('tr.eu', h('td', h('strong', eu.nome || eu.email), h('div.mini', 'você')), h('td', eu.email), h('td', A.rotulo(eu.perfil) + (eu.dono ? ' (dono)' : '')), h('td', UI.badge('Ativo', 'ok')), h('td.acoes-col', '')));
      lista.filter(function (m) { return m.email !== eu.email; }).forEach(function (m) {
        const sel = h('select.status-sel', {
          'aria-label': 'Perfil de ' + m.nome, onchange: async function () {
            try { await N.equipe.salvar(Object.assign({}, m, { perfil: sel.value })); UI.toast(m.nome + ': perfil ' + A.rotulo(sel.value) + '.', 'ok'); carregar(); } catch (e) { UI.toast(e.message, 'erro'); }
          }
        }, A.PERFIS.map(function (p) { const o = h('option', { value: p.id }, p.label); if (p.id === m.perfil) o.selected = true; return o; }));
        tb.appendChild(h('tr',
          h('td', h('strong', m.nome || '—')),
          h('td', m.email, h('div.mini', m.uid ? 'entra com e-mail e senha' + (contaGoogle(m.email) ? ' ou Google' : '') : contaGoogle(m.email) ? 'entra com Google' : 'sem senha criada: use 🔑 Senha')),
          h('td', sel),
          h('td', m.ativo === false ? UI.badge('Desativado', 'cinza') : UI.badge('Ativo', 'ok')),
          h('td.acoes-col',
            h('button.btn.pequeno', {
              type: 'button', title: 'Enviar e-mail para criar ou trocar a senha', onclick: async function () {
                try {
                  // cadastrado sem conta de senha (ex.: E-mail/senha estava desativado no Firebase): cria a conta antes do e-mail
                  if (!m.uid) {
                    const r = await N.equipe.criarConta(m.email, senhaAleatoria());
                    if (r.semSenha) throw new Error(MSG_SEM_SENHA);
                    if (r.uid) { m.uid = r.uid; await N.equipe.salvar(m); }
                  }
                  await N.redefinirSenha(m.email);
                  UI.toast('E-mail de senha enviado para ' + m.email + '.', 'ok');
                } catch (e) { UI.toast(e.message, 'erro'); }
              }
            }, '🔑 Senha'),
            h('button.btn.pequeno', {
              type: 'button', onclick: async function () {
                const ativo = m.ativo === false;
                if (!ativo && !(await UI.confirmar('Desativar o acesso de ' + m.nome + '? Os dados da empresa deixam de abrir para esta pessoa na hora.', 'Desativar', true))) return;
                try { await N.equipe.salvar(Object.assign({}, m, { ativo: ativo })); UI.toast(m.nome + (ativo ? ': acesso reativado.' : ': acesso desativado.'), 'ok'); carregar(); } catch (e) { UI.toast(e.message, 'erro'); }
              }
            }, m.ativo === false ? 'Reativar' : 'Desativar'),
            h('button.btn-icone.perigo', {
              type: 'button', title: 'Remover da equipe', 'aria-label': 'Remover ' + m.nome, onclick: async function () {
                if (!(await UI.confirmar('Remover ' + m.nome + ' da equipe? O acesso termina na hora (a conta de login continua no Firebase).', 'Remover', true))) return;
                try { await N.equipe.remover(m.email); UI.toast(m.nome + ' saiu da equipe.', 'ok'); carregar(); } catch (e) { UI.toast(e.message, 'erro'); }
              }
            }, '🗑'))));
      });
      box.replaceChildren(h('div.tabela-rolagem', h('table.tabela', h('thead', h('tr', ['Nome', 'E-mail', 'Perfil', 'Situação', ''].map(function (t) { return h('th', t); }))), tb)));
    }

    function adicionar() {
      const est = { nome: '', email: '', perfil: 'tecnico', senha: '' };
      const corpo = h('div', UI.grade([
        { k: 'nome', label: 'Nome', required: true },
        { k: 'email', label: 'E-mail (login)', type: 'email', required: true },
        { k: 'perfil', label: 'Perfil', type: 'select', options: A.PERFIS.map(function (p) { return { v: p.id, t: p.label + ' — ' + p.desc }; }), cls: 'span2' },
        { k: 'senha', label: 'Senha inicial (opcional)', type: 'text', placeholder: 'Em branco: a pessoa recebe e-mail para criar a senha', cls: 'span2',
          help: 'Com senha, passe para a pessoa o endereço do app, o e-mail e a senha; a senha pode ser trocada depois em Minha conta. Mínimo de 6 caracteres.' }
      ], est, null, 2));
      UI.modal({
        titulo: 'Adicionar pessoa à equipe', corpo: corpo, acoes: [
          { label: 'Cancelar' },
          {
            label: 'Cadastrar', primario: true, manterAberto: true, onClick: function (fechar) {
              if (!String(est.nome).trim() || !String(est.email).trim()) { UI.toast('Informe o nome e o e-mail.', 'erro'); return false; }
              if (est.senha && est.senha.length < 6) { UI.toast('A senha precisa de pelo menos 6 caracteres.', 'erro'); return false; }
              (async function () {
                try {
                  // primeiro o cadastro (confere as regras do Firestore); depois a conta de login, sem sobrar conta se o Firebase recusar
                  const reg = await N.equipe.salvar({ nome: est.nome, email: est.email, perfil: est.perfil, ativo: true, uid: '' });
                  const conta = await N.equipe.criarConta(est.email, est.senha || senhaAleatoria());
                  if (conta.uid) await N.equipe.salvar(Object.assign({}, reg, { uid: conta.uid }));
                  let aviso;
                  if (conta.semSenha) {
                    aviso = (contaGoogle(est.email) ? 'A pessoa já pode entrar com "Entrar com Google" usando ' + est.email + '. ' : '') +
                      'Para entrar com e-mail e senha, ative E-mail/senha no Firebase (Authentication › Método de login) e depois use 🔑 Senha nesta lista.';
                  } else if (!est.senha) { await N.redefinirSenha(est.email); aviso = 'Enviamos para ' + est.email + ' o e-mail para criar a senha.'; }
                  else aviso = conta.criada ? 'Conta criada: passe o endereço do app, o e-mail e a senha para ' + est.nome + '.' : 'Este e-mail já tinha conta: a pessoa entra com Google (se for Gmail) ou cria uma senha nova em "Esqueci a senha".';
                  fechar();
                  UI.toast('Cadastro feito: ' + est.nome + ' (' + A.rotulo(est.perfil) + '). ' + aviso, conta.semSenha ? 'info' : 'ok');
                  carregar();
                } catch (e) {
                  UI.toast(e.message, 'erro');
                  if (e.regras) { fechar(); box.replaceChildren(cartaoRegras(e.message + ' O cadastro não foi gravado: publique as regras e cadastre de novo.')); }
                }
              })();
              return false;
            }
          }
        ]
      });
    }
    carregar();
  });
})(window.App);
