# Desvios registrados (Physiq)

Homologação, achado H-49 (hml-11, 08/10/2026). Um desvio é uma escolha que foge do padrão do projeto ou do que a homologação
pede, feita de propósito. Até aqui o motivo de cada um só aparecia em comentário de código. Esta é a lista: o motivo, desde
quando, quem decidiu, a saída (ou até quando) e onde está no código. "Dono" é quem opera o Physiq; a data é a da decisão.

| # | Desvio | Motivo | Desde | Quem decidiu | Saída ou até quando | Onde no código |
|---|---|---|---|---|---|---|
| 1 | `verify_jwt=false` em 17 funções (12 no principal, 5 no Treino): a borda do Supabase não exige o login | quem chama não tem o login da pessoa (outro servidor, o banco, o Mercado Pago, o agente do G7, quem ainda não entrou) ou tem o login do outro banco. Cada uma confere quem chama dentro dela ([lista abaixo](#as-17-funções-com-verify_jwtfalse)) | 15/07/2026 (a 1ª, o `mp-webhook` do Treino); as outras de 29/09 a 08/10/2026 | o desenho de cada W; a lista foi conferida na hml-10 e de novo em 08/10/2026 | ficam. As miudezas dessas funções são o H-51 (sem prazo) | o topo do `index.ts` de cada uma |
| 2 | Jeito 1: o navegador fala direto com os 2 bancos (tabelas, RPCs e Storage), e a barreira é o RLS | o app nasceu assim | a origem do app | dono, 04/10/2026: app novo nasce no jeito 2 (só o servidor fala com o banco) e os que existem migram em etapas pela homologação. As datas são do plano da homologação, aprovado em 07/10/2026 | 3 etapas: H-41 (gravações de saúde e financeiro) até 06/11/2026; H-42 (leituras de saúde) até 04/12/2026; H-43 (o resto) até 08/01/2027. Ficam o login e o PowerSync | `src/integrations/supabase/client.ts` (Treino) e `src/integrations/principal/client.ts` (principal) |
| 3 | O PowerSync fala direto com o Postgres do Treino (replicação lógica), fora do domínio próprio | o treino funciona sem internet | antes de 11/05/2026 (quando as regras entraram no repo) | o plano da homologação (H-43), aprovado em 07/10/2026 | fica. As gravações da fila do aparelho passam pelo REST, com o login da pessoa (RLS) | `powersync/sync-config.yaml`, `src/lib/powersync/connector.ts`; [api-dominio-proprio.md](api-dominio-proprio.md) › "O que NÃO passa pelo proxy" |
| 4 | O staging é o schema `staging` dentro dos 2 projetos de produção, com o mesmo login (um Auth para os 2 schemas) | (a conferir: o commit de origem não diz) | 18/06/2026 | dono, 04/10/2026: staging por schema não reprova; staging mexendo em dado real reprova | fica, com as travas: hml-02 (no staging, só conta de teste mexe em login: `conta_real_no_staging`), hml-04c (o staging sem PowerSync) e hml-09 (a exclusão pelo staging não alcança quem tem dado em produção) | `VITE_DB_SCHEMA` (o build); o cabeçalho `x-schema` das funções; as migrations com `{schema}` |
| 5 | O login por senha bloqueia de vez depois de cerca de 9 erros seguidos (conta toda tentativa com aquele e-mail) | regra do dono: 4 erros → 1 min; depois 5, 15, 30 e 60 min; o erro seguinte bloqueia de vez | 30/09/2026 (W8b) | dono, 29/09/2026 | fica. Destrava com uma senha nova dada pelo profissional ou pelo master, ou entrando com o Google | `supabase-principal/migrations/20260930020000_w08b_limite_login.sql:2-5`; função `entrar-senha` |
| 6 | O WhatsApp automático usa o Baileys (API não oficial), num celular de casa (Moto G7) | cada profissional conecta o próprio número por QR, como no WhatsApp Web; o celular só faz conexão de saída (sem porta aberta em casa) | 20/09/2026 (no PhysiqNutri); no Physiq desde 29/09/2026 (W2) | dono, 20/09/2026 | sem saída prevista. Os Termos de Uso novos avisam o profissional | `infra/agente-whatsapp/agente.js:3-9`; funções `whatsapp-agente` e `whatsapp-conectar` |
| 7 | O repositório é público: o parecer da homologação e os registros de incidente ficam fora do git, e a cópia do banco roda no notebook, não em Action | o parecer descreve achados ainda abertos; artefato e log de Action de repositório público ficam abertos | 07/10/2026 (parecer); 08/10/2026 (cópia diária, hml-07) | o plano da homologação | o parecer, até fechar os 🔴; a cópia e os registros, sem saída prevista | [backup.md](backup.md), `scripts/backup/diario/`; [incidente.md](incidente.md) |
| 8 | O app cobra, mas roda na Vercel Hobby e no Supabase Free (o Free pausa sem uso e não tem backup diário nem PITR) | decisão do dono adiada | antes de 07/10/2026 (medido na homologação) | dono, 07/10/2026: "mantém pendente igual o Nativo OS" (H-37) | decisão do dono; o prazo do H-37 é 06/11/2026. Enquanto isso: a cópia diária própria (hml-07) e o keep-alive | `.github/workflows/keep-alive.yml`; [backup.md](backup.md) |
| 9 | A foto do professor fica num bucket público (`fotos-professores`), com a listagem fechada | a foto aparece nas páginas públicas `/c/` e `/f/` | 14/09/2026 (o bucket); listagem fechada e upload limitado em 07/10/2026 (hml-04) | dono, 07/10/2026: "1" (manter pública, fechar a listagem e limitar o upload; H-08) | fica. Só professor ou admin grava, na própria pasta, até 5 MB, em JPG, PNG ou WebP | `supabase/migrations/20260914000000_fotos_professores_bucket.sql`, `supabase/migrations/20261007230000_hml04_storage_treino.sql`, `src/lib/fotoProfessor.ts` |
| 10 | O painel master existe só no site, e o 2FA do master fica para o fim | o master vê os dados de todas as contas, inclusive os de saúde (H-22) | 08/10/2026 (hml-08, release v3.71) | dono, 07/10/2026: "remove o master do app e mantém só no site"; o 2FA (H-09) "fica para o final" | o 2FA no fim da homologação, junto do H-09 | `VITE_APP_NATIVO` e `scripts/ci/sem-master.sh` (o build do app); `supabase-principal/functions/_shared/master-porta.ts` |
| 11 | Os arquivos do Storage ficam fora da cópia diária | copiá-los exigiria, no notebook, uma chave que lê todos os buckets; o backup do próprio Supabase também não leva o Storage | 08/10/2026 (hml-07) | o desenho da hml-07 (limite registrado) | sem saída prevista (a conferir com o dono) | [backup.md](backup.md) › "Fica de fora" |
| 12 | O AAB 3.56, em revisão na Play (envio nº 1), ainda leva o painel master | foi enviado antes da hml-08, e o envio em revisão não é mexido | 07/10/2026 | o plano da Play e da homologação | o próximo envio do AAB, depois da aprovação do nº 1. O CI já confere que o AAB sai sem o master | [loja-google-play.md](loja-google-play.md); `scripts/ci/aab-loja.sh` (conferência f) |
| 13 | O log do agente no Moto G7 ainda grava o número do WhatsApp conectado | corrigir pede uma ida ao celular: copiar o agente, reiniciar e apagar o log antigo | desde o agente (20/09/2026) | hml-10 (P9) | na próxima ida ao celular, junto do ajuste que ficou da hml-06 | `infra/agente-whatsapp/agente.js` (o log fica só no aparelho) |
| 14 | Algumas telas ainda mostram a mensagem técnica do erro do banco num aviso ou estado de erro | achado na hml-10, fora do escopo dela | antigo; achado em 08/10/2026 | hml-10 (P10) | hml-17 (H-61): texto fixo por ação + código, como as telas de erro da hml-10 | as telas de cada área |
| 15 | As credenciais do painel de uptime (outro projeto) ainda não passaram pela revisão de escopo e rotação | achado na hml-10, fora do escopo dela | achado em 08/10/2026 | hml-10 (P11): anotar | hml-16 (H-62): revisão e rotação (o detalhe fica no parecer, fora do repo) | fora deste repo (o painel é outro projeto) |

## As 17 funções com `verify_jwt=false`

Conferido em 08/10/2026 na lista publicada dos 2 projetos (Management API, só leitura): são estas 17, e nenhuma outra.
"Segredo entre servidores" é o cabeçalho `x-espelho-segredo` (`ESPELHO_SEGREDO`).

| Banco | Função | Quem chama | O que confere quem chama | Desde |
|---|---|---|---|---|
| principal | `alunos` | o app; a página pública de cadastro `/c/` (sem login); o Treino | app: o login, no Auth, dentro dela; `/c/`: o captcha (Turnstile) e o limite por IP; Treino: o segredo entre servidores | 30/09/2026 |
| principal | `entrar-senha` | quem ainda não entrou | o captcha (Turnstile, de uso único) e o limite de tentativas por IP e por conta | 30/09/2026 |
| principal | `erro-avisar` | o app (até antes do login) e o Treino | app: só as origens da lista, corpo até 2 KB e a trava de repetidos; Treino: o segredo entre servidores | 08/10/2026 |
| principal | `espelho-enviar` | o banco (`pg_net`) | o segredo entre servidores | 29/09/2026 |
| principal | `espelho-resumo` | a `trocar-token` do Treino | o segredo entre servidores | 29/09/2026 |
| principal | `mp-webhook` | o Mercado Pago (assinaturas e Pix do antigo Nutri) | não confia no aviso: busca o recurso de novo no Mercado Pago | 29/09/2026 |
| principal | `mp-webhook-aluno` | o Mercado Pago e o repasse do Treino | busca de novo no Mercado Pago; idempotente | 29/09/2026 |
| principal | `mp-webhook-conta` | o Mercado Pago e os repasses | busca de novo no Mercado Pago; idempotente | 29/09/2026 |
| principal | `pos-login` | o app, logo depois do login | o login, no Auth, dentro dela | 29/09/2026 |
| principal | `push-enviar` | o banco (o gatilho dos avisos, `pg_net`) | o segredo do push (`x-push-segredo`) | 01/10/2026 |
| principal | `vincular-aluno` | o app e o Treino | app: o login, no Auth, dentro dela; Treino: o segredo entre servidores | 29/09/2026 |
| principal | `whatsapp-agente` | o agente no Moto G7 | o token do agente (`x-agente-token`) | 29/09/2026 |
| Treino | `espelho-nucleo` | a `espelho-enviar` do principal | o segredo entre servidores | 29/09/2026 |
| Treino | `mp-webhook` | o Mercado Pago (cobranças antigas do Calc) | busca de novo no Mercado Pago | 15/07/2026 |
| Treino | `treino-leitura` | o painel (a nutricionista), com o login do principal | o login, no Auth do principal; o principal decide quem vê o aluno | 30/09/2026 |
| Treino | `trocar-token` | o app, com o login do principal | o login, no Auth do principal; e-mail confirmado; limite por pessoa | 29/09/2026 |
| Treino | `vincular-professor` | os APKs antigos (até a 3.1) e o `pos-login` do principal | app: o token, dentro dela; servidor: o segredo entre servidores | `false` desde 29/09/2026 (W3) |

- Publicar só pelo `scripts/deploy_function.sh <ref> <pasta> <slug> false`. Ele para se o pedido for diferente do que está
  publicado (só `FORCAR_VERIFY_JWT=1` troca).
- Nunca pelo workflow `deploy-function.yml`: ele publica no Treino com o `verify_jwt` ligado, e a função passa a responder 401.
