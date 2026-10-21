/* Desenha a ficha ativa (uma das propostas de filiação, o desligamento ou a declaração de residência) em canvas, no formato A4 retrato.
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
  // nº de páginas da ficha sendo desenhada e, no herdeiro com vários herdeiros,
  // de quem é a ficha ({ n, total }) — cabeçalho e rodapé leem os dois
  var totalPaginas = 1;
  var fichaDe = null;
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

  /* Campo de múltipla escolha: rótulo acima e caixas lado a lado. */
  function campoOpcoes(g, x, y, larg, rotulo, opcoes, valor, op) {
    op = op || {};
    if (op.destaque && !valor) retangulo(g, x - 2, y - 2, larg + 4, 24, { preenche: COR.pendFundo });
    texto(g, rotulo, x, y + 6, { tam: 6.5, cor: COR.suave, peso: 'bold' });
    var px = x;
    opcoes.forEach(function (o) {
      px = opcaoCaixa(g, px, y + 17, valor === o, o) + (op.espaco || 10);
    });
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
  function cabecalho(g, pagina, imgs) {
    var titulo = S.ficha.tituloFicha, total = totalPaginas;
    // ficha de um dos vários herdeiros: "Herdeiro 2 — NOME" abaixo do título
    var deQuem = fichaDe ? 'Herdeiro ' + fichaDe.n + (fichaDe.nome ? ' — ' + String(fichaDe.nome).toUpperCase() : '') : '';
    var alt = pagina === 1 ? (deQuem ? 74 : 62) : (deQuem ? 52 : 40);
    retangulo(g, 0, 0, PAG_L, alt, { preenche: COR.teal });

    // logo branco no canto superior direito; os textos da direita se alinham à esquerda dele
    var dir = PAG_L - MARGEM;
    if (imgs && imgs.logo) {
      var la = pagina === 1 ? 46 : 30;
      var ll = la * imgs.logo.width / imgs.logo.height;
      g.drawImage(imgs.logo, dir - ll, (alt - la) / 2, ll, la);
      dir -= ll + 14;
    }

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
      // títulos longos (menor, herdeiro) encolhem para não invadir "Página 1 de N"
      fonte(g, 8, '');
      var maxTit = dir - g.measureText('Página 1 de ' + total).width - 12 - MARGEM, tamTit = 10;
      fonte(g, tamTit, 'bold');
      while (g.measureText(titulo).width > maxTit && tamTit > 7) { tamTit -= 0.25; fonte(g, tamTit, 'bold'); }
      texto(g, titulo, MARGEM, 48, { tam: tamTit, peso: 'bold', cor: COR.branco });
      texto(g, 'Página 1 de ' + total, dir, 48, { tam: 8, cor: 'rgba(255,255,255,.8)', alinha: 'right' });
      if (deQuem) texto(g, ajustar(g, deQuem, dir - MARGEM, 9.5), MARGEM, 63, { tam: 9.5, peso: 'bold', cor: '#BFF3EC' });
    } else if (deQuem) {
      texto(g, titulo, dir, 22, { tam: 8.5, peso: 'bold', cor: 'rgba(255,255,255,.9)', alinha: 'right' });
      texto(g, ajustar(g, deQuem, dir - MARGEM - 60, 8.5), dir, 33, { tam: 8.5, peso: 'bold', cor: '#BFF3EC', alinha: 'right' });
      texto(g, 'Página ' + pagina + ' de ' + total, dir, 44, { tam: 7.5, cor: 'rgba(255,255,255,.75)', alinha: 'right' });
    } else {
      texto(g, titulo, dir, 25, { tam: 8.5, peso: 'bold', cor: 'rgba(255,255,255,.9)', alinha: 'right' });
      texto(g, 'Página ' + pagina + ' de ' + total, dir, 35, { tam: 7.5, cor: 'rgba(255,255,255,.75)', alinha: 'right' });
    }
    return alt + 16;
  }

  /* Corta o texto com "…" para caber na largura (nomes muito longos no cabeçalho). */
  function ajustar(g, str, larg, tam) {
    fonte(g, tam, 'bold');
    if (g.measureText(str).width <= larg) return str;
    while (str.length > 1 && g.measureText(str + '…').width > larg) str = str.slice(0, -1);
    return str + '…';
  }

  function rodape(g, pagina) {
    linha(g, MARGEM, PAG_A - 30, PAG_L - MARGEM, PAG_A - 30, COR.linha);
    texto(g, 'ABRAMUS — Associação Brasileira de Música e Artes · filiacaoonline@abramus.org.br',
      MARGEM, PAG_A - 19, { tam: 6.8, cor: COR.suave });
    texto(g, (fichaDe ? 'Herdeiro ' + fichaDe.n + ' · ' : '') + pagina + '/' + totalPaginas,
      PAG_L - MARGEM, PAG_A - 19, { tam: 6.8, cor: COR.suave, alinha: 'right' });
  }

  /* "1 de março de 2026" a partir de DD/MM/AAAA; [dia, mês, ano] com partes=true. */
  function dataExtenso(v, partes) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || '');
    if (!m) return partes ? ['', '', ''] : '';
    var p = [String(parseInt(m[1], 10)), MESES[parseInt(m[2], 10) - 1], m[3]];
    return partes ? p : p.join(' de ');
  }

  /* ------------------------------------------------------------------ */
  /* blocos comuns às propostas de filiação                              */
  /* ------------------------------------------------------------------ */
  /* Campos lado a lado numa linha. Cada item: { r: rótulo, v: valor,
     d: destaque, p: peso da largura (1), tam, opcoes (vira campoOpcoes) }. */
  function linhaCampos(g, x, y, larg, itens) {
    var soma = 0;
    itens.forEach(function (it) { soma += it.p || 1; });
    var util = larg - 12 * (itens.length - 1);
    var px = x, fim = y;
    itens.forEach(function (it) {
      var w = util * (it.p || 1) / soma;
      fim = it.opcoes
        ? campoOpcoes(g, px, y, w, it.r, it.opcoes, it.v, { destaque: it.d, espaco: 8 })
        : campo(g, px, y, w, it.r, it.v, { destaque: it.d, tam: it.tam });
      px += w + 12;
    });
    return fim;
  }

  /* Categorias da ficha ativa, cada uma com seu território. */
  function blocoCategorias(g, d, x, y, colL, destaque) {
    var cats = S.CATEGORIAS;
    var y0 = secao(g, x, y, colL, 'Categorias e território de representação');

    if (destaque && St.categoriasSelecionadas().length === 0) {
      retangulo(g, x - 2, y0 - 9, colL + 4, cats.length * 22 + 6, { preenche: COR.pendFundo });
    }

    cats.forEach(function (c, i) {
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
    return y0 + cats.length * 22 + 6;
  }

  var DECLARACAO = 'Em razão de não pertencer a entidade congênere, de acordo com art. 97, § 1º da lei nº 9610/98, ' +
    'venho solicitar admissão ao quadro social da ASSOCIAÇÃO BRASILEIRA DE MÚSICA E ARTES — ABRAMUS.';

  function declaracaoHerdeiro(d) {
    return 'Eu, ' + (d.nome || '______________________________') + ', na qualidade de herdeiro / sucessor dos direitos ' +
      'autorais do titular supracitado, por transferência de direitos operada em virtude de documentação anexada a esta ' +
      'proposta, e em razão de não pertencer à entidade congênere, de acordo com o art. 97, § 1º da lei nº 9610/98, ' +
      'venho solicitar admissão ao quadro social da ASSOCIAÇÃO BRASILEIRA DE MÚSICA E ARTES — ABRAMUS.';
  }

  /* Faixa clara com a declaração e "Nestes termos..."; cresce com o texto. */
  function declaracao(g, x, y, larg, txt) {
    var alt = quebra(g, txt, larg - 20, 8.5).length * 11 + 30;
    retangulo(g, x, y, larg, alt, { preenche: COR.tealClaro });
    var fim = paragrafo(g, txt, x + 10, y + 16, larg - 20, 8.5, 11);
    texto(g, 'Nestes termos, pede deferimento.', x + 10, fim + 6, { tam: 8.5, peso: 'bold' });
    return y + alt + 16;
  }

  function localData(g, d, x, y, larg, destaque) {
    var local = d.local_assinatura || '';
    var dataStr = dataExtenso(d.data_assinatura);
    var linhaLocal = (local || '__________') + ', ' + (dataStr || '______ de ____________ de ______');
    if (destaque && (!local || !dataStr)) retangulo(g, x - 2, y - 10, larg + 4, 18, { preenche: COR.pendFundo });
    texto(g, linhaLocal, x, y + 2, { tam: 9.5, peso: 'bold', cor: (local && dataStr) ? COR.tinta : COR.suave });
    return y + 26;
  }

  /* Linha de assinatura (à mão, na ficha impressa) com o nome de quem assina abaixo. */
  function linhaAssinatura(g, imgs, x, y, larg, nome) {
    var assL = 260, assX = x + (larg - assL) / 2;
    y += 30;
    linha(g, assX, y, assX + assL, y, COR.tinta, 0.8);
    texto(g, (nome || '').toUpperCase(), x + larg / 2, y + 12, { tam: 9, peso: 'bold', alinha: 'center' });
    return y + 36;
  }

  /* "Dados do responsável legal" da página 1 (menor e pessoa jurídica). */
  function responsavelLegal(g, d, x, y, larg, destaque) {
    texto(g, 'Dados do responsável legal:', x, y + 6, { tam: 7.5, peso: 'bold', cor: COR.teal });
    return linhaCampos(g, x, y + 10, larg, [
      { r: 'NOME', v: d.resp_nome, d: destaque, p: 2 },
      { r: 'CPF', v: d.resp_cpf, d: destaque }
    ]);
  }

  function usoExclusivo(g, x, y, larg) {
    var boxY = PAG_A - 30 - 126;
    if (y < boxY) y = boxY;
    retangulo(g, x, y, larg, 120, { borda: COR.linha, preenche: '#F7FAFA' });
    texto(g, 'PREENCHIMENTO EXCLUSIVO DA ABRAMUS (não preencher)', x + 10, y + 15,
      { tam: 7.5, peso: 'bold', cor: COR.suave });
    var bx = x + 10, by = y + 24, bw = (larg - 20 - 24) / 3;
    var codigos = [['Código ABRAMUS', 0, 0], ['Código ECAD', 1, 0], ['Código CAE/PI', 2, 0],
                   ['Código IFPI', 0, 1], ['Código HD', 1, 1], ['Código para associar', 2, 1]];
    codigos.forEach(function (cd) {
      campo(g, bx + cd[1] * (bw + 12), by + cd[2] * 30, bw, cd[0].toUpperCase(), '', {});
    });
    campo(g, bx, by + 60, larg - 20, 'CENTRO DE CUSTO', '', {});
  }

  /* Nome, RG/órgão/sexo, nacionalidade/naturalidade, pais e estado civil (página 2).
     compacto: menos linhas, para a página do herdeiro, que tem também o falecido. */
  function dadosPessoais(g, d, x, y, larg, destaque, compacto) {
    y = campo(g, x, y, larg, 'NOME', d.nome, { destaque: destaque, tam: 11 });
    y = linhaCampos(g, x, y, larg, [
      { r: 'RG', v: d.rg, d: destaque },
      { r: 'ÓRGÃO EXPEDIDOR', v: d.rg_orgao, d: destaque },
      { r: 'SEXO', v: d.sexo, d: destaque, opcoes: ['Masculino', 'Feminino', 'Outro'] }
    ]);
    var precisaConjuge = d.estado_civil === 'Casado(a)' || d.estado_civil === 'União estável';
    var nac = { r: 'NACIONALIDADE', v: d.nacionalidade, d: destaque };
    var nat = { r: 'NATURALIDADE', v: d.naturalidade, d: destaque };
    var pai = { r: 'NOME DO PAI', v: d.pai };
    var mae = { r: 'NOME DA MÃE', v: d.mae, d: destaque };
    var civ = [{ r: 'ESTADO CIVIL', v: d.estado_civil, d: destaque },
               { r: 'NOME DO CÔNJUGE', v: d.conjuge, d: destaque && precisaConjuge }];
    if (compacto) {
      y = linhaCampos(g, x, y, larg, [nac, nat].concat(civ));
      return linhaCampos(g, x, y, larg, [pai, mae]);
    }
    y = linhaCampos(g, x, y, larg, [nac, nat]);
    y = linhaCampos(g, x, y, larg, [pai]);
    y = linhaCampos(g, x, y, larg, [mae]);
    return linhaCampos(g, x, y, larg, civ);
  }

  /* Endereço, número/complemento/CEP e bairro/cidade/UF. */
  function endereco(g, d, x, y, larg, destaque) {
    y = campo(g, x, y, larg, 'ENDEREÇO', d.endereco, { destaque: destaque });
    y = linhaCampos(g, x, y, larg, [
      { r: 'Nº', v: d.numero, d: destaque },
      { r: 'COMPLEMENTO', v: d.complemento },
      { r: 'CEP', v: d.cep, d: destaque }
    ]);
    return linhaCampos(g, x, y, larg, [
      { r: 'BAIRRO', v: d.bairro, d: destaque },
      { r: 'CIDADE', v: d.cidade, d: destaque },
      { r: 'UF', v: d.uf, d: destaque }
    ]);
  }

  /* "Dados para pagamento". cfg.formas: opções que a ficha oferece
     (conta, guiche, pj); cfg.tipoConta: pede tipo de conta e CPF do titular;
     cfg.cpfSempre: CPF do titular obrigatório mesmo em conta individual. */
  function blocoPagamento(g, d, x, y, larg, destaque, cfg) {
    y = secao(g, x, y, larg, 'Dados para pagamento (preencha apenas uma das opções)');
    var forma = d.forma_pagamento;
    // Só a opção escolhida é impressa: dados de outra opção, preenchidos antes de trocar, ficam de fora.
    function pg(f, k) { return forma === f ? d[k] : ''; }

    function subsecao(f, titulo) {
      if (destaque && !forma) retangulo(g, x - 2, y - 9, larg + 4, 14, { preenche: COR.pendFundo });
      opcaoCaixa(g, x, y + 2, forma === f, titulo);
      return y + 10;
    }
    function divisa() {
      linha(g, x, y, x + larg, y, '#EAF0F0', 0.5);
      return y + 12;
    }

    // para quem possui conta bancária
    var dc = destaque && forma === 'conta';
    var numOk = !!(d.conta_numero && d.conta_modalidade);
    var corrente = { r: 'Nº C/CORRENTE', v: pg('conta', 'conta_modalidade') === 'Corrente' ? d.conta_numero : '', d: dc && !numOk };
    var poupanca = { r: 'Nº C/POUPANÇA', v: pg('conta', 'conta_modalidade') === 'Poupança' ? d.conta_numero : '', d: dc && !numOk };
    y = subsecao('conta', 'Para quem possui conta bancária');
    if (cfg.tipoConta) {
      var c3 = (larg - 24) / 3, yl = y;
      campoOpcoes(g, x, yl, c3, 'TIPO DE CONTA', ['Individual', 'Conjunta'], pg('conta', 'tipo_conta'), { destaque: dc });
      campo(g, x + c3 + 12, yl, c3, 'CPF DO TITULAR DA CONTA',
        pg('conta', 'cpf_titular') || (pg('conta', 'tipo_conta') === 'Individual' ? d.cpf : ''),
        { destaque: dc && (cfg.cpfSempre || d.tipo_conta === 'Conjunta') });
      y = campo(g, x + (c3 + 12) * 2, yl, c3, 'DOC/TED: BANCO', pg('conta', 'banco'), { destaque: dc });
      y = linhaCampos(g, x, y, larg, [
        { r: 'CÓDIGO DA AGÊNCIA', v: pg('conta', 'agencia'), d: dc },
        { r: 'CIDADE', v: pg('conta', 'conta_cidade'), d: dc },
        corrente, poupanca
      ]);
    } else {
      y = linhaCampos(g, x, y, larg, [
        { r: 'DOC/TED: BANCO', v: pg('conta', 'banco'), d: dc, p: 1.4 },
        { r: 'CÓDIGO DA AGÊNCIA', v: pg('conta', 'agencia'), d: dc },
        { r: 'CIDADE', v: pg('conta', 'conta_cidade'), d: dc, p: 1.2 },
        corrente, poupanca
      ]);
    }
    y = divisa();

    // para quem não possui conta bancária
    y = subsecao('guiche', 'Para quem não possui conta bancária');
    y += 14;
    var guiche = pg('guiche', 'guiche');
    if (destaque && forma === 'guiche' && !guiche) retangulo(g, x - 2, y - 10, larg + 4, 16, { preenche: COR.pendFundo });
    texto(g, 'Guichê de sociedade:', x, y + 2, { tam: 8.5, peso: 'bold' });
    var gx = x + 96;
    ['SP', 'RJ', 'BA', 'PE', 'PR', 'GO'].forEach(function (gg) {
      gx = opcaoCaixa(g, gx, y + 2, guiche === gg, gg) + 10;
    });
    gx = opcaoCaixa(g, gx, y + 2, guiche === 'Outro', 'Outro') + 6;
    if (guiche === 'Outro') {
      linha(g, gx, y + 4, x + larg, y + 4, COR.linha);
      texto(g, d.guiche_outro || '', gx + 2, y + 2, { tam: 8.5, peso: 'bold' });
    }
    y += 12;
    if (cfg.formas.indexOf('pj') < 0) return y + 4;
    y = divisa();

    // para quem receber como pessoa jurídica
    var dp = destaque && forma === 'pj';
    y = subsecao('pj', 'Para quem receber como pessoa jurídica*');
    y = linhaCampos(g, x, y, larg, [
      { r: 'RAZÃO SOCIAL', v: pg('pj', 'razao_social'), d: dp },
      { r: 'CNPJ', v: pg('pj', 'cnpj'), d: dp }
    ]);
    y = linhaCampos(g, x, y, larg, [
      { r: 'BANCO', v: pg('pj', 'pj_banco'), d: dp },
      { r: 'CIDADE', v: pg('pj', 'pj_cidade'), d: dp },
      { r: 'CÓDIGO AGÊNCIA', v: pg('pj', 'pj_agencia'), d: dp },
      { r: 'Nº CONTA CORRENTE', v: pg('pj', 'pj_conta'), d: dp }
    ]);
    texto(g, '*É necessário o envio de cessão de direitos de pessoa física para pessoa jurídica e contrato social da empresa.',
      x, y + 2, { tam: 7, cor: COR.suave });
    return y + 10;
  }

  function notaTerceiros(g, x, y, larg) {
    retangulo(g, x, y, larg, 20, { preenche: COR.tealClaro });
    texto(g, 'QUEM DESEJA RECEBER EM CONTA BANCÁRIA DE TERCEIROS DEVE ENTRAR EM CONTATO COM A ASSOCIAÇÃO.',
      x + larg / 2, y + 13, { tam: 7.5, peso: 'bold', cor: COR.teal, alinha: 'center' });
    return y + 20 + 14;
  }

  /* Ficha do menor: as observações tomam o lugar da nota sobre conta de terceiros. */
  function observacoesMenor(g, x, y, larg) {
    retangulo(g, x, y, larg, 40, { preenche: COR.tealClaro });
    texto(g, 'OBSERVAÇÕES', x + 10, y + 12, { tam: 7.5, peso: 'bold', cor: COR.teal });
    texto(g, '• Após a maioridade (18 anos), o titular deverá entrar em contato com a associação para atualizar os dados cadastrais.',
      x + 10, y + 23, { tam: 7.5 });
    texto(g, '• Quem deseja receber em conta bancária de terceiros deve entrar em contato com a associação.',
      x + 10, y + 33, { tam: 7.5 });
    return y + 40 + 14;
  }

  function blocoDocumentos(g, d, x, y, larg) {
    y = secao(g, x, y, larg, 'Lista de documentos a serem anexados à proposta');
    S.DOCUMENTOS.forEach(function (doc) {
      var marcada = d[doc.k] === true;
      caixa(g, x, y - 1, marcada, 9);
      texto(g, doc.rot, x + 14, y + 6.5, { tam: 8.5, peso: marcada ? 'bold' : '', cor: marcada ? COR.tinta : COR.suave });
      if (doc.obs) {
        fonte(g, 8.5, marcada ? 'bold' : '');
        var ox = x + 14 + g.measureText(doc.rot).width + 6;
        fonte(g, 7, '');
        if (ox + g.measureText(doc.obs).width <= x + larg) {
          texto(g, doc.obs, ox, y + 6.5, { tam: 7, cor: COR.suave });
        } else {
          // observação longa desce para a linha de baixo
          y = paragrafo(g, doc.obs, x + 14, y + 16, larg - 14, 7, 9, { cor: COR.suave }) - 12;
        }
      }
      y += 18;
    });
    return y;
  }

  /* ------------------------------------------------------------------ */
  /* página 1 das propostas de filiação                                  */
  /* ------------------------------------------------------------------ */
  function pagina1(g, d, imgs, destaque) {
    var id = S.ficha.id;
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 1, imgs);

    y = blocoCategorias(g, d, x, y, larg, destaque) + 8;

    if (id === 'pj') {
      y = secao(g, x, y, larg, 'Dados cadastrais');
      y = campo(g, x, y, larg, 'RAZÃO SOCIAL', d.razao_social, { destaque: destaque, tam: 11 });
      y = linhaCampos(g, x, y, larg, [
        { r: 'NOME FANTASIA', v: d.nome_fantasia },
        { r: 'CNPJ', v: d.cnpj, d: destaque }
      ]);
    } else if (id === 'herdeiro') {
      y = secao(g, x, y, larg, 'Dados cadastrais do titular falecido');
      y = campo(g, x, y, larg, 'NOME', d.fal_nome, { destaque: destaque, tam: 11 });
      y = linhaCampos(g, x, y, larg, [
        { r: 'DATA DE NASCIMENTO', v: d.fal_nascimento, d: destaque },
        { r: 'DATA DE FALECIMENTO', v: d.fal_falecimento, d: destaque },
        { r: 'CPF', v: d.fal_cpf, d: destaque }
      ]);
      y = linhaCampos(g, x, y, larg, [{ r: 'PSEUDÔNIMO', v: d.fal_pseudonimo }, { r: 'NOME DE BANDA', v: d.fal_banda }]);
      y = campo(g, x, y, larg, 'OUTROS PSEUDÔNIMOS', d.fal_outros_pseudonimos, {});
    } else {
      y = secao(g, x, y, larg, 'Dados cadastrais');
      y = campo(g, x, y, larg, 'NOME', d.nome, { destaque: destaque, tam: 11 });
      y = linhaCampos(g, x, y, larg, [
        { r: 'DATA DE NASCIMENTO', v: d.nascimento, d: destaque },
        { r: 'RG', v: d.rg, d: destaque },
        { r: 'ÓRGÃO EXPEDIDOR', v: d.rg_orgao, d: destaque }
      ]);
      y = linhaCampos(g, x, y, larg, [{ r: 'CPF', v: d.cpf, d: destaque }, { r: 'PSEUDÔNIMO', v: d.pseudonimo }]);
      y = campo(g, x, y, larg, 'NOME DE BANDA', d.banda, {});
      y = campo(g, x, y, larg, 'OUTROS PSEUDÔNIMOS', d.outros_pseudonimos, {});
    }

    y = declaracao(g, x, y + 6, larg, id === 'herdeiro' ? declaracaoHerdeiro(d) : DECLARACAO);

    // na PJ o responsável legal vem antes do local e data, como no PDF
    if (id === 'pj') y = responsavelLegal(g, d, x, y - 6, larg, destaque) + 16;

    y = localData(g, d, x, y, larg, destaque);
    // menor e PJ: quem assina é o responsável legal; no herdeiro, o herdeiro desta ficha
    y = linhaAssinatura(g, imgs, x, y, larg, id === 'menor' || id === 'pj' ? d.resp_nome : d.nome);

    if (id === 'menor') y = responsavelLegal(g, d, x, y - 14, larg, destaque);

    usoExclusivo(g, x, y, larg);
    rodape(g, 1);
  }

  /* ------------------------------------------------------------------ */
  /* página 2 — pessoa física e menor de idade                           */
  /* ------------------------------------------------------------------ */
  function pagina2(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 2, imgs);

    y = secao(g, x, y, larg, 'Dados cadastrais');
    y = dadosPessoais(g, d, x, y, larg, destaque);

    y += 6;
    y = secao(g, x, y, larg, 'Endereço e contato');
    y = endereco(g, d, x, y, larg, destaque);
    y = linhaCampos(g, x, y, larg, [
      { r: 'TELEFONE', v: d.tel },
      { r: 'CELULAR', v: d.cel, d: destaque },
      { r: 'Nº OMB', v: d.omb }
    ]);
    y = linhaCampos(g, x, y, larg, [{ r: 'E-MAIL', v: d.email, d: destaque }, { r: 'SITE', v: d.site }]);

    y = blocoPagamento(g, d, x, y + 6, larg, destaque, { formas: ['conta', 'guiche', 'pj'], tipoConta: true });
    y = S.ficha.id === 'menor' ? observacoesMenor(g, x, y, larg) : notaTerceiros(g, x, y, larg);
    blocoDocumentos(g, d, x, y, larg);

    rodape(g, 2);
  }

  /* ------------------------------------------------------------------ */
  /* página 2 — pessoa jurídica                                          */
  /* ------------------------------------------------------------------ */
  function pagina2PJ(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 2, imgs);

    y = secao(g, x, y, larg, 'Dados cadastrais');
    y = campo(g, x, y, larg, 'RAZÃO SOCIAL', d.razao_social, { destaque: destaque, tam: 11 });
    y = linhaCampos(g, x, y, larg, [
      { r: 'NOME FANTASIA', v: d.nome_fantasia, p: 2 },
      { r: 'INSCRIÇÃO MUNICIPAL', v: d.inscricao_municipal },
      { r: 'INSCRIÇÃO ESTADUAL', v: d.inscricao_estadual }
    ]);
    y = endereco(g, d, x, y, larg, destaque);
    y = linhaCampos(g, x, y, larg, [
      { r: 'TELEFONE', v: d.tel, d: destaque },
      { r: 'CELULAR', v: d.cel },
      { r: 'FAX', v: d.fax }
    ]);
    y = linhaCampos(g, x, y, larg, [{ r: 'SITE', v: d.site }, { r: 'SOCIEDADE ANTERIOR', v: d.sociedade_anterior }]);

    y += 6;
    y = secao(g, x, y, larg, 'Dados cadastrais do representante legal');
    y = campo(g, x, y, larg, 'NOME', d.resp_nome, { destaque: destaque, tam: 11 });
    y = linhaCampos(g, x, y, larg, [
      { r: 'CPF', v: d.resp_cpf, d: destaque },
      { r: 'DATA DE NASCIMENTO', v: d.resp_nascimento, d: destaque },
      { r: 'NACIONALIDADE', v: d.resp_nacionalidade, d: destaque },
      { r: 'NATURALIDADE', v: d.resp_naturalidade, d: destaque }
    ]);
    y = linhaCampos(g, x, y, larg, [
      { r: 'TELEFONE', v: d.resp_tel },
      { r: 'CELULAR', v: d.resp_cel, d: destaque },
      { r: 'E-MAIL', v: d.resp_email, d: destaque, p: 1.6 }
    ]);

    texto(g, 'Contatos:', x, y + 6, { tam: 7.5, peso: 'bold', cor: COR.teal });
    y += 10;
    [1, 2].forEach(function (n) {
      y = linhaCampos(g, x, y, larg, [
        { r: 'NOME', v: d['contato' + n + '_nome'], p: 1.4 },
        { r: 'SETOR', v: d['contato' + n + '_setor'], p: 0.8 },
        { r: 'TELEFONE', v: d['contato' + n + '_tel'], p: 0.9 },
        { r: 'E-MAIL', v: d['contato' + n + '_email'], p: 1.4 }
      ]);
    });
    y = campo(g, x, y, larg, 'E-MAIL PARA ENVIO DO SISRC', d.email_sisrc, {});

    y = blocoPagamento(g, d, x, y + 6, larg, destaque, { formas: ['conta', 'guiche'], tipoConta: false });
    y = notaTerceiros(g, x, y, larg);
    blocoDocumentos(g, d, x, y, larg);

    rodape(g, 2);
  }

  /* ------------------------------------------------------------------ */
  /* página 2 — herdeiro / sucessor                                      */
  /* ------------------------------------------------------------------ */
  function pagina2Herdeiro(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var y = cabecalho(g, 2, imgs);

    y = secao(g, x, y, larg, 'Dados cadastrais do titular falecido');
    y = campo(g, x, y, larg, 'NOME', d.fal_nome, { destaque: destaque, tam: 11 });
    y = linhaCampos(g, x, y, larg, [
      { r: 'RG', v: d.fal_rg },
      { r: 'ÓRGÃO EXPEDIDOR', v: d.fal_rg_orgao },
      { r: 'SEXO', v: d.fal_sexo, opcoes: ['Masculino', 'Feminino', 'Outro'] }
    ]);
    y = linhaCampos(g, x, y, larg, [
      { r: 'NACIONALIDADE', v: d.fal_nacionalidade },
      { r: 'NATURALIDADE', v: d.fal_naturalidade },
      { r: 'SOCIEDADE ANTERIOR', v: d.fal_sociedade_anterior },
      { r: 'Nº OMB', v: d.fal_omb }
    ]);

    y += 6;
    y = blocoHerdeiro(g, d, x, y, larg, destaque);

    y = blocoPagamento(g, d, x, y, larg, destaque, { formas: ['conta', 'guiche', 'pj'], tipoConta: true, cpfSempre: true });
    y = notaTerceiros(g, x, y, larg);
    blocoDocumentos(g, d, x, y, larg);

    rodape(g, 2);
  }

  /* Dados cadastrais do herdeiro (h: dados sem prefixo). */
  function blocoHerdeiro(g, h, x, y, larg, destaque) {
    y = secao(g, x, y, larg, 'Dados cadastrais do herdeiro');
    y = dadosPessoais(g, h, x, y, larg, destaque, true);
    y = endereco(g, h, x, y, larg, destaque);
    y = linhaCampos(g, x, y, larg, [
      { r: 'TELEFONE', v: h.tel },
      { r: 'CELULAR', v: h.cel, d: destaque },
      { r: 'E-MAIL', v: h.email, d: destaque, p: 1.6 }
    ]);
    return y + 6;
  }

  /* Dados da ficha do herdeiro n: os dele (cadastro, contato e pagamento) no
     lugar dos do principal; falecido, categorias, local/data e documentos são comuns. */
  function dadosFichaHerdeiro(d, n) {
    var o = {};
    Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    var h = S.dadosHerdeiro(d, n);
    S.CHAVES_HERDEIRO.forEach(function (k) { o[k] = h[k]; });
    o.qtd_herdeiros = '1';
    return o;
  }

  /* Um herdeiro: a ficha de sempre. Vários: uma ficha completa (páginas 1 e 2)
     para cada um, que assina a sua. */
  function paginasHerdeiro(d, imgs, opts) {
    var n = S.nHerdeiros(d), canvases = [];
    totalPaginas = 2;
    for (var i = 1; i <= n; i++) {
      fichaDe = n > 1 ? { n: i, total: n, nome: S.dadosHerdeiro(d, i).nome } : null;
      var di = dadosFichaHerdeiro(d, i);
      canvases.push(desenhaPagina(pagina1, di, imgs, opts), desenhaPagina(pagina2Herdeiro, di, imgs, opts));
    }
    fichaDe = null;
    return canvases;
  }

  /* ------------------------------------------------------------------ */
  /* pedido de desligamento (página única)                               */
  /* ------------------------------------------------------------------ */
  /* Lacuna de texto corrido: valor em negrito sobre linha-guia, como os
     espaços "____" da carta. Devolve o x final. */
  function lacuna(g, x, y, larg, valor, destaque, tam) {
    tam = tam || 10;
    var vazio = valor === undefined || valor === null || String(valor).trim() === '';
    if (destaque && vazio) retangulo(g, x, y - tam - 2, larg, tam + 6, { preenche: COR.pendFundo });
    if (!vazio) {
      var t = tam, str = String(valor);
      fonte(g, t, 'bold');
      while (g.measureText(str).width > larg - 4 && t > 6) { t -= 0.4; fonte(g, t, 'bold'); }
      texto(g, str, x + 2, y - 1.5, { tam: t, peso: 'bold' });
    }
    linha(g, x, y + 2, x + larg, y + 2, destaque && vazio ? COR.pendBorda : COR.linha, destaque && vazio ? 0.9 : 0.6);
    return x + larg;
  }

  /* Texto corrido que segue na mesma linha; devolve o x final. */
  function trecho(g, str, x, y, op) {
    op = op || {};
    var tam = op.tam || 10;
    texto(g, str, x, y, { tam: tam, cor: op.cor, peso: op.peso });
    fonte(g, tam, op.peso || '');
    return x + g.measureText(str).width;
  }

  function paginaDesligamento(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var fim = x + larg;
    var y = cabecalho(g, 1, imgs) + 36;
    var px;

    // destinatário
    px = trecho(g, 'À ', x, y);
    fonte(g, 8.5, '');
    var rotSoc = '(Sociedade anterior)';
    var wSoc = g.measureText(rotSoc).width;
    lacuna(g, px + 2, y, fim - wSoc - 10 - (px + 2), d.sociedade_anterior, destaque);
    texto(g, rotSoc, fim, y, { tam: 8.5, cor: COR.suave, alinha: 'right' });
    y += 44;

    // qualificação
    px = trecho(g, 'Eu ', x, y);
    lacuna(g, px + 2, y, fim - 6 - (px + 2), d.nome, destaque);
    trecho(g, ',', fim - 3, y);
    y += 24;

    px = trecho(g, 'de nome artístico ', x, y);
    px = lacuna(g, px + 2, y, 232, d.pseudonimo, false);
    px = trecho(g, '   e CPF ', px, y);
    lacuna(g, px + 2, y, fim - 6 - (px + 2), d.cpf, destaque);
    trecho(g, ',', fim - 3, y);
    y += 24;

    y = paragrafo(g, 'venho pelo presente, em concordância ao art. 97, § 2º, da lei nº 9.610/98, comunicar a V.Sas. o meu ' +
      'desligamento do quadro social dessa sociedade, na(s) categoria(s) abaixo selecionada(s).', x, y, larg, 10, 17);
    y += 24;

    // categorias
    var sel = Array.isArray(d.categorias_desligamento) ? d.categorias_desligamento : [];
    var lista = S.CATEGORIAS_DESLIGAMENTO;
    if (destaque && sel.length === 0) retangulo(g, x - 2, y - 6, 220, lista.length * 22 + 2, { preenche: COR.pendFundo });
    lista.forEach(function (c, i) {
      var ly = y + i * 22;
      var marcada = sel.indexOf(c.v) >= 0;
      caixa(g, x + 6, ly, marcada, 11);
      texto(g, c.rot, x + 24, ly + 9.5, { tam: 10, peso: marcada ? 'bold' : '', cor: marcada ? COR.tinta : COR.suave });
    });
    y += lista.length * 22 + 110;

    // local e data, centralizados como na carta
    var dt = dataExtenso(d.data_assinatura, true);
    var pendData = destaque && !dt[0];
    fonte(g, 10, '');
    var wDe = g.measureText(' de ').width, wVirg = g.measureText(', ').width;
    var wLocal = 180, wDia = 30, wMes = 100, wAno = 46;
    px = x + (larg - (wLocal + wVirg + wDia + wDe * 2 + wMes + wAno)) / 2;
    px = lacuna(g, px, y, wLocal, d.local_assinatura, destaque);
    px = trecho(g, ', ', px, y);
    px = lacuna(g, px, y, wDia, dt[0], pendData);
    px = trecho(g, ' de ', px, y);
    px = lacuna(g, px, y, wMes, dt[1], pendData);
    px = trecho(g, ' de ', px, y);
    lacuna(g, px, y, wAno, dt[2], pendData);
    y += 34;

    // assinatura do titular
    var assL = 240, assX = x + (larg - assL) / 2;
    y += 44;
    linha(g, assX, y, assX + assL, y, COR.tinta, 0.8);
    texto(g, 'Assinatura do titular', x + larg / 2, y + 12, { tam: 8, cor: COR.suave, alinha: 'center' });
    if (d.nome) texto(g, String(d.nome).toUpperCase(), x + larg / 2, y + 25, { tam: 9, peso: 'bold', alinha: 'center' });

    rodape(g, 1);
  }

  /* ------------------------------------------------------------------ */
  /* declaração de residência (página única)                             */
  /* ------------------------------------------------------------------ */
  /* Linha de texto corrido com lacunas: cada parte é um trecho (string) ou
     uma lacuna { v, d, p }; as lacunas dividem o espaço que sobra na
     proporção de p (1). Devolve as posições [x, largura] de cada lacuna. */
  function linhaLacunas(g, x, y, fim, partes) {
    fonte(g, 10, '');
    var fixo = 0, soma = 0, nLac = 0;
    partes.forEach(function (pt) {
      if (typeof pt === 'string') fixo += g.measureText(pt).width;
      else { soma += pt.p || 1; nLac++; }
    });
    var livre = fim - x - fixo - 4 * nLac, px = x, pos = [];
    partes.forEach(function (pt) {
      if (typeof pt === 'string') { px = trecho(g, pt, px, y); return; }
      var w = livre * (pt.p || 1) / soma;
      pos.push([px + 2, w]);
      px = lacuna(g, px + 2, y, w, pt.v, pt.d) + 2;
    });
    return pos;
  }

  /* Parágrafo com trechos de pesos diferentes ([{ t, peso }]), quebrado por
     palavra; os trechos são separados por espaço. Devolve o y da última linha. */
  function paragrafoRico(g, partes, x, y, larg, tam, alturaLinha) {
    var px = x;
    fonte(g, tam, '');
    var espaco = g.measureText(' ').width;
    partes.forEach(function (pt) {
      pt.t.split(/\s+/).forEach(function (palavra) {
        fonte(g, tam, pt.peso || '');
        var w = g.measureText(palavra).width;
        if (px > x && px + w > x + larg) { px = x; y += alturaLinha; }
        texto(g, palavra, px, y, { tam: tam, peso: pt.peso });
        px += w + espaco;
      });
    });
    return y;
  }

  var ART_299 ='“Art. 299 – Omitir, em documento público ou particular, declaração que nele deveria constar, ou nele ' +
    'inserir ou fazer inserir declaração falsa ou diversa da que devia ser escrita, com o fim de prejudicar direito, ' +
    'criar obrigação ou alterar a verdade sobre fato juridicamente relevante.”';
  var PENA_299 = '“Pena: reclusão de 1 (um) a 5 (cinco) anos e multa, se o documento é público, e reclusão de 1 (um) ' +
    'a 3 (três) anos, se o documento é particular.”';

  function paginaResidencia(g, d, imgs, destaque) {
    var x = MARGEM;
    var larg = PAG_L - MARGEM * 2;
    var fim = x + larg;
    var y = cabecalho(g, 1, imgs) + 22;
    var pos, px;

    texto(g, 'Ilmo. Sr. Presidente da ABRAMUS', x, y, { tam: 11 });
    y += 38;

    // qualificação do requerente
    linhaLacunas(g, x, y, fim, ['Eu ', { v: d.nome, d: destaque }]);
    y += 26;
    linhaLacunas(g, x, y, fim, ['documento de identidade ', { v: d.rg, d: destaque }, '   órgão exp. ', { v: d.rg_orgao, d: destaque, p: 0.8 }]);
    y += 26;
    linhaLacunas(g, x, y, fim, ['CPF ', { v: d.cpf, d: destaque, p: 1.1 }, '   nacionalidade ', { v: d.nacionalidade, d: destaque },
      '   naturalidade ', { v: d.naturalidade, d: destaque }]);
    y += 26;
    linhaLacunas(g, x, y, fim, ['telefone (DDD e nº) ', { v: d.tel }, '   celular ', { v: d.cel, d: destaque }]);
    y += 26;
    linhaLacunas(g, x, y, fim, ['e-mail ', { v: d.email, d: destaque }]);
    y += 30;

    // declaração e endereço
    y = paragrafoRico(g, [
      { t: 'Na falta de documentos para comprovação de residência,' }, { t: 'DECLARO', peso: 'bold' },
      { t: 'para os devidos fins, sob as penas da Lei, ser residente e domiciliado(a)' }
    ], x, y, larg, 10, 17) + 26;
    var rua = [d.endereco, d.numero, d.complemento].filter(Boolean).join(', ');
    linhaLacunas(g, x, y, fim, ['no endereço ', { v: rua, d: destaque && !(d.endereco && d.numero) }]);
    y += 26;
    pos = linhaLacunas(g, x, y, fim, [
      { v: d.bairro, d: destaque, p: 1.3 }, '  ', { v: d.cidade, d: destaque, p: 1.3 }, '  ',
      { v: d.uf, d: destaque, p: 0.4 }, '  ', { v: d.cep, d: destaque, p: 0.8 }
    ]);
    ['(Bairro)', '(Cidade)', '(UF)', '(CEP)'].forEach(function (r, i) {
      texto(g, r, pos[i][0], y + 13, { tam: 7.5, cor: COR.suave });
    });
    y += 42;

    // ciência da sanção penal (art. 299 do Código Penal)
    y = paragrafo(g, 'Declaro ainda estar ciente de que a falsidade da presente declaração pode implicar na sanção penal ' +
      'prevista no Art. 299 do Código Penal, conforme transcrição abaixo:', x, y, larg, 10, 15, { peso: 'bold' });
    y += 8;
    var alt = (quebra(g, ART_299, larg - 24, 8.5).length + quebra(g, PENA_299, larg - 24, 8.5, 'bold').length) * 11.5 + 22;
    retangulo(g, x, y, larg, alt, { preenche: COR.tealClaro });
    var yq = paragrafo(g, ART_299, x + 12, y + 17, larg - 24, 8.5, 11.5);
    paragrafo(g, PENA_299, x + 12, yq, larg - 24, 8.5, 11.5, { peso: 'bold' });
    y += alt + 50;

    // local e data, como no PDF: "cidade, dia / mês / ano"
    var dt = dataExtenso(d.data_assinatura, true);
    var pendData = destaque && !dt[0];
    var wLocal = 180;
    px = lacuna(g, x, y, wLocal, d.local_assinatura, destaque);
    px = trecho(g, ', ', px, y);
    var xData = px;
    px = lacuna(g, px, y, 30, dt[0], pendData);
    px = trecho(g, ' / ', px, y);
    px = lacuna(g, px, y, 100, dt[1], pendData);
    px = trecho(g, ' / ', px, y);
    lacuna(g, px, y, 46, dt[2], pendData);
    texto(g, '(Cidade)', x, y + 15, { tam: 8, cor: COR.suave });
    texto(g, '(Data)', xData, y + 15, { tam: 8, cor: COR.suave });
    y += 80;

    // assinatura do requerente
    linha(g, x, y, x + 240, y, COR.tinta, 0.8);
    texto(g, 'Assinatura do Requerente', x, y + 12, { tam: 8, cor: COR.suave });
    if (d.nome) texto(g, String(d.nome).toUpperCase(), x, y + 25, { tam: 9, peso: 'bold' });
    y += 58;

    // documentos necessários
    y = secao(g, x, y, larg, 'Documentos necessários');
    S.DOCUMENTOS.forEach(function (doc) {
      g.fillStyle = COR.teal;
      g.beginPath();
      g.arc(x + 4, y + 3, 2, 0, Math.PI * 2);
      g.fill();
      texto(g, doc.rot + (doc.obs ? ' — ' + doc.obs : ''), x + 12, y + 6.5, { tam: 8.5 });
      y += 16;
    });

    rodape(g, 1);
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */
  // data: URL de js/logo.js — ver lá por que não é o arquivo de icons/.
  var LOGO = global.FichaLogo;

  function carregaImagem(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function desenhaPagina(desenho, d, imgs, opts) {
    var escala = opts.escala || 2.5;
    var cv = document.createElement('canvas');
    cv.width = Math.round(PAG_L * escala);
    cv.height = Math.round(PAG_A * escala);
    var g = cv.getContext('2d');
    g.fillStyle = COR.branco;
    g.fillRect(0, 0, cv.width, cv.height);
    g.scale(escala, escala);
    g.textBaseline = 'alphabetic';
    desenho(g, d, imgs, opts.destaque);
    return cv;
  }

  /* Desenhos de cada página, por ficha; uma função recebe os dados e devolve a
     lista (o herdeiro ganha páginas conforme o número de herdeiros). */
  var PAGINAS = {
    filiacao: [pagina1, pagina2],
    menor: [pagina1, pagina2],
    pj: [pagina1, pagina2PJ],
    herdeiro: paginasHerdeiro,
    desligamento: [paginaDesligamento],
    residencia: [paginaResidencia]
  };

  /* Devolve Promise<[canvas, ...]>, uma por página da ficha ativa. */
  function paginas(dados, opts) {
    opts = opts || {};
    return carregaImagem(LOGO)
      .then(function (logo) {
        var imgs = { logo: logo };
        var lista = PAGINAS[S.ficha.id];
        if (typeof lista === 'function') return lista(dados, imgs, opts);
        totalPaginas = lista.length;
        fichaDe = null;
        return lista.map(function (desenho) { return desenhaPagina(desenho, dados, imgs, opts); });
      });
  }

  global.FichaRender = {
    paginas: paginas,
    PAG_L: PAG_L,
    PAG_A: PAG_A,
    COR: COR
  };
})(window);
