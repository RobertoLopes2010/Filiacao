/* Exportação: JPG, PDF, compartilhamento e e-mail.
   Todas as operações são locais. O e-mail é aberto no aplicativo do próprio aparelho —
   este app nunca envia dados para nenhum servidor. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var St = global.FichaState;
  var R = global.FichaRender;

  var QUALIDADE = 0.92;
  var ESCALA_EXPORT = 3;   // ~ 216 dpi

  function nomeArquivo(dados, sufixo, ext) {
    var base = (dados.nome || 'ficha')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'ficha';
    return 'filiacao-abramus-' + base + (sufixo ? '-' + sufixo : '') + '.' + ext;
  }

  /* Dentro do APK Android o WebView não baixa URLs blob: nem expõe navigator.share.
     Quando a ponte nativa existe (window.FichaAndroid), o arquivo é entregue ao
     aparelho em base64 e quem salva/compartilha é o próprio app. Continua tudo
     local: a ponte é um método Java no mesmo processo, não uma requisição. */
  function pontesNativa() {
    return typeof global.FichaAndroid !== 'undefined' && global.FichaAndroid ? global.FichaAndroid : null;
  }

  function blobParaBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function baixarBlob(blob, nome) {
    var ponte = pontesNativa();
    if (ponte && ponte.salvarArquivo) {
      return blobParaBase64(blob).then(function (b64) {
        ponte.salvarArquivo(nome, blob.type || 'application/octet-stream', b64);
      });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function canvasParaBlob(cv, tipo, qualidade) {
    return new Promise(function (resolve) {
      if (cv.toBlob) cv.toBlob(function (b) { resolve(b); }, tipo, qualidade);
      else resolve(dataURLparaBlob(cv.toDataURL(tipo, qualidade)));
    });
  }

  function dataURLparaBlob(dataUrl) {
    var partes = dataUrl.split(',');
    var tipo = /:(.*?);/.exec(partes[0])[1];
    var bin = atob(partes[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
    return new Blob([arr], { type: tipo });
  }

  function renderizarExport() {
    return R.paginas(St.todos(), { escala: ESCALA_EXPORT, destaque: false });
  }

  /* ---------- JPG ---------- */
  function gerarJPGs() {
    return renderizarExport().then(function (canvases) {
      return Promise.all(canvases.map(function (cv, i) {
        return canvasParaBlob(cv, 'image/jpeg', QUALIDADE).then(function (b) {
          return { blob: b, nome: nomeArquivo(St.todos(), 'pagina-' + (i + 1), 'jpg') };
        });
      }));
    });
  }

  function baixarJPG() {
    return gerarJPGs().then(function (arqs) {
      arqs.forEach(function (a, i) {
        setTimeout(function () { baixarBlob(a.blob, a.nome); }, i * 400);
      });
      return arqs;
    });
  }

  /* ---------- PDF ---------- */
  function gerarPDF() {
    return renderizarExport().then(function (canvases) {
      var imagens = canvases.map(function (cv) {
        return { dataUrl: cv.toDataURL('image/jpeg', QUALIDADE), largura: cv.width, altura: cv.height };
      });
      var d = St.todos();
      return {
        blob: global.FichaPDF.gerar(imagens, { titulo: 'Proposta de Filiação — ' + (d.nome || ''), autor: d.nome || '' }),
        nome: nomeArquivo(d, '', 'pdf')
      };
    });
  }

  function baixarPDF() {
    return gerarPDF().then(function (a) {
      baixarBlob(a.blob, a.nome);
      return a;
    });
  }

  /* ---------- impressão ---------- */
  function imprimir() {
    var ponte = pontesNativa();
    if (ponte && ponte.imprimirArquivo) {
      /* window.open não abre janela no WebView: manda o PDF para o serviço de
         impressão do Android, que também oferece "Salvar como PDF". */
      return gerarPDF().then(function (a) {
        return blobParaBase64(a.blob).then(function (b64) {
          ponte.imprimirArquivo(a.nome, b64);
        });
      });
    }
    return renderizarExport().then(function (canvases) {
      var imgs = canvases.map(function (cv) {
        return '<img src="' + cv.toDataURL('image/jpeg', QUALIDADE) + '" alt="">';
      }).join('');
      var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
        '<title>Proposta de Filiação — ABRAMUS</title>' +
        '<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}' +
        'img{display:block;width:100%;height:auto;page-break-after:always;break-after:page}' +
        'img:last-child{page-break-after:auto;break-after:auto}</style></head><body>' +
        imgs + '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' +
        '</body></html>';
      var w = window.open('', '_blank');
      if (!w) return Promise.reject(new Error('bloqueado'));
      w.document.open();
      w.document.write(html);
      w.document.close();
    });
  }

  /* ---------- resumo textual (corpo do e-mail) ---------- */
  function resumoTexto() {
    var d = St.todos();
    var L = [];
    L.push('PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA');
    L.push('');
    var cats = St.categoriasSelecionadas().map(function (c) {
      return c.rot + ' (' + (St.territorioTexto(c.k) || 'território não informado') + ')';
    });
    L.push('Categorias: ' + (cats.length ? cats.join('; ') : '—'));
    L.push('');
    L.push('Nome: ' + (d.nome || '—'));
    L.push('CPF: ' + (d.cpf || '—') + '   RG: ' + (d.rg || '—') + ' ' + (d.rg_orgao || ''));
    L.push('Nascimento: ' + (d.nascimento || '—'));
    if (d.pseudonimo) L.push('Pseudônimo: ' + d.pseudonimo);
    L.push('Centro de custo: ' + (d.centro_custo || '—'));
    L.push('');
    L.push('Endereço: ' + [d.endereco, d.numero, d.complemento].filter(Boolean).join(', '));
    L.push([d.bairro, d.cidade, d.uf].filter(Boolean).join(' - ') + '  CEP ' + (d.cep || '—'));
    L.push('Celular: ' + (d.cel || '—') + (d.tel ? '   Tel: ' + d.tel : ''));
    L.push('E-mail: ' + (d.email || '—'));
    L.push('');
    L.push('Guichê de sociedade: ' + (d.guiche === 'Outro' ? (d.guiche_outro || 'Outro') : (d.guiche || '—')));
    L.push('');
    L.push('A ficha completa segue em anexo (PDF).');
    return L.join('\n');
  }

  /* ---------- compartilhar / e-mail ---------- */
  function podeCompartilharArquivos() {
    try {
      var ponte = pontesNativa();
      if (ponte && ponte.compartilharArquivo) return true;
      if (!navigator.canShare || !navigator.share || typeof File !== 'function') return false;
      var teste = new File([new Blob(['x'], { type: 'application/pdf' })], 't.pdf', { type: 'application/pdf' });
      return navigator.canShare({ files: [teste] });
    } catch (e) {
      return false;
    }
  }

  function compartilharPDF() {
    return gerarPDF().then(function (a) {
      var ponte = pontesNativa();
      if (ponte && ponte.compartilharArquivo) {
        return blobParaBase64(a.blob).then(function (b64) {
          ponte.compartilharArquivo(a.nome, 'application/pdf', b64, S.EMAIL_DESTINO,
            'Proposta de Filiação — ' + (St.todos().nome || 'Pessoa Física'), resumoTexto());
        });
      }
      var arquivo = new File([a.blob], a.nome, { type: 'application/pdf' });
      return navigator.share({
        files: [arquivo],
        title: 'Proposta de Filiação — ABRAMUS',
        text: resumoTexto()
      });
    });
  }

  function abrirEmail() {
    var d = St.todos();
    var assunto = 'Proposta de Filiação — ' + (d.nome || 'Pessoa Física') + (d.cpf ? ' — CPF ' + d.cpf : '');
    var corpo = resumoTexto() + '\n\n' +
      'Documentos assinalados no aplicativo:\n' +
      S.DOCUMENTOS.filter(function (doc) { return d[doc.k]; }).map(function (doc) { return '- ' + doc.rot; }).join('\n') +
      '\n\nLembre-se de anexar o PDF da ficha e os documentos acima antes de enviar.';
    var href = 'mailto:' + S.EMAIL_DESTINO +
      '?subject=' + encodeURIComponent(assunto) +
      '&body=' + encodeURIComponent(corpo);
    if (href.length > 1900) {
      href = 'mailto:' + S.EMAIL_DESTINO + '?subject=' + encodeURIComponent(assunto) +
        '&body=' + encodeURIComponent('Segue em anexo a Proposta de Filiação de ' + (d.nome || '') + '.');
    }
    location.href = href;
  }

  global.FichaExport = {
    baixarPDF: baixarPDF,
    baixarJPG: baixarJPG,
    gerarPDF: gerarPDF,
    gerarJPGs: gerarJPGs,
    imprimir: imprimir,
    compartilharPDF: compartilharPDF,
    podeCompartilharArquivos: podeCompartilharArquivos,
    abrirEmail: abrirEmail,
    resumoTexto: resumoTexto,
    nomeArquivo: nomeArquivo
  };
})(window);
