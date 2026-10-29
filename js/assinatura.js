/*
 * Assinatura na tela: o cliente (ou o técnico) assina com o dedo, a caneta ou o mouse. A imagem (PNG recortado, fundo branco)
 * vai para App.Fotos — fora do armazenamento local, com cópia na nuvem — e o registro guarda {fotoId, nome, em}.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const U = App.U;
  const h = U.h;

  function vazia() { return { fotoId: '', nome: '', em: '' }; }

  function dataHora(iso) {
    const d = new Date(iso || '');
    if (isNaN(d)) return '';
    return U.dataBR(iso.slice(0, 10)) + ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

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

  /**
   * Abre a janela para assinar. o: {titulo, nome, declaracao}. Resolve com {fotoId, nome, em} ou null (cancelado).
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
                terminar({ fotoId: id, nome: String(estado.nome).trim(), em: new Date().toISOString() });
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
   * Campo de assinatura para formulários: mostra a assinatura salva (nome e data) com Refazer/Remover, ou o botão para assinar.
   * o: {nomePadrao: string|function, declaracao: string|function}
   */
  function campo(rotulo, estado, o, aoMudar) {
    o = o || {};
    const val = function (x) { return typeof x === 'function' ? x() : x; };
    const box = h('div.assinatura-campo');
    const assinar = async function () {
      const r = await coletar({ titulo: rotulo, nome: estado.nome || val(o.nomePadrao) || '', declaracao: val(o.declaracao) });
      if (!r) return;
      if (estado.fotoId) App.Fotos.remover(estado.fotoId);
      Object.assign(estado, r);
      aoMudar();
      desenhar();
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
        box.appendChild(h('div.assinatura-info', h('strong', estado.nome || '—'), h('small', 'Assinado em ' + dataHora(estado.em))));
        box.appendChild(h('div.barra-itens',
          h('button.btn.pequeno', { type: 'button', onclick: assinar }, '✍️ Refazer'),
          h('button.btn.pequeno.perigo', {
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
        box.appendChild(h('button.btn.primario', { type: 'button', onclick: assinar }, '✍️ Assinar na tela'));
      }
    }
    desenhar();
    return box;
  }

  App.Assinatura = { vazia: vazia, coletar: coletar, campo: campo, dataHora: dataHora, recortar: recortar };
})(window.App);
