/* Estado do formulário: máscaras, validação, pendências e persistência local.
   Nada aqui usa rede — o armazenamento é o localStorage do próprio aparelho. */
(function (global) {
  'use strict';

  var S = global.FichaSchema;
  var CHAVE = 'abramus.filiacao.v1';

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

  var MASCARAS = { cpf: mascaraCPF, cep: mascaraCEP, data: mascaraData, fone: mascaraFone };

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
        if (campo.tipo === 'checklist' || campo.tipo === 'foto' || campo.tipo === 'assinatura') return;
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

  function salvar() {
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(dados));
        aoSalvar('salvo');
      } catch (e) {
        aoSalvar('erro');
      }
    }, 250);
  }

  function carregar() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (bruto) dados = JSON.parse(bruto) || {};
    } catch (e) {
      dados = {};
    }
    return dados;
  }

  function limpar() {
    dados = {};
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    notifica();
  }

  /* Dados de demonstração: pessoa fictícia, sem qualquer vínculo com filiados
     ou com a ABRAMUS. CPF e telefones são números de teste; o domínio
     example.com é reservado pela RFC 2606 e não pertence a ninguém. */
  function carregarExemplo() {
    dados = {
      cat_autor: true, ter_autor: 'mundo',
      cat_interp: true, ter_interp: 'brasil',
      nome: 'MARIA EXEMPLO DA SILVA',
      nascimento: '15/03/1990',
      cpf: '123.456.789-09',
      rg: '12.345.678-9',
      rg_orgao: 'SSPSP',
      pseudonimo: 'MARIA EXEMPLO',
      centro_custo: 'SÃO PAULO',
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
      guiche: 'SP',
      local_assinatura: 'São Paulo',
      data_assinatura: hojeBR(),
      doc_ident: true, doc_resid: true, doc_foto: true
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
    limpar: limpar,
    carregarExemplo: carregarExemplo,
    hojeBR: hojeBR,
    definirCallbackSalvar: function (fn) { aoSalvar = fn; }
  };
})(window);
