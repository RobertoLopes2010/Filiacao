/* Definição das fichas da ABRAMUS tratadas pelo app:
   - "Proposta de Filiação - Pessoa Física" (fichafiliacao_PF.pdf, páginas 1 e 2) e suas
     variações Menor de idade (fichafiliacao_PF_Menor.pdf), Pessoa Jurídica
     (fichafiliacao_PJ.pdf) e Herdeiro/Sucessor (fichafiliacao_Herdeiro.pdf);
   - "Pedido de Desligamento - Pessoa Física" (Pedido de desligamento - pessoa física.pdf);
   - "Declaração de Residência" (Declaração de residência ABRAMUS.pdf). */
(function (global) {
  'use strict';

  var CATEGORIAS = [
    { k: 'autor',    rot: 'Autor/Compositor' },
    { k: 'interp',   rot: 'Intérprete' },
    { k: 'musico',   rot: 'Músico' },
    { k: 'produtor', rot: 'Produtor Fonográfico' },
    { k: 'editor',   rot: 'Editor' }
  ];

  /* Pessoa física (PF, menor e herdeiro) não se filia como Editor: só a PJ tem essa categoria. */
  var CATEGORIAS_PF = CATEGORIAS.filter(function (c) { return c.k !== 'editor'; });

  var TERRITORIOS = [
    { v: 'mundo',  rot: 'Mundo' },
    { v: 'brasil', rot: 'Brasil' },
    { v: 'outros', rot: 'Outros' }
  ];

  var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  var GUICHES = ['SP','RJ','BA','PE','PR','GO'];

  var ESTADO_CIVIL = ['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável','Separado(a)'];

  var DOCUMENTOS = [
    { k: 'doc_carta',  rot: 'Carta de desligamento da sociedade anterior', obs: 'Caso exista.' },
    { k: 'doc_ident',  rot: 'Cópia de RG e CPF', obs: '' },
    // sem comprovante, vale a Declaração de Residência (ficha 'residencia'), preenchida no próprio app
    { k: 'doc_resid',  rot: 'Comprovante de residência', obs: 'Ou declaração de residência.', alternativa: 'residencia' },
    { k: 'doc_cessao', rot: 'Cessão de direitos', obs: 'Caso opte pelo recebimento através de pessoa jurídica.' }
  ];

  /* "Dados para pagamento": a ficha pede que se preencha apenas uma das opções. */
  var FORMAS_PAGAMENTO = [
    { v: 'conta',  rot: 'Conta bancária' },
    { v: 'guiche', rot: 'Guichê (sem conta bancária)' },
    { v: 'pj',     rot: 'Pessoa jurídica' }
  ];

  /* ---------- validadores ---------- */
  function soDigitos(s) { return String(s == null ? '' : s).replace(/\D+/g, ''); }

  function validaCPF(v) {
    var c = soDigitos(v);
    if (c.length !== 11) return 'CPF deve ter 11 dígitos.';
    if (/^(\d)\1{10}$/.test(c)) return 'CPF inválido.';
    var i, soma = 0, d1, d2;
    for (i = 0; i < 9; i++) { soma += parseInt(c.charAt(i), 10) * (10 - i); }
    d1 = (soma * 10) % 11; if (d1 === 10) { d1 = 0; }
    if (d1 !== parseInt(c.charAt(9), 10)) return 'CPF inválido.';
    soma = 0;
    for (i = 0; i < 10; i++) { soma += parseInt(c.charAt(i), 10) * (11 - i); }
    d2 = (soma * 10) % 11; if (d2 === 10) { d2 = 0; }
    if (d2 !== parseInt(c.charAt(10), 10)) return 'CPF inválido.';
    return null;
  }

  function validaData(v) {
    if (!v) return null;
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (!m) return 'Use o formato DD/MM/AAAA.';
    var d = parseInt(m[1], 10), mes = parseInt(m[2], 10), a = parseInt(m[3], 10);
    var dt = new Date(a, mes - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d) return 'Data inexistente.';
    if (a < 1900) return 'Data muito antiga.';
    return null;
  }

  function validaNascimento(v) {
    var e = validaData(v);
    if (e) return e;
    if (!v) return null;
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    var dt = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (dt > new Date()) return 'A data de nascimento não pode ser futura.';
    return null;
  }

  function validaEmail(v) {
    if (!v) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'E-mail inválido.';
  }

  function validaCEP(v) {
    if (!v) return null;
    return soDigitos(v).length === 8 ? null : 'CEP deve ter 8 dígitos.';
  }

  function validaCNPJ(v) {
    var c = soDigitos(v);
    if (c.length !== 14) return 'CNPJ deve ter 14 dígitos.';
    if (/^(\d)\1{13}$/.test(c)) return 'CNPJ inválido.';
    function dv(n) {
      var soma = 0, peso = n - 7;
      for (var i = 0; i < n; i++) {
        soma += parseInt(c.charAt(i), 10) * peso--;
        if (peso < 2) peso = 9;
      }
      var r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    }
    if (dv(12) !== parseInt(c.charAt(12), 10) || dv(13) !== parseInt(c.charAt(13), 10)) return 'CNPJ inválido.';
    return null;
  }

  function validaFone(v) {
    if (!v) return null;
    var n = soDigitos(v).length;
    return (n === 10 || n === 11) ? null : 'Telefone deve ter DDD + 8 ou 9 dígitos.';
  }

  function casadoOuUniao(d) {
    return d.estado_civil === 'Casado(a)' || d.estado_civil === 'União estável';
  }

  function pagaEm(forma) {
    return function (d) { return d.forma_pagamento === forma; };
  }
  var porConta = pagaEm('conta'), porGuiche = pagaEm('guiche'), porPJ = pagaEm('pj');

  /* ---------- etapas ---------- */
  var STEPS = [
    {
      id: 'categorias',
      titulo: 'Categorias',
      subtitulo: 'Em qual categoria você se filia e qual território deseja representar?',
      campos: [
        { k: '_categorias', tipo: 'categorias', obrigatorio: true, rotulo: 'Categoria e território de representação' }
      ]
    },
    {
      id: 'identificacao',
      titulo: 'Identificação',
      subtitulo: 'Dados cadastrais da primeira página da ficha.',
      campos: [
        { k: 'nome', rotulo: 'Nome completo', tipo: 'texto', obrigatorio: true, caixaAlta: true, autocomplete: 'name', dica: 'Como consta no documento de identificação.' },
        { k: 'nascimento', rotulo: 'Data de nascimento', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaNascimento },
        { k: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, largura: 'meio', valida: validaCPF, teclado: 'numeric' },
        { k: 'rg', rotulo: 'RG', tipo: 'texto', obrigatorio: true, largura: 'meio' },
        { k: 'rg_orgao', rotulo: 'Órgão expedidor', tipo: 'texto', obrigatorio: true, largura: 'meio', caixaAlta: true, dica: 'Ex.: SSPPR' },
        { k: 'pseudonimo', rotulo: 'Pseudônimo', tipo: 'texto', caixaAlta: true, dica: 'Nome artístico principal.' },
        { k: 'banda', rotulo: 'Nome de banda', tipo: 'texto', caixaAlta: true },
        { k: 'outros_pseudonimos', rotulo: 'Outros pseudônimos', tipo: 'textarea', dica: 'Separe por vírgula.' }
      ]
    },
    {
      id: 'pessoais',
      titulo: 'Dados pessoais',
      subtitulo: 'Complemento dos dados cadastrais (página 2).',
      campos: [
        { k: 'sexo', rotulo: 'Sexo', tipo: 'radio', obrigatorio: true, opcoes: [{ v: 'Masculino', rot: 'Masculino' }, { v: 'Feminino', rot: 'Feminino' }, { v: 'Outro', rot: 'Outro' }] },
        { k: 'nacionalidade', rotulo: 'Nacionalidade', tipo: 'texto', obrigatorio: true, largura: 'meio', caixaAlta: true, dica: 'Ex.: BRASIL' },
        { k: 'naturalidade', rotulo: 'Naturalidade', tipo: 'texto', obrigatorio: true, largura: 'meio', caixaAlta: true, dica: 'Estado ou cidade de nascimento.' },
        { k: 'pai', rotulo: 'Nome do pai', tipo: 'texto', caixaAlta: true },
        { k: 'mae', rotulo: 'Nome da mãe', tipo: 'texto', obrigatorio: true, caixaAlta: true },
        { k: 'estado_civil', rotulo: 'Estado civil', tipo: 'select', obrigatorio: true, largura: 'meio', opcoes: ESTADO_CIVIL.map(function (e) { return { v: e, rot: e }; }) },
        { k: 'conjuge', rotulo: 'Nome do cônjuge', tipo: 'texto', caixaAlta: true, largura: 'meio', mostrarSe: casadoOuUniao, obrigatorioSe: casadoOuUniao },
        { k: 'omb', rotulo: 'Nº OMB', tipo: 'texto', dica: 'Ordem dos Músicos do Brasil, se possuir.' }
      ]
    },
    {
      id: 'contato',
      titulo: 'Endereço e contato',
      subtitulo: 'Onde a ABRAMUS poderá localizar você.',
      campos: [
        { k: 'cep', rotulo: 'CEP', tipo: 'cep', obrigatorio: true, largura: 'meio', valida: validaCEP, teclado: 'numeric', autocomplete: 'postal-code' },
        { k: 'endereco', rotulo: 'Endereço', tipo: 'texto', obrigatorio: true, autocomplete: 'street-address' },
        { k: 'numero', rotulo: 'Número', tipo: 'texto', obrigatorio: true, largura: 'meio' },
        { k: 'complemento', rotulo: 'Complemento', tipo: 'texto', largura: 'meio' },
        { k: 'bairro', rotulo: 'Bairro', tipo: 'texto', obrigatorio: true },
        { k: 'cidade', rotulo: 'Cidade', tipo: 'texto', obrigatorio: true, largura: 'meio' },
        { k: 'uf', rotulo: 'UF', tipo: 'select', obrigatorio: true, largura: 'meio', opcoes: UFS.map(function (u) { return { v: u, rot: u }; }) },
        { k: 'tel', rotulo: 'Telefone fixo', tipo: 'fone', largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'cel', rotulo: 'Celular', tipo: 'fone', obrigatorio: true, largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'email', rotulo: 'E-mail', tipo: 'texto', obrigatorio: true, valida: validaEmail, teclado: 'email', autocomplete: 'email' },
        { k: 'site', rotulo: 'Site, perfil ou canal oficial.', tipo: 'texto', dica: '' }
      ]
    },
    {
      id: 'pagamento',
      titulo: 'Pagamento',
      subtitulo: 'Forma de recebimento, local e data da assinatura.',
      campos: [
        { k: 'forma_pagamento', rotulo: 'Como deseja receber', tipo: 'radio', obrigatorio: true,
          dica: 'Preencha apenas uma das opções. Quem deseja receber em conta bancária de terceiros deve entrar em contato com a associação.',
          opcoes: FORMAS_PAGAMENTO },

        // para quem possui conta bancária
        { k: 'tipo_conta', rotulo: 'Tipo de conta', tipo: 'radio', mostrarSe: porConta, obrigatorioSe: porConta,
          opcoes: [{ v: 'Individual', rot: 'Individual' }, { v: 'Conjunta', rot: 'Conjunta' }] },
        { k: 'cpf_titular', rotulo: 'CPF do titular da conta', tipo: 'cpf', valida: validaCPF, teclado: 'numeric',
          dica: 'Na conta individual, se ficar em branco, vale o seu próprio CPF.',
          mostrarSe: porConta, obrigatorioSe: function (d) { return porConta(d) && d.tipo_conta === 'Conjunta'; } },
        { k: 'banco', rotulo: 'Banco (DOC/TED)', tipo: 'texto', caixaAlta: true, mostrarSe: porConta, obrigatorioSe: porConta },
        { k: 'agencia', rotulo: 'Código da agência', tipo: 'texto', largura: 'meio', teclado: 'numeric', mostrarSe: porConta, obrigatorioSe: porConta },
        { k: 'conta_cidade', rotulo: 'Cidade da agência', tipo: 'texto', largura: 'meio', mostrarSe: porConta, obrigatorioSe: porConta },
        { k: 'conta_modalidade', rotulo: 'Modalidade', tipo: 'radio', mostrarSe: porConta, obrigatorioSe: porConta,
          opcoes: [{ v: 'Corrente', rot: 'Conta corrente' }, { v: 'Poupança', rot: 'Conta poupança' }] },
        { k: 'conta_numero', rotulo: 'Nº da conta', tipo: 'texto', mostrarSe: porConta, obrigatorioSe: porConta },

        // para quem não possui conta bancária
        { k: 'guiche', rotulo: 'Guichê de sociedade', tipo: 'radio', mostrarSe: porGuiche, obrigatorioSe: porGuiche,
          opcoes: GUICHES.map(function (g) { return { v: g, rot: g }; }).concat([{ v: 'Outro', rot: 'Outro' }]) },
        { k: 'guiche_outro', rotulo: 'Qual guichê?', tipo: 'texto', caixaAlta: true,
          mostrarSe: function (d) { return porGuiche(d) && d.guiche === 'Outro'; },
          obrigatorioSe: function (d) { return porGuiche(d) && d.guiche === 'Outro'; } },

        // para quem receber como pessoa jurídica
        { k: 'razao_social', rotulo: 'Razão social', tipo: 'texto', caixaAlta: true, mostrarSe: porPJ, obrigatorioSe: porPJ,
          dica: 'É necessário o envio de cessão de direitos de pessoa física para pessoa jurídica e contrato social da empresa.' },
        { k: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', largura: 'meio', valida: validaCNPJ, teclado: 'numeric', mostrarSe: porPJ, obrigatorioSe: porPJ },
        { k: 'pj_banco', rotulo: 'Banco', tipo: 'texto', largura: 'meio', caixaAlta: true, mostrarSe: porPJ, obrigatorioSe: porPJ },
        { k: 'pj_agencia', rotulo: 'Código da agência', tipo: 'texto', largura: 'meio', teclado: 'numeric', mostrarSe: porPJ, obrigatorioSe: porPJ },
        { k: 'pj_conta', rotulo: 'Nº da conta corrente', tipo: 'texto', largura: 'meio', mostrarSe: porPJ, obrigatorioSe: porPJ },
        { k: 'pj_cidade', rotulo: 'Cidade da agência', tipo: 'texto', mostrarSe: porPJ, obrigatorioSe: porPJ },

        { k: 'local_assinatura', rotulo: 'Local da assinatura', tipo: 'texto', obrigatorio: true, largura: 'meio', dica: 'Cidade onde a ficha será assinada.' },
        { k: 'data_assinatura', rotulo: 'Data da assinatura', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaData }
      ]
    },
    {
      id: 'revisao',
      titulo: 'Revisão',
      subtitulo: 'Confira a ficha preenchida e exporte.',
      revisao: true,
      campos: []
    }
  ];

  /* ---------- Pedido de desligamento — Pessoa Física ----------
     Espelha "Pedido de desligamento - pessoa física.pdf": carta de uma página
     à sociedade anterior. Sem o Editor, que a ficha não lista. */
  var CATEGORIAS_DESLIGAMENTO = CATEGORIAS_PF
    .map(function (c) { return { v: c.k, rot: c.rot }; });

  var STEPS_DESLIGAMENTO = [
    {
      id: 'identificacao',
      titulo: 'Identificação',
      subtitulo: 'A quem o pedido se dirige e quem o assina.',
      campos: [
        { k: 'sociedade_anterior', rotulo: 'Sociedade anterior', tipo: 'texto', obrigatorio: true, caixaAlta: true,
          dica: 'Associação da qual você está se desligando. Ex.: UBC, AMAR, SOCINPRO, SICAM, SBACEM, ASSIM.' },
        { k: 'nome', rotulo: 'Nome completo', tipo: 'texto', obrigatorio: true, caixaAlta: true, autocomplete: 'name', dica: 'Como consta no documento de identificação.' },
        { k: 'pseudonimo', rotulo: 'Nome artístico', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, largura: 'meio', valida: validaCPF, teclado: 'numeric' }
      ]
    },
    {
      id: 'categorias',
      titulo: 'Categorias',
      subtitulo: 'Em quais categorias você se desliga da sociedade anterior?',
      campos: [
        { k: 'categorias_desligamento', rotulo: 'Categorias do desligamento', tipo: 'multipla', obrigatorio: true,
          dica: 'Marque todas as categorias das quais deseja se desligar.', opcoes: CATEGORIAS_DESLIGAMENTO }
      ]
    },
    {
      id: 'assinatura',
      titulo: 'Local e data',
      subtitulo: 'Onde e quando o pedido será assinado.',
      campos: [
        { k: 'local_assinatura', rotulo: 'Local da assinatura', tipo: 'texto', obrigatorio: true, largura: 'meio', dica: 'Cidade onde o pedido será assinado.' },
        { k: 'data_assinatura', rotulo: 'Data da assinatura', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaData }
      ]
    },
    {
      id: 'revisao',
      titulo: 'Revisão',
      subtitulo: 'Confira o pedido preenchido e exporte.',
      revisao: true,
      campos: []
    }
  ];

  /* ---------- Declaração de residência ----------
     Espelha "Declaração de residência ABRAMUS.pdf": declaração de uma página
     para quem não tem comprovante de residência. Os descritores vêm da Pessoa
     Física (campoPF, mais abaixo), por isso as etapas são montadas depois dela. */
  var DOCUMENTOS_RESIDENCIA = [
    { k: 'doc_ident', rot: 'Documento de identidade do requerente', obs: 'Original e cópia.' }
  ];

  /* ---------- variações da Proposta de Filiação ----------
     Menor de idade, Pessoa Jurídica e Herdeiro/Sucessor seguem o modelo da
     Pessoa Física: os campos em comum reaproveitam o descritor (e a chave) dela. */
  function campoPF(k, mudancas) {
    var achado = null;
    STEPS.forEach(function (s) { s.campos.forEach(function (c) { if (c.k === k) achado = c; }); });
    var novo = {};
    Object.keys(achado).forEach(function (p) { novo[p] = achado[p]; });
    Object.keys(mudancas || {}).forEach(function (p) { novo[p] = mudancas[p]; });
    return novo;
  }
  function camposPF(ks) { return ks.map(function (k) { return campoPF(k); }); }

  var REVISAO = STEPS[STEPS.length - 1];
  var CAMPOS_CONTA = ['banco', 'agencia', 'conta_cidade', 'conta_modalidade', 'conta_numero'];
  var CAMPOS_GUICHE = ['guiche', 'guiche_outro'];
  var CAMPOS_PJ = ['razao_social', 'cnpj', 'pj_banco', 'pj_agencia', 'pj_conta', 'pj_cidade'];

  /* Tem menos de 18 anos na data de hoje. */
  function validaNascimentoMenor(v) {
    var e = validaNascimento(v);
    if (e || !v) return e;
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    var maioridade = new Date(parseInt(m[3], 10) + 18, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return maioridade <= new Date() ? 'O titular já tem 18 anos: use a ficha de Pessoa Física.' : null;
  }

  function dataBR(v) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || '');
    return m ? new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)) : null;
  }

  function validaFalecimento(v) {
    var e = validaData(v);
    if (e || !v) return e;
    if (dataBR(v) > new Date()) return 'A data de falecimento não pode ser futura.';
    return null;
  }

  /* --- Menor de idade (fichafiliacao_PF_Menor.pdf) ---
     Igual à Pessoa Física, mais o responsável legal, que assina a ficha. */
  var DOCUMENTOS_MENOR = DOCUMENTOS.map(function (doc) {
    return doc.k === 'doc_ident' ? { k: 'doc_ident', rot: 'Cópia de RG e CPF do titular e do responsável legal', obs: '' } : doc;
  });

  var STEPS_MENOR = [
    STEPS[0],
    {
      id: 'identificacao',
      titulo: 'Identificação',
      subtitulo: 'Dados cadastrais do titular menor de idade (página 1 da ficha).',
      campos: STEPS[1].campos.map(function (c) {
        return c.k === 'nascimento' ? campoPF('nascimento', { valida: validaNascimentoMenor }) : c;
      })
    },
    {
      id: 'responsavel',
      titulo: 'Responsável legal',
      subtitulo: 'Quem responde pelo menor e assina a ficha.',
      campos: [
        { k: 'resp_nome', rotulo: 'Nome do responsável legal', tipo: 'texto', obrigatorio: true, caixaAlta: true,
          dica: 'Pai, mãe ou tutor. O nome sai abaixo da linha de assinatura.' },
        { k: 'resp_cpf', rotulo: 'CPF do responsável legal', tipo: 'cpf', obrigatorio: true, largura: 'meio', valida: validaCPF, teclado: 'numeric' }
      ]
    },
    STEPS[2],
    STEPS[3],
    {
      id: 'pagamento',
      titulo: 'Pagamento',
      subtitulo: 'Forma de recebimento, local e data da assinatura.',
      campos: STEPS[4].campos
    },
    REVISAO
  ];

  /* --- Pessoa Jurídica (fichafiliacao_PJ.pdf) ---
     Só Produtor Fonográfico e Editor; recebe em conta bancária ou guichê. */
  var CATEGORIAS_PJ = CATEGORIAS.filter(function (c) { return c.k === 'produtor' || c.k === 'editor'; });

  var DOCUMENTOS_PJ = [
    DOCUMENTOS[0],
    { k: 'doc_cnpj',  rot: 'Cópia do cartão do CNPJ e do contrato social', obs: '' },
    { k: 'doc_resid', rot: 'Comprovante de endereço da empresa', obs: '' },
    { k: 'doc_rep',   rot: 'Cópia de RG e CPF do representante legal', obs: '' },
    { k: 'doc_banco', rot: 'Cópia de folha de cheque ou do cartão bancário', obs: 'Caso opte pelo pagamento através de DOC/TED.' }
  ];

  var FORMAS_PJ = FORMAS_PAGAMENTO.filter(function (f) { return f.v !== 'pj'; });

  var STEPS_PJ = [
    {
      id: 'categorias',
      titulo: 'Categorias',
      subtitulo: 'Em qual categoria a empresa se filia e qual território deseja representar?',
      campos: STEPS[0].campos
    },
    {
      id: 'empresa',
      titulo: 'Empresa',
      subtitulo: 'Dados cadastrais da pessoa jurídica.',
      campos: [
        campoPF('razao_social', { mostrarSe: null, obrigatorioSe: null, obrigatorio: true, dica: 'Como consta no cartão do CNPJ.' }),
        { k: 'nome_fantasia', rotulo: 'Nome fantasia', tipo: 'texto', caixaAlta: true },
        campoPF('cnpj', { mostrarSe: null, obrigatorioSe: null, obrigatorio: true }),
        { k: 'inscricao_municipal', rotulo: 'Inscrição municipal', tipo: 'texto', largura: 'meio' },
        { k: 'inscricao_estadual', rotulo: 'Inscrição estadual', tipo: 'texto', largura: 'meio' },
        { k: 'sociedade_anterior', rotulo: 'Sociedade anterior', tipo: 'texto', caixaAlta: true,
          dica: 'Associação à qual a empresa pertencia, se houver.' }
      ]
    },
    {
      id: 'contato',
      titulo: 'Endereço e contato',
      subtitulo: 'Onde a ABRAMUS poderá localizar a empresa.',
      campos: camposPF(['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf']).concat([
        campoPF('tel', { obrigatorio: true }),
        campoPF('cel', { obrigatorio: false }),
        { k: 'fax', rotulo: 'Fax', tipo: 'fone', largura: 'meio', valida: validaFone, teclado: 'tel' },
        campoPF('site', { largura: 'meio' })
      ])
    },
    {
      id: 'representante',
      titulo: 'Representante legal',
      subtitulo: 'Quem responde pela empresa e assina a ficha.',
      campos: [
        { k: 'resp_nome', rotulo: 'Nome do representante legal', tipo: 'texto', obrigatorio: true, caixaAlta: true,
          dica: 'O nome sai abaixo da linha de assinatura.' },
        { k: 'resp_cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, largura: 'meio', valida: validaCPF, teclado: 'numeric' },
        { k: 'resp_nascimento', rotulo: 'Data de nascimento', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaNascimento },
        { k: 'resp_nacionalidade', rotulo: 'Nacionalidade', tipo: 'texto', obrigatorio: true, largura: 'meio', caixaAlta: true, dica: 'Ex.: BRASIL' },
        { k: 'resp_naturalidade', rotulo: 'Naturalidade', tipo: 'texto', obrigatorio: true, largura: 'meio', caixaAlta: true },
        { k: 'resp_tel', rotulo: 'Telefone fixo', tipo: 'fone', largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'resp_cel', rotulo: 'Celular', tipo: 'fone', obrigatorio: true, largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'resp_email', rotulo: 'E-mail', tipo: 'texto', obrigatorio: true, valida: validaEmail, teclado: 'email' }
      ]
    },
    {
      id: 'contatos',
      titulo: 'Contatos',
      subtitulo: 'Pessoas da empresa que a ABRAMUS pode procurar.',
      campos: [
        { k: 'contato1_nome', rotulo: 'Contato 1 — nome', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'contato1_setor', rotulo: 'Contato 1 — setor', tipo: 'texto', largura: 'meio', caixaAlta: true, dica: 'Ex.: FINANCEIRO' },
        { k: 'contato1_tel', rotulo: 'Contato 1 — telefone', tipo: 'fone', largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'contato1_email', rotulo: 'Contato 1 — e-mail', tipo: 'texto', largura: 'meio', valida: validaEmail, teclado: 'email' },
        { k: 'contato2_nome', rotulo: 'Contato 2 — nome', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'contato2_setor', rotulo: 'Contato 2 — setor', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'contato2_tel', rotulo: 'Contato 2 — telefone', tipo: 'fone', largura: 'meio', valida: validaFone, teclado: 'tel' },
        { k: 'contato2_email', rotulo: 'Contato 2 — e-mail', tipo: 'texto', largura: 'meio', valida: validaEmail, teclado: 'email' },
        { k: 'email_sisrc', rotulo: 'E-mail para envio do SISRC', tipo: 'texto', valida: validaEmail, teclado: 'email' }
      ]
    },
    {
      id: 'pagamento',
      titulo: 'Pagamento',
      subtitulo: 'Forma de recebimento, local e data da assinatura.',
      campos: [campoPF('forma_pagamento', { opcoes: FORMAS_PJ })]
        .concat(camposPF(CAMPOS_CONTA))
        .concat(camposPF(CAMPOS_GUICHE))
        .concat([
          campoPF('local_assinatura'),
          campoPF('data_assinatura')
        ])
    },
    REVISAO
  ];

  /* --- Herdeiro / Sucessor (fichafiliacao_Herdeiro.pdf) ---
     Quem se filia (e assina) é o herdeiro: usa as chaves da Pessoa Física.
     Os dados do titular falecido ficam em chaves fal_*. */
  var DOCUMENTOS_HERDEIRO = [
    DOCUMENTOS[0],
    { k: 'doc_ident',    rot: 'Cópia de RG e CPF de cada herdeiro e do falecido', obs: '' },
    { k: 'doc_obito',    rot: 'Certidão de óbito e documento da sucessão',
      obs: 'Carta de inventariante, formal de partilha, carta de adjudicação ou alvará judicial.' },
    DOCUMENTOS[2],
    { k: 'doc_banco',    rot: 'Cópia de folha de cheque ou do cartão bancário', obs: 'Caso opte pelo pagamento através de DOC/TED.' }
  ];

  /* Mais de um herdeiro: o principal usa as chaves da Pessoa Física e os
     demais (2 a MAX_HERDEIROS) as mesmas chaves com prefixo h<n>_, só
     visíveis e exigidas quando qtd_herdeiros chega a n. */
  var MAX_HERDEIROS = 6;
  var CAMPOS_HERDEIRO = ['nome', 'rg', 'rg_orgao', 'sexo', 'nacionalidade', 'naturalidade', 'pai', 'mae', 'estado_civil', 'conjuge'];
  var CAMPOS_CONTATO_HERDEIRO = ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'tel', 'cel', 'email'];
  // cada herdeiro informa o próprio pagamento (a ficha dele sai com a conta dele)
  var CAMPOS_PAGAMENTO_HERDEIRO = ['forma_pagamento'].concat(['tipo_conta', 'cpf_titular'], CAMPOS_CONTA, CAMPOS_GUICHE, CAMPOS_PJ);

  function nHerdeiros(d) {
    var n = parseInt(d.qtd_herdeiros, 10);
    return n > 1 ? Math.min(n, MAX_HERDEIROS) : 1;
  }

  /* Dados do herdeiro n sem o prefixo, no formato do herdeiro principal. */
  function dadosHerdeiro(d, n) {
    if (n === 1) return d;
    var p = 'h' + n + '_', o = {};
    Object.keys(d).forEach(function (k) { if (k.indexOf(p) === 0) o[k.slice(p.length)] = d[k]; });
    return o;
  }

  function camposHerdeiroN(n) {
    var p = 'h' + n + '_';
    function ativo(d) { return nHerdeiros(d) >= n; }
    var base = [campoPF('nome', { rotulo: 'Nome completo' })]
      .concat(camposPF(CAMPOS_HERDEIRO.slice(1)))
      .concat(camposPF(CAMPOS_CONTATO_HERDEIRO));
    var pagamento = CAMPOS_PAGAMENTO_HERDEIRO.map(function (k) {
      // como no herdeiro principal: sem CPF do herdeiro na ficha, o do titular da conta é sempre exigido
      return k === 'cpf_titular' ? campoPF(k, { obrigatorioSe: porConta }) : campoPF(k);
    });
    return [{ k: '_h' + n, tipo: 'titulo', rotulo: 'Herdeiro ' + n, mostrarSe: ativo }].concat(base.map(prefixar), [
      { k: '_h' + n + '_pag', tipo: 'titulo', rotulo: 'Herdeiro ' + n + ' — dados para pagamento', mostrarSe: ativo, sub: true }
    ], pagamento.map(prefixar));

    function prefixar(c) {
      var orig = c;
      return campoPF(c.k, {
        k: p + c.k,
        // "Nome completo" → "nome completo", mas siglas ("RG", "CEP") ficam como estão
        rotulo: 'Herdeiro ' + n + ' — ' + (/^[A-ZÀ-Ú][a-zà-ú]/.test(orig.rotulo)
          ? orig.rotulo.charAt(0).toLowerCase() + orig.rotulo.slice(1) : orig.rotulo),
        autocomplete: null,
        dica: '',
        obrigatorio: false,
        mostrarSe: function (d) { return ativo(d) && (!orig.mostrarSe || !!orig.mostrarSe(dadosHerdeiro(d, n))); },
        obrigatorioSe: function (d) {
          if (!ativo(d)) return false;
          return orig.obrigatorioSe ? !!orig.obrigatorioSe(dadosHerdeiro(d, n)) : !!orig.obrigatorio;
        }
      });
    }
  }

  var CAMPOS_OUTROS_HERDEIROS = [
    { k: 'qtd_herdeiros', rotulo: 'Quantos herdeiros assinam a proposta?', tipo: 'radio',
      dica: 'Contando com você. Cada herdeiro preenche os próprios dados e assina a ficha impressa.',
      opcoes: [{ v: '1', rot: 'Só eu' }].concat([2, 3, 4, 5, 6].slice(0, MAX_HERDEIROS - 1).map(function (n) {
        return { v: String(n), rot: String(n) };
      })) }
  ];
  for (var hn = 2; hn <= MAX_HERDEIROS; hn++) CAMPOS_OUTROS_HERDEIROS = CAMPOS_OUTROS_HERDEIROS.concat(camposHerdeiroN(hn));

  var STEPS_HERDEIRO = [
    {
      id: 'categorias',
      titulo: 'Categorias',
      subtitulo: 'Em quais categorias o titular falecido atuava e qual território deseja representar?',
      campos: STEPS[0].campos
    },
    {
      id: 'falecido',
      titulo: 'Titular falecido',
      subtitulo: 'Dados cadastrais de quem deixou os direitos autorais.',
      campos: [
        { k: 'fal_nome', rotulo: 'Nome do titular falecido', tipo: 'texto', obrigatorio: true, caixaAlta: true },
        { k: 'fal_nascimento', rotulo: 'Data de nascimento', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaNascimento },
        { k: 'fal_falecimento', rotulo: 'Data de falecimento', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaFalecimento },
        { k: 'fal_cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, largura: 'meio', valida: validaCPF, teclado: 'numeric' },
        { k: 'fal_rg', rotulo: 'RG', tipo: 'texto', largura: 'meio' },
        { k: 'fal_rg_orgao', rotulo: 'Órgão expedidor', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'fal_sexo', rotulo: 'Sexo', tipo: 'radio', opcoes: campoPF('sexo').opcoes },
        { k: 'fal_nacionalidade', rotulo: 'Nacionalidade', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'fal_naturalidade', rotulo: 'Naturalidade', tipo: 'texto', largura: 'meio', caixaAlta: true },
        { k: 'fal_pseudonimo', rotulo: 'Pseudônimo', tipo: 'texto', caixaAlta: true },
        { k: 'fal_banda', rotulo: 'Nome de banda', tipo: 'texto', caixaAlta: true },
        { k: 'fal_outros_pseudonimos', rotulo: 'Outros pseudônimos', tipo: 'textarea', dica: 'Separe por vírgula.' },
        { k: 'fal_sociedade_anterior', rotulo: 'Sociedade anterior', tipo: 'texto', largura: 'meio', caixaAlta: true,
          dica: 'Associação à qual o titular pertencia, se houver.' },
        { k: 'fal_omb', rotulo: 'Nº OMB', tipo: 'texto', largura: 'meio' }
      ]
    },
    {
      id: 'herdeiro',
      titulo: 'Herdeiro',
      subtitulo: 'Seus dados, como herdeiro ou sucessor — você assina a ficha.',
      campos: [campoPF('nome', { rotulo: 'Nome completo do herdeiro' })]
        .concat(camposPF(['rg', 'rg_orgao', 'sexo', 'nacionalidade', 'naturalidade', 'pai', 'mae', 'estado_civil', 'conjuge']))
    },
    {
      id: 'contato',
      titulo: 'Endereço e contato',
      subtitulo: 'Onde a ABRAMUS poderá localizar você.',
      campos: camposPF(CAMPOS_CONTATO_HERDEIRO)
    },
    {
      id: 'outros',
      titulo: 'Outros herdeiros',
      subtitulo: 'Se a sucessão tem mais de um herdeiro, todos podem assinar a mesma proposta.',
      campos: CAMPOS_OUTROS_HERDEIROS
    },
    {
      id: 'pagamento',
      titulo: 'Pagamento',
      subtitulo: 'Forma de recebimento, local e data da assinatura.',
      campos: STEPS[4].campos.map(function (c) {
        // A ficha do herdeiro não pede o CPF dele: o titular da conta precisa ser informado sempre.
        if (c.k === 'cpf_titular') return campoPF('cpf_titular', { dica: '', obrigatorioSe: porConta });
        return c;
      })
    },
    REVISAO
  ];

  var STEPS_RESIDENCIA = [
    {
      id: 'identificacao',
      titulo: 'Identificação',
      subtitulo: 'Quem declara a residência e assina a declaração.',
      campos: [
        campoPF('nome'),
        campoPF('rg', { rotulo: 'Documento de identidade', dica: 'Número do RG ou de outro documento com foto.' }),
        campoPF('rg_orgao'),
        campoPF('cpf', { largura: null }),
        campoPF('nacionalidade'),
        campoPF('naturalidade')
      ]
    },
    {
      id: 'contato',
      titulo: 'Endereço e contato',
      subtitulo: 'O endereço onde você reside, que a declaração comprova.',
      campos: camposPF(['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'tel', 'cel', 'email'])
    },
    {
      id: 'assinatura',
      titulo: 'Local e data',
      subtitulo: 'Onde e quando a declaração será assinada.',
      campos: [
        campoPF('local_assinatura', { dica: 'Cidade onde a declaração será assinada.' }),
        campoPF('data_assinatura')
      ]
    },
    {
      id: 'revisao',
      titulo: 'Revisão',
      subtitulo: 'Confira a declaração preenchida e exporte.',
      revisao: true,
      campos: []
    }
  ];

  /* ---------- anexos: o que cada ficha exige ----------
     Por documento (chave do checklist): exige = true (padrão) | 'opcional' |
     function (d) -> bool (false = não se aplica, ex.: cessão só com pagamento
     por PJ); minimo = nº de arquivos esperado (número ou function (d)).
     A ficha assinada é sempre exigida, com uma foto por página (ou um PDF). */
  var REGRAS_PF = {
    doc_carta: { exige: 'opcional' },
    doc_cessao: { exige: porPJ, motivo: 'Exigida porque você escolheu receber como pessoa jurídica.' }
  };
  var REGRAS_MENOR = {
    doc_carta: { exige: 'opcional' },
    doc_ident: { minimo: 2, dica: 'Uma imagem para o titular e outra para o responsável legal.' },
    doc_cessao: REGRAS_PF.doc_cessao
  };
  var REGRAS_PJ = {
    doc_carta: { exige: 'opcional' },
    doc_cnpj: { minimo: 2, dica: 'Cartão do CNPJ e contrato social.' },
    doc_banco: { exige: porConta, motivo: 'Exigida porque você escolheu receber em conta bancária.' }
  };
  var REGRAS_HERDEIRO = {
    doc_carta: { exige: 'opcional' },
    doc_ident: { minimo: function (d) { return nHerdeiros(d) + 1; },
      dica: 'Uma imagem para cada herdeiro e outra para o titular falecido.' },
    doc_banco: {
      exige: function (d) { return herdeirosComConta(d) > 0; },
      minimo: function (d) { return herdeirosComConta(d); },
      motivo: 'Exigida para cada herdeiro que escolheu receber em conta bancária.'
    }
  };

  function herdeirosComConta(d) {
    var c = 0;
    for (var i = 1; i <= nHerdeiros(d); i++) if (dadosHerdeiro(d, i).forma_pagamento === 'conta') c++;
    return c;
  }

  /* Primeiro nome de quem a ficha identifica (na PJ, a primeira palavra da razão
     social), sem acento e em minúsculas — sufixo dos arquivos salvos. */
  function primeiroNome(d, chave) {
    var nome = String(d[chave || api.ficha.chaveNome || 'nome'] || '').trim().split(/\s+/)[0] || '';
    return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  }

  /* Sufixo dos arquivos salvos. Herdeiro: primeiro nome do titular falecido e a
     quantidade de herdeiros ("jose-3-herdeiros"); demais fichas: primeiro nome do titular. */
  function sufixoArquivo(d) {
    if (api.ficha.id !== 'herdeiro') return primeiroNome(d);
    var n = nHerdeiros(d), nome = primeiroNome(d, 'fal_nome');
    return (nome ? nome + '-' : '') + n + (n === 1 ? '-herdeiro' : '-herdeiros');
  }

  /* Páginas da ficha impressa (no herdeiro, uma ficha inteira para cada herdeiro). */
  function paginasFicha(d) {
    var f = api.ficha, n = f.paginas;
    if (f.paginasExtras) n *= nHerdeiros(d);
    return n;
  }

  /* Lista do que a ficha ativa pede em anexo, já resolvida para os dados d:
     [{ k, rot, obs, dica, situacao: 'obrigatorio'|'opcional'|'naoSeAplica', minimo, motivo }] */
  function requisitosAnexos(d) {
    var f = api.ficha, regras = f.regrasAnexos || {};
    var pags = paginasFicha(d);
    var lista = [{
      k: 'ficha_assinada',
      rot: f.rotAssinada || 'Ficha assinada',
      obs: f.paginasExtras && nHerdeiros(d) > 1
        ? 'Uma ficha para cada herdeiro (' + nHerdeiros(d) + '), impressa e assinada à mão por ele, com todas as páginas.'
        : 'Impressa e assinada à mão, com todas as páginas.',
      dica: pags === 1 ? 'Uma foto da página assinada, ou o PDF escaneado.'
        : 'Uma foto por página (' + pags + ' páginas), ou um PDF escaneado com todas.',
      situacao: 'obrigatorio',
      minimo: pags,
      porPagina: true
    }];
    f.DOCUMENTOS.forEach(function (doc) {
      var r = regras[doc.k] || {};
      var situacao = 'obrigatorio';
      if (r.exige === 'opcional') situacao = 'opcional';
      else if (typeof r.exige === 'function' && !r.exige(d)) situacao = 'naoSeAplica';
      var minimo = typeof r.minimo === 'function' ? r.minimo(d) : (r.minimo || 1);
      lista.push({ k: doc.k, rot: doc.rot, obs: doc.obs, alternativa: doc.alternativa, dica: r.dica || '', situacao: situacao,
        minimo: minimo, motivo: situacao === 'obrigatorio' ? (r.motivo || '') : '' });
    });
    return lista;
  }

  /* Última etapa de todas as fichas: anexar a ficha assinada e os documentos. */
  var ETAPA_ANEXOS = {
    id: 'anexos',
    titulo: 'Documentos',
    subtitulo: 'Depois de imprimir e assinar, fotografe ou anexe a ficha assinada e os documentos. O app confere se está tudo lá.',
    anexos: true,
    campos: []
  };

  /* ---------- fichas disponíveis ----------
     Cada ficha tem etapas, rascunho (chave do localStorage) e textos próprios.
     O resto do app lê sempre FichaSchema.STEPS/DOCUMENTOS/EMAIL_DESTINO, que
     usar() aponta para a ficha ativa. */
  var FICHAS = {
    filiacao: {
      id: 'filiacao',
      titulo: 'Proposta de Filiação',
      tituloFicha: 'PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA',
      publico: 'Pessoa Física',
      chave: 'abramus.filiacao.v1',
      arquivo: 'filiacao-abramus',
      paginas: 2,
      STEPS: STEPS,
      DOCUMENTOS: DOCUMENTOS,
      regrasAnexos: REGRAS_PF,
      CATEGORIAS: CATEGORIAS_PF,
      email: 'filiacaoonline@abramus.org.br',
      envioTitulo: 'Assine a ficha antes de enviar',
      envioPasso: 'Assim que assinar, envie a ficha e os documentos obrigatórios',
      envioAlerta: 'A filiação só é analisada com a ficha assinada e os documentos completos.'
    },
    menor: {
      id: 'menor',
      titulo: 'Proposta de Filiação',
      tituloFicha: 'PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA — MENOR DE IDADE',
      publico: 'Menor de idade',
      chave: 'abramus.menor.v1',
      arquivo: 'filiacao-menor-abramus',
      paginas: 2,
      STEPS: STEPS_MENOR,
      DOCUMENTOS: DOCUMENTOS_MENOR,
      regrasAnexos: REGRAS_MENOR,
      CATEGORIAS: CATEGORIAS_PF,
      email: 'filiacaoonline@abramus.org.br',
      envioTitulo: 'Assine a ficha antes de enviar',
      envioPasso: 'Assim que o responsável legal assinar, envie a ficha e os documentos obrigatórios',
      envioAlerta: 'A filiação só é analisada com a ficha assinada pelo responsável legal e os documentos completos.'
    },
    pj: {
      id: 'pj',
      titulo: 'Proposta de Filiação',
      tituloFicha: 'PROPOSTA DE FILIAÇÃO — PESSOA JURÍDICA',
      publico: 'Pessoa Jurídica',
      chave: 'abramus.pj.v1',
      arquivo: 'filiacao-pj-abramus',
      paginas: 2,
      STEPS: STEPS_PJ,
      DOCUMENTOS: DOCUMENTOS_PJ,
      regrasAnexos: REGRAS_PJ,
      CATEGORIAS: CATEGORIAS_PJ,
      // nome de arquivo e assunto do e-mail usam a empresa, não uma pessoa
      chaveNome: 'razao_social',
      documento: { rot: 'CNPJ', k: 'cnpj' },
      email: 'filiacaoonline@abramus.org.br',
      envioTitulo: 'Assine a ficha antes de enviar',
      envioPasso: 'Assim que o representante legal assinar, envie a ficha e os documentos obrigatórios',
      envioAlerta: 'A filiação só é analisada com a ficha assinada pelo representante legal e os documentos completos.'
    },
    herdeiro: {
      id: 'herdeiro',
      titulo: 'Proposta de Filiação',
      tituloFicha: 'PROPOSTA DE FILIAÇÃO — PESSOA FÍSICA — HERDEIRO / SUCESSOR',
      publico: 'Herdeiro / Sucessor',
      chave: 'abramus.herdeiro.v1',
      arquivo: 'filiacao-herdeiro-abramus',
      paginas: 2,
      paginasExtras: true,   // uma ficha de 2 páginas para cada herdeiro
      STEPS: STEPS_HERDEIRO,
      DOCUMENTOS: DOCUMENTOS_HERDEIRO,
      regrasAnexos: REGRAS_HERDEIRO,
      CATEGORIAS: CATEGORIAS_PF,
      email: 'filiacaoonline@abramus.org.br',
      envioTitulo: 'Assine a ficha antes de enviar',
      envioPasso: 'Assim que assinar, envie a ficha e os documentos obrigatórios',
      envioAlerta: 'A filiação só é analisada com a ficha assinada e os documentos completos, inclusive os da sucessão.'
    },
    desligamento: {
      id: 'desligamento',
      titulo: 'Pedido de Desligamento',
      tituloFicha: 'PEDIDO DE DESLIGAMENTO — PESSOA FÍSICA',
      publico: 'Pessoa Física',
      // só o header: a carta em si é de pessoa física (pede CPF), como o PDF
      publicoBarra: 'Pessoa Física / Pessoa Jurídica',   // espaços inseparáveis: no celular a linha quebra só depois da barra
      chave: 'abramus.desligamento.v1',
      arquivo: 'desligamento-abramus',
      paginas: 1,
      STEPS: STEPS_DESLIGAMENTO,
      DOCUMENTOS: [],
      rotAssinada: 'Pedido assinado',
      email: 'filiacaoonline@abramus.org.br',
      // Quem pede o desligamento costuma estar se filiando: aproveita o que já foi digitado na filiação.
      herdaDe: { ficha: 'filiacao', chaves: ['nome', 'pseudonimo', 'cpf', 'local_assinatura'] },
      envioTitulo: 'Assine o pedido antes de enviar',
      envioPasso: 'Assim que assinar, envie o pedido',
      envioAlerta: 'O pedido só tem validade com a assinatura do titular.'
    },
    residencia: {
      id: 'residencia',
      titulo: 'Declaração de Residência',
      tituloFicha: 'DECLARAÇÃO DE RESIDÊNCIA',
      publico: 'Pessoa Física',
      chave: 'abramus.residencia.v1',
      arquivo: 'declaracao-residencia-abramus',
      paginas: 1,
      STEPS: STEPS_RESIDENCIA,
      DOCUMENTOS: DOCUMENTOS_RESIDENCIA,
      rotAssinada: 'Declaração assinada',
      email: 'filiacaoonline@abramus.org.br',
      // Substitui o comprovante de residência da filiação: aproveita o que já foi digitado lá.
      // Aberta pelo botão do comprovante (PF, menor, herdeiro), copia da ficha de origem;
      // no menor quem declara é o responsável legal (de: chave na origem; null = não copia).
      herdaDe: { ficha: 'filiacao', chaves: ['nome', 'rg', 'rg_orgao', 'cpf', 'nacionalidade', 'naturalidade',
        'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'tel', 'cel', 'email', 'local_assinatura'],
        de: { menor: { nome: 'resp_nome', cpf: 'resp_cpf', rg: null, rg_orgao: null, nacionalidade: null, naturalidade: null } } },
      envioTitulo: 'Assine a declaração antes de enviar',
      envioPasso: 'Assim que assinar, envie a declaração e o documento de identidade',
      envioAlerta: 'A declaração só tem validade assinada e acompanhada do documento de identidade.'
    }
  };

  Object.keys(FICHAS).forEach(function (id) { FICHAS[id].STEPS = FICHAS[id].STEPS.concat([ETAPA_ANEXOS]); });

  var api = {
    FICHAS: FICHAS,
    CATEGORIAS: CATEGORIAS,
    CATEGORIAS_DESLIGAMENTO: CATEGORIAS_DESLIGAMENTO,
    TERRITORIOS: TERRITORIOS,
    FORMAS_PAGAMENTO: FORMAS_PAGAMENTO,
    UFS: UFS,
    usar: usar,
    soDigitos: soDigitos,
    MAX_HERDEIROS: MAX_HERDEIROS,
    nHerdeiros: nHerdeiros,
    dadosHerdeiro: dadosHerdeiro,
    paginasFicha: paginasFicha,
    primeiroNome: primeiroNome,
    sufixoArquivo: sufixoArquivo,
    CHAVES_HERDEIRO: CAMPOS_HERDEIRO.concat(CAMPOS_CONTATO_HERDEIRO, CAMPOS_PAGAMENTO_HERDEIRO),
    requisitosAnexos: requisitosAnexos,
    validadores: { cpf: validaCPF, cnpj: validaCNPJ, data: validaData, nascimento: validaNascimento, email: validaEmail, cep: validaCEP, fone: validaFone }
  };

  function usar(id) {
    var f = FICHAS[id] || FICHAS.filiacao;
    api.ficha = f;
    api.STEPS = f.STEPS;
    api.DOCUMENTOS = f.DOCUMENTOS;
    api.EMAIL_DESTINO = f.email;
    // categorias da ficha ativa (PF, menor e herdeiro sem Editor; a PJ só tem Produtor Fonográfico e Editor)
    api.CATEGORIAS = f.CATEGORIAS || CATEGORIAS;
    return f;
  }

  usar('filiacao');
  global.FichaSchema = api;
})(window);
