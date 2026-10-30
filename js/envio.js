/*
 * Envio dos documentos ao cliente (propostas, propostas avulsas e ordens de serviço): mensagem pronta no WhatsApp com o link
 * do PDF publicado — página ver.html, lida sem login só pelo código do link (mesma regra do Firestore da página de
 * acompanhamento das obras) — ou o próprio arquivo pelo compartilhamento do aparelho (WhatsApp, e-mail…). Sem custo: usa o
 * WhatsApp do próprio usuário. A cada envio o PDF é gerado de novo, então o link mostra sempre a versão mais recente.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;

  /** Endereço da página do documento; com a configuração da nuvem só neste aparelho, o projeto vai no próprio link. */
  function linkDocumento(token, base) {
    const raiz = base || (location.origin + location.pathname.replace(/[^/]*$/, ''));
    let u = raiz + 'ver.html?d=' + encodeURIComponent(token);
    const N = App.Nuvem;
    if (N && N.origemConfig && N.origemConfig() === 'aparelho') {
      const c = N.config();
      u += '&p=' + encodeURIComponent(c.projectId) + '&k=' + encodeURIComponent(c.apiKey);
    }
    return u;
  }

  function base64(blob) {
    return new Promise(function (ok, falha) {
      const r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { falha(new Error('Não foi possível ler o PDF gerado.')); };
      r.readAsDataURL(blob);
    });
  }

  /** O que a página do documento mostra além do PDF: tipo, número, validade, primeiro nome do cliente e o contato da empresa. */
  function metaDocumento(o, gerado, ctx, logo) {
    const emp = ctx.empresa || {};
    return {
      v: 1, tipo: o.tipoDoc || 'Documento', numero: o.numero || '', validade: o.validade || '', arquivo: gerado.nome,
      cliente: App.Acompanhamento.primeiroNome(o.clienteNome),
      empresa: { nome: emp.nomeCurto || emp.razao || '', razao: emp.razao || '', telefone: emp.telefone || '', email: emp.email || '', logo: logo || '' },
      atualizadoEm: new Date().toISOString()
    };
  }

  /** Publica o PDF em acompanhamento/doc-{código} (dados) e doc-{código}-1… (o arquivo em partes). */
  async function publicar(token, gerado, o, ctx) {
    const N = App.Nuvem;
    if (!N || !N.usuario || !N.publicarDocumento) { const e = new Error('semNuvem'); e.semNuvem = true; throw e; }
    const meta = metaDocumento(o, gerado, ctx, await App.Acompanhamento.logoPequeno(ctx));
    await N.publicarDocumento('doc-' + token, meta, await base64(gerado.blob));
    return meta;
  }

  function podeCompartilharArquivo() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; }
  }

  /**
   * Janela de envio. o: {titulo, tipoDoc, numero, validade, clienteNome, telefone, registro (com linkDoc), gerar() → {blob, nome},
   * mensagem(link) → texto, aoPublicar(linkDoc|null), aoEnviar(meio)}. ctx: contexto do cálculo (empresa).
   */
  function abrir(o, ctx) {
    const UI = App.UI, A = App.Acompanhamento;
    const N = App.Nuvem;
    const nuvem = !!(N && N.usuario && N.publicarDocumento);
    const anterior = o.registro && o.registro.linkDoc && o.registro.linkDoc.token;
    const token = anterior || A.novoToken();
    const link = linkDocumento(token);
    const est = { texto: o.mensagem(nuvem ? link : '') };
    let editado = false, gerado = null, pronto = false, fechado = false;
    const tel = A.telefoneWhats(o.telefone);
    const status = h('p.envio-status', '⏳ Gerando o PDF…');
    const campoTexto = UI.campo({ k: 'texto', label: 'Mensagem (pode editar antes de enviar)', type: 'textarea', rows: 9 }, est, function () { editado = true; });
    const linkBox = h('div.envio-link', { hidden: true });
    const corpo = h('div.aviso-whats',
      h('p.ajuda-sec', tel ? 'Para: ' + (o.clienteNome || 'cliente') + ' — ' + o.telefone : '⚠️ Telefone do cliente não informado: o WhatsApp vai pedir para escolher o contato.'),
      campoTexto, status, linkBox);
    const trocarTexto = function (t) { if (!editado) { est.texto = t; campoTexto.querySelector('textarea').value = t; } };
    const pintar = function (txt, cls) { status.textContent = txt; status.className = 'envio-status' + (cls ? ' ' + cls : ''); };
    const compartilhar = podeCompartilharArquivo();
    const acoes = [
      {
        label: '⬇ Baixar PDF', manterAberto: true, onClick: function () {
          if (!gerado) { UI.toast('Aguarde: o PDF ainda está sendo gerado.'); return false; }
          U.download(gerado.blob, gerado.nome); return false;
        }
      }
    ];
    if (compartilhar) {
      acoes.push({
        label: '📤 Compartilhar o PDF', manterAberto: true, onClick: function () {
          if (!gerado) { UI.toast('Aguarde: o PDF ainda está sendo gerado.'); return false; }
          navigator.share({ files: [new File([gerado.blob], gerado.nome, { type: 'application/pdf' })], title: gerado.nome, text: est.texto })
            .then(function () { if (o.aoEnviar) o.aoEnviar('compartilhar'); }).catch(function () { /* cancelado */ });
          return false;
        }
      });
    }
    acoes.push({ label: 'Fechar' });
    acoes.push({
      label: '📲 Enviar pelo WhatsApp', primario: true, onClick: function () {
        if (!pronto) { UI.toast(nuvem ? 'Aguarde: o link do PDF está sendo publicado.' : 'Aguarde: o PDF ainda está sendo gerado.'); return false; }
        window.open(A.linkWhats(o.telefone, est.texto), '_blank');
        if (o.aoEnviar) o.aoEnviar('whatsapp');
      }
    });
    UI.modal({ titulo: o.titulo || 'Enviar ao cliente', largo: true, corpo: corpo, acoes: acoes, aoFechar: function () { fechado = true; } });

    function mostrarLink() {
      linkBox.hidden = false;
      linkBox.replaceChildren(
        h('input.link-acompanhamento', { type: 'text', readonly: true, value: link, 'aria-label': 'Link do documento', onfocus: function (ev) { ev.target.select(); } }),
        h('button.btn.pequeno', { type: 'button', onclick: async function () { try { await navigator.clipboard.writeText(link); UI.toast('Link copiado.', 'ok'); } catch (e) { UI.toast('Selecione o link e copie (Ctrl+C).'); } } }, '📋 Copiar'),
        h('a.btn.pequeno', { href: link, target: '_blank', rel: 'noopener' }, '↗ Abrir'),
        h('button.btn.pequeno.perigo', {
          type: 'button', onclick: async function () {
            if (!(await UI.confirmar('Desativar o link deste documento? O cliente deixa de abrir o PDF por ele (um link novo pode ser enviado depois).', 'Desativar', true))) return;
            if (N && N.removerDocumento) N.removerDocumento('doc-' + token).catch(function (e) { console.error(e); });
            if (o.aoPublicar) o.aoPublicar(null);
            pronto = true;
            linkBox.hidden = true;
            trocarTexto(o.mensagem(''));
            pintar('Link desativado. Envie o PDF pelo compartilhamento ou baixe e anexe no WhatsApp.', 'aviso');
          }
        }, 'Desativar link'));
    }

    (async function () {
      try {
        gerado = await o.gerar();
      } catch (e) {
        console.error(e);
        pintar('⚠️ Não foi possível gerar o PDF: ' + e.message, 'erro');
        return;
      }
      if (fechado) return;
      if (!nuvem) {
        pronto = true;
        pintar('Sem a sincronização (nuvem) neste aparelho, a mensagem vai sem o link: ' + (compartilhar ? 'use 📤 Compartilhar o PDF para mandar o arquivo' : 'baixe o PDF e anexe na conversa') + '.', 'aviso');
        return;
      }
      pintar('⏳ Publicando o PDF para o cliente abrir pelo link…');
      try {
        await publicar(token, gerado, o, ctx);
        if (fechado) { if (o.aoPublicar) o.aoPublicar({ token: token, em: new Date().toISOString() }); return; }
        pronto = true;
        if (o.aoPublicar) o.aoPublicar({ token: token, em: new Date().toISOString() });
        pintar('✅ Link pronto: o cliente abre o PDF no celular, sem baixar nada.' + (anterior ? ' (mesmo link do envio anterior, agora com a versão atual)' : ''), 'ok');
        mostrarLink();
      } catch (e) {
        console.error(e);
        pronto = true;
        trocarTexto(o.mensagem(''));
        const negado = /permission|permiss/i.test((e && (e.code || '')) + ' ' + (e && e.message));
        pintar(negado ? '⚠️ O Firebase recusou a publicação do PDF: publique as regras do Firestore do passo 5 (Configurações › Sincronização (nuvem)). A mensagem vai sem o link.'
          : '⚠️ Não foi possível publicar o PDF (' + e.message + '). A mensagem vai sem o link.', 'erro');
      }
    })();
  }

  /** Variáveis comuns das mensagens de envio. */
  function variaveis(ctx, x) {
    const emp = ctx.empresa || {};
    return Object.assign({ empresa: emp.nomeCurto || emp.razao || '' }, x, { cliente: App.Acompanhamento.primeiroNome(x.cliente) || 'cliente' });
  }

  function mensagem(ctx, chave, x) {
    return App.Acompanhamento.preencher((ctx.textos && ctx.textos[chave]) || App.DEFAULTS.textos[chave], variaveis(ctx, x));
  }

  /** Botão 📲 das listas. */
  function botao(acao, titulo) {
    return h('button.btn-formato.enviar', { type: 'button', title: 'Enviar ao cliente pelo WhatsApp', 'aria-label': 'Enviar ' + (titulo || 'documento') + ' ao cliente', onclick: acao }, '📲');
  }

  App.Envio = { linkDocumento: linkDocumento, metaDocumento: metaDocumento, abrir: abrir, mensagem: mensagem, botao: botao };
})(window.App);
