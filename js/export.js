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

  /* Quem a ficha identifica: a pessoa (nome/CPF) ou, na PJ, a empresa (razão social/CNPJ). */
  function titular(d) { return d[S.ficha.chaveNome || 'nome'] || ''; }
  function documentoTitular(d) {
    var doc = S.ficha.documento || { rot: 'CPF', k: 'cpf' };
    return d[doc.k] ? doc.rot + ' ' + d[doc.k] : '';
  }

  /* "filiacao-abramus-maria.pdf": prefixo da ficha + sufixo do titular
     (no herdeiro, "filiacao-herdeiro-abramus-jose-3-herdeiros.pdf"). */
  function nomeArquivo(dados, sufixo, ext) {
    var base = S.sufixoArquivo(dados) || 'ficha';
    return S.ficha.arquivo + '-' + base + (sufixo ? '-' + sufixo : '') + '.' + ext;
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
        blob: global.FichaPDF.gerar(imagens, { titulo: S.ficha.titulo + ' — ' + titular(d), autor: titular(d), assunto: S.ficha.titulo + ' - ' + S.ficha.publico }),
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
    /* Imprime na própria página, sem window.open: janela nova cai no bloqueador
       de pop-ups. As páginas vão para #impressao, que o CSS de impressão mostra
       sozinho, escondendo o app. */
    return renderizarExport().then(function (canvases) {
      var antigo = document.getElementById('impressao');
      if (antigo) antigo.parentNode.removeChild(antigo);
      var box = document.createElement('div');
      box.id = 'impressao';
      var carregadas = canvases.map(function (cv) {
        var img = document.createElement('img');
        img.alt = '';
        box.appendChild(img);
        return new Promise(function (resolve) {
          img.onload = img.onerror = resolve;
          img.src = cv.toDataURL('image/jpeg', QUALIDADE);
        });
      });
      document.body.appendChild(box);
      return Promise.all(carregadas).then(function () {
        var tituloApp = document.title;
        // o título vira o nome sugerido em "Salvar como PDF"
        document.title = nomeArquivo(St.todos(), '', 'pdf').replace(/\.pdf$/, '');
        function limpar() {
          window.removeEventListener('afterprint', limpar);
          document.title = tituloApp;
          if (box.parentNode) box.parentNode.removeChild(box);
        }
        window.addEventListener('afterprint', limpar);
        window.print();
      });
    });
  }

  /* ---------- resumo textual (corpo do e-mail) ---------- */
  function resumoDesligamento(d) {
    var sel = Array.isArray(d.categorias_desligamento) ? d.categorias_desligamento : [];
    var cats = S.CATEGORIAS_DESLIGAMENTO.filter(function (c) { return sel.indexOf(c.v) >= 0; })
      .map(function (c) { return c.rot; });
    return [
      S.ficha.tituloFicha,
      '',
      'Sociedade anterior: ' + (d.sociedade_anterior || '—'),
      'Nome: ' + (d.nome || '—'),
      d.pseudonimo ? 'Nome artístico: ' + d.pseudonimo : null,
      'CPF: ' + (d.cpf || '—'),
      'Categorias: ' + (cats.length ? cats.join('; ') : '—'),
      '',
      'O pedido completo segue em anexo (PDF).'
    ].filter(function (l) { return l !== null; }).join('\n');
  }

  function resumoTexto() {
    var d = St.todos();
    var id = S.ficha.id;
    if (id === 'desligamento') return resumoDesligamento(d);
    var L = [];
    L.push(S.ficha.tituloFicha);
    L.push('');
    var cats = St.categoriasSelecionadas().map(function (c) {
      return c.rot + ' (' + (St.territorioTexto(c.k) || 'território não informado') + ')';
    });
    L.push('Categorias: ' + (cats.length ? cats.join('; ') : '—'));
    L.push('');
    if (id === 'pj') {
      L.push('Razão social: ' + (d.razao_social || '—'));
      if (d.nome_fantasia) L.push('Nome fantasia: ' + d.nome_fantasia);
      L.push('CNPJ: ' + (d.cnpj || '—'));
      L.push('');
      L.push('Representante legal: ' + (d.resp_nome || '—') + '   CPF: ' + (d.resp_cpf || '—'));
      L.push('Celular: ' + (d.resp_cel || '—') + '   E-mail: ' + (d.resp_email || '—'));
    } else {
      if (id === 'herdeiro') {
        L.push('Titular falecido: ' + (d.fal_nome || '—') + '   CPF: ' + (d.fal_cpf || '—'));
        L.push('Falecimento: ' + (d.fal_falecimento || '—'));
        L.push('');
        L.push('Herdeiro / sucessor: ' + (d.nome || '—'));
        L.push('RG: ' + (d.rg || '—') + ' ' + (d.rg_orgao || ''));
        for (var n = 2; n <= S.nHerdeiros(d); n++) {
          var h = S.dadosHerdeiro(d, n);
          L.push('Herdeiro ' + n + ': ' + (h.nome || '—') + '   RG: ' + (h.rg || '—') + ' ' + (h.rg_orgao || ''));
          L.push('  ' + textoPagamento(h));
        }
      } else {
        L.push('Nome: ' + (d.nome || '—'));
        L.push('CPF: ' + (d.cpf || '—') + '   RG: ' + (d.rg || '—') + ' ' + (d.rg_orgao || ''));
        L.push('Nascimento: ' + (d.nascimento || '—'));
        if (d.pseudonimo) L.push('Pseudônimo: ' + d.pseudonimo);
        if (id === 'menor') L.push('Responsável legal: ' + (d.resp_nome || '—') + '   CPF: ' + (d.resp_cpf || '—'));
      }
    }
    L.push('');
    L.push('Endereço: ' + [d.endereco, d.numero, d.complemento].filter(Boolean).join(', '));
    L.push([d.bairro, d.cidade, d.uf].filter(Boolean).join(' - ') + '  CEP ' + (d.cep || '—'));
    if (id === 'pj') {
      L.push('Telefone: ' + (d.tel || '—') + (d.cel ? '   Cel: ' + d.cel : ''));
    } else {
      L.push('Celular: ' + (d.cel || '—') + (d.tel ? '   Tel: ' + d.tel : ''));
      L.push('E-mail: ' + (d.email || '—'));
    }
    L.push('');
    L.push((id === 'herdeiro' && S.nHerdeiros(d) > 1 ? 'Herdeiro 1 — ' : '') + textoPagamento(d));
    L.push('');
    L.push('A ficha completa segue em anexo (PDF).');
    return L.join('\n');
  }

  function textoPagamento(d) {
    if (d.forma_pagamento === 'conta') {
      return 'Pagamento: conta bancária' + (d.tipo_conta ? ' ' + d.tipo_conta.toLowerCase() : '') + ' — ' +
        [d.banco, d.agencia && 'ag. ' + d.agencia,
         d.conta_numero && 'c/' + (d.conta_modalidade || '').toLowerCase() + ' ' + d.conta_numero].filter(Boolean).join(', ');
    }
    if (d.forma_pagamento === 'pj') return 'Pagamento: pessoa jurídica — ' + [d.razao_social, d.cnpj && 'CNPJ ' + d.cnpj].filter(Boolean).join(', ');
    if (d.forma_pagamento === 'guiche') return 'Guichê de sociedade: ' + (d.guiche === 'Outro' ? (d.guiche_outro || 'Outro') : (d.guiche || '—'));
    return 'Pagamento: —';
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
            S.ficha.titulo + ' — ' + (titular(St.todos()) || S.ficha.publico), resumoTexto());
        });
      }
      var arquivo = new File([a.blob], a.nome, { type: 'application/pdf' });
      return navigator.share({
        files: [arquivo],
        title: S.ficha.titulo + ' — ABRAMUS',
        text: resumoTexto()
      });
    });
  }

  function assuntoEmail(d) {
    var doc = documentoTitular(d);
    return S.ficha.titulo + ' — ' + (titular(d) || S.ficha.publico) + (doc ? ' — ' + doc : '');
  }

  function abrirMailto(assunto, corpo, curto) {
    var href = 'mailto:' + S.EMAIL_DESTINO + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo);
    if (href.length > 1900) {
      href = 'mailto:' + S.EMAIL_DESTINO + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(curto);
    }
    location.href = href;
  }

  function abrirEmail() {
    var d = St.todos();
    var assunto = assuntoEmail(d);
    var corpo = resumoTexto() + '\n\n' + (S.DOCUMENTOS.length
      ? 'Documentos assinalados no aplicativo:\n' +
        S.DOCUMENTOS.filter(function (doc) { return d[doc.k]; }).map(function (doc) { return '- ' + doc.rot; }).join('\n') +
        '\n\nLembre-se de anexar o PDF da ficha e os documentos acima antes de enviar.'
      : 'Lembre-se de anexar o PDF assinado antes de enviar.');
    abrirMailto(assunto, corpo, 'Segue em anexo o documento "' + S.ficha.titulo + '" de ' + titular(d) + '.');
  }

  /* ---------- ficha assinada e documentos ---------- */
  /* Arquivos que vão no envio: um PDF com todas as fotos (ficha assinada
     primeiro) e, à parte, os PDFs que o usuário anexou. */
  /* formato 'zip': um único arquivo compactado com os originais, nomeado
     pelo tipo da ficha; 'pdf' (padrão): PDF único com as fotos + PDFs à parte. */
  function arquivosDosAnexos(lista, formato) {
    var d = St.todos();
    if (formato === 'zip') {
      return global.FichaAnexos.gerarZip(lista, d).then(function (z) {
        return [{ blob: z.blob, nome: z.nome, mime: 'application/zip' }];
      });
    }
    return global.FichaAnexos.gerarPacote(lista, d).then(function (p) {
      var arqs = [];
      if (p.pdf) arqs.push({ blob: p.pdf, nome: nomeArquivo(d, 'assinada-e-documentos', 'pdf'), mime: 'application/pdf' });
      var seq = {};
      p.pdfsAvulsos.forEach(function (a) {
        seq[a.tipo] = (seq[a.tipo] || 0) + 1;
        arqs.push({ blob: a.blob, nome: nomeArquivo(d, a.tipo.replace(/^doc_/, '').replace(/_/g, '-') + '-' + seq[a.tipo], 'pdf'),
          mime: 'application/pdf' });
      });
      return arqs;
    });
  }

  function corpoAnexos(v) {
    var L = [resumoTexto().replace(/\n[^\n]*segue em anexo \(PDF\)\.$/, ''), '', 'Anexos (conferidos no aplicativo):'];
    v.itens.forEach(function (it) {
      if (it.status === 'naoSeAplica' || (it.status === 'opcional' && !it.quantidade)) return;
      L.push('- ' + it.req.rot + ': ' + it.mensagem);
    });
    if (!v.ok) {
      L.push('');
      L.push('Pendente: ' + v.faltando.map(function (it) { return it.req.rot; }).join('; ') + '.');
    }
    return L.join('\n');
  }

  function enviarAnexos(lista, v, formato) {
    var d = St.todos();
    var assunto = assuntoEmail(d) + ' — ficha assinada e documentos';
    var corpo = corpoAnexos(v);
    return arquivosDosAnexos(lista, formato).then(function (arqs) {
      var ponte = pontesNativa();
      if (ponte && ponte.compartilharArquivo) {
        // a ponte do APK leva um arquivo por vez: o ZIP (tudo) ou o PDF com as fotos
        var principal = arqs[0];
        return blobParaBase64(principal.blob).then(function (b64) {
          ponte.compartilharArquivo(principal.nome, principal.mime, b64, S.EMAIL_DESTINO, assunto, corpo);
          return { modo: 'nativo', ignorados: arqs.length - 1 };
        });
      }
      // o Chrome do celular não compartilha .zip (só imagem, PDF, texto…): aí cai no download
      var files = arqs.map(function (a) { return new File([a.blob], a.nome, { type: a.mime }); });
      var podeShare = false;
      try { podeShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: files })); } catch (e) {}
      if (podeShare) {
        return navigator.share({ files: files, title: assunto, text: corpo }).then(function () { return { modo: 'share' }; });
      }
      // sem Web Share (desktop): baixa os arquivos e abre o e-mail para anexá-los
      arqs.forEach(function (a, i) { setTimeout(function () { baixarBlob(a.blob, a.nome); }, i * 400); });
      setTimeout(function () {
        abrirMailto(assunto, corpo + '\n\nAnexe os arquivos baixados: ' + arqs.map(function (a) { return a.nome; }).join(', ') + '.',
          'Seguem em anexo a ficha assinada e os documentos de ' + titular(d) + '.');
      }, 900 + arqs.length * 400);
      return { modo: 'download', arquivos: arqs.length };
    });
  }

  function baixarAnexos(lista, formato) {
    return arquivosDosAnexos(lista, formato).then(function (arqs) {
      arqs.forEach(function (a, i) { setTimeout(function () { baixarBlob(a.blob, a.nome); }, i * 400); });
      return arqs;
    });
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
    enviarAnexos: enviarAnexos,
    baixarAnexos: baixarAnexos,
    resumoTexto: resumoTexto,
    nomeArquivo: nomeArquivo
  };
})(window);
