/* Camada de aplicação: navegação em etapas, formulário, pendências,
   pré-visualização e ações de exportação. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var St = global.FichaState;
  var R = global.FichaRender;
  var Ex = global.FichaExport;
  var FA = global.FichaAnexos;

  var stepAtual = 0;
  var tocados = {};
  var promptInstalar = null;

  /* Dentro do APK Android o app já está instalado e os arquivos vêm do próprio
     pacote — as duas coisas mudam o comportamento de instalação e de cache. */
  function emAppNativo() {
    return typeof global.FichaAndroid !== 'undefined' && !!global.FichaAndroid;
  }

  /* iPhone/iPad: a instalação é manual e tem um caminho próprio no Safari.
     O iPad com iPadOS 13+ se anuncia como Mac, daí o teste por toque. */
  function emIOS() {
    var nav = global.navigator || {};
    var ua = nav.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
           (ua.indexOf('Macintosh') >= 0 && nav.maxTouchPoints > 1);
  }

  /* Sair descarta o preenchimento (é o que o diálogo avisa), então a
     confirmação não é formalidade: sem ela um toque na barra apagaria tudo. */
  function pedirSaida() {
    fecharSheets();
    /* fecharSheets() só esconde de fato depois da transição; abrir antes disso
       faria o próprio diálogo ser escondido pelo timer dela. */
    setTimeout(function () { abrirSheet('confirmSheet'); }, 240);
  }

  function sairDoApp() {
    fecharSheets();
    /* O aviso do diálogo diz que o preenchimento se perde — então se perde
       mesmo: nada de rascunho de um filiado ficando no aparelho depois que
       ele encerrou. Limpar antes de sair também deixa o app pronto para o
       próximo atendimento, já que o APK pode voltar do mesmo processo. */
    St.limparTudo();
    FA.limparTudo();
    tocados = {};
    construir();
    St.set('data_assinatura', St.hojeBR());
    irPara(0);
    atualizar();
    if (emAppNativo() && global.FichaAndroid.sair) { global.FichaAndroid.sair(); return; }
    fichaEscolhida = false;
    aplicarFicha();
    /* close() só é atendido em janela aberta por script ou com uma única
       entrada no histórico — caso da PWA instalada, que fecha de verdade.
       Numa aba comum o navegador recusa em silêncio: no celular/tablet o app
       termina na tela de encerramento; no computador volta à tela inicial. */
    try { global.close(); } catch (e) { /* trata abaixo */ }
    setTimeout(function () {
      if (global.closed) return;
      if (emAparelhoMovel()) { mostrarEncerrado(); return; }
      abrirInicio(false);
      toast('Aplicação finalizada. Os dados preenchidos foram apagados deste aparelho.');
    }, 300);
  }

  function emAparelhoMovel() {
    var ua = (global.navigator && global.navigator.userAgent) || '';
    return emIOS() || /Android|Mobi|Tablet/i.test(ua) ||
           !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  }

  function emModoApp() {
    return !!((global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
              global.navigator.standalone);
  }

  /* A dica diz como fechar no aparelho em uso, já que o script não conseguiu. */
  function mostrarEncerrado() {
    var dica;
    if (emModoApp()) {
      dica = emIOS()
        ? 'Para fechar, deslize de baixo para cima e afaste o aplicativo.'
        : 'Para fechar, abra os apps recentes e deslize o aplicativo para fora.';
    } else {
      dica = 'Para fechar, feche esta aba do navegador.';
    }
    $('#encerradoDica').textContent = dica;
    $('#inicio').hidden = true;
    $('#encerrado').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  var timerPreview = null;
  var canvasesPreview = null;

  /* ---------------------------------------------------------------- */
  /* helpers DOM                                                       */
  /* ---------------------------------------------------------------- */
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function toast(msg, tipo) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (tipo ? ' toast--' + tipo : '');
    t.hidden = false;
    clearTimeout(toast._t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    toast._t = setTimeout(function () {
      t.classList.remove('is-on');
      setTimeout(function () { t.hidden = true; }, 250);
    }, 3600);
  }

  function ocupado(ligado, texto) {
    var b = $('#busy');
    $('#busyText').textContent = texto || 'Gerando…';
    b.hidden = !ligado;
  }

  /* ---------------------------------------------------------------- */
  /* construção do formulário                                          */
  /* ---------------------------------------------------------------- */
  function construir() {
    var wrap = $('#steps');
    wrap.innerHTML = '';
    S.STEPS.forEach(function (step, i) {
      var sec = el('section', 'step');
      sec.id = 'step-' + step.id;
      sec.dataset.index = String(i);
      sec.hidden = i !== stepAtual;

      var cab = el('div', 'step__head');
      cab.appendChild(el('p', 'step__kicker', 'Etapa ' + (i + 1) + ' de ' + S.STEPS.length));
      cab.appendChild(el('h1', 'step__title', step.titulo));
      cab.appendChild(el('p', 'step__sub', step.subtitulo));
      sec.appendChild(cab);

      if (step.revisao) {
        sec.appendChild(construirRevisao());
      } else if (step.anexos) {
        sec.appendChild(construirEntrega());
        sec.appendChild(construirEntregaManual());
        var anexos = construirAnexos();
        anexos.id = 'anexosApp';
        sec.appendChild(anexos);
      } else {
        var grade = el('div', 'grid');
        step.campos.forEach(function (campo) { grade.appendChild(construirCampo(campo)); });
        sec.appendChild(grade);
      }
      wrap.appendChild(sec);
    });
    construirStepper();
  }

  function construirStepper() {
    var nav = $('#stepper');
    nav.innerHTML = '';
    S.STEPS.forEach(function (step, i) {
      var b = el('button', 'stepper__item', step.titulo);
      b.type = 'button';
      b.dataset.index = String(i);
      b.addEventListener('click', function () { irPara(i); });
      nav.appendChild(b);
    });
  }

  function construirCampo(campo) {
    var box = el('div', 'field' + (campo.largura === 'meio' ? ' field--meio' : ''));
    box.id = 'campo-' + campo.k;
    box.dataset.k = campo.k;

    if (campo.tipo === 'categorias') return construirCategorias(box);
    if (campo.tipo === 'checklist') return construirChecklist(box, campo);
    if (campo.tipo === 'foto') return construirFoto(box, campo);
    if (campo.tipo === 'titulo') {
      // subtítulo que separa grupos de campos (ex.: "Herdeiro 2"); não guarda valor
      box.classList.add('field--titulo');
      if (campo.sub) box.classList.add('field--subtitulo');
      box.appendChild(el(campo.sub ? 'h4' : 'h3', 'field__titulo', campo.rotulo));
      return box;
    }

    var idInput = 'f-' + campo.k;
    var rot = el('label', 'field__label');
    rot.setAttribute('for', idInput);
    rot.appendChild(document.createTextNode(campo.rotulo));
    if (campo.obrigatorio || campo.obrigatorioSe) {
      // A marca visual é a barra vermelha à esquerda (.field--obrigatorio);
      // este texto existe só para leitores de tela.
      rot.appendChild(el('span', 'req', ' (obrigatório)'));
    }
    box.appendChild(rot);

    var entrada;
    if (campo.tipo === 'select') {
      entrada = el('select', 'input');
      entrada.appendChild(el('option', '', 'Selecione…'));
      campo.opcoes.forEach(function (o) {
        var op = el('option', '', o.rot);
        op.value = o.v;
        entrada.appendChild(op);
      });
      entrada.addEventListener('change', function () { St.set(campo.k, entrada.value); marcarTocado(campo.k); });
    } else if (campo.tipo === 'radio') {
      entrada = el('div', 'chips');
      campo.opcoes.forEach(function (o) {
        var c = el('button', 'chip', o.rot);
        c.type = 'button';
        c.dataset.v = o.v;
        c.addEventListener('click', function () {
          St.set(campo.k, St.get(campo.k) === o.v ? '' : o.v);
          marcarTocado(campo.k);
        });
        entrada.appendChild(c);
      });
      entrada.id = idInput;
      entrada.setAttribute('role', 'group');
    } else if (campo.tipo === 'multipla') {
      // Várias opções marcáveis; o valor é a lista dos v marcados.
      entrada = el('div', 'multipla');
      campo.opcoes.forEach(function (o) {
        var b = el('button', 'check-row');
        b.type = 'button';
        b.dataset.v = o.v;
        var marca = el('span', 'checkbox');
        marca.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        b.appendChild(marca);
        var txt = el('span', 'check-row__txt');
        txt.appendChild(el('span', 'check-row__rot', o.rot));
        b.appendChild(txt);
        b.addEventListener('click', function () {
          var atual = Array.isArray(St.get(campo.k)) ? St.get(campo.k) : [];
          var nova = atual.indexOf(o.v) >= 0
            ? atual.filter(function (v) { return v !== o.v; })
            // mantém a ordem das opções, não a dos cliques
            : campo.opcoes.map(function (op) { return op.v; }).filter(function (v) { return v === o.v || atual.indexOf(v) >= 0; });
          St.set(campo.k, nova);
          marcarTocado(campo.k);
        });
        entrada.appendChild(b);
      });
      entrada.id = idInput;
      entrada.setAttribute('role', 'group');
    } else if (campo.tipo === 'textarea') {
      entrada = el('textarea', 'input input--area');
      entrada.rows = 2;
      ligarTexto(entrada, campo);
    } else {
      entrada = el('input', 'input');
      entrada.type = 'text';
      if (campo.teclado === 'numeric') entrada.inputMode = 'numeric';
      if (campo.teclado === 'tel') { entrada.type = 'tel'; entrada.inputMode = 'tel'; }
      if (campo.teclado === 'email') { entrada.type = 'email'; entrada.inputMode = 'email'; entrada.autocapitalize = 'off'; }
      if (campo.autocomplete) entrada.autocomplete = campo.autocomplete;
      if (campo.tipo === 'data') { entrada.inputMode = 'numeric'; entrada.placeholder = 'DD/MM/AAAA'; }
      ligarTexto(entrada, campo);
    }
    if (campo.tipo !== 'radio' && campo.tipo !== 'multipla') entrada.id = idInput;
    box.appendChild(entrada);

    if (campo.dica) box.appendChild(el('p', 'field__hint', campo.dica));
    box.appendChild(el('p', 'field__err'));
    return box;
  }

  function ligarTexto(entrada, campo) {
    entrada.addEventListener('input', function () {
      var v = entrada.value;
      if (campo.caixaAlta) v = v.toUpperCase();
      var mascarado = St.aplicaMascara(campo.tipo, v);
      if (mascarado !== entrada.value) {
        var fim = entrada.selectionStart === entrada.value.length;
        entrada.value = mascarado;
        if (fim) { try { entrada.setSelectionRange(mascarado.length, mascarado.length); } catch (e) {} }
      }
      St.set(campo.k, mascarado);
    });
    entrada.addEventListener('blur', function () { marcarTocado(campo.k); });
  }

  function marcarTocado(k) {
    tocados[k] = true;
    atualizar();
  }

  /* ---------- categorias ---------- */
  function construirCategorias(box) {
    box.classList.add('field--bloco');
    box.appendChild(el('p', 'field__label', 'Categoria e território de representação'));
    box.appendChild(el('p', 'field__hint', 'Marque todas as categorias em que você atua. Para cada uma, informe o território.'));

    S.CATEGORIAS.forEach(function (c) {
      var cart = el('div', 'cat');
      cart.id = 'cat-' + c.k;

      var alvo = el('button', 'cat__head');
      alvo.type = 'button';
      alvo.id = 'f-cat_' + c.k;
      var marca = el('span', 'checkbox');
      marca.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      alvo.appendChild(marca);
      alvo.appendChild(el('span', 'cat__nome', c.rot));
      alvo.addEventListener('click', function () {
        var novo = !St.categoriaAtiva(c.k);
        St.set('cat_' + c.k, novo);
        if (!novo) { St.set('ter_' + c.k, ''); St.set('terout_' + c.k, ''); }
        tocados['cat_' + c.k] = true;
        atualizar();
      });
      cart.appendChild(alvo);

      var corpo = el('div', 'cat__corpo');
      var chips = el('div', 'chips chips--ter');
      chips.id = 'f-ter_' + c.k;
      S.TERRITORIOS.forEach(function (t) {
        var ch = el('button', 'chip', t.rot);
        ch.type = 'button';
        ch.dataset.v = t.v;
        ch.addEventListener('click', function () {
          St.set('ter_' + c.k, t.v);
          if (t.v !== 'outros') St.set('terout_' + c.k, '');
          tocados['ter_' + c.k] = true;
          atualizar();
        });
        chips.appendChild(ch);
      });
      corpo.appendChild(chips);

      var outro = el('input', 'input input--sm');
      outro.id = 'f-terout_' + c.k;
      outro.placeholder = 'Quais territórios?';
      outro.addEventListener('input', function () { St.set('terout_' + c.k, outro.value); });
      outro.addEventListener('blur', function () { marcarTocado('terout_' + c.k); });
      corpo.appendChild(outro);

      cart.appendChild(corpo);
      cart.appendChild(el('p', 'field__err'));
      box.appendChild(cart);
    });
    return box;
  }

  /* ---------- checklist de documentos ---------- */
  function construirChecklist(box, campo) {
    box.classList.add('field--bloco');
    box.appendChild(el('p', 'field__label', campo.rotulo));
    box.appendChild(el('p', 'field__hint', 'Use como conferência antes do envio. Estes itens são anexados por você no e-mail.'));
    campo.itens.forEach(function (item) {
      var b = el('button', 'check-row');
      b.type = 'button';
      b.id = 'f-' + item.k;
      var marca = el('span', 'checkbox');
      marca.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      b.appendChild(marca);
      var txt = el('span', 'check-row__txt');
      txt.appendChild(el('span', 'check-row__rot', item.rot));
      if (item.obs) txt.appendChild(el('span', 'check-row__obs', item.obs));
      b.appendChild(txt);
      b.addEventListener('click', function () { St.set(item.k, !St.get(item.k)); atualizar(); });
      box.appendChild(b);
    });
    return box;
  }

  /* ---------- foto 3x4 ---------- */
  function construirFoto(box, campo) {
    box.classList.add('field--bloco');
    box.appendChild(el('p', 'field__label', campo.rotulo));
    if (campo.dica) box.appendChild(el('p', 'field__hint', campo.dica));

    var linha = el('div', 'foto-linha');
    var prev = el('div', 'foto-prev');
    prev.id = 'fotoPrev';
    prev.innerHTML = '<span>3 × 4</span>';
    linha.appendChild(prev);

    var acoes = el('div', 'foto-acoes');
    var inp = el('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.id = 'f-foto';
    inp.className = 'sr-only';
    var bAdd = el('button', 'btn btn--outline', 'Escolher imagem');
    bAdd.type = 'button';
    bAdd.addEventListener('click', function () { inp.click(); });
    var bDel = el('button', 'btn btn--ghost', 'Remover');
    bDel.type = 'button';
    bDel.addEventListener('click', function () { St.set('foto', ''); inp.value = ''; atualizar(); });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      comprimirImagem(f, 600, 800, 0.82).then(function (dataUrl) {
        St.set('foto', dataUrl);
        atualizar();
      }).catch(function () { toast('Não foi possível ler a imagem.', 'erro'); });
    });
    acoes.appendChild(inp);
    acoes.appendChild(bAdd);
    acoes.appendChild(bDel);
    linha.appendChild(acoes);
    box.appendChild(linha);
    return box;
  }

  function comprimirImagem(file, maxL, maxA, q) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onerror = reject;
      leitor.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var r = Math.min(maxL / img.width, maxA / img.height, 1);
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * r);
          cv.height = Math.round(img.height * r);
          var g = cv.getContext('2d');
          g.fillStyle = '#FFFFFF';
          g.fillRect(0, 0, cv.width, cv.height);
          g.drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', q));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- */
  /* etapa de revisão                                                  */
  /* ---------------------------------------------------------------- */
  function construirRevisao() {
    var wrap = el('div', 'revisao');

    var cardPend = el('div', 'card card--status');
    cardPend.id = 'cardPend';
    wrap.appendChild(cardPend);

    var cardPrev = el('div', 'card');
    var cabPrev = el('div', 'card__head');
    cabPrev.appendChild(el('h2', 'card__title', 'Pré-visualização'));
    var alt = el('label', 'switch');
    var inpAlt = el('input');
    inpAlt.type = 'checkbox';
    inpAlt.id = 'switchDestaque';
    inpAlt.checked = true;
    inpAlt.addEventListener('change', function () { agendarPreview(true); });
    alt.appendChild(inpAlt);
    alt.appendChild(el('span', 'switch__track'));
    alt.appendChild(el('span', 'switch__rot', 'Destacar pendências'));
    cabPrev.appendChild(alt);
    cardPrev.appendChild(cabPrev);

    var visor = el('div', 'visor');
    visor.id = 'visor';
    visor.appendChild(el('div', 'visor__vazio', 'Gerando pré-visualização…'));
    cardPrev.appendChild(visor);
    wrap.appendChild(cardPrev);

    var cardAcoes = el('div', 'card');
    cardAcoes.appendChild(el('h2', 'card__title', 'Baixar para assinar'));
    var acoes = el('div', 'acoes');

    var nPag = S.ficha.paginas;
    var descPDF = nPag === 1 ? 'Documento completo em A4, 1 página.'
      : S.ficha.paginasExtras ? 'Ficha em A4, ' + nPag + ' páginas para cada herdeiro.'
      : 'Ficha completa em A4, ' + nPag + ' páginas.';
    acoes.appendChild(botaoAcao('Baixar para assinar (PDF)', descPDF, 'pdf', function () {
      ocupado(true, 'Gerando PDF…');
      Ex.baixarPDF()
        .then(function (a) { toast('PDF gerado: ' + a.nome); })
        .catch(function () { toast('Falha ao gerar o PDF.', 'erro'); })
        .then(function () { ocupado(false); });
    }));

    acoes.appendChild(botaoAcao('Baixar para assinar (JPG)', nPag === 1 ? 'Imagem da página, alta resolução.' : 'Uma imagem por página, alta resolução.', 'jpg', function () {
      ocupado(true, 'Gerando imagens…');
      Ex.baixarJPG()
        .then(function (arqs) { toast(arqs.length === 1 ? 'Imagem JPG gerada.' : arqs.length + ' imagens JPG geradas.'); })
        .catch(function () { toast('Falha ao gerar as imagens.', 'erro'); })
        .then(function () { ocupado(false); });
    }));

    cardAcoes.id = 'cardAcoes';
    cardAcoes.appendChild(acoes);
    var bloqueio = el('p', 'nota nota--bloqueio');
    bloqueio.id = 'notaBloqueio';
    cardAcoes.appendChild(bloqueio);
    cardAcoes.appendChild(el('p', 'nota',
      'Imprima, assine e anexe a ficha assinada na etapa Documentos, de onde ela é enviada com os demais documentos.'));
    wrap.appendChild(cardAcoes);

    return wrap;
  }

  /* ---------------------------------------------------------------- */
  /* etapa de documentos (anexos)                                      */
  /* ---------------------------------------------------------------- */
  /* Lista e validação mais recentes, guardadas para que os botões de envio
     rodem síncronos no clique (Web Share exige o gesto do usuário). */
  var anexosLista = [];
  var anexosValidacao = null;
  // como juntar os arquivos no envio/download: 'pdf' (PDF único) ou 'zip'
  var CHAVE_FORMATO = 'abramus.formatoEnvio';
  var formatoEnvio = (function () { try { return localStorage.getItem(CHAVE_FORMATO) === 'zip' ? 'zip' : 'pdf'; } catch (e) { return 'pdf'; } })();
  var confirmarIncompleto = false;
  var timerAnexos = null;

  var ICONE_CAMERA = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var ICONE_CLIPE = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="m20 11-7.6 7.6a5 5 0 0 1-7.1-7.1L13 3.8a3.3 3.3 0 0 1 4.7 4.7l-7.6 7.6a1.7 1.7 0 0 1-2.4-2.4l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Como a ficha assinada chega à ABRAMUS: pelo correio ou entregue na
     recepção. Fica nos dados da ficha (forma_entrega), fora das pendências.
     Sem escolha, a etapa segue com anexos e envio por e-mail; com uma das
     duas, os anexos dão lugar às instruções de entrega manual. */
  var ENDERECO_ABRAMUS = ['ABRAMUS — Associação Brasileira de Música e Artes', 'Rua Castro Alves, 713 — Aclimação',
    'São Paulo — SP', 'CEP 01532-001'];
  var FORMAS_ENTREGA = [
    { v: 'correio', rot: 'Enviar ficha assinada e documentos pelo correio',
      desc: 'Você envia a ficha assinada e os documentos pelo Correio (postal).',
      ic: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
    { v: 'recepcao', rot: 'Entregar a ficha assinada na recepção da ABRAMUS',
      desc: 'Você leva a ficha assinada pessoalmente à recepção da ABRAMUS.',
      ic: '<path d="M4 21V6l8-3 8 3v15M2.5 21h19M9 21v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' }
  ];

  function construirEntrega() {
    var box = el('fieldset', 'entrega');
    box.appendChild(el('legend', 'entrega__rot', 'Como você vai entregar a ficha?'));
    box.appendChild(el('p', 'entrega__dica', 'Opcional. Se não escolher, você anexa os documentos e envia por e-mail pelo próprio app, logo abaixo.'));
    var grade = el('div', 'entrega__opcoes');
    FORMAS_ENTREGA.forEach(function (o) {
      var lab = el('label', 'entrega__op');
      lab.dataset.v = o.v;
      var inp = el('input');
      inp.type = 'radio';
      inp.name = 'forma_entrega';
      inp.value = o.v;
      inp.className = 'sr-only';
      // tocar de novo na opção marcada desmarca (rádio comum não deixa)
      inp.addEventListener('click', function () {
        St.set('forma_entrega', St.get('forma_entrega') === o.v ? '' : o.v);
        desenharEntrega();
      });
      lab.appendChild(inp);
      var ic = el('span', 'entrega__ic');
      ic.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' + o.ic + '</svg>';
      lab.appendChild(ic);
      var t = el('span', 'entrega__txt');
      t.appendChild(el('strong', null, o.rot));
      t.appendChild(el('span', null, o.desc));
      lab.appendChild(t);
      lab.appendChild(el('span', 'entrega__marca'));
      grade.appendChild(lab);
    });
    box.appendChild(grade);
    return box;
  }

  function construirEntregaManual() {
    var card = el('div', 'card entrega-manual');
    card.id = 'entregaManual';
    card.hidden = true;
    var topo = el('div', 'entrega-manual__topo');
    var ic = el('span', 'entrega-manual__ic');
    ic.setAttribute('aria-hidden', 'true');
    topo.appendChild(ic);
    var tt = el('div');
    tt.appendChild(el('h2', 'card__title', ''));
    tt.appendChild(el('p', 'entrega-manual__sub', ''));
    topo.appendChild(tt);
    card.appendChild(topo);

    card.appendChild(el('ol', 'entrega-manual__passos'));

    var acoes = el('div', 'entrega-manual__acoes');
    var bRev = el('button', 'btn btn--primary', 'Ir para a Revisão e baixar a ficha');
    bRev.type = 'button';
    bRev.addEventListener('click', function () {
      for (var i = 0; i < S.STEPS.length; i++) if (S.STEPS[i].revisao) { irPara(i); return; }
    });
    acoes.appendChild(bRev);
    var bApp = el('button', 'btn btn--ghost', 'Prefiro anexar e enviar pelo app');
    bApp.type = 'button';
    bApp.addEventListener('click', function () {
      St.set('forma_entrega', '');
      desenharEntrega();
    });
    acoes.appendChild(bApp);
    card.appendChild(acoes);
    return card;
  }

  function desenharEntrega() {
    var v = St.get('forma_entrega');
    $$('.entrega__op').forEach(function (lab) {
      var on = lab.dataset.v === v;
      lab.classList.toggle('is-on', on);
      $('input', lab).checked = on;
    });
    var manual = $('#entregaManual'), app = $('#anexosApp');
    if (!manual || !app) return;
    var forma = null;
    FORMAS_ENTREGA.forEach(function (o) { if (o.v === v) forma = o; });
    manual.hidden = !forma;
    app.hidden = !!forma;
    if (!forma) return;

    var correio = forma.v === 'correio';
    $('.entrega-manual__ic', manual).innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26">' + forma.ic + '</svg>';
    $('.card__title', manual).textContent = correio ? 'Envio pelo Correio' : 'Entrega na recepção da ABRAMUS';
    $('.entrega-manual__sub', manual).textContent = correio
      ? 'Envie a ficha assinada e as cópias dos documentos pelo Correio para o endereço abaixo.'
      : 'Leve a ficha assinada e as cópias dos documentos à recepção da ABRAMUS, no endereço abaixo.';

    var passos = $('.entrega-manual__passos', manual);
    passos.innerHTML = '';
    var p1 = el('li');
    p1.appendChild(el('strong', null, 'Imprima e assine a ficha'));
    p1.appendChild(el('span', null, 'Baixe a ficha na Revisão, imprima todas as páginas e assine à mão, conforme o documento de identificação.'));
    passos.appendChild(p1);

    var p2 = el('li');
    p2.appendChild(el('strong', null, 'Junte os documentos'));
    var ul = el('ul', 'entrega-manual__docs');
    S.requisitosAnexos(St.todos()).forEach(function (r) {
      if (r.situacao === 'naoSeAplica') return;
      var li = el('li');
      li.appendChild(el('span', null, r.rot + (r.obs && r.k !== 'ficha_assinada' ? ' — ' + r.obs : '')));
      if (r.situacao === 'opcional') li.appendChild(el('em', 'entrega-manual__selo', 'Opcional'));
      ul.appendChild(li);
    });
    p2.appendChild(ul);
    passos.appendChild(p2);

    var p3 = el('li');
    p3.appendChild(el('strong', null, correio ? 'Envie pelo Correio para' : 'Entregue na recepção'));
    var end = el('address', 'entrega-manual__end');
    ENDERECO_ABRAMUS.forEach(function (linha, i) {
      end.appendChild(el(i === 0 ? 'strong' : 'span', null, linha));
    });
    p3.appendChild(end);
    passos.appendChild(p3);
  }

  function construirAnexos() {
    var wrap = el('div', 'anexos');

    var status = el('div', 'card card--status');
    status.id = 'cardAnexos';
    wrap.appendChild(status);

    if (FA.soMemoria()) {
      wrap.appendChild(el('p', 'nota nota--aviso',
        'Este navegador não permite guardar os anexos: eles se perdem se a página for fechada. Envie logo após anexar.'));
    }

    var lista = el('div', 'anexo-reqs');
    lista.id = 'anexoReqs';
    wrap.appendChild(lista);

    var orfaos = el('div', 'anexo-req anexo-req--orfaos');
    orfaos.id = 'anexoOrfaos';
    orfaos.hidden = true;
    wrap.appendChild(orfaos);

    var cardEnvio = el('div', 'card');
    cardEnvio.appendChild(el('h2', 'card__title', 'Validar e enviar'));

    // formato do pacote: PDF único ou ZIP com os arquivos originais
    var fmt = el('div', 'formato');
    fmt.appendChild(el('p', 'formato__rot', 'Como juntar os arquivos'));
    var chips = el('div', 'chips');
    chips.id = 'formatoEnvio';
    chips.setAttribute('role', 'radiogroup');
    [{ v: 'pdf', rot: 'PDF único' }, { v: 'zip', rot: 'Compactar (ZIP)' }].forEach(function (o) {
      var c = el('button', 'chip', o.rot);
      c.type = 'button';
      c.dataset.v = o.v;
      c.setAttribute('role', 'radio');
      c.addEventListener('click', function () {
        formatoEnvio = o.v;
        try { localStorage.setItem(CHAVE_FORMATO, o.v); } catch (e) {}
        desenharFormato();
      });
      chips.appendChild(c);
    });
    fmt.appendChild(chips);
    var dicaFmt = el('p', 'formato__dica');
    dicaFmt.id = 'formatoDica';
    fmt.appendChild(dicaFmt);
    cardEnvio.appendChild(fmt);

    var acoes = el('div', 'acoes');

    var bValidar = botaoSimples('Validar documentos', 'Confere se cada documento exigido por esta ficha foi anexado.', 'check', validarAnexos);
    acoes.appendChild(bValidar);

    var podeShare = Ex.podeCompartilharArquivos();
    var bEnviar = botaoSimples(
      podeShare ? 'Enviar ficha e documentos' : 'Baixar e abrir e-mail',
      podeShare ? 'Abre o app de e-mail com tudo anexado.' : 'Baixa os arquivos e abre o e-mail já preenchido para você anexá-los.',
      'mail', function () { enviarAnexos(bEnviar); });
    bEnviar.id = 'btnEnviarAnexos';
    acoes.appendChild(bEnviar);

    var bBaixar = botaoSimples('Baixar tudo', '', 'pdf', baixarPacote);
    bBaixar.id = 'btnBaixarAnexos';
    acoes.appendChild(bBaixar);
    cardEnvio.appendChild(acoes);

    var nota = el('p', 'nota');
    nota.innerHTML = 'Destinatário: <strong>' + S.EMAIL_DESTINO + '</strong>. As fotos ficam só neste aparelho até você enviar; ' +
      'o envio usa o aplicativo de e-mail do aparelho. A conferência verifica se cada documento foi anexado e a qualidade da foto — ' +
      'não lê o conteúdo, então confira se cada arquivo é o documento certo.';
    cardEnvio.appendChild(nota);
    wrap.appendChild(cardEnvio);

    // um único input reaproveitado para câmera e arquivos
    var inp = el('input');
    inp.type = 'file';
    inp.id = 'anexoInput';
    inp.className = 'sr-only';
    inp.addEventListener('change', function () {
      var arquivos = Array.prototype.slice.call(inp.files || []);
      var tipo = inp.dataset.tipo;
      inp.value = '';
      if (arquivos.length) receberArquivos(arquivos, tipo);
    });
    wrap.appendChild(inp);
    return wrap;
  }

  /* Atualiza os chips de formato, a dica e o botão de download. */
  function desenharFormato() {
    $$('#formatoEnvio .chip').forEach(function (c) {
      var on = c.dataset.v === formatoEnvio;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var dica = $('#formatoDica');
    if (dica) {
      dica.textContent = formatoEnvio === 'zip'
        ? 'Um único arquivo compactado com todas as fotos e PDFs originais: ' + FA.nomeZip(St.todos()) + '.'
        : 'As fotos viram um único PDF, uma página por foto; PDFs anexados seguem à parte.';
    }
    var b = $('#btnBaixarAnexos');
    if (b) {
      $('.acao__rot', b).textContent = formatoEnvio === 'zip' ? 'Baixar tudo em ZIP' : 'Baixar tudo em PDF';
      $('.acao__desc', b).textContent = formatoEnvio === 'zip'
        ? 'Ficha assinada e documentos compactados num só arquivo.'
        : 'Ficha assinada e documentos num único PDF, uma página por foto.';
      $('.acao__ic', b).innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22">' + ICONES[formatoEnvio === 'zip' ? 'zip' : 'pdf'] + '</svg>';
    }
  }

  function botaoSimples(titulo, desc, icone, fn) {
    var b = el('button', 'acao');
    b.type = 'button';
    var ic = el('span', 'acao__ic');
    ic.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22">' + ICONES[icone] + '</svg>';
    b.appendChild(ic);
    var t = el('span', 'acao__txt');
    t.appendChild(el('span', 'acao__rot', titulo));
    t.appendChild(el('span', 'acao__desc', desc));
    b.appendChild(t);
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------------------------------------------------------------- */
  /* câmera dentro do app                                              */
  /* ---------------------------------------------------------------- */
  /* Usa a câmera que existir onde o app roda — traseira no celular, webcam
     no computador — via getUserMedia, com troca entre câmeras. Tudo local:
     o quadro capturado vira um arquivo JPEG que segue o caminho normal dos
     anexos. No APK (sem permissão de câmera em tempo de execução) e onde
     getUserMedia não existe, cai para o seletor do aparelho (input capture). */
  var cam = { stream: null, tipo: '', cameras: [], indice: 0, capturado: null, tiradas: 0 };
  var CHAVE_CAMERA = 'abramus.camera';

  function cameraDisponivel() {
    return !emAppNativo() && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      global.isSecureContext !== false;
  }

  function tirarFoto(tipo, rotulo) {
    if (!cameraDisponivel()) { escolherArquivos(tipo, true); return; }
    cam.tipo = tipo;
    cam.tiradas = 0;
    var box = $('#camera') || construirCamera();
    $('.camera__tit', box).textContent = rotulo;
    $('.camera__cont', box).textContent = '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    modoAoVivo();
    var salvo = '';
    try { salvo = localStorage.getItem(CHAVE_CAMERA) || ''; } catch (e) {}
    ligarCamera(salvo);
  }

  function construirCamera() {
    var box = el('div', 'camera');
    box.id = 'camera';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Câmera');
    box.hidden = true;
    box.innerHTML =
      '<div class="camera__topo">' +
        '<p class="camera__tit"></p>' +
        '<span class="camera__cont"></span>' +
        '<button type="button" class="icon-btn camera__fechar" aria-label="Fechar câmera">' +
          '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="camera__palco">' +
        '<video class="camera__video" autoplay playsinline muted></video>' +
        '<img class="camera__foto" alt="Foto capturada" hidden>' +
        '<div class="camera__guia" aria-hidden="true"></div>' +
        '<p class="camera__msg" hidden></p>' +
      '</div>' +
      '<div class="camera__barra camera__barra--vivo">' +
        '<button type="button" class="camera__lado camera__arquivo">Escolher arquivo</button>' +
        '<button type="button" class="camera__disparo" aria-label="Capturar foto"><span></span></button>' +
        '<button type="button" class="camera__lado camera__trocar" style="visibility:hidden">' +
          '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9.5 12.5 2.5-2.5 2.5 2.5M12 10v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '<span>Trocar câmera</span></button>' +
      '</div>' +
      '<div class="camera__barra camera__barra--revisar" hidden>' +
        '<button type="button" class="btn btn--ghost camera__refazer">Tirar de novo</button>' +
        '<button type="button" class="btn btn--outline camera__outra">Usar e tirar outra</button>' +
        '<button type="button" class="btn btn--primary camera__usar">Usar foto</button>' +
      '</div>';
    document.body.appendChild(box);

    $('.camera__fechar', box).addEventListener('click', fecharCamera);
    $('.camera__disparo', box).addEventListener('click', capturar);
    $('.camera__trocar', box).addEventListener('click', trocarCamera);
    $('.camera__arquivo', box).addEventListener('click', function () {
      var tipo = cam.tipo;
      fecharCamera();
      escolherArquivos(tipo, false);
    });
    $('.camera__refazer', box).addEventListener('click', modoAoVivo);
    $('.camera__usar', box).addEventListener('click', function () { usarCaptura(false); });
    $('.camera__outra', box).addEventListener('click', function () { usarCaptura(true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !box.hidden) fecharCamera();
    });
    // câmera ligada em aba escondida gasta bateria e mantém a luz acesa
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !box.hidden) fecharCamera();
    });
    return box;
  }

  function mensagemCamera(txt) {
    var m = $('#camera .camera__msg');
    m.textContent = txt || '';
    m.hidden = !txt;
  }

  function pararStream() {
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = null;
  }

  /* deviceId vazio: pede a traseira se houver (no computador vem a webcam). */
  function ligarCamera(deviceId) {
    pararStream();
    mensagemCamera('Abrindo a câmera…');
    var video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = { ideal: 'environment' };

    return navigator.mediaDevices.getUserMedia({ video: video, audio: false })
      .catch(function (e) {
        // câmera lembrada que sumiu (webcam desconectada): tenta qualquer uma
        if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
          return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        }
        throw e;
      })
      .then(function (stream) {
        if ($('#camera').hidden) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        cam.stream = stream;
        var v = $('#camera .camera__video');
        v.srcObject = stream;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
        mensagemCamera('');
        var atual = stream.getVideoTracks()[0];
        var id = atual && atual.getSettings ? atual.getSettings().deviceId : '';
        try { if (id) localStorage.setItem(CHAVE_CAMERA, id); } catch (e) {}
        // os nomes e a lista completa só vêm depois da permissão concedida
        return navigator.mediaDevices.enumerateDevices().then(function (devs) {
          cam.cameras = devs.filter(function (d) { return d.kind === 'videoinput'; });
          cam.indice = Math.max(0, cam.cameras.map(function (d) { return d.deviceId; }).indexOf(id));
          var bt = $('#camera .camera__trocar');
          // invisível mas ocupando o lugar, para o disparador ficar no centro
          bt.style.visibility = cam.cameras.length < 2 ? 'hidden' : '';
          var prox = cam.cameras[(cam.indice + 1) % cam.cameras.length];
          bt.title = prox && prox.label ? 'Trocar para: ' + prox.label : 'Trocar câmera';
        });
      })
      .catch(function (e) {
        var nome = e && e.name;
        if (nome === 'NotAllowedError' || nome === 'SecurityError') {
          mensagemCamera('O acesso à câmera foi negado. Libere a câmera nas permissões do navegador ou use "Escolher arquivo".');
        } else if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
          mensagemCamera('Nenhuma câmera encontrada neste aparelho. Use "Escolher arquivo".');
        } else if (nome === 'NotReadableError') {
          mensagemCamera('A câmera está em uso por outro aplicativo. Feche-o e tente de novo, ou use "Escolher arquivo".');
        } else {
          mensagemCamera('Não foi possível abrir a câmera. Use "Escolher arquivo".');
        }
        $('#camera .camera__disparo').disabled = true;
      });
  }

  function trocarCamera() {
    if (cam.cameras.length < 2) return;
    cam.indice = (cam.indice + 1) % cam.cameras.length;
    ligarCamera(cam.cameras[cam.indice].deviceId);
  }

  function modoAoVivo() {
    var box = $('#camera');
    cam.capturado = null;
    $('.camera__foto', box).hidden = true;
    $('.camera__foto', box).removeAttribute('src');
    $('.camera__video', box).hidden = false;
    $('.camera__guia', box).hidden = false;
    $('.camera__barra--vivo', box).hidden = false;
    $('.camera__barra--revisar', box).hidden = true;
    $('.camera__disparo', box).disabled = false;
  }

  function capturar() {
    var v = $('#camera .camera__video');
    if (!cam.stream || !v.videoWidth) { toast('A câmera ainda não está pronta.', 'aviso'); return; }
    var cv = document.createElement('canvas');
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    cam.capturado = cv.toDataURL('image/jpeg', 0.92);
    var box = $('#camera');
    var img = $('.camera__foto', box);
    img.src = cam.capturado;
    img.hidden = false;
    $('.camera__video', box).hidden = true;
    $('.camera__guia', box).hidden = true;
    $('.camera__barra--vivo', box).hidden = true;
    $('.camera__barra--revisar', box).hidden = false;
  }

  function usarCaptura(continuar) {
    if (!cam.capturado) return;
    var bin = atob(cam.capturado.split(',')[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    cam.tiradas++;
    var arquivo = new File([arr], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
    var tipo = cam.tipo;
    if (continuar) {
      $('#camera .camera__cont').textContent = cam.tiradas + (cam.tiradas === 1 ? ' foto anexada' : ' fotos anexadas');
      modoAoVivo();
    } else {
      fecharCamera();
    }
    receberArquivos([arquivo], tipo);
  }

  function fecharCamera() {
    pararStream();
    var box = $('#camera');
    if (!box) return;
    $('.camera__video', box).srcObject = null;
    box.hidden = true;
    document.body.style.overflow = '';
  }

  function escolherArquivos(tipo, camera) {
    var inp = $('#anexoInput');
    if (!inp) return;
    inp.dataset.tipo = tipo;
    inp.accept = camera ? 'image/*' : 'image/*,application/pdf,.pdf';
    inp.multiple = !camera;
    if (camera) inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');
    inp.click();
  }

  function receberArquivos(arquivos, tipo) {
    ocupado(true, arquivos.length > 1 ? 'Preparando ' + arquivos.length + ' anexos…' : 'Preparando anexo…');
    var erros = [], avisos = 0, ok = 0;
    arquivos.reduce(function (p, arq) {
      return p.then(function () {
        return FA.adicionar(arq, tipo).then(function (reg) {
          ok++;
          if (reg.avisos && reg.avisos.length) avisos++;
        }).catch(function (e) { erros.push((arq.name ? arq.name + ': ' : '') + (e && e.message || 'falha ao ler o arquivo.')); });
      });
    }, Promise.resolve()).then(function () {
      // o item correspondente do checklist da ficha passa a constar como anexado
      if (ok && /^doc_/.test(tipo)) St.set(tipo, true);
      confirmarIncompleto = false;
      ocupado(false);
      return atualizarAnexos();
    }).then(function () {
      if (erros.length) toast(erros[0], 'erro');
      else if (avisos) toast('Anexado, mas confira a qualidade da foto (veja o aviso).', 'aviso');
      else toast(ok === 1 ? 'Documento anexado.' : ok + ' documentos anexados.');
    });
  }

  function removerAnexo(a) {
    FA.remover(a.id).then(function () {
      confirmarIncompleto = false;
      return atualizarAnexos();
    }).then(function () { toast('Anexo removido.'); });
  }

  function agendarAnexos() {
    clearTimeout(timerAnexos);
    timerAnexos = setTimeout(atualizarAnexos, 120);
  }

  /* Relê os anexos da ficha ativa, valida e redesenha a etapa. */
  function atualizarAnexos() {
    return FA.listar().then(function (lista) {
      anexosLista = lista;
      anexosValidacao = FA.validar(lista, St.todos());
      desenharAnexos();
      atualizarStepper();
    });
  }

  function desenharAnexos() {
    var v = anexosValidacao;
    var box = $('#anexoReqs');
    if (!v || !box) return;

    // resumo
    var card = $('#cardAnexos');
    card.classList.toggle('is-ok', v.ok);
    card.innerHTML = '';
    var ic = el('span', 'card__ic');
    ic.innerHTML = v.ok
      ? '<svg viewBox="0 0 24 24" width="24" height="24"><path d="m5 13 4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    card.appendChild(ic);
    var txt = el('div', 'card__txt');
    if (v.ok) {
      txt.appendChild(el('strong', '', 'Documentos completos'));
      txt.appendChild(el('span', '', 'Tudo o que esta ficha exige foi anexado (' + v.total + (v.total === 1 ? ' arquivo, ' : ' arquivos, ') + FA.mb(v.tamanhoTotal) + ').'));
    } else {
      txt.appendChild(el('strong', '', v.faltando.length === 1 ? 'Falta 1 documento' : 'Faltam ' + v.faltando.length + ' documentos'));
      txt.appendChild(el('span', '', v.faltando.map(function (it) { return it.req.rot; }).join(' · ')));
    }
    v.alertas.forEach(function (a) { txt.appendChild(el('span', 'card__alerta', a)); });
    card.appendChild(txt);

    // um bloco por documento exigido
    box.innerHTML = '';
    // documento não exigido com os dados preenchidos não aparece (só se já tiver anexo, para poder removê-lo)
    v.itens.forEach(function (it) {
      if (it.status === 'naoSeAplica' && !it.arquivos.length) return;
      box.appendChild(blocoRequisito(it, v));
    });

    // anexos de documentos que a ficha não pede mais
    var orf = $('#anexoOrfaos');
    orf.innerHTML = '';
    orf.hidden = !v.orfaos.length;
    if (v.orfaos.length) {
      orf.appendChild(el('p', 'anexo-req__tit', 'Anexos sem documento correspondente'));
      orf.appendChild(el('p', 'anexo-req__dica', 'Mude o documento de cada um ou remova-os; eles não entram no envio como estão.'));
      orf.appendChild(listaArquivos(v.orfaos, v));
    }

    desenharFormato();
    var bEnv = $('#btnEnviarAnexos .acao__rot');
    if (bEnv) bEnv.textContent = confirmarIncompleto ? 'Enviar mesmo assim'
      : (Ex.podeCompartilharArquivos() ? 'Enviar ficha e documentos' : 'Baixar e abrir e-mail');
  }

  var ROTULO_STATUS = {
    ok: 'Completo', falta: 'Falta', incompleto: 'Incompleto', opcional: 'Opcional', naoSeAplica: 'Não exigido'
  };

  function blocoRequisito(it, v) {
    var b = el('div', 'anexo-req anexo-req--' + it.status);
    b.id = 'anexo-' + it.req.k;
    var cab = el('div', 'anexo-req__cab');
    cab.appendChild(el('p', 'anexo-req__tit', it.req.rot));
    cab.appendChild(el('span', 'anexo-status anexo-status--' + it.status, ROTULO_STATUS[it.status]));
    b.appendChild(cab);
    if (it.req.obs) b.appendChild(el('p', 'anexo-req__obs', it.req.obs));
    if (it.req.dica) b.appendChild(el('p', 'anexo-req__dica', it.req.dica));
    if (it.req.motivo) b.appendChild(el('p', 'anexo-req__dica', it.req.motivo));
    b.appendChild(el('p', 'anexo-req__msg', it.mensagem));

    if (it.arquivos.length) b.appendChild(listaArquivos(it.arquivos, v));

    if (it.status !== 'naoSeAplica' || it.arquivos.length) {
      var acoes = el('div', 'anexo-req__acoes');
      var bFoto = el('button', 'btn btn--outline btn--sm');
      bFoto.type = 'button';
      bFoto.innerHTML = ICONE_CAMERA + '<span>Tirar foto</span>';
      bFoto.addEventListener('click', function () { tirarFoto(it.req.k, it.req.rot); });
      var bArq = el('button', 'btn btn--ghost btn--sm');
      bArq.type = 'button';
      bArq.innerHTML = ICONE_CLIPE + '<span>Anexar arquivo</span>';
      bArq.addEventListener('click', function () { escolherArquivos(it.req.k, false); });
      acoes.appendChild(bFoto);
      acoes.appendChild(bArq);
      b.appendChild(acoes);
    }
    if (it.req.alternativa && S.FICHAS[it.req.alternativa]) b.appendChild(blocoAlternativa(it.req.alternativa));
    return b;
  }

  /* Documento que pode ser trocado por outra ficha do app (comprovante de
     residência → Declaração de Residência): abre essa ficha já com os dados
     desta; a declaração assinada volta para cá como anexo do documento. */
  function blocoAlternativa(id) {
    var f = S.FICHAS[id], origem = S.ficha;
    var alt = el('div', 'anexo-req__alt');
    alt.appendChild(el('p', 'anexo-req__dica', 'Não tem comprovante em seu nome? Preencha a ' + f.titulo.toLowerCase() +
      ', imprima, assine e anexe aqui a foto ou o PDF dela.'));
    var bAlt = el('button', 'btn btn--outline btn--sm');
    bAlt.type = 'button';
    bAlt.textContent = 'Preencher ' + f.titulo.toLowerCase();
    bAlt.addEventListener('click', function () {
      trocarFicha(id, origem.id);
      toast('Dados copiados de ' + origem.titulo + ' — ' + origem.publico + '. Depois de assinar, volte pelo Menu e anexe a declaração.');
    });
    alt.appendChild(bAlt);
    return alt;
  }

  function listaArquivos(arquivos, v) {
    var ul = el('div', 'anexo-lista');
    arquivos.forEach(function (a, i) {
      var item = el('div', 'anexo' + (a.avisos && a.avisos.length ? ' anexo--aviso' : ''));
      var mini = el('div', 'anexo__mini');
      if (a.miniatura) {
        var img = el('img');
        img.src = a.miniatura;
        img.alt = 'Anexo ' + (i + 1);
        mini.appendChild(img);
      } else {
        mini.appendChild(el('span', 'anexo__pdf', 'PDF'));
      }
      item.appendChild(mini);

      var info = el('div', 'anexo__info');
      var desc = a.mime === 'application/pdf'
        ? 'PDF' + (a.paginas ? ' · ' + a.paginas + (a.paginas === 1 ? ' página' : ' páginas') : '')
        : 'Foto ' + (i + 1);
      info.appendChild(el('span', 'anexo__nome', desc + ' · ' + FA.mb(a.tamanho || 0)));
      (a.avisos || []).forEach(function (t) { info.appendChild(el('span', 'anexo__aviso', t)); });

      // corrigir o documento ao qual o arquivo pertence
      var sel = el('select', 'input input--sm anexo__tipo');
      sel.setAttribute('aria-label', 'Documento deste anexo');
      v.itens.forEach(function (it) {
        var o = el('option', '', it.req.rot);
        o.value = it.req.k;
        if (it.req.k === a.tipo) o.selected = true;
        sel.appendChild(o);
      });
      if (!v.itens.some(function (it) { return it.req.k === a.tipo; })) {
        var o0 = el('option', '', 'Escolha o documento…');
        o0.value = '';
        o0.selected = true;
        sel.insertBefore(o0, sel.firstChild);
      }
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        FA.mudarTipo(a.id, sel.value).then(function () {
          if (/^doc_/.test(sel.value)) St.set(sel.value, true);
          return atualizarAnexos();
        });
      });
      info.appendChild(sel);
      item.appendChild(info);

      var bx = el('button', 'icon-btn anexo__x');
      bx.type = 'button';
      bx.setAttribute('aria-label', 'Remover anexo');
      bx.title = 'Remover';
      bx.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      bx.addEventListener('click', function () { removerAnexo(a); });
      item.appendChild(bx);
      ul.appendChild(item);
    });
    return ul;
  }

  function primeiroProblema() {
    var v = anexosValidacao;
    if (!v || !v.faltando.length) return null;
    return document.getElementById('anexo-' + v.faltando[0].req.k);
  }

  function destacar(alvo) {
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    alvo.classList.add('pisca');
    setTimeout(function () { alvo.classList.remove('pisca'); }, 1400);
  }

  function validarAnexos() {
    atualizarAnexos().then(function () {
      var v = anexosValidacao;
      if (v.ok) {
        toast(v.alertas.length ? 'Documentos completos. Veja os avisos no resumo.' : 'Documentos completos: pode enviar.',
          v.alertas.length ? 'aviso' : '');
        $('#cardAnexos').scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        toast(v.faltando.length === 1 ? 'Falta 1 documento: ' + v.faltando[0].req.rot + '.'
          : 'Faltam ' + v.faltando.length + ' documentos.', 'aviso');
        destacar(primeiroProblema());
      }
    });
  }

  /* Síncrono até o compartilhamento: usa a lista e a validação já calculadas. */
  function enviarAnexos() {
    var v = anexosValidacao;
    if (!v || !anexosLista.length) {
      toast('Anexe a ficha assinada e os documentos antes de enviar.', 'aviso');
      destacar(primeiroProblema());
      return;
    }
    if (!v.ok && !confirmarIncompleto) {
      confirmarIncompleto = true;
      desenharAnexos();
      toast('Ainda faltam documentos. Toque de novo em "Enviar mesmo assim" para enviar assim.', 'aviso');
      destacar(primeiroProblema());
      return;
    }
    confirmarIncompleto = false;
    var envio = anexosLista.filter(function (a) { return v.orfaos.indexOf(a) < 0; });
    ocupado(true, 'Preparando anexos…');
    Ex.enviarAnexos(envio, v, formatoEnvio)
      .then(function (r) {
        if (r && r.modo === 'download') toast(r.arquivos + (r.arquivos === 1 ? ' arquivo baixado' : ' arquivos baixados') + '. Anexe-os ao e-mail que será aberto.');
        if (r && r.modo === 'nativo' && r.ignorados) toast(r.ignorados + ' PDF(s) anexado(s) não couberam no envio; envie-os à parte.', 'aviso');
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return;
        toast('Não foi possível enviar daqui. Use "Baixar tudo em PDF" e anexe ao e-mail.', 'erro');
      })
      .then(function () { ocupado(false); desenharAnexos(); });
  }

  function baixarPacote() {
    if (!anexosLista.length) {
      toast('Nenhum documento anexado ainda.', 'aviso');
      return;
    }
    var v = anexosValidacao;
    var envio = anexosLista.filter(function (a) { return !v || v.orfaos.indexOf(a) < 0; });
    var zip = formatoEnvio === 'zip';
    ocupado(true, zip ? 'Compactando…' : 'Gerando PDF…');
    Ex.baixarAnexos(envio, formatoEnvio)
      .then(function (arqs) {
        toast(arqs.length === 1 ? (zip ? 'Arquivo compactado: ' : 'PDF gerado: ') + arqs[0].nome : arqs.length + ' arquivos baixados.');
      })
      .catch(function () { toast(zip ? 'Falha ao compactar os documentos.' : 'Falha ao gerar o PDF dos documentos.', 'erro'); })
      .then(function () { ocupado(false); });
  }

  var ICONES = {
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    jpg: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="m4 17 5-5 4 4 3-2 4 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    print: '<path d="M7 9V4h10v5M7 19h10v-5H7v5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 9h14a2 2 0 0 1 2 2v4h-4M7 15H3v-4a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    zip: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 3v2h2v2h-2v2h2v2h-2v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="14" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    check: '<path d="M9 12.5 11 14.5 15.5 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3.5 7 8.5 6 8.5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  };

  function botaoAcao(titulo, desc, icone, fn) {
    var b = el('button', 'acao');
    b.type = 'button';
    var ic = el('span', 'acao__ic');
    ic.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22">' + ICONES[icone] + '</svg>';
    b.appendChild(ic);
    var t = el('span', 'acao__txt');
    t.appendChild(el('span', 'acao__rot', titulo));
    t.appendChild(el('span', 'acao__desc', desc));
    b.appendChild(t);
    // Só baixa a ficha sem nenhuma pendência; com pendência, o toque leva à lista.
    b.addEventListener('click', function () {
      var n = St.pendencias().length;
      if (n > 0) {
        toast('Resolva ' + (n === 1 ? 'a pendência' : 'as ' + n + ' pendências') + ' antes de baixar a ficha para assinar.', 'aviso');
        abrirPendencias();
        return;
      }
      avisarAssinatura(fn, titulo);
    });
    return b;
  }

  /* Toda ação de "Baixar para assinar" passa por este aviso: a ficha só vale
     assinada e acompanhada dos documentos. A ação roda no clique de
     "continuar", ainda dentro do gesto do usuário — Web Share e a janela de
     impressão exigem isso. */
  var acaoEnvioPendente = null;

  function avisarAssinatura(fn, titulo) {
    acaoEnvioPendente = fn;
    // "Baixar PDF" → "Entendi, baixar PDF": o botão diz o que vai acontecer.
    $('#envioOk').textContent = 'Entendi, ' + titulo.charAt(0).toLowerCase() + titulo.slice(1);
    $('#envioEmail').textContent = S.EMAIL_DESTINO;
    $('#envioPasso').textContent = S.ficha.envioPasso;
    $('#envioAlerta').textContent = S.ficha.envioAlerta;
    $('#envioDocsBox').hidden = S.DOCUMENTOS.length === 0;
    $('#envioTitle').textContent = S.ficha.envioTitulo;
    var lista = $('#envioDocs');
    lista.innerHTML = '';
    S.DOCUMENTOS.forEach(function (doc) {
      var li = el('li', '', doc.rot);
      if (doc.obs) li.appendChild(el('span', '', ' — ' + doc.obs));
      lista.appendChild(li);
    });
    abrirSheet('envioSheet');
    setTimeout(function () { $('#envioOk').focus(); }, 60);
  }

  function confirmarEnvio() {
    var fn = acaoEnvioPendente;
    acaoEnvioPendente = null;
    fecharSheets();
    if (fn) fn();
  }

  /* ---------- pré-visualização ---------- */
  function agendarPreview(imediato) {
    if (S.STEPS[stepAtual].id !== 'revisao') return;
    clearTimeout(timerPreview);
    timerPreview = setTimeout(renderPreview, imediato ? 0 : 450);
  }

  function renderPreview() {
    var visor = $('#visor');
    if (!visor) return;
    var destaque = $('#switchDestaque') ? $('#switchDestaque').checked : true;
    R.paginas(St.todos(), { escala: 2, destaque: destaque }).then(function (cvs) {
      canvasesPreview = cvs;
      visor.innerHTML = '';
      cvs.forEach(function (cv, i) {
        var folha = el('div', 'folha');
        cv.className = 'folha__cv';
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', 'Pré-visualização da página ' + (i + 1) + ' da ficha');
        folha.appendChild(cv);
        folha.appendChild(el('span', 'folha__rot', 'Página ' + (i + 1)));
        visor.appendChild(folha);
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* atualização de estado da UI                                       */
  /* ---------------------------------------------------------------- */
  function atualizar() {
    var d = St.todos();
    desenharEntrega();

    // valores + visibilidade + erros
    S.STEPS.forEach(function (step) {
      step.campos.forEach(function (campo) {
        var box = document.getElementById('campo-' + campo.k);
        if (!box) return;

        if (campo.tipo === 'categorias') { atualizarCategorias(); return; }
        if (campo.tipo === 'checklist') {
          campo.itens.forEach(function (it) {
            var b = document.getElementById('f-' + it.k);
            if (b) b.classList.toggle('is-on', d[it.k] === true);
          });
          return;
        }
        if (campo.tipo === 'foto') {
          var prev = $('#fotoPrev');
          if (prev) {
            if (d.foto) prev.innerHTML = '<img src="' + d.foto + '" alt="Pré-visualização da foto 3x4">';
            else prev.innerHTML = '<span>3 × 4</span>';
          }
          return;
        }

        var vis = St.visivel(campo);
        box.hidden = !vis;
        if (!vis) return;

        var entrada = document.getElementById('f-' + campo.k);
        if (campo.tipo === 'radio') {
          $$('.chip', box).forEach(function (c) { c.classList.toggle('is-on', c.dataset.v === d[campo.k]); });
        } else if (campo.tipo === 'multipla') {
          var marcados = Array.isArray(d[campo.k]) ? d[campo.k] : [];
          $$('.check-row', box).forEach(function (b) { b.classList.toggle('is-on', marcados.indexOf(b.dataset.v) >= 0); });
        } else if (entrada && document.activeElement !== entrada) {
          var v = d[campo.k] == null ? '' : d[campo.k];
          if (entrada.value !== v) entrada.value = v;
        }

        var erro = tocados[campo.k] ? St.erroDoCampo(campo) : null;
        var pe = $('.field__err', box);
        if (pe) pe.textContent = erro || '';
        box.classList.toggle('is-erro', !!erro);
        var obr = St.obrigatorio(campo);
        var marca = $('.req', box);
        if (marca) marca.hidden = !obr;
        box.classList.toggle('field--obrigatorio', obr);
      });
    });

    atualizarPendencias();
    atualizarProgresso();
    atualizarStepper();
    atualizarRevisao();
    agendarPreview();
    agendarAnexos();
  }

  function atualizarCategorias() {
    var d = St.todos();
    S.CATEGORIAS.forEach(function (c) {
      var cart = document.getElementById('cat-' + c.k);
      if (!cart) return;
      var ativa = St.categoriaAtiva(c.k);
      cart.classList.toggle('is-on', ativa);
      $('.cat__head', cart).classList.toggle('is-on', ativa);
      $('.cat__corpo', cart).hidden = !ativa;
      $$('.chip', cart).forEach(function (ch) { ch.classList.toggle('is-on', ativa && d['ter_' + c.k] === ch.dataset.v); });
      var inp = document.getElementById('f-terout_' + c.k);
      if (inp) {
        inp.hidden = !(ativa && d['ter_' + c.k] === 'outros');
        if (document.activeElement !== inp) inp.value = d['terout_' + c.k] || '';
      }
      var erro = '';
      if (ativa && tocados['cat_' + c.k]) {
        if (St.vazio(d['ter_' + c.k])) erro = 'Escolha o território.';
        else if (d['ter_' + c.k] === 'outros' && St.vazio(d['terout_' + c.k]) && tocados['terout_' + c.k]) erro = 'Descreva o território.';
      }
      $('.field__err', cart).textContent = erro;
      cart.classList.toggle('is-erro', !!erro);
    });
  }

  function atualizarProgresso() {
    var p = St.progresso();
    $('#progressBar').style.width = p + '%';
    $('#progressBar').parentNode.setAttribute('aria-valuenow', String(p));
  }

  function atualizarStepper() {
    $$('.stepper__item').forEach(function (b) {
      var i = parseInt(b.dataset.index, 10);
      b.classList.toggle('is-on', i === stepAtual);
      if (i === stepAtual) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      var step = S.STEPS[i];
      if (step.anexos) {
        b.classList.toggle('tem-pend', !!anexosValidacao && !anexosValidacao.ok);
        b.classList.toggle('esta-ok', !!anexosValidacao && anexosValidacao.ok);
        return;
      }
      var n = step.revisao ? 0 : St.pendenciasPorStep(step.id).length;
      b.classList.toggle('tem-pend', n > 0);
      b.classList.toggle('esta-ok', n === 0 && !step.revisao);
    });
  }

  function atualizarPendencias() {
    var pend = St.pendencias();
    $('#pendingCount').textContent = String(pend.length);
    $('#pendingLabel').textContent = pend.length === 1 ? 'pendência' : 'pendências';
    $('#btnPending').classList.toggle('is-ok', pend.length === 0);

    var lista = $('#pendingList');
    lista.innerHTML = '';
    if (pend.length === 0) {
      var ok = el('div', 'pend-ok');
      ok.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<p><strong>Tudo preenchido.</strong></p><p>Nenhum campo obrigatório pendente. Você já pode baixar a ficha para assinar.</p>';
      lista.appendChild(ok);
      return;
    }
    var porStep = {};
    pend.forEach(function (p) {
      (porStep[p.stepId] = porStep[p.stepId] || { titulo: p.stepTitulo, itens: [] }).itens.push(p);
    });
    Object.keys(porStep).forEach(function (sid) {
      var grupo = porStep[sid];
      lista.appendChild(el('p', 'pend-grupo', grupo.titulo));
      grupo.itens.forEach(function (p) {
        var b = el('button', 'pend-item pend-item--' + p.tipo);
        b.type = 'button';
        var t = el('span', 'pend-item__txt');
        t.appendChild(el('span', 'pend-item__rot', p.rotulo));
        t.appendChild(el('span', 'pend-item__motivo', p.motivo));
        b.appendChild(t);
        var seta = el('span', 'pend-item__seta');
        seta.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        b.appendChild(seta);
        b.addEventListener('click', function () {
          fecharSheets();
          irParaCampo(p.stepId, p.campoK);
        });
        lista.appendChild(b);
      });
    });
  }

  function atualizarRevisao() {
    var card = $('#cardPend');
    if (!card) return;
    var pend = St.pendencias();

    // "Baixar para assinar" só com a ficha sem pendências
    var bloqueado = pend.length > 0;
    $$('#cardAcoes .acao').forEach(function (b) {
      b.classList.toggle('is-bloqueado', bloqueado);
      b.setAttribute('aria-disabled', bloqueado ? 'true' : 'false');
    });
    var nb = $('#notaBloqueio');
    if (nb) {
      nb.hidden = !bloqueado;
      nb.textContent = bloqueado
        ? 'Disponível quando não houver nenhuma pendência (' + pend.length + (pend.length === 1 ? ' restante).' : ' restantes).')
        : '';
    }

    card.classList.toggle('is-ok', pend.length === 0);
    card.innerHTML = '';
    var ic = el('span', 'card__ic');
    ic.innerHTML = pend.length === 0
      ? '<svg viewBox="0 0 24 24" width="24" height="24"><path d="m5 13 4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    card.appendChild(ic);
    var txt = el('div', 'card__txt');
    if (pend.length === 0) {
      txt.appendChild(el('strong', '', 'Ficha completa'));
      txt.appendChild(el('span', '', 'Todos os campos obrigatórios foram preenchidos.'));
    } else {
      txt.appendChild(el('strong', '', pend.length + (pend.length === 1 ? ' pendência obrigatória' : ' pendências obrigatórias')));
      txt.appendChild(el('span', '', pend.slice(0, 3).map(function (p) { return p.rotulo; }).join(' · ') +
        (pend.length > 3 ? ' e mais ' + (pend.length - 3) : '')));
    }
    card.appendChild(txt);
    var b = el('button', 'btn btn--outline btn--sm', 'Ver lista');
    b.type = 'button';
    b.addEventListener('click', abrirPendencias);
    if (pend.length > 0) card.appendChild(b);
  }

  /* ---------------------------------------------------------------- */
  /* navegação                                                         */
  /* ---------------------------------------------------------------- */
  function irPara(i) {
    if (i < 0 || i >= S.STEPS.length) return;
    stepAtual = i;
    $$('.step').forEach(function (s) { s.hidden = parseInt(s.dataset.index, 10) !== i; });
    // na primeira etapa o Voltar leva ao menu principal (tela inicial)
    var ant = $('#btnPrev');
    ant.title = i === 0 ? 'Retornar ao menu principal' : '';
    ant.setAttribute('aria-label', i === 0 ? 'Voltar: retornar ao menu principal' : 'Voltar');
    var prox = $('#btnNext');
    prox.hidden = i === S.STEPS.length - 1;
    var seguinte = S.STEPS[i + 1] || {};
    prox.textContent = seguinte.revisao ? 'Revisar' : seguinte.anexos ? 'Documentos' : 'Avançar';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    atualizarStepper();
    var ativo = $('.stepper__item.is-on');
    if (ativo && ativo.scrollIntoView) ativo.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (S.STEPS[i].revisao) agendarPreview(true);
    if (S.STEPS[i].anexos) atualizarAnexos();
  }

  /* Permite abrir direto numa etapa via #id — usado pelo atalho do manifest. */
  function indiceDoHash() {
    var id = (location.hash || '').replace('#', '');
    var idx = 0;
    S.STEPS.forEach(function (s, i) { if (s.id === id) idx = i; });
    return idx;
  }

  function irParaCampo(stepId, campoK) {
    var idx = 0;
    S.STEPS.forEach(function (s, i) { if (s.id === stepId) idx = i; });
    irPara(idx);
    setTimeout(function () {
      var alvo = document.getElementById('f-' + campoK) || document.getElementById('campo-' + campoK);
      if (!alvo) return;
      var box = alvo.closest ? (alvo.closest('.field') || alvo.closest('.cat') || alvo) : alvo;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.classList.add('pisca');
      setTimeout(function () { box.classList.remove('pisca'); }, 1400);
      if (alvo.focus && /INPUT|SELECT|TEXTAREA/.test(alvo.tagName)) {
        try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); }
      }
    }, 320);
  }

  function avancar() {
    var step = S.STEPS[stepAtual];
    step.campos.forEach(function (c) {
      tocados[c.k] = true;
      if (c.tipo === 'categorias') {
        S.CATEGORIAS.forEach(function (cat) { tocados['cat_' + cat.k] = true; tocados['ter_' + cat.k] = true; tocados['terout_' + cat.k] = true; });
      }
    });
    var pend = St.pendenciasPorStep(step.id);
    atualizar();
    if (pend.length > 0) {
      toast(pend.length + ' campo(s) desta etapa ainda pendente(s).', 'aviso');
    }
    irPara(stepAtual + 1);
  }

  /* ---------------------------------------------------------------- */
  /* sheets                                                            */
  /* ---------------------------------------------------------------- */
  function abrirSheet(id) {
    var s = document.getElementById(id);
    s.hidden = false;
    requestAnimationFrame(function () { s.classList.add('is-on'); });
    document.body.style.overflow = 'hidden';
  }

  function fecharSheets() {
    $$('.sheet').forEach(function (s) {
      s.classList.remove('is-on');
      setTimeout(function () { s.hidden = true; }, 220);
    });
    document.body.style.overflow = '';
    $('#btnMenu').setAttribute('aria-expanded', 'false');
  }

  function abrirPendencias() {
    atualizarPendencias();
    abrirSheet('pendingSheet');
  }

  /* ---------------------------------------------------------------- */
  /* ficha ativa                                                       */
  /* ---------------------------------------------------------------- */
  /* ?ficha=desligamento abre direto naquela ficha; sem isso, vale a última usada. */
  function fichaInicial() {
    var m = /[?&]ficha=([a-z]+)/.exec(location.search || '');
    if (m && S.FICHAS[m[1]]) return m[1];
    var salva = St.fichaSalva();
    return S.FICHAS[salva] ? salva : 'filiacao';
  }

  /* A tela inicial só aponta uma ficha como "Atual" (card e pílula "Em
     andamento") depois que ela foi escolhida nesta sessão — ao abrir o app,
     a última ficha usada fica carregada, mas nenhum card aparece marcado. */
  var fichaEscolhida = false;

  function aplicarFicha() {
    var f = S.ficha;
    $('#brandTitulo').textContent = f.titulo;
    $('#brandPublico').textContent = f.publicoBarra || f.publico;
    document.title = f.titulo + ' — ABRAMUS';
    $('#menuFichaAtual').textContent = 'Em andamento: ' + f.titulo;
    $('#menuFichaAtual').parentNode.hidden = !fichaEscolhida;
    $$('[data-ficha]').forEach(function (b) {
      var ativa = fichaEscolhida && b.dataset.ficha === f.id;
      b.classList.toggle('is-on', ativa);
      if (ativa) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  /* Tela inicial: escolha da ficha (sempre por um card; o da ficha atual
     continua de onde parou). Aberta pelo botão Menu, o Esc volta à ficha. */
  var inicioVoltavel = false;
  function abrirInicio(voltavel) {
    var t = $('#inicio');
    inicioVoltavel = !!voltavel;
    t.hidden = false;
    t.scrollTop = 0;
    if (fichaEscolhida) mostrarDocsInicio(S.ficha.id);
  }

  function fecharInicio() {
    $('#inicio').hidden = true;
  }

  /* origem: ficha de onde se veio (ex.: filiação → declaração de residência),
     cujos dados comuns preenchem a nova. */
  function trocarFicha(id, origem) {
    fecharSheets();
    if (!fichaEscolhida) { fichaEscolhida = true; aplicarFicha(); }
    if (id === S.ficha.id) return;
    St.usarFicha(id, origem);
    tocados = {};
    stepAtual = 0;
    construir();
    if (!St.get('data_assinatura')) St.set('data_assinatura', St.hojeBR());
    aplicarFicha();
    irPara(0);
    atualizar();
    toast('Agora em: ' + S.ficha.titulo + ' — ' + (S.ficha.publicoBarra || S.ficha.publico) + '. O preenchimento de cada ficha fica salvo.');
  }

  /* Tela inicial: painel com os documentos que cada ficha pede. Mostra a ficha
     do card sob o mouse (ou em foco) e tem abas para o toque, onde não há hover.
     Lê DOCUMENTOS e regrasAnexos de cada ficha; a ficha assinada vem sempre primeiro. */
  var docsInicioId = null;

  function nomeCard(id) {
    var c = $('.ficha-card[data-ficha="' + id + '"]');
    var tipo = c.querySelector('.ficha-card__txt strong').textContent;
    var sub = c.querySelector('.ficha-card__txt span').textContent;
    return { titulo: tipo + ' — ' + sub, aba: tipo === 'Filiação' ? sub : tipo };
  }

  function documentosDaFicha(f) {
    var regras = f.regrasAnexos || {};
    var lista = [{
      rot: f.rotAssinada || 'Ficha assinada',
      obs: f.paginasExtras ? 'Uma ficha para cada herdeiro, impressa e assinada à mão por ele.'
        : 'Impressa e assinada à mão, com todas as páginas.',
      situacao: 'obrigatorio', assinada: true
    }];
    f.DOCUMENTOS.forEach(function (doc) {
      var r = regras[doc.k] || {};
      lista.push({
        rot: doc.rot, obs: doc.obs, dica: r.dica || '',
        situacao: r.exige === 'opcional' ? 'opcional' : (typeof r.exige === 'function' ? 'caso' : 'obrigatorio')
      });
    });
    return lista;
  }

  var SITUACAO_DOC = { obrigatorio: 'Obrigatório', caso: 'Conforme o caso', opcional: 'Opcional' };

  function mostrarDocsInicio(id) {
    if (!S.FICHAS[id] || id === docsInicioId) return;
    docsInicioId = id;
    var docs = documentosDaFicha(S.FICHAS[id]);
    $('#docsInicioTit').textContent = nomeCard(id).titulo;
    var obrig = docs.filter(function (d) { return d.situacao === 'obrigatorio'; }).length;
    $('#docsInicioResumo').textContent = obrig + (obrig === 1 ? ' obrigatório' : ' obrigatórios') + ' · ' + docs.length + ' no total';
    $$('#docsInicioAbas [data-docs]').forEach(function (b) {
      var on = b.dataset.docs === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      // no celular as abas rolam na horizontal: centraliza a escolhida
      var trilho = b.parentNode;
      if (on && trilho.scrollWidth > trilho.clientWidth) {
        trilho.scrollLeft = b.offsetLeft - trilho.offsetLeft - (trilho.clientWidth - b.offsetWidth) / 2;
      }
    });
    var ul = $('#docsInicioLista');
    ul.textContent = '';
    docs.forEach(function (d, i) {
      var li = el('li', 'doc-inicio doc-inicio--' + d.situacao + (d.assinada ? ' doc-inicio--assinada' : ''));
      li.appendChild(el('span', 'doc-inicio__n', String(i + 1)));
      var txt = el('span', 'doc-inicio__txt');
      txt.appendChild(el('span', 'doc-inicio__selo', SITUACAO_DOC[d.situacao]));
      txt.appendChild(el('strong', null, d.rot));
      if (d.obs) txt.appendChild(el('span', null, d.obs));
      if (d.dica) txt.appendChild(el('em', null, d.dica));
      li.appendChild(txt);
      ul.appendChild(li);
    });
  }

  function montarDocsInicio() {
    var abas = $('#docsInicioAbas');
    $$('.ficha-card[data-ficha]').forEach(function (c) {
      var id = c.dataset.ficha;
      var b = el('button', 'docs-inicio__aba', nomeCard(id).aba);
      b.type = 'button';
      b.dataset.docs = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'docsInicioLista');
      b.addEventListener('click', function () { mostrarDocsInicio(id); });
      abas.appendChild(b);
      // passar o mouse ou focar o card (quando aparece o balão "Sobre esta ficha") troca o painel
      c.addEventListener('mouseenter', function () { mostrarDocsInicio(id); });
      c.addEventListener('focus', function () { mostrarDocsInicio(id); });
    });
    // setas trocam de aba (padrão de tablist)
    abas.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var bs = $$('#docsInicioAbas [data-docs]');
      var i = 0;
      bs.forEach(function (b, j) { if (b.dataset.docs === docsInicioId) i = j; });
      var prox = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      mostrarDocsInicio(prox.dataset.docs);
      prox.focus();
      e.preventDefault();
    });
    mostrarDocsInicio(S.ficha.id);
  }

  /* ---------------------------------------------------------------- */
  /* inicialização                                                     */
  /* ---------------------------------------------------------------- */
  function iniciar() {
    St.usarFicha(fichaInicial());
    /* O salvamento é silencioso enquanto dá certo; só a falha interessa ao
       usuário, e uma vez basta — repetir o aviso a cada tecla seria ruído. */
    var avisouFalhaAoSalvar = false;
    St.definirCallbackSalvar(function (estado) {
      if (estado === 'salvo') { avisouFalhaAoSalvar = false; return; }
      if (avisouFalhaAoSalvar) return;
      avisouFalhaAoSalvar = true;
      toast('Sem espaço para salvar o rascunho neste aparelho.', 'erro');
    });

    construir();
    if (!St.get('data_assinatura')) St.set('data_assinatura', St.hojeBR());
    aplicarFicha();
    irPara(indiceDoHash());
    atualizar();

    /* Toque não tem hover: o card ganha o mesmo efeito (.is-tocado) ao ser
       tocado e a ficha abre logo depois, para o efeito chegar a ser visto.
       Rolar a tela (pointercancel) desfaz o efeito sem abrir nada. */
    var abrindoFicha = false;
    $$('[data-ficha]').forEach(function (b) {
      var porToque = false;
      b.addEventListener('pointerdown', function (e) {
        porToque = e.pointerType !== 'mouse';
        if (porToque) b.classList.add('is-tocado');
      });
      ['pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function () { if (!abrindoFicha) b.classList.remove('is-tocado'); });
      });
      b.addEventListener('click', function () {
        if (abrindoFicha) return;
        function abrir() {
          abrindoFicha = false;
          b.classList.remove('is-tocado');
          fecharInicio();
          trocarFicha(b.dataset.ficha);
        }
        if (!porToque) { abrir(); return; }
        abrindoFicha = true;
        b.classList.add('is-tocado');
        setTimeout(abrir, 260);
      });
    });
    /* ?ficha=<id> é um link direto para a ficha: pula a tela inicial (e conta como escolhida). */
    if (/[?&]ficha=/.test(location.search || '')) { fichaEscolhida = true; aplicarFicha(); }
    else abrirInicio(false);
    montarDocsInicio();
    $('#inicioFinalizar').addEventListener('click', pedirSaida);
    $('#anoCopyright').textContent = String(new Date().getFullYear());
    $('#btnVoltarMenu').addEventListener('click', function () { abrirInicio(true); });
    $('#miInicio').addEventListener('click', function () {
      fecharSheets();
      abrirInicio(true);
    });

    window.addEventListener('hashchange', function () { irPara(indiceDoHash()); });

    $('#btnPrev').addEventListener('click', function () {
      if (stepAtual === 0) abrirInicio(true);
      else irPara(stepAtual - 1);
    });
    $('#btnNext').addEventListener('click', avancar);
    $('#btnPending').addEventListener('click', abrirPendencias);
    $('#btnMenu').addEventListener('click', function () {
      this.setAttribute('aria-expanded', 'true');
      abrirSheet('menuSheet');
    });
    $$('[data-close-sheet]').forEach(function (b) { b.addEventListener('click', fecharSheets); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#inicio').hidden && inicioVoltavel && !$('.sheet:not([hidden])')) fecharInicio();
      fecharSheets();
    });

    $('#miDemo').addEventListener('click', function () {
      fecharSheets();
      St.carregarExemplo();
      tocados = {};
      construir();
      irPara(stepAtual);
      atualizar();
      toast('Formulário preenchido com dados de exemplo.');
    });

    // "Limpar formulário" está no menu e também no topo
    function limparFormulario() {
      fecharSheets();
      if (!confirm('Apagar todos os dados preenchidos e os documentos anexados desta ficha?')) return;
      St.limpar();
      FA.limpar();
      tocados = {};
      construir();
      St.set('data_assinatura', St.hojeBR());
      irPara(0);
      atualizar();
      toast('Formulário limpo.');
    }
    $('#miClear').addEventListener('click', limparFormulario);
    $('#btnLimpar').addEventListener('click', limparFormulario);

    /* No APK não há o que instalar: o beforeinstallprompt nunca dispara no
       WebView e o item só confundiria quem já está com o app instalado.
       Em compensação existe um app para fechar — o que numa aba comum do
       navegador não faz sentido, já que a aba não é nossa para fechar. */
    if (emAppNativo()) {
      $('#miInstall').hidden = true;
    }
    /* Sair só existe no APK, onde é uma ação real do app (finishAndRemoveTask).
       Fora dele — aba comum ou PWA instalada, inclusive no iPhone, onde o
       close() não fecha nada — o comando prometeria o que não cumpre. */
    $('#btnSair').hidden = !emAppNativo();
    $('#miSair').hidden = !emAppNativo();

    $('#miSair').addEventListener('click', pedirSaida);
    $('#btnSair').addEventListener('click', pedirSaida);
    $('#confirmSim').addEventListener('click', sairDoApp);
    $('#encerradoReabrir').addEventListener('click', function () {
      $('#encerrado').hidden = true;
      document.body.style.overflow = '';
      abrirInicio(false);
    });
    $('#envioOk').addEventListener('click', confirmarEnvio);

    $('#miInstall').addEventListener('click', function () {
      fecharSheets();
      if (promptInstalar) {
        promptInstalar.prompt();
        promptInstalar = null;
      } else if (emIOS()) {
        /* No iOS não existe beforeinstallprompt: a instalação é manual, e o
           caminho tem nome próprio — falar em "menu do navegador" não ajuda. */
        toast('No Safari, toque em Compartilhar › "Adicionar à Tela de Início".');
      } else {
        toast('Use o menu do navegador › "Adicionar à tela inicial".');
      }
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      promptInstalar = e;
    });

    St.inscrever(function () { /* atualizações são disparadas pela UI */ });

    if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
      return;
    }

    if (emAppNativo()) {
      /* No APK os arquivos vêm de dentro do pacote: já estão sempre
         disponíveis, offline inclusive, e o service worker não acrescenta
         nada. Pior: sendo cache-first, ele serviria os arquivos da versão
         anterior depois de uma atualização do APK. Remove o que uma versão
         antiga do app tenha registrado e apaga os caches dela. */
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      }).catch(function () { /* sem SW registrado, nada a fazer */ });

      if (global.caches && caches.keys) {
        caches.keys().then(function (chaves) {
          chaves.forEach(function (k) { caches.delete(k); });
        }).catch(function () {});
      }
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* funciona mesmo sem SW */ });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
