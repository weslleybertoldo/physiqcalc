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
