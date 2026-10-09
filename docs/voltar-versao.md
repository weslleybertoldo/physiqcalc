# Voltar uma versão (Physiq)

Homologação, achado H-49 (hml-11, 08/10/2026). O passo a passo para voltar cada peça do Physiq a uma versão boa, com pressa.
Regra geral: primeiro voltar, depois corrigir pela esteira normal (local → staging → produção).

## Antes de tudo

- Achar o último commit bom. O `/health` do site (`https://physiqcalc.com.br/health`) mostra a versão e o commit no ar.
- Código volta; dado não. Dado perdido ou alterado sai da cópia ([backup.md](backup.md)).
- Incidente de segurança? O roteiro é o [incidente.md](incidente.md); voltar a versão é o passo "Conter".

## Site (Vercel)

- **Na hora:** Vercel › projeto `physiqcalc` › Deployments › o último deploy bom de produção › **Instant Rollback**. No plano
  Hobby, só dá para voltar ao anterior.
- Antes, ler o `scripts/vercel/ignorar-build.sh`: a Vercel **pula** o commit de bump do CI (`chore: bump version to v…`) e os
  commits com `[skip ci]`, `[skip actions]` e afins. Por isso o deploy anterior pode ser mais velho que o último commit da `main`.
- **De vez:** `git revert` do commit ruim → PR → merge na `main`. A mensagem do revert não pode levar `[skip ci]` nem
  `[skip actions]`: senão o site não publica e não sai APK.
- Depois de um Instant Rollback, a Vercel não põe sozinha na produção os deploys novos até alguém desfazer o rollback ou
  promover um deploy (comportamento da Vercel; conferir na tela no dia).
- O staging é a branch `staging` (`physiqcalc-staging.vercel.app`): o mesmo caminho.
- Conferir: o `/health` com a versão e o commit esperados.

## Funções (Supabase)

- Publicar a versão boa a partir de um checkout do commit bom, numa worktree à parte:

  ```bash
  git worktree add --detach ../physiq-volta <commit bom>
  cd ../physiq-volta
  scripts/deploy_function.sh <ref> <pasta das funções> <slug> <verify_jwt>
  ```

  - principal: ref `hkxvtsbwctxkrqzkkdoz`, pasta `supabase-principal/functions`;
  - Treino: ref `uxwpwdbbnlticxgtzcsb`, pasta `supabase/functions`;
  - `<verify_jwt>`: o mesmo de hoje (as 17 com `false` estão em [desvios.md](desvios.md)). O script para se o pedido for diferente
    do que está publicado; só `FORCAR_VERIFY_JWT=1` troca;
  - o script leva a pasta da função e a `_shared/` da mesma pasta. O PAT fica em `~/.pc-pat`.
- **Só pelo `scripts/deploy_function.sh`:** o workflow `deploy-function.yml` saiu na hml-13 (publicava no Treino com o
  `verify_jwt` ligado e derrubava as funções que precisam de `false`; com ele saiu também o `SUPABASE_PAT` do GitHub).
- **Conferir depois:** o repo não tem um script para isso. A conferência é baixar a função publicada e comparar, arquivo a
  arquivo, com o commit bom:

  ```bash
  npx -y supabase@2.118.0 functions download <slug> --project-ref <ref> --use-api --workdir <pasta vazia>
  # cada arquivo baixado × git show <commit bom>:<pasta das funções>/<caminho do arquivo>
  ```

  E uma chamada simples antes e depois (`OPTIONS` e um `POST` sem login), que deve dar a mesma resposta.
- Dica: antes de publicar uma mudança, baixe a função publicada. A volta fica byte a byte.
- Os segredos não voltam com o código. Se a mudança mexeu num segredo, voltar o segredo também.
- Os avisos de erro estão demais? `ERROS_AVISO_DESLIGADO=1` nos segredos do principal os desliga sem deploy.

## Banco (migrations)

- Migration não volta sozinha. Só as da homologação (e algumas antes) têm reversa: `supabase-principal/reversas/` (15) e
  `supabase/reversas/` (5). Para as outras, a volta é uma migration nova que desfaz, ou a cópia.
- **Antes de rodar uma reversa:** a cópia "antes" do estado de agora ([backup.md](backup.md) › "Cópias manuais").
- Cada reversa diz no topo como aplicar e em que schema:
  - principal: `python3 scripts/apply_migration_principal.py <arquivo> --so staging` (e depois `--so public`); `--dry-run`
    roda dentro de um `BEGIN … ROLLBACK`;
  - Treino: pela Management API, com o `set physiq.schemas = '<schema>'` quando o topo pede (há reversa que roda 1 vez só).
- Ler o topo antes: uma reversa pode apagar dado que a migration criou (a dos avisos de erro, por exemplo, apaga o histórico).

## Workers (Cloudflare)

- O código fica em `infra/cloudflare/physiq-principal-api/` e `infra/cloudflare/physiqcalc-api/`. Voltar: de um checkout do
  commit bom, `bash infra/cloudflare/<worker>/deploy.sh`. Ele mantém os secrets do Worker e grava de novo o `PROXY_SEGREDO`
  (principal) ou o `TREINO_PUBLISHABLE` (Treino) a partir dos arquivos do notebook.
- Sem checkout: cada publicação é uma versão na Cloudflare, e dá para pôr a anterior a 100%
  ([api-dominio-proprio.md](api-dominio-proprio.md)).

## APK do site

- **Não dá para descer a versão:** o versionCode só cresce ([loja-google-play.md](loja-google-play.md) › "versionCode"), e o
  Android não instala uma versão menor por cima.
- **1º, na hora:** marcar a release ruim como **pre-release** no GitHub (Releases › a versão › Edit, ou
  `gh release edit v<versão> --prerelease`). O atualizador do app (`src/lib/apkRelease.ts:1` e
  `src/components/UpdateChecker.tsx:11`) e o "Instalar" do site leem `releases/latest`, que ignora pre-release. Com isso, a
  versão ruim deixa de ser oferecida a quem ainda não atualizou.
- **2º:** `git revert` do commit ruim → PR → merge na `main`. O `build-apk.yml` solta a release vN+1 com o código bom (ela vira
  a `latest`), e quem já tem a versão ruim recebe a atualização.

## AAB da Google Play

- O mesmo revert: o job `aab-loja` gera o AAB com versionCode novo (artifact `Physiq-v<versão>-loja`). O dono envia no Play
  Console como uma versão nova ([loja-google-play.md](loja-google-play.md)).
- Em produção, com lançamento gradual: Play Console › a versão › **Interromper lançamento**. A versão ruim para de chegar a quem
  ainda não recebeu.
- Em 08/10/2026 o app está no teste fechado (envio nº 1 em revisão).

## PowerSync (regras de sincronização)

- O `powersync/sync-config.yaml` da `main` vai para a instância de produção pelo `keep-alive.yml`: sozinho, a cada 4 dias, ou à
  mão (Actions › "Keep Supabase + PowerSync Active" › Run workflow › `powersync`).
- Voltar: revert na `main` e rodar o job à mão. Atenção: uma mudança ruim nesse arquivo vai sozinha para a produção em até 4 dias.

## Painel de uptime

- O painel é outro projeto. A mudança da hml-10 nele trouxe a reversa no mesmo arquivo do SQL, comentada. Voltar é rodar essa
  reversa.

## Timers do backup (notebook)

- Os timers rodam uma cópia dos scripts em `~/.local/lib/physiq-backup/`, não o checkout. O arquivo `VERSAO` de lá diz o commit
  instalado.
- **Voltar um script:** de um checkout do commit bom, rodar `scripts/backup/diario/instalar.sh` de novo.
- **Desligar tudo:** `scripts/backup/diario/instalar.sh --desinstalar`. Desliga os timers e apaga a cópia dos scripts; ficam o
  `~/.config/physiq-backup/` e as cópias em `~/backups/physiq` ([backup.md](backup.md)).

## Main protegida (hml-13)

- A `main` só recebe PR com o check `checar-pr` verde (`.github/workflows/ci-pr.yml`: lint, tipos, `SECURITY DEFINER` nas
  migrations novas, testes de Node e Vitest), 0 aprovações, só squash. Ruleset "main protegida (hml-13)"; sem force push e sem
  apagar a branch. A `staging` fica fora.
- Merge: `gh pr checks <n> --watch --fail-fast && gh pr merge <n> --squash`. Nada de `--admin`.
- **Nunca `[skip ci]`/`[skip actions]` num commit da branch do PR:** o GitHub não roda o check e o PR fica travado ("Expected").
  PR sem release (só E2E ou doc): o marcador vai só no título do squash
  (`gh pr merge <n> --squash --subject "<título> [skip actions] (#<n>)"`). Já travou: commit novo SEM o marcador na branch (`git commit --allow-empty -m "rodar o check"` + push). O
  `gh workflow run ci-pr.yml --ref <branch>` roda o check, mas NÃO destrava o PR (provado na hml-13, PR #160).
- Quem fura a regra: só a deploy key do bump de versão (job `bump` do `build-apk.yml`, environment `release`, só a `main`).
- **Voltar uma versão com a main protegida:** o Instant Rollback da Vercel (seção "Site") não depende do git; o revert "de vez"
  vira `git revert` do squash numa branch → PR → check verde → merge (uns 6 min a mais que antes).
- **Emergência** (GitHub Actions fora do ar, check quebrado), só com o OK do Weslley — desligar e religar logo depois:

  ```bash
  R=weslleybertoldo/physiqcalc
  ID=$(gh api repos/$R/rulesets --jq '.[] | select(.name=="main protegida (hml-13)") | .id')
  gh api -X PUT repos/$R/rulesets/$ID -f enforcement=disabled   # desliga
  gh api -X PUT repos/$R/rulesets/$ID -f enforcement=active     # religa
  ```
