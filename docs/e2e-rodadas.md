# Rodadas de E2E (Physiq)

Homologação, achado H-50 (hml-13, 08/10/2026). Toda rodada de E2E que serve de prova entra aqui: 1 linha por script por base,
a mais nova em cima. Sem dado pessoal e sem segredo (só o nome do script, a base e o placar).

- **De onde vem a linha:** o `Placar.fim()` (`e2e/w02/_comum.py`) grava cada rodada sozinho em
  `~/projetos/physiqcalc-scratch/e2e-rodadas.tsv` (fora do repo; troca com `PHYSIQ_E2E_REGISTRO`). No fim de cada worktree, as
  linhas dela vão para esta tabela no PR da própria worktree; as de produção (que rodam depois do merge) entram no PR seguinte.
- **Base:** `local` (build ou dev na máquina), `staging` (schema `staging` + `physiqcalc-staging.vercel.app`), `produção`
  (schema `public` + `physiqcalc.com.br`). Atenção: o staging mora nos MESMOS 2 projetos do Supabase da produção (Auth e Storage
  únicos): todo login grava sessão de verdade.
- **Resultado:** o placar que o script imprime (`N/M`). Falhou = o placar + o motivo curto em "obs.".

## Rotina do fim de cada worktree (staging, antes do merge)

1. **Sempre** (só leitura, ~3 min): `python3 e2e/w07/api.py api` · `python3 e2e/w10/api.py` · `python3 e2e/w25/api.py`. Mexeu em
   migration: `python3 e2e/hml01/banco.py --schema staging` (e `--schema public` depois de aplicar em produção).
2. **Da família que a worktree tocou** (criam massa no staging e limpam): `h5` (cadastro/agenda) · `w11` (diário/dieta) · `w15`
   (treinos do admin) · `w16` (nutri/membros) · `w18` (clínicos/anexos) · `w20` (agenda) · `w21` (pré-consulta) · `w23` (modelos) ·
   `w24` (diário/dietas) · `w26` (lixeira). Rodar o `api.py` da família e o `telas.py` correspondente.
3. **Fora da rotina** (só com a massa do dono da worktree, e sabendo o que fazem): os que criam massa e NÃO limpam — `h4`, `w06`,
   `w07b`, `w13`, `w27`, `w28` (os 3 do Mercado Pago usam o sandbox).
4. **Nunca na rotina** (escrevem em produção): `--schema public` do `w08b`, `w20c` e `w14`; `*/prova_real.py`; `w07b/smoke_prod.py`;
   `h3/emails.py --prod`; `w04/espelho_fila.py --schema public --processar`; os `*/prod.py` que criam dado (lista no parecer, H-68).

## Rodadas

| data (BRT) | worktree | commit | script (argumentos) | base | resultado | obs. |
|---|---|---|---|---|---|---|
| 08/10 ~19:10 | hml-12 | `c0fc1b0` | `e2e/hml12/telas.py --base prod --canal msedge` | produção | 10/10 | + guarda no JS real (19 marcas) |
| 08/10 ~19:08 | hml-12 | `c0fc1b0` | `e2e/hml12/banco.py --schema public` | produção | 10/10 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/hml12/telas.py --base staging --canal msedge` | staging | 113/113 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/w07b/api.py entrar` | staging | 12/12 | |
| 08/10 ~18:00 | hml-12 | `35d0048` | `e2e/w21/telas.py --casos nutri,inativo,dono,membro` | staging | 48/48 | |
| 08/10 17:11 | hml-12 | — | `e2e/hml12/banco.py --schema staging` | staging | 60/60 | |
| 08/10 ~17:30 | hml-12 | `35d0048` | `e2e/hml12/telas.py` (build de staging, `vite preview`) | local | 113/113 | build public 10/10 |
| 08/10 15:18 | hml-11 | `8dc0287` | `e2e/hml11/telas.py --base https://physiqcalc.com.br --modo producao --canal msedge --casos S1,S2,S4,S5` | produção | 16/16 | + `JS` (384 arquivos) |
| 08/10 ~15:20 | hml-11 | `8dc0287` | `e2e/w26/prod.py` | produção | caiu no meio | ESCREVE em produção (H-68); o `finally` limpou |
| 08/10 ~15:00 | hml-11 | `aa11d26` | `e2e/hml11/telas.py --base staging --canal msedge` | staging | 106/106 | |
| 08/10 ~15:00 | hml-11 | `aa11d26` | `e2e/w26/telas.py --casos publicas` | staging | 9/9 | |
| 08/10 ~14:30 | hml-11 | `aa11d26` | `e2e/hml11/telas.py` (`--canal msedge`) | local | 106/106 | build public `--casos S1,S2,S4,S5` 17/17 |
| 08/10 ~12:40 | hml-10 | `5ee7770` | `e2e/hml10/telas.py --base prod --p6` | produção | 23/23 | 1 aviso real |
| 08/10 ~12:00 | hml-10 | — | `e2e/hml10/telas.py --base staging` | staging | 61/61 | 1ª rodada caiu o navegador |
| 08/10 ~11:00 | hml-10 | — | `e2e/hml10/telas.py` | local | 81/81 | |
| 08/10 ~08:55 | hml-09 | `538897e` | `e2e/hml09/banco.py --producao` | produção | 21/21 | |
| 08/10 ~08:40 | hml-09 | — | `e2e/hml09/telas.py` | staging | 9/9 | local 9/9 |
| 08/10 ~08:30 | hml-09 | — | `e2e/hml09/guarda.py simular --esperado antes` | staging | 16/16 | |
| 08/10 08:29 | hml-09 | — | `e2e/hml09/banco.py` | staging | 20/20 | |
| 08/10 ~07:00 | hml-08 | — | `e2e/hml08/telas.py` | staging | 36/36 | local: site 12/12, app 24/24 |
| 08/10 ~04:30 | hml-06 | — | `e2e/w04/cobranca_api.py` | staging | 43/45 | 2 falhas = cartão do sandbox do MP fora |
| 08/10 ~02:10 | hml-05b | `2f820d8` | `e2e/hml05b/telas.py --prefixo staging` | staging | 21/21 | h5 telas `cadastro` 5/5; w16b telas `cadastro_link` 4/4; w16b `trava_sql` 31/32 |
| 08/10 ~01:10 | hml-05c | — | `e2e/w24/api.py` | staging | 47/47 | w24 telas `/d/` 13/13; w21 api 42/42 |
| 08/10 ~01:10 | hml-05c | — | `e2e/hml05c/limite_ip.py --so ip` | staging | 5/5 | `hml05a/entrada.py --so treino` 6/6 |
| 08/10 00:08 | hml-05a | — | `e2e/hml05a/entrada.py --so cadastro` | produção | 2/2 | antes 0/2 |
| 08/10 00:06 | hml-05a | — | `e2e/hml05a/entrada.py --so cadastro` | staging | 3/3 | |
| 07/10 ~21:50 | hml-02b | `99ca090` | `e2e/w24/api.py` | staging | 47/47 | w18 15/15; w10 22/22 |
| 07/10 ~20:00 | hml-01 | — | `e2e/hml01/banco.py --schema public` | produção | 12/12 | antes 3/12 |
| 07/10 ~19:40 | hml-01 | — | `e2e/hml01/banco.py --schema staging` | staging | 12/12 | `hml01/equipe_staging.py` 6/6 |

Fonte das linhas de 07/10 e 08/10: o plano da homologação (§5, uma entrada por worktree); hora "~" = aproximada; "—" = commit não
anotado no plano.
