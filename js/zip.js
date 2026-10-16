/*
 * Gerador de arquivos ZIP (usado para montar o pacote .docx) sem dependências externas.
 * Usa compressão DEFLATE nativa do navegador (CompressionStream) quando disponível; caso contrário, armazena sem compressão.
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const TABELA = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDataHora(d) {
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora: hora, data: data };
  }

  async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(cs);
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    } catch (e) {
      return null;
    }
  }

  function Zip() {
    this.arquivos = [];
  }

  Zip.prototype.add = function (nome, dados) {
    const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
    this.arquivos.push({ nome: nome, bytes: bytes });
    return this;
  };

  Zip.prototype.gerar = async function (mime) {
    const enc = new TextEncoder();
    const dh = dosDataHora(new Date());
    const partes = [];
    const central = [];
    let offset = 0;

    for (const f of this.arquivos) {
      const nome = enc.encode(f.nome);
      const crc = crc32(f.bytes);
      let comp = await deflateRaw(f.bytes);
      let metodo = 8;
      if (!comp || comp.length >= f.bytes.length) { comp = f.bytes; metodo = 0; }

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, metodo, true);
      lh.setUint16(10, dh.hora, true);
      lh.setUint16(12, dh.data, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, comp.length, true);
      lh.setUint32(22, f.bytes.length, true);
      lh.setUint16(26, nome.length, true);
      lh.setUint16(28, 0, true);
      partes.push(new Uint8Array(lh.buffer), nome, comp);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, metodo, true);
      ch.setUint16(12, dh.hora, true);
      ch.setUint16(14, dh.data, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, comp.length, true);
      ch.setUint32(24, f.bytes.length, true);
      ch.setUint16(28, nome.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nome);

      offset += 30 + nome.length + comp.length;
    }

    const tamCentral = central.reduce(function (s, b) { return s + b.length; }, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(4, 0, true);
    fim.setUint16(6, 0, true);
    fim.setUint16(8, this.arquivos.length, true);
    fim.setUint16(10, this.arquivos.length, true);
    fim.setUint32(12, tamCentral, true);
    fim.setUint32(16, offset, true);
    fim.setUint16(20, 0, true);

    return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]), { type: mime || 'application/zip' });
  };

  App.Zip = Zip;
  App.crc32 = crc32;
})(window.App);
