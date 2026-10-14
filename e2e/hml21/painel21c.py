"""Physiq hml-21c (H-43 parte 4 · jeito 2, etapa 3, 13/10/2026) — a base dos E2E do Aluno › Resumo (o card de login — na aba Acessos desde a
P4 da W-A — e as "Mensagens automáticas"), das Configurações (Perfil, Conta, Equipe, Convite, Excluir › ZIP), da Mensagens, da Lixeira e dos
Modelos pela função `conta` (os ★ dos Modelos pela `nutricao`/`financeiro`, no motor comum — H-112) — o api.py, o rede.py e o telas.py
--area aluno|configuracoes|mensagens|lixeira|modelos. Usa o e2e/hml21/_base.py (B) e o painel21b.py (P21: a conta ativa como o app escolhe,
a situação como a pessoa, o WhatsApp conectado) e acrescenta:
  · as contas (decisão I do contrato da 21c): NUTRI = w5p-nutri (o Resumo e a aba Acessos de um aluno DE TESTE, as Configurações, a
    Mensagens, a Lixeira, os Modelos), PERSONAL = w5p-personal (o dono da conta de teste: os Modelos com a aba Treinos — direta, o desvio do
    gate da 21d —, o Perfil com o espelho no Treino, a Conta e as recusas da Equipe), OUTRA = w13-dono (N1), ALUNA = w5p-aluna (N11); o par
    do W8b (w8b-personal + o aluno dele, w8b-aluno) SÓ para o P de verdade da senha nova (a MESMA senha guardada — nunca impressa — e a marca
    de senha provisória tirada no fim pelo senha_definida da 21a com a sessão dele: 2 logins, se couberem no teto; senão PULA). Na produção
    (decisão N, SÓ LEITURA) a nutri-legado. Nenhuma conta nova no Auth;
  · o aluno DE TESTE (SQL só leitura, sem login): da conta ativa da nutri (a 1ª da minha_situacao, como o app), o e-mail de teste (a trava da
    W5: *.teste.claude@physiqnutri.app, *teste.claude@physiqcalc.app, teste@teste.com), de preferência NÃO uma matrícula da w5p-aluna (a massa
    da W-A) — um COM login e um SEM login;
  · as telas (a rota, o seletor do "pronto" e o teto de `ler` POR FUNÇÃO) e as PRÉ-CONDIÇÕES de abrir sem gravar, em toda base: a aba Acessos
    abre pela AÇÃO acesso_ler (decisão 13: a aluno_acesso só lê — contada à parte; na produção a Guarda a barra → PULA); a Mensagens só com a
    instância de WhatsApp já criada e fora do aguardando_qr (a whatsapp-conectar(status) cria/renova — gravação na Guarda, decisão 23; contada
    à parte); o Convite só com o codigo_convite da conta ativa (o garantir_meu_codigo grava ao abrir). A produção (decisão N): abrem o Perfil, a
    Conta, a Equipe, a Lixeira e os Modelos (o Convite só com o código); PULAM o Excluir, a Mensagens, o Resumo e a aba Acessos;
  · a massa e o estado devolvido (decisão I), na chave "hml21c" do Estado: os avisos do sino do aluno de teste (aluno_avisar_plano: os ids, o
    DELETE no fim); os modelos ★ de teste (a nutricao/financeiro) e a anamnese de teste que vai à Lixeira (a marca "hml21 e2e <rodada>"; o
    DELETE por SQL só no staging, só o dono de teste, só a marca); o link antigo, o whatsapp_falhas_vistas_em e o aviso_mensagens_w14 guardados
    e devolvidos por SQL com TRAVA DE FORMATO (só o schema staging, só o id de teste, só a coluna/a chave); o resto pelas MESMAS ações (os
    ajustes, o apelido, o perfil, o nome da conta);
  · as travas (conferidas no --seco): o acesso_criar SÓ com o aluno COM login (ja_tem_acesso — conferido por SQL na hora) ou com a senha de 3
    caracteres (a RPC recusa antes do insert); o acesso_redefinir_senha SÓ no aluno SEM login (sem_conta) ou com 3 caracteres (senha_curta) —
    fora o par do W8b; o equipe_remover SEMPRE com os 2 responsáveis novos = um uuid que não é membro (novo_responsavel_invalido antes de
    qualquer update); o "registrar" do responsável SEMPRE com confirmo false; a Lixeira nunca com o tipo paciente; a escrita no staging só
    nas formas fechadas.
Sem segredo nem dado pessoal na saída: só códigos, contagens, booleanos e tempos (os nomes e e-mails das contas de teste não saem).
"""
from __future__ import annotations

import calendar
import json
import os
import re
import subprocess
import time
from pathlib import Path

import _base as B
import painel21b as P21

C = B.C

NUTRI, PERSONAL, ALUNA, OUTRA = P21.NUTRI, P21.PERSONAL, P21.ALUNA, P21.OUTRA
W8B_PERSONAL, W8B_ALUNO = "w8b-personal", "w8b-aluno"  # o par que existe para a senha nova (e2e/w08b): o P de verdade do redefinir
PROD_PAINEL = "nutri-legado"  # produção, SÓ LEITURA (decisão N)
FALSO = "00000000-0000-4000-8000-0000000000aa"
NAO_MEMBRO = "00000000-0000-4000-8000-0000000000bb"  # o "responsável novo" de TODA remoção: nunca é membro (a trava do equipe_remover)
SENHA_CURTA = "abc"  # 3 caracteres: a RPC recusa (senha_curta/email_invalido/conta_real_no_staging) ANTES de qualquer insert/update
EMAIL_INVALIDO = "sem-arroba"
EMAIL_DE_FORA = "hml21c.recusa@example.com"  # o example.com é reservado (RFC 2606): nenhuma pessoa — conta_real_no_staging
EMAIL_DE_TESTE_NOVO = "hml21c.recusa.teste.claude@physiqnutri.app"  # um e-mail de TESTE (a trava do staging passa) → senha_curta
MODULOS_DO_AVISO = ["dieta"]
TIPO_AVISO_PLANO = "plano_atualizado"  # o aluno_avisar_plano (o insert em avisos: tipo plano_atualizado)
POR_PAGINA_LIXEIRA = 20  # o POR_PAGINA de src/lib/paginacao.ts que a Lixeira usa (o --seco confere)
LIMITE_FILA = 30  # o p.limite ?? 30 da buscarFila (src/painel/mensagens/api.ts — o --seco confere)
CONTEUDO_ANAMNESE = [{"pergunta": "Queixa", "resposta": "teste"}]
# os 6 momentos das mensagens automáticas (o MOMENTOS_WHATSAPP do servidor — o --seco confere): a config de hoje só volta igual com eles
MOMENTOS_WHATSAPP = ("aniversario", "lembrete_vespera", "lembrete_dia", "cobranca_vencendo", "cobranca_vencida", "confirmacao_agendamento")


def marca(rodada: str) -> str:
    return f"{B.MARCA} {rodada}"


# ───────────────────────── o par do W8b (a senha nova de verdade) ─────────────────────────
def email_w8b(conta: str) -> str:
    """O e-mail de teste do par (o EMAIL do e2e/w08b/_base.py — só leitura; o arquivo é da LINUX 3)."""
    return f"{conta.replace('w8b-', 'w8b.')}.teste.claude@physiqnutri.app"


def registrar_par_w8b() -> tuple[bool, str]:
    """Põe o par do W8b no registro de contas (B5.CONTAS) com a senha GUARDADA (~/.physiq-teste-<conta>, 600) — nunca criada aqui (o
    senha_de da W5 criaria uma nova): sem o arquivo, o P de verdade da senha nova PULA. Nada sai na tela."""
    faltam = [k for k in (W8B_PERSONAL, W8B_ALUNO) if not (Path.home() / f".physiq-teste-{k}").exists()]
    if faltam:
        return False, f"sem a senha guardada do par ({', '.join(faltam)})"
    for k in (W8B_PERSONAL, W8B_ALUNO):
        B.B5.CONTAS.setdefault(k, (email_w8b(k), (Path.home() / f".physiq-teste-{k}").read_text(encoding="utf-8").strip()))
    return True, "o par do W8b com a senha guardada"


# ───────────────────────── o aluno de TESTE (SQL só leitura) ─────────────────────────
EMAIL_DE_TESTE_SQL = ("(lower(coalesce(p.email, '')) like '%.teste.claude@physiqnutri.app' or lower(coalesce(p.email, '')) like '%teste.claude@physiqcalc.app' "
                      "or lower(coalesce(p.email, '')) = 'teste@teste.com')")


def sql_alunos_de_teste(s: str, conta: str, uid_nutri: str, uid_aluna: str | None) -> str:
    """Os alunos DE TESTE da conta ativa da nutri (vivos, ativos, o e-mail de teste) — os da w5p-aluna por último (a massa da W-A). Só
    leitura; das linhas só saem os ids e os booleanos."""
    a = C.txt(C.uuid_ok(uid_aluna)) if uid_aluna else "null"
    return (f"select p.id::text as id, p.user_id::text as user_id, (p.user_id is not null) as com_login, "
            f"(nullif(regexp_replace(coalesce(p.telefone, ''), '\\D', '', 'g'), '') is null) as sem_telefone, "
            f"coalesce((p.config->>'mensagens_automaticas')::boolean, false) as msg_auto, (p.user_id is not distinct from {a}::uuid) as da_aluna "
            f"from {s}.pacientes p where p.conta_id = {C.txt(C.uuid_ok(conta))} and p.nutricionista_id = {C.txt(C.uuid_ok(uid_nutri))} "
            f"and p.deleted_at is null and p.ativo and {EMAIL_DE_TESTE_SQL} order by (p.user_id is not distinct from {a}::uuid), p.created_at limit 20")


def alunos_de_teste(s: str, conta: str, uid_nutri: str, uid_aluna: str | None) -> dict:
    """{com_login, sem_login, tela}: o aluno de teste COM login (o card mostra o login; o sino do aviso), o SEM login (as recusas do criar e o
    sem_conta) e o da tela (o com login; senão o sem) — de preferência NÃO a matrícula da w5p-aluna; cada um {id, user_id, sem_telefone,
    msg_auto, da_aluna} ou None."""
    linhas = [x for x in B.ler_principal(sql_alunos_de_teste(s, conta, uid_nutri, uid_aluna)) if C.eh_uuid(x.get("id"))]
    com = next((x for x in linhas if x.get("com_login")), None)
    sem = next((x for x in linhas if not x.get("com_login")), None)
    return {"com_login": com, "sem_login": sem, "tela": com or sem, "n": len(linhas)}


def dados_do_aluno(s: str, aluno: str) -> dict:
    """O nome, o apelido e o link do aluno de teste (SQL só leitura — o P os devolve iguais; NUNCA impressos)."""
    return (B.ler_principal(f"select nome, apelido, link_codigo from {s}.pacientes where id = {C.txt(C.uuid_ok(aluno))}") or [{}])[0]


def msg_auto(s: str, aluno: str) -> bool:
    """O ajuste "Mensagens automáticas" do aluno (o w14_ajuste: sem a chave = false) — SQL só leitura."""
    r = B.ler_principal(f"select coalesce((config->>'mensagens_automaticas')::boolean, false) as v from {s}.pacientes where id = {C.txt(C.uuid_ok(aluno))}")
    return bool((r or [{}])[0].get("v"))


# ───────────────────────── o WhatsApp e o config do profissional (SQL só leitura) ─────────────────────────
def instancia(s: str, uid: str) -> dict:
    """A instância de WhatsApp do profissional: {n, aguardando, conectada} (só contagem)."""
    return (B.ler_principal(f"select count(*)::int as n, count(*) filter (where status = 'aguardando_qr')::int as aguardando, "
                            f"count(*) filter (where status = 'conectado')::int as conectada from {s}.whatsapp_instancias "
                            f"where nutricionista_id = {C.txt(C.uuid_ok(uid))}") or [{}])[0]


def mensagens_abre_sem_gravar(s: str, uid: str) -> tuple[bool, str]:
    """A Mensagens abre SEM gravar? (a whatsapp-conectar(status) CRIA a instância na 1ª visita e renova o pedido_em no aguardando_qr) — só
    com a instância criada e fora do aguardando_qr (SQL só leitura, só contagem)."""
    i = instancia(s, uid)
    if int(i.get("n") or 0) < 1:
        return False, "sem a instância de WhatsApp — abrir a Mensagens a CRIARIA (a whatsapp-conectar(status))"
    if int(i.get("aguardando") or 0):
        return False, "a instância no aguardando_qr — abrir a Mensagens renovaria o pedido_em (GRAVA)"
    return True, "a instância criada e fora do aguardando_qr"


def config_do_perfil(s: str, uid: str) -> dict:
    """As chaves do config do profissional que a 21c devolve: o whatsapp (o JSON inteiro, para comparar), o whatsapp_falhas_vistas_em e o
    aviso_mensagens_w14 (presentes?) — SQL só leitura."""
    r = (B.ler_principal(f"select config->'whatsapp' as whatsapp, config->>'whatsapp_falhas_vistas_em' as falhas_vistas, "
                         f"(config ? 'aviso_mensagens_w14') as tem_aviso_w14, (config ? 'whatsapp_falhas_vistas_em') as tem_falhas "
                         f"from {s}.profiles where id = {C.txt(C.uuid_ok(uid))}") or [{}])[0]
    return r


def mensagem_que_falhou(s: str, uid: str) -> str | None:
    """Uma mensagem de WhatsApp do profissional de teste que FALHOU nos últimos 7 dias (o reenviar só chega ao nao_conectado com ela) —
    SQL só leitura, só o id."""
    r = B.ler_principal(f"select id::text as id from {s}.mensagens_whatsapp where nutricionista_id = {C.txt(C.uuid_ok(uid))} and status = 'falhou' "
                        f"and updated_at > now() - interval '7 days' order by updated_at desc limit 1")
    v = (r[0] if r else {}).get("id")
    return v if C.eh_uuid(v) else None


def sql_remetentes_possiveis(s: str, aluno: str) -> str:
    """Os profissionais que mandariam WhatsApp de VERDADE a este aluno se as mensagens dele ligarem — o enfileirador de hoje
    (whatsapp_enfileirar, a última versão: 20261002090100_h5_agenda_cadastro_aviso_pix.sql) varre quem tem a instância CONECTADA e as
    automáticas LIGADAS (o whatsapp_preferencias dele: sem a chave = desligado) e manda aos alunos de quem é a nutri OU o personal (o
    aniversário), aos da conta de quem é o dono (a mensalidade) e a quem tem consulta/cobrança com ele. Só contagem (SQL só leitura)."""
    a = C.txt(C.uuid_ok(aluno))
    return (f"with pa as (select nutricionista_id, personal_id, conta_id from {s}.pacientes where id = {a}), "
            f"quem as (select nutricionista_id as uid from pa union select personal_id from pa "
            f"union select ct.dono_id from pa join {s}.contas ct on ct.id = pa.conta_id "
            f"union select ag.nutricionista_id from {s}.agendamentos ag where ag.paciente_id = {a} and ag.deleted_at is null "
            f"union select cb.nutricionista_id from {s}.cobrancas cb where cb.paciente_id = {a} and cb.deleted_at is null) "
            f"select count(distinct p.id)::int as n from quem q join {s}.profiles p on p.id = q.uid "
            f"join {s}.whatsapp_instancias w on w.nutricionista_id = p.id and w.status = 'conectado' "
            f"where ({s}.whatsapp_preferencias(p.config) ->> 'ativo')::boolean")


def sem_mensagem_de_verdade(s: str, aluno: str) -> tuple[bool, str]:
    """🟡4 da revisão: ligar as "Mensagens automáticas" de um aluno de teste (o ajuste ou a faixa) só quando NENHUMA mensagem de verdade pode
    entrar na fila: o aluno SEM destino (o whatsapp_destino(telefone) do enfileirador nulo) ou 0 remetente possível (a nutri, o personal, o
    dono e quem tem consulta/cobrança com ele — nenhum com a instância conectada E as automáticas ligadas). → (seguro, motivo); SQL só leitura."""
    r = B.ler_principal(f"select ({s}.whatsapp_destino(telefone) is null) as sem_destino from {s}.pacientes where id = {C.txt(C.uuid_ok(aluno))}")
    if not r:
        return False, "o aluno de teste não foi achado (SQL só leitura)"
    if r[0].get("sem_destino") is True:
        return True, "o aluno de teste sem telefone (sem destino: nada entra na fila)"
    n = int((B.ler_principal(sql_remetentes_possiveis(s, aluno)) or [{}])[0].get("n") or 0)
    if n == 0:
        return True, ("o aluno com telefone e 0 remetente possível (a nutri, o personal, o dono e quem tem consulta/cobrança com ele: nenhum com a "
                      "instância conectada E as automáticas ligadas)")
    return False, f"{n} remetente(s) possível(eis) com a instância conectada e as automáticas ligadas (a nutri, o personal, o dono ou quem tem consulta/cobrança)"


# ───────────────────────── a escrita no staging: SÓ as formas fechadas (decisão I) ─────────────────────────
_U = r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
_INST = r"'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)'"
FORMAS_DA_ESCRITA_21C = (
    # o link antigo do aluno de teste de volta (o molde do --devolver-sino da 21a): só o schema staging, só o id dele, só a coluna
    re.compile(rf"update staging\.pacientes set link_codigo = '[A-Za-z0-9_-]{{6,64}}' where id = {_U};"),
    # o whatsapp_falhas_vistas_em de antes de volta (ou fora, se não tinha) — só o profiles do profissional de teste, só a chave
    re.compile(rf"update staging\.profiles set config = jsonb_set\(config, '\{{whatsapp_falhas_vistas_em\}}', to_jsonb\({_INST}::text\)\) where id = {_U};"),
    re.compile(rf"update staging\.profiles set config = config - 'whatsapp_falhas_vistas_em' where id = {_U};"),
    # o aviso da faixa (a chave aviso_mensagens_w14) fora — só se não tinha antes
    re.compile(rf"update staging\.profiles set config = config - 'aviso_mensagens_w14' where id = {_U};"),
    # a massa da rodada (os modelos ★ e a anamnese da Lixeira): só os ids anotados, só o dono de teste, só a marca
    re.compile(rf"delete from staging\.(modelos_anamnese|modelos_recibo|anamneses) where nutricionista_id = {_U} and id = any\(array\[{_U}(, {_U})*\]::uuid\[\]\) "
               rf"and (titulo) like '%hml21 e2e%';"),
)
TABELAS_DA_MASSA_21C = {"modelos_anamnese": "titulo", "modelos_recibo": "titulo", "anamneses": "titulo"}


def sql_escrever_staging_21c(sql: str) -> None:
    """A escrita da 21c SÓ no schema staging e SÓ nas formas fechadas (FORMAS_DA_ESCRITA_21C: 1 instrução, o id de teste, a coluna/a chave
    ou a marca): o sqlrw.py com PERMITIR_ESCRITA=1 e o --confirmo, pelo com_pat.py — o resto é recusado ANTES de sair."""
    if re.search(r"\bpublic\.", sql) or sql.count(";") != 1 or not any(f.fullmatch(sql.strip()) for f in FORMAS_DA_ESCRITA_21C):
        raise SystemExit("escrita fora do combinado da 21c (só o staging, só as formas fechadas) — recusado")
    env = dict(os.environ, PERMITIR_ESCRITA="1")
    r = subprocess.run(["python3", str(B.COM_PAT), "python3", str(B.SQLRW), B.PRINCIPAL_REF, "--confirmo"], input=sql.strip(), capture_output=True,
                       text=True, env=env, timeout=180)
    if r.returncode != 0 or "status 20" not in r.stdout:
        raise RuntimeError(f"sqlrw (staging): {(r.stdout + r.stderr).strip()[:200]}")


def sql_devolver_link(s: str, aluno: str, codigo: str) -> str:
    if s != "staging" or not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", codigo or ""):
        raise SystemExit("o link só volta no staging, com o código no formato")
    return f"update staging.pacientes set link_codigo = {C.txt(codigo)} where id = {C.txt(C.uuid_ok(aluno))};"


def sql_devolver_falhas_vistas(s: str, uid: str, antes: str | None) -> str:
    if s != "staging":
        raise SystemExit("o config só volta no staging")
    u = C.txt(C.uuid_ok(uid))
    if antes is None:
        return f"update staging.profiles set config = config - 'whatsapp_falhas_vistas_em' where id = {u};"
    if not re.fullmatch(_INST.strip("'"), antes):
        raise SystemExit("o whatsapp_falhas_vistas_em de antes fora do formato")
    return f"update staging.profiles set config = jsonb_set(config, '{{whatsapp_falhas_vistas_em}}', to_jsonb({C.txt(antes)}::text)) where id = {u};"


def sql_tirar_aviso_w14(s: str, uid: str) -> str:
    if s != "staging":
        raise SystemExit("o config só volta no staging")
    return f"update staging.profiles set config = config - 'aviso_mensagens_w14' where id = {C.txt(C.uuid_ok(uid))};"


def sql_apagar_massa_21c(s: str, tabela: str, dono: str, ids: list[str]) -> str:
    if s != "staging" or tabela not in TABELAS_DA_MASSA_21C:
        raise SystemExit("a massa da 21c só existe no staging, nas 3 tabelas")
    validos = [C.uuid_ok(i) for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id anotado")
    return (f"delete from staging.{tabela} where nutricionista_id = {C.txt(C.uuid_ok(dono))} and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[]) "
            f"and {TABELAS_DA_MASSA_21C[tabela]} like {C.txt('%' + B.MARCA + '%')};")


def sql_contar_massa_21c(s: str) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-21 nas 3 tabelas da massa da 21c (vivas e na Lixeira)."""
    return "select " + ", ".join(f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + B.MARCA + '%')})::int as {t}"
                                 for t, c in TABELAS_DA_MASSA_21C.items())


# ───────────────────────── o Estado (a chave "hml21c") ─────────────────────────
def _massa(estado) -> dict:
    m = estado.d.get(B.CHAVE_21C)
    if not isinstance(m, dict):
        m = {}
        estado.d[B.CHAVE_21C] = m
    for k in ("linhas", "avisos"):
        m.setdefault(k, [])
    m.setdefault("devolver", {})
    return m


def anotar_linha(estado, tabela: str, id_: object, dono: object) -> None:
    """Uma linha DE TESTE que a rodada criou (na hora): o fechar/--limpar apaga (só o dono de teste, só a marca)."""
    m = _massa(estado)
    if tabela in TABELAS_DA_MASSA_21C and C.eh_uuid(id_) and C.eh_uuid(dono) and [tabela, id_, dono] not in m["linhas"]:
        m["linhas"].append([tabela, id_, dono])
        estado.salvar()


def anotar_devolver(estado, chave: str, valor: object) -> None:
    """O valor de ANTES de uma coisa que a rodada muda (o link, o config, os ajustes, o apelido, o perfil, o nome da conta, a senha do
    W8b) — ANTES de mudar: o fechar/--limpar devolve mesmo se a rodada cair no meio."""
    m = _massa(estado)
    m["devolver"][chave] = valor
    estado.salvar()


def devolvido(estado, chave: str) -> None:
    m = _massa(estado)
    m["devolver"].pop(chave, None)
    estado.salvar()


def anotar_avisos(estado, destino: str, ids: list[str]) -> None:
    m = _massa(estado)
    novos = [[destino, i] for i in ids if C.eh_uuid(i) and [destino, i] not in m["avisos"]]
    if novos:
        m["avisos"].extend(novos)
        estado.salvar()


def sql_avisos_do_plano(s: str, destino: str, t0: str, t1: str) -> str:
    """Os avisos "plano atualizado" que o aluno_avisar_plano pôs no sino do aluno de TESTE DENTRO do intervalo da ação [t0, t1] (o destino de
    teste + o tipo + o intervalo — o ⚪8 da 21b)."""
    if not (isinstance(t0, str) and t0 and isinstance(t1, str) and t1):
        raise SystemExit("os avisos da rodada pedem o intervalo [t0, t1]")
    return (f"select id::text as id from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(destino))} and tipo = {C.txt(TIPO_AVISO_PLANO)} "
            f"and criado_em >= {C.txt(t0)}::timestamptz and criado_em <= {C.txt(t1)}::timestamptz")


def abrir_rodada_21c(o, s: str, area: str):
    """A rodada da 21c: a mesma regra da 21a/21b/21d (recusa se há outra pendente, de qualquer W) com a área "hml21c"."""
    B.usar_area(area)
    estado = B.abrir_rodada(o, s)
    _massa(estado)
    estado.salvar()
    return estado


def devolver_por_sql(o, estado, s: str) -> None:
    """O que volta por SQL com trava de formato: o link, o whatsapp_falhas_vistas_em e o aviso_mensagens_w14 (só no staging)."""
    dv = _massa(estado)["devolver"]
    if "link" in dv:
        aluno, codigo = dv["link"]
        if dados_do_aluno(s, aluno).get("link_codigo") != codigo:
            sql_escrever_staging_21c(sql_devolver_link(s, aluno, codigo))
        ok = dados_do_aluno(s, aluno).get("link_codigo") == codigo
        if o.ok(ok, "limpeza (21c): o link do aluno de teste de volta (SQL com trava de formato; conferido só leitura)", parar=False):
            devolvido(estado, "link")
    if "falhas_vistas" in dv:
        uid, antes = dv["falhas_vistas"]
        agora = config_do_perfil(s, uid)
        if (agora.get("falhas_vistas") if agora.get("tem_falhas") else None) != antes:
            sql_escrever_staging_21c(sql_devolver_falhas_vistas(s, uid, antes))
        agora = config_do_perfil(s, uid)
        if o.ok((agora.get("falhas_vistas") if agora.get("tem_falhas") else None) == antes,
                "limpeza (21c): o whatsapp_falhas_vistas_em de antes de volta (SQL com trava de formato)", parar=False):
            devolvido(estado, "falhas_vistas")
    if "aviso_w14" in dv:
        uid = dv["aviso_w14"]
        if config_do_perfil(s, uid).get("tem_aviso_w14"):
            sql_escrever_staging_21c(sql_tirar_aviso_w14(s, uid))
        if o.ok(not config_do_perfil(s, uid).get("tem_aviso_w14"), "limpeza (21c): a chave aviso_mensagens_w14 fora do config (como antes)", parar=False):
            devolvido(estado, "aviso_w14")


def devolver_pelas_acoes(o, estado, s: str, L) -> None:
    """O que volta pela MESMA ação (com a sessão guardada da conta): os ajustes e o apelido do aluno, o perfil e o nome da conta. 🟡1 da
    revisão: toda ação com o x-schema = `s` (o schema GRAVADO no Estado — nunca o da linha de comando: um --limpar com outra base gravaria
    no schema errado)."""
    dv = _massa(estado)["devolver"]
    if "ajustes" in dv:
        aluno, valor = dv["ajustes"]
        if msg_auto(s, aluno) != valor:
            B.conta(L.token(NUTRI), "aluno_ajustes_salvar", {"aluno": aluno, "ajustes": {"mensagens_automaticas": bool(valor)}}, schema_=s)
        if o.ok(msg_auto(s, aluno) == valor, "limpeza (21c): as Mensagens automáticas do aluno de teste como antes (a MESMA ação)", parar=False):
            devolvido(estado, "ajustes")
    if "apelido" in dv:
        aluno, apelido = dv["apelido"]
        d = dados_do_aluno(s, aluno)
        if d.get("apelido") != apelido:
            B.conta(L.token(NUTRI), "aluno_dados_salvar", {"aluno": aluno, "dados": {"nome": d.get("nome"), "apelido": apelido}}, schema_=s)
        if o.ok(dados_do_aluno(s, aluno).get("apelido") == apelido, "limpeza (21c): o apelido do aluno de teste como antes (a MESMA ação)", parar=False):
            devolvido(estado, "apelido")
    if "perfil" in dv:
        conta_p, campo, valor = dv["perfil"]
        uid = L.uid(conta_p)
        if dado_do_perfil(s, uid, campo) != valor:
            B.conta(L.token(conta_p), "perfil_salvar", corpo_do_perfil(s, uid, {campo: valor}), schema_=s)
        if o.ok(dado_do_perfil(s, uid, campo) == valor, f"limpeza (21c): o perfil ({campo}) como antes (a MESMA ação)", parar=False):
            devolvido(estado, "perfil")
    if "conta_nome" in dv:
        conta_p, conta_id, nome = dv["conta_nome"]
        if nome_da_conta(s, conta_id) != nome:
            B.conta(L.token(conta_p), "conta_salvar", {"conta": conta_id, "nome": nome}, schema_=s)
        if o.ok(nome_da_conta(s, conta_id) == nome, "limpeza (21c): o nome da conta de teste como antes (a MESMA ação)", parar=False):
            devolvido(estado, "conta_nome")


PAROU_SENHA_W8B = ("## PAROU limpeza (21c): o w8b-aluno ficou com a senha provisória (o app pede \"crie a sua senha\" a ele) — o Estado fica com a "
                   "pendência: a sessão principal decide (depois de resolver, o api.py --area <a da 21c> --limpar confere e solta o Estado)")


def devolver_senha_w8b(o, estado, s: str, L) -> None:
    """🟡2 da revisão: a marca de senha provisória do w8b-aluno (o P de verdade do acesso_redefinir_senha, anotada ANTES do redefinir) volta
    pelo senha_definida da 21a com a sessão do PRÓPRIO aluno (a guardada caiu com o redefinir → 401 → o login de novo, contado no teto). Já
    sem a marca (SQL só leitura) → nada a devolver. Não voltou → a falha com o "## PAROU" (o Estado fica com a pendência)."""
    dv = _massa(estado)["devolver"]
    if "senha_w8b" not in dv:
        return
    uid_r = dv["senha_w8b"]
    if not C.eh_uuid(uid_r):
        o.ok(False, PAROU_SENHA_W8B + " (o id anotado fora do formato)", parar=False)
        return
    if not senha_provisoria(s, uid_r):
        o.linha("   (limpeza (21c): o w8b-aluno sem a marca de senha provisória — nada a devolver)")
        devolvido(estado, "senha_w8b")
        return
    ok_par, st = registrar_par_w8b()
    if ok_par:
        for _vez in (1, 2):
            try:
                st, _r, _h, _ms = B.conta(L.token(W8B_ALUNO), "senha_definida", {}, schema_=s)
            except (Exception, SystemExit) as e:  # noqa: BLE001 — o teto de logins, a rede: cai no PAROU
                st = f"{type(e).__name__}: {str(e)[:120]}"
                break
            if st != 401:
                break
            L.d.pop(W8B_ALUNO, None)  # a sessão guardada caiu com o redefinir: o login de novo (contado)
    if o.ok(not senha_provisoria(s, uid_r), f"limpeza (21c): o w8b-aluno sem a marca de senha provisória, como antes (o senha_definida dele; SQL só "
                                            f"leitura) ({st})", parar=False):
        devolvido(estado, "senha_w8b")
    else:
        o.ok(False, PAROU_SENHA_W8B, parar=False)


def senha_provisoria(s: str, uid: str) -> bool:
    """A marca de senha provisória do login (o raw_app_meta_data) — SQL só leitura."""
    r = B.ler_principal(f"select coalesce((raw_app_meta_data->>'senha_provisoria')::boolean, false) as v from auth.users where id = {C.txt(C.uuid_ok(uid))}")
    return bool((r or [{}])[0].get("v"))


def limpar_massa_21c(o, estado, s: str, L) -> None:
    """Desfaz a rodada da 21c (no fim ou no --limpar): os avisos anotados (o DELETE por id, só o destino de teste — o da 21a), a massa
    (modelos ★ e a anamnese da Lixeira: só os ids anotados, o dono de teste, a marca), o que volta por SQL e o que volta pela MESMA ação —
    conferido por SQL só leitura, só contagem. Só no staging (o schema GRAVADO no Estado — o ⚪8 da 21b)."""
    m = estado.d.get(B.CHAVE_21C)
    if not isinstance(m, dict):
        return
    s = estado.d.get("schema") or s
    if s != "staging":
        if any(m.get(k) for k in ("linhas", "avisos", "devolver")):
            o.ok(False, f"limpeza (21c): massa anotada num Estado de schema {s} (a massa só nasce no staging) — nada apagado; confira à mão", parar=False)
            return
        estado.d.pop(B.CHAVE_21C, None)
        estado.salvar()
        return
    try:
        try:
            devolver_pelas_acoes(o, estado, s, L)
        finally:
            devolver_senha_w8b(o, estado, s, L)  # 🟡2: a senha provisória do w8b-aluno (antes da conferência final do Estado)
    finally:
        devolver_por_sql(o, estado, s)
    por_destino: dict[str, list[str]] = {}
    for d, i in m.get("avisos") or []:
        if C.eh_uuid(d) and C.eh_uuid(i):
            por_destino.setdefault(d, []).append(i)
    for d, ids in por_destino.items():
        B.sql_escrever_staging(B.sql_apagar_avisos(s, d, ids))
    sobra_av = sum(int(B.ler_principal(f"select count(*)::int as n from {s}.avisos where destino_user_id = {C.txt(d)} "
                                       f"and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])")[0]["n"]) for d, ids in por_destino.items())
    por: dict[tuple[str, str], list[str]] = {}
    for t, i, d in m.get("linhas") or []:
        por.setdefault((t, d), []).append(i)
    for (t, d), ids in por.items():
        sql_escrever_staging_21c(sql_apagar_massa_21c(s, t, d, ids))
    sobra = B.ler_principal(sql_contar_massa_21c(s))[0]
    total = sum(int(v or 0) for v in sobra.values())
    if o.ok(total == 0 and sobra_av == 0 and not _massa(estado)["devolver"],
            f"limpeza (21c) conferida (SQL só leitura): {sum(len(v) for v in por_destino.values())} aviso(s) do plano apagado(s) (sobra {sobra_av}); "
            f"0 linha com a marca nas 3 tabelas da massa ({sobra}); nada a devolver ({sorted(_massa(estado)['devolver']) or '—'})", parar=False):
        estado.d.pop(B.CHAVE_21C, None)
        estado.salvar()


def fechar_rodada_21c(o, estado, s: str, L) -> None:
    """O fim da rodada da 21c (no finally — o SIGTERM vira SystemExit e passa aqui): a foto do profissional (a 21a), a massa e o que volta
    (inclusive a senha provisória do w8b-aluno — o devolver_senha_w8b, 🟡2; não voltou → "## PAROU"); o Estado só some com tudo desfeito
    (senão fica para o api.py --area <a da 21c> --limpar). Só no staging (o schema GRAVADO no Estado; o --limpar recusa a produção — 🟡1)."""
    try:
        B.limpar_foto(o, estado, s, L, conta=NUTRI)
    finally:
        limpar_massa_21c(o, estado, s, L)
    if estado.vazio() and not B.tem_massa_21c(estado) and not estado.d.get("hml21_foto") and not estado.d.get("hml21_push"):
        estado.apagar()
    else:
        o.ok(False, "o Estado ficou com pendência (a 21c): rode o api.py --area <a da 21c> --limpar", parar=False)


# ───────────────────────── o perfil e a conta (o P pela MESMA ação) ─────────────────────────
CAMPOS_DO_PERFIL = ("registro", "whatsapp_e164", "telefone", "endereco", "cidade", "uf", "cref", "crn")  # o CAMPOS_DOS_DADOS_DO_PERFIL (o --seco confere)


def perfil(s: str, uid: str) -> dict:
    return (B.ler_principal(f"select nome, tipo_perfil, area_outra, dados_profissionais from {s}.profiles where id = {C.txt(C.uuid_ok(uid))}") or [{}])[0]


def dado_do_perfil(s: str, uid: str, campo: str) -> object:
    d = perfil(s, uid).get("dados_profissionais")
    return d.get(campo) if isinstance(d, dict) else None


def corpo_do_perfil(s: str, uid: str, mudar: dict) -> dict:
    """O corpo do perfil_salvar como o Perfil.tsx manda (o nome, o tipo, a área e as chaves do dados_profissionais que o form edita) com os
    valores de HOJE e só `mudar` por cima — o servidor põe as do form por cima do JSON atual."""
    p = perfil(s, uid)
    d = p.get("dados_profissionais") if isinstance(p.get("dados_profissionais"), dict) else {}
    dados = {k: d.get(k) for k in CAMPOS_DO_PERFIL if k in d}
    dados.update(mudar)
    return {"nome": p.get("nome") or "", "tipo_perfil": p.get("tipo_perfil"), "area_outra": p.get("area_outra"), "dados": dados}


def nome_da_conta(s: str, conta_id: str) -> str | None:
    return (B.ler_principal(f"select nome from {s}.contas where id = {C.txt(C.uuid_ok(conta_id))}") or [{}])[0].get("nome")


def papel_na_conta(s: str, conta_id: str, uid: str) -> dict:
    """O lugar de quem chama na conta de teste (SQL só leitura, só booleanos/contagem): {dona: contas.dono_id = o uid, papel_dono: 'dono' nos
    papéis do membro ativo, membro: tem a linha ativa}; {} = a conta não existe."""
    u = C.txt(C.uuid_ok(uid))
    return (B.ler_principal(f"select (c.dono_id is not distinct from {u}::uuid) as dona, coalesce(bool_or('dono' = any(m.papeis)), false) as papel_dono, "
                            f"count(m.id)::int as membro from {s}.contas c left join {s}.conta_membros m on m.conta_id = c.id and m.user_id = {u}::uuid "
                            f"and m.status = 'ativo' where c.id = {C.txt(C.uuid_ok(conta_id))} group by c.dono_id") or [{}])[0]


def nao_dona(s: str, conta_id: str, uid: str) -> tuple[bool, str]:
    """🟡3 da revisão: os P que supõem a nutri SEM ser dona (o conta_salvar → 404 e o equipe_papeis → so_dono) só com a prova por SQL só
    leitura — o contas.dono_id ≠ o uid dela e o 'dono' fora dos papéis dela; sendo dona, a "recusa" GRAVARIA (o nome com a marca; os papéis
    dela — o que sai tira os alunos). → (pode, motivo)."""
    p = papel_na_conta(s, conta_id, uid)
    if not p:
        return False, "a conta de teste não foi achada (SQL só leitura)"
    if p.get("dona") or p.get("papel_dono"):
        return False, "a nutri de teste é DONA da conta (o contas.dono_id ou o papel dono) — a recusa esperada gravaria"
    return True, "a nutri não é dona (o contas.dono_id ≠ o uid dela e o papel dono fora dos papéis — SQL só leitura)"


def sem_nulos(d: object) -> object:
    """O dados_profissionais sem as chaves nulas (o form manda as que edita: a chave que não existia volta como null — o mesmo valor)."""
    return {k: v for k, v in d.items() if v is not None} if isinstance(d, dict) else d


def conjunto_fundo(v: object) -> object:
    """Uma lista SEM ordem (em qualquer nível — a receita ★ e os ingredientes dela) vira o conjunto (as formas canônicas ordenadas)."""
    if isinstance(v, dict):
        return {k: conjunto_fundo(x) for k, x in v.items()}
    if isinstance(v, list):
        return sorted((B.canonico(conjunto_fundo(x)) for x in v), key=str)
    return v


# ───────────────────────── as telas (rede.py e telas.py) ─────────────────────────
# a ENTRADA do painel: uma tela de fora da 21c que não grava ao abrir (o Dashboard, da 21b — a casca e a sessão chegam aqui; a carga fria
# fica fora da medida da 1ª tela)
ENTRADA_PAINEL = "/painel"
# (tela, como abrir, o seletor do "pronto", o teto de `ler` POR FUNÇÃO no depois). Como abrir: ("rota", r) pela navegação do app ({aluno} =
# o aluno de teste). Os Modelos: 3 pedidos EM PARALELO (a DECISÃO 21:06 — os 9 ★ num `ler` da nutricao ∥ os planos ★ no lote só deles ∥ os
# recibos ★ num `ler` da financeiro): a nutricao 2, a financeiro 1, 0 série.
RESUMO = ("aluno_resumo", ("rota", "/painel/alunos/{aluno}"), '[data-card-ajustes-aluno]:not([data-card-ajustes-aluno="carregando"])', {"conta": 1})
ACESSOS = ("aluno_acessos", ("rota", "/painel/alunos/{aluno}/acessos"), '[data-card-acesso-aluno]:not([data-acesso-estado="carregando"])', {"conta": 1})
PERFIL = ("config_perfil", ("rota", "/painel/configuracoes/perfil"), "[data-form-perfil]", {"conta": 1})
CONTA = ("config_conta", ("rota", "/painel/configuracoes/conta"), '[data-form-conta], [data-config-aba="conta"][data-estado-aba="vazio"]', {"conta": 1})
EQUIPE = ("config_equipe", ("rota", "/painel/configuracoes/equipe"), '[data-config-aba="equipe"][data-equipe-bloqueio]', {"conta": 1})
CONVITE = ("config_convite", ("rota", "/painel/configuracoes/convite"), '[data-convite-link], [data-config-aba="convite"][data-estado-aba="vazio"]', {"conta": 1})
EXCLUIR = ("config_excluir", ("rota", "/painel/configuracoes/excluir-conta"), '[data-config-aba="excluir-conta"] [data-exclusao-conta]', {"conta": 1})
MENSAGENS = ("mensagens", ("rota", "/painel/mensagens"), "[data-pagina-mensagens][data-whatsapp-situacao]", {"conta": 1})
LIXEIRA = ("lixeira", ("rota", "/painel/lixeira"), '[data-pagina-lixeira][data-carregando="0"]', {"conta": 1})
MODELOS = ("modelos", ("rota", "/painel/modelos"), '[data-pagina-modelos][data-carregando="0"]', {"nutricao": 2, "financeiro": 1})
TELAS_DA_AREA = {"aluno": (ACESSOS, RESUMO), "configuracoes": (PERFIL, CONTA, EQUIPE, CONVITE, EXCLUIR), "mensagens": (MENSAGENS,),
                 "lixeira": (LIXEIRA,), "modelos": (MODELOS,)}
TODAS_AS_TELAS = (ACESSOS, RESUMO, PERFIL, CONTA, EQUIPE, CONVITE, EXCLUIR, MENSAGENS, LIXEIRA, MODELOS)
# o que abre a tela e NÃO é gravação da tela (contado à parte): a ação acesso_ler da aba Acessos (decisão 13) e a whatsapp-conectar(status)
# da Mensagens (a função que fica; decisão 23 — na Guarda, gravação)
A_PARTE = {"aluno_acessos": ("fn:conta(acesso_ler)",), "mensagens": ("fn:whatsapp-conectar",)}
SELETORES = {
    "src/painel/aluno/resumo/CardAjustesAluno.tsx": ['data-card-ajustes-aluno={p ? p.paciente_id : "carregando"}'],
    "src/painel/aluno/resumo/acesso/CardAcessoAluno.tsx": ['data-card-acesso-aluno data-acesso-estado={q.isLoading ? "carregando" : estado}'],
    "src/painel/aluno/catalogoAbas.ts": ['rota: "acessos"'],
    "src/painel/configuracoes/Perfil.tsx": ['data-config-aba="perfil"', "data-form-perfil"],
    "src/painel/configuracoes/Conta.tsx": ['data-config-aba="conta" data-estado-aba="vazio"', "data-form-conta"],
    "src/painel/configuracoes/Equipe.tsx": ['data-config-aba="equipe" data-equipe-bloqueio={equipe.bloqueio ?? "nenhum"}'],
    "src/painel/configuracoes/Convite.tsx": ['data-config-aba="convite" data-estado-aba="vazio"', "data-convite-link"],
    "src/painel/configuracoes/ExcluirConta.tsx": ['data-config-aba="excluir-conta"'],
    "src/painel/configuracoes/excluirConta/FluxoExclusao.tsx": ["data-exclusao-conta={c.nome}"],
    "src/painel/paginas/Mensagens.tsx": ["data-pagina-mensagens data-whatsapp-situacao={a.situacao}"],
    "src/painel/paginas/Lixeira.tsx": ["data-pagina-lixeira", 'data-carregando={consulta.isLoading ? "1" : "0"}'],
    "src/painel/paginas/Modelos.tsx": ["data-pagina-modelos", 'data-carregando={consulta.isLoading || !pronto ? "1" : "0"}'],
    "src/lib/paginacao.ts": [f"POR_PAGINA = {POR_PAGINA_LIXEIRA}"],
    "src/ferramentas/lixeira/dados.ts": ["offset: deslocamento(p.pagina), limite: POR_PAGINA"],
    "src/painel/mensagens/api.ts": [f"limite: p.limite ?? {LIMITE_FILA}"],
}


def telas_da_conta(area: str, conta: str) -> list[tuple]:
    """As telas que cada conta abre na área, NA ORDEM: a nutri — todas da área; o dono (personal) — o Perfil (o espelho no Treino) e os
    Modelos (a aba Treinos); a nutri-legado (produção) — o Perfil, a Conta, a Equipe e o Convite (este, só com o código), a Lixeira e os
    Modelos (decisão N: o Excluir, a Mensagens, o Resumo e a aba Acessos PULAM)."""
    if conta == PROD_PAINEL:
        return {"configuracoes": [PERFIL, CONTA, EQUIPE, CONVITE], "lixeira": [LIXEIRA], "modelos": [MODELOS]}.get(area, [])
    if conta == PERSONAL:
        return {"configuracoes": [PERFIL], "modelos": [MODELOS]}.get(area, [])
    return list(TELAS_DA_AREA.get(area, ()))


def contas_da_area(area: str, base: str) -> list[str]:
    """As contas de cada área (a produção, decisão N: a nutri-legado — NUNCA as do staging; a Mensagens e o Aluno não abrem na produção)."""
    if base == "prod":
        return [PROD_PAINEL] if area in ("configuracoes", "lixeira", "modelos") else []
    return [NUTRI, PERSONAL] if area in ("configuracoes", "modelos") else [NUTRI]


PULAM_NA_PRODUCAO = {
    "aluno": "o Resumo e a aba Acessos (a nutri-legado sem aluno de TESTE vivo; a aba Acessos abre pela AÇÃO acesso_ler, que a Guarda barra)",
    "mensagens": "a Mensagens (abrir chama a whatsapp-conectar(status) — gravação na Guarda, decisão 23; o `ler` dela: api.py --area mensagens --so-leitura)",
    "config_excluir": "o Excluir minha conta (nada da 21c roda ao abrir — o ZIP é clique; a conferência vai pela excluir-minha-conta)",
}


def telas_que_abrem(o, s: str, base: str, area: str, conta: str, uid: str | None = None, aluno: str | None = None) -> list[tuple]:
    """As telas da conta que abrem SEM gravar (em toda base): o Convite só com o codigo_convite da conta ativa; a Mensagens só com a
    instância criada e fora do aguardando_qr; o Resumo/a aba Acessos só com o aluno de teste. Na produção, a trava da decisão N. SQL só
    leitura (sem login); sem a pré-condição, a tela é PULADA com o motivo (nunca deixa a gravação sair)."""
    if base == "prod" and conta != PROD_PAINEL:
        raise SystemExit("na produção só a nutri-legado (decisão N)")
    if base != "prod" and conta == PROD_PAINEL:
        raise SystemExit("a nutri-legado é só da produção")
    telas = telas_da_conta(area, conta)
    if base == "prod":
        if area in PULAM_NA_PRODUCAO:
            o.ok(True, f"[prod] {conta}: PULADO — {PULAM_NA_PRODUCAO[area]}")
            return []
        if area == "configuracoes":
            o.linha(f"   [prod] {conta}: o Excluir PULA — {PULAM_NA_PRODUCAO['config_excluir']}")
    uid = uid or B.uid_da_conta(conta)
    if any(x[0] == "config_convite" for x in telas):
        c = P21.conta_ativa(P21.situacao_como(s, uid, conta)) if uid else None
        if c is None or not c.get("codigo_convite"):
            o.ok(True, f"[{base}] {conta}: o Convite PULADO — a conta ativa sem codigo_convite (abrir chamaria o garantir_meu_codigo: GRAVA)")
            telas = [x for x in telas if x[0] != "config_convite"]
    if any(x[0] == "mensagens" for x in telas):
        abre, motivo = mensagens_abre_sem_gravar(s, uid) if uid else (False, "a conta não existe nesta base")
        if not abre:
            o.ok(True, f"[{base}] {conta}: a Mensagens PULADA — {motivo} (SQL só leitura, só contagem; nada aberto)")
            telas = [x for x in telas if x[0] != "mensagens"]
        else:
            o.linha(f"   [{base}] {conta}: a Mensagens abre sem gravar ({motivo})")
    if area == "aluno":
        if not C.eh_uuid(aluno):
            o.ok(True, f"[{base}] {conta}: o Resumo e a aba Acessos PULADOS — sem aluno de teste na conta ativa (SQL só leitura)")
            return []
        telas = [(n, (como, alvo.format(aluno=aluno)), sel, teto) for n, (como, alvo), sel, teto in telas]
    return telas


def antes_da_spec(conta: str) -> dict[str, float | None]:
    return P21.antes_da_spec(conta)


ROTA_DA_SPEC = {"aluno_resumo": "/painel/alunos/:id", "config_perfil": "/painel/configuracoes/perfil", "config_conta": "/painel/configuracoes/conta",
                "config_equipe": "/painel/configuracoes/equipe", "config_convite": "/painel/configuracoes/convite",
                "config_excluir": "/painel/configuracoes/excluir-conta", "mensagens": "/painel/mensagens", "lixeira": "/painel/lixeira",
                "modelos": "/painel/modelos"}


def fase_do_codigo_21c(base: str, commit: str) -> str:
    """depois = o commit medido lê a Lixeira pela conta (src/ferramentas/lixeira/dados.ts com o lerConta); antes = o código antigo (lia
    direto). Um commit que este repo não tem (o staging serve outra branch) é ANTES (o critério da 21a/21b)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:src/ferramentas/lixeira/dados.ts"], capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        return "antes"
    return "depois" if "lerConta(" in r.stdout else "antes"


# ───────────────────────── a contagem de cada tela (rede.py) ─────────────────────────
def chamada_da_funcao(p: dict, funcao: str) -> str | None:
    """A chamada a uma função (POST): "ler" ou o nome da ação — o `acao` do corpo (o jeito 2) ou o `action` (as funções de antes, ex.: a
    treino-leitura); o OPTIONS fora."""
    if p.get("tipo") != "fn" or p.get("nome") != funcao or p.get("metodo") != "POST":
        return None
    try:
        b = json.loads(p.get("corpo") or "{}")
    except Exception:  # noqa: BLE001
        return "?"
    a = (b.get("acao") or b.get("action")) if isinstance(b, dict) else None
    return str(a) if isinstance(a, str) else "?"


def outras_areas(area: str) -> tuple[str, ...]:
    return tuple(a for a in B.AREAS_DA_21C if a != area)


# as funções DA ÁREA em cada tela (o teto de `ler` e as ações ao abrir): a conta nas 4 áreas dela; a nutricao e a financeiro nos Modelos (os ★).
# As OUTRAS funções que a tela chama (ex.: no Resumo, a aluno-dia do card Rotinas da W-A P6, a nutricao/a pagamentos-aluno/a treino-leitura dos
# outros cards; na Mensagens, a whatsapp-conectar; no Excluir, a excluir-minha-conta) são "de fora" — listadas à parte, nunca na conta da área.
FUNCOES_DA_AREA = {"modelos": ("nutricao", "financeiro")}


def funcoes_da_area(area: str) -> tuple[str, ...]:
    return FUNCOES_DA_AREA.get(area, ("conta",))


def contar_tela(pedidos: list[dict], area: str, tela: str) -> dict:
    """O que a guarda CONTA numa tela da 21c: as diretas da área (têm de ser 0 depois), o `ler` de cada função DA ÁREA (e as consultas) e as
    ações de qualquer função do jeito 2 ao abrir, as diretas das OUTRAS áreas da 21c e as de fora (de outra W: as tabelas/RPCs diretas e as
    chamadas às OUTRAS funções — à parte) e as gravações ao abrir — fora o que é da tela por desenho (A_PARTE: o acesso_ler da aba Acessos e
    a whatsapp-conectar da Mensagens)."""
    from collections import Counter  # noqa: PLC0415
    diretas = Counter(x for x in (B.direta(p, area) for p in pedidos) if x)
    da_area = funcoes_da_area(area)
    ler: dict[str, int] = {}
    acoes: dict[str, int] = {}
    consultas: Counter = Counter()
    fora_fn: Counter = Counter()
    for p in pedidos:
        nome = p.get("nome") if p.get("tipo") == "fn" else None
        ch = chamada_da_funcao(p, nome) if nome else None
        if not ch:
            continue
        if nome in da_area and ch == "ler":
            ler[nome] = ler.get(nome, 0) + 1
            consultas.update(f"{nome}:{q}" for q in B.B20.consultas_do_corpo(p.get("corpo")))
        elif nome in ("conta", "nutricao", "financeiro") and ch != "ler":
            acoes[f"{nome}:{ch}"] = acoes.get(f"{nome}:{ch}", 0) + 1
        else:
            fora_fn[f"fn:{nome}({ch})"] += 1
    outra = Counter(x for a in outras_areas(area) for x in (B.direta(p, a) for p in pedidos) if x)
    # de fora da 21c (de outra W — a 21b, o Treino da aba Treinos dos Modelos, o desvio 23): qualquer tabela/RPC direta que não é de nenhuma área
    # da 21c e as chamadas às outras funções — listadas à parte, não é falha
    fora = Counter(f"{'T' if p.get('host') == 'T' else 'P'}:{p.get('tipo')}:{p.get('nome')}" for p in pedidos
                   if p.get("metodo") != "OPTIONS" and p.get("tipo") in ("tab", "rpc")
                   and not B.direta(p, area) and not any(B.direta(p, a) for a in outras_areas(area)))
    fora.update(fora_fn)
    grav = Counter(x for x in (B.B20.gravacao(p) for p in pedidos) if x)
    a_parte = {k: v for k, v in grav.items() if any(k == x or k.startswith(x + "(") for x in A_PARTE.get(tela, ()))}
    gravacoes = {k: v for k, v in grav.items() if k not in a_parte}
    return {"diretas": dict(diretas), "ler": ler, "acoes": acoes, "consultas": dict(consultas), "outra_area": dict(outra), "fora": dict(fora),
            "gravacoes": gravacoes, "a_parte": a_parte}


def serie(pronta: dict, funcao: str) -> list[float]:
    """Os instantes (s desde a navegação) dos `ler` de uma função na tela — o rede.py confere que os Modelos vão EM PARALELO (0 série)."""
    return [p.get("t") for p in pronta["pedidos"] if chamada_da_funcao(p, funcao) == "ler"]


def em_paralelo(pronta: dict, funcoes: tuple[str, ...] = ("nutricao", "financeiro"), folga_s: float = 0.5) -> bool:
    """Os `ler` das funções saem JUNTOS (todos dentro da folga do 1º) — nenhum espera a resposta de outro (0 série)."""
    ts = [t for f in funcoes for t in serie(pronta, f) if isinstance(t, (int, float))]
    return bool(ts) and max(ts) - min(ts) <= folga_s


def conferir_tela(o, base: str, fase: str, area: str, conta: str, tela: str, teto: dict, cont: dict, pronta: dict) -> None:
    """A guarda de cada tela: 0 gravação ao abrir (sempre — fora a A_PARTE, listada); antes — a leitura da área ia direto; depois — 0
    chamada direta da área, o `ler` de cada função ≤ o teto, nenhuma ação ao abrir (fora a A_PARTE) e, nos Modelos, os 3 em paralelo."""
    grav = cont["gravacoes"]
    diretas = sum(cont["diretas"].values())
    o.ok(not grav, f"[{base}] {conta} · {tela}: 0 gravação ao abrir ({grav or '—'})" + (f" — à parte, da tela por desenho: {cont['a_parte']}" if cont["a_parte"] else ""))
    if fase == "antes":
        if tela not in ("config_conta", "config_convite", "config_excluir"):  # as 3 não liam a área ao abrir (a spec: 0 pedido da área)
            o.ok(diretas >= 1, f"[antes] {conta} · {tela}: a leitura da área ia direto do navegador ({cont['diretas']})")
        return
    o.ok(diretas == 0, f"[depois] {conta} · {tela}: 0 chamada direta da área {area} ({cont['diretas'] or '—'})")
    o.ok(all(cont["ler"].get(f, 0) <= n for f, n in teto.items()),
         f"[depois] {conta} · {tela}: `ler` por função {cont['ler'] or '—'} (≤ {teto}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")
    if tela == "modelos":
        o.ok(em_paralelo(pronta), f"[depois] {conta} · modelos: os `ler` da nutricao e da financeiro EM PARALELO (0 série — a DECISÃO 21:06): "
             f"nutricao {serie(pronta, 'nutricao')} · financeiro {serie(pronta, 'financeiro')} (s desde a navegação)")
    acoes = {k: v for k, v in cont["acoes"].items() if f"fn:{k.replace(':', '(')})" not in cont["a_parte"]}
    if acoes:
        o.ok(False, f"[depois] {conta} · {tela}: nenhuma ação ao abrir ({acoes})")
    if cont["outra_area"] or cont["fora"]:
        o.linha(f"   [{base}] {conta} · {tela}: à parte — de outra área da 21c {cont['outra_area'] or '—'}; de fora da 21c {cont['fora'] or '—'}")


PLANILHA_REDE = B.MEDICAO / "rede_hml21c.tsv"
CAB_REDE = ["quando", "base", "commit", "fase", "area", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "acoes", "outra_area",
            "fora", "gravacoes", "a_parte", "pedidos", "t_pronto_s"]


def anotar_rede(base: str, commit: str, fase: str, area: str, conta: str, tela: str, cont: dict, pronta: dict) -> None:
    j = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, conta, tela, sum(cont["diretas"].values()), j(cont["diretas"]), j(cont["ler"]),
        j(cont["consultas"]), j(cont["acoes"]), j(cont["outra_area"]), j(cont["fora"]), j(cont["gravacoes"]), j(cont["a_parte"]), len(pronta["pedidos"]),
        pronta["t_pronto_s"],
    ])


def abrir_tela(t, pend, tela: tuple) -> dict:
    """Abre a tela pela navegação do app e espera o "pronto" (a regra da hml-20) com o seletor da tela."""
    _nome, (_como, alvo), sel, _teto = tela
    P21.fechar_janelas(t)
    B.navegar(t, alvo)
    return B.esperar_pronto(t, pend, marca=sel)


def abrir_conta(nav, base: str, conta: str, nome: str, guarda=None):
    """O contexto do navegador da conta (o painel 1280 × 883); na produção a Guarda da W (com as 7 da 21c), sem a marca local de aviso visto;
    o LegalDesligado da 21a."""
    t = B.Tela(nav, B.BASES[base], f"hml21c_{base}", nome, desktop=True, guarda=guarda)
    if base == "prod":
        t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)
    B.LegalDesligado().instalar(t.ctx)
    return t, B.Pendentes(t.pg)


def entrar(o, t, pend, L, base: str, conta: str) -> None:
    """A sessão antes do 1º documento (reaproveitada) e a ENTRADA de fora da 21c (o Dashboard — a carga fria fica fora da medida)."""
    t.entrar(L, conta, ENTRADA_PAINEL)
    o.ok(t.esperar(lambda: t.n("[data-casca]") > 0, 60), f"[{base}] {conta}: o painel abriu na entrada ([data-casca])", parar=True)
    B.esperar_pronto(t, pend, max_s=40)


def sair_da_conta(o, t, L, base: str, conta: str, rotulo: str) -> None:
    """O fim do contexto: o logout (scope=local) da sessão do Treino que a troca do app abriu e a sessão do principal guardada de volta."""
    P21.sair_da_conta(o, t, L, base, conta, rotulo)


# ───────────────────────── a ociosa (decisão K — roda só no F7, pela sessão principal) ─────────────────────────
OCIOSA_S = 600        # ≥ 10 min sem NENHUM pedido à função (o critério de hml21/medicao/logs_borda_*: "a anterior da mesma função há ≥ 10 min")
TETO_OCIOSA_S = 1800  # o teto de espera: a função quente pelo tráfego da produção → "não ficou ociosa" (com a contagem dos logs) — não é falha
JANELA_LOGS_MIN = 40
# as telas críticas da ociosa (decisão K): a Lixeira (a conta), os Modelos (a nutricao e a financeiro), o Dieta do app do aluno (a nutricao) e
# o Painel › Financeiro (a financeiro) — (tela, a função esperada, a conta, a rota, o seletor do pronto)
TELAS_OCIOSA = (
    ("lixeira", ("conta",), NUTRI, "/painel/lixeira", LIXEIRA[2]),
    ("modelos", ("nutricao", "financeiro"), NUTRI, "/painel/modelos", MODELOS[2]),
    ("dieta_app", ("nutricao",), ALUNA, "/dieta", "[data-aba-dieta]"),  # o app do aluno (o celular; a tela da hml-20: e2e/hml20/telas.py)
    ("financeiro_painel", ("financeiro",), PERSONAL, "/painel/financeiro?aba=resumo", '[data-aba-financeiro-conteudo="resumo"] [data-kpis-financeiro]'),
)
CAMPOS_FIXOS_DO_LOG = ("nivel", "codigo", "acao", "n", "ms", "resultado", "pg", "status")


def instante_utc(v: object) -> float | None:
    """O instante de um log (Management API): o número em microssegundos ou o texto ISO SEM fuso — que é UTC (a lição 14:23 da 21d: tomá-lo
    como hora local o punha 3 h no futuro)."""
    if isinstance(v, (int, float)):
        return float(v) / 1e6 if v > 1e12 else float(v)
    if isinstance(v, str):
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]00:?00)?", v.strip())
        if m:
            base = calendar.timegm(tuple(int(m.group(i)) for i in range(1, 7)) + (0, 0, 0))
            return base + (float(m.group(7)) if m.group(7) else 0.0)
    return None


def logs_da_funcao(funcao: str, ini_utc: float, fim_utc: float, ref: str | None = None) -> tuple[list[dict], str | None]:
    """Os LOGS DE FUNÇÃO (source function_logs do analytics da Management API — NUNCA a borda: H-135) de UMA função numa janela [ini, fim]
    (UTC): só os campos FIXOS do log da porta (+ o instante). As linhas do runtime (booted/shutdown) saem como {"runtime": a 1ª palavra}.
    → (linhas, erro)."""
    import urllib.parse  # noqa: PLC0415
    ref = ref or B.PRINCIPAL_REF
    fmt = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))  # noqa: E731
    sql = "SELECT timestamp AS t, event_message AS m FROM logs WHERE source = 'function_logs' ORDER BY t LIMIT 5000"
    q = urllib.parse.urlencode({"sql": sql, "iso_timestamp_start": fmt(ini_utc), "iso_timestamp_end": fmt(fim_utc)})
    st, r, _h = B.B5.http("GET", f"https://api.supabase.com/v1/projects/{ref}/analytics/endpoints/logs?{q}", None,
                          {"Authorization": f"Bearer {C.C2.pat()}", "User-Agent": "physiq-hml21c/1.0"}, timeout=90)
    if st != 200 or not isinstance(r, dict) or r.get("error"):
        return [], f"HTTP {st}"
    saida = []
    for x in r.get("result") or []:
        m = x.get("m") or ""
        try:
            j = json.loads(m)
        except (ValueError, TypeError):
            j = None
        t = instante_utc(x.get("t"))
        if isinstance(j, dict) and j.get("funcao") == funcao:
            saida.append({"t": t, **{k: j[k] for k in CAMPOS_FIXOS_DO_LOG if k in j}})
        elif not m.lstrip().startswith("{") and m.split():
            saida.append({"t": t, "runtime": m.split()[0][:20]})
    return saida, None


def ultimo_pedido(funcao: str, agora_utc: float | None = None) -> tuple[float | None, str | None]:
    """O instante (UTC) do último pedido à função nos logs de FUNÇÃO dos últimos JANELA_LOGS_MIN min (qualquer quem chama) → (t, erro)."""
    agora_utc = agora_utc or time.time()
    linhas, erro = logs_da_funcao(funcao, agora_utc - JANELA_LOGS_MIN * 60, agora_utc)
    if erro:
        return None, erro
    ts = [x["t"] for x in linhas if "runtime" not in x and isinstance(x.get("t"), float)]
    return (max(ts) if ts else None), None


def ociosa_agora(funcoes: tuple[str, ...], ultimo_local: float) -> tuple[bool, int, str]:
    """Todas as funções da tela paradas há ≥ OCIOSA_S? A escuta deste processo E os logs de FUNÇÃO (qualquer quem chama) → (ociosa?, há
    quantos s, a nota). Os logs fora do ar → NÃO mede (a ociosa só vale conferida pelos logs de função)."""
    if time.time() - ultimo_local < OCIOSA_S:
        return False, round(time.time() - ultimo_local), "a escuta deste processo viu um pedido há pouco"
    mais_novo = ultimo_local
    for f in funcoes:
        t, erro = ultimo_pedido(f)
        if erro:
            return False, round(time.time() - mais_novo), f"os logs de função de {f} não responderam ({erro}): sem a conferência, não mede"
        if t and t > mais_novo:
            mais_novo = t
    parada = round(time.time() - mais_novo)
    return parada >= OCIOSA_S, parada, ("as funções paradas (logs de função)" if parada >= OCIOSA_S else "um pedido nos logs de função: a espera segue")


def analisar_ociosa(funcoes: tuple[str, ...], t0_utc: float, t1_utc: float) -> dict:
    """A análise da abertura ociosa pelos logs de FUNÇÃO (decisão K): na janela da abertura, o runtime (o booted = a função fria) e o `ms`
    do servidor de cada `ler` de cada função — só os campos fixos."""
    saida = {}
    for f in funcoes:
        linhas, erro = logs_da_funcao(f, t0_utc - 5, t1_utc + 60)
        lers = [x for x in linhas if "runtime" not in x and x.get("acao") == "ler"]
        saida[f] = {"erro": erro, "ler_ms": [x.get("ms") for x in lers], "runtime": sorted({x["runtime"] for x in linhas if "runtime" in x}),
                    "n": len(lers)}
    return saida


# ───────────────────────── os ★ dos Modelos pelo motor comum (a nutricao e a financeiro — o --seco, sem rede) ─────────────────────────
NUTRICAO_LEITURAS_TS = B.REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-leituras.ts"
FINANCEIRO_LEITURAS_TS = B.REPO / "supabase-principal" / "functions" / "_shared" / "financeiro-leituras.ts"
_JS_FAVORITOS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const motor = await import(pathToFileURL(process.argv[1]).href);
const nut = await import(pathToFileURL(process.argv[2]).href);
const fin = await import(pathToFileURL(process.argv[3]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const cat = { nutricao: nut.CATALOGO_NUTRICAO.consultas, financeiro: fin.CATALOGO_FINANCEIRO.consultas };
const decl = (c) => ({ params: c.params, tabela: c.fonte.tabela ?? null, colunas: c.fonte.colunas ?? null, teto: c.fonte.teto ?? null,
  fixos: c.fonte.fixos ?? null, vivas: c.fonte.vivas ?? false, dono: c.dono ?? null, embutidos: c.fonte.embutidos ?? null, ordem: c.fonte.ordem ?? null });
console.log(JSON.stringify({
  nutricao: Object.fromEntries(Object.keys(cat.nutricao).filter((q) => q.startsWith("modelos_favoritos_")).map((q) => [q, decl(cat.nutricao[q])])),
  financeiro: Object.fromEntries(Object.keys(cat.financeiro).filter((q) => q.endsWith("_favoritos")).map((q) => [q, decl(cat.financeiro[q])])),
  sozinhas: Object.keys(cat.nutricao).filter((q) => cat.nutricao[q].sozinha),
  pedidos: (e.pedidos ?? []).map(([f, corpo]) => {
    const r = motor.lerPedidoDeLeitura(corpo, cat[f]);
    return r.ok === false ? { ok: false, erro: r.erro } : { ok: true, itens: r.itens };
  }),
}));
"""


def regras_favoritos(pedidos: list[tuple[str, dict]] | None = None) -> dict:
    """As consultas dos ★ nos catálogos EXPORTADOS (CATALOGO_NUTRICAO, CATALOGO_FINANCEIRO — os que as funções usam) e, para cada (função,
    corpo), o que o lerPedidoDeLeitura do motor comum faz — do próprio TS (node, sem rede)."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_FAVORITOS, str(B.MOTOR_TS),
                        str(NUTRICAO_LEITURAS_TS), str(FINANCEIRO_LEITURAS_TS)],
                       input=json.dumps({"pedidos": pedidos or []}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (os ★): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def ler_nutricao(token: str | None, itens: list[dict], **kw) -> tuple[int, dict, dict, float]:
    """O `ler` da nutricao (o lote) como a tela chama."""
    return B.B19.funcao(token, "ler", {"itens": itens}, **kw)


def ler_financeiro(token: str | None, itens: list[dict], **kw) -> tuple[int, dict, dict, float]:
    """O `ler` da financeiro (o lote) como a tela chama."""
    return B.B19.funcao_fin(token, "ler", {"itens": itens}, **kw)
