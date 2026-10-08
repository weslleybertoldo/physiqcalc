# Cópias de segurança do banco (Physiq)

Homologação, achado H-21 (hml-07, 08/10/2026). Os 2 projetos do Supabase estão no plano Free, que não tem backup
diário nem PITR. Por isso o banco é copiado todo dia pelo **notebook** (Xubuntu, o G400s). O repositório é público,
então nada disso roda em Action do GitHub: artefato e log de Action de repositório público ficam abertos.

## O que roda e quando

| Timer (systemd do usuário) | Hora | Faz |
|---|---|---|
| `physiq-backup-diario.timer` | 03:23 | `copia.sh todos`: cópia cifrada dos 2 bancos, com ensaio de restauração |
| `physiq-backups-cifrar.timer` | :47 de toda hora | `cifrar-copias-manuais.sh`: cifra as cópias manuais paradas há 2 h |
| `physiq-backups-limpeza.timer` | 04:10 | `limpeza.sh`: apaga de `~/backups/physiq` o que tem 29 dias ou mais |

- Falha em qualquer um: `OnFailure=` chama `physiq-backup-aviso@<unidade>`, que manda 🔴 no grupo Validação, tópico
  Physiq. O aviso diz só a rotina, a hora e o comando do journal.
- Os 3 timers têm `Persistent=true`: se o notebook estava desligado na hora, a rodada sai quando ele volta.
- Os scripts ficam em `scripts/backup/diario/`. O `instalar.sh` copia todos para `~/.local/lib/physiq-backup/` e as
  unidades para `~/.config/systemd/user/`. As unidades rodam essa cópia, não o checkout. Mudou um script: merge na main,
  depois `scripts/backup/diario/instalar.sh` de novo. `--desinstalar` desliga os timers e apaga a cópia dos scripts.

## O que a cópia diária leva

Arquivo `~/backups/physiq/diario-AAAA-MM-DD-<principal|treino>.tar.age` (600). Uma segunda rodada no mesmo dia substitui
a primeira. Dentro do `.tar.gz` cifrado:

- `banco.dump`: `pg_dump -Fc` do schema `public`, sem dono, com as permissões e sem publicações;
- `logins_usuarios.jsonl` e `logins_identidades.jsonl`: `auth.users` e `auth.identities` inteiros, sem sessões nem
  tokens, no formato do `COPY` (só o `\copy … from` lê de volta);
- `manifesto.tsv`: linhas de cada tabela, contadas no próprio `banco.dump`, mais os logins;
- `versoes.txt`, `preparar-restauro.sql` e `LEIA-ME.txt`.

Os logins e o dump saem da **mesma foto** do banco (`pg_export_snapshot` + `pg_dump --snapshot`). Assim, uma conta
criada ou apagada durante a cópia não deixa linha apontando para login que ficou de fora.

**Fica de fora:**

- os **arquivos do Storage**. Copiá-los exigiria, no notebook, uma chave que lê todos os buckets. O backup do próprio
  Supabase também não leva o Storage;
- o schema `staging`;
- os jobs do `pg_cron` e os gatilhos em `auth.users` (`handle_new_user`, `sincronizar_papel_do_jwt`);
- as publicações (`powersync`, `supabase_realtime`) e os segredos do Vault.

O que está nas migrations volta com elas. Os segredos estão no cofre.

## Quem lê o banco

O papel `physiq_backup` existe nos 2 projetos (migrations `20261008050000_hml07_papel_backup` e
`20261008050100_hml07_papel_backup_treino`). Ele é só leitura: `USAGE`/`SELECT` nos schemas `public` e `staging`,
sessões com `default_transaction_read_only`, nenhuma escrita e `connection limit 3`. Tem `BYPASSRLS` porque o
`pg_dump` desliga a RLS e para em tabela com política. Os logins saem só pelas funções `backup.logins_usuarios()` e
`backup.logins_identidades()`: o papel não tem acesso ao schema `auth`.

- A conexão é pelo pooler em modo sessão (porta 5432; principal `aws-0-sa-east-1`, Treino `aws-1-us-east-1`).
- A senha está no cofre (projeto PhysiqCalc: "Physiq — banco principal, papel physiq_backup (cópia de segurança)" e
  "Physiq Treino — banco, papel physiq_backup (cópia de segurança)") e em `~/.config/physiq-backup/pgpass` (600).
- **Trocar a senha** (por exemplo, notebook perdido): gerar uma nova e guardar no cofre. No banco vai só o verificador
  SCRAM-SHA-256 (`alter role physiq_backup with login password 'SCRAM-SHA-256$4096:…'`), então a senha não passa pelo
  SQL nem pelo log. Depois, atualizar o `pgpass`.

## As chaves

A cifra é do [age](https://age-encryption.org). A chave **pública** está em `scripts/backup/diario/destinatario.age`.
A **privada** existe só no cofre ("Physiq — chave privada do backup (age)") e nunca fica no notebook: perder o notebook
não abre as cópias. Sem a privada, nenhuma cópia abre. Se ela vazar, gerar um par novo, trocar o `destinatario.age`,
reinstalar e apagar as cópias antigas.

## Cópias manuais

Quem faz manutenção continua gravando a cópia "antes" em `~/backups/physiq/<data>-<nome>/` (memória: backup manual só
no notebook). De hora em hora, o que está parado há 2 h ou mais vira `<nome>.tar.age`. Dentro dele vai um `SHA256SUMS`
dos arquivos. O `.tar.age` leva a data da cópia, para a limpeza de 29 dias contar certo. Nome repetido ganha
`-AAAAMMDDHHMMSS`. Para voltar uma cópia manual:

```bash
age -d -i <arquivo da chave privada> ~/backups/physiq/<nome>.tar.age | tar -xf - -C /tmp/volta
(cd /tmp/volta && sha256sum -c SHA256SUMS)
```

## Restaurar

O `restaurar.sh` sobe um Postgres 18 descartável (initdb numa pasta temporária, só socket local, sem TCP) e cria os
papéis que a cópia cita. Depois roda o `preparar-restauro.sql` (extensões em `extensions` e um `auth` mínimo), carrega
os logins e faz o `pg_restore` inteiro numa transação. No fim compara as linhas de cada tabela com o manifesto.

```bash
# chave privada do cofre por um pipe (sem arquivo); --manter deixa o Postgres de pé para consultar
~/.local/lib/physiq-backup/restaurar.sh ~/backups/physiq/diario-AAAA-MM-DD-principal.tar.age \
  --identidade <(comando que escreve a chave do cofre na saída) --manter
```

- **Ver ou recuperar uma tabela:** restaurar com `--manter`, consultar no Postgres local e devolver ao Supabase só as
  linhas certas (`\copy … to` no local e `insert … on conflict do nothing` no projeto). Antes, fazer uma cópia "antes"
  do estado atual.
- **Perda do projeto inteiro (Supabase novo):**
  1. criar o projeto e aplicar as migrations do repo: o schema, as permissões, o staging, as publicações, os gatilhos em
     `auth.users`, o pg_cron e os buckets;
  2. carregar os logins no `auth` de verdade:
     `insert into auth.users select * from jsonb_populate_record(null::auth.users, j)` (o mesmo para
     `auth.identities`). Aceita coluna a mais ou a menos numa versão nova do Auth;
  3. trazer os dados com `pg_restore --data-only --disable-triggers` do `banco.dump`, como `postgres`;
  4. pôr de volta os segredos do Vault e das Edge Functions (cofre) e os arquivos do Storage (fora da cópia).

  O `pg_dump --schema=public` grava `CREATE SCHEMA public`, que todo banco novo já tem. Uma restauração inteira (não só
  dos dados) passa pela lista: `pg_restore -l | grep -v ' SCHEMA - public '`, depois `-L`.

## Testar

- `scripts/backup/diario/teste-local.sh`: 30 conferências sem tocar o Supabase. Usa uma origem descartável que imita os
  2 projetos, aplica as 2 migrations e testa um par age de teste, os casos negativos, a cifra das manuais e a limpeza.
- Cópia de staging: `copia.sh <projeto> --schema staging --saida <pasta temporária>`. Apagar o arquivo depois.

## Restaurações de teste

| Data | Cópia | Resultado |
|---|---|---|
| 08/10/2026 05:22 | staging dos 2 bancos (`copia.sh todos --schema staging`) | ensaio ok; decifrada com a chave do cofre e restaurada: principal 84 tabelas + logins, Treino 45 + logins, linhas iguais ao manifesto |
| 08/10/2026 05:27 | `diario-2026-10-08-principal.tar.age` e `-treino` (1ª rodada do timer) | decifradas com a chave do cofre e restauradas: 86 e 47 linhas de manifesto (com os logins) iguais |
| 08/10/2026 05:28 | as 47 cópias manuais que estavam sem cifra | cifradas, decifradas e conferidas (`sha256sum -c`) antes de apagar as abertas; 0 falhas |
