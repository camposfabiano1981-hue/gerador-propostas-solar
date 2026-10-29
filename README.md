# Gerador de Propostas Solar

Plataforma web para elaborar **propostas comerciais de energia solar fotovoltaica** — sistemas **On-Grid**, **Híbridos (com baterias)** e **BESS** (armazenamento em gabinetes) para clientes do **grupo A e B** nas tarifas **convencional, branca, verde e azul** — com dimensionamento técnico automático, **comparação de até 4 cenários** (geração solar, backup, uso da bateria em horários estratégicos e redução de picos de demanda), análise financeira de 25 anos (Lei 14.300/2022 — Fio B) e emissão em **PDF** e **Word (.docx)** no mesmo layout do modelo Gênesis Engenharia.

Inclui também **contratos de prestação de serviços** (no layout do contrato modelo) gerados a partir das propostas e **propostas avulsas** para serviços complementares (manutenção, limpeza, laudos, projetos, carregador veicular…).

Funciona 100% no navegador: **não precisa de servidor, banco de dados nem instalação**. Pode ser publicada gratuitamente no **GitHub Pages**.

**Acesse:** https://camposfabiano1981-hue.github.io/gerador-propostas-solar/

---

## Funcionalidades

**Propostas**
- Formulário completo com cálculo ao vivo e painel-resumo (potência, FDG, geração, investimento, economia, payback simples/descontado, TIR, VPL, gráfico e alertas).
- **On-Grid**: nº de módulos sugerido pelo consumo, seleção automática do inversor pelo melhor FDG — fator de dimensionamento global (Pcc ÷ Pca = P FV ÷ P inversor), verificação de strings (opcional), alerta de limite por tipo de ligação.
- **Híbrido**: cadastro de cargas críticas (com marcação de motores), autonomia desejada, dimensionamento do banco de baterias pela energia **e pela potência** das cargas críticas (DoD, eficiência de ciclo, potência contínua das baterias, série/paralelo pela tensão do inversor; capacidade máxima das baterias modulares de alta tensão), módulos dimensionados com o **consumo próprio do inversor** e as **perdas do ciclo** da bateria, **balanço diário** no mês de menor geração com **fator de utilização** do banco, limites do inversor híbrido (entrada FV, potência e capacidade de bateria, surto × pico de partida dos motores) e modo *backup* ou *backup + ciclagem diária* — na tarifa convencional a ciclagem usa o mesmo banco do backup e mantém a reserva para falta de energia.
- Lista de materiais gerada automaticamente (módulos, inversor, baterias, kits de estrutura combinados, perfis, cabos, conectores), editável, com soma automática do kit. Só entram os materiais da proposta solar: cada material do cadastro indica **onde é usado** (proposta solar, propostas avulsas ou as duas), e os das propostas avulsas não aparecem na lista nem no catálogo da proposta solar.
- **Composição do preço pela margem**: custos diretos — kit (soma dos itens ou valor manual da cotação), **instalação por módulo** (faixa 1 de R$ 80,00/módulo aplicada automaticamente ou faixa 2, ambas em Configurações › Premissas), **infraestrutura CA** (começa zerada e é lançada em cada proposta) e **outros valores** — mais **lucro** (% do valor final ou valor em R$) e **comissão** (5% do valor final, automática). Valor final = (custos + lucro em R$) ÷ (1 − % lucro − % comissão); no híbrido/BESS, sobre o valor final de cada cenário (FV + armazenamento). Lucro e comissão aparecem só no painel; no contrato entram na linha de **mão de obra + projeto + instalação + homologação**. Propostas gravadas antes desta versão mantêm o valor informado, com botão para passar ao novo cálculo.
- **Valor na proposta impressa**: somente o valor final cheio, sem detalhamento; kit, infraestrutura, mão de obra, lucro e comissão ficam no painel da proposta.
- Opções de pagamento: à vista, cartão com acréscimo fixo e financiamentos (BV, Solfácil…) por PMT.
- **Número da proposta automático** `PREFIXO-AAAAMMDD-NNN` (ex.: GE-20261016-001): sequencial por data de emissão, atribuído ao salvar e nunca repetido (mesmo após excluir propostas). O prefixo é definido em Configurações › Empresa.
- **Proposta amigável para o cliente**, em linguagem simples e com o resultado em destaque:
  - **capa** com a redução da conta em %, os números principais (potência, geração, economia por mês) e a data de validade;
  - **apresentação da empresa**: o texto de apresentação, os cartões "Por que escolher" (diferenciais editáveis em Configurações › Textos padrão) e o cartão do responsável técnico ("Quem cuida do seu projeto");
  - projetos realizados;
  - **passo a passo** (cronograma em linha do tempo ilustrada, com o prazo de cada etapa): fica fora da proposta até ser ligado em Configurações › Textos padrão;
  - **como a energia solar funciona** (ilustração própria, com ou sem baterias) e os benefícios para o cliente;
  - **seu sistema**: números do projeto, gráfico de produção mês a mês, equipamentos com garantia e um glossário curto;
  - armazenamento (cargas críticas e resumo do banco) e comparativo de cenários, quando houver;
  - **seu investimento e retorno**: valor, tempo de retorno, economia no 1º ano, TIR × SELIC, economia em 25 anos (quantas vezes o valor volta), custo do kWh solar, gráfico do saldo acumulado, **como pagar** (todas as opções de pagamento em cartões: parcelas, taxa, total pago e o aviso quando a parcela é menor que a economia do mês, com a nota de pagamento e as observações), a validade e o contato pelo WhatsApp;
  - **o que está incluso** e o que não está, as garantias e o que acontece depois da instalação;
  - **quanto você economiza** ("por que a conta não zera?", "o que é o Fio B?" e a conta nos próximos anos — 2026 a 2031 e depois de 5 em 5 anos até o 25º — no formato da projeção com Fio B em versão amigável: % do Fio B, conta sem o sistema, mínimo (disponibilidade), energia + Fio B, COSIP, conta com o sistema e economia, com o valor que vale em negrito e o total da economia; quando a conta varia ao longo do ano, a faixa aparece no quadro da conta com o sistema);
  - **próximos passos** (aprovação, contrato, vistoria), considerações, cartão de contato e assinaturas.

  A composição de custos, as premissas do cálculo e o fluxo de caixa ficam fora do documento (o saldo acumulado aparece em gráfico em Seu investimento e retorno).

  Telefone (usado como WhatsApp), e-mail e endereço vêm de Configurações › Empresa. Os detalhes de engenharia (strings, FDG, HSP, PR, tensão do banco, balanço diário etc.) ficam no painel da proposta, fora do documento impresso.
- **Gestão das instalações** (Execução › Instalações): cada proposta aprovada vira uma obra (botão 🏗 na lista de propostas, na proposta aprovada ou no aviso do painel), com:
  - as **etapas do cronograma de execução** (Configurações › Textos padrão › Passo a passo), já com o nome da concessionária; dá para incluir, remover e reordenar etapas em cada obra;
  - **datas previstas** calculadas pelo prazo de cada etapa ("5 dias úteis", "15–30 dias úteis"…) a partir do início previsto e recalculadas quando uma etapa termina; etapas vencidas aparecem como **atrasadas**;
  - botões **Iniciar / Concluir / Reabrir** (datas automáticas e gravação imediata), **checklist** e observações por etapa;
  - **equipamentos instalados**: marca, modelo, potência e quantidade do módulo e do inversor (vêm da proposta), nº de série do inversor e as **fotos das etiquetas** (até 6 por equipamento, tiradas no celular ou escolhidas no computador; ficam no banco de fotos do navegador — IndexedDB — e numa cópia na nuvem, sem ocupar o armazenamento local, e entram no backup);
  - **checklist da instalação em três grupos** — estrutura de fixação e módulos, string box e inversor —, com campo para anotar medições (ex.: Voc de cada string), itens extras por obra e "não se aplica" (com microinversores a string box já começa assim); os itens padrão ficam em Configurações › Textos padrão;
  - **dados da obra** (UC, ART, protocolo de homologação, medidor, data da ligação), telefone do cliente e link da pasta de fotos da obra;
  - **histórico** com cada mudança de etapa e as anotações — base para avisar o cliente a cada avanço;
  - progresso, etapa atual, checklist e previsão de conclusão na lista, no resumo da obra e no painel; ao concluir, a obra pode virar uma ficha em **Projetos realizados** (sem o nome do cliente — faltam só as 2 fotos).
- **Ordens de serviço** (Execução › Ordens de serviço, ou "+ Nova ordem de serviço" dentro da instalação), para as demais demandas das instalações:
  - numeração própria **OS-AAAAMMDD-NNN**; tipo (manutenção preventiva ou corretiva, limpeza dos módulos, visita técnica, garantia/troca de equipamento, vistoria da concessionária, ampliação, pendência da instalação, outro), prioridade e situação (aberta, agendada, em execução, concluída, cancelada);
  - cliente, telefone e endereço trazidos da instalação; data agendada (atrasada quando vence), técnico, solicitação, serviço executado, materiais utilizados, atendimento em garantia e valor cobrado;
  - a abertura e a conclusão entram no **histórico da instalação**; lista com filtros (em aberto, atrasadas, por tipo) e cartão no painel com as em aberto, atrasadas e urgentes.
- **Emissão em PDF e em Word (.docx)** com o mesmo conteúdo e paginação. O PDF usa a fonte Arimo (métrica idêntica à Arial do modelo), carregada da internet na primeira emissão; sem internet, o .docx continua disponível.
- Situação (rascunho, enviada, em negociação, aprovada, recusada) e duplicação de propostas.

**Tarifas, BESS e cenários**
- Grupo B (convencional ou **branca**: ponta, intermediário e fora de ponta) e grupo A (**verde** e **azul**: consumo por posto, demanda contratada/medida, ultrapassagem acima da tolerância).
- **BESS** com ou sem FV (gabinetes com energia, potência, DoD, eficiência e ciclos) e híbridos com baterias.
- Até **4 cenários na mesma proposta**, com o mesmo horizonte e premissas: **Geração solar** (sem armazenamento), **Backup** (cargas críticas e valor da hora parada), **Horários estratégicos** (carga fora de ponta / com o excedente solar e descarga na ponta) e **Redução de picos** (corte da demanda medida no grupo A). Cada cenário tem dimensionamento, investimento (equipamento + instalação), degradação e troca do armazenamento, economia, VPL, TIR e payback.
- **Recomendação automática** da alternativa que faz mais sentido para o cliente, conforme o objetivo informado (maior retorno, segurança no fornecimento ou controle de demanda), com as razões; a proposta pode usar a recomendação ou outro cenário escolhido.

**Contratos**
- Contrato de prestação de serviços no layout do modelo: identificação das partes (CAMPO/DADOS), objeto, **produção média prometida com gráfico** (o mesmo da proposta), obrigações, prazo, **equipamentos contratados**, **termo de garantia** (com a linha das baterias/BESS quando há armazenamento), preço com **valor por extenso** e tabela de parcelas, dados bancários, rescisão, disposições gerais, local/data e assinaturas.
- Criado a partir de uma proposta (botão ✍ na lista de propostas) com cliente, objeto, produção mensal, equipamentos e parcelas preenchidos (equipamentos na assinatura + 50% / 50% dos serviços); tudo editável, inclusive as cláusulas de cada contrato.
- Cláusulas numeradas automaticamente, com referências cruzadas (`{cl:pagamento}`); modelo padrão editável em **Configurações › Modelo de contrato**.
- Numeração própria `CT-AAAAMMDD-NNN` e emissão em PDF e Word.

**Projetos realizados (portfólio)**
- Cadastro de obras concluídas (Cadastros › Projetos realizados) com **2 fotos** (recortadas em 4:3 e comprimidas no navegador) e ficha técnica: segmento, tipo de sistema, cidade, conclusão, potência, módulos, inversor, armazenamento, estrutura, geração média, economia e redução da conta.
- Seção **Projetos realizados** logo após a apresentação da empresa: cada proposta mostra **4 projetos** (ajustável em Configurações › Empresa; 0 = sem a seção), priorizando o mesmo tipo de sistema, segmento e cidade do cliente e os mais recentes; fotos lado a lado, ficha técnica com CO₂ evitado e cada projeto inteiro na mesma página (PDF e Word). Pode ser desligada em cada proposta.

**Propostas avulsas (serviços complementares)**
- Catálogo de serviços (Cadastros › Serviços) com categoria, unidade, preço e escopo.
- Proposta com itens do catálogo ou avulsos, **materiais utilizados** (do cadastro de materiais marcados para as propostas avulsas, ou avulsos; sem preço saem como "Incluso"), desconto, prazo, garantia, opções de pagamento e textos próprios, na mesma identidade visual da proposta solar (PDF e Word), com o quadro da capa centralizado. Valor total = serviços + materiais − desconto. Usa a mesma numeração das propostas solares.

**Cadastros**: clientes (com busca de CEP), equipamentos (módulos, inversores on-grid, **microinversores**, inversores híbridos, baterias, BESS, estruturas e materiais com regras de quantidade e a escolha **Usar em** — proposta solar, propostas avulsas ou as duas), serviços, concessionárias e tarifas (B1/B2/B3, branca, verde, azul e TUSD Fio B), localidades (HSP, COSIP e sazonalidade mensal), condições de pagamento e projetos realizados (portfólio com fotos).

**Cadastro pelo datasheet** — módulos, inversores on-grid, microinversores, inversores híbridos e baterias **não têm catálogo de fábrica**: são cadastrados a partir do datasheet do modelo exato, porque esses dados comandam o dimensionamento.
- Os formulários seguem as seções do datasheet (módulo: dados elétricos STC, coeficientes de temperatura, limites, mecânica e garantia; inversor: entrada CC, saída CA, bateria, backup, eficiência, geral). Os campos marcados com ★ entram no cálculo; a coluna **Datasheet** da lista mostra os itens completos, os que têm campos ★ vazios e os que aguardam revisão.
- **📄 Ler datasheet**: envie o PDF da ficha técnica e escolha **como ler**:
  - **No navegador** (gratuito, sem chave): o PDF é aberto no próprio computador com o PDF.js, o texto é organizado em linhas e colunas pela posição e os campos são procurados pelos rótulos usuais das fichas (inglês e português). Identifica as colunas de cada modelo, tabelas lado a lado, faixas ("40~560"), correntes por MPPT ("16/16", "4 × 16"), W/kW e Wh/kWh. Precisa de PDF com texto (não escaneado); a janela informa quantos campos ★ foram encontrados.
  - **Com IA** (API do Claude, da Anthropic): lê qualquer formato, inclusive foto da ficha técnica, com custo por leitura.
- **🔎 Pesquisar datasheet**: informe fabricante e modelo; a IA procura na internet o datasheet oficial (de preferência o PDF do fabricante), lê o PDF original e mostra a fonte. Se o PDF não puder ser baixado, usa a transcrição feita na pesquisa e avisa para conferir com atenção.
- **🔄** (em cada item da lista): pesquisa o datasheet do item e atualiza os dados técnicos, mantendo preço, descrição e observações.
- Os itens entram marcados como **Revisar**; confira com o documento, informe o preço dos novos e salve.
- A leitura usa a chave de API do próprio usuário (**Configurações › Leitura de datasheet (IA)**), salva só no navegador e fora do backup; o custo é cobrado pela Anthropic por tokens (e US$ 0,01 por busca na web, na pesquisa) e aparece estimado ao final de cada leitura. Modelo padrão Claude Opus 5.5; com Opus 5.5 e Sonnet 5.5, se o filtro de segurança recusar o documento, o pedido é refeito no modelo indicado pela Anthropic (fallback no servidor).
- Na atualização desta versão, os itens do antigo catálogo usados em propostas ficam inativos (a proposta continua igual; as de escolha automática passam a ter o equipamento fixado) e os demais saem do cadastro, com cópia restaurável em **Backup e dados**.

**Catálogo inicial** (preços em branco — informe os do seu distribuidor):
- Estruturas para telhado cerâmico, fibrocimento, metálico (trapezoidal, ondulado, zipado, sanduíche), laje, solo, shingle e carport, além de suportes e cabos específicos de microinversores.
- Itens com dados parciais estão identificados nas observações; confira sempre o datasheet vigente.

**Sincronização (nuvem)** — os mesmos dados no computador, no celular e no tablet, com a conta Google e o **Firebase** (plano gratuito):
- Login com Google e cópia no **Cloud Firestore**, atualizada **em tempo real** entre os aparelhos; sem internet, a plataforma continua funcionando e as alterações ficam na fila até a conexão voltar.
- No **primeiro login**, os registros que já existem no aparelho são enviados e mantidos; se outro aparelho já tiver enviado os dele, as bases são somadas. Quando o mesmo registro é alterado em dois aparelhos, vale a alteração mais recente; exclusões ficam marcadas para não voltarem. A numeração de propostas e contratos guarda o maior número reservado em qualquer aparelho.
- A **chave da API do Claude** e as preferências do aparelho **não** vão para a nuvem (cadastre a chave em cada aparelho que for usar a IA).
- Registros grandes (fotos dos projetos) são divididos em partes (limite de 1 MiB por documento do Firestore). Importar um backup ou restaurar os padrões passa a valer em todos os aparelhos conectados.
- Configuração única em **Configurações › Sincronização (nuvem)**: passo a passo do console do Firebase, regras de segurança prontas (acesso só da sua conta e do seu e-mail) e campo para colar o `firebaseConfig` — ou publicá-lo em `js/nuvem-config.js` para valer em todos os aparelhos. O indicador ☁️ no menu mostra a situação (sincronizado, enviando, sem internet, erro).

**Configurações**: dados da empresa e logotipo (inclusive dados do contrato e bancários, que ficam só no navegador), premissas técnicas/financeiras (PR, degradação, inflação, TMA/SELIC, cronograma do Fio B, disponibilidade, limites, parâmetros de baterias e BESS), textos padrão da proposta, modelo de contrato, sincronização (nuvem) e backup/importação dos dados.

---

## Como usar

### Online (GitHub Pages)
Acesse o endereço publicado (veja "Publicar no GitHub" abaixo).

### Como aplicativo (ícone no computador e no celular)

A plataforma é instalável (PWA): abre em janela própria, com o ícone **Propostas Solar** (o "G" com o sol e o raio da Gênesis), e funciona sem internet depois de aberta uma vez.

- O botão **📲 Instalar aplicativo** fica no menu lateral enquanto o app não estiver instalado: quando o navegador permite, abre a instalação; senão, mostra o passo a passo do navegador em uso (inclusive quando o link foi aberto dentro de outro aplicativo, como WhatsApp ou Claude, que não instalam — é preciso abrir no Chrome ou no Safari).
- **Computador (Chrome ou Edge)**: botão **📲 Instalar aplicativo** no menu lateral (ou o ícone de instalar na barra de endereço). O ícone vai para a área de trabalho, o menu Iniciar e a barra de tarefas; com o botão direito no ícone há atalhos para Nova proposta, Propostas e Contratos.
- **Android (Chrome)**: **📲 Instalar aplicativo** no menu ☰ (ou menu ⋮ › *Instalar app*).
- **iPhone/iPad (Safari)**: Compartilhar › **Adicionar à Tela de Início** (o botão do menu mostra o passo a passo). O app instalado no iPhone guarda os dados separado do Safari — entre com a conta Google em ☁️ Sincronização para trazer os cadastros.
- As atualizações chegam sozinhas: a página vem sempre da versão publicada quando há internet; sem internet, abre a última cópia guardada (as alterações vão para a fila da sincronização).

### No computador
Basta abrir o arquivo `index.html` no navegador (Chrome, Edge ou Firefox atualizados).

Opcionalmente, para servir pela rede local:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

e acesse `http://localhost:8765/`.

### Fluxo sugerido
1. **Configurações › Empresa**: confira razão social, CNPJ, registro, responsável técnico e envie o logotipo.
2. **Cadastros › Equipamentos**: cadastre módulos, inversores, microinversores, híbridos e baterias pelo datasheet (formulário, **📄 Ler datasheet** ou **🔎 Pesquisar datasheet**, depois de informar a chave em **Configurações › Leitura de datasheet (IA)**), com os preços do seu distribuidor, e os preços dos materiais (o kit é somado automaticamente).
3. **Cadastros › Localidades / Concessionárias**: confira HSP, COSIP e tarifas da sua região.
4. **Nova proposta**: escolha On-Grid, Híbrido ou BESS, selecione/cadastre o cliente, informe a modalidade tarifária, o consumo e o valor, compare os cenários, revise o resumo e clique em **Proposta em PDF** (ou **Word (.docx)**). Na lista de propostas, os botões **PDF** e **DOCX** baixam qualquer proposta salva.
5. **Contrato**: na lista de propostas clique em ✍ (ou em Contratos › Novo contrato), confira os dados e as parcelas e baixe o contrato. Antes, preencha em **Configurações › Empresa** a razão social, endereço, contatos e dados bancários do contrato.
6. **Serviços avulsos**: em Propostas avulsas, monte a proposta com os serviços do catálogo.

> **Onde ficam os dados?** No armazenamento local do navegador (localStorage, ~5 MB). Com a **☁️ Sincronização (nuvem)** ligada, também no Firebase da sua conta Google e em todos os aparelhos conectados; sem ela, cada navegador/computador tem a sua base. O backup `.json` (**Configurações › Backup e dados**) continua disponível como cópia extra.

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
5. A cada nova versão, atualize o número em `index.html` (`?v=`), `js/app.js` (`App.VERSAO_APP`) e `sw.js` (`VERSAO`): o aplicativo instalado troca o cache pela versão nova.

> Os dados digitados na plataforma **não** vão para o GitHub — ficam no navegador de quem usa. O repositório contém apenas o código e os cadastros de exemplo.

---

## Metodologia de cálculo

| Item | Fórmula |
|---|---|
| Potência necessária | `kWp = consumo_mensal ÷ (HSP × 30 × PR)` |
| Nº de módulos | `⌈kWp × 1000 ÷ Wp_módulo⌉` |
| Geração mensal / anual | `kWp × HSP × 30 × PR` / `kWp × HSP × 365 × PR` |
| FDG (fator de dimensionamento global) | `Pcc ÷ Pca = P_FV ÷ P_inversor` (faixa padrão 0,80–1,35; alvo 1,15) |
| Capacidade de baterias (backup) | `energia_backup ÷ (DoD × eficiência)`, com `energia_backup = Σ qtd × potência × min(horas de uso, autonomia)` (horas em branco = autonomia) |
| Eficiência de ciclo e DoD | `η = round-trip da bateria × eficiência bateria↔CA do inversor` (datasheets; faltando um, típicos 95% / 97%; sem nenhum, premissa de 92%). DoD do datasheet ou `energia útil ÷ nominal` |
| Potência do banco (backup) | `nº de baterias ≥ fator de segurança × potência das cargas ÷ potência contínua por bateria` (datasheet ou `corrente contínua × tensão`; sem dado, 0,5C); limitada pela potência de bateria do inversor (`pot. máx.` ou `corrente máx. × tensão do banco`) |
| Tensão do banco (híbrido) | baterias em série = tensão nominal do inversor ÷ tensão da bateria ou, em baixa tensão, o mínimo para entrar na faixa de bateria do inversor; banco fora da faixa = erro. Paralelismo de inversores e de baterias conferido com o máximo do datasheet |
| Pico de partida | `Σ cargas + maior motor × (fator de partida − 1)` (padrão 5×), comparado ao surto do inversor e à potência de pico das baterias |
| Voc no frio / Vmp no calor | `Voc × (1 + c × (25 − T mín.))` e `Vmp × (1 − c × (T máx. célula − 25))`, com `c` = valor absoluto do coeficiente de Voc (%/°C ÷ 100) do datasheet (premissas T mín. 0 °C e T máx. 70 °C); sem coeficiente, `Voc × 1,12` e Vmp nominal |
| Strings (inversor) | `máx. em série = ⌊min(Vmáx CC do inversor, Vmáx do sistema do módulo) ÷ Voc no frio⌋`; strings por MPPT distribuídas por igual: `Isc × strings ≤ Isc máx. por MPPT` (erro), `Imp × strings ≤ I máx. por MPPT` (aviso de limitação; Imp do datasheet ou `Pmáx ÷ Vmp`), strings ≤ MPPTs × entradas, Vmp no calor ≥ MPPT mínimo, Vmp ≤ MPPT máximo e Voc ≥ tensão de partida; com 3 ou mais strings em paralelo, `(n − 1) × Isc` comparado ao fusível máximo do módulo |
| Módulo: área e degradação | área do datasheet ou `comprimento × largura`; degradação anual do datasheet (após o 1º ano) na projeção de geração, no lugar da premissa |
| Microinversores | `nº = ⌈módulos ÷ entradas⌉`; Isc e Imp do módulo × limites por entrada; `ramais CA = ⌈nº ÷ máx. por ramal⌉` |
| Consumo do dimensionamento (híbrido) | `consumo + consumo próprio do inversor (W × 24 h; padrão 40 W) + perdas do ciclo (energia ciclada × (1/η − 1))` |
| Balanço diário / utilização | no mês de menor geração: `energia ciclada = min(capacidade acima da reserva × η, excedente solar × η, consumo noturno)`; `utilização = energia ciclada ÷ (capacidade acima da reserva × η)` (mínimo recomendado 70%); sugere módulos ou menos baterias |
| Ciclagem / redução de picos | a reserva `energia_backup ÷ eficiência` fica fora da ciclagem; na tarifa convencional não há arbitragem (o ganho é só o Fio B evitado − perdas), então a ciclagem usa o mesmo banco do backup em vez de um banco para todo o excedente solar |
| Fio B (ano N) | `energia_compensada × TUSD_FioB × %FioB(ano)`, com `energia_compensada = min(energia_injetada, consumo − autoconsumo)` e `energia_injetada = geração × (1 − simultaneidade)` (− energia armazenada na ciclagem); o autoconsumo simultâneo não paga Fio B |
| Conta sem sistema | `consumo × tarifa_N + COSIP_N` |
| Conta com sistema (grupo B) | `max(disponibilidade × tarifa_N, energia_não_compensada × tarifa_N + Fio B) + COSIP_N` — REN ANEEL 1.000/2021, art. 655-I (os dois não se somam). Opção em Premissas para a leitura de algumas distribuidoras: `max(energia_não_compensada, disponibilidade) × tarifa_N + Fio B sobre (energia_compensada − kWh que completam a disponibilidade) + COSIP_N` |
| Economia real | `conta sem sistema − conta com sistema` (a conta com sistema inclui o consumo próprio do inversor híbrido) |
| Faixa mensal da conta | ano 1 simulado mês a mês (fatores mensais de geração, perfil mensal de consumo, créditos transportados) — mostra a menor e a maior conta |
| Fluxo de caixa | ano 0 = − investimento (valor final da proposta); ano N = `(conta mensal sem sistema − conta mensal com sistema) × 12` (+ benefício de backup − troca de baterias, quando houver); o acumulado aparece no gráfico do saldo, em Seu investimento e retorno |
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
manifest.webmanifest  Aplicativo instalável: nome, cores, ícones e atalhos
sw.js                 Service worker: abre sem internet e atualiza o cache a cada versão
assets/icones/        Ícone do aplicativo (SVG e PNG: 192, 512, adaptável do Android, Apple e favicon)
css/app.css           Estilos
js/util.js            Formatação pt-BR, números, datas, DOM
js/defaults.js        Dados padrão (empresa, premissas, textos, catálogo de estruturas e materiais)
js/datasheet.js       Campos de datasheet de módulos, inversores, microinversores, híbridos e baterias (formulários e esquema da leitura por IA)
js/datasheet-local.js Leitura de datasheets no navegador, sem IA (PDF.js carregado sob demanda)
js/ia.js              Leitura e pesquisa de datasheets com a API do Claude (SDK oficial carregado sob demanda)
js/store.js           Persistência local, numeração e backup
js/nuvem.js           Sincronização com o Firebase (login Google, Firestore em tempo real, fila sem internet)
js/nuvem-config.js    firebaseConfig publicado para todos os aparelhos (opcional; em branco = colar na tela)
js/energia.js         Tarifas (convencional, branca, verde, azul), contas, compensação, cenários e recomendação
js/calc.js            Dimensionamento On-Grid/Híbrido/BESS, materiais, cenários, financeiro e pagamentos
js/passos.js          "Passo a passo" da proposta: cronograma de execução em linha do tempo (canvas → PNG)
js/chart.js           Gráfico "Estimativa de produção mensal", o mesmo na proposta e no contrato e gráfico do saldo acumulado (canvas → PNG)
js/arte.js            Artes da proposta: faixa da capa e ilustração "Como funciona" (canvas → PNG)
js/contrato.js        Contrato de prestação de serviços (dados e documento)
js/instalacao.js      Gestão das instalações: etapas do cronograma, datas previstas, checklist, equipamentos instalados, progresso e histórico
js/ordem.js           Ordens de serviço das instalações (tipos, prioridades, situação, atrasos)
js/fotos.js           Fotos das etiquetas: banco de fotos do navegador (IndexedDB) com cópia na nuvem, lida sob demanda
js/avulsa.js          Proposta avulsa de serviços complementares (dados e documento)
js/zip.js             Montagem do pacote .docx (ZIP com DEFLATE nativo do navegador)
js/documento.js       Conteúdo da proposta (modelo comum ao Word e ao PDF)
js/docx.js            Documento Word no layout do modelo
js/pdf.js             Documento PDF no layout do modelo (jsPDF + fonte Arimo, carregados sob demanda)
js/docx-parts.js      Estilos/tema/fontes extraídos do modelo original
js/logo-default.js    Logotipo padrão (gerado a partir de assets/logo-genesis.jpg)
js/ui.js              Roteador, diálogos, campos e cadastro genérico
js/pages/*.js         Telas (painel, propostas, formulário, contratos, instalações, cadastros, configurações)
tests/index.html      Testes automáticos do cálculo e do .docx
tests/equipamentos-teste.js  Módulos, inversores e baterias usados nos cenários de teste (antigo catálogo)
tools/serve.ps1       Servidor local opcional (Windows/PowerShell)
```

## Testes

Abra `tests/index.html` no navegador. Os testes reproduzem a proposta de referência GE-20260929-012 (mesmas premissas daquele documento) e conferem geração, FDG, Fio B, contas mensais (regra do art. 655-I), parcelas e a lista de materiais; contas nas tarifas branca, verde e azul; os cenários de BESS e a recomendação; as regras dos dados de datasheet (Voc no frio e Vmp no calor pelo coeficiente do módulo, tensão máxima do sistema, fusível de string, área e degradação; strings e correntes por MPPT, microinversores, tensão e paralelismo do banco, eficiência de ciclo), o esquema da leitura por IA, a leitura no navegador (números, faixas, colunas de modelos, tabelas lado a lado e de pares), a migração da base e a sincronização (avisos do armazenamento, exclusões marcadas, numeração mesclada, importação, leitura do `firebaseConfig` e regras do Firestore); o contrato (parcelas, numeração das cláusulas, valores por extenso) e a proposta avulsa — além de gerar os .docx e PDFs para download.
