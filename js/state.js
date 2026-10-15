/* Estado do formulário: máscaras, validação, pendências e persistência local.
   Nada aqui usa rede — o armazenamento é o localStorage do próprio aparelho. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  // Cada ficha tem o próprio rascunho (S.ficha.chave); esta guarda qual está aberta.
  var CHAVE_FICHA = 'abramus.ficha';

  var dados = {};
  var ouvintes = [];

  /* ---------- máscaras ---------- */
  function mascaraCPF(v) {
    var d = S.soDigitos(v).slice(0, 11), r = '';
    if (d.length > 9) r = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    else if (d.length > 6) r = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    else if (d.length > 3) r = d.slice(0, 3) + '.' + d.slice(3);
    else r = d;
    return r;
  }

  function mascaraCNPJ(v) {
    var d = S.soDigitos(v).slice(0, 14), r = d;
    if (d.length > 12) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    else if (d.length > 8) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
    else if (d.length > 5) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5);
    else if (d.length > 2) r = d.slice(0, 2) + '.' + d.slice(2);
    return r;
  }

  function mascaraCEP(v) {
    var d = S.soDigitos(v).slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  }

  function mascaraData(v) {
    var d = S.soDigitos(v).slice(0, 8);
    if (d.length > 4) return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
    if (d.length > 2) return d.slice(0, 2) + '/' + d.slice(2);
    return d;
  }

  function mascaraFone(v) {
    var d = S.soDigitos(v).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  var MASCARAS = { cpf: mascaraCPF, cnpj: mascaraCNPJ, cep: mascaraCEP, data: mascaraData, fone: mascaraFone };

  function aplicaMascara(tipo, valor) {
    return MASCARAS[tipo] ? MASCARAS[tipo](valor) : valor;
  }

  /* ---------- acesso ---------- */
  function get(k) { return dados[k]; }

  function set(k, v) {
    if (dados[k] === v) return false;
    dados[k] = v;
    salvar();
    notifica();
    return true;
  }

  function todos() { return dados; }

  function inscrever(fn) { ouvintes.push(fn); }

  function notifica() {
    for (var i = 0; i < ouvintes.length; i++) { ouvintes[i](dados); }
  }

  /* ---------- categorias ---------- */
  function categoriaAtiva(k) { return dados['cat_' + k] === true; }

  function categoriasSelecionadas() {
    return S.CATEGORIAS.filter(function (c) { return categoriaAtiva(c.k); });
  }

  function territorioTexto(k) {
    var t = dados['ter_' + k];
    if (!t) return '';
    if (t === 'outros') return dados['terout_' + k] || 'Outros';
    return t === 'mundo' ? 'Mundo' : 'Brasil';
  }

  /* ---------- visibilidade e obrigatoriedade ---------- */
  function visivel(campo) {
    return typeof campo.mostrarSe === 'function' ? !!campo.mostrarSe(dados) : true;
  }

  function obrigatorio(campo) {
    if (typeof campo.obrigatorioSe === 'function') return !!campo.obrigatorioSe(dados);
    return !!campo.obrigatorio;
  }

  function vazio(v) {
    return v === undefined || v === null || String(v).trim() === '';
  }

  /* ---------- validação de um campo ---------- */
  function erroDoCampo(campo) {
    if (!visivel(campo)) return null;
    var v = dados[campo.k];
    if (obrigatorio(campo) && vazio(v)) return 'Campo obrigatório.';
    if (!vazio(v) && typeof campo.valida === 'function') return campo.valida(v);
    return null;
  }

  /* ---------- pendências ---------- */
  /* Retorna [{ stepId, stepTitulo, campoK, rotulo, motivo, tipo }] */
  function pendencias() {
    var lista = [];
    S.STEPS.forEach(function (step) {
      step.campos.forEach(function (campo) {
        if (campo.tipo === 'categorias') {
          var sel = categoriasSelecionadas();
          if (sel.length === 0) {
            lista.push({ stepId: step.id, stepTitulo: step.titulo, campoK: 'cat_autor',
              rotulo: 'Categoria de filiação', motivo: 'Selecione ao menos uma categoria.', tipo: 'obrigatorio' });
          }
          sel.forEach(function (c) {
            if (vazio(dados['ter_' + c.k])) {
              lista.push({ stepId: step.id, stepTitulo: step.titulo, campoK: 'ter_' + c.k,
                rotulo: 'Território — ' + c.rot, motivo: 'Escolha Mundo, Brasil ou Outros.', tipo: 'obrigatorio' });
            } else if (dados['ter_' + c.k] === 'outros' && vazio(dados['terout_' + c.k])) {
              lista.push({ stepId: step.id, stepTitulo: step.titulo, campoK: 'terout_' + c.k,
                rotulo: 'Território "Outros" — ' + c.rot, motivo: 'Descreva o território.', tipo: 'obrigatorio' });
            }
          });
          return;
        }
        if (campo.tipo === 'checklist' || campo.tipo === 'foto') return;
        if (!visivel(campo)) return;
        var erro = erroDoCampo(campo);
        if (erro) {
          lista.push({ stepId: step.id, stepTitulo: step.titulo, campoK: campo.k, rotulo: campo.rotulo,
            motivo: erro, tipo: erro === 'Campo obrigatório.' ? 'obrigatorio' : 'invalido' });
        }
      });
    });
    return lista;
  }

  function pendenciasPorStep(stepId) {
    return pendencias().filter(function (p) { return p.stepId === stepId; });
  }

  function completo() { return pendencias().length === 0; }

  /* Percentual de preenchimento considerando apenas campos obrigatórios visíveis. */
  function progresso() {
    var total = 0, ok = 0;
    S.STEPS.forEach(function (step) {
      step.campos.forEach(function (campo) {
        if (campo.tipo === 'categorias') {
          total += 1;
          if (categoriasSelecionadas().length > 0) {
            var todasOk = categoriasSelecionadas().every(function (c) {
              var t = dados['ter_' + c.k];
              return !vazio(t) && (t !== 'outros' || !vazio(dados['terout_' + c.k]));
            });
            if (todasOk) ok += 1;
          }
          return;
        }
        if (!visivel(campo) || !obrigatorio(campo)) return;
        total += 1;
        if (!erroDoCampo(campo)) ok += 1;
      });
    });
    return total === 0 ? 0 : Math.round((ok / total) * 100);
  }

  /* ---------- persistência ---------- */
  var timerSalvar = null;
  var aoSalvar = function () {};

  function gravar() {
    timerSalvar = null;
    try {
      localStorage.setItem(S.ficha.chave, JSON.stringify(dados));
      aoSalvar('salvo');
    } catch (e) {
      aoSalvar('erro');
    }
  }

  function salvar() {
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = setTimeout(gravar, 250);
  }

  function lerRascunho(chave) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto ? (JSON.parse(bruto) || null) : null;
    } catch (e) {
      return null;
    }
  }

  function carregar() {
    var salvo = lerRascunho(S.ficha.chave);
    dados = salvo || {};
    // Ficha nova (sem rascunho) aproveita os dados comuns já digitados em outra.
    var h = S.ficha.herdaDe;
    if (!salvo && h) {
      var origem = lerRascunho(S.FICHAS[h.ficha].chave) || {};
      h.chaves.forEach(function (k) { if (!vazio(origem[k])) dados[k] = origem[k]; });
    }
    // Fichas salvas antes do modelo com três formas de pagamento só tinham o guichê.
    if (!dados.forma_pagamento && dados.guiche) dados.forma_pagamento = 'guiche';
    // A foto 3x4 deixou de ser coletada no app (vai anexada em papel); descarta a que ficou salva.
    delete dados.foto;
    // A assinatura desenhada no app também saiu (a ficha é assinada à mão, impressa).
    Object.keys(dados).forEach(function (k) { if (/^(h\d+_)?assinatura$/.test(k)) delete dados[k]; });
    return dados;
  }

  function limpar() {
    if (timerSalvar) { clearTimeout(timerSalvar); timerSalvar = null; }
    dados = {};
    try { localStorage.removeItem(S.ficha.chave); } catch (e) {}
    notifica();
  }

  /* Sair do app descarta o preenchimento de todas as fichas, não só da aberta. */
  function limparTudo() {
    Object.keys(S.FICHAS).forEach(function (id) {
      try { localStorage.removeItem(S.FICHAS[id].chave); } catch (e) {}
    });
    limpar();
  }

  /* ---------- ficha ativa ---------- */
  function fichaSalva() {
    try { return localStorage.getItem(CHAVE_FICHA) || ''; } catch (e) { return ''; }
  }

  function usarFicha(id) {
    // Grava já o rascunho da ficha que sai: o salvamento com atraso cairia na chave da próxima.
    if (timerSalvar) { clearTimeout(timerSalvar); gravar(); }
    S.usar(id);
    try { localStorage.setItem(CHAVE_FICHA, S.ficha.id); } catch (e) {}
    return carregar();
  }

  /* Dados de demonstração: pessoa fictícia, sem qualquer vínculo com filiados
     ou com a ABRAMUS. CPF e telefones são números de teste; o domínio
     example.com é reservado pela RFC 2606 e não pertence a ninguém. */
  var EXEMPLOS = {
    desligamento: function () {
      return {
        sociedade_anterior: 'SOCIEDADE DE EXEMPLO',
        nome: 'MARIA EXEMPLO DA SILVA',
        pseudonimo: 'MARIA EXEMPLO',
        cpf: '123.456.789-09',
        categorias_desligamento: ['autor', 'interp'],
        local_assinatura: 'São Paulo',
        data_assinatura: hojeBR()
      };
    },
    menor: function () {
      return {
        cat_autor: true, ter_autor: 'mundo',
        cat_interp: true, ter_interp: 'brasil',
        nome: 'JOANA EXEMPLO DA SILVA',
        nascimento: '15/03/' + (new Date().getFullYear() - 14),
        cpf: '123.456.789-09',
        rg: '12.345.678-9',
        rg_orgao: 'SSPSP',
        resp_nome: 'ANA EXEMPLO DA SILVA',
        resp_cpf: '987.654.321-00',
        sexo: 'Feminino',
        nacionalidade: 'BRASIL',
        naturalidade: 'SÃO PAULO',
        pai: 'JOÃO EXEMPLO DA SILVA',
        mae: 'ANA EXEMPLO DA SILVA',
        estado_civil: 'Solteiro(a)',
        cep: '00000-000',
        endereco: 'Rua de Exemplo',
        numero: '100',
        bairro: 'Bairro de Exemplo',
        cidade: 'São Paulo',
        uf: 'SP',
        cel: '(11) 90000-0000',
        email: 'ana.exemplo@example.com',
        forma_pagamento: 'guiche',
        guiche: 'SP',
        local_assinatura: 'São Paulo',
        data_assinatura: hojeBR(),
        doc_ident: true, doc_resid: true
      };
    },
    pj: function () {
      return {
        cat_produtor: true, ter_produtor: 'mundo',
        cat_editor: true, ter_editor: 'brasil',
        razao_social: 'EMPRESA DE EXEMPLO LTDA',
        nome_fantasia: 'SELO EXEMPLO',
        cnpj: '11.222.333/0001-81',
        cep: '00000-000',
        endereco: 'Rua de Exemplo',
        numero: '100',
        complemento: 'Sala 1',
        bairro: 'Bairro de Exemplo',
        cidade: 'São Paulo',
        uf: 'SP',
        tel: '(11) 0000-0000',
        resp_nome: 'MARIA EXEMPLO DA SILVA',
        resp_cpf: '123.456.789-09',
        resp_nascimento: '15/03/1980',
        resp_nacionalidade: 'BRASIL',
        resp_naturalidade: 'SÃO PAULO',
        resp_cel: '(11) 90000-0000',
        resp_email: 'maria.exemplo@example.com',
        contato1_nome: 'CARLOS EXEMPLO',
        contato1_setor: 'FINANCEIRO',
        contato1_email: 'financeiro@example.com',
        email_sisrc: 'sisrc@example.com',
        forma_pagamento: 'conta',
        banco: 'BANCO DE EXEMPLO',
        agencia: '0001',
        conta_cidade: 'São Paulo',
        conta_modalidade: 'Corrente',
        conta_numero: '12345-6',
        local_assinatura: 'São Paulo',
        data_assinatura: hojeBR(),
        doc_cnpj: true, doc_rep: true
      };
    },
    herdeiro: function () {
      return {
        cat_autor: true, ter_autor: 'mundo',
        cat_interp: true, ter_interp: 'mundo',
        fal_nome: 'JOSÉ EXEMPLO DA SILVA',
        fal_nascimento: '10/10/1940',
        fal_falecimento: '25/06/2017',
        fal_cpf: '987.654.321-00',
        fal_sexo: 'Masculino',
        fal_nacionalidade: 'BRASIL',
        fal_naturalidade: 'SÃO PAULO',
        fal_pseudonimo: 'ZÉ EXEMPLO',
        nome: 'MARIA EXEMPLO DA SILVA',
        rg: '12.345.678-9',
        rg_orgao: 'SSPSP',
        sexo: 'Feminino',
        nacionalidade: 'BRASIL',
        naturalidade: 'SÃO PAULO',
        pai: 'JOSÉ EXEMPLO DA SILVA',
        mae: 'ANA EXEMPLO DA SILVA',
        estado_civil: 'Solteiro(a)',
        cep: '00000-000',
        endereco: 'Rua de Exemplo',
        numero: '100',
        bairro: 'Bairro de Exemplo',
        cidade: 'São Paulo',
        uf: 'SP',
        cel: '(11) 90000-0000',
        email: 'maria.exemplo@example.com',
        qtd_herdeiros: '2',
        h2_nome: 'PEDRO EXEMPLO DA SILVA',
        h2_rg: '98.765.432-1',
        h2_rg_orgao: 'SSPSP',
        h2_sexo: 'Masculino',
        h2_nacionalidade: 'BRASIL',
        h2_naturalidade: 'SÃO PAULO',
        h2_pai: 'JOSÉ EXEMPLO DA SILVA',
        h2_mae: 'ANA EXEMPLO DA SILVA',
        h2_estado_civil: 'Solteiro(a)',
        h2_cep: '00000-000',
        h2_endereco: 'Rua de Exemplo',
        h2_numero: '200',
        h2_bairro: 'Bairro de Exemplo',
        h2_cidade: 'São Paulo',
        h2_uf: 'SP',
        h2_cel: '(11) 90000-0001',
        h2_email: 'pedro.exemplo@example.com',
        forma_pagamento: 'conta',
        tipo_conta: 'Individual',
        cpf_titular: '123.456.789-09',
        banco: 'BANCO DE EXEMPLO',
        agencia: '0001',
        conta_cidade: 'São Paulo',
        conta_modalidade: 'Corrente',
        conta_numero: '12345-6',
        local_assinatura: 'São Paulo',
        data_assinatura: hojeBR(),
        doc_ident: true, doc_obito: true
      };
    }
  };

  function carregarExemplo() {
    if (EXEMPLOS[S.ficha.id]) {
      dados = EXEMPLOS[S.ficha.id]();
      salvar();
      notifica();
      return;
    }
    dados = {
      cat_autor: true, ter_autor: 'mundo',
      cat_interp: true, ter_interp: 'brasil',
      nome: 'MARIA EXEMPLO DA SILVA',
      nascimento: '15/03/1990',
      cpf: '123.456.789-09',
      rg: '12.345.678-9',
      rg_orgao: 'SSPSP',
      pseudonimo: 'MARIA EXEMPLO',
      sexo: 'Feminino',
      nacionalidade: 'BRASIL',
      naturalidade: 'SÃO PAULO',
      pai: 'JOÃO EXEMPLO DA SILVA',
      mae: 'ANA EXEMPLO DA SILVA',
      estado_civil: 'Casado(a)',
      conjuge: 'CARLOS EXEMPLO DOS SANTOS',
      cep: '00000-000',
      endereco: 'Rua de Exemplo',
      numero: '100',
      bairro: 'Bairro de Exemplo',
      cidade: 'São Paulo',
      uf: 'SP',
      tel: '(11) 0000-0000',
      cel: '(11) 90000-0000',
      email: 'maria.exemplo@example.com',
      forma_pagamento: 'guiche',
      guiche: 'SP',
      local_assinatura: 'São Paulo',
      data_assinatura: hojeBR(),
      doc_ident: true, doc_resid: true
    };
    salvar();
    notifica();
  }

  function hojeBR() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  global.FichaState = {
    get: get,
    set: set,
    todos: todos,
    inscrever: inscrever,
    aplicaMascara: aplicaMascara,
    visivel: visivel,
    obrigatorio: obrigatorio,
    vazio: vazio,
    erroDoCampo: erroDoCampo,
    pendencias: pendencias,
    pendenciasPorStep: pendenciasPorStep,
    completo: completo,
    progresso: progresso,
    categoriaAtiva: categoriaAtiva,
    categoriasSelecionadas: categoriasSelecionadas,
    territorioTexto: territorioTexto,
    carregar: carregar,
    usarFicha: usarFicha,
    fichaSalva: fichaSalva,
    limpar: limpar,
    limparTudo: limparTudo,
    carregarExemplo: carregarExemplo,
    hojeBR: hojeBR,
    definirCallbackSalvar: function (fn) { aoSalvar = fn; }
  };
})(window);
