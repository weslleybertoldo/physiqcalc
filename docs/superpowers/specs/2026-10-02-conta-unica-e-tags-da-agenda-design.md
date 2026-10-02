# Physiq — conta única do Weslley + tags e calendários da agenda — desenho aprovado (02/10/2026)

> Fonte da verdade das 2 worktrees do plano mestre `Physiq - juntar as 2 contas do Weslley e tags da agenda (plano mestre W1-W2) - 2026-10-02.md` (mesma pasta). Repo: `~/projetos/physiqcalc` (main `9aabf9e`, v3.41). Banco principal `hkxvtsbwctxkrqzkkdoz` (schemas `public` = prod e `staging`), Banco do Treino `uxwpwdbbnlticxgtzcsb`.

## 1. Pedido (literal)

- 02/10/2026 ~14h: *"Eu vi agora que o acesso do personal e nutricionista são separados mesmo sendo o mesmo profissional os dois. Preciso entender o que tem disponível para o personal que não tem no nutricionista e vise e versa. Ex: agenda é a mesma dos dois, correto? Ou são agendas diferentes?"*
- Depois da resposta (o login dele tem 2 contas, a agenda é a mesma nas duas): *"Sim, ex: quando o time for somente 1 pessoa tudo fica em um acesso e depende do plano, plano só treino? Aparece só treino. Plano só alimentação? Aparece só alimentação. Plano, treino e alimentação com 1 profissional? Aparece os dois em uma aba. Plano com 2 profissionais (nutrição e personal?) abas separadas como é hoje. 2 profissionais da mesma área? Aparecem os dois na mesma aba. 2 profissionais de área diferente (personal e nutricionista) abas separadas. E calendário separado, mas com opção de manter só 1 e opção de visualizar os dois no mesmo calendário, ex: igual o calendário do Google. Aparece o calendário e na lateral um checkbox que quando seleciona ele mostra os dois calendário em um só. Mas com opção de excluir calendário e aí fica sem, criar calendário (com 2 ou mais calendário colocar a opção de visualizar os slots dos outros calendários. Ex: eu tenho 2 calendários, um para personal e um para nutricionista. Estou com onde personal aberto, Clico no checkbox do calendário de nutri e aparece no meu calendário de personal também os agendamentos feitos no de nutricionista, aí eu consigo ver quando tem conflitos etc. Ou poderei manter somente 1 calendário onde eu marco as consultas e acompanhamentos de personal e terá uma tag e cor (onde eu posso criar novas tag e colocar cores, ex: 3 tags acompanhamento e reunião e consulta) acho que hoje já é assim, correto? Deu pra entender?"*

## 2. Decisões dele (02/10/2026 — não reperguntar)

| # | Pergunta | Resposta dele | Vale |
|---|---|---|---|
| D1 | Equipe com 1 personal + 1 nutri: cada um vê só a sua área, ou as duas e edita só a sua? | "2" | Fica **como hoje**: os dois veem as duas áreas da conta; cada um só edita a sua |
| D2 | Ficar sem calendário | *"pode manter essa regra : se excluir o último a agenda cria outro sozinha"* | Fica como hoje (`garantirCalendarios`) |
| D3 | Tags: o "Tipo" vira tag editável, ou tag separada do tipo? | "1" | O **Tipo vira Tag**: Treino, Nutrição e Geral prontas + as dele, com nome, cor e área |
| D4 | O aluno vê a tag no app? | "1" | **Não**: só os profissionais; app, e-mail e avisos do aluno como hoje |
| D5 | Parte 1 do desenho (conta única) | "1" | Aprovada (§4) |
| D6 | Parte 2 do desenho (agenda) | "1" | Aprovada (§5) |
| D7 | Esteira | "1" | **Ciclo autônomo até produção**, prints a cada W, só para se travar |

## 3. O que JÁ existe (conferido no código da main e no banco de prod, 02/10)

- ✅ Conta nova segue o plano: só Treino, só Nutrição ou os dois num acesso só (`src/painel/menu.ts` `estadoDoItem`, abas do aluno `src/painel/aluno/catalogoAbas.ts`); o rótulo "Personal e nutricionista" existe (`src/nucleo/situacao.ts` `rotuloDoPapel`).
- ✅ Equipe: o menu segue os módulos da CONTA; editar segue o PAPEL (Dietas `podeEscreverNutricao`, prontuário clínico `acessoDoProntuario`, pré-consulta `souNutri`, treino `podeEditarTreino`).
- ✅ Agenda: vários calendários por profissional (criar, nome, cor, faixa, slot, excluir — `CalendarioDialog.tsx`); caixa de marcar por calendário que sobrepõe os calendários na mesma visão (`PainelAgenda.tsx` `LinhaCalendario`); o dono vê os calendários da equipe; cada consulta tem o ponto com a cor do calendário (`ChipEvento.tsx`); horário ocupado num calendário fica ocupado nos outros do mesmo profissional (`agenda_slots` ignora o calendário nos agendamentos) — o profissional recebe aviso de conflito e o aluno não consegue marcar; as regras (slot, horário de atendimento) são da PESSOA (`agenda_config` por `profissional_id`); a lista da agenda é "o que é meu + o que é da conta ativa" (`dados.ts` `minhaOuDaConta`).
- ❌ Tags com nome/cor dele: o tipo é fixo (`TIPOS` em `src/agenda/regras.ts`: treino · nutricao · geral; chip T/N).
- ❌ 2 calendários para quem é personal e nutri (hoje nasce 1 "Calendário principal").
- ❌ A conta dele está dividida (migração P8): `cb3ae70c-a705-4bd8-96a8-6e7e5153e110` (`legado_calc`, plano treino, papéis dono+personal, isenta "master", faixa livre, 11 alunos ativos) e `079d1357-35a6-45be-959c-fed9451c7d12` (`legado_nutri`, plano nutricao, papéis dono+nutricionista, isenta "master", faixa livre, 1 aluno ativo + 2 inativos). É o ÚNICO profissional com 2 contas (conferido: `conta_membros` ativo agrupado por usuário).

## 4. W1 — Conta única do Weslley (dados; sem tela nova)

**Resultado:** 1 conta "Weslley Bertoldo" = a `cb3ae70c…` com plano `treino_nutricao`, isenta (motivo "master"), faixa livre (sem limite de alunos — conferir `conta_limite_alunos` = null); o bertoldo.code (`1ddcadb8-c727-4783-84da-0ddab580532b`, master) membro ativo com papéis `{dono, personal, nutricionista}`. No painel: Treinos + Dietas + Impressos num acesso só; perfil do aluno com Treino e Dieta.

**Caminho escolhido (aprovado):** a conta Treino fica e a Nutrição entra nela — o lado do Treino (offline/PowerSync, 11 alunos) não é mexido. Rejeitados: a Treino entrar na Nutrição (mexe nos 11 alunos do Treino) e conta nova (mexe nos 2 lados).

**O que move (inventário de 02/10; o script refaz o inventário pelas FKs, não pelo nome da coluna):**
- Linhas com `conta_id` = Nutri: `pacientes` 3 (1 ativo + 2 inativos antigos), `agendamentos` 1, `formularios_preconsulta` 1, `respostas_preconsulta` 1, `conta_membros` 1, `conta_eventos` 3 (ficam na conta cancelada como histórico).
- O aluno dele `weslleybertoldo18` (login próprio) tem 2 matrículas ativas (caso P7 da migração): `30afc8f6-3af7-4660-9e52-85873ecf8cbc` (Calc, personal) e `cc9277e8-5607-403c-b186-d1a3bb620119` (Nutri, nutricionista). **Fica a `30afc8f6`** (a do Treino) com `nutricionista_id` = bertoldo.code; tudo que aponta para a `cc9277e8` passa para a `30afc8f6`: `planos_alimentares` 2, `diario_alimentar` 1, `refeicoes_concluidas` 1, `agendamentos` 1 (+ o que o inventário pelas FKs achar — p.ex. prontuário, metas, avaliações, anexos, acesso/ajustes); conflito de linha única por matrícula (ajuste, acesso, assinatura) → ficar com a da `30afc8f6` e registrar a outra no relatório. A `cc9277e8` termina inativa (encerrada, sem login), como histórico — nunca apagada de vez.
- Os 2 pacientes inativos antigos da Nutri vão para a conta Calc (conta_id) sem mudar nada mais.
- A conta Nutri: membro → `removido`; conta → `situacao = 'cancelada'` com o motivo "juntada na conta cb3ae70c… em 02/10/2026" (em `isenta_motivo` ou num `conta_eventos` — o que a tabela aceitar); nada mais muda nela. O master continua vendo (lista de contas).
- `espelho_disparar()` no fim (leva conta/plano/professor ao Banco do Treino) e conferir no Treino que a conta e as matrículas espelhadas estão certas.

**Como (padrão das W16b/W28):** script idempotente `scripts/conta_unica/juntar_contas.py` com `--schema staging|public`, `--dry-run` (só inventário + o que faria) e `--aplicar`; backup JSON de TODAS as tabelas tocadas em `~/backups/physiq/2026-10-02-w1-conta-unica/` (`scripts/backup/backup_principal.py`) + backup das linhas do Treino que o espelho mexe; contagem antes/depois (nenhuma linha some: o que sai de um lado aparece no outro); script reverso `--desfazer` a partir do backup. Tudo numa transação no banco (uma `query` só, `begin … commit`), com as travas de e-mail/CPF respeitadas (mudar `conta_id` não dispara a trava; nada de e-mail novo).

**Ensaio no staging:** montar no schema `staging` o mesmo caso com contas de teste (`*.teste.claude@physiqnutri.app`): 1 profissional dono de uma conta `legado_calc` treino e de uma `legado_nutri` nutricao, 1 aluno com login nas 2 contas (com plano alimentar, diário, refeição marcada, consulta) e 1 paciente inativo; rodar dry-run → aplicar → conferir → `--desfazer` → aplicar de novo.

**Pronto quando (prod):** `minha_situacao()` do bertoldo.code = 1 conta, módulos `[treino, nutricao]`, papéis `[dono, personal, nutricionista]`; `minha_situacao()` do weslleybertoldo18 = 1 matrícula ativa com `[treino, nutricao]` e `minha_dieta()` devolve o plano dele; o treino dele intacto no Treino (mesma contagem de séries/histórico antes e depois); painel (prints): menu com Treinos, Dietas e Impressos, Alunos com os 11 + inativos, perfil do weslleybertoldo18 com as abas Treino e Dieta preenchidas, Agenda com o calendário e as consultas; master › Alunos "Em 2 contas" sem ele; contagens batem. Sem release de app (PR só de script/doc, `[skip actions]`).

**Prova viva dele (não é pendência):** entrar com a bertoldo.code e ver tudo num acesso; abrir o app como aluno (weslleybertoldo18) e ver Treino e Dieta.

## 5. W2 — Tags e calendários da agenda (tela + banco; release nova)

**Banco (principal, `staging` e `public`, migração idempotente `supabase-principal/migrations/20261002xxxxxx_agenda_tags.sql`):**
- `agenda_tags`: `id uuid pk`, `profissional_id uuid not null → auth.users`, `nome text` (1–40, sem repetir por profissional entre as vivas, sem diferenciar maiúscula), `cor text` (uma de `CORES_CALENDARIO`), `area text check (treino|nutricao|geral)`, `base boolean default false` (as 3 prontas), `ordem smallint`, `created_at`, `deleted_at`. RLS: o próprio profissional faz tudo; o dono de conta onde o profissional é membro ativo LÊ (igual `agenda_config: ler`); o master tudo; aluno nada.
- As 3 base por profissional (Treino violeta, Nutrição verde, Geral cinza — as cores do chip de hoje): criadas sob demanda por uma RPC `agenda_garantir_tags()` (idempotente) e pelo backfill. Base: renomear e mudar a cor pode; excluir e mudar a área não (o banco recusa).
- `agendamentos.tag_id uuid null → agenda_tags on delete set null`. O `modulo` CONTINUA e passa a ser a área da tag (gatilho: gravou `tag_id` → `modulo := tag.area`; sem tag → a base da área do `modulo`). Toda regra de hoje que lê `modulo` (ícone no app do aluno, pacote, e-mails, avisos, "Consultas por semana", `.ics`) não muda.
- Excluir tag do profissional (soft delete): as consultas dela passam para a base da MESMA área (no banco, na mesma transação).
- `calendarios.tag_padrao_id uuid null → agenda_tags on delete set null`.
- Backfill: para cada profissional com agendamento/calendário, criar as 3 base e preencher `tag_id` pela área do `modulo` (treino → Treino, nutricao → Nutrição, geral → Geral).
- O aluno não lê `agenda_tags`; `aluno_compromissos` e as funções de aviso/e-mail não devolvem a tag (conferir que nenhuma usa `select *` que vaze o nome).

**Painel (`src/painel/agenda/*`, `src/agenda/regras.ts`):**
- `PainelAgenda`: bloco novo **"Tags"** (lista com a cor, o nome e a área; "Nova"; editar; excluir com confirmação que diz para qual tag as consultas vão; as base sem excluir). O bloco serve de legenda das tags.
- `TagDialog` novo: nome, cor (paleta `CORES_CALENDARIO`), área (Treino · Nutrição · Geral; fixa nas base).
- `AgendamentoDialog`: o campo "Tipo" vira **"Tag"** (chips com as tags do DONO do calendário + "Nova tag"); a escolhida por padrão = `tag_padrao_id` do calendário; sem ela, a base da área que o `tipoPadrao` de hoje escolhe. Títulos sugeridos seguem a área.
- `ChipEvento`: o T/N vira a pílula da tag (nome; na visão mês só a inicial) na cor da tag; o fundo (status), a borda (confirmação) e o ponto (calendário) ficam.
- `VisaoLista`: mostra a tag. `.ics`: `CATEGORIES:<nome da tag>`.
- `CalendarioDialog`: campo **"Tag padrão"**.
- `garantirCalendarios`: profissional SEM calendário que é personal E nutri na conta ativa → nascem 2: "Treino" (violeta, tag padrão Treino, padrão) e "Nutrição" (verde, tag padrão Nutrição); senão 1 "Calendário principal" com a tag padrão da área do papel (como hoje). Excluir o último continua recriando (D2).
- Dono vendo a equipe: as tags de cada membro aparecem nos calendários dele (leitura).

**Ajuste só dele (na mesma W, depois do backfill, em prod):** o "Calendário principal" dele vira **Treino** (tag padrão Treino), nasce o **Nutrição** (tag padrão Nutrição) e as consultas de área nutrição dele vão para o Nutrição.

**Fora (YAGNI, combinado):** filtro por tag; tag visível ao aluno (D4); tags da conta compartilhadas pela equipe (cada profissional tem as suas); pintar o fundo da consulta pela tag.

**Testes:** vitest das regras puras (tag padrão por calendário/papel, área da tag → `modulo`, fallback ao excluir); E2E Playwright no local e no staging: criar tag "Reunião" (Geral), marcar consulta no calendário Nutrição (tag padrão vem marcada), chip com a tag, editar a cor, excluir a tag (a consulta volta para "Geral"), conta personal+nutri nova nasce com 2 calendários, conta só personal nasce com 1; negativos: aluno não lê `agenda_tags` (REST 0 linhas), outro profissional não lê as tags dele, base não exclui; app do aluno igual (print da Agenda do aluno sem tag).

**Pronto quando:** tudo acima verde, prints local/staging/prod conferidos, release nova (versão + APK pelo CI), smoke só leitura em prod na conta dele.

**Prova viva dele:** criar uma tag e marcar uma consulta no calendário Nutrição.

## 6. Riscos e cuidados
- Dados reais: 12 alunos dele e as 2 nutris em teste até 04/10 (elas só ganham as tags e o backfill). Backup antes de toda escrita em prod; script reverso pronto.
- Banco do Treino (VM Nano) trava com E2E pesado: E2E em série, `/health` antes de cada bloco; UNHEALTHY → parar e reportar (restart só com OK dele).
- Contexto/sessão: o master do Physiq é o bertoldo.code — treino/exercício que ele cria vale para todos (W23); não criar nada de teste na conta dele em prod.
- Nada de mensagem/e-mail a aluno real nos testes.
