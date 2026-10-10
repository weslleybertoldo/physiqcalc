# Plano de incidente de segurança (Physiq)

Homologação, achado H-29 (hml-11, 08/10/2026): não havia roteiro para um incidente. Este é o roteiro. Vale para qualquer
incidente com dado do Physiq: vazamento, acesso indevido, uma conta vendo dado de outra, dado apagado ou alterado sem querer,
segredo exposto (chave, token, senha).

O repositório é público. Por isso:

- **o registro de cada incidente fica fora dele**, no notebook: `~/Desktop/Plano de Retorno Pessoal/Physiq/incidentes/`, um
  arquivo `AAAA-MM-DD-<assunto>.md` por incidente (o `LEIA-ME.md` da pasta diz o que ele leva). Guardar por pelo menos 5 anos,
  mesmo quando não houve aviso (Res. CD/ANPD nº 15/2024, art. 10);
- aqui entram só nomes (de segredo, tabela, função). Os valores estão no cofre (projeto PhysiqCalc).

## Quem avisar e em quanto tempo

O controlador é quem decide sobre o dado. É ele quem avisa a ANPD e as pessoas. No Physiq há 2 casos:

| Dados envolvidos | Controlador | Quem avisar | Prazo |
|---|---|---|---|
| Do atendimento: avaliações, medidas e fotos de avaliação; anamnese e prontuário; plano alimentar e treino prescrito; agenda, cobranças e recibos entre aluno e profissional; pré-consulta; diário | o profissional (o Physiq trata o dado por ele) | o profissional, no e-mail do dono da conta. Ele avisa a ANPD e os alunos dele; o Physiq manda tudo o que souber para ele cumprir os 3 dias úteis | **48 h** depois de saber (Termos de Uso novos, Anexo A5) |
| Da conta (login, nome, e-mail, foto do perfil); os pagamentos ao Physiq (plano do profissional e plano do app); tudo de quem treina sem profissional; os avisos do app; os dados técnicos de segurança | o Physiq | a ANPD e as pessoas afetadas | **3 dias úteis** (LGPD, art. 48; Res. CD/ANPD nº 15/2024, arts. 6º e 9º) |

- O relógio começa quando **se soube** do incidente.
- O aviso é obrigatório quando o incidente pode causar risco ou dano relevante às pessoas (LGPD, art. 48). O registro (passo 6)
  é feito sempre.
- Os 3 dias úteis vêm da LGPD e da Resolução da ANPD e já valem. As 48 h vêm dos Termos de Uso novos, ainda em revisão com o
  advogado ([textos-legais.md](textos-legais.md)); a Política em vigor não fala de incidente. Este roteiro já usa as 48 h.
- O que o aluno de um profissional registra sozinho (séries, cargas, refeições marcadas) está em dúvida com o advogado: pode ser
  dos dois. Na dúvida, seguir os 2 caminhos.

## 1. Anotar (nos primeiros minutos)

- Data e hora em que se soube, quem avisou e por onde: o aviso de erro no grupo Validação › Physiq, o e-mail de contato
  (`CONTATO_SUPORTE`, `src/nucleo/suporte.ts`), a mensagem de um profissional ou aluno, um alerta do GitHub, do Supabase, da
  Vercel ou da Cloudflare, o painel de uptime.
- O que se sabe até agora.
- Abrir o arquivo do incidente na pasta de fora do repo e ir completando ali. Ele vira o registro do passo 6.

## 2. Conter (antes de investigar a fundo)

### Segredo exposto: trocar na hora, investigar depois

- Valor novo no cofre (projeto PhysiqCalc). Nunca no chat, em commit, em print ou em log.
- Os segredos das funções ficam em Supabase › Edge Functions › Secrets de cada projeto (ou pela Management API). Valem sem
  deploy, mas a função que já está de pé segue com o valor antigo por alguns minutos: publicar de novo para valer na hora.
- Segredos entre servidores (cabeçalho `x-espelho-segredo`, as 8 primeiras linhas da tabela): 1 por finalidade. Quem manda
  guarda o valor; quem recebe guarda só o sha256 dele, na lista `<SEGREDO>_ACEITOS` (até 2: o atual e o anterior). O valor
  fica no cofre › PhysiqCalc › `Physiq — <SEGREDO> (hml-16c)`. Cada um troca sozinho, sem derrubar o canal, com
  `python3 scripts/segredos/servidor.py <finalidade> <passo>` (mostra só sha8 e tamanho; `--dry-run` mostra o plano):
  `gerar` → `aceitar` e publicar o receptor → `trocar` e publicar o emissor → `conferir` → `aceitar --so-atual` e publicar o
  receptor de novo (o valor anterior deixa de valer). Valor vazado: o mesmo caminho; para cortá-lo antes,
  `aceitar --so-atual --forcar` (o canal falha até o `trocar` e a publicação do emissor).
- Até o fim da troca da hml-16c ainda existe o legado `ESPELHO_SEGREDO` (funções dos 2 projetos, Vault `physiq_espelho_segredo`,
  `~/.physiq-espelho-segredo`), aceito pelos 8 receptores. Vazou: apagar nos 2 projetos e no Vault; o canal que ainda não
  trocou para até trocar. Enquanto ele existe, a volta de um canal é o `tirar` (o emissor volta ao legado).

| Segredo | Onde está | Como trocar |
|---|---|---|
| `SEGREDO_ESPELHO_NUCLEO` | principal (manda: `espelho-enviar`); a lista no Treino (`espelho-nucleo`) | `servidor.py espelho_nucleo`. Fora de sincronia, o acesso novo dos profissionais não chega ao Treino (a pendência para depois de 5 falhas e só volta no próximo login) |
| `SEGREDO_PONTE_CALC` | principal (`pos-login`); a lista no Treino (`vincular-professor`, modo servidor) | `servidor.py ponte_calc`. Fora de sincronia, a ponte do Calc no login não roda (o login segue) |
| `SEGREDO_CONTA_TREINO` | principal (`excluir-minha-conta`, `exportar-meus-dados`); a lista no Treino (`delete-my-account`, modo servidor) | `servidor.py conta_treino`. Fora de sincronia, exportar e excluir a conta não alcançam o Treino |
| `SEGREDO_ESPELHO_RESUMO` | Treino (`trocar-token`); a lista no principal (`espelho-resumo`) | `servidor.py espelho_resumo`. Fora de sincronia, o login do app no Treino falha: trocar por último e voltar na hora se algo falhar |
| `SEGREDO_REPASSE_VINCULO` | Treino (`vincular-professor` no modo app, `admin-delete-user`); a lista no principal (`vincular-aluno`) | `servidor.py repasse_vinculo`. Fora de sincronia, falham o vínculo pelo código dos APKs até a 3.1 e o desvínculo pelo painel antigo |
| `SEGREDO_REPASSE_CONVITES` | Treino (`professor-convites`); a lista no principal (`alunos`, `acao: repasse`) | `servidor.py repasse_convites`. Fora de sincronia, falham os convites dos APKs até a 3.15 |
| `SEGREDO_AVISO_ERRO` | Treino (as 13 funções que avisam erro, pelo `_shared/avisar-erro.ts`); a lista no principal (`erro-avisar`) | `servidor.py aviso_erro`. Fora de sincronia, os avisos de erro do Treino não chegam (as funções seguem) |
| fila do espelho (Vault `physiq_espelho_fila_segredo`; no cofre, `SEGREDO_ESPELHO_FILA`) | banco principal (`espelho_disparar()`, pelo `pg_net`); a lista `SEGREDO_ESPELHO_FILA_ACEITOS` no principal (`espelho-enviar`); `~/.physiq-segredo-espelho-fila` (E2E) | `servidor.py espelho_fila` (grava o Vault e o arquivo). Fora de sincronia, a fila do espelho só espera (a tarefa tenta de novo a cada 10 min) |
| `PUSH_SEGREDO` | função `push-enviar`; Vault (`physiq_push_segredo`); `~/.physiq-push-segredo` | trocar o arquivo e rodar `python3 e2e/w20c/segredos_push.py` (grava a função e o Vault) |
| `FCM_SERVICE_ACCOUNT` | função `push-enviar`; `~/.physiq-firebase/fcm-envio.json` | chave nova da conta de serviço `fcm-envio@physiq-br` no Google Cloud, apagar a antiga e rodar o mesmo `segredos_push.py` |
| `PROXY_SEGREDO` | funções `entrar-senha` e `alunos`; Worker `physiq-principal-api`; Vault (`physiq_proxy_segredo`); `~/.physiq-proxy-segredo` | os 3 juntos: o segredo das funções, o `deploy.sh` do Worker (grava a partir do arquivo) e o Vault. Fora de sincronia, todo mundo conta como um IP só nos limites do login e das páginas públicas |
| `LOGIN_IP_SAL` | função `entrar-senha` | valor novo (16+ caracteres). Trocar só zera as contagens por IP |
| `TURNSTILE_SECRET` | funções `entrar-senha` e `alunos` | Cloudflare › Turnstile › trocar a chave secreta do widget; gravar no principal |
| `MP_ACCESS_TOKEN_PROD` e `MP_ACCESS_TOKEN_TEST` | funções do principal e do Treino | renovar as credenciais no painel do Mercado Pago; gravar nos 2 projetos |
| `RESEND_API_KEY` | funções do principal (`agenda-avisar`, `aluno-enviar`, `alunos` e `convites`). O Treino não usa (nenhuma função de lá lê; a hml-16 tira os `RESEND_*` de lá). A senha SMTP do Auth do principal é **outra** chave do Resend | Resend › API Keys: criar outra só de envio (`sending_access`, restrita ao domínio `physiqcalc.com.br`), gravar no principal, conferir e apagar a antiga. A do SMTP: chave própria, testada antes no `smtp.resend.com:465` (usuário `resend`) e gravada com `PATCH /v1/projects/<ref>/config/auth` `{"smtp_pass": …}`; a API só devolve o hash, então a antiga não volta. Os E2E que leem e-mail usam a chave cheia local (`~/.physiq-resend-*`), nunca a das funções (H-36) |
| `TELEGRAM_BOT_TOKEN` | principal (a função `erro-avisar` e `supabase-principal/functions/_shared/avisar-erro.ts`) | é o mesmo bot de outros avisos do dono (o topo do `avisar-erro.ts`): revogar no BotFather e trocar em todo lugar que o usa |
| `WHATSAPP_AGENTE_TOKEN` | função `whatsapp-agente`; o agente no Moto G7 (`~/.physiqnutri-agente-token`) | valor novo nos 2 lugares e reiniciar o agente |
| chaves de servidor de cada projeto: a secret `default` (`SUPABASE_SERVICE_ROLE_KEY`, que as funções recebem sozinhas), a secret `servidor_2026_10` (scripts e E2E, lida na hora pela Management API) e a secret `painel_uptime` (só o painel de uptime: linhas `secret_<ref>` do `uptime.config`, monitores de métricas; hml-16b, H-62) | Supabase › API Keys do projeto | as legadas (JWT) saem dos 2 projetos (o Treino desligou em 04/10/2026; o principal, na hml-16): a troca é de chave nova. Criar outra secret (`POST /v1/projects/<ref>/api-keys` `{"type": "secret", "name": …}`), trocar onde ela é usada e apagar a vazada (`DELETE …/api-keys/<id>`). A `default` chega a todas as funções: trocar com cuidado e testar as funções logo depois. Como foram as trocas: [api-dominio-proprio.md](api-dominio-proprio.md). A `painel_uptime` troca sozinha: chave nova com o mesmo papel, gravar nas 2 linhas do `uptime.config` e esperar a rodada dos monitores (30 min) |
| PATs e tokens de conta: Supabase (`~/.pc-pat`; `SUPABASE_PAT` no GitHub), PowerSync (`POWERSYNC_PAT` no environment `powersync` do GitHub, só a `main`; cofre "PowerSync"), Cloudflare (`~/.cloudflare-pessoal-token`) | notebook, GitHub (Settings › Environments / Secrets) e cofre | revogar no painel de cada serviço, gerar outro e trocar onde ele está. Conferir quem mais usa o PAT do Supabase (H-62) |
| senha do `postgres` de cada projeto | Supabase e cofre | trocar no Supabase. No Treino, atualizar também a conexão do PowerSync, que entra como `postgres` (`powersync/service.yaml`) |
| senha do papel `physiq_backup` | cofre e `~/.config/physiq-backup/pgpass` | [backup.md](backup.md) › "Quem lê o banco": só o verificador SCRAM vai ao banco |
| par age do backup | pública em `scripts/backup/diario/destinatario.age`; privada só no cofre | [backup.md](backup.md) › "As chaves": par novo, trocar o `destinatario.age`, reinstalar e apagar as cópias antigas |
| chave do APK do site (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) | GitHub (environments `assinatura`, só a `main`, e `assinatura-aparelho`, com aprovação do dono) e cofre ("Physiq — chave do APK do site…", hml-16b) | trocar a chave obriga quem tem o APK a desinstalar e instalar de novo (o Android não instala por cima com outra assinatura). Decisão do dono |
| chave de upload da Play (`PLAY_UPLOAD_*`) | GitHub (environment `assinatura`, só a `main`), `~/keystores/physiq-play-upload.*` e cofre | pedir a troca da chave de upload no Play Console (Assinatura de apps). A chave que assina o app instalado é do Google ([loja-google-play.md](loja-google-play.md)) |

Não são segredo:

- as chaves públicas do outro projeto, que só mudam se a chave de lá mudar: `TREINO_ANON_KEY` (principal),
  `PRINCIPAL_ANON_KEY` (Treino) e `TREINO_PUBLISHABLE` (Worker `physiqcalc-api`);
- a publishable do próprio projeto no Worker que troca a anon legada: `PRINCIPAL_PUBLISHABLE` (Worker `physiq-principal-api`,
  gravado pelo `deploy.sh` a partir de `~/.physiq-principal-publishable`). Se a publishable do principal mudar, publicar o Worker
  de novo; sem o secret, os APKs antigos deixam de falar com o principal;
- a configuração: `TREINO_URL`, `SITE_URL`, `RESEND_FROM`, `MP_TEST_PAYER_EMAIL`, `ERROS_TELEGRAM_CHAT`, `ERROS_TELEGRAM_TOPICO`
  (principal) e `PRINCIPAL_URL`, `PRINCIPAL_WEBHOOK_URL`, `PRINCIPAL_WEBHOOK_CONTA_URL`, `PRINCIPAL_WEBHOOK_SCHEMAS` (Treino).

### Os outros casos

- **Código com defeito em produção:** voltar a versão ([voltar-versao.md](voltar-versao.md)) e corrigir pela esteira normal.
- **Conta usada por outra pessoa:** bloquear o login no Auth dos 2 projetos (Supabase › Authentication › Users › ban) e dar
  uma senha nova.
- **Rota pública sendo abusada:** já existem o limite por IP nas 9 funções públicas do principal (hml-05c: leituras 60 por
  hora, diário 30, pré-consulta 20, cadastros 20) e o teto dos 2 Workers (1200 pedidos por 60 s por IP, H-46). Dá para baixar o
  número numa migration nova ou no `deploy.sh` do Worker (o binding `LIMITE`) e publicar.
- **Vazamento pelo staging:** o staging fica nos mesmos projetos da produção, com o mesmo login ([desvios.md](desvios.md)).
  Já existem as travas da hml-02 (no staging, só conta de teste mexe em login: `conta_real_no_staging`), da hml-04c (o staging
  sem PowerSync) e da hml-09 (a exclusão pelo staging não alcança quem tem dado em produção). Conferir se elas seguraram (a da
  hml-09 tem teste: `e2e/hml09/guarda.py`).
- **Avisos de erro em excesso:** `ERROS_AVISO_DESLIGADO=1` nos segredos do principal desliga os avisos sem deploy (o log
  continua).

## 3. Entender o tamanho

- Quais dados (tabela, campos), de quem, quantas pessoas, desde quando e até quando.
- Quem é o controlador de cada dado envolvido (a tabela do topo).
- Contar no banco só com consultas de leitura. Contar, não copiar dado pessoal.

Onde olhar:

- **Avisos de erro:** o grupo Validação › Physiq e a tabela `avisos_erro` do principal (`public` e `staging`; 30 dias; só a
  assinatura, a origem, o lugar e um exemplo já limpo).
- **Logs do Supabase** (funções, Auth, API, Postgres): no plano Free ficam só **1 dia**. Baixar logo, pelo painel ou pela
  Management API (`e2e/hml10/_logs_supabase.py` mostra como).
- **Vercel** (deploys e logs do site) e **Cloudflare** (os 2 Workers).
- **`/health` do site** (`https://physiqcalc.com.br/health`): a versão, o commit, o schema e o canal do build no ar.
- **Painel de uptime:** os monitores do site, do `/health`, das APIs e do deploy.
- **GitHub:** commits, PRs, Actions e Releases.
- **Ações do master:** as funções `master-*` rodam como a pessoa (`supabase-principal/functions/_shared/master-porta.ts`), e o
  banco grava quem fez cada ação nos eventos (ex.: `conta_eventos`). Só as ações: a leitura não fica registrada.

## 4. Avisar

- O aviso diz (LGPD, art. 48, § 1º):
  - que dados foram afetados;
  - quem e quantas pessoas;
  - as medidas técnicas e de segurança que protegiam esses dados;
  - os riscos;
  - por que demorou, se o aviso não foi imediato;
  - o que já foi feito e o que ainda vai ser feito para reverter ou diminuir o prejuízo.

  E o contato (`CONTATO_SUPORTE`). O que ainda não se souber vai depois, assim que se souber.
- **Profissional (dado do atendimento):** e-mail ao dono da conta em até 48 h. O Physiq manda o que tiver para ele avisar a ANPD
  e os alunos dele nos 3 dias úteis.
- **ANPD e pessoas afetadas (o Physiq é o controlador):** o formulário de comunicação de incidente no site da ANPD
  (gov.br/anpd), em até 3 dias úteis. As pessoas recebem o aviso por e-mail no mesmo prazo, em linguagem simples.
- **Mensagem para fora só com fato conferido.** O que ainda é hipótese vai como "em apuração".

## 5. Recuperar

- Dado perdido ou alterado: restaurar da cópia diária ([backup.md](backup.md) › "Restaurar"; as cópias ficam no notebook por
  até 29 dias). Antes de mexer, uma cópia "antes" do estado de agora.
- Os arquivos do Storage não estão na cópia ([backup.md](backup.md) › "Fica de fora").
- Conferir que a correção está em produção (o `/health` com o commit certo e o teste que recusa o caso) e que ninguém ficou
  sem acesso.

## 6. Registrar e aprender

- Fechar o arquivo do incidente (fora do repo) com: a linha do tempo, os dados e as pessoas afetadas, o controlador, os avisos
  (quando, para quem e o texto, ou por que não houve aviso), a correção e a prova. Guardar por pelo menos 5 anos.
- Todo incidente vira um teste que recusa o caso (Vitest, SQL ou E2E) e é gatilho de nova homologação.
