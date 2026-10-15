# Permissões dos bancos (principal e Treino)

Regras em vigor desde 07/10/2026 (homologação, `hml-01`). Valem para os 2 projetos do Supabase e para os 2 schemas
(`public` e `staging`).

## Tabelas
- **Visitante (`anon`) não ganha nada sozinho.** Os default privileges do `postgres` (quem roda as migrations) não dão mais
  privilégio de tabela nem de sequência ao `anon`. Tabela nova que o visitante precise ler: `GRANT SELECT` explícito na
  migration dela, junto com a policy `TO anon`.
- **Logado (`authenticated`) só lê e grava linhas**: sem `TRUNCATE` (não passa pelo RLS), `TRIGGER`, `REFERENCES` e `MAINTAIN`.
- Hoje o visitante lê só o catálogo global do Treino (`tb_exercicios` e `grupos_musculares` com `professor_id` vazio). No
  principal, o visitante usa só funções (cadastro pelo link, diário, pré-consulta) e o Storage do diário.

## Funções
O Supabase dá `EXECUTE` a `anon` e a `authenticated` em toda função nova. Por isso toda migration escolhe um dos 2 jeitos:

| Quem chama | Grants |
|---|---|
| só o servidor (outra função `SECURITY DEFINER`, Edge Function com a `service_role`, `pg_cron`) | `revoke all on function … from public, anon, authenticated;` + `grant execute … to service_role;` |
| o app, com o login da pessoa | `revoke all on function … from public, anon;` + `grant execute … to authenticated, service_role;` |

- Função do segundo tipo **confere quem chama** dentro dela (`auth.uid()`, papel, vínculo). A conferência não pode cair no
  `NULL`: use `exists (…)` ou `coalesce(…, false)` (ex.: `pode_mexer_no_acesso`, `pode_ver_aluno`).
- Função de gatilho não precisa de `EXECUTE` de ninguém.
- Função **de policy** (roda como quem pede) é do 2º tipo: `meus_pacientes_ids()` e `minhas_nutricionistas_ids()` (hml-23).
- Função `SECURITY DEFINER` sempre com `search_path` fixo (`''` com os nomes completos, ou o schema dela).

## Principal: o plano alimentar do aluno no painel (hml-17, H-38)
- O painel lê o plano pelas RPCs `planos_do_aluno(p_aluno)`, `plano_alimentar(p_plano)` e `planos_favoritos()` (`SECURITY
  DEFINER`, do app com o login da pessoa). Elas conferem `eh_master() or pode_ver_aluno(<o aluno do plano>)` — a mesma regra das
  policies de leitura de planos, refeições e itens — e montam o plano com os alimentos de verdade pela interna
  `plano_alimentar_json(p_plano)` (sem `EXECUTE` para `anon` e `authenticated`; só roda dentro das 3).
- Por quê: quem vê o aluno (dono, personal, nutri que herdou o aluno) nem sempre lê o alimento próprio da nutri que montou o plano
  (o RLS de `alimentos` só deixa a TACO, os próprios e, ao aluno, os da nutri dele). Lido direto das tabelas, o item vinha sem o
  alimento e o total caía (1.894 → 1.540 kcal no staging). O RLS de `alimentos` e de `medidas_caseiras` **não abriu**: o alimento da
  nutri sai só junto do plano que a pessoa já vê (a lista e a busca de alimentos seguem iguais).
- Sem login → erro `sem_login`; quem não vê → `[]` / `null` (a mesma resposta do RLS, sem dizer se existe). As gravações do editor
  seguem pelas tabelas (RLS). Prova: `python3 e2e/hml17/api.py --schema staging|public`.

## Principal: os padrões do 1º acesso da nutrição (hml-19a, H-81 · jeito 2)
- As seções Anamnese, Documentos e Exames do Prontuário (e, na hml-19b, Manipulados, Metas e Orientações) não gravam mais o padrão
  do navegador: a função `nutricao` (ação `padroes_garantir`) chama a RPC `nutricao_garantir_padroes(p_secao, p_itens)` **como a
  pessoa** (a sessão de quem chama; nenhuma chave secreta).
- A RPC é **`SECURITY INVOKER`** (com `search_path` fixo): o RLS de hoje vale dentro — a pessoa só grava os próprios
  (`nutricionista_id = auth.uid()`) e a restritiva da W3 segue valendo (só quem escreve nutrição grava na biblioteca: o resto recebe o
  42501). Grava os itens **só** se a pessoa não tem nenhum próprio vivo na seção, com trava por pessoa e seção
  (`pg_advisory_xact_lock`: 2 chamadas juntas → 1 conjunto só). Lista fechada de seções (`anamnese`, `documento`, `exame`, `formula`,
  `meta`, `orientacao`); os textos moram com a função (`supabase-principal/functions/_shared/nutricao-padroes.ts`).
- Grants: `revoke all … from public, anon` + `grant execute … to authenticated, service_role` (o 2º jeito da tabela acima — quem
  confere é o RLS, por ser INVOKER). Sem login → `sem_login`; seção fora da lista → `secao_invalida`; itens fora da forma →
  `itens_invalidos`. Migração `20261011100000_hml19a_nutricao_padroes.sql` (reversa em `supabase-principal/reversas/`).
- Os grants e as policies das 18 tabelas do Prontuário **ficam** nesta etapa: a função grava com a sessão da pessoa (precisa deles) e
  os APKs antigos ainda gravam direto (`docs/desvios.md`, desvio 2).

## Principal: a Dieta, as Dietas e o app do aluno pela função `nutricao` (hml-19b, H-41 · jeito 2)
- As 19 tabelas da Dieta e das Dietas (`planos_alimentares`, `refeicoes`, `itens_refeicao`, `registros_diarios`,
  `calculos_energeticos`, `produtos`, `indicacoes_produto`, `formulas_manipuladas`, `modelos_formula`, `metas`, `modelos_meta`,
  `orientacoes`, `modelos_orientacao`, `alimentos`, `medidas_caseiras`, `receitas`, `ingredientes_receita`, `grupos_receita`,
  `diario_alimentar`) não são mais gravadas do navegador: a função `nutricao` (módulos `dieta.ts` e `aluno.ts`) grava **como a
  pessoa**, com o dono vindo do `user` (nunca do corpo). Fora: o link público `/d/:codigo` (sem login), que segue chamando a
  `diario_enviar` direto (decisão 13).
- O que é **tudo ou nada** vai por 7 RPCs **`SECURITY INVOKER`** (search_path fixo; o RLS de hoje vale dentro; o dono de `auth.uid()`):
  `dieta_criar_plano`, `dieta_duplicar_plano`, `dieta_salvar_receita`, `dieta_salvar_alimento`, `dieta_ordenar` (lista fechada:
  `refeicoes`, `indicacoes_produto`), `dieta_excluir_grupo_receita` e `dieta_copiar_semana`. Grants: `revoke all … from public, anon`
  + `grant execute … to authenticated, service_role` (o 2º jeito da tabela acima). Sem login → `sem_login`; corpo fora da forma →
  `dados_invalidos`; o que não existe, está na Lixeira ou o RLS esconde → `nao_encontrado` e **nada muda**.
- O app do aluno chama pela função as **mesmas** RPCs de hoje (`paciente_marcar_refeicao`, `aluno_marcar_meta`, `diario_enviar`),
  como o aluno; a foto sobe pelo link assinado (`createSignedUploadUrl` com a sessão do aluno, depois de `diario_pasta_valida`). A
  `diario_enviar` (definer, chamável pelo visitante e pelo logado — sem mudança de grant) passa a contar o **limite por IP** (hml-05c)
  só para quem **não** é o próprio aluno dono do código: pela função o IP é o da função, comum a todos (decisão da sessão principal,
  11/10/2026). O limite por aluno (30 fotos/h) segue para todos.
- Migração `20261011110000_hml19b_dieta_atomicas.sql` (reversa em `supabase-principal/reversas/`, que devolve a `diario_enviar` de
  hoje byte a byte). Os grants e as policies das 19 tabelas **ficam** nesta etapa (a função grava com a sessão da pessoa; os APKs
  antigos ainda gravam direto — `docs/desvios.md`, desvio 2).

## Principal e Treino: a Avaliação pelas funções (hml-19c, H-41 · jeito 2)
- **Principal:** `antropometrias`, `fotos_evolucao` (e o arquivo no bucket `evolucao`/`evolucao-staging`) não são mais gravadas do
  navegador: a função `nutricao` (módulo `avaliacao.ts`) grava **como a pessoa**, com o dono vindo do `user` (nunca do corpo). A foto
  sobe pelo link assinado (`createSignedUploadUrl` com a sessão da pessoa: a policy do bucket confere a 1ª pasta = quem chama, ou o
  master); o registro confere o arquivo naquele caminho; excluir = a linha à Lixeira e **depois** o arquivo (falhou o remove → log
  `arquivo_orfao`). O aviso "avaliação nova" chama a **mesma** `aluno_avisar_avaliacao` (definer, sem mudança de grant) pela função,
  como a pessoa — ela saiu do navegador (e do `RPC_QUE_GRAVAM` do `src/integrations/repeticao.ts`).
- **Treino:** a foto mensal (`physiq_registros_fotos` + o bucket `registros`/`registros-staging`) vai pela `admin-avaliacoes` (ações
  `foto_preparar`, `foto_salvar`, `foto_excluir`) **como a pessoa** (a chave anon + o token de quem chama; nenhuma chave secreta nessas
  3): o RLS "Staff gerencia registros dos seus alunos" e as policies do bucket decidem como antes. O escopo é a mesma regra da W3,
  perguntada como a pessoa (`pode_ver_aluno_treino`, que já tinha EXECUTE para `authenticated`). As ações de antes da função
  (`list`, `create`, `update`, `proxima`, `delete`) seguem com a `service_role`, sem mudança.
- Atenção (catálogo, 11/10/2026): a policy `registros_professor_write` do Storage do Treino vale para os 2 buckets e lê o vínculo em
  `public.physiq_profiles` **ou** `staging.physiq_profiles` — o vínculo da produção também decide no bucket do staging (e vice-versa).
- Nenhuma migration: os grants e as policies das 3 tabelas e dos 2 buckets **ficam** nesta etapa (a função grava com a sessão da
  pessoa; os APKs antigos ainda gravam direto — `docs/desvios.md`, desvio 2).

## Principal: o Financeiro pela função `financeiro` (hml-19d, H-41 · jeito 2)
- `transacoes`, `categorias_financeiras`, `modelos_recibo`, `recibos` e as tags do aluno (`pacientes.tags`) não são mais gravadas do
  navegador (Painel › Financeiro e o Financeiro do aluno): a função NOVA `financeiro` (porta `_shared/porta-pessoa.ts`, `verify_jwt`
  ligado) grava **como a pessoa**, com o dono vindo do `user` (nunca do corpo) e as colunas numa lista fechada
  (`_shared/financeiro-gravar-regras.ts`). Nas tags, só a coluna `tags` (o gatilho `pacientes_guard_cobranca` da W-P segue segurando
  as colunas de cobrança); a `admin-tags` do Treino segue chamada pela tela.
- O que é **tudo ou nada / 1 vez só** vai por 3 RPCs **`SECURITY INVOKER`** (search_path fixo; o RLS de hoje vale dentro; o dono de
  `auth.uid()`): `financeiro_garantir_padroes` (as 6 categorias e o "Recibo padrão" do 1º acesso, cada conjunto só se a pessoa não tem
  nenhum vivo, sempre com a conta — e só numa conta em que ela trabalha, `sou_membro`; trava por pessoa), `financeiro_emitir_recibo`
  (o recibo — o número segue vindo do gatilho `numerar_recibo` — + a movimentação ligada + o texto com o número real) e
  `financeiro_excluir_recibo` (o recibo à Lixeira + a movimentação solta). Grants: `revoke all … from public, anon` + `grant execute
  … to authenticated, service_role` (o 2º jeito da tabela acima). Sem login → `sem_login`; corpo fora da forma → `dados_invalidos`;
  o que não existe ou o RLS esconde → `nao_encontrado` e **nada muda**; conta de outro nas sementes → `sem_acesso`.
- Migração `20261011120000_hml19d_financeiro_atomicas.sql` (reversa em `supabase-principal/reversas/`). Não toca `cobrancas`,
  `planos_aluno`, `contas`, `recebimento_chaves` nem as colunas de cobrança de `pacientes`. Os grants e as policies das 4 tabelas e
  do `pacientes` **ficam** nesta etapa (a função grava com a sessão da pessoa; os APKs antigos ainda gravam direto —
  `docs/desvios.md`, desvio 2).

## Principal (e o Treino, desvio 23): as leituras de saúde do app do aluno pelas funções (hml-20a, H-42 · jeito 2, etapa 2)
- **Principal:** o app do aluno (Início, Evolução, Dieta/Diário) não lê mais a `minha_dieta`, a `minha_evolucao` nem assina as fotos
  do `diario`/`evolucao` no navegador: a função `nutricao` ganhou a ação **`ler`** (em lote — motor `_shared/leitura-lote.ts`, catálogo
  fechado `_shared/nutricao-leituras.ts`, módulo `nutricao/leituras.ts`), que roda cada consulta **como a pessoa** (o mesmo token): as
  RPCs de leitura de hoje (`minha_dieta`, `minha_evolucao` — definer, com o `auth.uid()` dentro; o EXECUTE do `authenticated` não
  muda) e o select de `diario_alimentar` (`id`, `path`, só as vivas) pelo RLS de hoje ("paciente: ler o proprio diario" + a restritiva
  da W24, que deixa passar o `paciente_do_meu_login`). A URL assinada sai do servidor com a sessão da pessoa (as policies de leitura
  dos buckets de hoje), só para os caminhos que a própria consulta leu, com o prazo de hoje (1 h); volta relativa ao projeto e a tela
  monta com o domínio dela (a mesma URL de antes). Colunas em lista fechada (nenhum `*`); consulta "minha" = o dono vem do `user`.
- **Treino:** a Evolução do próprio aluno (a aba Evolução e o card do peso do Início) **segue lendo direto do navegador**, como antes
  (`physiq_profiles`, `physiq_avaliacoes`, `physiq_registros_fotos` pelo REST, com o RLS "o aluno lê as próprias linhas", e a URL
  assinada do `registros` pela policy `registros_read_own_or_admin`) — o desvio 23 do `docs/desvios.md` (o gate de latência, 12/10/2026).
  A `admin-avaliacoes` tem a ação **`minha_evolucao`** pronta e publicada (antes do `requireAdmin`; o token conferido pelo JWKS; freio
  por pessoa em memória; o cliente **como a pessoa** — a chave anon + o token, nenhuma chave secreta — lê as 3 do `sub` do token, só as
  colunas que a tela usa, e assina as fotos no `registros`/`registros-staging`; qualquer papel lê só o próprio), sem uso pelo front até a
  condição do desvio.
- Nenhuma migration: os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20): a função lê com a sessão da pessoa,
  que precisa deles; os APKs antigos e o AAB ainda leem direto (`docs/desvios.md`, desvio 2). Fechar o `rest` é a etapa 4 do jeito 2,
  quando não houver mais leitura direta (H-43) e houver versão mínima de app.
- O fetch dos 2 clientes repete o POST de LEITURA 1 vez, como o GET de hoje (`ACOES_DE_LEITURA` em `src/integrations/repeticao.ts`:
  a `ler` da `nutricao`/`financeiro`, pelo campo `acao`, e a `minha_evolucao` da `admin-avaliacoes`, pelo campo `action` — pronta para
  quando o desvio 23 sair); as gravações dessas funções seguem indo 1 vez.

## Principal: as leituras de saúde do Painel › Aluno pela função (hml-20b, H-42 · jeito 2, etapa 2)
- A casca do aluno no painel (o cabeçalho, os KPIs e os cards), o Resumo (as anotações), o Prontuário ×10 (Anotações, Consultas,
  Anamnese, Questionários, Exames, Avaliação 360, Gestacional, Fármaco-nutrientes, Documentos, Anexos), a Avaliação (a série do principal
  e o "Editar") e o PDF "Dados & Evolução" não leem mais as tabelas, as RPCs e o Storage do principal no navegador: as libs mandam a ação
  **`ler`** da `nutricao` (o mesmo motor e o mesmo catálogo da hml-20a — só ganharam as 27 consultas da 20b), que roda cada consulta
  **como a pessoa** (o mesmo token): o select das 18 tabelas da área com as colunas do tipo (o `*` de antes, escrito coluna a coluna), o
  filtro do aluno (`paciente_id` do corpo — o RLS de hoje decide se a pessoa vê; outra conta = lista vazia/`nao_encontrado`, como
  antes), as vivas e a ordem de antes; as RPCs de leitura de hoje (`aluno_perfil`, `aluno_evolucao`, `aluno_anotacoes` — definer, com a
  `w14_matricula_da_rota`, cujos códigos `sem_login`/`sem_acesso`/`aluno_inexistente` voltam como o erro do item —, e `exames_do_aluno`,
  invoker); e o `profiles` de QUEM CHAMA (nome e dados profissionais — a única consulta "minha": o `id` vem do token, nunca do corpo).
  Os modelos e catálogos (anamnese, questionários, exames, interações, documentos) seguem como a lib lia: sem filtro de dono — o RLS
  decide os do sistema + os próprios.
- **Storage:** as fotos de evolução da casca/Avaliação são assinadas na MESMA ida da `aluno_evolucao` (bucket `evolucao`, 1 h — a policy
  de hoje deixa quem vê o aluno assinar); o Ver/Baixar dos anexos é a consulta `anexo_url { id, download }`: o servidor relê a linha
  pelo id como a pessoa e assina SÓ o caminho dela no `anexos` do ambiente, com o prazo de hoje (60 s para baixar com o nome do
  arquivo, 120 s para ver). Nenhum caminho nem nome vem do navegador; a URL volta relativa e a tela monta com o domínio dela.
- Ficam no navegador (de OUTRA W): no Resumo, o plano e os ✓ (`planos_do_aluno`, `refeicoes_concluidas` — 20c) e os compromissos, o
  responsável, o acesso e o "Editar dados" (`aluno_compromissos`, `aluno_responsavel`, `aluno_acesso`, `paciente_dado_livre` — H-43); o
  aviso das mensagens desligadas (`mensagens_desligadas`, H-43); e o Treino do painel (a `treino-leitura`, a `admin-get-user` e a
  `admin-semana-treinos`, já pelo servidor — desvio 22).
- Nenhuma migration; os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20: a função lê com a sessão da pessoa, que
  precisa deles; os APKs antigos e o AAB ainda leem direto — desvio 2).

## Principal: a Dieta, as Dietas, a Pré-consulta e o Dashboard de saúde pela função (hml-20c, H-42 + H-102 · jeito 2, etapa 2)
- **Leituras (H-42):** a Dieta do aluno no painel (Planejamento, Acompanhamento, Cálculo energético, Suplementos, Manipulados, Orientações,
  Metas e o "Editar treino e dieta"), as Dietas (Alimentos, Receitas, Diário), a Pré-consulta (Formulários, Respostas, os números e o
  contador do menu), a parte de saúde do Dashboard (o resumo, a "Atividade recente" e o "Diário de hoje") e os ★ da Ferramentas › Modelos
  não leem mais as tabelas, as RPCs e o Storage do principal no navegador: as libs mandam a ação **`ler`** da `nutricao` (o mesmo motor
  e o mesmo catálogo da hml-20a/20b — só ganharam as 34 consultas da 20c), que roda cada consulta **como a pessoa** (o mesmo token): o
  select das tabelas da área com as colunas do tipo (o `*` de antes, escrito coluna a coluna, e os embutidos de antes — as medidas do
  alimento, os ingredientes com o alimento, o aluno do diário com `!inner`), o filtro do aluno (`paciente_id` do corpo — o RLS de hoje
  decide), as vivas, a ordem, a página e o total de antes (o count exato, o HEAD do "só o número" e o total de cada dia que a página do
  Diário partiu, na MESMA ida); o recorte da conta ativa (`conta_id = a conta do corpo` ou o paciente sem conta do próprio — o `.or()` de
  hoje, montado no servidor com o `userId` do token); e as RPCs de leitura de hoje (`planos_do_aluno`, `plano_alimentar`,
  `planos_favoritos`, `grupos_alimentos`, `receitas_da_nutricionista` — com as receitas da página relidas pelos ids na mesma ida —,
  `preconsulta_numeros`, `respostas_da_conta`, `painel_resumo`), com o EXECUTE de hoje. "Minhas": os nomes para a cópia de receita e os
  grupos de receita com o "meus" (o dono = o token, nunca o corpo); os ★ com a conta (H-108) = só os do dono (o token) e da conta do
  corpo. Os modelos, o catálogo de produtos e todas as receitas seguem como a lib lia: sem filtro de dono — o RLS decide.
- **Storage:** as miniaturas do Diário e do Dashboard (`diario_urls { ids }`, até 60 por lote, 1 h) e a foto grande (`diario_foto_url
  { id }`, por clique, 300 s): o servidor relê as linhas pelo id como a pessoa e assina SÓ o `path` delas no `diario` do ambiente (a policy
  de leitura de hoje). Nenhum caminho vem do navegador; a URL volta relativa e a tela monta com o domínio dela (uma função só — H-106).
- **Gravações da Pré-consulta (H-102):** as 5 que a tela fazia direto passam pela `nutricao` com a sessão da pessoa (o RLS da W21 e os
  gatilhos de hoje seguem valendo): `preconsulta_formulario_criar` (o dono = o token; a conta do corpo, que a policy confere — só membro
  ativo; o `slug` nasce no servidor, no alfabeto e no tamanho da tela, de novo no conflito do índice único, até 5 vezes),
  `preconsulta_formulario_editar` e `preconsulta_resposta_ligar` (só as colunas da lista — dono, conta, slug e as de controle do corpo
  caem; o `importada_em` é o agora do servidor) e `preconsulta_formulario_excluir`/`preconsulta_resposta_excluir` (a Lixeira:
  `deleted_at`). Os códigos dos gatilhos (`aluno_invisivel`, `resposta_imutavel`, `formulario_imutavel`) voltam como eles (403). O
  formulário público `/f/:slug` (`preconsulta_formulario`/`preconsulta_responder`, como anônimo) **fica** como está (decisão 13).
- Ficam no navegador (de OUTRA W): no Dashboard, os alunos, a agenda e o financeiro (H-43 e 20d) e o Treino (`painel-resumo-treino`, já
  pelo servidor); na Pré-consulta, a equipe da conta (H-43); os links públicos do diário e do formulário (anônimos, de propósito).
- Nenhuma migration; os grants e as policies de LEITURA e de ESCRITA **ficam** (decisão 12 da spec hml-20: a função lê e grava com a
  sessão da pessoa, que precisa deles; os APKs antigos e o AAB ainda falam direto — desvio 2).

## Principal: o Financeiro pela função `financeiro` — as leituras (hml-20d, H-42 · jeito 2, etapa 2, parte 4)
- **Leituras (H-42, a última parte):** as 6 abas do Financeiro (Resumo, Mensalidades, Planos, Lançamentos, Recibos, Categorias), o
  Financeiro do aluno (Painel › Aluno), a parte do Financeiro do Dashboard e o resumo leve do app do aluno (a faixa do Início, a trava do
  inadimplente e o chip do Perfil) não leem mais as tabelas e as RPCs do principal no navegador: as libs mandam a ação **`ler`** da
  `financeiro` (o MESMO motor da `nutricao` — `_shared/leitura-lote.ts`, sem mudança — com o catálogo novo `_shared/financeiro-leituras.ts`,
  12 consultas, e o módulo `functions/financeiro/leituras.ts`), que roda cada consulta **como a pessoa** (o mesmo token; nenhuma chave
  secreta), no lote da tela (as comuns e as da aba aberta numa ida): o select das tabelas com as colunas do select de hoje (`categorias_
  financeiras`, `modelos_recibo`, `recibos`, `profiles`, `cobrancas` com o nome do aluno, `transacoes` com a categoria), as vivas, a
  ordem, a página com o count exato do Financeiro do aluno e as RPCs de leitura de hoje (`financeiro_resumo_periodo`,
  `financeiro_lancamentos`, `financeiro_recibos`, `financeiro_totais_do_aluno`, `financeiro_do_aluno`), com o EXECUTE de hoje — os
  `{ ok: false, erro }` de propósito das 3 da conta voltam como o erro do item. "Minhas" (o dono = o token, nunca o corpo): as categorias,
  os modelos, o último nº do recibo (sem o filtro das vivas — os da Lixeira contam, o número não volta) e o nome do profissional; as
  cobranças do Resumo/Dashboard com o recorte da conta ativa (`conta_id = a conta do corpo` ou sem conta e do próprio — o `.or()` de hoje,
  montado no servidor com o `userId` do token) e o "em aberto OU vence no mês", em leituras de 1000 até 20 no servidor (passou → a frase
  de hoje). O aluno e a conta vêm do corpo e o RLS/a RPC decide (outra conta → lista vazia / `sem_acesso`, como hoje). A aluna também
  chama a `financeiro` (a porta aceita qualquer pessoa logada, como a `nutricao`).
- **Gravações:** as 14 de antes (hml-19d) seguem iguais — o `ler` é despachado antes da lista delas. O comprovante do Pix (o PUT no link
  que o servidor assinou) é gravação e fica; a cobrança, o Pix e o Mercado Pago seguem pela `pagamentos-aluno`. Sem Storage nas leituras.
- Ficam no navegador (de OUTRA W): a equipe da conta das telas do Financeiro (`equipe_da_conta`, H-43).
- Nenhuma migration; os grants e as policies de LEITURA **ficam** (decisão 12 da spec hml-20: a função lê com a sessão da pessoa, que
  precisa deles; os APKs antigos e o AAB ainda leem direto — desvio 2).

## Treino: quem lê os treinos montados
- `tb_grupos_treino` e `tb_grupos_exercicios` (`physiq_pode_ler_grupo`): o master; o professor dono; qualquer profissional,
  se o grupo é do catálogo global do master (`professor_id` vazio); e o aluno que recebe o grupo (`tb_grupos_treino_perfis`).
  O app do aluno recebe os treinos pelo PowerSync e pelas Edge Functions (`service_role`).
- `tb_pastas_treino`: o master, o dono e, nas pastas globais, os profissionais. `tb_pastas_treino_grupos` segue a pasta.
- `tb_exercicios` e `grupos_musculares`: o visitante, só o global; o profissional, todos; o aluno, o global e o do professor dele.
- `physiq_profiles`: o próprio aluno não muda `professor_id`, `conta_id` nem as colunas de controle (`status`, `admin_locked`,
  `plano_nome`, `plano_expiracao`, `mensalidade_valor`, `cobranca_pausada`) — o gatilho `physiq_profiles_guard` mantém o valor.

## Testes
- `python3 e2e/hml01/banco.py --schema staging|public` — só leitura; confere tudo acima nos 2 bancos (vale em produção).
- `python3 e2e/hml01/equipe_staging.py` — só no staging: convite e papéis da equipe (dono pode, membro não).

## O CI confere (hml-13)
Todo PR roda `scripts/ci/checar-definer.mjs` (check `checar-pr`) nas migrations da hml-01 em diante. Fica vermelho: definer NOVA
sem `revoke … from public` e `from anon`, sem dizer o que faz com o logado (`revoke … from authenticated` ou `grant execute … to
authenticated`), ou qualquer definer sem `SET search_path`. Troca de função que já existe (mesmo nome e nº de argumentos) mantém os
grants e só precisa do `search_path`. Definer que o visitante chama de propósito entra na lista `ANONIMAS_DE_PROPOSITO` do script
(decisão escrita no PR). O estado do banco vivo continua com o `e2e/hml01/banco.py`.

## Principal: os acessos do aluno, as rotinas e a dieta livre (W-A P1, 12/10/2026 · jeito 2)
- **10 tabelas novas, gravadas SÓ pelas RPCs:** `aluno_acessos`, `aluno_acessos_log`, `rotinas`, `rotinas_feitas`, `rotinas_historico`,
  `aluno_alimentos`, `aluno_receitas`, `aluno_receita_itens`, `aluno_dia_refeicoes`, `aluno_dia_itens`. RLS ligado, **nenhuma policy de
  escrita**; o logado só tem `SELECT` e o RLS decide: nas do aluno, o dono (`dono_user_id = auth.uid()`); em `aluno_acessos`, quem vê o aluno
  (`pode_ver_aluno`) e o próprio aluno (`wa_minha_matricula` — as matrículas vivas dele); em `aluno_acessos_log`, só quem vê o aluno. O
  visitante não tem nada; o `physiq_backup` lê (o default da hml-07). Escrita direta = 42501.
- **Quem grava:** RPCs `SECURITY DEFINER` com `search_path = ''`, o 2º jeito da tabela "Funções" (`revoke … from public, anon` + `grant execute
  … to authenticated, service_role`), chamadas pelas funções `acessos` e `aluno-dia` (P2) COMO A PESSOA (o token dela; nenhuma chave secreta).
  Erro = `{ ok: false, erro: <código> }` — nunca texto livre, nunca nome de rotina ou alimento.
  - Do aluno (o dono vem do token): `minhas_rotinas`, `rotina_salvar` (criar só quem é aluno — a regra do `meu_paciente_id`; mudar qualquer
    rotina viva dele, inclusive a do profissional), `rotina_arquivar`, `rotina_marcar` (hoje/ontem de São Paulo, no dia da semana dela),
    `rotinas_ordenar`, `meu_dia` (lê mesmo travada), `dia_adicionar`, `dia_tirar`, `dia_desfazer`, `dia_extra_salvar`, `dia_extra_excluir`,
    `dia_extra_marcar` (o dia exige a Dieta liberada da matrícula do dia: a da refeição; na extra, a do plano ativo — o servidor decide, nunca o
    corpo), `meus_alimentos`, `meu_alimento_salvar`, `meu_alimento_excluir`, `minha_receita_salvar`, `minha_receita_excluir` (exigem a Dieta
    liberada em alguma matrícula), `buscar_alimentos_do_aluno` (TACO, os dos planos dele, os dele e as receitas dele).
  - Do profissional (a matrícula da rota pela `w14_matricula_da_rota`; muda quem a `w14_pode_editar` deixa — master, dono, responsáveis, a
    nutri dona): `acessos_ler`, `acessos_salvar` (`acesso_app`/`diario_alimentar`/`acesso_link` pela `aluno_salvar_ajustes` de hoje; a Dieta em
    `aluno_acessos`; liberar → 1 aviso `geral` por aluno e dia), `acessos_registrar_series` (só o histórico; a verdade das séries fica no Treino),
    `rotinas_do_aluno` (as do aluno + as de profissional das matrículas que ele vê), `rotina_prof_salvar` e `rotina_prof_arquivar` (só as de
    profissional DESTA matrícula; a do aluno → `so_do_aluno`), `dia_do_aluno` (o dia a dia, só leitura; o personal também — Q1).
- **Internas (só o servidor):** `aluno_dieta_liberada`, `wa_nutricao_de_verdade`, `wa_rota`, `wa_aviso_aluno`, `wa_acessos_json`,
  `wa_rotina_campos`, `wa_rotina_json`, `wa_rotina_gravar`, `wa_rotina_arquivar`, `wa_matriculas_dieta`, `wa_plano_ativo`, `wa_refeicao_do_dia`,
  `wa_alimento_visivel`, `wa_macros_da_receita`, `wa_dieta_liberada_alguma`, `wa_dia_item_json`, `wa_dados_do_aluno`, `wa_uuid`, `wa_numero`,
  `wa_texto`. De gatilho: `wa_log_acessos_pacientes` (`trg_pacientes_wa_log_acessos`, AFTER UPDATE em `pacientes` SEM lista de colunas, com
  WHEN — compara o valor EFETIVO de `ajustes_do_aluno`: pega o caminho antigo, o APK velho e o `acesso_app` que a P15 liga quando nasce o login)
  e `wa_log_aluno_acessos`.
- **Chaves estrangeiras:** `dono_user_id` → `auth.users` ON DELETE CASCADE; os autores (`criada_por`, `alterada_por`, `arquivada_por`, `por`,
  `alterado_por`) → SET NULL; o que aponta para tabela da nutri (`refeicoes`, `itens_refeicao`, `alimentos`) → SET NULL com o RETRATO na linha
  (a nutri apaga de verdade — `refeicao_excluir`, `item_excluir`, o copiar semana, a lixeira — e nada dela trava).
- **LGPD:** `exportar_dados_aluno` (o corpo vivo da hml-12, com `'aceites'`) leva as 8 tabelas do aluno e os acessos das matrículas dele, sem
  os ids de quem mudou; `excluir_dados_aluno` e a parte de aluno da `excluir_conta_profissional` (o corpo vivo de CADA schema — no staging o da
  hml-02b, com `diario-staging`) contam (`apaga.rotinas_e_dieta`) e apagam na mesma transação (`wa_dados_do_aluno`). Seguem só do servidor.
- **As funções da P2 e os contratos** (POST, `Authorization: Bearer <token do principal>`, `x-schema: public|staging`, `{ acao, … }`; toda
  leitura é `acao: "ler"`): `acessos` (principal, verify_jwt true, freio 120/min — `ler { aluno }` · `salvar { aluno, chave, valor }`),
  `aluno-dia` (principal, verify_jwt true, freio 240/min — `ler { q: rotinas | dia | biblioteca | alimentos | aluno_rotinas | aluno_dia, … }` e
  as gravações do aluno e do profissional) e `treino-acessos` (Treino, verify_jwt false — o token é do principal; o molde da `treino-leitura`
  com o vínculo de `physiq_identidades` e o `treinoVisivelPelaConta`; grava SÓ `physiq_profiles.series_travadas` do `treino_user_id` que o
  principal devolveu, com a chave automática do projeto, e registra pela `acessos_registrar_series`). Erros: 400 `dados_invalidos`/`acao_invalida`
  · 401 `sem_login` · 403 `sem_acesso` · 404 `nao_encontrado`/`aluno_inexistente`/`sem_treino` · 409 `dieta_travada`/`sem_login_do_aluno`/
  `sem_nutricao`/`sem_modulo`/`so_do_aluno`/`limite` · 413 · 429 `muitas_acoes` · 500 `erro_interno` · 502 `principal_indisponivel` (Treino).
- Migrations `20261012200000_wa1_acessos`, `20261012210000_wa2_rotinas` e `20261012220000_wa3_dieta_livre` (a wa3 com bloco compartilhado:
  no `public`, `--so public` e DEPOIS `--compartilhado`; no staging só `--so staging`); reversas em `supabase-principal/reversas/` (wa3 → wa2 →
  wa1; tabela com linha vira `<nome>_reversa_waN`). Prova: `python3 e2e/wa/sql_wa.py` (staging, blocos desfeitos) e
  `python3 e2e/wa/sql_wa.py --so-catalogo --schema staging|public` (só leitura).

## Principal: a casca e o app do aluno pela função `conta` (hml-21a, H-43 parte 1 + H-112/H-109 parte 1 · jeito 2, etapa 3)
- **A função NOVA `conta`** (principal, `verify_jwt` true; a porta `servirComoPessoa("conta", { freio: 240, jwtLeitura: "jwks" })`) roda
  tudo **como a pessoa** (a chave anon + o token de quem chama; nenhuma chave secreta): o dono vem do `user` do token, nunca do corpo;
  o erro do banco vira o código (`sem_acesso`, `nao_encontrado`, `dados_invalidos`, `conflito`, `tempo_esgotado`, `erro_interno`), nunca a
  mensagem crua; o log tem só campos fixos (ação, n, ms, códigos).
- **Leituras (`acao: "ler"`, em lote):** o motor COMUM `_shared/leitura-servidor.ts` (H-112: o catálogo é parâmetro; a `nutricao` e a
  `financeiro` migram para ele na 21c — até lá, 3 cópias) com o catálogo `_shared/conta-leituras.ts`, 9 consultas, as mesmas linhas que as
  libs liam no navegador: o sino (`avisos`, os 30 mais novos — o RLS de hoje: a única policy de leitura é `destino_user_id = auth.uid()`),
  o aviso de membro removido (o mais novo não lido, tipo `membro_removido`), a situação (`minha_situacao`), o perfil e a agenda do aluno
  (`meu_perfil_aluno`, `minha_agenda`, `minha_agenda_lista`), o Meu plano e os pratos do aluno sem profissional (`meu_plano_app`,
  `pratos_prontos_do_app`) — as RPCs de leitura de hoje, definer com o `auth.uid()` dentro, o EXECUTE do `authenticated` de hoje — e a foto
  do perfil (o `profiles` de quem chama, `id = user`, só a chave `foto_url` do `dados_profissionais`). Colunas em lista fechada (nenhum `*`).
  No `ler`, o token é conferido localmente pelo JWKS do principal (H-109: `_shared/jwks-principal.ts` — o emissor `<SUPABASE_URL>/auth/v1`,
  a audiência `authenticated` e o prazo; falhou por rede/chave → o `getUser` de reserva; inválido ou vencido → 401); as ações seguem com o
  `getUser`. Sem a opção (`nutricao`, `financeiro`, as outras), a porta é a de antes.
- **Gravações (14 ações, o MESMO efeito de hoje):** a casca — `avisos_marcar_lidos` (o `lido_em` só das linhas com os ids pedidos E
  `destino_user_id` = quem chama, até 30; a ação não repete), `aviso_membro_ok` (o `lido_em` daquela linha, se é da pessoa), e as RPCs de
  hoje pelo EXECUTE do `authenticated`: `marcar_aviso_mudanca`, `minha_senha_definida` (o `auth.updateUser` da senha fica no navegador: é o
  login), `push_registrar`/`push_esquecer`, `aceitar_no_acesso`, `criar_minha_conta`, `entrar_sem_profissional`; o app — o `profiles.nome`
  de quem chama, `mudar_objetivo_app` e a foto do perfil (abaixo). Corpo de cada ação em lista fechada (chave fora da lista cai).
- **Storage (`fotos-perfil`/`fotos-perfil-staging`, 5 MB, jpeg/png/webp — as policies da pasta própria da migration
  `20260929120000_w05_equipe`):** `perfil_foto_preparar` decide o caminho NO SERVIDOR (`<user>/foto-<ms>.<ext>`) e assina o link de upload
  como a pessoa (`createSignedUploadUrl`); o navegador sobe o arquivo nesse link (o PUT do `uploadToSignedUrl` — é gravação e fica);
  `perfil_foto_salvar` só aceita EXATAMENTE esse formato na pasta de quem chama (fora → `dados_invalidos`), confere que o arquivo está lá,
  grava a URL pública como hoje (o domínio próprio — o `getPublicUrl` virou a função pura `urlPublicaDaFoto`) e apaga a foto anterior se ela
  é um arquivo da pasta da pessoa nesse bucket (achado 2); `perfil_foto_tirar` limpa a URL e apaga o arquivo pela mesma regra.
- **Ficam no navegador:** o login e a sessão (`auth.*`), a Agenda do aluno (as regras, os horários e as gravações dela — 21b), os treinos
  prontos (Treino — 21d), a parte do Treino do Início/Evolução (desvio 23) e o PowerSync (desvio 3). A guarda nova
  `src/integrations/semBancoNoNavegador.test.ts` conta o que ainda vai direto (a `BASE`, que só diminui) e o que fica de vez (`FICA`, 4
  arquivos).
- O fetch repete o `ler` da `conta` 1 vez (`ACOES_DE_LEITURA`); as ações não repetem; as 14 RPCs que a `conta` chama saíram das listas de
  RPC do front (`src/integrations/repeticao.ts`).
- Nenhuma migration: os grants e as policies **ficam** (decisão 12 da spec hml-21: a função usa a sessão da pessoa, que precisa deles; os
  APKs antigos e o AAB ainda chamam direto — desvio 2). Fechar o `rest` é a etapa 4 do jeito 2.

## Principal: a Agenda, os Alunos e o Dashboard pela função `conta` (hml-21b, H-43 parte 2 · jeito 2, etapa 3)
- **2 RPCs novas** (migration `20261013100000_hml21b_agenda_atomicas`; reversa em `supabase-principal/reversas/`): as 2 gravações da Agenda
  que eram vários pedidos do navegador sem transação viram TUDO OU NADA. `SECURITY INVOKER` com `search_path = ''` (o RLS de hoje vale dentro
  — o dono, o dono da conta, o master), o 2º jeito da tabela "Funções" (`revoke … from public, anon` + `grant execute … to authenticated,
  service_role`), chamadas SÓ pela `conta` COMO A PESSOA (nenhuma chave secreta). O dono vem do `auth.uid()`, nunca do corpo; sem login →
  `sem_login` (42501); corpo fora da forma → `dados_invalidos` (22023); o que não existe, está na Lixeira ou o RLS esconde → `nao_encontrado`
  (P0002) e nada muda.
  - `agenda_excluir_calendario(p_calendario uuid) → integer`: os agendamentos vivos do calendário e depois o calendário vão à Lixeira com o
    MESMO `deleted_at`, numa transação (antes, 2 pedidos: falhou o 2º, sobravam os agendamentos na Lixeira com o calendário vivo); o gatilho
    `trg_agendamentos_w20_avisar` avisa o aluno das consultas futuras, como hoje. Devolve quantos agendamentos foram.
  - `agenda_garantir_inicio(p_conta uuid, p_papeis text[], p_modulos text[]) → jsonb { criados }`: o 1º acesso à Agenda (antes, 2 a 4
    pedidos), idempotente — quem já tem um calendário vivo não ganha nada; senão as tags base pela `agenda_garantir_tags` de hoje (numa
    subtransação: a recusa dela = os calendários sem tag padrão, como a tela) e os calendários iniciais com os nomes, as cores, o "padrão" e a
    tag de hoje (`src/agenda/regras.ts`). A conta vem do corpo, como o insert de hoje; os papéis e os módulos só escolhem nome, cor e tag.
    Trava por pessoa (`pg_advisory_xact_lock`): 2 abas não duplicam; o `created_at` do relógio (`clock_timestamp`), a ordem de hoje.
- **Leituras (`acao: "ler"`, em lote):** o catálogo `_shared/conta-leituras.ts` ganha 19 consultas (13 da Agenda, 6 dos Alunos), as mesmas
  linhas que as libs liam no navegador, como a pessoa: os calendários, as tags, os agendamentos (a janela; os 1000 mais recentes), os
  bloqueios (a janela e os futuros), as travas, as regras, os alunos do seletor da Agenda (o recorte "meu ou da conta" — o `.or()` de hoje),
  o aluno do `?aluno=` (pelo id, vivo — o RLS de hoje decide se é visível), o aluno já escolhido no seletor (só desta conta e vivo; o CPF só
  quando o Recibo pede) e as RPCs de leitura de hoje pelo
  EXECUTE do `authenticated`: `agenda_horarios`, `aluno_compromissos`, `minhas_regras_agenda`, `aluno_agenda_horarios`, `alunos_da_conta`
  (a lista, a exportação, o seletor, a Busca e o número do menu), `aluno_convites`, `alunos_pendentes`, `alunos_novos_por_mes` e
  `equipe_da_conta` (só a leitura). Colunas em lista fechada (as da Agenda = a linha inteira de hoje, escrita coluna por coluna).
- **Gravações (21 ações, o MESMO efeito de hoje):** a Agenda do painel — `agenda_garantir` e `calendario_excluir` (as 2 RPCs novas),
  `tags_garantir` (a `agenda_garantir_tags`), `calendario_criar`/`calendario_editar`, `tag_criar`/`tag_editar`/`tag_excluir`,
  `agendamento_criar`/`agendamento_editar`/`agendamento_excluir` (o dono = o dono do calendário, lido como a pessoa),
  `bloqueio_criar`/`bloqueio_excluir`, `trava_criar`/`trava_excluir` e `regras_salvar` (o `agenda_config` de quem chama); a Agenda do aluno
  — `agenda_confirmar`/`agenda_desistir`/`agenda_reagendar`/`agenda_marcar` (as `aluno_agenda_*` de hoje); os Alunos — `pacote_definir` (a
  `aluno_definir_pacote`). Corpo em lista fechada; editar ou excluir 0 linha (não existe ou o RLS esconde) → `nao_encontrado`.
- **Ficam como estão:** o login e a sessão (`auth.*`); as outras gravações dos Alunos (a função `alunos`); os treinos (Treino — 21d); a
  parte de saúde do Dashboard (a `nutricao`, hml-20c). O fetch repete o `ler` da `conta` 1 vez e as ações não repetem; as RPCs que a `conta`
  chama saíram das listas de RPC do front (`src/integrations/repeticao.ts`); a `BASE` da `semBancoNoNavegador.test.ts` diminuiu.
- Nenhum grant de tabela nem policy muda (decisão 12 da spec hml-21: a função usa a sessão da pessoa; os APKs antigos ainda chamam direto).
  Ordem: a migration no staging ANTES de publicar a `conta` v2 e na produção ANTES do merge (o front antigo não chama as RPCs novas). Prova:
  `python3 e2e/hml21/sql_agenda.py` (staging, como a pessoa, blocos desfeitos).

## Treino (e o editor no principal): o Painel › Treinos, a Biblioteca, o Master e os treinos prontos pela função `treinos` (hml-21d, H-43 parte 3 · jeito 2, etapa 3)
- **A função NOVA `treinos`** (Treino, `verify_jwt` true; a porta `abrirPedidoNoTreino(req, "treinos", { freio: 120, jwtLeitura: "jwks" })` de
  `_shared/porta-treino.ts`) roda tudo **como a pessoa** (a chave anon do Treino + o token do Treino de quem chama — a sessão da troca, a
  mesma do app; nenhuma chave secreta): o dono vem do `sub` do token (o master cria no global, como o `donoAoCriar` da tela), nunca do
  corpo; o erro do banco vira o código (`sem_acesso`, `nao_encontrado`, `dados_invalidos`, `conflito`, `em_uso`, `storage_falhou`,
  `tempo_esgotado`, `erro_interno`), nunca a mensagem crua; o catch final responde `erro_interno` (o log do Treino). No `ler`, o token é
  conferido localmente pelo JWKS do Treino (`_shared/jwks-treino.ts`; falhou por rede/chave → o `getUser` de reserva).
- **Master:** as ações e as leituras do Master são conferidas NA FUNÇÃO antes do banco pelo `app_metadata.role` do token (admin/master — o
  mesmo que o `physiq_papel()` lê): quem não é → 403 `sem_acesso`, sem ida ao banco; o RLS do Treino (`physiq_is_master()`) decide de novo.
- **2 RPCs novas** (migration `20261013100000_hml21d_treinos_atomicas` do Treino, aplicada com `set physiq.schemas = 'staging'` ou `'public'`;
  reversa em `supabase/reversas/`): `SECURITY INVOKER`, `VOLATILE`, `search_path = ''`, o 2º jeito da tabela "Funções" (`revoke … from
  public, anon` + `grant execute … to authenticated, service_role`), chamadas SÓ pela `treinos` COMO A PESSOA. Sem login → `sem_login`
  (42501); corpo fora da forma → `dados_invalidos` (22023); o que não existe ou o RLS esconde → `nao_encontrado` (P0002) e nada muda.
  - `treino_pronto_salvar(p_id uuid, p_treino jsonb, p_divisoes jsonb) → uuid`: a linha do treino pronto, as divisões e os exercícios numa
    transação (antes, 2 + 2×N pedidos em série: uma falha no meio deixava o treino sem as divisões — achado 3 da spec); editar troca as
    divisões (as de antes saem pela FK em cascata) e devolve o MESMO id. Só o master grava (o RLS de hoje).
  - `modelo_ordenar(p_grupo uuid, p_ids uuid[]) → integer`: a ordem de todos os exercícios do modelo de uma vez (antes, 1 pedido por
    exercício — achado 4); um id que não é do modelo → `nao_encontrado` e nada muda (antes, os outros mudavam).
- **⚠️ Desvio do gate (F7 da hml-21d):** o gate de latência reprovou as leituras pela `treinos` (o Meus treinos p50 2,65 s × 2,04 s lendo direto; com a função quente empatam, mas a 1ª abertura com ela ociosa — ≥ 10 min sem pedido — levou 4,6–12,6 s). O front **não usa** as leituras abaixo: o Painel › Treinos, os Modelos › Treinos, a Busca, o editor, o Master e os treinos prontos do aluno seguem lendo DIRETO (como antes, com o RLS de hoje); o catálogo de leituras fica publicado na `treinos` (provado no E2E) para quando o frio da função for resolvido. As GRAVAÇÕES (abaixo) vão pela `treinos`. (O desvio 24 do `docs/desvios.md`.)
- **Leituras (`acao: "ler"`, em lote; o motor é a CÓPIA do comum do principal — `_shared/leitura-lote.ts` e `_shared/leitura-servidor.ts`,
  iguais byte a byte, o Vitest confere):** o catálogo `_shared/treinos-leituras.ts`, as mesmas linhas que as libs liam no navegador, como a
  pessoa: Meus treinos (a RPC `modelos_da_lista` e os detalhes da página — as linhas com o exercício citado e os vínculos de pasta, numa
  consulta), o treino pelo id, as pastas, os grupos musculares, o catálogo dos Modelos › Treinos, a Busca (os treinos), os treinos prontos
  ativos do aluno sem profissional e a biblioteca (a RPC `exercicios_da_lista`, a consulta especial); do Master, todos os treinos prontos, a
  biblioteca global (com página — antes cortava calado em 1000), os grupos globais e quantos exercícios globais usam um grupo. O "global ou
  meu" (o `doEscopo` de hoje) é montado no servidor com o `sub` do token. Colunas em lista fechada (nenhum `*`).
- **Gravações (27 ações, o MESMO efeito de hoje):** os modelos e as pastas (`modelo_*`, `pasta_*` — a ordem pela RPC nova; o vínculo que já
  existe = ok, como hoje), a biblioteca (`exercicio_criar`/`_editar`/`_excluir`, `grupo_muscular_criar`/`_excluir`), o espelho do perfil
  (`professor_perfil`: o nome e a foto SÓ na linha de quem chama — o `physiq_professores.id` = o `sub`) e o Master (`treino_pronto_salvar`
  pela RPC nova, `treino_pronto_ativo`, `exercicio_global_*`, `grupo_global_*`). Corpo em lista fechada; mudar ou apagar 0 linha →
  `nao_encontrado`; o 23503 do apagar (em uso num treino pronto) → `em_uso`, a frase de hoje.
- **Storage (`exercicios`/`exercicios-staging`, 5 MB, gif/webp/png/jpeg — a policy `exercicios_professor_write`: o exercício do nome do
  arquivo é de quem grava; ou o admin):** `exercicio_foto_preparar` decide o caminho NO SERVIDOR (`<id do exercício>.<ext>`, o de hoje — a
  policy exige esse nome, sem a pasta do user) e assina o link de upload como a pessoa (upsert); o navegador sobe o arquivo nesse link (o PUT
  do `uploadToSignedUrl` — é gravação e fica); `exercicio_editar` só grava como foto nova a URL pública DESTE exercício neste bucket com o
  arquivo lá (outra → `dados_invalidos`; sem o arquivo → `nao_encontrado`), a que já estava, ou nenhuma.
- **A `conta` (principal) v4:** + a consulta `aluno_treino` (publicada; o front não usa — o desvio do gate; o editor do Aluno › Treino: a RPC `aluno_treino` de hoje pelo EXECUTE do
  `authenticated`, com a recusa da matrícula da rota).
- **Ficam como estão:** o login e a sessão (`auth.*` e a troca de token), as funções do Treino de antes (`admin-*`, `treino-leitura`,
  `painel-resumo-treino` — o desvio 22), o PowerSync (desvio 3) e a parte do Treino do Início/Evolução (desvio 23). As ações da `treinos`
  não repetem; as 3 RPCs de leitura (`modelos_da_lista`, `exercicios_da_lista`,
  `aluno_treino`) seguem no navegador e no `RPC_SO_LEITURA` (`src/integrations/repeticao.ts`) — o desvio do gate; a `BASE` da `semBancoNoNavegador.test.ts` diminuiu só nas gravações.
- Nenhum grant de tabela nem policy muda (decisão 12 da spec hml-21: a função usa a sessão da pessoa; os APKs antigos ainda chamam direto).
  Ordem: a migration no staging do Treino ANTES de publicar a `treinos` (as ações chamam as RPCs) e na produção ANTES do merge (o front
  antigo não chama as RPCs novas). Prova: `python3 e2e/hml21/sql_treinos.py` (staging do Treino, como a pessoa, blocos desfeitos).

## Principal: o Aluno › Resumo, as Configurações, a Mensagens, a Lixeira e os Modelos pela função `conta` (hml-21c, H-43 parte 4 + H-112/H-109 parte 2 · jeito 2, etapa 3)
- **Sem migration:** as 25 RPCs que o front chamava direto seguem como estão (as mesmas definições, os mesmos `raise`), agora chamadas pela
  `conta` COMO A PESSOA (o token de quem chama no cliente do Supabase — nenhuma chave secreta): o RLS e o `auth.uid()` de dentro delas valem
  como hoje. Nenhum grant de tabela, policy ou EXECUTE muda (decisão 12 da spec hml-21: os APKs antigos ainda chamam direto).
- **A `conta` v5 = a v4 + 4 módulos** (`conta/{aluno,configuracoes,mensagens,lixeira}.ts`), cada ação com o corpo em lista fechada (o dono
  NUNCA vem do corpo; os objetos `ajustes`, `dados`, `whatsapp` são FECHADOS: chave de fora = recusa, nada roda) e o `raise` de propósito
  de cada RPC devolvido como o código (a varredura do progresso da 21c; nunca 500 + `log.excecao`):
  - o Aluno › Resumo (8): `acesso_ler` (a `aluno_acesso` — só lê, mas é AÇÃO: decisão 13), `acesso_criar` (`paciente_criar_acesso`),
    `acesso_redefinir_senha` (`paciente_redefinir_senha` — o Master usa a MESMA pela `SheetSenhaAluno`), `aluno_ajustes_salvar` (só a chave
    `mensagens_automaticas`: as 3 que foram para a aba Acessos na W-A P4 são recusa), `aluno_dados_salvar`, `aluno_link_novo`,
    `aluno_responsavel_registrar` e `aluno_avisar_plano` (a reserva do "Salvar e enviar");
  - as Configurações (6): `perfil_salvar` (o `profiles` de quem chama: o nome, o tipo, a área e SÓ as chaves do `dados_profissionais` que o
    form edita, por cima do JSON atual — a foto, nunca: vai pelas ações da 21a), `conta_salvar` (o RLS de hoje: só o dono; 0 linha =
    `nao_encontrado`), `equipe_papeis` (`alterar_papeis_membro`), `equipe_remover` (`remover_membro`), `meu_codigo_garantir`
    (`garantir_meu_codigo`) e `prontuarios_para_baixar` (o ZIP da exclusão — `w2l_prontuarios_para_baixar`: é AÇÃO porque a RPC não tem
    DEFAULT no `p_conta` e o motor de leitura não manda null);
  - a Mensagens e a faixa (5): `whatsapp_config_salvar`, `whatsapp_reenviar`, `whatsapp_limpar_falhas`, `faixa_ligar_para_todos`
    (`mensagens_ligar_para_todos`, até 500 ids) e `faixa_fechar` (`mensagens_aviso_fechar`);
  - a Lixeira (2): `lixeira_restaurar`/`lixeira_apagar` (o tipo como texto: a RPC decide — `tipo_invalido`, `aluno_nao_apaga`).
- **Leituras (`acao: "ler"`, em lote):** 8 consultas novas no catálogo `_shared/conta-leituras.ts`, as mesmas linhas que as libs liam, como
  a pessoa: `dado_livre` (`paciente_dado_livre`), `aluno_responsavel`, `perfil_profissional` e `perfil_mensagens` (o `profiles` de quem
  chama: `id` = o user do token, as colunas do form), `whatsapp_resumo`, `whatsapp_fila`, `mensagens_desligadas` (a casca: o número da
  Mensagens e a faixa) e `lixeira` (`lixeira_da_conta`, no lote só dela). As 7 RPCs de leitura saíram do `RPC_SO_LEITURA` e as 18 que gravam
  do `RPC_QUE_GRAVAM` (`src/integrations/repeticao.ts`: sobram só os 5 links públicos — o desvio 21); o `ler` repete 1 vez, as ações não.
- **A `nutricao` e a `financeiro` no motor comum (H-112) e o JWKS nas leituras (H-109):** os módulos `functions/{nutricao,financeiro}/
  leituras.ts` viram o motor comum (`_shared/leitura-servidor.ts`) com os catálogos exportados (`CATALOGO_NUTRICAO`, `CATALOGO_FINANCEIRO`)
  — a mesma resposta, os mesmos pedidos ao banco e o mesmo log (a diferencial com o oráculo congelado do `c6e795b`); a opção
  `jwtLeitura: "jwks"` só no `ler`. Os ★ dos Modelos: 9 consultas `modelos_favoritos_<tipo>` na `nutricao` e a `fin_modelos_recibo_favoritos`
  na `financeiro` (a ★, o dono = quem chama, as vivas, até 500 — o select da lib); tirar a ★ = a ação `*_editar` da tela dona (o mesmo UPDATE;
  0 linha = `nao_encontrado`).
- **A Guarda dos E2E (decisão 23):** a `whatsapp-conectar` = gravação (o `status` cria a instância na 1ª visita e renova o pedido no
  `aguardando_qr`; o `conectar`/`desconectar` gravam; o `teste` manda mensagem) — em `FUNCOES_QUE_SEMPRE_GRAVAM` (`e2e/hml17/_base.py`) e na
  `ESCRITA_FUNCAO` (`e2e/w26/prod.py`); a `guarda_da_w()` da hml-21 deixa passar as 7 RPCs de leitura (o front antigo as chama até a release).
- **Ficam como estão:** o login e a sessão; a `whatsapp-conectar` (a função da conexão); os links públicos (desvio 21); a foto pelas ações
  da 21a; as leituras do Treino que o gate da 21d deixou no navegador (a aba Treinos dos Modelos lê o Treino direto). A `BASE` da
  `semBancoNoNavegador.test.ts` ficou SÓ com as 6 leituras do Treino; o `RPCS_DE_OUTRA_W_NO_PAINEL` vazio.

## A etapa 4: o que fica com o `authenticated`/`anon` e o que sai (hml-21e, H-43 · o fim da etapa 3 do jeito 2)
A etapa 3 terminou com a guarda `src/integrations/semBancoNoNavegador.test.ts` sem `BASE` — só o `FICA`: fora do login, o navegador só fala
com o banco no que está no (1). Nenhum grant, policy ou EXECUTE mudou na hml-21 (decisão 12 da spec: os APKs antigos ainda leem e gravam
direto — o desvio 2); esta é a lista que a etapa 4 usa para revogar (spec hml-21 §2.11 item 7).

**(1) O que FICA, com o porquê** (o `FICA` da guarda e os desvios do `docs/desvios.md`):
- **Treino — as 15 tabelas da fila do PowerSync** (desvio 3): `tb_treino_series`, `tb_treino_concluido`, `tb_treino_dia_override`,
  `treino_historico`, `tb_academia_pesos`, `tb_academias`, `tb_series_padrao_usuario`, `exercicio_ordem_usuario`,
  `exercicio_substituicao_usuario`, `tb_exercicio_comentarios`, `tb_exercicios_usuario`, `tb_grupos_treino_usuario`,
  `tb_grupos_exercicios_usuario`, `tb_semana_treinos` e `physiq_profiles` (a fila só grava o `foto_url`): o S/I/U/D do `authenticated` +
  a policy de dono (`auth.uid() = user_id`; `id` na `physiq_profiles`) — o treino feito sem internet sobe pela fila, como a pessoa. O RLS
  das 15 provado: o catálogo (RLS ligado sem FORCE, 0 SELECT do `anon`), um uuid falso vê 0 linha na produção (só leitura), a matriz de
  leitura por perfil (spec §2.8) e, por efeito no staging, o D3 (`e2e/hml21/d3_powersync.py`, 14/10/2026: 383/383 — as 14 tabelas × (a) ler, (b) PATCH/DELETE, (c) PUT com o `user_id` da outra e (c′) PUT com o id da linha da outra, nas 2 direções, e a `physiq_profiles` × (a)(b)(d); 0 alerta).
- **Treino — a parte do Treino da Evolução do aluno** (desvio 23): o SELECT de `physiq_profiles`, `physiq_avaliacoes` e
  `physiq_registros_fotos` e a URL assinada do bucket `registros` (`src/evolucao/fontes.ts`).
- **Treino (e 1 RPC do principal) — as leituras do Treino que o gate da 21d deixou no navegador** (desvio 24): o SELECT de
  `tb_grupos_treino`, `tb_grupos_exercicios`, `tb_pastas_treino`, `tb_pastas_treino_grupos`, `grupos_musculares`, `tb_exercicios` e
  `physiq_treinos_prontos` (com as divisões e os exercícios embutidos: `physiq_treinos_prontos_grupos` e `physiq_treinos_prontos_exercicios`);
  o EXECUTE das RPCs `modelos_da_lista` e `exercicios_da_lista` (Treino) e da `aluno_treino` (principal).
- **Principal — o `anon` dos links públicos** (desvio 21): o EXECUTE das 5 RPCs (`diario_link`, `diario_listar`, `diario_enviar`,
  `preconsulta_formulario`, `preconsulta_responder`) e o upload/remove no bucket `diario` pelo link — fica até a etapa 4 (o item 3).
- **Os 2 — o login e a sessão** (a exceção do jeito 2): o Auth (`auth.*`), sem grant de tabela; e **o PUT no link de upload que o servidor
  assinou** (`uploadToSignedUrl`) e **o `getPublicUrl`** (só monta a URL) — sem grant de tabela.
- **E o que as funções do jeito 2 usam:** a `conta`, a `nutricao`, a `financeiro`, a `treinos` e as da W-A leem e gravam COMO A PESSOA (a
  chave anon + o token de quem chama — `supabase-principal/functions/_shared/porta-pessoa.ts:124-128`,
  `supabase/functions/_shared/porta-treino.ts:142`): chegam ao PostgREST como `authenticated` e precisam do grant e da policy de hoje
  (spec §2.10 (1)). É a condição do item 2 abaixo.

**(2) O que a etapa 4 revoga = tudo o que não está no (1).** A regra: um grant de tabela ou um EXECUTE do `authenticated`/`anon` que nenhum
item do (1) usa sai, nos 2 projetos e nos 2 schemas. Hoje, no STAGING (SQL só leitura por `has_table_privilege`/`has_function_privilege` —
o `information_schema` dá 0 no modo só leitura —, 14/10/2026 05:25; as mesmas contagens que o redator do contrato da hml-21e leu às 04:3x):

| Projeto | `authenticated`: tabelas (com escrita) | `authenticated`: funções fora gatilhos | `anon`: tabelas | `anon`: funções fora gatilhos |
|---|---|---|---|---|
| principal | 86 de 102 (73) | 228 de 347 | 0 | 27 (12 definer — entre elas as 5 dos links) |
| Treino | 42 de 45 (40) | 14 de 28 | 2: `tb_exercicios` e `grupos_musculares` (o catálogo global) | 5, todas invoker: `manter_ativo`, `physiq_is_master`, `physiq_is_staff`, `physiq_papel`, `physiq_recebimentos_ativar` |

A lista (só leitura; rode em cada projeto e confira contra o (1) — troque `'staging'` por `'public'` para a produção):

```sql
select 'tabela' as tipo, c.relname::text as nome,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_le,
       (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE')) as authenticated_grava,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_le, null::boolean as definer
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'staging' and c.relkind in ('r', 'p', 'v')
union all
select 'funcao', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       has_function_privilege('authenticated', p.oid, 'EXECUTE'), null, has_function_privilege('anon', p.oid, 'EXECUTE'), p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'staging' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
 order by 1, 2;
```

**(3) A etapa 4 (spec hml-21 §2.11 — registrado, não é da hml-21):**
1. **Versão mínima de app** (APK/AAB): o servidor recusa as versões que ainda leem direto (o `pos-login` já devolve a situação; um campo
   `versao_minima` + a tela "atualize") e uma data para os APKs antigos (desvio 2).
2. **Revogar do `authenticated`** os grants de tabela e o `execute` das RPCs que só as funções chamam, nos 2 projetos e nos 2 schemas (a lista
   sai da guarda: tudo o que não está no `FICA`), e **as policies de escrita do REST** (o H-101 fecha aqui: a de criar categoria).
   **Condição:** as funções do jeito 2 vão ao PostgREST como `authenticated` (a porta cria o cliente com a chave anon + o token da pessoa —
   `porta-pessoa.ts:124-128`, `porta-treino.ts:142`); revogar antes quebraria a `conta`, a `nutricao`, a `financeiro` e a `treinos`. Revogar
   só depois de as funções deixarem de ir ao PostgREST como `authenticated` — a forma é decisão da etapa 4.
3. **Os links públicos** (desvio 21): uma função pública (`verify_jwt` false, Turnstile e limite por IP na função, como a `alunos` do `/c/`)
   e o `limite_publico` confiando no IP que ela manda (assinado); revogar o `execute` do `anon`.
4. **O PowerSync continua** (desvio 3): as 15 tabelas da fila mantêm o grant + a policy do `authenticated`; o resto do Treino sai do REST.
5. **O desvio 23 resolvido** (ou mantido com grant só nas 3 tabelas) — e o 24 do mesmo jeito (as leituras do Treino de volta à `treinos`, ou
   o grant só nas tabelas e RPCs dele).
6. **`httpOnly`** só se o login for para o servidor (hoje o supabase-js guarda a sessão no `localStorage`); sem isso, o passo 4 é "sem
   `rest`", não o cookie.
7. **A guarda da 21e vira a lista do que revogar**; o `anonimo.py`/`matriz.py` da skill de homologação provam o fechamento.

## Treino: a prescrição do editor gravada na chave, pelas RPCs (hml-24, H-127)
- **O que muda:** o editor do treino do aluno (Painel › Alunos › Treino: os campos SÉRIES/REPS/DESCANSO/CARGA, a folha "Editar" e a
  observação) grava pela função `admin-semana-treinos` como antes (a porta `requireAdmin` + a regra `pode_ver_aluno_treino_por`, com a
  chave de serviço — desvio 22), mas as ações `setPrescricao` e `setObservacao` gravam numa chamada só, na chave da linha de
  `tb_series_padrao_usuario`, em vez de "ler e depois atualizar ou inserir" (2 gravações da mesma linha nova ao mesmo tempo inseriam as 2 e
  a 2ª batia no índice único `tb_series_padrao_<schema>_alvo_uidx` → 500, sem log). As respostas e os códigos de erro são os de antes.
- **2 RPCs novas** (migration `20261015100000_hml24_prescricao_atomica` do Treino, aplicada com `set physiq.schemas = 'staging'` e
  `'public'` ANTES de publicar a função — ela é UMA para os 2 schemas; reversa em `supabase/reversas/`, só depois de a função voltar):
  `SECURITY INVOKER`, `VOLATILE`, `search_path = ''`, o 1º jeito da tabela "Funções" (`revoke all … from public, anon, authenticated` +
  `grant execute … to service_role`) — só o servidor executa; o `anon` e o `authenticated` recebem 42501 no `EXECUTE`. INVOKER de propósito:
  com a `service_role` da função, o RLS fica de fora como hoje; se um dia a função chamar COMO A PESSOA, o RLS da tabela decide sozinho (o
  personal não grava a linha do aluno — "Usuario gerencia suas series padrao" e "admin_all_series_padrao") e a RPC não precisa mudar.
  - `prescricao_salvar(p_aluno, p_grupo, p_grupo_usuario, p_exercicio, p_exercicio_usuario, p_num_series, p_reps, p_descanso, p_carga) →
    jsonb`: `INSERT … ON CONFLICT` nas 5 expressões do índice (o `coalesce` de cada id — o `.upsert` do PostgREST não serve: o índice é de
    expressão e não é constraint, 42P10); existe → troca os 4 campos e o `updated_at` (o id e a observação ficam). Devolve as chaves do
    `prescricao` que a função já respondia.
  - `observacao_salvar(p_aluno, p_grupo, p_grupo_usuario, p_observacao) → jsonb`: a linha geral do treino (os 2 exercícios nulos); com texto,
    a linha nova nasce com o `series_padrao_qtd` do aluno (1 a 10; fora disso ou sem perfil, 3) e a que existe só troca o texto; sem texto,
    só limpa a que existe.
  - A forma da CHAVE (o aluno; exatamente 1 treino; na prescrição, exatamente 1 exercício) ou `dados_invalidos` (22023) antes de tocar na
    tabela; o resto a função já validou e a tabela confere (séries 1–10 → 23514; as FKs → 23503).
- **A conferência da migration** para tudo se: as 2 não forem INVOKER/VOLATILE/`search_path` vazio; alguém além da `service_role`
  executar; a falta do aluno não recusar; ou o `EXPLAIN` (sem ANALYZE — nada executa) do mesmo `ON CONFLICT` não tiver como árbitro SÓ o
  `tb_series_padrao_<schema>_alvo_uidx` (o índice renomeado, com outra expressão, sumido ou duplicado). O `e2e/hml01/banco.py` confere o
  mesmo, só leitura, nos 2 schemas.
- **Nenhuma tabela, índice, policy, gatilho ou grant de tabela muda.** O app do aluno (PowerSync, pelo `id`) segue igual: o envio dele que
  bate na linha criada pelo personal ainda dá 23505 e é descartado, como antes.
- **O log:** o catch final da `admin-semana-treinos` passa a chamar o `log.excecao` (o name, o código do Postgres e a mensagem limpa —
  nunca o `details`, onde vai o valor da chave) com a ação em `snake_case` (`acaoDoLog`) e a MESMA resposta 500; os 2 `console.error`
  viraram `log.aviso` só com o código. A função entrou nas PUBLICADAS da guarda do log (`src/lib/logsDasFuncoesTreino.test.ts`).
- **Ficam como estavam** (o mesmo "lê e depois insere", hoje sem chamada do front ou com pouca concorrência; o log novo do catch mostra se
  derem 500): `setSeriesPadrao`, `aplicarSeriesTreino` e `aplicarPrescricaoDoModelo`.
- Prova: um Postgres local com o DDL e as policies do catálogo do Treino (a corrida N = 2, 5 e 8 × 50 rodadas → 0 erro e 1 linha; o
  caminho de antes → 23505 em toda rodada), `e2e/hml24/corrida.py` (o staging: `--antes` × o verde) e o `e2e/hml01/banco.py`.
