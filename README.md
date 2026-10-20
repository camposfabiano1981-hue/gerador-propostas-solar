# Gerador de Propostas Solar

Plataforma web para elaborar **propostas comerciais de energia solar fotovoltaica** — sistemas **On-Grid**, **Híbridos (com baterias)** e **BESS** (armazenamento em gabinetes) para clientes do **grupo A e B** nas tarifas **convencional, branca, verde e azul** — com dimensionamento técnico automático, **comparação de até 4 cenários** (geração solar, backup, uso da bateria em horários estratégicos e redução de picos de demanda), análise financeira de 25 anos (Lei 14.300/2022 — Fio B) e emissão em **PDF** e **Word (.docx)** no mesmo layout do modelo Gênesis Engenharia.

Inclui também **contratos de prestação de serviços** (no layout do contrato modelo) gerados a partir das propostas e **propostas avulsas** para serviços complementares (manutenção, limpeza, laudos, projetos, carregador veicular…).

Funciona 100% no navegador: **não precisa de servidor, banco de dados nem instalação**. Pode ser publicada gratuitamente no **GitHub Pages**.

**Acesse:** https://camposfabiano1981-hue.github.io/gerador-propostas-solar/

---

## Funcionalidades

**Propostas**
- Formulário completo com cálculo ao vivo e painel-resumo (potência, FDI, geração, investimento, economia, payback simples/descontado, TIR, VPL, gráfico e alertas).
- **On-Grid**: nº de módulos sugerido pelo consumo, seleção automática do inversor pelo melhor FDI (P inversor ÷ P FV), verificação de strings (opcional), alerta de limite por tipo de ligação.
- **Híbrido**: cadastro de cargas críticas, autonomia desejada, dimensionamento do banco de baterias (DoD, eficiência, série/paralelo pela tensão do inversor), verificação da potência de backup e modo *backup* ou *backup + ciclagem diária* (reduz a energia injetada e o Fio B).
- Lista de materiais gerada automaticamente (módulos, inversor, baterias, kits de estrutura combinados, perfis, cabos, conectores), editável, com soma automática do kit.
- Composição do preço: **valor total** (mão de obra calculada) ou **itens separados** (total calculado); valor do kit pela soma dos itens ou manual (cotação do distribuidor).
- Opções de pagamento: à vista, cartão com acréscimo fixo e financiamentos (BV, Solfácil…) por PMT.
- **Número da proposta automático** `PREFIXO-AAAAMMDD-NNN` (ex.: GE-20261016-001): sequencial por data de emissão, atribuído ao salvar e nunca repetido (mesmo após excluir propostas). O prefixo é definido em Configurações › Empresa.
- **Emissão em PDF e em Word (.docx)** com o mesmo conteúdo e paginação. O PDF usa a fonte Arimo (métrica idêntica à Arial do modelo), carregada da internet na primeira emissão; sem internet, o .docx continua disponível.
- Situação (rascunho, enviada, em negociação, aprovada, recusada) e duplicação de propostas.

**Tarifas, BESS e cenários**
- Grupo B (convencional ou **branca**: ponta, intermediário e fora de ponta) e grupo A (**verde** e **azul**: consumo por posto, demanda contratada/medida, ultrapassagem acima da tolerância).
- **BESS** com ou sem FV (gabinetes com energia, potência, DoD, eficiência e ciclos) e híbridos com baterias.
- Até **4 cenários na mesma proposta**, com o mesmo horizonte e premissas: **Geração solar** (sem armazenamento), **Backup** (cargas críticas e valor da hora parada), **Horários estratégicos** (carga fora de ponta / com o excedente solar e descarga na ponta) e **Redução de picos** (corte da demanda medida no grupo A). Cada cenário tem dimensionamento, investimento (equipamento + instalação), degradação e troca do armazenamento, economia, VPL, TIR e payback.
- **Recomendação automática** da alternativa que faz mais sentido para o cliente, conforme o objetivo informado (maior retorno, segurança no fornecimento ou controle de demanda), com as razões; a proposta pode usar a recomendação ou outro cenário escolhido.

**Contratos**
- Contrato de prestação de serviços no layout do modelo: identificação das partes (CAMPO/DADOS), objeto, **produção média prometida com gráfico**, obrigações, prazo, **equipamentos contratados**, **termo de garantia**, preço com **valor por extenso** e tabela de parcelas, dados bancários, rescisão, disposições gerais, local/data e assinaturas.
- Criado a partir de uma proposta (botão ✍ na lista de propostas) com cliente, objeto, produção mensal, equipamentos e parcelas preenchidos (equipamentos na assinatura + 50% / 50% dos serviços); tudo editável, inclusive as cláusulas de cada contrato.
- Cláusulas numeradas automaticamente, com referências cruzadas (`{cl:pagamento}`); modelo padrão editável em **Configurações › Modelo de contrato**.
- Numeração própria `CT-AAAAMMDD-NNN` e emissão em PDF e Word.

**Propostas avulsas (serviços complementares)**
- Catálogo de serviços (Cadastros › Serviços) com categoria, unidade, preço e escopo.
- Proposta com itens do catálogo ou avulsos, desconto, prazo, garantia, opções de pagamento e textos próprios, na mesma identidade visual da proposta solar (PDF e Word). Usa a mesma numeração das propostas solares.

**Cadastros**: clientes (com busca de CEP), equipamentos (módulos, inversores on-grid, **microinversores**, inversores híbridos, baterias, BESS, estruturas e materiais com regras de quantidade), serviços, concessionárias e tarifas (B1/B2/B3, branca, verde, azul e TUSD Fio B), localidades (HSP, COSIP e sazonalidade mensal) e condições de pagamento.

**Catálogo inicial de equipamentos** (preços em branco — informe os do seu distribuidor):
- Módulos: Trina Solar, Astronergy, TCL Solar, OSDA, Honor Solar, ERA Solar (e DMEGC), com Voc/Vmp/Isc quando disponíveis na ficha.
- Inversores on-grid: Huawei, Sungrow, Sofar, GoodWe e Solis (monofásicos 220 V e trifásicos 220/380 V).
- Microinversores: Hoymiles, GoodWe e Sungrow — a quantidade é calculada pelo nº de módulos (entradas por micro) e a potência do módulo é conferida com a faixa do fabricante.
- Híbridos e baterias: Deye, Huawei (LUNA2000), Sungrow, GoodWe, Solis, Growatt, Pylontech, BYD e Dyness; a plataforma só combina bateria e inversor da mesma classe (48 V ou alta tensão).
- Estruturas para telhado cerâmico, fibrocimento, metálico (trapezoidal, ondulado, zipado, sanduíche), laje, solo, shingle e carport, além de suportes e cabos específicos de microinversores.
- Itens com dados parciais estão identificados nas observações; confira sempre o datasheet vigente.

**Configurações**: dados da empresa e logotipo (inclusive dados do contrato e bancários, que ficam só no navegador), premissas técnicas/financeiras (PR, degradação, inflação, TMA/SELIC, cronograma do Fio B, disponibilidade, limites, parâmetros de baterias e BESS), textos padrão da proposta, modelo de contrato e backup/importação dos dados.

---

## Como usar

### Online (GitHub Pages)
Acesse o endereço publicado (veja "Publicar no GitHub" abaixo).

### No computador
Basta abrir o arquivo `index.html` no navegador (Chrome, Edge ou Firefox atualizados).

Opcionalmente, para servir pela rede local:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

e acesse `http://localhost:8765/`.

### Fluxo sugerido
1. **Configurações › Empresa**: confira razão social, CNPJ, registro, responsável técnico e envie o logotipo.
2. **Cadastros › Equipamentos**: cadastre os preços dos módulos, inversores, baterias e materiais (o kit é somado automaticamente).
3. **Cadastros › Localidades / Concessionárias**: confira HSP, COSIP e tarifas da sua região.
4. **Nova proposta**: escolha On-Grid, Híbrido ou BESS, selecione/cadastre o cliente, informe a modalidade tarifária, o consumo e o valor, compare os cenários, revise o resumo e clique em **Proposta em PDF** (ou **Word (.docx)**). Na lista de propostas, os botões **PDF** e **DOCX** baixam qualquer proposta salva.
5. **Contrato**: na lista de propostas clique em ✍ (ou em Contratos › Novo contrato), confira os dados e as parcelas e baixe o contrato. Antes, preencha em **Configurações › Empresa** a razão social, endereço, contatos e dados bancários do contrato.
6. **Serviços avulsos**: em Propostas avulsas, monte a proposta com os serviços do catálogo.

> **Onde ficam os dados?** No armazenamento local do navegador (localStorage). Cada navegador/computador tem a sua base. Use **Configurações › Backup e dados** para exportar um `.json` regularmente e importá-lo em outro computador.

---

## Publicar no GitHub

1. Crie um repositório no GitHub (ex.: `gerador-propostas-solar`).
2. Na pasta do projeto:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/gerador-propostas-solar.git
   git push -u origin main
   ```

3. No GitHub: **Settings › Pages › Build and deployment › Source: Deploy from a branch**, branch `main`, pasta `/ (root)` › **Save**.
4. Em 1–2 minutos a plataforma estará em `https://SEU-USUARIO.github.io/gerador-propostas-solar/`.

> Os dados digitados na plataforma **não** vão para o GitHub — ficam no navegador de quem usa. O repositório contém apenas o código e os cadastros de exemplo.

---

## Metodologia de cálculo

| Item | Fórmula |
|---|---|
| Potência necessária | `kWp = consumo_mensal ÷ (HSP × 30 × PR)` |
| Nº de módulos | `⌈kWp × 1000 ÷ Wp_módulo⌉` |
| Geração mensal / anual | `kWp × HSP × 30 × PR` / `kWp × HSP × 365 × PR` |
| FDI | `P_inversor ÷ P_FV` (faixa padrão 0,75–1,20; alvo 0,90) |
| Capacidade de baterias | `energia_backup ÷ (DoD × eficiência)` |
| Fio B (ano N) | `energia_injetada × TUSD_FioB × %FioB(ano)`, com `energia_injetada = geração × (1 − simultaneidade)` (− energia armazenada na ciclagem) |
| Conta sem sistema | `consumo × tarifa_N + COSIP_N` |
| Conta com sistema | `max(consumo − geração, disponibilidade) × tarifa_N + COSIP_N + Fio B` |
| Economia real | `conta sem sistema − conta com sistema` |
| Payback | mês exato por interpolação, exibido como "X anos e Y meses" (simples e descontado pela TMA) |
| VPL / TIR | fluxo de 25 anos descontado pela TMA / taxa que zera o VPL |
| CO₂ evitado | `geração média × fator (kg/kWh) × 25 anos` |
| Financiamento | `PMT = PV × i(1+i)ⁿ ÷ ((1+i)ⁿ − 1)`; cartão: `PV × (1 + acréscimo) ÷ n` |

| Conta grupo A | `Σ energia_posto × tarifa_posto + demanda_faturada × tarifa_demanda + ultrapassagem + COSIP`, com `demanda_faturada = max(contratada, medida)` e ultrapassagem `= excedente × tarifa × fator` acima da tolerância |
| Compensação (tarifas horárias) | créditos abatem primeiro o fora de ponta; o saldo, valorado pela tarifa fora de ponta, abate intermediário/ponta |
| Horários estratégicos | `energia_deslocada = min(consumo_ponta, capacidade_útil × dias)`; ganho = `energia × (tarifa_ponta) − energia ÷ eficiência × tarifa_fora_ponta` |
| Redução de picos | `ΔkW = min(redução alvo, potência do BESS)`; ganho = `ΔkW × tarifa_demanda` (+ ultrapassagem evitada) − perdas da recarga |
| Armazenamento | degradação anual da capacidade; troca ao fim da vida (anos de calendário ou ciclos ÷ ciclos/ano) pelo % do preço definido nas premissas |

A tarifa e a COSIP são reajustadas anualmente pelas taxas definidas em **Premissas** (0% = valor fixo). Todas as premissas podem ser ajustadas por proposta.

---

## Estrutura do projeto

```
index.html            Aplicação (abre direto no navegador)
css/app.css           Estilos
js/util.js            Formatação pt-BR, números, datas, DOM
js/defaults.js        Dados padrão (empresa, premissas, textos, catálogo de exemplo)
js/store.js           Persistência local, numeração e backup
js/energia.js         Tarifas (convencional, branca, verde, azul), contas, compensação, cenários e recomendação
js/calc.js            Dimensionamento On-Grid/Híbrido/BESS, materiais, cenários, financeiro e pagamentos
js/chart.js           Gráficos Consumo × Geração e Produção mensal do contrato (canvas → PNG)
js/contrato.js        Contrato de prestação de serviços (dados e documento)
js/avulsa.js          Proposta avulsa de serviços complementares (dados e documento)
js/zip.js             Montagem do pacote .docx (ZIP com DEFLATE nativo do navegador)
js/documento.js       Conteúdo da proposta (modelo comum ao Word e ao PDF)
js/docx.js            Documento Word no layout do modelo
js/pdf.js             Documento PDF no layout do modelo (jsPDF + fonte Arimo, carregados sob demanda)
js/docx-parts.js      Estilos/tema/fontes extraídos do modelo original
js/logo-default.js    Logotipo padrão (gerado a partir de assets/logo-genesis.jpg)
js/ui.js              Roteador, diálogos, campos e cadastro genérico
js/pages/*.js         Telas (painel, propostas, formulário, cadastros, configurações)
tests/index.html      Testes automáticos do cálculo e do .docx
tools/serve.ps1       Servidor local opcional (Windows/PowerShell)
```

## Testes

Abra `tests/index.html` no navegador. Os testes reproduzem a proposta de referência GE-20260929-012 (mesmas premissas daquele documento) e conferem geração, FDI, Fio B, contas mensais, parcelas e a lista de materiais; contas nas tarifas branca, verde e azul; os cenários de BESS e a recomendação; o contrato (parcelas, numeração das cláusulas, valores por extenso) e a proposta avulsa — além de gerar os .docx e PDFs para download.
