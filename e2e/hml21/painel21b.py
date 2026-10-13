"""Physiq hml-21b (H-43 parte 2 · jeito 2, etapa 3, 13/10/2026) — a base dos E2E da Agenda (do profissional e do aluno), dos Alunos e da parte
não saúde do Dashboard pela função `conta` (api.py, rede.py e telas.py --area agenda|alunos). Usa o e2e/hml21/_base.py (B) e acrescenta:
  · as contas da 21b (decisão I do contrato): NUTRI = w5p-nutri e PERSONAL = w5p-personal (o painel: a Agenda, os Alunos, o Dashboard e a
    Busca), ALUNA = w5p-aluna (a Agenda do aluno), OUTRA = w13-dono (N1); na produção (decisão N, SÓ LEITURA) a nutri-legado no painel e a
    aluno-calc no app. Nenhuma conta nova no Auth (o login do staging é o da produção);
  · a conta ativa como o app escolhe (o escolherConta de src/nucleo/situacao.ts:252 sem preferência guardada: a 1ª da minha_situacao),
    lida COMO A PESSOA por SQL só leitura (o P compara a função com o SQL da lib usando a MESMA conta que a tela usaria);
  · as telas do rede.py/telas.py (a rota ou o clique, o seletor do "pronto", o teto de `ler`) e as PRÉ-CONDIÇÕES de abrir sem gravar: a
    Agenda do painel grava ao abrir sem um calendário PRÓPRIO vivo (o agenda_garantir — src/painel/agenda/dados.ts garantirCalendarios) ou
    sem as 3 tags base (o tags_garantir — carregarTagsDaAgenda/temAsBases); conferidas por SQL só leitura, só contagem — sem elas a Agenda
    é PULADA com o motivo (nunca deixa a ação sair), em toda base;
  · a massa (decisão I): calendário, tag, agendamento, bloqueio e trava DE TESTE pelas AÇÕES da conta (os caminhos do app), SÓ nas contas de
    teste, com a marca "hml21 e2e <rodada>" no nome/título/motivo/observação; os ids no Estado (a chave "hml21b") NA HORA; os avisos que o
    banco põe no sino (o gatilho W20 — a aluna, quando a consulta de teste tem a matrícula dela; as RPCs aluno_agenda_* — o profissional)
    anotados por id e apagados no fim; a limpeza pelas ações e, no fim, por SQL SÓ no schema staging, SÓ dos donos de teste, SÓ a marca
    (inclusive o que foi para a Lixeira) — conferida por SQL só leitura, só contagem;
  · o que NÃO roda: o WhatsApp (o gatilho trg_whatsapp_confirmar_agendamento só manda com instância conectada — conferido 0 antes da
    consulta com a matrícula; senão a Agenda do aluno é PULADA) e o e-mail da agenda-avisar (o E2E não chama a função; no staging ela
    mandaria para a caixa de teste do Resend). O pacote: o pacote_definir só no caminho que não muda nada (o MESMO total/mês do pacote
    ativo; sem pacote, o total 0 — encerra o que não existe) e o total_invalido.
Sem segredo nem dado pessoal na saída: só códigos, contagens, booleanos e tempos (os nomes das contas de teste não saem).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import time

import _base as B

C = B.C

NUTRI = "w5p-nutri"        # a nutricionista da aluna (membro da conta de teste): a Agenda, os Alunos, a Busca, o Dashboard; a massa
PERSONAL = "w5p-personal"  # o dono + personal da conta de teste: a Agenda com a equipe, os Alunos, o Dashboard dele
ALUNA = B.ALUNA            # w5p-aluna: a Agenda do aluno (as regras, os horários e as 4 ações) — a consulta de teste com a matrícula dela
OUTRA = B.OUTRA            # w13-dono: N1 (outra conta não lê nem grava a agenda/os alunos da nutri)
PROD_PAINEL = "nutri-legado"  # produção, SÓ LEITURA: o painel (e2e/hml19/_base.py:85 · e2e/hml20/_base.py:72)
PROD_ALUNO = B.PROD_CONTA      # produção, SÓ LEITURA: o app (aluno-calc — o smoke do W7)

# a massa: (tabela, a coluna do dono, a coluna da marca) — NA ORDEM do DELETE (quem aponta para outra sai antes: a consulta aponta para o
# calendário e a tag; o bloqueio e a trava, para o calendário; o calendário, para a tag padrão)
MASSA = (("agendamentos", "nutricionista_id", "titulo"), ("bloqueios_agenda", "nutricionista_id", "motivo"),
         ("agenda_travas", "profissional_id", "motivo"), ("calendarios", "nutricionista_id", "nome"), ("agenda_tags", "profissional_id", "nome"))
TABELAS_DA_MASSA = frozenset(t for t, _d, _m in MASSA)
COLUNA_DO_DONO = {t: d for t, d, _m in MASSA}
COLUNA_DA_MARCA = {t: m for t, _d, m in MASSA}
TIPO_AVISO_AGENDA = "consulta_marcada"  # o w20_avisar (migration 20261001070000_w20_agenda.sql:312): o tipo de todo aviso da agenda

# o DELETE da massa (decisão I): SÓ staging, SÓ os donos de teste anotados, SÓ a marca — 1 instrução; o resto é recusado ANTES de sair
_RE_DELETE_21B = re.compile(
    r"(?is)\s*delete from staging\.(agendamentos|bloqueios_agenda|agenda_travas|calendarios|agenda_tags) where "
    r"(nutricionista_id|profissional_id) = any\(array\['[0-9a-f-]{36}'(?:, '[0-9a-f-]{36}')*\]::uuid\[\]\) "
    r"and (titulo|motivo|nome) like '%hml21 e2e%';\s*")


# ───────────────────────── a conta ativa e as pré-condições (SQL só leitura) ─────────────────────────
def situacao_como(s: str, uid: str, conta: str) -> dict:
    """A minha_situacao() COMO A PESSOA (SQL só leitura com o sub dela) — a fonte da conta ativa do app (src/nucleo/conta.tsx)."""
    email = B.B5.CONTAS[conta][0]
    v = (B.B20.ler_como(B.PRINCIPAL_REF, uid, f"select to_jsonb({s}.minha_situacao()) as v", email) or [{}])[-1].get("v")
    return v if isinstance(v, dict) else {}


def conta_ativa(sit: dict) -> dict | None:
    """A conta ativa como o app escolhe sem preferência guardada (escolherConta: a 1ª conta da situação) — {id, papeis, modulos}."""
    contas = sit.get("contas") if isinstance(sit, dict) else None
    c = contas[0] if isinstance(contas, list) and contas and isinstance(contas[0], dict) else None
    if not c or not C.eh_uuid(c.get("id")):
        return None
    return {"id": c["id"], "papeis": [str(x) for x in (c.get("papeis") or [])], "modulos": [str(x) for x in (c.get("modulos") or [])]}


def sql_agenda_sem_gravar(s: str, uid: str) -> str:
    """Só contagem: os calendários VIVOS próprios e as tags base vivas por área (treino, nutricao, geral) de quem abre a Agenda."""
    u = C.txt(C.uuid_ok(uid))
    return (f"select (select count(*) from {s}.calendarios c where c.nutricionista_id = {u} and c.deleted_at is null)::int as calendarios, "
            f"(select count(distinct t.area) from {s}.agenda_tags t where t.profissional_id = {u} and t.base and t.deleted_at is null "
            f"and t.area in ('treino', 'nutricao', 'geral'))::int as areas_base")


def agenda_abre_sem_gravar(s: str, uid: str) -> tuple[bool, str]:
    """A Agenda do painel abre SEM gravar? (≥ 1 calendário próprio vivo e as 3 tags base — senão o app chama o agenda_garantir/tags_garantir
    ao abrir). SQL só leitura, só contagem."""
    r = (B.ler_principal(sql_agenda_sem_gravar(s, uid)) or [{}])[0]
    cal, areas = int(r.get("calendarios") or 0), int(r.get("areas_base") or 0)
    if cal < 1:
        return False, f"sem calendário próprio vivo ({cal}) — abrir a Agenda chamaria o agenda_garantir (GRAVA)"
    if areas < 3:
        return False, f"sem as 3 tags base ({areas} de 3 áreas) — abrir a Agenda chamaria o tags_garantir (GRAVA)"
    return True, f"{cal} calendário(s) próprio(s) e as 3 tags base"


def matricula_da_aluna(s: str, uid_aluna: str, uid_nutri: str) -> str | None:
    """A matrícula VIVA da aluna de TESTE com a nutri de TESTE (a da conta da nutri — a mais antiga): uma 2ª matrícula de outra W (a massa
    da W-A na conta do w13-dono) não entra nem derruba a rodada (o matricula_da_aluna da hml-17 exige 1 só). SQL só leitura."""
    linhas = B.ler_principal(f"select p.id::text as id from {s}.pacientes p where p.user_id = {C.txt(C.uuid_ok(uid_aluna))} and p.deleted_at is null "
                             f"and p.nutricionista_id = {C.txt(C.uuid_ok(uid_nutri))} order by p.created_at limit 1")
    v = (linhas[0] if linhas else {}).get("id")
    return v if C.eh_uuid(v) else None


def whatsapp_conectado(s: str, uid: str) -> int:
    """Instâncias de WhatsApp conectadas do profissional (o gatilho da confirmação só manda com uma) — SQL só leitura, só contagem."""
    return int((B.ler_principal(f"select count(*)::int as n from {s}.whatsapp_instancias where nutricionista_id = {C.txt(C.uuid_ok(uid))} "
                                f"and status = 'conectado'") or [{}])[0].get("n") or 0)


# ───────────────────────── as telas (rede.py e telas.py) ─────────────────────────
# a ENTRADA do painel: uma tela de fora da 21b que não grava ao abrir (a casca e a sessão chegam aqui — a carga fria não entra na conta da
# 1ª tela medida; as medidas vêm pela navegação do próprio app)
ENTRADA_PAINEL = "/painel/configuracoes/perfil"
ENTRADA_APP = "/perfil"
# (tela, como abrir, o seletor do "pronto", o teto de `ler` do depois). Como abrir: ("rota", r) pela navegação do app; ("clique", s) no botão
# da Agenda já aberta (o diálogo); ("busca", None) o Ctrl K com o termo. A série aceita (## TEMPO agenda série, decisão 04:23): a Agenda e o
# Dashboard com 2 `ler` (as tags dependem dos calendários/das consultas).
SEMANA = ("agenda_semana", ("rota", "/painel/agenda?visao=semana"), '[data-pagina-agenda-painel][data-visao-agenda="semana"] [data-visao="semana"]', 2)
MES = ("agenda_mes", ("rota", "/painel/agenda?visao=mes"), '[data-pagina-agenda-painel][data-visao-agenda="mes"] [data-visao="mes"]', 2)
NOVO = ("agenda_novo", ("clique", "[data-btn-novo-agendamento]"), "[data-modal-agendamento]", 1)
REGRAS = ("agenda_regras", ("clique", "[data-btn-editar-regras]"), "[data-modal-regras]", 1)
TRAVAS = ("agenda_travas", ("clique", "[data-btn-travar]"), "[data-modal-trava]", 1)
AGENDA_ALUNO = ("agenda_aluno", ("rota", "/perfil/agenda"), "[data-pagina-agenda]", 1)
ALUNOS = ("alunos", ("rota", "/painel/alunos"), "[data-pagina-alunos][data-total-alunos]", 2)
DASHBOARD = ("dashboard", ("rota", "/painel"), "[data-pagina-dashboard][data-modulos]", 2)
BUSCA = ("busca", ("busca", None), "[data-paleta-busca] [cmdk-item], [data-paleta-busca] [cmdk-empty]", 1)
TELAS_DA_AGENDA = (SEMANA, MES, NOVO, REGRAS, TRAVAS)
DIALOGOS = frozenset({"agenda_novo", "agenda_regras", "agenda_travas"})
TELAS_DOS_ALUNOS = (ALUNOS, DASHBOARD, BUSCA)
SELETORES = {
    "src/painel/paginas/Agenda.tsx": ["data-pagina-agenda-painel", "data-visao-agenda={visao}", "data-btn-novo-agendamento", "data-carregando-agenda"],
    "src/painel/agenda/VisaoSemana.tsx": ['data-visao="semana"'],
    "src/painel/agenda/VisaoMes.tsx": ['data-visao="mes"'],
    "src/painel/agenda/PainelAgenda.tsx": ["data-btn-editar-regras", "data-btn-travar", "data-painel-agenda", "data-regras-carregando"],
    "src/painel/agenda/AgendamentoDialog.tsx": ["data-modal-agendamento", "data-btn-salvar-agendamento"],
    "src/painel/agenda/RegrasDialog.tsx": ["data-modal-regras", "data-btn-salvar-regras"],
    "src/painel/agenda/TravaDialog.tsx": ["data-modal-trava", "data-btn-salvar-trava"],
    "src/app-aluno/perfil/Agenda.tsx": ["data-pagina-agenda"],
    "src/painel/paginas/Alunos.tsx": ["data-pagina-alunos", "data-total-alunos={lista.total}", "data-busca-alunos", 'data-estado="erro"'],
    "src/painel/paginas/Dashboard.tsx": ["data-pagina-dashboard", "data-modulos={d.modulos.join(\",\")}", "data-kpis-dashboard"],
    "src/ui/premium/Busca.tsx": ["data-busca-gatilho", "data-paleta-busca"],
    "src/painel/busca/Alunos.tsx": ['titulo="Alunos"'],
}


def telas_da_conta(area: str, conta: str) -> list[tuple]:
    """As telas que cada conta abre na área, NA ORDEM: a Agenda (a nutri: semana, mês e os 3 diálogos; o dono: a semana, com a equipe; a
    aluna: a Agenda dela) e os Alunos (a nutri e o dono: a lista, o Dashboard e a Busca)."""
    if area == "agenda":
        if conta in (ALUNA, PROD_ALUNO):
            return [AGENDA_ALUNO]
        return list(TELAS_DA_AGENDA) if conta in (NUTRI, PROD_PAINEL) else [SEMANA]
    return list(TELAS_DOS_ALUNOS)


def contas_da_area(area: str, base: str) -> list[str]:
    """As contas de cada área (a produção, decisão N: a nutri-legado no painel e a aluno-calc no app — NUNCA as do staging)."""
    if base == "prod":
        return [PROD_PAINEL, PROD_ALUNO] if area == "agenda" else [PROD_PAINEL]
    return [NUTRI, PERSONAL, ALUNA] if area == "agenda" else [NUTRI, PERSONAL]


def eh_do_app(conta: str) -> bool:
    return conta in (ALUNA, PROD_ALUNO)


def antes_da_spec(conta: str) -> dict[str, float | None]:
    """O "antes" da spec da hml-21 (hml21/medicao/rede_por_tela.tsv): o t_pronto por rota da conta (aquecido, "spa")."""
    arq = B.MEDICAO / "rede_por_tela.tsv"
    saida: dict[str, float | None] = {}
    if not arq.exists():
        return saida
    linhas = [x for x in arq.read_text(encoding="utf-8").splitlines() if x and not x.startswith("#")]
    cab = linhas[0].split("\t") if linhas else []
    for linha in linhas[1:]:
        c = dict(zip(cab, linha.split("\t")))
        if c.get("conta") == conta and c.get("carga") == "spa":
            try:
                saida[c.get("rota", "")] = float(c.get("t_pronto_s", ""))
            except ValueError:
                saida.setdefault(c.get("rota", ""), None)
    return saida


ROTA_DA_SPEC = {"agenda_semana": "/painel/agenda", "alunos": "/painel/alunos", "dashboard": "/painel", "agenda_aluno": "/perfil/agenda"}


# ───────────────────────── a massa (decisão I) ─────────────────────────
def marca(rodada: str) -> str:
    return f"{B.MARCA} {rodada}"


def _massa(estado) -> dict:
    m = estado.d.get(B.CHAVE_21B)
    if not isinstance(m, dict):
        m = {"donos": [], "linhas": [], "avisos": []}
        estado.d[B.CHAVE_21B] = m
    for k in ("donos", "linhas", "avisos"):
        m.setdefault(k, [])
    return m


def anotar_linha(estado, tabela: str, id_: object, dono: object) -> None:
    """Uma linha DE TESTE que a rodada criou (na hora, antes de qualquer outra coisa): o --limpar desfaz mesmo se a rodada cair."""
    m = _massa(estado)
    if tabela in TABELAS_DA_MASSA and C.eh_uuid(id_) and C.eh_uuid(dono):
        if dono not in m["donos"]:
            m["donos"].append(dono)
        if [tabela, id_, dono] not in m["linhas"]:
            m["linhas"].append([tabela, id_, dono])
        estado.salvar()


def anotar_dono(estado, dono: object) -> None:
    """O dono de teste ANTES da 1ª ação que cria (uma rodada que cai depois do insert e antes do id ainda limpa pela marca)."""
    m = _massa(estado)
    if C.eh_uuid(dono) and dono not in m["donos"]:
        m["donos"].append(dono)
        estado.salvar()


def avisos_novos(s: str, destinos: list[str], t0: str) -> list[list[str]]:
    """Os avisos da agenda (tipo consulta_marcada) que o banco pôs no sino destas contas de TESTE desde o t0 — SQL só leitura, só os ids."""
    dests = [C.uuid_ok(d) for d in destinos if C.eh_uuid(d)]
    if not dests or not isinstance(t0, str):
        return []
    linhas = B.ler_principal(
        f"select destino_user_id::text as d, id::text as id from {s}.avisos where destino_user_id = any(array[{', '.join(C.txt(d) for d in dests)}]::uuid[]) "
        f"and tipo = {C.txt(TIPO_AVISO_AGENDA)} and criado_em >= {C.txt(t0)}::timestamptz")
    return [[x["d"], x["id"]] for x in linhas if C.eh_uuid(x.get("d")) and C.eh_uuid(x.get("id"))]


def anotar_avisos(estado, s: str, destinos: list[str], t0: str) -> int:
    m = _massa(estado)
    novos = [a for a in avisos_novos(s, destinos, t0) if a not in m["avisos"]]
    if novos:
        m["avisos"].extend(novos)
        estado.salvar()
    return len(novos)


def agora_db() -> str:
    """O agora do banco (o t0 dos avisos, como o criar_massa_avisos da 21a) — SQL só leitura."""
    return str((B.ler_principal("select now()::text as agora") or [{}])[0].get("agora"))


def instante(dias: int, hora: int, minuto: int = 0) -> str:
    """Um instante de TESTE no futuro (UTC, ISO com milissegundos — o toISOString da tela)."""
    d = dt.datetime.now(dt.timezone.utc).replace(hour=hora, minute=minuto, second=0, microsecond=0) + dt.timedelta(days=dias)
    return d.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sql_apagar_massa(s: str, tabela: str, donos: list[str]) -> str:
    """O DELETE da massa de uma tabela: SÓ staging, SÓ os donos de teste anotados, SÓ a marca da hml-21."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    if tabela not in TABELAS_DA_MASSA:
        raise SystemExit("tabela fora da massa da 21b")
    validos = [d for d in donos if C.eh_uuid(d)]
    if not validos:
        raise SystemExit("nenhum dono de teste anotado")
    return (f"delete from {s}.{tabela} where {COLUNA_DO_DONO[tabela]} = any(array[{', '.join(C.txt(d) for d in validos)}]::uuid[]) "
            f"and {COLUNA_DA_MARCA[tabela]} like {C.txt('%' + B.MARCA + '%')};")


def sql_contar_massa(s: str, donos: list[str] | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-21 em cada tabela da massa (vivas e na Lixeira) — dos donos, se vierem."""
    partes = []
    for t, d, m in MASSA:
        filtro = f" and {d} = any(array[{', '.join(C.txt(C.uuid_ok(x)) for x in donos)}]::uuid[])" if donos else ""
        partes.append(f"(select count(*) from {s}.{t} where {m} like {C.txt('%' + B.MARCA + '%')}{filtro})::int as {t}")
    return "select " + ", ".join(partes)


def sql_escrever_staging_21b(sql: str) -> None:
    """A escrita da limpeza SÓ no schema staging (decisão I): o sqlrw.py com PERMITIR_ESCRITA=1 e o --confirmo, pelo com_pat.py — só o
    DELETE da massa (os donos de teste, a marca), 1 instrução; o resto é recusado antes de sair."""
    if re.search(r"\bpublic\.", sql) or sql.count(";") != 1 or not _RE_DELETE_21B.fullmatch(sql):
        raise SystemExit("escrita fora do combinado (só o DELETE da massa da 21b: staging, donos de teste, a marca) — recusado")
    env = dict(os.environ, PERMITIR_ESCRITA="1")
    r = subprocess.run(["python3", str(B.COM_PAT), "python3", str(B.SQLRW), B.PRINCIPAL_REF, "--confirmo"], input=sql, capture_output=True,
                       text=True, env=env, timeout=180)
    if r.returncode != 0 or "status 20" not in r.stdout:
        raise RuntimeError(f"sqlrw (staging): {(r.stdout + r.stderr).strip()[:200]}")


def limpar_massa_21b(o, estado, s: str) -> None:
    """Desfaz a massa da 21b (no fim da rodada ou no --limpar): os avisos anotados (o DELETE por id, só a destino de teste — o da 21a), e as
    linhas com a marca dos donos de teste anotados (o DELETE por tabela, na ordem das FKs; inclusive as da Lixeira) — conferido por SQL só
    leitura, só contagem (0 com a marca). Só no staging."""
    m = estado.d.get(B.CHAVE_21B)
    if not isinstance(m, dict):
        return
    if s != "staging":
        o.ok(True, "limpeza (21b): a massa só existe no staging (nada a apagar)")
        estado.d.pop(B.CHAVE_21B, None)
        estado.salvar()
        return
    por_destino: dict[str, list[str]] = {}
    for d, i in m.get("avisos") or []:
        if C.eh_uuid(d) and C.eh_uuid(i):
            por_destino.setdefault(d, []).append(i)
    for d, ids in por_destino.items():
        B.sql_escrever_staging(B.sql_apagar_avisos(s, d, ids))
    avisos_sobra = 0
    for d, ids in por_destino.items():
        avisos_sobra += int(B.ler_principal(f"select count(*)::int as n from {s}.avisos where destino_user_id = {C.txt(d)} "
                                            f"and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])")[0]["n"])
    donos = [d for d in m.get("donos") or [] if C.eh_uuid(d)]
    if donos:
        antes = B.ler_principal(sql_contar_massa(s, donos))[0]
        for t, _d, _m in MASSA:
            if int(antes.get(t) or 0):
                sql_escrever_staging_21b(sql_apagar_massa(s, t, donos))
    sobra = B.ler_principal(sql_contar_massa(s))[0]
    total = sum(int(v or 0) for v in sobra.values())
    if o.ok(total == 0 and avisos_sobra == 0,
            f"limpeza (21b) conferida (SQL só leitura): {sum(len(v) for v in por_destino.values())} aviso(s) da agenda apagado(s) (sobra "
            f"{avisos_sobra}); 0 linha com a marca da hml-21 nas 5 tabelas da Agenda ({sobra})", parar=False):
        estado.d.pop(B.CHAVE_21B, None)
        estado.salvar()


def abrir_rodada_21b(o, s: str):
    """A rodada da 21b: a mesma regra da 21a (recusa se há outra pendente, de qualquer W) com a área "hml21b"."""
    B.usar_area("agenda")
    estado = B.abrir_rodada(o, s)
    _massa(estado)
    estado.salvar()
    return estado


def fechar_rodada_21b(o, estado, s: str) -> None:
    """O fim da rodada da 21b (no finally — o SIGTERM vira SystemExit e passa aqui): a massa e os avisos; o Estado só some com tudo
    desfeito (senão fica para o api.py --area agenda --limpar)."""
    try:
        limpar_massa_21b(o, estado, s)
    finally:
        if estado.vazio() and not B.tem_massa_21b(estado) and not estado.d.get("hml21_foto") and not estado.d.get("hml21_push"):
            estado.apagar()
        else:
            o.ok(False, "o Estado ficou com pendência (a massa da 21b): rode o api.py --area agenda --limpar", parar=False)


# ───────────────────────── os pedidos de exemplo da massa (puros: o --seco confere todos no leitor do servidor) ─────────────────────────
def corpo_calendario(rodada: str, conta: str | None) -> dict:
    """O calendário de teste como o CalendarioDialog manda (o "dados" + a conta da tela)."""
    return {"nome": marca(rodada), "cor": "#a78bfa", "padrao": False, "faixa_inicio": "07:00", "faixa_fim": "21:00", "slot_minutos": None,
            "tag_padrao_id": None, "conta_id": conta}


def corpo_consulta(rodada: str, calendario: str, tag: str | None, conta: str | None, paciente: str | None, dias: int, hora: int) -> dict:
    """A consulta de teste como o AgendamentoDialog manda (o "registro"; o dono vem do calendário, lido no servidor)."""
    return {"calendario_id": calendario, "paciente_id": paciente, "titulo": marca(rodada), "inicio": instante(dias, hora), "fim": instante(dias, hora, 30),
            "dia_inteiro": False, "status": "agendado", "confirmacao": "a_confirmar", "observacao": None, "modulo": "geral", "tag_id": tag,
            "conta_id": conta}


def corpo_tag(rodada: str) -> dict:
    """A tag de teste (o nome da tag tem 1–40 no banco: a marca cabe)."""
    return {"nome": marca(rodada)[:40], "cor": "#5b8def", "area": "geral"}


def corpo_bloqueio(rodada: str, calendario: str | None, conta: str | None) -> dict:
    return {"conta_id": conta, "calendario_id": calendario, "inicio": instante(31, 10), "fim": instante(31, 11), "motivo": marca(rodada)}


def corpo_trava(rodada: str, calendario: str | None, conta: str | None) -> dict:
    return {"conta_id": conta, "calendario_id": calendario, "dias": [0], "hora_inicio": "05:00", "hora_fim": "05:30", "motivo": marca(rodada)}


# ───────────────────────── a navegação e a contagem das telas (rede.py e telas.py) ─────────────────────────
AGENDA_DO_PAINEL = frozenset({"agenda_semana", "agenda_mes", "agenda_novo", "agenda_regras", "agenda_travas"})
# as telas onde o ANTES (o código antigo, o d357719) SEMPRE lê direto da área na 1ª abertura da rodada: a linha de base confere
ANTES_DIRETO = frozenset({"agenda_semana", "alunos", "dashboard", "agenda_aluno"})
TERMO_BUSCA = "teste"  # a Busca (Ctrl K) com um termo das contas de teste (o resultado não importa: a rede da busca de alunos)
PLANILHA_REDE = B.MEDICAO / "rede_hml21b.tsv"
CAB_REDE = ["quando", "base", "commit", "fase", "area", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "acoes", "outra_area",
            "fora", "gravacoes", "pedidos", "t_pronto_s"]


def fase_do_codigo_21b(base: str, commit: str) -> str:
    """depois = o commit medido lê a Agenda pela conta (src/painel/agenda/dados.ts com o lerConta); antes = o código antigo (lia direto)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:src/painel/agenda/dados.ts"], capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        return "?"
    return "depois" if "lerConta(" in r.stdout else "antes"


def fechar_janelas(t) -> None:
    """Fecha o que estiver aberto (o diálogo, a paleta da busca): Escape até não sobrar janela (no máximo 3)."""
    for _ in range(3):
        if t.n('[role="dialog"], [role="alertdialog"]') == 0:
            return
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(350)


def abrir_tela(t, pend, tela: tuple) -> dict:
    """Abre a tela como a pessoa: a rota pela navegação do app; o diálogo pelo clique no botão (a Agenda já aberta); a Busca pelo gatilho
    do topo com o termo — e espera o "pronto" (a regra da hml-20) com o seletor da tela."""
    _nome, (como, alvo), marca, _teto = tela
    fechar_janelas(t)
    if como == "rota":
        B.navegar(t, alvo)
    elif como == "clique":
        t.zerar_pedidos()
        t.esperar(lambda: t.pg.locator(alvo).first.is_enabled() if t.n(alvo) else False, 20)
        t.clicar(alvo)
    else:
        t.zerar_pedidos()
        t.clicar("[data-busca-gatilho]")
        t.esperar(lambda: t.n("[data-paleta-busca]") > 0, 10)
        t.pg.locator("[data-paleta-busca] input").first.fill(TERMO_BUSCA)
    return B.esperar_pronto(t, pend, marca=marca)


def conferir_tela(o, base: str, fase: str, area: str, conta: str, tela: str, teto: int, cont: dict, pronta: dict) -> None:
    """A guarda de cada tela: 0 gravação ao abrir (sempre); antes — a leitura da área ia direto (as telas do ANTES_DIRETO); depois — 0
    chamada direta da área, o `ler` ≤ o teto (a série aceita: a linha SÉRIE com os instantes), nenhuma ação da conta ao abrir."""
    grav, acoes = cont["gravacoes"], cont["acoes"]
    diretas = sum(cont["diretas"].values())
    o.ok(not grav, f"[{base}] {conta} · {tela}: 0 gravação ao abrir ({grav or '—'})")
    if fase == "antes":
        if tela in ANTES_DIRETO:
            o.ok(diretas >= 1, f"[antes] {conta} · {tela}: a leitura da área ia direto do navegador ({cont['diretas']})")
        return
    o.ok(diretas == 0, f"[depois] {conta} · {tela}: 0 chamada direta da área {area} ({cont['diretas'] or '—'})")
    o.ok(cont["ler"] <= teto, f"[depois] {conta} · {tela}: {cont['ler']} `ler` (≤ {teto}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")
    if cont["ler"] > 1:
        instantes = [(p.get("t"), ",".join(B.B20.consultas_do_corpo(p.get("corpo")))) for p in pronta["pedidos"] if B.chamada_da_conta(p) == "ler"]
        o.linha(f"SÉRIE {tela}: {cont['ler']} `ler` na mesma tela — os instantes (s desde a navegação) e as consultas: {instantes} (a série aceita: "
                "## TEMPO agenda série, decisão 04:23)")
    if acoes:
        o.ok(False, f"[depois] {conta} · {tela}: nenhuma ação da conta ao abrir ({acoes})")
    if cont["outra_area"] or cont["fora"]:
        o.linha(f"   [{base}] {conta} · {tela}: à parte — da outra área da 21b {cont['outra_area'] or '—'}; de fora da 21b {cont['fora'] or '—'}")


def anotar_rede(base: str, commit: str, fase: str, area: str, conta: str, tela: str, cont: dict, pronta: dict) -> None:
    j = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, conta, tela, sum(cont["diretas"].values()), j(cont["diretas"]), cont["ler"],
        j(cont["consultas"]), j(cont["acoes"]), j(cont["outra_area"]), j(cont["fora"]), j(cont["gravacoes"]), len(pronta["pedidos"]), pronta["t_pronto_s"],
    ])


def telas_que_abrem(o, s: str, base: str, area: str, conta: str) -> list[tuple]:
    """As telas da conta que abrem SEM gravar: a Agenda do painel só com calendário próprio e as 3 tags base (SQL só leitura, só contagem —
    sem login); sem elas, PULADA com o motivo (nunca deixa a ação sair), em toda base (decisão N na produção)."""
    telas = telas_da_conta(area, conta)
    if not any(x[0] in AGENDA_DO_PAINEL for x in telas):
        return telas
    uid = B.uid_da_conta(conta)
    abre, motivo = agenda_abre_sem_gravar(s, uid) if uid else (False, "a conta não existe nesta base")
    if abre:
        o.linha(f"   [{base}] {conta}: a Agenda abre sem gravar ({motivo})")
        return telas
    o.ok(True, f"[{base}] {conta}: a Agenda PULADA — {motivo} (SQL só leitura, só contagem; nada aberto)")
    return [x for x in telas if x[0] not in AGENDA_DO_PAINEL]


def abrir_conta(nav, base: str, conta: str, nome: str, guarda=None):
    """O contexto do navegador da conta: o painel 1280 × 883 ou o celular 390 × 844 (a aluna); na produção a Guarda, sem a marca local de
    aviso visto (o 🟡1 da 21a); o LegalDesligado da 21a (o aceite e o "o Physiq mudou" fora da tela)."""
    t = B.Tela(nav, B.BASES[base], f"hml21b_{base}", nome, desktop=not eh_do_app(conta), guarda=guarda)
    if base == "prod":
        t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)
    B.LegalDesligado().instalar(t.ctx)
    return t, B.Pendentes(t.pg)


def entrar(o, t, pend, L, base: str, conta: str) -> None:
    """A sessão antes do 1º documento (reaproveitada) e a ENTRADA de fora da 21b (a carga fria fica fora da medida)."""
    app = eh_do_app(conta)
    t.entrar(L, conta, ENTRADA_APP if app else ENTRADA_PAINEL)
    marca = "[data-aba-perfil]" if app else "[data-casca]"
    o.ok(t.esperar(lambda: t.n(marca) > 0, 60), f"[{base}] {conta}: o {'app' if app else 'painel'} abriu na entrada ({marca})", parar=True)
    B.esperar_pronto(t, pend, max_s=40)


def sair_da_conta(o, t, L, base: str, conta: str, rotulo: str) -> None:
    """O fim do contexto: o logout (scope=local) da sessão do Treino que a troca do app abriu (decisão 23 da hml-20; TREINO_SAIR_OUTRAS
    fecha as outras da conta) e a sessão do principal guardada de volta."""
    try:
        B.sair_do_treino(o, t.pg, f"[{base}] {rotulo} ({conta})", t, conta=conta)
    finally:
        L.do_navegador(conta, t.pg)
        t.fim()
