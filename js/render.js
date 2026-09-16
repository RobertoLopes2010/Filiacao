/* Desenha a ficha de filiação em canvas, no formato A4 retrato.
   O mesmo desenho alimenta a pré-visualização, o JPG e o PDF — garantindo WYSIWYG. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var St = global.FichaState;

  var PAG_L = 595.28;   // largura A4 em pontos
  var PAG_A = 841.89;   // altura A4 em pontos
  var MARGEM = 34;

  var COR = {
    teal: '#008082',
    tealClaro: '#E6F2F2',
    branco: '#FFFFFF',
    tinta: '#10231F',
    suave: '#5B6B6A',
    linha: '#B9C7C6',
    pendFundo: '#FFF3D6',
    pendBorda: '#E0A400'
  };

  var FONTE = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  /* ------------------------------------------------------------------ */
  /* utilidades de desenho                                               */
  /* ------------------------------------------------------------------ */
  function fonte(g, tam, peso) {
    g.font = (peso || '') + ' ' + tam + 'px ' + FONTE;
  }

  function texto(g, str, x, y, op) {
    op = op || {};
    fonte(g, op.tam || 9, op.peso || '');
    g.fillStyle = op.cor || COR.tinta;
    g.textAlign = op.alinha || 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(String(str == null ? '' : str), x, y);
    g.textAlign = 'left';
  }

  function quebra(g, str, larg, tam, peso) {
    fonte(g, tam, peso || '');
    var palavras = String(str || '').split(/\s+/);
    var linhas = [], atual = '';
    for (var i = 0; i < palavras.length; i++) {
      var teste = atual ? atual + ' ' + palavras[i] : palavras[i];
      if (g.measureText(teste).width > larg && atual) {
        linhas.push(atual);
        atual = palavras[i];
      } else {
        atual = teste;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  function paragrafo(g, str, x, y, larg, tam, alturaLinha, op) {
    op = op || {};
    var linhas = quebra(g, str, larg, tam, op.peso);
    for (var i = 0; i < linhas.length; i++) {
      texto(g, linhas[i], x, y + i * alturaLinha, { tam: tam, cor: op.cor, peso: op.peso, alinha: op.alinha });
    }
    return y + linhas.length * alturaLinha;
  }

  function linha(g, x1, y1, x2, y2, cor, esp) {
    g.strokeStyle = cor || COR.linha;
    g.lineWidth = esp || 0.6;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  function retangulo(g, x, y, w, h, op) {
    op = op || {};
    if (op.preenche) { g.fillStyle = op.preenche; g.fillRect(x, y, w, h); }
    if (op.borda) {
      g.strokeStyle = op.borda;
      g.lineWidth = op.esp || 0.6;
      g.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
    }
  }

  function caixa(g, x, y, marcada, tam) {
    tam = tam || 8.5;
    retangulo(g, x, y, tam, tam, { borda: marcada ? COR.teal : COR.linha, preenche: marcada ? COR.teal : COR.branco, esp: 0.8 });
    if (marcada) {
      g.strokeStyle = COR.branco;
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x + tam * 0.22, y + tam * 0.52);
      g.lineTo(x + tam * 0.43, y + tam * 0.74);
      g.lineTo(x + tam * 0.80, y + tam * 0.26);
      g.stroke();
    }
    return tam;
  }

  function opcaoCaixa(g, x, y, marcada, rotulo) {
    var t = caixa(g, x, y - 7, marcada);
    texto(g, rotulo, x + t + 4, y, { tam: 8.5, cor: marcada ? COR.tinta : COR.suave, peso: marcada ? 'bold' : '' });
    fonte(g, 8.5, marcada ? 'bold' : '');
    return x + t + 4 + g.measureText(rotulo).width;
  }

  /* Campo com rótulo acima e valor sobre linha-guia. */
  function campo(g, x, y, larg, rotulo, valor, op) {
    op = op || {};
    var vazio = valor === undefined || valor === null || String(valor).trim() === '';
    if (op.destaque && vazio) {
      retangulo(g, x - 2, y - 2, larg + 4, 24, { preenche: COR.pendFundo });
    }
    texto(g, rotulo, x, y + 6, { tam: 6.5, cor: COR.suave, peso: 'bold' });
    var base = y + 18;
    if (!vazio) {
      var tam = op.tam || 9.5;
      fonte(g, tam, 'bold');
      var str = String(valor);
      while (g.measureText(str).width > larg - 2 && tam > 6) {
        tam -= 0.4;
        fonte(g, tam, 'bold');
      }
      texto(g, str, x, base - 2.5, { tam: tam, peso: 'bold' });
    }
    linha(g, x, base, x + larg, base, op.destaque && vazio ? COR.pendBorda : COR.linha, op.destaque && vazio ? 0.9 : 0.6);
    return y + 26;
  }

  /* Título de seção com faixa. */
  function secao(g, x, y, larg, titulo) {
    retangulo(g, x, y, larg, 15, { preenche: COR.teal });
    texto(g, titulo.toUpperCase(), x + 6, y + 10.5, { tam: 8, peso: 'bold', cor: COR.branco });
    return y + 15 + 9;
  }

  /* ------------------------------------------------------------------ */
  /* cabeçalho                                                           */
  /* ------------------------------------------------------------------ */
  function cabecalho(g, pagina) {
    var alt = pagina === 1 ? 62 : 40;
    retangulo(g, 0, 0, PAG_L, alt, { preenche: COR.teal });

    // marca
    g.save();
    g.translate(MARGEM, pagina === 1 ? 18 : 11);
    g.fillStyle = COR.branco;
    fonte(g, pagina === 1 ? 17 : 13, 'bold');
    g.fillText('ABRAMUS', 0, pagina === 1 ? 14 : 11);
    var w = g.measureText('ABRAMUS').width;
    fonte(g, pagina === 1 ? 11 : 9, '');
    g.globalAlpha = 0.85;
    g.fillText(' · Música', w, pagina === 1 ? 14 : 11);
    g.restore();

    if (pagina === 1) {
      texto(g, 'PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA', MARGEM, 48, { tam: 10, peso: 'bold', cor: COR.branco });
      texto(g, 'Página 1 de 2', PAG_L - MARGEM, 48, { tam: 8, cor: 'rgba(255,255,255,.8)', alinha: 'right' });
    } else {
      texto(g, 'PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA', PAG_L - MARGEM, 25, { tam: 8.5, peso: 'bold', cor: 'rgba(255,255,255,.9)', alinha: 'right' });
      texto(g, 'Página 2 de 2', PAG_L - MARGEM, 35, { tam: 7.5, cor: 'rgba(255,255,255,.75)', alinha: 'right' });
    }
    return alt + 16;
  }

  function rodape(g, pagina) {
    linha(g, MARGEM, PAG_A - 30, PAG_L - MARGEM, PAG_A - 30, COR.linha);
    texto(g, 'ABRAMUS — Associação Brasileira de Música e Artes · filiacaoonline@abramus.org.br',
      MARGEM, PAG_A - 19, { tam: 6.8, cor: COR.suave });
    texto(g, pagina + '/2', PAG_L - MARGEM, PAG_A - 19, { tam: 6.8, cor: COR.suave, alinha: 'right' });
  }

  /* ------------------------------------------------------------------ */
  /* página 1                                                            */
  /* ------------------------------------------------------------------ */
  function pagina1(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 1);

    // --- foto 3x4 à direita ---
    var fotoL = 78, fotoA = 104;
    var fotoX = PAG_L - MARGEM - fotoL, fotoY = y;
    if (imgs.foto) {
      g.save();
      g.beginPath();
      g.rect(fotoX, fotoY, fotoL, fotoA);
      g.clip();
      var ar = imgs.foto.width / imgs.foto.height, arAlvo = fotoL / fotoA, dw, dh;
      if (ar > arAlvo) { dh = fotoA; dw = dh * ar; } else { dw = fotoL; dh = dw / ar; }
      g.drawImage(imgs.foto, fotoX + (fotoL - dw) / 2, fotoY + (fotoA - dh) / 2, dw, dh);
      g.restore();
      retangulo(g, fotoX, fotoY, fotoL, fotoA, { borda: COR.teal, esp: 1 });
    } else {
      retangulo(g, fotoX, fotoY, fotoL, fotoA, { borda: COR.linha, preenche: '#F7FAFA' });
      texto(g, 'FOTO', fotoX + fotoL / 2, fotoY + fotoA / 2 - 2, { tam: 9, peso: 'bold', cor: COR.suave, alinha: 'center' });
      texto(g, '3 x 4', fotoX + fotoL / 2, fotoY + fotoA / 2 + 10, { tam: 8, cor: COR.suave, alinha: 'center' });
    }

    // --- categorias / território ---
    var colL = larg - fotoL - 16;
    var y0 = secao(g, x, y, colL, 'Categorias e território de representação');

    var pendCat = destaque && St.categoriasSelecionadas().length === 0;
    if (pendCat) retangulo(g, x - 2, y0 - 9, colL + 4, 5 * 22 + 6, { preenche: COR.pendFundo });

    S.CATEGORIAS.forEach(function (c, i) {
      var ly = y0 + i * 22;
      var marcada = d['cat_' + c.k] === true;
      caixa(g, x, ly, marcada, 9);
      texto(g, c.rot, x + 14, ly + 7.5, { tam: 8.5, peso: marcada ? 'bold' : '', cor: marcada ? COR.tinta : COR.suave });

      var tx = x + 132;
      var ter = d['ter_' + c.k];
      S.TERRITORIOS.forEach(function (t) {
        var sel = marcada && ter === t.v;
        tx = opcaoCaixa(g, tx, ly + 7.5, sel, t.rot) + 10;
      });
      if (marcada && ter === 'outros') {
        var rot = d['terout_' + c.k] || '';
        linha(g, tx, ly + 9, x + colL, ly + 9, COR.linha);
        texto(g, rot, tx + 2, ly + 7.5, { tam: 8, peso: 'bold' });
      }
      linha(g, x, ly + 15, x + colL, ly + 15, '#EAF0F0', 0.5);
    });

    y = Math.max(y0 + 5 * 22 + 6, fotoY + fotoA + 10);

    // --- dados cadastrais ---
    y = secao(g, x, y, larg, 'Dados cadastrais');
    var c2 = (larg - 12) / 2, c3 = (larg - 24) / 3;

    y = campo(g, x, y, larg, 'NOME', d.nome, { destaque: destaque, tam: 11 });
    var yl = y;
    campo(g, x, yl, c3, 'DATA DE NASCIMENTO', d.nascimento, { destaque: destaque });
    campo(g, x + c3 + 12, yl, c3, 'RG', d.rg, { destaque: destaque });
    y = campo(g, x + (c3 + 12) * 2, yl, c3, 'ÓRGÃO EXPEDIDOR', d.rg_orgao, { destaque: destaque });

    yl = y;
    campo(g, x, yl, c2, 'CPF', d.cpf, { destaque: destaque });
    y = campo(g, x + c2 + 12, yl, c2, 'PSEUDÔNIMO', d.pseudonimo, {});

    yl = y;
    campo(g, x, yl, c2, 'NOME DE BANDA', d.banda, {});
    y = campo(g, x + c2 + 12, yl, c2, 'CENTRO DE CUSTO', d.centro_custo, { destaque: destaque });

    y = campo(g, x, y, larg, 'OUTROS PSEUDÔNIMOS', d.outros_pseudonimos, {});

    // --- declaração ---
    y += 6;
    retangulo(g, x, y, larg, 52, { preenche: COR.tealClaro });
    var txtDecl = 'Em razão de não pertencer a entidade congênere, de acordo com art. 97, § 1º da lei nº 9610/98, venho solicitar admissão ao quadro social da ASSOCIAÇÃO BRASILEIRA DE MÚSICA E ARTES — ABRAMUS.';
    var fim = paragrafo(g, txtDecl, x + 10, y + 16, larg - 20, 8.5, 11);
    texto(g, 'Nestes termos, pede deferimento.', x + 10, fim + 6, { tam: 8.5, peso: 'bold' });
    y += 52 + 16;

    // --- local e data ---
    var local = d.local_assinatura || '';
    var dataStr = '';
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.data_assinatura || '');
    if (m) dataStr = parseInt(m[1], 10) + ' de ' + MESES[parseInt(m[2], 10) - 1] + ' de ' + m[3];
    var linhaLocal = (local || '__________') + ', ' + (dataStr || '______ de ____________ de ______');
    var pendLocal = destaque && (!local || !dataStr);
    if (pendLocal) retangulo(g, x - 2, y - 10, larg + 4, 18, { preenche: COR.pendFundo });
    texto(g, linhaLocal, x, y + 2, { tam: 9.5, peso: 'bold', cor: (local && dataStr) ? COR.tinta : COR.suave });
    y += 26;

    // --- assinatura ---
    var assL = 260, assX = x + (larg - assL) / 2;
    if (imgs.assinatura) {
      var arA = imgs.assinatura.width / imgs.assinatura.height;
      var ah = Math.min(44, assL / arA), aw = ah * arA;
      g.drawImage(imgs.assinatura, assX + (assL - aw) / 2, y - 2, aw, ah);
      y += Math.max(ah, 30);
    } else {
      y += 30;
    }
    linha(g, assX, y, assX + assL, y, COR.tinta, 0.8);
    texto(g, (d.nome || '').toUpperCase(), x + larg / 2, y + 12, { tam: 9, peso: 'bold', alinha: 'center' });
    texto(g, 'Assinar conforme documento de identificação apresentado', x + larg / 2, y + 22,
      { tam: 7, cor: COR.suave, alinha: 'center' });
    y += 36;

    // --- uso exclusivo ABRAMUS ---
    var boxY = PAG_A - 30 - 96;
    if (y < boxY) y = boxY;
    retangulo(g, x, y, larg, 90, { borda: COR.linha, preenche: '#F7FAFA' });
    texto(g, 'PREENCHIMENTO EXCLUSIVO DA ABRAMUS (não preencher)', x + 10, y + 15,
      { tam: 7.5, peso: 'bold', cor: COR.suave });
    var bx = x + 10, by = y + 24, bw = (larg - 20 - 24) / 3;
    var codigos = [['Código ABRAMUS', 0, 0], ['Código ECAD', 1, 0], ['Código CAE/PI', 2, 0],
                   ['Código IFPI', 0, 1], ['Código HD', 1, 1], ['Código para associar', 2, 1]];
    codigos.forEach(function (cd) {
      campo(g, bx + cd[1] * (bw + 12), by + cd[2] * 30, bw, cd[0].toUpperCase(), '', {});
    });

    rodape(g, 1);
  }

  /* ------------------------------------------------------------------ */
  /* página 2                                                            */
  /* ------------------------------------------------------------------ */
  function pagina2(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 2);
    var c2 = (larg - 12) / 2, c3 = (larg - 24) / 3;

    y = secao(g, x, y, larg, 'Dados cadastrais');
    y = campo(g, x, y, larg, 'NOME', d.nome, { destaque: destaque, tam: 11 });

    var yl = y;
    campo(g, x, yl, c3, 'RG', d.rg, { destaque: destaque });
    campo(g, x + c3 + 12, yl, c3, 'ÓRGÃO EXPEDIDOR', d.rg_orgao, { destaque: destaque });
    // sexo
    var sx = x + (c3 + 12) * 2;
    if (destaque && !d.sexo) retangulo(g, sx - 2, yl - 2, c3 + 4, 24, { preenche: COR.pendFundo });
    texto(g, 'SEXO', sx, yl + 6, { tam: 6.5, cor: COR.suave, peso: 'bold' });
    var px = opcaoCaixa(g, sx, yl + 17, d.sexo === 'Masculino', 'Masculino') + 12;
    opcaoCaixa(g, px, yl + 17, d.sexo === 'Feminino', 'Feminino');
    y = yl + 26;

    yl = y;
    campo(g, x, yl, c2, 'NACIONALIDADE', d.nacionalidade, { destaque: destaque });
    y = campo(g, x + c2 + 12, yl, c2, 'NATURALIDADE', d.naturalidade, { destaque: destaque });

    y = campo(g, x, y, larg, 'NOME DO PAI', d.pai, {});
    y = campo(g, x, y, larg, 'NOME DA MÃE', d.mae, { destaque: destaque });

    yl = y;
    campo(g, x, yl, c2, 'ESTADO CIVIL', d.estado_civil, { destaque: destaque });
    var precisaConjuge = d.estado_civil === 'Casado(a)' || d.estado_civil === 'União estável';
    y = campo(g, x + c2 + 12, yl, c2, 'NOME DO CÔNJUGE', d.conjuge, { destaque: destaque && precisaConjuge });

    y += 6;
    y = secao(g, x, y, larg, 'Endereço e contato');

    y = campo(g, x, y, larg, 'ENDEREÇO', d.endereco, { destaque: destaque });

    yl = y;
    campo(g, x, yl, c3, 'Nº', d.numero, { destaque: destaque });
    campo(g, x + c3 + 12, yl, c3, 'COMPLEMENTO', d.complemento, {});
    y = campo(g, x + (c3 + 12) * 2, yl, c3, 'CEP', d.cep, { destaque: destaque });

    yl = y;
    campo(g, x, yl, c3, 'BAIRRO', d.bairro, { destaque: destaque });
    campo(g, x + c3 + 12, yl, c3, 'CIDADE', d.cidade, { destaque: destaque });
    y = campo(g, x + (c3 + 12) * 2, yl, c3, 'UF', d.uf, { destaque: destaque });

    yl = y;
    campo(g, x, yl, c3, 'TELEFONE', d.tel, {});
    campo(g, x + c3 + 12, yl, c3, 'CELULAR', d.cel, { destaque: destaque });
    y = campo(g, x + (c3 + 12) * 2, yl, c3, 'Nº OMB', d.omb, {});

    yl = y;
    campo(g, x, yl, c2, 'E-MAIL', d.email, { destaque: destaque });
    y = campo(g, x + c2 + 12, yl, c2, 'SITE', d.site, {});

    // --- pagamento ---
    y += 6;
    y = secao(g, x, y, larg, 'Dados para pagamento');
    texto(g, 'Para quem não possui conta bancária.', x, y + 2, { tam: 8, cor: COR.suave });
    y += 16;

    if (destaque && !d.guiche) retangulo(g, x - 2, y - 10, larg + 4, 22, { preenche: COR.pendFundo });
    texto(g, 'Guichê de sociedade:', x, y + 2, { tam: 8.5, peso: 'bold' });
    var gx = x + 96;
    ['SP', 'RJ', 'BA', 'PE', 'PR', 'GO'].forEach(function (gg) {
      gx = opcaoCaixa(g, gx, y + 2, d.guiche === gg, gg) + 10;
    });
    gx = opcaoCaixa(g, gx, y + 2, d.guiche === 'Outro', 'Outro') + 6;
    if (d.guiche === 'Outro') {
      linha(g, gx, y + 4, x + larg, y + 4, COR.linha);
      texto(g, d.guiche_outro || '', gx + 2, y + 2, { tam: 8.5, peso: 'bold' });
    }
    y += 20;

    retangulo(g, x, y, larg, 26, { preenche: COR.tealClaro });
    paragrafo(g, 'QUEM DESEJA RECEBER EM CONTA BANCÁRIA DE TERCEIROS DEVE ENTRAR EM CONTATO COM A ASSOCIAÇÃO.',
      x + 10, y + 16, larg - 20, 8, 10, { peso: 'bold', cor: COR.teal });
    y += 26 + 14;

    // --- documentos ---
    y = secao(g, x, y, larg, 'Documentos a enviar para filiacaoonline@abramus.org.br');
    S.DOCUMENTOS.forEach(function (doc) {
      var marcada = d[doc.k] === true;
      caixa(g, x, y - 1, marcada, 9);
      texto(g, doc.rot, x + 14, y + 6.5, { tam: 8.5, peso: marcada ? 'bold' : '', cor: marcada ? COR.tinta : COR.suave });
      if (doc.obs) {
        fonte(g, 8.5, marcada ? 'bold' : '');
        texto(g, doc.obs, x + 14 + g.measureText(doc.rot).width + 6, y + 6.5, { tam: 7, cor: COR.suave });
      }
      y += 18;
    });

    rodape(g, 2);
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */
  function carregaImagem(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function desenhaPagina(numero, d, imgs, opts) {
    var escala = opts.escala || 2.5;
    var cv = document.createElement('canvas');
    cv.width = Math.round(PAG_L * escala);
    cv.height = Math.round(PAG_A * escala);
    var g = cv.getContext('2d');
    g.fillStyle = COR.branco;
    g.fillRect(0, 0, cv.width, cv.height);
    g.scale(escala, escala);
    g.textBaseline = 'alphabetic';
    if (numero === 1) pagina1(g, d, imgs, opts.destaque);
    else pagina2(g, d, imgs, opts.destaque);
    return cv;
  }

  /* Devolve Promise<[canvasPag1, canvasPag2]>. */
  function paginas(dados, opts) {
    opts = opts || {};
    return Promise.all([carregaImagem(dados.foto), carregaImagem(dados.assinatura)])
      .then(function (res) {
        var imgs = { foto: res[0], assinatura: res[1] };
        return [desenhaPagina(1, dados, imgs, opts), desenhaPagina(2, dados, imgs, opts)];
      });
  }

  global.FichaRender = {
    paginas: paginas,
    PAG_L: PAG_L,
    PAG_A: PAG_A,
    COR: COR
  };
})(window);
