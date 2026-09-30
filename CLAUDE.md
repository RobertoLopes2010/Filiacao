# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

PWA de página única que reproduz `fichafiliacao_PF.pdf` (Proposta de Filiação — Pessoa Física, ABRAMUS): preenchimento, conferência de pendências, pré-visualização e exportação em PDF/JPG. O PDF original é a especificação — consulte-o antes de alterar campos ou o layout da ficha.

## Restrição central: zero rede

O app não pode fazer nenhuma requisição externa. Sem back-end, sem CDN, sem bibliotecas de terceiros, sem telemetria. Tudo (geração de PDF/JPG, persistência, envio) roda no navegador do usuário. Isso é requisito do projeto, não acidente:

- O gerador de PDF é próprio (`js/pdf.js`) em vez de jsPDF; o preview é canvas próprio em vez de html2canvas.
- O service worker ignora qualquer origem diferente da própria (`js/../sw.js`).
- O "envio por e-mail" abre o app de e-mail do aparelho (Web Share com anexo no celular, `mailto:` no desktop) — nunca um endpoint.

Ao adicionar qualquer funcionalidade, mantenha essa restrição.

## Comandos

Não há build, bundler, lint nem framework de testes. Os arquivos são servidos como estão.

```bash
python -m http.server 8765          # servir; abrir http://127.0.0.1:8765/
```

`file://` não serve: o service worker não registra e o `localStorage` é inconsistente.

### Testar

Não existe runner. O padrão usado até aqui é uma página de teste temporária na raiz (mesma origem) executada em Chrome headless, e removida depois:

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CH" --headless=new --disable-gpu --no-sandbox \
  --user-data-dir="C:\\Temp\\perfil" --virtual-time-budget=15000 \
  --dump-dom "http://127.0.0.1:8765/__teste.html"
```

Pontos que custaram tempo:

- **Use um `--user-data-dir` novo a cada rodada.** O service worker é cache-first e serve CSS/JS antigos, mascarando as alterações.
- `--dump-dom` só captura `textContent`; valores escritos em `.value` de `<textarea>` não aparecem.
- `--window-size` não produz o viewport pedido para screenshot. Para ver o layout mobile de verdade, carregue `index.html` num `<iframe>` de 412px dentro de uma página auxiliar e capture essa página.
- O PDF gerado pode ser extraído em base64 pelo DOM e validado com `pypdf` (`PdfReader`, `page.images`).

## Arquitetura

Scripts globais clássicos (IIFE + `window.X`), sem módulos ES. **A ordem em `index.html` importa**: `schema → state → render → pdf → export → app`.

| Arquivo | Global | Papel |
|---|---|---|
| `js/schema.js` | `FichaSchema` | Definição declarativa da ficha: etapas, campos, validadores |
| `js/state.js` | `FichaState` | Dados, máscaras, pendências, progresso, `localStorage` |
| `js/render.js` | `FichaRender` | Desenha as 2 páginas A4 em canvas |
| `js/pdf.js` | `FichaPDF` | PDF 1.4 cru com JPEG por página (DCTDecode) |
| `js/export.js` | `FichaExport` | Download, impressão, Web Share, `mailto:` |
| `js/app.js` | — | UI: etapas, formulário, preview, sheets |

### Duas ideias que explicam o resto

**1. `render.js` é a única fonte de verdade visual.** `FichaRender.paginas(dados, {escala, destaque})` devolve `Promise<[canvas1, canvas2]>`, e preview, JPG e PDF consomem o mesmo resultado — só muda a escala (2 para tela, 3 para exportação) e o `destaque`. Não crie um segundo renderizador em HTML: a ficha deixaria de ser WYSIWYG. Campo novo na ficha = desenhar em `pagina1()`/`pagina2()`.

As coordenadas são em pontos A4 (`595.28 × 841.89`) e o contexto é escalado uma vez em `desenhaPagina()`. Os helpers (`campo`, `secao`, `caixa`, `opcaoCaixa`, `paragrafo`) devolvem o próximo `y`, então o layout é um cursor vertical — inserir uma linha desloca o que vem depois.

**2. `schema.js` dirige quase tudo.** Adicionar um campo ali faz aparecer sozinho: o input na etapa certa, a validação, a entrada na lista de pendências, o peso no progresso e o marcador no stepper. `app.js` e `state.js` percorrem `STEPS` genericamente; nenhum dos dois conhece campos por nome.

Descritor de campo: `{ k, rotulo, tipo, obrigatorio, largura, dica, valida, caixaAlta, teclado, mostrarSe, obrigatorioSe }`. Tipos suportados por `construirCampo()` em `app.js` e por `state.js`: `texto`, `textarea`, `data`, `cpf`, `cnpj`, `cep`, `fone`, `select`, `radio`, `categorias`, `checklist`, `foto`, `assinatura`. Um tipo novo exige tratamento nos dois lugares.

`mostrarSe(d)` / `obrigatorioSe(d)` recebem o objeto de dados inteiro — é assim que cônjuge, guichê "Outro" e território "Outros" funcionam.

### Convenções de dados

- Estado é um objeto plano `{ chave: valor }` em `localStorage` sob `abramus.filiacao.v1`.
- Campos cujo `k` começa com `_` (`_categorias`, `_documentos`) são pseudo-campos: agrupam widgets e não guardam valor próprio.
- Categorias usam três chaves derivadas por categoria: `cat_<k>` (bool), `ter_<k>` (`mundo|brasil|outros`), `terout_<k>` (texto). A validação delas é especial-casada em `pendencias()`.
- `pendencias()` ignora `checklist`, `foto` e `assinatura` — são opcionais por decisão de produto, não por esquecimento.
- Máscaras são aplicadas na digitação e **o valor mascarado é o que fica salvo** (`(11) 90000-0000`, `123.456.789-09`). Validadores recebem o texto mascarado e normalizam com `soDigitos()`.

### UI

`app.js` monta todas as 6 etapas no DOM uma vez e alterna `hidden`. `atualizar()` é o único ponto de sincronização: percorre `STEPS` e reconcilia valores, visibilidade condicional, erros, progresso, stepper, painel de pendências e preview (com debounce). Chame-a depois de qualquer mudança de estado vinda da UI.

Erros de campo só aparecem depois que a chave está em `tocados` (blur ou tentativa de avançar) — evita um formulário vermelho na primeira abertura.

Avançar de etapa **não bloqueia** com pendências: marca tudo como tocado, mostra um toast e segue. A etapa de Revisão é que consolida o que falta.

CSS tem `[hidden] { display: none !important; }` de propósito: vários componentes definem `display: grid/flex`, que sobrepõe o atributo `hidden` e já causou o overlay de carregamento ficar preso na tela.

## Ao alterar qualquer arquivo

Incremente `CACHE` em `sw.js` (ex.: `filiacao-abramus-v23` → `v24`). O service worker é cache-first; sem isso, quem já instalou continua na versão antiga. Arquivo novo também precisa entrar em `ARQUIVOS`.

## Ícones

Gerados por script Pillow, não versionados como fonte. Para regerar, recrie o script — ver `icons/` (192, 512, maskable 512, apple-touch 180, favicon 32) e as cores `#008082` / `#FFFFFF`.
