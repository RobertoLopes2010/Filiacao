/* Anexos: a ficha assinada e os documentos, fotografados ou escolhidos no aparelho.
   Ficam no IndexedDB do próprio navegador (fotos não cabem no localStorage) e
   nunca saem dele a não ser pelo envio que o usuário dispara. Sem rede. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var St = global.FichaState;

  var BANCO = 'abramus-anexos', LOJA = 'anexos';
  var LADO_MAX = 2200;                    // px no lado maior: legível e leve para e-mail
  var QUALIDADE = 0.85;
  var BYTES_MAX = 15 * 1024 * 1024;       // por arquivo
  var LIMITE_EMAIL = 20 * 1024 * 1024;    // acima disso muitos provedores recusam

  /* ------------------------------------------------------------------ */
  /* armazenamento                                                       */
  /* ------------------------------------------------------------------ */
  var promessaBanco = null;
  var memoria = [];       // se o IndexedDB não abrir (navegação privada etc.)
  var soMemoria = false;

  function abrir() {
    if (promessaBanco) return promessaBanco;
    promessaBanco = new Promise(function (resolve) {
      try {
        var req = global.indexedDB.open(BANCO, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(LOJA, { keyPath: 'id' }).createIndex('ficha', 'ficha');
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = req.onblocked = function () { soMemoria = true; resolve(null); };
      } catch (e) {
        soMemoria = true;
        resolve(null);
      }
    });
    return promessaBanco;
  }

  function operacao(modo, fn) {
    return abrir().then(function (db) {
      if (!db) return fn(null);
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(LOJA, modo);
        var res = fn(tx.objectStore(LOJA));
        tx.oncomplete = function () { resolve(res && 'result' in res ? res.result : res); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Falha ao gravar o anexo.')); };
      });
    });
  }

  function listar(fichaId) {
    fichaId = fichaId || S.ficha.id;
    return operacao('readonly', function (loja) {
      if (!loja) return memoria.filter(function (a) { return a.ficha === fichaId; });
      return loja.index('ficha').getAll(fichaId);
    }).then(function (lista) {
      return (lista || []).slice().sort(function (a, b) { return a.criado - b.criado; });
    });
  }

  function gravar(reg) {
    return operacao('readwrite', function (loja) {
      if (!loja) { memoria = memoria.filter(function (a) { return a.id !== reg.id; }).concat([reg]); return reg; }
      loja.put(reg);
      return reg;
    }).then(function () { return reg; });
  }

  function remover(id) {
    return operacao('readwrite', function (loja) {
      if (!loja) { memoria = memoria.filter(function (a) { return a.id !== id; }); return; }
      loja.delete(id);
    });
  }

  function limpar(fichaId) {
    return listar(fichaId).then(function (lista) {
      return Promise.all(lista.map(function (a) { return remover(a.id); }));
    });
  }

  function limparTudo() {
    return Promise.all(Object.keys(S.FICHAS).map(limpar));
  }

  /* ------------------------------------------------------------------ */
  /* preparo do arquivo                                                  */
  /* ------------------------------------------------------------------ */
  function lerComo(arquivo, modo) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      if (modo === 'dataurl') fr.readAsDataURL(arquivo); else fr.readAsArrayBuffer(arquivo);
    });
  }

  /* data: URL de propósito — blob: conta como outra origem em file:// e
     contaminaria o canvas (ver "Regra do canvas" no CLAUDE.md). */
  function abrirImagem(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        reject(new Error('Não foi possível abrir a imagem. Use foto JPG ou PNG, ou um PDF.'));
      };
      img.src = src;
    });
  }

  function canvasDe(img, larg, alt) {
    var cv = document.createElement('canvas');
    cv.width = larg;
    cv.height = alt;
    var g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, larg, alt);
    g.drawImage(img, 0, 0, larg, alt);
    return cv;
  }

  function paraBlob(cv, tipo, q) {
    return new Promise(function (resolve) {
      if (cv.toBlob) return cv.toBlob(resolve, tipo, q);
      var u = cv.toDataURL(tipo, q), bin = atob(u.split(',')[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: tipo }));
    });
  }

  /* Conferência de qualidade da foto (heurística, não bloqueia o envio):
     resolução, brilho médio e nitidez (variância do laplaciano em escala reduzida). */
  function analisar(img) {
    var avisos = [];
    if (Math.min(img.width, img.height) < 700) {
      avisos.push('Resolução baixa: o texto pode ficar ilegível. Fotografe mais de perto.');
    }
    var r = 400 / Math.max(img.width, img.height);
    var w = Math.max(1, Math.round(img.width * Math.min(r, 1)));
    var h = Math.max(1, Math.round(img.height * Math.min(r, 1)));
    var px = canvasDe(img, w, h).getContext('2d').getImageData(0, 0, w, h).data;
    var lum = new Float32Array(w * h), soma = 0, i;
    for (i = 0; i < w * h; i++) {
      lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      soma += lum[i];
    }
    var media = soma / (w * h);
    if (media < 70) avisos.push('Foto escura: fotografe num lugar mais iluminado.');
    else if (media > 245) avisos.push('Foto muito clara ou estourada: evite o reflexo do flash.');

    var n = 0, s1 = 0, s2 = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var k = y * w + x;
        var lap = 4 * lum[k] - lum[k - 1] - lum[k + 1] - lum[k - w] - lum[k + w];
        s1 += lap; s2 += lap * lap; n++;
      }
    }
    var nitidez = n ? s2 / n - (s1 / n) * (s1 / n) : 0;
    if (n && nitidez < 60) avisos.push('Foto possivelmente tremida ou fora de foco: confira se o texto está legível.');
    return { avisos: avisos, nitidez: Math.round(nitidez), brilho: Math.round(media) };
  }

  /* Conta as páginas de um PDF procurando os objetos /Type /Page (sem /Pages). */
  function contarPaginasPDF(buf) {
    var bytes = new Uint8Array(buf), txt = '';
    for (var i = 0; i < bytes.length; i += 65536) {
      txt += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 65536, bytes.length)));
    }
    var m = txt.match(/\/Type\s*\/Page(?![s\w])/g);
    return m ? m.length : 0;
  }

  function ehPDF(arquivo) {
    return arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name || '');
  }

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Prepara e grava um arquivo como anexo do tipo informado (k do requisito). */
  function adicionar(arquivo, tipo) {
    var base = { id: novoId(), ficha: S.ficha.id, tipo: tipo, criado: Date.now(), nomeOriginal: arquivo.name || '' };

    if (ehPDF(arquivo)) {
      if (arquivo.size > BYTES_MAX) return Promise.reject(new Error('PDF maior que 15 MB. Reduza o arquivo antes de anexar.'));
      return lerComo(arquivo, 'buffer').then(function (buf) {
        var bytes = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
        if (String.fromCharCode.apply(null, bytes) !== '%PDF-') throw new Error('O arquivo não é um PDF válido.');
        var reg = base;
        reg.mime = 'application/pdf';
        reg.blob = new Blob([buf], { type: 'application/pdf' });
        reg.tamanho = buf.byteLength;
        reg.paginas = contarPaginasPDF(buf);
        reg.avisos = [];
        return gravar(reg);
      });
    }

    if (arquivo.type && !/^image\//.test(arquivo.type)) {
      return Promise.reject(new Error('Formato não aceito. Anexe uma foto (JPG, PNG) ou um PDF.'));
    }
    return lerComo(arquivo, 'dataurl').then(abrirImagem).then(function (img) {
      var analise = analisar(img);
      var r = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      var cv = canvasDe(img, Math.round(img.width * r), Math.round(img.height * r));
      var rm = 220 / Math.max(cv.width, cv.height);
      var mini = canvasDe(cv, Math.round(cv.width * rm), Math.round(cv.height * rm)).toDataURL('image/jpeg', 0.7);
      return paraBlob(cv, 'image/jpeg', QUALIDADE).then(function (blob) {
        var reg = base;
        reg.mime = 'image/jpeg';
        reg.blob = blob;
        reg.tamanho = blob.size;
        reg.largura = cv.width;
        reg.altura = cv.height;
        reg.miniatura = mini;
        reg.avisos = analise.avisos;
        reg.analise = { nitidez: analise.nitidez, brilho: analise.brilho };
        return gravar(reg);
      });
    });
  }

  function mudarTipo(id, tipo) {
    return listar().then(function (lista) {
      var reg = lista.filter(function (a) { return a.id === id; })[0];
      if (!reg) return null;
      reg.tipo = tipo;
      return gravar(reg);
    });
  }

  /* ------------------------------------------------------------------ */
  /* validação                                                           */
  /* ------------------------------------------------------------------ */
  /* Confere os anexos contra o que a ficha ativa exige para os dados d.
     Devolve { ok, itens: [{ req, arquivos, quantidade, status, mensagem, avisos }],
               faltando, alertas, tamanhoTotal } */
  function validar(lista, d) {
    d = d || St.todos();
    var reqs = S.requisitosAnexos(d);
    var porTipo = {};
    lista.forEach(function (a) { (porTipo[a.tipo] = porTipo[a.tipo] || []).push(a); });

    var tamanhoTotal = 0;
    lista.forEach(function (a) { tamanhoTotal += a.tamanho || 0; });

    var itens = reqs.map(function (req) {
      var arqs = porTipo[req.k] || [];
      var qtd = 0;
      arqs.forEach(function (a) {
        // na ficha assinada, um PDF vale pelas páginas que tem; foto vale uma página
        qtd += req.porPagina && a.mime === 'application/pdf' ? (a.paginas || req.minimo) : 1;
      });
      var avisos = [];
      arqs.forEach(function (a) { (a.avisos || []).forEach(function (t) { avisos.push(t); }); });
      var status, msg;
      if (req.situacao === 'naoSeAplica') {
        status = 'naoSeAplica';
        msg = 'Não exigido com os dados preenchidos.';
      } else if (qtd === 0) {
        status = req.situacao === 'opcional' ? 'opcional' : 'falta';
        msg = req.situacao === 'opcional' ? 'Opcional — anexe só se tiver.' : 'Falta anexar.';
      } else if (qtd < req.minimo) {
        status = req.situacao === 'opcional' ? 'ok' : 'incompleto';
        msg = req.porPagina
          ? 'Faltam páginas: ' + qtd + ' de ' + req.minimo + '.'
          : 'Esperado ' + req.minimo + ' arquivos, anexado' + (qtd === 1 ? ' 1' : 's ' + qtd) + '.';
      } else {
        status = 'ok';
        msg = req.porPagina
          ? (req.minimo === 1 ? 'Página anexada.' : 'Todas as ' + req.minimo + ' páginas anexadas.')
          : (qtd === 1 ? '1 arquivo anexado.' : qtd + ' arquivos anexados.');
      }
      return { req: req, arquivos: arqs, quantidade: qtd, status: status, mensagem: msg, avisos: avisos };
    });

    // anexos de um tipo que a ficha não pede mais (ex.: trocou a forma de pagamento)
    var conhecidos = {};
    reqs.forEach(function (r) { conhecidos[r.k] = true; });
    var orfaos = lista.filter(function (a) { return !conhecidos[a.tipo]; });

    var faltando = itens.filter(function (it) { return it.status === 'falta' || it.status === 'incompleto'; });
    var alertas = [];
    var nPend = St.pendencias().length;
    if (nPend) alertas.push('A ficha no app tem ' + nPend + ' campo(s) obrigatório(s) sem preencher — confira se foram preenchidos à mão no papel.');
    if (tamanhoTotal > LIMITE_EMAIL) alertas.push('Os anexos somam ' + mb(tamanhoTotal) + '; alguns provedores recusam e-mails acima de 20 MB.');
    if (orfaos.length) alertas.push(orfaos.length + ' anexo(s) de documento que esta ficha não pede mais.');
    var comAviso = itens.filter(function (it) { return it.avisos.length; }).length;
    if (comAviso) alertas.push('Há fotos com aviso de qualidade: confira se estão legíveis.');

    return { ok: faltando.length === 0, itens: itens, faltando: faltando, alertas: alertas,
      orfaos: orfaos, tamanhoTotal: tamanhoTotal, total: lista.length };
  }

  function mb(bytes) {
    if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  }

  /* ------------------------------------------------------------------ */
  /* pacote para envio                                                   */
  /* ------------------------------------------------------------------ */
  /* Junta as fotos num único PDF (ficha assinada primeiro, depois cada
     documento na ordem da lista), uma página A4 por foto com o nome do
     documento no topo. PDFs anexados vão à parte, como estão. */
  function gerarPacote(lista, d) {
    d = d || St.todos();
    var ordem = {};
    S.requisitosAnexos(d).forEach(function (r, i) { ordem[r.k] = i; });
    var rotulos = {};
    S.requisitosAnexos(d).forEach(function (r) { rotulos[r.k] = r.rot; });
    var ordenada = lista.slice().sort(function (a, b) {
      var oa = a.tipo in ordem ? ordem[a.tipo] : 99, ob = b.tipo in ordem ? ordem[b.tipo] : 99;
      return oa - ob || a.criado - b.criado;
    });
    var fotos = ordenada.filter(function (a) { return a.mime !== 'application/pdf'; });
    var pdfs = ordenada.filter(function (a) { return a.mime === 'application/pdf'; });

    var contagem = {};
    fotos.forEach(function (a) { contagem[a.tipo] = (contagem[a.tipo] || 0) + 1; });
    var seq = {};

    return fotos.reduce(function (p, a) {
      return p.then(function (paginas) {
        return lerComo(a.blob, 'dataurl').then(abrirImagem).then(function (img) {
          seq[a.tipo] = (seq[a.tipo] || 0) + 1;
          var titulo = (rotulos[a.tipo] || 'Documento') +
            (contagem[a.tipo] > 1 ? ' — ' + seq[a.tipo] + ' de ' + contagem[a.tipo] : '');
          paginas.push(paginaA4(img, titulo));
          return paginas;
        });
      });
    }, Promise.resolve([])).then(function (paginas) {
      var pdf = paginas.length ? global.FichaPDF.gerar(paginas, {
        titulo: S.ficha.titulo + ' — documentos',
        autor: '',
        assunto: 'Ficha assinada e documentos'
      }) : null;
      return { pdf: pdf, pdfsAvulsos: pdfs, paginas: paginas.length };
    });
  }

  /* Página A4 (150 dpi) com o título do documento e a foto centralizada. */
  function paginaA4(img, titulo) {
    var L = 1240, A = 1754, M = 60, TOPO = 110;
    var cv = document.createElement('canvas');
    cv.width = L;
    cv.height = A;
    var g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, L, A);
    g.fillStyle = '#008082';
    g.font = 'bold 30px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillText(titulo, M, 70);
    g.fillRect(M, 88, L - 2 * M, 3);
    var r = Math.min((L - 2 * M) / img.width, (A - TOPO - M) / img.height);
    var w = img.width * r, h = img.height * r;
    g.drawImage(img, (L - w) / 2, TOPO + (A - TOPO - M - h) / 2, w, h);
    return { dataUrl: cv.toDataURL('image/jpeg', 0.85), largura: L, altura: A };
  }

  /* ------------------------------------------------------------------ */
  /* pacote compactado (ZIP)                                             */
  /* ------------------------------------------------------------------ */
  /* "Proposta de Filiação — Menor de idade" → "proposta-de-filiacao-menor-de-idade" */
  function slug(txt) {
    return String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  /* Slug de até 50 caracteres, cortado entre palavras. */
  function nomeCurto(txt) {
    var s = slug(txt);
    if (s.length <= 50) return s;
    s = s.slice(0, 51);
    return s.slice(0, s.lastIndexOf('-') > 20 ? s.lastIndexOf('-') : 50);
  }

  /* Nome do ZIP: tipo da ficha + sufixo do titular (ver FichaSchema.sufixoArquivo). */
  function nomeZip(d) {
    d = d || St.todos();
    var nome = S.sufixoArquivo(d);
    return slug(S.ficha.titulo + ' ' + S.ficha.publico) + (nome ? '-' + nome : '') + '.zip';
  }

  var TABELA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* Deflate do próprio navegador; onde não houver, o arquivo vai sem compressão. */
  function comprimir(bytes) {
    if (typeof global.CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var cs = new global.CompressionStream('deflate-raw');
      return new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); }, function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function dataDOS(dt) {
    return {
      hora: (dt.getHours() << 11) | (dt.getMinutes() << 5) | Math.floor(dt.getSeconds() / 2),
      data: ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate()
    };
  }

  /* Monta o ZIP (formato PKZIP 2.0, nomes UTF-8) a partir de [{ nome, bytes }]. */
  function montarZip(entradas) {
    var quando = dataDOS(new Date());
    var utf8 = new TextEncoder();
    return entradas.reduce(function (p, e) {
      return p.then(function (prontas) {
        return comprimir(e.bytes).then(function (comp) {
          // JPEG e PDF já vêm comprimidos: só usa deflate quando de fato reduz
          var usa = comp && comp.length < e.bytes.length;
          prontas.push({ nome: utf8.encode(e.nome), crc: crc32(e.bytes), tam: e.bytes.length,
            dados: usa ? comp : e.bytes, metodo: usa ? 8 : 0 });
          return prontas;
        });
      });
    }, Promise.resolve([])).then(function (prontas) {
      var partes = [], central = [], pos = 0;
      prontas.forEach(function (e) {
        var lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);
        lh.setUint16(6, 0x0800, true);            // nomes em UTF-8
        lh.setUint16(8, e.metodo, true);
        lh.setUint16(10, quando.hora, true);
        lh.setUint16(12, quando.data, true);
        lh.setUint32(14, e.crc, true);
        lh.setUint32(18, e.dados.length, true);
        lh.setUint32(22, e.tam, true);
        lh.setUint16(26, e.nome.length, true);
        lh.setUint16(28, 0, true);
        partes.push(new Uint8Array(lh.buffer), e.nome, e.dados);

        var ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, 0x0800, true);
        ch.setUint16(10, e.metodo, true);
        ch.setUint16(12, quando.hora, true);
        ch.setUint16(14, quando.data, true);
        ch.setUint32(16, e.crc, true);
        ch.setUint32(20, e.dados.length, true);
        ch.setUint32(24, e.tam, true);
        ch.setUint16(28, e.nome.length, true);
        ch.setUint32(42, pos, true);
        central.push(new Uint8Array(ch.buffer), e.nome);
        pos += 30 + e.nome.length + e.dados.length;
      });
      var tamCentral = 0;
      central.forEach(function (c) { tamCentral += c.length; });
      var fim = new DataView(new ArrayBuffer(22));
      fim.setUint32(0, 0x06054b50, true);
      fim.setUint16(8, prontas.length, true);
      fim.setUint16(10, prontas.length, true);
      fim.setUint32(12, tamCentral, true);
      fim.setUint32(16, pos, true);
      return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]), { type: 'application/zip' });
    });
  }

  /* ZIP com os arquivos originais, na ordem da lista de documentos e com nomes
     legíveis: "01-ficha-assinada-1.jpg", "03-copia-de-rg-e-cpf-2.pdf"... */
  function gerarZip(lista, d) {
    d = d || St.todos();
    var reqs = S.requisitosAnexos(d), ordem = {}, rotulos = {};
    reqs.forEach(function (r, i) { ordem[r.k] = i; rotulos[r.k] = r.rot; });
    var ordenada = lista.slice().sort(function (a, b) {
      var oa = a.tipo in ordem ? ordem[a.tipo] : 99, ob = b.tipo in ordem ? ordem[b.tipo] : 99;
      return oa - ob || a.criado - b.criado;
    });
    // número de cada documento presente, em sequência (01, 02…), sem buracos dos ausentes
    var numero = {}, n = 0;
    ordenada.forEach(function (a) { if (!(a.tipo in numero)) numero[a.tipo] = ++n; });
    var seq = {};
    return ordenada.reduce(function (p, a) {
      return p.then(function (entradas) {
        return lerComo(a.blob, 'buffer').then(function (buf) {
          seq[a.tipo] = (seq[a.tipo] || 0) + 1;
          var num = ('0' + numero[a.tipo]).slice(-2);
          var ext = a.mime === 'application/pdf' ? 'pdf' : 'jpg';
          entradas.push({ nome: num + '-' + nomeCurto(rotulos[a.tipo] || 'documento') + '-' + seq[a.tipo] + '.' + ext,
            bytes: new Uint8Array(buf) });
          return entradas;
        });
      });
    }, Promise.resolve([])).then(montarZip).then(function (blob) {
      return { blob: blob, nome: nomeZip(d), arquivos: ordenada.length };
    });
  }

  global.FichaAnexos = {
    listar: listar,
    adicionar: adicionar,
    remover: remover,
    mudarTipo: mudarTipo,
    limpar: limpar,
    limparTudo: limparTudo,
    validar: validar,
    gerarPacote: gerarPacote,
    gerarZip: gerarZip,
    nomeZip: nomeZip,
    mb: mb,
    soMemoria: function () { return soMemoria; }
  };
})(window);
