/* Camada de aplicação: navegação em etapas, formulário, pendências,
   pré-visualização e ações de exportação. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var St = global.FichaState;
  var R = global.FichaRender;
  var Ex = global.FichaExport;

  var stepAtual = 0;
  var tocados = {};
  var promptInstalar = null;

  /* Dentro do APK Android o app já está instalado e os arquivos vêm do próprio
     pacote — as duas coisas mudam o comportamento de instalação e de cache. */
  function emAppNativo() {
    return typeof global.FichaAndroid !== 'undefined' && !!global.FichaAndroid;
  }

  /* PWA instalada: roda em janela própria, sem barra de endereço, então
     fechá-la é fechar o app — diferente de uma aba comum do navegador. */
  function emJanelaInstalada() {
    try {
      return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
             global.navigator.standalone === true;
    } catch (e) { return false; }
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
       ele encerrou. O formulário é remontado vazio porque, se o navegador
       recusar o close(), a tela precisa refletir o que já foi apagado. */
    St.limpar();
    tocados = {};
    construir();
    St.set('data_assinatura', St.hojeBR());
    irPara(0);
    atualizar();
    if (emAppNativo() && global.FichaAndroid.sair) {
      global.FichaAndroid.sair();
      return;
    }
    fecharAba();
  }

  /* Fechar a aba por script só é permitido quando foi o próprio script que a
     abriu. O open('', '_self') é a forma antiga de reivindicar essa condição:
     ainda funciona em parte dos navegadores e é inofensivo nos demais. */
  function fecharAba() {
    try { global.open('', '_self'); } catch (e) { /* bloqueado: segue no close() */ }
    try { global.close(); } catch (e) { /* idem */ }
    /* Se a aba continuar de pé (Chrome e Firefox recusam em aba comum), não
       adianta insistir: o app se despede e deixa o fechamento com o usuário. */
    setTimeout(function () {
      if (!global.closed) telaEncerrada();
    }, 300);
  }

  function telaEncerrada() {
    if (document.getElementById('encerrado')) return;
    var tela = el('div', 'encerrado');
    tela.id = 'encerrado';
    var marca = document.createElement('img');
    marca.src = 'icons/abramus-marca-branca.png';
    marca.alt = 'ABRAMUS — direito autoral levado a sério';
    marca.className = 'encerrado__marca';
    tela.appendChild(marca);
    tela.appendChild(el('h1', 'encerrado__titulo', 'Preenchimento encerrado'));
    tela.appendChild(el('p', 'encerrado__txt', 'Você já pode fechar esta aba.'));
    document.body.appendChild(tela);
    /* Some com o app inteiro: os dados já foram apagados, e deixar o
       formulário atrás desta tela só convidaria a recomeçar sem querer. */
    ['.app-bar', '.main', '.bottom-bar'].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (n) n.hidden = true;
    });
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
    if (campo.tipo === 'assinatura') return construirAssinatura(box, campo);

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
    if (campo.tipo !== 'radio') entrada.id = idInput;
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

  /* ---------- assinatura ---------- */
  function construirAssinatura(box, campo) {
    box.classList.add('field--bloco');
    box.appendChild(el('p', 'field__label', campo.rotulo));
    if (campo.dica) box.appendChild(el('p', 'field__hint', campo.dica));

    var pad = el('div', 'pad');
    var cv = el('canvas', 'pad__cv');
    cv.id = 'f-assinatura';
    pad.appendChild(cv);
    pad.appendChild(el('span', 'pad__linha'));
    box.appendChild(pad);

    var acoes = el('div', 'pad__acoes');
    var bLimpa = el('button', 'btn btn--ghost', 'Limpar assinatura');
    bLimpa.type = 'button';
    bLimpa.addEventListener('click', function () { limparPad(cv); St.set('assinatura', ''); });
    acoes.appendChild(bLimpa);
    box.appendChild(acoes);

    setTimeout(function () { iniciarPad(cv); }, 0);
    return box;
  }

  function iniciarPad(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var larg = cv.parentNode.clientWidth || 320;
    cv.width = Math.round(larg * dpr);
    cv.height = Math.round(150 * dpr);
    cv.style.height = '150px';
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#10231F';
    cv._g = g;

    var salvo = St.get('assinatura');
    if (salvo) {
      var img = new Image();
      img.onload = function () { g.drawImage(img, 0, 0, larg, 150); };
      img.src = salvo;
    }

    var desenhando = false, ux = 0, uy = 0, sujo = false;

    function pos(ev) {
      var r = cv.getBoundingClientRect();
      var p = ev.touches ? ev.touches[0] : ev;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function inicio(ev) {
      ev.preventDefault();
      desenhando = true;
      var p = pos(ev);
      ux = p.x; uy = p.y;
      g.beginPath();
      g.moveTo(ux, uy);
      g.lineTo(ux + 0.1, uy + 0.1);
      g.stroke();
      sujo = true;
    }
    function move(ev) {
      if (!desenhando) return;
      ev.preventDefault();
      var p = pos(ev);
      g.beginPath();
      g.moveTo(ux, uy);
      g.lineTo(p.x, p.y);
      g.stroke();
      ux = p.x; uy = p.y;
    }
    function fim() {
      if (!desenhando) return;
      desenhando = false;
      if (sujo) St.set('assinatura', cv.toDataURL('image/png'));
    }

    cv.addEventListener('pointerdown', inicio);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', fim);
    cv.addEventListener('touchstart', inicio, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', fim);
  }

  function limparPad(cv) {
    if (!cv._g) return;
    cv._g.clearRect(0, 0, cv.width, cv.height);
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
    cardAcoes.appendChild(el('h2', 'card__title', 'Exportar e enviar'));
    var acoes = el('div', 'acoes');

    acoes.appendChild(botaoAcao('Baixar PDF', 'Ficha completa em A4, 2 páginas.', 'pdf', function () {
      ocupado(true, 'Gerando PDF…');
      Ex.baixarPDF()
        .then(function (a) { toast('PDF gerado: ' + a.nome); })
        .catch(function () { toast('Falha ao gerar o PDF.', 'erro'); })
        .then(function () { ocupado(false); });
    }));

    acoes.appendChild(botaoAcao('Baixar JPG', 'Uma imagem por página, alta resolução.', 'jpg', function () {
      ocupado(true, 'Gerando imagens…');
      Ex.baixarJPG()
        .then(function () { toast('2 imagens JPG geradas.'); })
        .catch(function () { toast('Falha ao gerar as imagens.', 'erro'); })
        .then(function () { ocupado(false); });
    }));

    acoes.appendChild(botaoAcao('Imprimir', 'Abre o diálogo de impressão do aparelho.', 'print', function () {
      ocupado(true, 'Preparando impressão…');
      Ex.imprimir()
        .catch(function () { toast('Permita janelas pop-up para imprimir.', 'erro'); })
        .then(function () { ocupado(false); });
    }));

    var podeShare = Ex.podeCompartilharArquivos();
    acoes.appendChild(botaoAcao(
      podeShare ? 'Enviar por e-mail' : 'Abrir e-mail',
      podeShare ? 'Anexa o PDF e abre o app de e-mail.' : 'Abre o e-mail já preenchido. Anexe o PDF baixado.',
      'mail',
      function () { enviarPorEmail(podeShare); }
    ));

    cardAcoes.appendChild(acoes);
    var nota = el('p', 'nota');
    nota.innerHTML = 'Destinatário: <strong>' + S.EMAIL_DESTINO + '</strong>. ' +
      'O envio usa o aplicativo de e-mail do seu aparelho — este app não transmite dados pela internet.';
    cardAcoes.appendChild(nota);
    wrap.appendChild(cardAcoes);

    return wrap;
  }

  var ICONES = {
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    jpg: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="m4 17 5-5 4 4 3-2 4 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    print: '<path d="M7 9V4h10v5M7 19h10v-5H7v5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 9h14a2 2 0 0 1 2 2v4h-4M7 15H3v-4a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
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
    b.addEventListener('click', fn);
    return b;
  }

  function enviarPorEmail(podeShare) {
    var pend = St.pendencias();
    if (pend.length > 0) {
      toast(pend.length + ' campo(s) obrigatório(s) ainda pendente(s).', 'aviso');
    }
    if (podeShare) {
      ocupado(true, 'Preparando anexo…');
      Ex.compartilharPDF()
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          Ex.abrirEmail();
        })
        .then(function () { ocupado(false); });
    } else {
      ocupado(true, 'Gerando PDF…');
      Ex.baixarPDF()
        .then(function () {
          toast('PDF baixado. Anexe-o ao e-mail que será aberto.');
          setTimeout(Ex.abrirEmail, 900);
        })
        .catch(function () { Ex.abrirEmail(); })
        .then(function () { ocupado(false); });
    }
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
        if (campo.tipo === 'assinatura') return;

        var vis = St.visivel(campo);
        box.hidden = !vis;
        if (!vis) return;

        var entrada = document.getElementById('f-' + campo.k);
        if (campo.tipo === 'radio') {
          $$('.chip', box).forEach(function (c) { c.classList.toggle('is-on', c.dataset.v === d[campo.k]); });
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
        '<p><strong>Tudo preenchido.</strong></p><p>Nenhum campo obrigatório pendente. Você já pode exportar a ficha.</p>';
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
    $('#btnPrev').disabled = i === 0;
    var prox = $('#btnNext');
    prox.hidden = i === S.STEPS.length - 1;
    prox.textContent = i === S.STEPS.length - 2 ? 'Revisar' : 'Avançar';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    atualizarStepper();
    var ativo = $('.stepper__item.is-on');
    if (ativo && ativo.scrollIntoView) ativo.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (S.STEPS[i].revisao) agendarPreview(true);
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
  /* inicialização                                                     */
  /* ---------------------------------------------------------------- */
  function iniciar() {
    St.carregar();
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
    irPara(indiceDoHash());
    atualizar();

    window.addEventListener('hashchange', function () { irPara(indiceDoHash()); });

    $('#btnPrev').addEventListener('click', function () { irPara(stepAtual - 1); });
    $('#btnNext').addEventListener('click', avancar);
    $('#btnPending').addEventListener('click', abrirPendencias);
    $('#btnMenu').addEventListener('click', function () {
      this.setAttribute('aria-expanded', 'true');
      abrirSheet('menuSheet');
    });
    $$('[data-close-sheet]').forEach(function (b) { b.addEventListener('click', fecharSheets); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharSheets(); });

    $('#miDemo').addEventListener('click', function () {
      fecharSheets();
      St.carregarExemplo();
      tocados = {};
      construir();
      irPara(stepAtual);
      atualizar();
      toast('Formulário preenchido com dados de exemplo.');
    });

    $('#miClear').addEventListener('click', function () {
      fecharSheets();
      if (!confirm('Apagar todos os dados preenchidos neste aparelho?')) return;
      St.limpar();
      tocados = {};
      construir();
      St.set('data_assinatura', St.hojeBR());
      irPara(0);
      atualizar();
      toast('Formulário limpo.');
    });

    /* No APK não há o que instalar: o beforeinstallprompt nunca dispara no
       WebView e o item só confundiria quem já está com o app instalado.
       Em compensação existe um app para fechar — o que numa aba comum do
       navegador não faz sentido, já que a aba não é nossa para fechar. */
    if (emAppNativo()) {
      $('#miInstall').hidden = true;
    }
    /* A porta na barra é só do APK, onde sair é uma ação real do app. Numa
       aba comum ela prometeria um fechamento que o navegador não permite. */
    $('#btnSair').hidden = !emAppNativo();
    if (emAppNativo() || emJanelaInstalada()) {
      $('#miSair').hidden = false;
    }

    $('#miSair').addEventListener('click', pedirSaida);
    $('#btnSair').addEventListener('click', pedirSaida);
    $('#confirmSim').addEventListener('click', sairDoApp);

    $('#miInstall').addEventListener('click', function () {
      fecharSheets();
      if (promptInstalar) {
        promptInstalar.prompt();
        promptInstalar = null;
      } else {
        toast('Use o menu do navegador › "Adicionar à tela inicial".');
      }
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      promptInstalar = e;
    });

    St.inscrever(function () { /* atualizações são disparadas pela UI */ });

    window.addEventListener('resize', function () {
      clearTimeout(window._rz);
      window._rz = setTimeout(function () {
        var cv = document.getElementById('f-assinatura');
        if (cv && cv.parentNode && Math.abs(cv.clientWidth - cv.parentNode.clientWidth) > 4) iniciarPad(cv);
      }, 300);
    });

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
