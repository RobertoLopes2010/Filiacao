/* Gerador de PDF mínimo, sem bibliotecas externas.
   Monta um PDF 1.4 com uma página A4 por imagem JPEG (filtro DCTDecode).
   Todo o processamento acontece no navegador — nenhum byte trafega pela rede. */
(function (global) {
  'use strict';

  var A4_L = 595.28, A4_A = 841.89;

  function bytesDeTexto(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) { out[i] = str.charCodeAt(i) & 0xFF; }
    return out;
  }

  function bytesDeDataURL(dataUrl) {
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var bin = atob(base64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  /* Texto com acento em metadados: string hexadecimal UTF-16BE com BOM. */
  function textoPDF(str) {
    var hex = 'FEFF';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i).toString(16).toUpperCase();
      hex += '0000'.slice(c.length) + c;
    }
    return '<' + hex + '>';
  }

  function dataPDF(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var tz = -d.getTimezoneOffset();
    var sinal = tz >= 0 ? '+' : '-';
    tz = Math.abs(tz);
    return 'D:' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
      sinal + p(Math.floor(tz / 60)) + "'" + p(tz % 60) + "'";
  }

  /* imagens: [{ dataUrl, largura, altura }] — uma página A4 por item. */
  function gerar(imagens, meta) {
    meta = meta || {};
    var chunks = [];
    var tamanho = 0;
    var offsets = [0];

    function escreve(algo) {
      var b = typeof algo === 'string' ? bytesDeTexto(algo) : algo;
      chunks.push(b);
      tamanho += b.length;
    }

    function objeto(num, corpo, fluxo) {
      offsets[num] = tamanho;
      escreve(num + ' 0 obj\n' + corpo + '\n');
      if (fluxo) {
        escreve('stream\n');
        escreve(fluxo);
        escreve('\nendstream\n');
      }
      escreve('endobj\n');
    }

    var n = imagens.length;
    var totalObjs = 2 + n * 3 + 1;           // catálogo + pages + (página, conteúdo, imagem) + info
    var idInfo = totalObjs;

    escreve('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    // 1 — catálogo
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');

    // 2 — árvore de páginas
    var kids = [];
    for (var i = 0; i < n; i++) { kids.push((3 + i * 3) + ' 0 R'); }
    objeto(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');

    for (i = 0; i < n; i++) {
      var idPagina = 3 + i * 3;
      var idConteudo = idPagina + 1;
      var idImagem = idPagina + 2;
      var img = imagens[i];
      var bytesImg = bytesDeDataURL(img.dataUrl);

      objeto(idPagina,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4_L.toFixed(2) + ' ' + A4_A.toFixed(2) + ']' +
        ' /Resources << /XObject << /Im0 ' + idImagem + ' 0 R >> >>' +
        ' /Contents ' + idConteudo + ' 0 R >>');

      var conteudo = 'q\n' + A4_L.toFixed(2) + ' 0 0 ' + A4_A.toFixed(2) + ' 0 0 cm\n/Im0 Do\nQ';
      objeto(idConteudo, '<< /Length ' + conteudo.length + ' >>', conteudo);

      objeto(idImagem,
        '<< /Type /XObject /Subtype /Image /Width ' + img.largura + ' /Height ' + img.altura +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytesImg.length + ' >>',
        bytesImg);
    }

    objeto(idInfo,
      '<< /Title ' + textoPDF(meta.titulo || 'Proposta de Filiação — ABRAMUS') +
      ' /Author ' + textoPDF(meta.autor || '') +
      ' /Subject ' + textoPDF('Proposta de Filiação - Pessoa Física') +
      ' /Producer ' + textoPDF('Ficha de Filiação PWA') +
      ' /Creator ' + textoPDF('Ficha de Filiação PWA') +
      ' /CreationDate (' + dataPDF(new Date()) + ') >>');

    // tabela xref
    var inicioXref = tamanho;
    var xref = 'xref\n0 ' + (totalObjs + 1) + '\n0000000000 65535 f \n';
    for (i = 1; i <= totalObjs; i++) {
      var off = String(offsets[i] || 0);
      xref += '0000000000'.slice(off.length) + off + ' 00000 n \n';
    }
    escreve(xref);
    escreve('trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R /Info ' + idInfo + ' 0 R >>\n' +
      'startxref\n' + inicioXref + '\n%%EOF\n');

    // concatena
    var saida = new Uint8Array(tamanho);
    var pos = 0;
    for (i = 0; i < chunks.length; i++) {
      saida.set(chunks[i], pos);
      pos += chunks[i].length;
    }
    return new Blob([saida], { type: 'application/pdf' });
  }

  global.FichaPDF = { gerar: gerar };
})(window);
