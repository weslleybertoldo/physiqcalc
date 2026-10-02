# Physiq — roteiro da virada (W28)

O passo a passo da spec §11.3 W28, com os comandos e **como voltar atrás em cada passo**. Tudo roda do notebook com os acessos
da base técnica (`~/.pc-pat`, `~/.pgpass` do Treino, `~/.vercel-pessoal-token`, `gh` como `weslleybertoldo`). Pasta de backup e
relatórios: `~/backups/physiq/<data>-w28/` (arquivos 600). Os scripts são idempotentes e têm `--dry-run`.

Regras que valem em todos os passos:
- **Ordem:** ensaio no staging → backup → dry-run em produção → **conferência humana (checkpoint)** → passos 3–6 em produção →
  7–12. Arquivar o repositório do Nutri e remover o projeto da Vercel só depois do redirecionamento provado e do keep-alive verde.
- **Mercado Pago:** nada de cobrar, cancelar ou estornar assinatura de cliente. As assinaturas e os pagamentos continuam os mesmos;
  o núcleo só passa a lê-los e aplicá-los (idempotente por `mp_payment_id`).
- **Ninguém recebe mensagem** por causa da virada; o aviso "o Physiq mudou" é a faixa dentro do app, ligada só no fim.
- **Auth do principal é um só** para staging e produção: foto da config antes (`GET /v1/projects/<ref>/config/auth`, 600),
  `PATCH` só do campo que muda, prova na hora com conta `*.teste.claude@…`, volta na hora se falhar.
- Banco do Treino (VM Nano) trava com carga: nada pesado em paralelo; `/health` antes de cada bloco
  (`~/projetos/physiqcalc-scratch/w28/bin/saude.sh`). UNHEALTHY → para (restart só com OK do Weslley).

## 0. Código que entra ANTES (PR 1 — funciona antes e depois da virada dos dados)
- Migração do principal `supabase-principal/migrations/20261002040000_w28_virada.sql` (coluna `contas.regras_legadas` com padrão
  false + funções: as regras do núcleo olham só `cobranca_legada`; preço/regras de hoje; "sair do legado" ao trocar de plano;
  tolerância 7 do legado Calc no pagamento; limite do legado Nutri; equipe nas legadas; recebimentos da Visão geral;
  `w28_migrar_conta_legada` / `w28_desfazer_conta_legada`).
  ```bash
  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --dry-run
  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --so staging
  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002040000_w28_virada.sql --so public
  ```
  Voltar: reaplicar as definições de `~/backups/physiq/<data>-w28/principal/funcoes-antes.sql` (a coluna nova pode ficar).
- Funções (valem na hora para os 2 schemas; publicar SÓ pelo script, com o `verify_jwt` de hoje):
  ```bash
  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-conta false
  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions cobranca-conta true
  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook false
  scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions mp-webhook false
  ```
  Segredo do Treino `PRINCIPAL_WEBHOOK_CONTA_URL=https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/mp-webhook-conta` (liga o
  repasse dos avisos de professor; quem decide se aplica é a conta: só com `cobranca_legada = false`).
  Voltar: republicar a função da `main` anterior com o mesmo comando; apagar o segredo desliga o repasse do Treino.

## 1. Ensaio completo no staging
```bash
python3 e2e/w28/massa.py                       # os casos de produção em contas w28.*.teste.claude@… (Calc: ciclo, tolerância,
                                               #   vencida, anual, pausada, suspenso, liberado, assinatura; Nutri: teste,
                                               #   pendente, Pix, vencida, cartão)
python3 scripts/virada/01_identidades_contas.py --schema staging
python3 e2e/w28/massa.py --senhas
python3 scripts/virada/03_cobranca_legada.py --schema staging --dry-run
python3 scripts/virada/03_cobranca_legada.py --schema staging --relatorio ~/backups/physiq/<data>-w28/relatorio-03-staging-real.json
# esperar a fila do espelho do staging zerar (tarefa de 10 em 10 min; a Supabase limita chamadas encadeadas):
#   select count(*) from staging.espelho_pendencias where feito_em is null and tentativas < 5;
# passo 5 no staging (Treino):
( echo "set physiq.schemas = 'staging';"; cat supabase/migrations/20261002040100_w28_acesso.sql ) | psql "<conexão do Treino>" -v ON_ERROR_STOP=1
python3 scripts/virada/04_conferencia.py --schema staging --virada ~/backups/physiq/<data>-w28/relatorio-03-staging-real.json
python3 e2e/w28/api.py --ambiente staging      # cobrança das legadas no núcleo, webhooks antigos, equipe, tarefa diária
```
Só segue se o 04 e os E2E baterem. Voltar no staging: `w28_desfazer_conta_legada(<conta>, <conta_antes do relatório>)` por conta
(ou `python3 e2e/w28/massa.py --limpar` para a massa) e a definição antiga da `physiq_professor_acesso_ok` (fim do arquivo da
migração do Treino).

## 2. Backup (antes de qualquer escrita de dado em produção)
```bash
pg_dump "<conexão do Treino>" -Fc -n public -n staging --no-owner --no-privileges -f ~/backups/physiq/<data>-w28/treino/treino-public-staging.dump
python3 ~/projetos/physiqcalc-scratch/w28/bin/backup_w28.py antes    # principal: todas as tabelas (JSON) + contagens dos 2 bancos
                                                                     # + auth.users sem senha + definições antigas + Storage
```
Voltar (restaurar uma tabela do principal): `insert into <schema>.<tabela> select * from json_populate_recordset(null::<schema>.<tabela>, '<json>')`
(o JSON do backup); Treino: `pg_restore --data-only -t <tabela> -n public …`.

## 3. Identidades e contas de quem entrou depois da W3 (produção)
```bash
python3 scripts/virada/01_identidades_contas.py --schema public --dry-run --relatorio ~/backups/physiq/<data>-w28/relatorio-01-public-dry.json
python3 scripts/virada/01_identidades_contas.py --schema public --relatorio ~/backups/physiq/<data>-w28/relatorio-01-public-real.json
```
O 01 nunca liga no chute (conta com senha e sem Google = conflito para o master) e pula a linha de professor que o espelho criou
para o personal de uma conta nova. Voltar: o relatório lista o que foi criado (usuários sem senha e sem e-mail, vínculos, contas,
matrículas) — apagar só o que ele criou.

## 4. Cobrança das legadas para o núcleo (produção) — DEPOIS DO CHECKPOINT
```bash
python3 scripts/virada/03_cobranca_legada.py --schema public --dry-run --relatorio ~/backups/physiq/<data>-w28/relatorio-03-public-dry.json
python3 scripts/virada/03_cobranca_legada.py --schema public --relatorio ~/backups/physiq/<data>-w28/relatorio-03-public-real.json
```
Cada conta: `w28_migrar_conta_legada` (1 transação) — preço de hoje (`valor_travado`), regras de hoje (tolerância 7 no Calc;
Pix de 30 dias e sem limite no Nutri; `regras_legadas = true`), a assinatura do Mercado Pago que já existe e o histórico de
pagamentos; `cobranca_legada = false`. Voltar uma conta:
`select public.w28_desfazer_conta_legada('<conta_id>', '<conta_antes do relatório real (JSON)>'::jsonb);`

## 5. Espelho de acesso no Treino e a nova physiq_professor_acesso_ok (produção)
Esperar a fila do espelho do public zerar (o 03 enfileira cada conta), conferir `nucleo_acesso_ate` dos professores legados e:
```bash
( echo "set physiq.schemas = 'public';"; cat supabase/migrations/20261002040100_w28_acesso.sql ) | psql "<conexão do Treino>" -v ON_ERROR_STOP=1
```
Os webhooks antigos já repassam/aplicam no núcleo (passo 0) — agora que a conta tem `cobranca_legada = false`, passam a valer.
Voltar: a definição anterior está no fim de `supabase/migrations/20261002040100_w28_acesso.sql` (e em `treino/funcoes-antes-treino.sql`).

## 6. Conferência (produção)
```bash
python3 scripts/virada/04_conferencia.py --schema public --virada ~/backups/physiq/<data>-w28/relatorio-03-public-real.json \
  --antes ~/backups/physiq/<data>-w28/contagens-antes.json --salvar ~/backups/physiq/<data>-w28/conferencia-public.json
```
Contagens que não diminuem, e conta a conta: tem acesso antes = depois, último dia de acesso igual, preço travado, faturas e
assinatura migradas, nenhuma legada na cobrança antiga e, no legado Calc, o acesso no Treino. **Não bateu → passo 4 de volta
(desfazer as contas) e para.**

## 7. Telas antigas de pagamento de plano saem (PR 2)
A Planos do Calc (`PlanoLegadoCalc`/`PlanosPage`), a trava antiga (`GatePlanoLegado`), "Cobrança legada até a virada" e as
páginas `/admin/*` e `/master/*` antigas (fica a Biblioteca global). Os legados pagam em Configurações › Plano. Voltar: reverter o
merge do PR 2 (o PR 1 continua de pé).

## 8. Redirecionamento do `nutri.physiqcalc.com.br`
1. Antes: `smoke_nutri_antigo.py` 24/24 em produção (o site antigo ainda no ar) e o Auth com `https://physiqcalc.com.br/**` na
   lista de redirecionamento (já está desde a W2). `nutri.physiqcalc.com.br/**` FICA na lista (links de e-mail antigos até expirar).
2. Salvar a config do projeto `physiqnutri` da Vercel (passo 10) e mover o domínio:
   `DELETE /v9/projects/prj_uVp62IEBq9lI3ozi2mOcl9cKMX7G/domains/nutri.physiqcalc.com.br` e
   `POST /v10/projects/prj_AHdhPOZ1lCd5T65u9WcCTJEnKDIt/domains` `{"name":"nutri.physiqcalc.com.br"}` (time
   `team_Wf85eA4kyeWXD2OMaWmQFGIo`). O DNS (CNAME `cname.vercel-dns.com`, Cloudflare pessoal) não muda.
   O `vercel.json` do physiqcalc já tem as 2 regras por host: 308 para `https://physiqcalc.com.br/<caminho>?origem=nutri`.
3. Prova: `curl -sI https://nutri.physiqcalc.com.br/<rota>` (raiz, `/d/<código>`, `/f/<slug>`, `/c/<código>`, `/p/<código>`,
   rota de painel, rota inexistente) → 308 + `Location` certo; Playwright termina na tela certa e mostra "O PhysiqNutri agora é o Physiq".
4. Auth do principal: `site_url` → `https://physiqcalc.com.br` (PATCH só desse campo). CORS das funções sem as origens do Nutri (PR 2).
Voltar: `DELETE` do domínio no physiqcalc e `POST` de volta no physiqnutri (enquanto o projeto existir); `site_url` de volta.

## 9. Keep-alive do banco principal no physiqcalc
`.github/workflows/keep-alive.yml` ganhou o job `keep-alive-principal` (cron `19 3,9,15,21 * * *`; segredos
`PRINCIPAL_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PAT`). Provar verde ANTES de arquivar:
`gh workflow run keep-alive.yml -R weslleybertoldo/physiqcalc --ref main -f so=principal` (o `so` evita o deploy do PowerSync).
Voltar: o job é só leitura; o do Nutri volta se o repositório for desarquivado.

## 10. Arquivar o repositório do Nutri e remover o projeto da Vercel
Só depois de 1, 2, 6, 8 e 9. Antes: salvar em `~/backups/physiq/<data>-w28/vercel-physiqnutri/` a configuração do projeto, os
domínios e as variáveis (valores em arquivo 600).
```bash
gh api -X PATCH repos/weslleybertoldo/physiqnutri -F archived=true      # voltar: -F archived=false (NUNCA apagar o repositório)
curl -X DELETE "https://api.vercel.com/v9/projects/prj_uVp62IEBq9lI3ozi2mOcl9cKMX7G?teamId=team_Wf85eA4kyeWXD2OMaWmQFGIo" -H "Authorization: Bearer <token>"
```
Voltar a Vercel: recriar o projeto ligado ao repositório (desarquivado) com a config e as variáveis salvas.

## 11. Desligar o que sobrou
- APK do Nutri: o `scripts/publicar_apk.py` morre com o repositório arquivado; o bucket `apk` fica com o último `versao.json`.
- Funções do Calc que foram para o principal (`master-professores`, `master-financeiro`, `master-planos`, ações `plano-*` do
  `mp-payments`) respondem "migrado" (PR 2). **Ficam no ar**: o `mp-webhook` do Calc (repassador) e o `mp-webhook` do Nutri.
- Instância de desenvolvimento do PowerSync: confirmar parada.
Voltar: republicar as funções da `main` anterior.

## 12. Aviso "o Physiq mudou" para todos
`app_config.aviso_mudanca` (principal, public): `nutri.ativo = true` (o do Calc já está ligado) — pelo master (Configurações) ou SQL.
Voltar: `nutri.ativo = false`.

## 13. Relatório
Contas migradas (preço e vencimento), alunos, casos em 2 contas, conflitos, o que foi desligado e onde está o backup.
