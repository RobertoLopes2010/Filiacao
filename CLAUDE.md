# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

PWA de página única para fichas da ABRAMUS: preenchimento, conferência de pendências, pré-visualização e exportação em PDF/JPG, impressão, anexação da ficha assinada e dos documentos (foto ou arquivo, com validação do que cada ficha exige) e envio por e-mail. Trata cinco fichas, escolhidas no menu (seção "Ficha") ou por `index.html?ficha=<id>`:

| Ficha (`id`) | Especificação | Páginas |
|---|---|---|
| Proposta de Filiação — Pessoa Física (`filiacao`, padrão) | `fichafiliacao_PF.pdf` | 2 |
| Proposta de Filiação — Menor de idade (`menor`) | `fichafiliacao_PF_Menor.pdf` | 2 |
| Proposta de Filiação — Pessoa Jurídica (`pj`) | `fichafiliacao_PJ.pdf` | 2 |
| Proposta de Filiação — Herdeiro / Sucessor (`herdeiro`) | `fichafiliacao_Herdeiro.pdf` | 2 por herdeiro (uma ficha para cada) |
| Pedido de Desligamento — Pessoa Física (`desligamento`) | `Pedido de desligamento - pessoa física.pdf` | 1 (carta à sociedade anterior) |

O PDF de cada ficha é a especificação dela — consulte-o antes de alterar campos ou layout.

Outros PDFs na raiz **não** são especificação: `ficha_filiacao.pdf` é o modelo anterior (substituído). Para ler um PDF: `pypdf` extrai o texto e `pdftoppm` (xpdf, gera `.ppm`; converta com Pillow) mostra o layout.

Divergências deliberadas dos PDFs (não reverter):

- Filiação: a foto 3x4 não é coletada no app nem pedida na ficha impressa — o quadro "Foto 3x4" do PDF (PF e menor) foi retirado e as categorias ocupam a largura toda.
- Filiação (PF e menor): o item "2 (duas) fotos 3x4" foi retirado da lista de documentos.
- Filiações: as listas de documentos foram desmembradas em itens de checklist (ex.: no herdeiro, "Certidão de óbito e documento da sucessão" com os tipos aceitos na observação).
- Herdeiro: aceita até 6 herdeiros na mesma proposta (o PDF tem um só). Com mais de um, o app gera **uma ficha completa (2 páginas) para cada herdeiro**, cada uma no singular ("Eu, <herdeiro>…"), com a assinatura só dele, dados do falecido repetidos e o cabeçalho trazendo, abaixo do título, "Herdeiro n — NOME DO HERDEIRO" (rodapé: "Herdeiro n · 1/2"). Cada herdeiro informa o próprio pagamento (conta, guichê ou PJ, com as mesmas regras do principal) e a ficha dele sai com esses dados; os documentos são um checklist comum, repetido em todas. A folha de cheque é exigida uma vez para cada herdeiro que recebe em conta.
- Filiação PJ: o pagamento em conta tem uma linha só (banco, agência, cidade, c/c, poupança) e não pede tipo de conta nem CPF do titular, como no PDF.
- Desligamento: o "§ 20" do PDF é impresso como "§ 2º" (art. 97 da Lei 9.610/98).
- O app não coleta assinatura (não há área para desenhar): todas as fichas saem com as linhas de assinatura em branco, para assinar à mão depois de imprimir. Rascunhos antigos com `assinatura`/`h<n>_assinatura` são limpos em `carregar()`.
- Todas as fichas impressas levam o logo branco da ABRAMUS no canto superior direito do cabeçalho.

Suposições ainda não confirmadas pelo usuário:

- Anexos: quais documentos são obrigatórios e quantos arquivos cada um pede estão em `regrasAnexos` de cada ficha (`schema.js`) — ex.: carta de desligamento opcional; RG/CPF com 2 arquivos no menor (titular e responsável) e nº de herdeiros + 1 no herdeiro; cartão do CNPJ + contrato social = 2 na PJ; cessão só com pagamento por PJ; folha de cheque só com pagamento em conta (PJ e herdeiro).

- Desligamento: o e-mail de destino é o mesmo da filiação (`filiacaoonline@abramus.org.br`), não há lista de documentos a anexar e o nome do titular é impresso abaixo da linha de assinatura.
- Menor, PJ e herdeiro: o e-mail de destino é o mesmo da filiação PF; quais campos são obrigatórios (na PJ, contatos e e-mail do SISRC são opcionais; no falecido, só nome, nascimento, falecimento e CPF).
- Menor: a data de nascimento precisa indicar menos de 18 anos (senão o validador manda usar a ficha PF).
- Herdeiro: o PDF não pede o CPF do herdeiro, então o app também não pede; por isso, na conta bancária, o CPF do titular é obrigatório mesmo em conta individual.

Arquivos salvos (PDF, JPG, impressão, pacotes de documentos, ZIP) terminam com o sufixo de `FichaSchema.sufixoArquivo(d)`: o **primeiro nome** do titular (primeira palavra de `nome`, ou da razão social na PJ, sem acento) — `filiacao-abramus-maria.pdf`, `filiacao-abramus-maria-pagina-1.jpg`; no herdeiro, o primeiro nome do **titular falecido** e a quantidade de herdeiros — `filiacao-herdeiro-abramus-jose-3-herdeiros.pdf`.

## Restrição central: zero rede

O app não pode fazer nenhuma requisição externa. Sem back-end, sem CDN, sem bibliotecas de terceiros, sem telemetria. Tudo (geração de PDF/JPG, persistência, envio) roda no navegador do usuário. Isso é requisito do projeto, não acidente:

- O gerador de PDF é próprio (`js/pdf.js`) em vez de jsPDF; o preview é canvas próprio em vez de html2canvas.
- O service worker (`sw.js`) ignora qualquer origem diferente da própria.
- O "envio por e-mail" abre o app de e-mail do aparelho (Web Share com anexo no celular, `mailto:` no desktop) — nunca um endpoint.

Ao adicionar qualquer funcionalidade, mantenha essa restrição.

## Comandos

Não há build, bundler, lint nem framework de testes. Os arquivos são servidos como estão.

```bash
python -m http.server 8765          # servir; abrir http://127.0.0.1:8765/
```

Sirva por HTTP: em `file://` o service worker não registra e o `localStorage` é inconsistente. Mesmo assim, **a exportação precisa funcionar em `file://`**, porque usuários abrem `index.html` (ou `dist/Pagina/`) com duplo clique — ver a regra do canvas em Arquitetura.

### Testar

Não existe runner. O padrão usado até aqui é uma página de teste temporária na raiz (mesma origem) executada em Chrome headless, e removida depois:

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CH" --headless=new --disable-gpu --no-sandbox \
  --user-data-dir="C:\\Temp\\perfil" --virtual-time-budget=15000 \
  --dump-dom "http://127.0.0.1:8765/__teste.html"
```

Duas formas de página de teste:

- **`index.html` num `<iframe>`**, dirigido por `iframe.contentWindow` (clicar em botões, ler `FichaState`, chamar `FichaRender`/`FichaExport`). Bom para fluxos de UI. Não funciona em `file://` (cada arquivo é uma origem).
- **Cópia de `index.html` com um `<script>` injetado antes de `</body>`** (gerada por Python). Funciona em HTTP e em `file://`, e com `--print-to-pdf` mostra o que a impressão produz: stub `window.print`, chame `FichaExport.imprimir()` e o Chrome imprime o estado final com `@media print`.

Para ver as páginas da ficha, escreva `canvas.toDataURL()` no DOM e decodifique o base64 em PNG com Python. O PDF gerado também pode sair em base64 pelo DOM e ser validado com `pypdf` (`PdfReader`, `page.images`, `mediabox`).

Ao encerrar o servidor, mate só o processo do `http.server 8765` (filtrando por `CommandLine`), nunca todos os `python.exe`.

Pontos que custaram tempo:

- **Use um `--user-data-dir` novo a cada rodada.** O service worker é cache-first e serve CSS/JS antigos, mascarando as alterações.
- **Teste exportação também em `file://`.** Em HTTP tudo passa; um canvas contaminado só aparece em `file://`.
- `--dump-dom` só captura `textContent`; valores escritos em `.value` de `<textarea>` não aparecem.
- `--window-size` não produz o viewport pedido para screenshot. Para ver o layout mobile de verdade, carregue `index.html` num `<iframe>` de 412px dentro de uma página auxiliar e capture essa página.
- Heredoc com aspas e acentos no Bash do Git às vezes quebra (`unexpected EOF`); para scripts de edição longos, grave um `.py` no scratchpad e rode com `python -I`.
- **IndexedDB e `--dump-dom` não combinam**: com uma operação de IndexedDB pendente o tempo virtual (`--virtual-time-budget`) para, e o DOM sai capturado no meio do teste, parecendo que o app travou (não travou). Para testar anexos, rode o Chrome headless em tempo real, sem `--dump-dom`: `--enable-logging --v=0 --log-file=<arquivo>`, a página de teste escreve `console.log("T|...")`, espere alguns segundos, encerre o processo e leia as linhas `CONSOLE` do log.

## Arquitetura

Scripts globais clássicos (IIFE + `window.X`), sem módulos ES. **A ordem em `index.html` importa**: `schema → state → logo → render → pdf → anexos → export → app`.

| Arquivo | Global | Papel |
|---|---|---|
| `js/schema.js` | `FichaSchema` | Definição declarativa das fichas: etapas, campos, validadores, textos, categorias |
| `js/state.js` | `FichaState` | Dados, máscaras, pendências, progresso, `localStorage`, ficha ativa |
| `js/logo.js` | `FichaLogo` | Logo branco do cabeçalho impresso, embutido como `data:` URL |
| `js/render.js` | `FichaRender` | Desenha as páginas A4 da ficha ativa em canvas |
| `js/pdf.js` | `FichaPDF` | PDF 1.4 cru com JPEG por página (DCTDecode) |
| `js/anexos.js` | `FichaAnexos` | Anexos (ficha assinada e documentos) no IndexedDB, qualidade da foto, validação, PDF único para envio |
| `js/export.js` | `FichaExport` | Download, impressão, Web Share, `mailto:` |
| `js/app.js` | — | UI: etapas, formulário, preview, sheets, troca de ficha |

### Três ideias que explicam o resto

**1. `render.js` é a única fonte de verdade visual.** `FichaRender.paginas(dados, {escala, destaque})` devolve `Promise<[canvas, ...]>`, uma por página da ficha ativa, e preview, JPG, PDF e impressão consomem o mesmo resultado — só muda a escala (2 para tela, 3 para exportação) e o `destaque`. Não crie um segundo renderizador em HTML: a ficha deixaria de ser WYSIWYG. `PAGINAS[id]` lista as funções de desenho de cada ficha (ou uma função `(dados, imgs, opts) → canvases`, como no herdeiro: `paginasHerdeiro()` desenha `pagina1`+`pagina2Herdeiro` uma vez por herdeiro, com os dados montados por `dadosFichaHerdeiro()`; `totalPaginas` e `fichaDe` — `{ n, total }` — dizem a cabeçalho e rodapé a numeração de cada ficha); campo novo na ficha = desenhar ali. As quatro filiações compartilham `pagina1` (ramifica por `S.ficha.id`: bloco de identificação, declaração do herdeiro, responsável legal no menor e na PJ); a página 2 é `pagina2` (PF e menor — o menor troca a nota de terceiros por `observacoesMenor`), `pagina2PJ` ou `pagina2Herdeiro`. Todas montam a página com os blocos `blocoCategorias`, `declaracao`, `localData`, `linhaAssinatura`, `usoExclusivo`, `dadosPessoais`, `endereco`, `blocoPagamento` (opções via `cfg`) e `blocoDocumentos`. `linhaCampos(g, x, y, larg, itens)` põe campos lado a lado com larguras proporcionais (`p`).

As coordenadas são em pontos A4 (`595.28 × 841.89`) e o contexto é escalado uma vez em `desenhaPagina()`. Os helpers (`campo`, `campoOpcoes`, `secao`, `caixa`, `opcaoCaixa`, `paragrafo`) devolvem o próximo `y`, então o layout é um cursor vertical — inserir uma linha desloca o que vem depois. A carta de desligamento usa texto corrido com lacunas: `trecho()` e `lacuna()` devolvem o próximo `x`. `cabecalho(g, pagina, imgs)` e `rodape()` leem título e nº de páginas de `S.ficha`; o logo fica à direita e os textos da direita se alinham à esquerda dele.

**Regra do canvas: toda imagem desenhada precisa ser `data:` URL.** Uma imagem carregada de arquivo conta como outra origem em `file://` e contamina o canvas; aí `toDataURL()` lança `SecurityError` e PDF, JPG e impressão falham ("Não foi possível preparar a impressão"). Por isso o logo vive em `js/logo.js` (gerado de `icons/abramus-marca-branca.png`, recortado e em escala de cinza — o comentário do arquivo diz como regerar) em vez de ser lido de `icons/`. Os anexos da etapa Documentos também são lidos como `data:` URL.

**2. Várias fichas, um só app.** `FichaSchema.FICHAS` define cada ficha: `STEPS`, `DOCUMENTOS`, `chave` do rascunho, `paginas`, `titulo`/`tituloFicha`/`publico`, prefixo `arquivo` dos downloads, `email`, textos do aviso de envio (`envioTitulo`, `envioPasso`, `envioAlerta`) e, opcionalmente, `CATEGORIAS` (a PJ só tem Produtor Fonográfico e Editor), `chaveNome`/`documento` (quem nomeia o arquivo e o assunto do e-mail — na PJ, razão social e CNPJ em vez de nome e CPF) e `herdaDe`. `FichaSchema.usar(id)` aponta `S.ficha`, `S.STEPS`, `S.DOCUMENTOS`, `S.CATEGORIAS` e `S.EMAIL_DESTINO` para a ficha ativa, e o resto do app continua lendo esses nomes. As variações da filiação reaproveitam descritores da PF com `campoPF(k, mudancas)`/`camposPF([...])`, que copiam o campo (mesma chave) e sobrescrevem propriedades. Troque de ficha só por `FichaState.usarFicha(id)`: ele grava antes o rascunho pendente (o salvamento tem debounce e cairia na chave da ficha nova). `herdaDe` copia campos comuns (nome, nome artístico, CPF, local) da filiação quando o desligamento ainda não tem rascunho. Ficha nova = entrada em `FICHAS`, funções em `PAGINAS`, exemplo em `EXEMPLOS` (`state.js`), botão `data-ficha` no menu do `index.html` e, se o corpo do e-mail for diferente, um ramo em `resumoTexto()` (`export.js`).

**3. `schema.js` dirige quase tudo.** Adicionar um campo ali faz aparecer sozinho: o input na etapa certa, a validação, a entrada na lista de pendências, o peso no progresso e o marcador no stepper. `app.js` e `state.js` percorrem `STEPS` genericamente; nenhum dos dois conhece campos por nome.

Descritor de campo: `{ k, rotulo, tipo, obrigatorio, largura, dica, valida, caixaAlta, teclado, mostrarSe, obrigatorioSe, opcoes }`. Tipos suportados por `construirCampo()` em `app.js` e por `state.js`: `texto`, `textarea`, `data`, `cpf`, `cnpj`, `cep`, `fone`, `select`, `radio`, `categorias`, `multipla`, `checklist`, `foto`, `titulo`. `titulo` é só um subtítulo de grupo (ex.: "Herdeiro 2"), sem valor; `state.js` o trata pelo caminho genérico (nunca é obrigatório). `multipla` (categorias do desligamento) guarda a lista dos `v` marcados, na ordem das opções, e é validada pelo caminho genérico (lista vazia = vazio). Um tipo novo exige tratamento nos dois lugares.

`mostrarSe(d)` / `obrigatorioSe(d)` recebem o objeto de dados inteiro — é assim que cônjuge, guichê "Outro", território "Outros" e as formas de pagamento funcionam.

**Dados para pagamento** (filiação, "preencha apenas uma das opções"): `forma_pagamento` (`conta|guiche|pj`) é um radio obrigatório e cada grupo de campos usa `mostrarSe`/`obrigatorioSe` via `pagaEm(forma)`. Campos de uma forma não escolhida ficam ocultos e não são validados. Na ficha os três blocos sempre aparecem, mas só a forma escolhida tem valores impressos (helper `pg()` em `pagina2()`), para que dados digitados antes de trocar de opção não vazem. Conta usa um único `conta_numero` + `conta_modalidade` (`Corrente|Poupança`), impresso na coluna correspondente. Conta individual com `cpf_titular` vazio imprime o CPF do filiado.

A página 2 das filiações está perto do limite vertical (a lista de documentos termina por volta de y≈745–760 de 811, no menor e no herdeiro). Ao acrescentar linhas nela, confira o render. Ao mexer nos blocos comuns, compare o render da PF com o anterior: a refatoração para blocos foi conferida pixel a pixel.

### Convenções de dados

- Cada ficha tem um objeto plano `{ chave: valor }` próprio no `localStorage`: `abramus.filiacao.v1`, `abramus.menor.v1`, `abramus.pj.v1`, `abramus.herdeiro.v1` e `abramus.desligamento.v1`. A ficha aberta fica em `abramus.ficha`.
- Vários herdeiros: `qtd_herdeiros` (`'1'`–`'6'`, vazio = 1) e, para o herdeiro n ≥ 2, as chaves do principal com prefixo `h<n>_` (`h2_nome`, `h2_rg`…, inclusive as de pagamento: `h2_forma_pagamento`, `h2_banco`…), geradas por `camposHerdeiroN()` com `mostrarSe`/`obrigatorioSe` condicionados a `nHerdeiros(d) >= n`. Use `FichaSchema.nHerdeiros(d)` e `FichaSchema.dadosHerdeiro(d, n)` (devolve os dados sem prefixo) em vez de ler as chaves à mão. Dados de herdeiros acima da quantidade escolhida ficam salvos, mas ocultos e fora da ficha.
- Chaves próprias das variações: `resp_*` (responsável legal do menor; representante legal da PJ — quem assina e cujo nome sai sob a linha), `fal_*` (titular falecido, no herdeiro; o herdeiro usa as chaves da PF), `nome_fantasia`, `inscricao_*`, `fax`, `contato1_*`/`contato2_*`, `email_sisrc` (PJ). Na PJ, `razao_social` e `cnpj` são os dados da empresa (na PF são da opção de pagamento "pessoa jurídica").
- Os campos comuns usam a mesma chave nas duas fichas (`nome`, `cpf`, `pseudonimo` — rotulado "Nome artístico" no desligamento —, `local_assinatura`, `data_assinatura`); é isso que permite o `herdaDe`.
- Campos cujo `k` começa com `_` (`_categorias`, `_documentos`) são pseudo-campos: agrupam widgets e não guardam valor próprio.
- Categorias da filiação usam três chaves derivadas por categoria: `cat_<k>` (bool), `ter_<k>` (`mundo|brasil|outros`), `terout_<k>` (texto). A validação delas é especial-casada em `pendencias()`. As do desligamento são uma lista em `categorias_desligamento` (sem Editor, que o PDF não lista).
- Migrações de dados salvos em versões antigas ficam em `carregar()` (`state.js`): guichê sem `forma_pagamento` vira `'guiche'`; a `foto` e as assinaturas desenhadas são descartadas.
- `pendencias()` ignora `checklist` e `foto` — são opcionais por decisão de produto, não por esquecimento.
- Máscaras são aplicadas na digitação e **o valor mascarado é o que fica salvo** (`(11) 90000-0000`, `123.456.789-09`). Validadores recebem o texto mascarado e normalizam com `soDigitos()`.
- "Limpar formulário" (no menu e no botão marrom `#btnLimpar` do topo, mesmo handler `limparFormulario()`) apaga só a ficha aberta, inclusive os anexos dela; "Sair do aplicativo" (`limparTudo()`) apaga o rascunho e os anexos de todas.

### Anexos (etapa "Documentos")

Última etapa de todas as fichas (`ETAPA_ANEXOS`, acrescentada a cada `STEPS` em `schema.js`; o passo tem `anexos: true` e nenhum campo). Fluxo: imprimir e assinar → fotografar ou anexar foto/PDF → validar → enviar.

- "Tirar foto" abre a câmera dentro do app (`tirarFoto()` em `app.js`, tela `#camera`) via `getUserMedia`: pede a traseira (`facingMode: environment`), o que no computador dá a webcam; "Trocar câmera" percorre os `videoinput` de `enumerateDevices()` e a última usada fica em `localStorage` (`abramus.camera`). Depois de capturar: "Usar foto", "Usar e tirar outra" (para as várias páginas da ficha) ou "Tirar de novo". A captura vira um `File` JPEG e segue por `receberArquivos()`, como um arquivo escolhido. Sem `getUserMedia`, fora de contexto seguro (`http://` que não seja localhost) ou no APK — que não pede a permissão de câmera em tempo de execução — cai para `<input capture="environment">`, que abre a câmera do aparelho. Permissão negada, câmera ausente ou ocupada mostram aviso na própria tela, com "Escolher arquivo" como saída. A câmera é desligada ao fechar e quando a aba fica oculta.

- `FichaSchema.requisitosAnexos(d)` resolve o que a ficha ativa exige para os dados `d`: a ficha assinada (sempre, `minimo` = `paginasFicha(d)`, uma foto por página ou um PDF) e cada item de `DOCUMENTOS` com `situacao` (`obrigatorio | opcional | naoSeAplica`) e `minimo`, vindos de `regrasAnexos`. Documento novo na lista = regra em `regrasAnexos` se não for obrigatório com 1 arquivo.
- `FichaAnexos` guarda cada anexo no IndexedDB `abramus-anexos` (store `anexos`, índice `ficha`) — fotos não cabem no `localStorage`. Se o IndexedDB não abrir, cai para memória e a etapa avisa. Fotos são reduzidas a 2200 px e regravadas em JPEG 0,85; PDF entra como está (até 15 MB, conferindo o cabeçalho `%PDF-` e contando as páginas). Imagens são lidas como `data:` URL (regra do canvas).
- Qualidade (`analisar()`, só aviso, não bloqueia): resolução < 700 px, brilho médio < 70 ou > 245 e nitidez (variância do laplaciano a 400 px) < 60. Valores calibrados com imagens sintéticas: texto nítido ≈ 20000, `blur(9px)` ≈ 20.
- `validar(lista, d)` dá o status por requisito (`ok | falta | incompleto | opcional | naoSeAplica`), `faltando`, `alertas` (pendências do formulário, > 20 MB, anexos sem documento correspondente, fotos com aviso) e `orfaos`. A validação **não lê o conteúdo** do documento — sem rede não há OCR/IA; só confere presença, quantidade, formato e qualidade da foto.
- Envio: `FichaExport.enviarAnexos()` junta as fotos num PDF único (`gerarPacote()`: ficha assinada primeiro, uma página A4 por foto com o nome do documento no topo) e manda junto os PDFs anexados à parte, via Web Share; sem Web Share, baixa os arquivos e abre o `mailto:`; no APK a ponte leva um arquivo só (o PDF das fotos). O botão roda síncrono a partir da validação já calculada (`anexosValidacao` em `app.js`); com documentos faltando, o primeiro toque só avisa e o botão vira "Enviar mesmo assim".
- Formato do pacote ("Como juntar os arquivos", lembrado em `localStorage` `abramus.formatoEnvio`): **PDF único** (padrão, acima) ou **ZIP** — `FichaAnexos.gerarZip()` empacota os arquivos originais num ZIP próprio (`montarZip()`: PKZIP 2.0, nomes UTF-8, CRC32, deflate via `CompressionStream('deflate-raw')` só quando reduz o tamanho; sem a API, guarda sem compressão), com nomes `NN-<documento>-<seq>.jpg|pdf` na ordem da lista. O ZIP se chama pelo tipo da ficha + primeiro nome do titular (`nomeZip()`: `proposta-de-filiacao-menor-de-idade-joana.zip`). O Chrome do celular não compartilha `.zip` por Web Share; nesse caso o envio cai no download + `mailto:`. No APK a ponte leva o ZIP inteiro (inclusive os PDFs anexados).
- Documentos `naoSeAplica` não aparecem na etapa (a menos que já tenham anexo, para poder removê-lo). Anexar um documento marca o item do checklist (`doc_*`). "Limpar formulário" apaga também os anexos da ficha aberta; "Sair" apaga os de todas.

### UI

`app.js` monta todas as etapas da ficha ativa no DOM e alterna `hidden`; trocar de ficha (`trocarFicha()`) reconstrói tudo e `aplicarFicha()` atualiza título da barra, `document.title` e o item marcado no menu. `atualizar()` é o único ponto de sincronização: percorre `STEPS` e reconcilia valores, visibilidade condicional, erros, progresso, stepper, painel de pendências e preview (com debounce). Chame-a depois de qualquer mudança de estado vinda da UI.

Erros de campo só aparecem depois que a chave está em `tocados` (blur ou tentativa de avançar) — evita um formulário vermelho na primeira abertura.

Avançar de etapa **não bloqueia** com pendências: marca tudo como tocado, mostra um toast e segue. A etapa de Revisão é que consolida o que falta.

Na Revisão, o card "Baixar para assinar" tem só "Baixar para assinar (PDF)" e "Baixar para assinar (JPG)" — impressão e e-mail saíram dali; o envio é feito na etapa Documentos. Os dois só baixam com `St.pendencias()` vazio: com pendência ficam esmaecidos (`.is-bloqueado`, `aria-disabled`, nota `#notaBloqueio`, sincronizados em `atualizarRevisao()`), mas continuam clicáveis — o toque mostra um toast e abre a lista de pendências. Toda ação desse card passa por `botaoAcao()`, que abre o modal `#envioSheet` (aviso: assinar e enviar) antes de executar. O botão de confirmação leva o nome da ação ("Entendi, baixar para assinar (PDF)"). Título, passo 2 e alerta do modal vêm da ficha ativa; a lista de documentos vem de `S.DOCUMENTOS` e o bloco some quando ela está vazia (desligamento). A ação roda síncrona no clique de confirmação porque Web Share exige gesto do usuário; não coloque `setTimeout` antes dela.

**Impressão sem pop-up.** `imprimir()` não abre janela (o bloqueador de pop-ups a barrava): põe as páginas em `#impressao`, espera as imagens carregarem e chama `window.print()` na própria página. O `@media print` do CSS esconde o resto do `body` e imprime cada imagem em uma folha A4 sem margem (altura 296.5mm para o arredondamento não gerar folha em branco). Durante a impressão o `document.title` vira o nome do arquivo, que o navegador sugere em "Salvar como PDF"; `afterprint` desfaz tudo. No APK a impressão vai pela ponte nativa (`FichaAndroid.imprimirArquivo`), não por esse caminho.

CSS tem `[hidden] { display: none !important; }` de propósito: vários componentes definem `display: grid/flex`, que sobrepõe o atributo `hidden` e já causou o overlay de carregamento ficar preso na tela.

## Ao alterar qualquer arquivo

Incremente `CACHE` em `sw.js` (ex.: `filiacao-abramus-v32` → `v33`). O service worker é cache-first; sem isso, quem já instalou continua na versão antiga. Arquivo novo também precisa entrar em `ARQUIVOS` e no `<script>`/`<link>` do `index.html`.

## Distribuição (`dist/`)

`dist/` e `android/app/build/` contêm **cópias** geradas do app. Não edite ali; regere a partir da raiz:

- **`dist/Pagina/`**: copiar por cima os arquivos que já existem lá (inclui `CLAUDE.md` e `icons/AbramusDireitoAutoral.png`) e acrescentar arquivos novos do app. Conferir com `cmp` contra a raiz.
- **`dist/filiacao-abramus-pwa.zip`**: só os arquivos do PWA — `index.html`, `manifest.webmanifest`, `sw.js`, `css/styles.css`, `js/*.js` (inclui `js/anexos.js`) e os ícones `icon-192`, `icon-512`, `maskable-512`, `apple-touch-icon`, `favicon-32`, `abramus-marca-branca` (sem `CLAUDE.md` nem `AbramusDireitoAutoral.png`).
- **`dist/filiacao-abramus-1.0.apk`**: compilar em `android/` e copiar `app/build/outputs/apk/release/app-release.apk`. O Gradle não está no PATH; use o do cache do wrapper e o JDK 17 de `C:\Program Files\Java\jdk-17` (o JDK Adoptium que ainda aparece no PATH não existe mais):

  ```bash
  export JAVA_HOME="/c/Program Files/Java/jdk-17"
  set -a; eval "$(tr -d '\r' < ../senhas.env)"; set +a   # senhas.env tem CRLF
  ~/.gradle/wrapper/dists/gradle-8.9-bin/*/gradle-8.9/bin/gradle assembleRelease
  ```

  As senhas são de assinatura: nunca exiba nem tente adivinhar. Em 09/10/2026 as do `senhas.env` **não abriam** `app/chave-filiacao.jks` ("keystore password was incorrect"), e o APK de `dist` ficou na versão de 17/09 — peça as senhas corretas ao usuário. O build apaga o `app-release.apk` anterior mesmo quando falha. `versionCode` ainda é 1; subir só se o usuário pedir.

## Ícones

Gerados por script Pillow, não versionados como fonte. Para regerar, recrie o script — ver `icons/` (192, 512, maskable 512, apple-touch 180, favicon 32) e as cores `#008082` / `#FFFFFF`. Se `abramus-marca-branca.png` mudar, regere `js/logo.js`.
