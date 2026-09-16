/* Definição da ficha "Proposta de Filiação - Pessoa Física" (ABRAMUS).
   Espelha o PDF ficha_filiacao.pdf, páginas 1 e 2. */
(function (global) {
  'use strict';

  var CATEGORIAS = [
    { k: 'autor',    rot: 'Autor/Compositor' },
    { k: 'interp',   rot: 'Intérprete' },
    { k: 'musico',   rot: 'Músico' },
    { k: 'produtor', rot: 'Produtor Fonográfico' },
    { k: 'editor',   rot: 'Editor' }
  ];

  var TERRITORIOS = [
    { v: 'mundo',  rot: 'Mundo' },
    { v: 'brasil', rot: 'Brasil' },
    { v: 'outros', rot: 'Outros' }
  ];

  var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  var GUICHES = ['SP','RJ','BA','PE','PR','GO'];

  var ESTADO_CIVIL = ['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável','Separado(a)'];

  var DOCUMENTOS = [
    { k: 'doc_carta',  rot: 'Carta de desligamento da sociedade anterior', obs: 'Somente se você já foi filiado a outra associação.' },
    { k: 'doc_ident',  rot: 'Cópia do RG e CPF (ou CNH)', obs: 'Aceita-se RG que contenha o número do CPF.' },
    { k: 'doc_resid',  rot: 'Comprovante de residência', obs: '' },
    { k: 'doc_foto',   rot: 'Foto de rosto com fundo branco', obs: '' },
    { k: 'doc_cessao', rot: 'Cessão de direitos', obs: 'Somente se optar por receber através de pessoa jurídica.' }
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

  function validaFone(v) {
    if (!v) return null;
    var n = soDigitos(v).length;
    return (n === 10 || n === 11) ? null : 'Telefone deve ter DDD + 8 ou 9 dígitos.';
  }

  function casadoOuUniao(d) {
    return d.estado_civil === 'Casado(a)' || d.estado_civil === 'União estável';
  }

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
        { k: 'outros_pseudonimos', rotulo: 'Outros pseudônimos', tipo: 'textarea', dica: 'Separe por vírgula.' },
        { k: 'centro_custo', rotulo: 'Centro de custo', tipo: 'texto', obrigatorio: true, caixaAlta: true, dica: 'Estado onde você é atendido. Ex.: PARANÁ' },
        { k: 'foto', rotulo: 'Foto 3x4', tipo: 'foto', dica: 'A imagem é reduzida e guardada apenas neste aparelho.' }
      ]
    },
    {
      id: 'pessoais',
      titulo: 'Dados pessoais',
      subtitulo: 'Complemento dos dados cadastrais (página 2).',
      campos: [
        { k: 'sexo', rotulo: 'Sexo', tipo: 'radio', obrigatorio: true, opcoes: [{ v: 'Masculino', rot: 'Masculino' }, { v: 'Feminino', rot: 'Feminino' }] },
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
        { k: 'site', rotulo: 'Site', tipo: 'texto', dica: 'Site, perfil ou canal oficial.' }
      ]
    },
    {
      id: 'pagamento',
      titulo: 'Pagamento e documentos',
      subtitulo: 'Guichê de recebimento, declaração e checklist de anexos.',
      campos: [
        { k: 'guiche', rotulo: 'Guichê de sociedade', tipo: 'radio', obrigatorio: true,
          dica: 'Para quem não possui conta bancária. Quem deseja receber em conta de terceiros deve entrar em contato com a associação.',
          opcoes: GUICHES.map(function (g) { return { v: g, rot: g }; }).concat([{ v: 'Outro', rot: 'Outro' }]) },
        { k: 'guiche_outro', rotulo: 'Qual guichê?', tipo: 'texto', caixaAlta: true,
          mostrarSe: function (d) { return d.guiche === 'Outro'; },
          obrigatorioSe: function (d) { return d.guiche === 'Outro'; } },
        { k: 'local_assinatura', rotulo: 'Local da assinatura', tipo: 'texto', obrigatorio: true, largura: 'meio', dica: 'Cidade onde a ficha será assinada.' },
        { k: 'data_assinatura', rotulo: 'Data da assinatura', tipo: 'data', obrigatorio: true, largura: 'meio', valida: validaData },
        { k: 'assinatura', rotulo: 'Assinatura', tipo: 'assinatura', dica: 'Desenhe a assinatura ou deixe em branco para assinar a ficha impressa à mão.' },
        { k: '_documentos', rotulo: 'Documentos a enviar para filiacaoonline@abramus.org.br', tipo: 'checklist', itens: DOCUMENTOS }
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

  global.FichaSchema = {
    STEPS: STEPS,
    CATEGORIAS: CATEGORIAS,
    TERRITORIOS: TERRITORIOS,
    DOCUMENTOS: DOCUMENTOS,
    UFS: UFS,
    EMAIL_DESTINO: 'filiacaoonline@abramus.org.br',
    soDigitos: soDigitos,
    validadores: { cpf: validaCPF, data: validaData, nascimento: validaNascimento, email: validaEmail, cep: validaCEP, fone: validaFone }
  };
})(window);
