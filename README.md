# Gerador de Propostas Solar

Plataforma web para elaborar **propostas comerciais de energia solar fotovoltaica** — sistemas **On-Grid** e **Híbridos (com baterias)** — com dimensionamento técnico automático, análise financeira de 25 anos (Lei 14.300/2022 — Fio B) e geração da proposta em **Word (.docx)** no mesmo layout do modelo Gênesis Engenharia (capa, cabeçalho/rodapé, tabelas azuis zebradas, gráfico Consumo × Geração e bloco de assinatura).

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
- Numeração automática `PREFIXO-AAAAMMDD-NNN`, situação (rascunho, enviada, em negociação, aprovada, recusada), duplicação e geração do .docx.

**Cadastros**: clientes (com busca de CEP), equipamentos (módulos, inversores on-grid, inversores híbridos, baterias, estruturas e materiais com regras de quantidade), concessionárias e tarifas (B1/B2/B3 e TUSD Fio B), localidades (HSP, COSIP e sazonalidade mensal) e condições de pagamento.

**Configurações**: dados da empresa e logotipo, premissas técnicas/financeiras (PR, degradação, inflação, TMA/SELIC, cronograma do Fio B, disponibilidade, limites, parâmetros de baterias), textos padrão da proposta (apresentação, serviços inclusos/não inclusos, cronograma, conformidade legal) e backup/importação dos dados.

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
4. **Nova proposta**: escolha On-Grid ou Híbrido, selecione/cadastre o cliente, informe o consumo e o valor, revise o resumo e clique em **Gerar proposta (.docx)**.

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

A tarifa e a COSIP são reajustadas anualmente pelas taxas definidas em **Premissas** (0% = valor fixo). Todas as premissas podem ser ajustadas por proposta.

---

## Estrutura do projeto

```
index.html            Aplicação (abre direto no navegador)
css/app.css           Estilos
js/util.js            Formatação pt-BR, números, datas, DOM
js/defaults.js        Dados padrão (empresa, premissas, textos, catálogo de exemplo)
js/store.js           Persistência local, numeração e backup
js/calc.js            Dimensionamento On-Grid/Híbrido, materiais, financeiro e pagamentos
js/chart.js           Gráfico Consumo × Geração (canvas → PNG)
js/zip.js             Montagem do pacote .docx (ZIP com DEFLATE nativo do navegador)
js/docx.js            Documento Word no layout do modelo
js/docx-parts.js      Estilos/tema/fontes extraídos do modelo original
js/logo-default.js    Logotipo padrão (gerado a partir de assets/logo-genesis.jpg)
js/ui.js              Roteador, diálogos, campos e cadastro genérico
js/pages/*.js         Telas (painel, propostas, formulário, cadastros, configurações)
tests/index.html      Testes automáticos do cálculo e do .docx
tools/serve.ps1       Servidor local opcional (Windows/PowerShell)
```

## Testes

Abra `tests/index.html` no navegador. Os testes reproduzem a proposta de referência GE-20260929-012 (mesmas premissas daquele documento) e conferem geração, FDI, Fio B, contas mensais, parcelas e a lista de materiais, além de gerar os .docx On-Grid e Híbrido para download.
