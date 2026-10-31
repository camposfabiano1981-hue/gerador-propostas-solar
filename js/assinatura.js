/*
 * Assinaturas: na tela (o cliente ou o técnico assina com o dedo, a caneta ou o mouse), por imagem (foto ou scan da assinatura,
 * com o fundo tirado) ou a assinatura guardada do responsável técnico (Configurações › Empresa). A imagem (PNG recortado) vai
 * para App.Fotos — fora do armazenamento local, com cópia na nuvem — e o registro guarda {fotoId, nome, em, tipo}.
 * Assinatura digital do cliente pelo gov.br (Assinador ITI): o CRM gera o PDF, o cliente assina com a conta gov.br e o PDF
 * assinado volta anexado ao registro, conferido (assinatura digital, signatário e data).
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;
  const ASSINADOR_GOVBR = 'https://assinador.iti.br/';
  const LIMITE_PDF = 8 * 1024 * 1024;

  function vazia() { return { fotoId: '', nome: '', em: '', tipo: '' }; }

  function dataHora(iso) {
    const d = new Date(iso || '');
    if (isNaN(d)) return '';
    return U.dataBR(iso.slice(0, 10)) + ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  const COMO = { tela: 'Assinado na tela', imagem: 'Imagem da assinatura incluída', guardada: 'Assinatura guardada aplicada' };

  /** Como a assinatura foi feita e quando (lista e PDF). */
  function descricao(x) { return x && x.fotoId ? (COMO[x.tipo] || COMO.tela) + ' em ' + dataHora(x.em) : ''; }

  /** Recorta a área desenhada (com margem) em PNG de fundo branco, até 900 px de largura. */
  function recortar(cv, caixa, dpr) {
    const pad = 14 * dpr;
    const x0 = Math.max(0, caixa.x0 - pad), y0 = Math.max(0, caixa.y0 - pad);
    const x1 = Math.min(cv.width, caixa.x1 + pad), y1 = Math.min(cv.height, caixa.y1 + pad);
    const w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0);
    const k = Math.min(1, 900 / w);
    const out = document.createElement('canvas');
    out.width = Math.round(w * k); out.height = Math.round(hh * k);
    const g = out.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(cv, x0, y0, w, hh, 0, 0, out.width, out.height);
    return { dataURL: out.toDataURL('image/png'), w: out.width, h: out.height };
  }

  function carregarImagem(url) {
    return new Promise(function (res, rej) {
      const img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Não foi possível abrir a imagem. Use PNG ou JPG.')); };
      img.src = url;
    });
  }

  /**
   * Assinatura a partir de foto ou scan: o fundo claro (papel) fica transparente, a tinta mantém a cor, a área assinada é
   * recortada com margem e reduzida até 900 px. Devolve {dataURL (PNG), w, h}.
   */
  async function deImagem(arquivo) {
    if (!/^image\//.test(arquivo.type || '') && !/\.(png|jpe?g|webp)$/i.test(arquivo.name || '')) throw new Error('Envie uma imagem da assinatura (PNG ou JPG).');
    const img = await carregarImagem(await U.readFileAsDataURL(arquivo));
    const k0 = Math.min(1, 1600 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const W = Math.max(1, Math.round((img.naturalWidth || img.width) * k0)), H = Math.max(1, Math.round((img.naturalHeight || img.height) * k0));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, W, H);
    const dados = g.getImageData(0, 0, W, H);
    const px = dados.data;
    const lum = function (i) { return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };
    // fundo: a luminância das bordas (papel); a tinta é o que fica bem mais escuro que ele
    const bordas = [];
    const passo = Math.max(1, Math.floor(Math.max(W, H) / 200));
    for (let x = 0; x < W; x += passo) { bordas.push(lum((x) * 4), lum(((H - 1) * W + x) * 4)); }
    for (let y = 0; y < H; y += passo) { bordas.push(lum((y * W) * 4), lum((y * W + W - 1) * 4)); }
    bordas.sort(function (a, b) { return a - b; });
    const fundo = Math.max(150, bordas[Math.floor(bordas.length / 2)] || 255);
    const inicio = 45, faixa = 70;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const escuro = fundo - lum(i);
        if (escuro <= inicio) { px[i + 3] = 0; continue; }
        const a = Math.min(255, Math.round((escuro - inicio) / faixa * 255));
        px[i + 3] = a;
        if (a > 110) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0 || (x1 - x0) < 12 || (y1 - y0) < 4) throw new Error('Não encontrei a assinatura na imagem: fotografe a assinatura em papel branco, com boa luz e sem sombra.');
    g.putImageData(dados, 0, 0);
    const pad = 12;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const w = x1 - x0 + 1, hh = y1 - y0 + 1, k = Math.min(1, 900 / w);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(hh * k));
    out.getContext('2d').drawImage(cv, x0, y0, w, hh, 0, 0, out.width, out.height);
    return { dataURL: out.toDataURL('image/png'), w: out.width, h: out.height };
  }

  /** Abre o seletor de arquivo (dentro do clique do usuário) e devolve o arquivo escolhido (ou null). */
  function escolherArquivo(accept) {
    return new Promise(function (res) {
      const input = h('input', { type: 'file', accept: accept, style: { display: 'none' } });
      input.addEventListener('change', function () { const f = input.files[0] || null; input.remove(); res(f); });
      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Abre a janela para assinar. o: {titulo, nome, declaracao}. Resolve com {fotoId, nome, em, tipo: 'tela'} ou null (cancelado).
   */
  function coletar(o) {
    o = o || {};
    return new Promise(function (resolver) {
      const estado = { nome: o.nome || '' };
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const cv = h('canvas.assinatura-canvas', { 'aria-label': 'Área para assinar' });
      const dica = h('span.assinatura-dica', 'Assine aqui com o dedo, a caneta ou o mouse');
      const g = cv.getContext('2d');
      let caixa = null, desenhando = false, ultimo = null, concluido = false;
      const ajustar = function () {
        const r = cv.getBoundingClientRect();
        if (!r.width) return;
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cv.width, cv.height);
        g.strokeStyle = '#0F172A'; g.lineWidth = 2.6 * dpr; g.lineCap = 'round'; g.lineJoin = 'round';
        caixa = null; dica.hidden = false;
      };
      const ponto = function (e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }; };
      const marcar = function (p) {
        if (!caixa) caixa = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        caixa.x0 = Math.min(caixa.x0, p.x); caixa.y0 = Math.min(caixa.y0, p.y); caixa.x1 = Math.max(caixa.x1, p.x); caixa.y1 = Math.max(caixa.y1, p.y);
      };
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
        desenhando = true; ultimo = ponto(e); marcar(ultimo); dica.hidden = true;
        g.beginPath(); g.arc(ultimo.x, ultimo.y, g.lineWidth / 2, 0, Math.PI * 2); g.fillStyle = '#0F172A'; g.fill();
      });
      cv.addEventListener('pointermove', function (e) {
        if (!desenhando) return;
        e.preventDefault();
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        (evs.length ? evs : [e]).forEach(function (ev) {
          const p = ponto(ev);
          g.beginPath(); g.moveTo(ultimo.x, ultimo.y); g.lineTo(p.x, p.y); g.stroke();
          ultimo = p; marcar(p);
        });
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { cv.addEventListener(t, function () { desenhando = false; }); });
      const nome = h('input', { type: 'text', value: estado.nome, placeholder: 'Nome de quem assina', oninput: function () { estado.nome = nome.value; } });
      const corpo = h('div.assinatura-janela',
        o.declaracao ? h('p.assinatura-declaracao', o.declaracao) : null,
        h('div.campo', h('label', 'Nome de quem assina'), nome),
        h('div.assinatura-area', cv, dica, h('div.assinatura-linha')),
        h('p.ajuda-sec', 'Dica: no celular, vire a tela na horizontal para ter mais espaço.'));
      const terminar = function (v) { if (!concluido) { concluido = true; resolver(v); } };
      const fechar = App.UI.modal({
        titulo: o.titulo || 'Assinatura', largo: true, corpo: corpo,
        acoes: [
          { label: 'Limpar', manterAberto: true, onClick: function () { ajustar(); } },
          { label: 'Cancelar', onClick: function () { terminar(null); } },
          {
            label: 'Confirmar assinatura', primario: true, manterAberto: true, onClick: function (fecharJanela) {
              if (!caixa || (caixa.x1 - caixa.x0) < 8 * dpr) { App.UI.toast('Assine na área branca antes de confirmar.', 'erro'); return false; }
              if (!String(estado.nome || '').trim()) { App.UI.toast('Informe o nome de quem assina.', 'erro'); nome.focus(); return false; }
              const img = recortar(cv, caixa, dpr);
              App.Fotos.salvar(img).then(function (id) {
                terminar({ fotoId: id, nome: String(estado.nome).trim(), em: new Date().toISOString(), tipo: 'tela' });
                fecharJanela();
              }, function (e) { console.error(e); App.UI.toast('Não foi possível guardar a assinatura.', 'erro'); });
              return false;
            }
          }
        ],
        aoFechar: function () { terminar(null); }
      });
      requestAnimationFrame(function () { ajustar(); });
      window.addEventListener('resize', function redimensionar() { if (!document.body.contains(cv)) { window.removeEventListener('resize', redimensionar); return; } if (!caixa) ajustar(); });
      void fechar;
    });
  }

  /**
   * Assinatura por imagem: escolhe a foto/scan, mostra o resultado (fundo tirado) para conferir o nome e confirma.
   * Chamar dentro do clique (abre o seletor de arquivo). o: {titulo, nome, declaracao}. Resolve com {…, tipo: 'imagem'} ou null.
   */
  async function deArquivo(o) {
    o = o || {};
    const arquivo = await escolherArquivo('image/png,image/jpeg,image/webp');
    if (!arquivo) return null;
    let img;
    try { img = await deImagem(arquivo); } catch (e) { App.UI.toast(e.message, 'erro'); return null; }
    return new Promise(function (resolver) {
      const estado = { nome: o.nome || '' };
      let concluido = false;
      const terminar = function (v) { if (!concluido) { concluido = true; resolver(v); } };
      const nome = h('input', { type: 'text', value: estado.nome, placeholder: 'Nome de quem assina', oninput: function () { estado.nome = nome.value; } });
      App.UI.modal({
        titulo: o.titulo || 'Imagem da assinatura', largo: true,
        corpo: h('div.assinatura-janela',
          o.declaracao ? h('p.assinatura-declaracao', o.declaracao) : null,
          h('div.campo', h('label', 'Nome de quem assina'), nome),
          h('div.assinatura-previa', h('img', { src: img.dataURL, alt: 'Assinatura enviada (fundo removido)' })),
          h('p.ajuda-sec', 'O fundo do papel foi retirado e a assinatura recortada. Se não ficou boa, cancele e envie outra foto (papel branco, boa luz, sem sombra).')),
        acoes: [
          { label: 'Cancelar', onClick: function () { terminar(null); } },
          {
            label: 'Usar esta assinatura', primario: true, manterAberto: true, onClick: function (fecharJanela) {
              if (!String(estado.nome || '').trim()) { App.UI.toast('Informe o nome de quem assina.', 'erro'); nome.focus(); return false; }
              App.Fotos.salvar(img).then(function (id) {
                terminar({ fotoId: id, nome: String(estado.nome).trim(), em: new Date().toISOString(), tipo: 'imagem' });
                fecharJanela();
              }, function (e) { console.error(e); App.UI.toast('Não foi possível guardar a assinatura.', 'erro'); });
              return false;
            }
          }
        ],
        aoFechar: function () { terminar(null); }
      });
    });
  }

  /** Assinatura guardada do responsável técnico (Configurações › Empresa), se houver. */
  function guardada() {
    const emp = App.Store ? App.Store.config().empresa : {};
    const g = emp && emp.assinaturaResponsavel;
    return g && g.fotoId ? g : null;
  }

  /** Aplica a assinatura guardada: uma cópia da imagem para o registro (remover do registro não apaga a guardada). */
  async function aplicarGuardada(g) {
    const f = await App.Fotos.obter(g.fotoId);
    if (!f) throw new Error('A assinatura guardada não está neste aparelho: ligue a sincronização ou grave de novo em Configurações › Empresa.');
    const id = await App.Fotos.salvar({ dataURL: f.dataURL, w: f.w, h: f.h });
    return { fotoId: id, nome: g.nome || '', em: new Date().toISOString(), tipo: 'guardada' };
  }

  /**
   * Campo de assinatura para formulários: mostra a assinatura salva (nome, como e quando) com Refazer/Remover, ou os botões para
   * assinar na tela, enviar a imagem e (o.usarGuardada) aplicar a assinatura guardada do responsável técnico.
   * o: {nomePadrao: string|function, declaracao: string|function, usarGuardada: bool}
   */
  function campo(rotulo, estado, o, aoMudar) {
    o = o || {};
    const val = function (x) { return typeof x === 'function' ? x() : x; };
    const box = h('div.assinatura-campo');
    const aplicar = function (r) {
      if (!r) return;
      if (estado.fotoId) App.Fotos.remover(estado.fotoId);
      Object.assign(estado, r);
      aoMudar();
      desenhar();
    };
    const opcoes = function () { return { titulo: rotulo, nome: estado.nome || val(o.nomePadrao) || '', declaracao: val(o.declaracao) }; };
    const assinar = async function () { aplicar(await coletar(opcoes())); };
    const enviarImagem = async function () { aplicar(await deArquivo(Object.assign(opcoes(), { titulo: rotulo + ' — imagem' }))); };
    const usarGuardada = async function () {
      const g = guardada();
      if (!g) { App.UI.toast('Nenhuma assinatura guardada: grave em Configurações › Empresa.', 'erro'); return; }
      try { aplicar(await aplicarGuardada(g)); } catch (e) { App.UI.toast(e.message, 'erro'); }
    };
    const botoes = function (preenchida) {
      const l = [];
      l.push(h('button.btn' + (preenchida ? '.pequeno' : '.primario'), { type: 'button', onclick: assinar }, preenchida ? '✍️ Refazer na tela' : '✍️ Assinar na tela'));
      l.push(h('button.btn' + (preenchida ? '.pequeno' : ''), { type: 'button', onclick: enviarImagem }, preenchida ? '🖼 Trocar por imagem' : '🖼 Enviar imagem'));
      if (o.usarGuardada && guardada()) l.push(h('button.btn' + (preenchida ? '.pequeno' : ''), { type: 'button', title: 'Assinatura do responsável técnico gravada em Configurações › Empresa', onclick: usarGuardada }, '⭐ Usar assinatura guardada'));
      return l;
    };
    function desenhar() {
      box.innerHTML = '';
      box.appendChild(h('div.assinatura-rotulo', rotulo));
      if (estado.fotoId) {
        const img = h('img.assinatura-img', { alt: 'Assinatura de ' + (estado.nome || ''), hidden: true });
        const aviso = h('span.foto-aviso', 'carregando…');
        App.Fotos.obter(estado.fotoId).then(function (f) {
          if (f) { img.src = f.dataURL; img.hidden = false; aviso.remove(); } else aviso.textContent = 'assinatura na nuvem — entre na sincronização para ver';
        });
        box.appendChild(h('div.assinatura-quadro.preenchida', aviso, img));
        box.appendChild(h('div.assinatura-info', h('strong', estado.nome || '—'), h('small', descricao(estado))));
        box.appendChild(h('div.barra-itens.assinatura-botoes', botoes(true), h('button.btn.pequeno.perigo', {
          type: 'button', onclick: async function () {
            if (!(await App.UI.confirmar('Remover esta assinatura?', 'Remover', true))) return;
            App.Fotos.remover(estado.fotoId);
            Object.assign(estado, vazia());
            aoMudar();
            desenhar();
          }
        }, 'Remover')));
      } else {
        box.appendChild(h('div.assinatura-quadro.vazia', h('span', 'Ainda não assinado')));
        box.appendChild(h('div.assinatura-botoes', botoes(false)));
      }
    }
    desenhar();
    return box;
  }

  /* ------------------------------------------------------------ assinatura digital (gov.br) */

  function latin1(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return s;
  }

  function hexParaBytes(hex) {
    const limpo = hex.replace(/[^0-9a-fA-F]/g, '');
    const out = new Uint8Array(Math.floor(limpo.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(limpo.substr(i * 2, 2), 16);
    return out;
  }

  /** Nomes (CN) dos certificados dentro da assinatura PKCS#7: OID 2.5.4.3 seguido do texto. */
  function nomesComuns(der) {
    const nomes = [];
    for (let i = 0; i + 5 < der.length; i++) {
      if (der[i] !== 0x06 || der[i + 1] !== 0x03 || der[i + 2] !== 0x55 || der[i + 3] !== 0x04 || der[i + 4] !== 0x03) continue;
      const tag = der[i + 5];
      if ([0x0C, 0x13, 0x14, 0x16, 0x1E].indexOf(tag) < 0) continue;
      let len = der[i + 6], ini = i + 7;
      if (len === 0x81) { len = der[i + 7]; ini = i + 8; }
      if (!(len > 0) || ini + len > der.length) continue;
      const pedaco = der.subarray(ini, ini + len);
      let txt;
      try { txt = tag === 0x1E ? String.fromCharCode.apply(null, Array.from({ length: len / 2 }, function (_, k) { return (pedaco[k * 2] << 8) | pedaco[k * 2 + 1]; })) : new TextDecoder('utf-8').decode(pedaco); } catch (e) { continue; }
      nomes.push(txt.trim());
    }
    return nomes;
  }

  /**
   * Confere o PDF assinado: tem assinatura digital (/ByteRange e /Contents), quantas, o emissor (gov.br, ICP-Brasil ou outro
   * certificado), os signatários (nome do certificado, sem o CPF) e a data da assinatura (/M). bytes: Uint8Array.
   */
  function analisarPdf(bytes) {
    const s = latin1(bytes);
    if (s.slice(0, 1024).indexOf('%PDF') < 0) return { pdf: false, assinado: false };
    const qtd = (s.match(/\/ByteRange\s*\[/g) || []).length;
    const blocos = [];
    const re = /\/Contents\s*<([0-9A-Fa-f\s]{64,})>/g;
    let m;
    while ((m = re.exec(s))) blocos.push(m[1].slice(0, 120000));
    const nomes = [], acs = [];
    let emissor = '';
    blocos.forEach(function (hex) {
      const der = hexParaBytes(hex);
      const txt = latin1(der);
      if (/Governo Federal|gov\.br/i.test(txt)) emissor = 'gov.br';
      else if (!emissor && /ICP-Brasil/i.test(txt)) emissor = 'ICP-Brasil';
      nomesComuns(der).forEach(function (n) {
        if (/^(AC|ACT)\b|Autoridade|Certificadora|Raiz|Root|\bCA\b|Governo Federal|Timestamp|Carimbo/i.test(n)) acs.push(n);
        else {
          const limpo = n.replace(/:\s*\d{11,14}\s*$/, '').trim();
          if (limpo && nomes.indexOf(limpo) < 0) nomes.push(limpo);
        }
      });
    });
    const dm = s.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/);
    const data = dm ? dm[1] + '-' + dm[2] + '-' + dm[3] + (dm[4] ? 'T' + dm[4] + ':' + (dm[5] || '00') + ':00' : '') : '';
    return { pdf: true, assinado: qtd > 0 && blocos.length > 0, quantidade: qtd, emissor: emissor || (qtd ? 'certificado digital' : ''), signatarios: nomes, autoridades: acs, data: data };
  }

  /** Texto do PDF assinado para as telas e o relatório. */
  function descricaoDigital(d) {
    if (!d || !d.fotoId) return '';
    return 'Assinado digitalmente' + (d.emissor === 'gov.br' ? ' pelo gov.br' : d.emissor ? ' (' + d.emissor + ')' : '') +
      (d.signatarios && d.signatarios.length ? ' por ' + d.signatarios.join(', ') : '') + (d.assinadoEm ? ' em ' + U.dataBR(d.assinadoEm.slice(0, 10)) : '');
  }

  async function blobDoArquivo(d) {
    const f = await App.Fotos.obter(d.fotoId);
    if (!f) throw new Error('O PDF assinado não está neste aparelho: ligue a sincronização para baixá-lo da nuvem.');
    return { blob: await (await fetch(f.dataURL)).blob(), nome: d.nome || 'documento_assinado.pdf' };
  }

  /**
   * Bloco da assinatura digital pelo gov.br (instalação e OS): gerar o PDF, instruções ao cliente pelo WhatsApp, abrir o
   * Assinador gov.br e anexar o PDF assinado — conferido e guardado em reg.assinaturaDigital.
   * o: {documento: 'relatório de instalação', gerarPdf(): Promise<{blob, nome}>, telefone(), cliente(), aoMudar()}
   */
  function govbr(reg, o) {
    const UI = App.UI;
    const box = h('div.govbr-box');
    const anexar = async function () {
      const arquivo = await escolherArquivo('application/pdf,.pdf');
      if (!arquivo) return;
      if (arquivo.size > LIMITE_PDF) { UI.toast('PDF com mais de 8 MB. Gere o PDF de novo e assine esse arquivo.', 'erro'); return; }
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const an = analisarPdf(bytes);
      if (!an.pdf) { UI.toast('O arquivo não é um PDF.', 'erro'); return; }
      if (!an.assinado) { UI.toast('Este PDF não tem assinatura digital. Assine no Assinador gov.br e anexe o arquivo baixado de lá (normalmente termina com "_assinado.pdf").', 'erro'); return; }
      let url = String(await U.readFileAsDataURL(arquivo)).replace(/^data:[^;,]*/, 'data:application/pdf');
      const id = await App.Fotos.salvar({ dataURL: url, w: 0, h: 0, tipo: 'application/pdf', nome: arquivo.name || 'documento_assinado.pdf' });
      url = null;
      if (reg.assinaturaDigital && reg.assinaturaDigital.fotoId) App.Fotos.remover(reg.assinaturaDigital.fotoId);
      reg.assinaturaDigital = { fotoId: id, nome: arquivo.name || 'documento_assinado.pdf', em: new Date().toISOString(), emissor: an.emissor, signatarios: an.signatarios, assinadoEm: an.data || '', quantidade: an.quantidade, tamanho: arquivo.size };
      o.aoMudar();
      UI.toast('PDF assinado anexado: ' + descricaoDigital(reg.assinaturaDigital) + '.', 'ok');
      desenhar();
    };
    const pdfParaAssinar = async function (botao) {
      if (botao) botao.disabled = true;
      try {
        const g = await o.gerarPdf();
        U.download(g.blob, g.nome.replace(/\.pdf$/i, '') + '_para_assinar.pdf');
        UI.toast('PDF baixado: envie ao cliente ou assine neste aparelho no Assinador gov.br.', 'ok');
      } catch (e) { console.error(e); UI.toast(e.message || 'Não foi possível gerar o PDF.', 'erro'); } finally { if (botao) botao.disabled = false; }
    };
    const instrucoes = function () {
      const cli = (o.cliente && o.cliente()) || '';
      const emp = App.Store.config().empresa;
      const texto = 'Olá' + (cli ? ', ' + String(cli).split(' ')[0] : '') + '! Segue o ' + o.documento + ' para você assinar digitalmente pelo gov.br (gratuito):\n' +
        '1) Abra ' + ASSINADOR_GOVBR + ' e entre com a sua conta gov.br (nível prata ou ouro);\n' +
        '2) Escolha o arquivo PDF que enviei aqui;\n' +
        '3) Posicione a assinatura, confirme com o código enviado pelo aplicativo gov.br e baixe o arquivo assinado;\n' +
        '4) Me devolva por aqui o PDF assinado.\n' + (emp.nomeCurto || emp.razao || '');
      const A = App.Acompanhamento;
      const tel = o.telefone ? o.telefone() : '';
      window.open(A ? A.linkWhats(tel, texto) : 'https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    };
    function desenhar() {
      box.innerHTML = '';
      const d = reg.assinaturaDigital;
      box.appendChild(h('div.govbr-topo', h('strong', '🔐 Assinatura digital pelo gov.br (opcional)'),
        h('small', 'Gratuita e com validade jurídica (assinatura eletrônica avançada — Lei 14.063/2020): o cliente assina com a conta gov.br dele (nível prata ou ouro).')));
      if (d && d.fotoId) {
        box.appendChild(h('div.nota.ok.govbr-ok', '✅ ' + descricaoDigital(d) + '. Arquivo: ' + d.nome + ' (anexado em ' + dataHora(d.em) + ').'));
        box.appendChild(h('div.barra-itens',
          h('button.btn', { type: 'button', onclick: function () { App.Visualizar.abrir(function () { return blobDoArquivo(d); }, { titulo: 'PDF assinado — ' + d.nome }); } }, '👁 Ver PDF assinado'),
          h('button.btn', { type: 'button', onclick: async function () { try { const b = await blobDoArquivo(d); U.download(b.blob, b.nome); } catch (e) { UI.toast(e.message, 'erro'); } } }, '⬇ Baixar'),
          h('button.btn', { type: 'button', onclick: anexar }, '📎 Trocar arquivo'),
          h('button.btn.perigo', {
            type: 'button', onclick: async function () {
              if (!(await UI.confirmar('Remover o PDF assinado deste registro?', 'Remover', true))) return;
              App.Fotos.remover(d.fotoId);
              reg.assinaturaDigital = null;
              o.aoMudar();
              desenhar();
            }
          }, 'Remover')));
        return;
      }
      const bPdf = h('button.btn', { type: 'button', onclick: function () { pdfParaAssinar(bPdf); } }, '⬇ PDF para assinar');
      box.appendChild(h('ol.govbr-passos',
        h('li', h('span', 'Gere o PDF do ' + o.documento + ' (com os dados já preenchidos).'), bPdf),
        h('li', h('span', 'Envie o PDF ao cliente com as instruções — ou, com o cliente ao lado, abra o Assinador neste aparelho.'),
          h('span.govbr-botoes', h('button.btn', { type: 'button', onclick: instrucoes }, '💬 Instruções pelo WhatsApp'),
            h('a.btn', { href: ASSINADOR_GOVBR, target: '_blank', rel: 'noopener' }, '↗ Assinador gov.br'))),
        h('li', h('span', 'Anexe aqui o PDF assinado que o cliente devolver (o CRM confere a assinatura digital).'), h('button.btn.primario', { type: 'button', onclick: anexar }, '📎 Anexar PDF assinado'))));
    }
    desenhar();
    return box;
  }

  App.Assinatura = {
    vazia: vazia, coletar: coletar, deArquivo: deArquivo, deImagem: deImagem, campo: campo, dataHora: dataHora, recortar: recortar, descricao: descricao,
    guardada: guardada, aplicarGuardada: aplicarGuardada, analisarPdf: analisarPdf, descricaoDigital: descricaoDigital, govbr: govbr, ASSINADOR_GOVBR: ASSINADOR_GOVBR
  };
})(window.App);
