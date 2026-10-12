#!/usr/bin/env python3
"""Physiq W-P — E2E de SERVIDOR dos planos do aluno (pagamentos-aluno + automaticas-fila) no STAGING, com as contas de TESTE prof2
(dono da conta "Rafael Lima", Pix manual) e aluno2, em série e com a guarda de /health antes. Nada aqui toca o public: o SQL, o
x-schema das chamadas e o corpo da automaticas-fila usam só o staging.
Casos (o "planos" roda sempre primeiro: os outros usam o plano que ele cria; a ordem é sempre esta):
  planos   o dono cria (plano novo não enfileira); nome repetido; Pix manual sem cartão parcelado; o aluno não chega na tela; a lista
           do dono (completo, parcela, alunos, modo); desativado não entra na ficha; o dono lê direto e o aluno não; trava I5 em
           planos_aluno; DECISÃO 1: o membro da conta (não dono) → 403 so_o_dono na lista, no salvar e na ficha, e não lê pelo banco
  periodo  à vista de 12 meses: automática ligada → 409 automatica_ativa (com o OK, desliga); o APK antigo → 409 aluno_em_plano_novo;
           o pagamento por fora cobre 12 meses; o aluno vê coberto e sem automática; remover recua; volta ao modo de hoje
  mensal   mês a mês: parcela 83,33, parcelas 1 e 2, "parcela 3 de 12"; a trava I5 nas colunas do aluno; a avulsa direta continua
  fila     DECISÃO 2: 1 aluno com o MP recusando → automatica "na_fila", sem aviso ao dono; a automaticas-fila sem o segredo → 401,
           segredo errado → 401, schema inválido → 400; com o segredo a pendência fica feita com resultado sem_automatica (o staging
           simula o MP); o dono muda o valor do plano com o aluno em automática → enfileiradas ≥ 1 → feita; sem automática → 0
  mp       conta no Mercado Pago (sandbox): cartão parcelado até 3× (4× → 400 parcelas_invalidas; 3× APRO cobre 12 meses), sem
           automática no período todo (400 modalidade_sem_automatica), automática no mês a mês com a parcela (pendente no sandbox)
(A decisão 3 — MP aceitou e a cópia no banco falhou → sem aviso ao dono — ficou provada no roteiro local: aqui não se força a falha.)
Desfazer: ANTES de mexer, a foto da matrícula vai para ~/projetos/physiqcalc-scratch/wp/api-estado.json; no fim (ou na próxima
rodada / --limpar, se esta cair no meio) sai tudo o que a rodada criou (planos "WP e2e …", cobranças, assinaturas, fila, avisos), as
mensalidades escondidas voltam e a matrícula volta à foto — o último ✅ confere campo a campo. A guarda da W2 (sair de um Mercado
Pago com automática viva → P0001, também para o postgres): as automáticas da RODADA saem (ou viram canceladas no banco, a do sandbox
que o MP não cancelou) ANTES de a forma voltar; com automática viva de FORA da rodada num Mercado Pago (ou a conta no MP do personal) a
rodada não começa e o caso mp não liga o MP — o E2E não mexe no que não criou.
Precisa: a pagamentos-aluno e a automaticas-fila NOVAS publicadas; no staging as migrations 20261011010000, 20261011020000 (com a
policy "dono lê") e 20261011030000; o segredo S9 (python3 scripts/segredos/servidor.py automaticas_fila gerar → aceitar → trocar) com
a cópia em ~/.physiq-segredo-automaticas-fila; ~/.pc-pat; as senhas das contas de TESTE (~/.physiqcalc-teste-admin, ~/.physiq-teste-*:
o membro é o 1º de w7-nutri, w5-personal, w5-nutri que estiver ativo numa conta e entrar); as chaves de TESTE do MP (~/.physiq-mp-test,
~/.physiq-mp-public-test) no caso mp.
Uso: python3 e2e/wp/api.py [--casos planos,periodo,mensal,fila,mp] [--seco | --limpar]
  --seco    só os logins e a montagem dos pedidos (+ leituras do banco e da Management API): nenhuma ação é chamada, nada é gravado
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
"""
from __future__ import annotations

import argparse
import json
import math
import re
import secrets
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True

S = "staging"
DONO, ALUNO = "prof2", "aluno2"
# profissionais de TESTE que são membros (não donos) de uma conta: o 1º ativo no banco, com a senha em ~ e que entra é o da decisão 1
MEMBROS = (("w7-nutri", "w7.nutri.teste.claude@physiqnutri.app"),
           ("w5-personal", "w5.personal.teste.claude@physiqnutri.app"),
           ("w5-nutri", "w5.nutri.teste.claude@physiqnutri.app"))
PREFIXO = "WP e2e"
CASOS = ("planos", "periodo", "mensal", "fila", "mp")
MODALIDADES = ("avista", "cartao_parcelado", "mensal")
# A guarda da W2 (contas_guard_mp, migration 20261011210000) vale para TODO MUNDO, inclusive o postgres destes scripts: sair de um Mercado
# Pago com cobrança automática viva na conta → P0001 automaticas_ativas:<n>. O E2E só mexe no que criou (sair_do_mp e o limpar).
MODOS_MP = ("mercadopago", "mercadopago_conta")
VIVAS = "('authorized', 'pending', 'paused')"
ARQ_SEGREDO = ".physiq-segredo-automaticas-fila"
VAULT = "physiq_automaticas_fila_segredo"
ESTADO_ARQ = Path.home() / "projetos" / "physiqcalc-scratch" / "wp" / "api-estado.json"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

B = None  # a base dos E2E da W6 (e2e/w06/_base.py), carregada no main: o teste offline importa este arquivo sem rede nem senha
p = None
CTX: dict = {}

# ───────────────────────── funções puras (testáveis sem rede) ─────────────────────────

# o que cada ação da pagamentos-aluno lê do corpo (supabase-principal/functions/pagamentos-aluno/index.ts)
CONTRATO: dict[str, dict[str, str]] = {
    "aluno_status": {},
    "aluno_mp_cartao": {"paciente_id": "uuid", "card_token": "texto", "payment_method_id": "texto", "installments": "int"},
    "aluno_mp_assinar": {"paciente_id": "uuid"},
    "prof_planos": {"conta_id": "uuid"},
    "prof_plano_salvar": {"conta_id": "uuid", "nome": "texto", "meses": "int", "valor": "num", "modalidades": "lista"},
    "prof_plano_ativo": {"conta_id": "uuid", "id": "uuid", "ativo": "bool"},
    "prof_definir": {"aluno": "uuid"},
    "prof_registrar": {"aluno": "uuid", "data": "data", "metodo": "texto"},
    "prof_remover": {"cobranca_id": "uuid"},
    "prof_cancelar_assinatura": {"aluno": "uuid"},
}


def uuid_ok(v) -> bool:
    return isinstance(v, str) and bool(UUID.match(v))


def _do_tipo(v, tipo: str) -> bool:
    if tipo == "uuid":
        return uuid_ok(v)
    if tipo == "texto":
        return isinstance(v, str) and bool(v.strip())
    if tipo == "int":
        return isinstance(v, int) and not isinstance(v, bool)
    if tipo == "num":
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if tipo == "lista":
        return isinstance(v, list)
    if tipo == "bool":
        return isinstance(v, bool)
    if tipo == "data":
        return isinstance(v, str) and bool(DATA.match(v))
    raise ValueError(f"tipo desconhecido: {tipo}")


def validar_pedido(acao: str, corpo) -> list[str]:
    """O pedido segue o contrato da pagamentos-aluno? → os problemas (vazio = ok). Só a FORMA: o que o servidor decide é o teste."""
    if acao not in CONTRATO:
        return [f"ação fora do contrato: {acao}"]
    if not isinstance(corpo, dict):
        return ["o corpo não é um objeto"]
    problemas: list[str] = []
    try:
        json.dumps(corpo, allow_nan=False)
    except (TypeError, ValueError) as e:
        problemas.append(f"não vira JSON: {e}")
    if "acao" in corpo:
        problemas.append("a ação vai à parte (o pag() junta)")
    for campo, tipo in CONTRATO[acao].items():
        if campo not in corpo:
            problemas.append(f"falta {campo}")
        elif not _do_tipo(corpo[campo], tipo):
            problemas.append(f"{campo} não é {tipo}: {corpo[campo]!r}")
    if acao == "prof_plano_salvar":
        mods = corpo.get("modalidades") if isinstance(corpo.get("modalidades"), list) else []
        if not mods or any(m not in MODALIDADES for m in mods):
            problemas.append(f"modalidades fora de {MODALIDADES}: {mods!r}")
        if "cartao_parcelado" in mods and not _do_tipo(corpo.get("max_parcelas_cartao"), "int"):
            problemas.append("cartão parcelado sem max_parcelas_cartao")
        if "id" in corpo and not uuid_ok(corpo["id"]):
            problemas.append(f"id do plano não é uuid: {corpo['id']!r}")
    if acao == "prof_definir" and corpo.get("plano_modalidade") is not None:
        if corpo["plano_modalidade"] not in MODALIDADES:
            problemas.append(f"plano_modalidade fora de {MODALIDADES}: {corpo['plano_modalidade']!r}")
        if not uuid_ok(corpo.get("plano_aluno_id")):
            problemas.append("plano_modalidade sem plano_aluno_id (uuid)")
    return problemas


def pedido_plano(conta: str, nome: str, meses: int, valor: float, modalidades: list[str], max_parcelas: int | None = None,
                 plano_id: str | None = None) -> dict:
    """prof_plano_salvar: o plano inteiro (a tela manda tudo); com plano_id edita."""
    corpo = {"conta_id": conta, "nome": nome, "meses": meses, "valor": valor, "modalidades": list(modalidades)}
    if max_parcelas is not None:
        corpo["max_parcelas_cartao"] = max_parcelas
    if plano_id:
        corpo["id"] = plano_id
    return corpo


def pedido_no_plano(aluno: str, plano: str, modalidade: str, negociado: float | None = None, inicio: str | None = None,
                    cancelar: bool | None = None) -> dict:
    """prof_definir da W-P: o aluno num plano com período (negociado null = o valor do plano)."""
    corpo = {"aluno": aluno, "plano_aluno_id": plano, "plano_modalidade": modalidade, "plano_valor_negociado": negociado}
    if inicio:
        corpo["inicio"] = inicio
    if cancelar is not None:
        corpo["cancelar_automatica"] = cancelar
    return corpo


def pedido_modo_de_hoje(aluno: str, valor: float) -> dict:
    """prof_definir com plano_modalidade: null (a chave presente) = de volta ao modo de hoje com o valor digitado."""
    return {"aluno": aluno, "plano_modalidade": None, "plano_aluno_id": None, "valor": valor}


def pedido_apk_antigo(aluno: str, valor: float) -> dict:
    """prof_definir do APK antigo: sem a chave plano_modalidade (quem está num plano com período → 409 aluno_em_plano_novo)."""
    return {"aluno": aluno, "valor": valor}


def pedido_por_fora(aluno: str, data: str, metodo: str) -> dict:
    return {"aluno": aluno, "data": data, "metodo": metodo}


def pedido_cartao(paciente: str, token: str, parcelas: int) -> dict:
    return {"paciente_id": paciente, "card_token": token, "payment_method_id": "master", "installments": parcelas}


def pedido_fila(schema) -> dict:
    """O corpo da automaticas-fila: { schema: "public" | "staging" } (outro → 400)."""
    return {"schema": schema}


def cab_fila(segredo: str | None) -> dict:
    """O segredo S9 vai no cabeçalho x-espelho-segredo (o contrato hml-16c); sem segredo, sem cabeçalho."""
    return {"x-espelho-segredo": segredo} if segredo else {}


def casos_da_linha(texto: str) -> list[str]:
    """--casos → os casos na ordem de CASOS, sempre com o "planos" (os outros usam o plano que ele cria)."""
    pedidos = [c.strip() for c in (texto or "").split(",") if c.strip()]
    desconhecidos = [c for c in pedidos if c not in CASOS]
    if desconhecidos:
        raise ValueError(f"caso desconhecido: {', '.join(desconhecidos)} (os casos: {', '.join(CASOS)})")
    escolhidos = set(pedidos) | {"planos"}
    return [c for c in CASOS if c in escolhidos]


def centavos(n: float) -> float:
    """Math.round(n * 100) / 100 do servidor (positivos)."""
    return math.floor(n * 100 + 0.5) / 100


def parcela_do_plano(valor: float, meses: int) -> float:
    """A parcela do mês a mês sem a digitada: valor ÷ meses com 2 casas (1.000 ÷ 12 = 83,33)."""
    return centavos(valor / meses)


def nome_de_teste() -> str:
    return f"{PREFIXO} {uuid.uuid4().hex[:6]}"


def lit(v) -> str:
    """Literal SQL: texto entre aspas simples (aspas dobradas) ou null."""
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def arr_uuid(ids) -> str:
    """array['…']::uuid[] — só com uuids (vazio vale: array[]::uuid[])."""
    ids = list(ids)
    ruins = [i for i in ids if not uuid_ok(i)]
    if ruins:
        raise ValueError(f"id que não é uuid: {ruins!r}")
    return "array[" + ", ".join(f"'{i}'" for i in ids) + "]::uuid[]"


def saida_da_fila(resposta, fila_id: int) -> dict | None:
    """A saída da pendência na resposta da automaticas-fila ({ processadas, resultados: [{ id, destino, resultado }], avisos })."""
    if not isinstance(resposta, dict):
        return None
    return next((s for s in resposta.get("resultados") or [] if isinstance(s, dict) and s.get("id") == fila_id), None)


def erro_de(r) -> str | None:
    """O código de erro da automaticas-fila ({ error }); o da pagamentos-aluno vem em { erro }."""
    return r.get("error") if isinstance(r, dict) else None


def matricula_da_lista(resposta, paciente_id: str) -> dict | None:
    """A matrícula pedida na resposta do aluno_status."""
    lista = resposta.get("matriculas") if isinstance(resposta, dict) else None
    return next((m for m in lista or [] if isinstance(m, dict) and m.get("paciente_id") == paciente_id), None)


def achatar(f: dict) -> dict:
    """A foto da matrícula em campos soltos (para comparar campo a campo)."""
    return {**{f"pacientes.{k}": v for k, v in (f.get("pacientes") or {}).items()},
            "contas.recebimento_modo": f.get("recebimento_modo"),
            "mensalidades vivas": sorted(f.get("vivas") or []),
            "assinaturas": sorted(f.get("assinaturas") or [])}


def diferencas(antes: dict, depois: dict) -> list[str]:
    a, d = achatar(antes), achatar(depois)
    return [f"{k}: {a.get(k)!r} → {d.get(k)!r}" for k in sorted(set(a) | set(d)) if a.get(k) != d.get(k)]


def pedidos_da_rodada(pac: str, conta: str, plano: str, membro: dict | None, aluno_membro: str | None, hoje: str,
                      antes: str) -> list[tuple[str, str, dict]]:
    """Um pedido de cada forma que os casos mandam (o --seco confere todos contra o CONTRATO sem mandar nenhum)."""
    nome = nome_de_teste()
    lista = [
        (DONO, "prof_plano_salvar", pedido_plano(conta, nome, 12, 1000, ["avista", "mensal"])),
        (DONO, "prof_plano_salvar", pedido_plano(conta, f"{nome} X", 6, 10, ["cartao_parcelado"], max_parcelas=3)),
        (DONO, "prof_plano_salvar", pedido_plano(conta, nome, 12, 1200, ["avista", "mensal"], plano_id=plano)),
        (DONO, "prof_plano_salvar", pedido_plano(conta, nome, 12, 1000, list(MODALIDADES), max_parcelas=3, plano_id=plano)),
        (ALUNO, "prof_plano_salvar", pedido_plano(conta, f"{nome} Y", 1, 10, ["avista"])),
        (ALUNO, "prof_planos", {"conta_id": conta}),
        (DONO, "prof_planos", {"conta_id": conta}),
        (DONO, "prof_plano_ativo", {"conta_id": conta, "id": plano, "ativo": False}),
        (DONO, "prof_definir", pedido_no_plano(pac, plano, "avista", inicio=hoje)),
        (DONO, "prof_definir", pedido_no_plano(pac, plano, "avista", inicio=hoje, cancelar=True)),
        (DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal", negociado=75)),
        (DONO, "prof_definir", pedido_no_plano(pac, plano, "cartao_parcelado", cancelar=True)),
        (DONO, "prof_definir", pedido_apk_antigo(pac, 99.9)),
        (DONO, "prof_definir", pedido_modo_de_hoje(pac, 99.9)),
        (DONO, "prof_registrar", pedido_por_fora(pac, antes, "pix")),
        (DONO, "prof_remover", {"cobranca_id": str(uuid.uuid4())}),
        (DONO, "prof_cancelar_assinatura", {"aluno": pac}),
        (ALUNO, "aluno_status", {}),
        (ALUNO, "aluno_mp_cartao", pedido_cartao(pac, "token-do-sandbox", 3)),
        (ALUNO, "aluno_mp_assinar", {"paciente_id": pac, "checkout": True}),
    ]
    if membro:
        lista += [(membro["chave"], "prof_planos", {"conta_id": membro["conta"]}),
                  (membro["chave"], "prof_plano_salvar", pedido_plano(membro["conta"], nome, 1, 10, ["avista"])),
                  (membro["chave"], "prof_definir", pedido_no_plano(aluno_membro or str(uuid.uuid4()), str(uuid.uuid4()), "avista"))]
    return lista


# ───────────────────────── a base, o banco e as chamadas ─────────────────────────

def carregar_base() -> None:
    """A base dos E2E da W6: login das contas de TESTE, pag(), rest(), SQL pela Management API, /health, placar e registro da rodada."""
    global B, p
    if B is not None:
        return
    if S != "staging":
        raise SystemExit("este E2E é só do staging")
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
    import _base  # noqa: PLC0415 — aqui e não no topo: o teste offline das funções puras importa este arquivo sem rede

    B, p = _base, _base.p
    B.ESTADO["schema"] = S


def sql(q: str) -> list:
    return B.sql_principal(q)


def um(q: str) -> dict | None:
    r = sql(q)
    return r[0] if r else None


def pedir(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    """Uma ação da pagamentos-aluno como a conta de TESTE (x-schema: staging); o pedido é conferido contra o CONTRATO antes de sair."""
    corpo = corpo or {}
    problemas = validar_pedido(acao, corpo)
    if problemas:
        raise ValueError(f"pedido mal montado ({acao}): {problemas}")
    st, r = B.pag(conta, acao, corpo)
    return st, (r if isinstance(r, dict) else {})


def login_ok(conta: str) -> bool:
    try:
        return bool(B.token(conta))
    except Exception as e:  # noqa: BLE001
        print(f"   login {conta}: não entrou ({type(e).__name__})", flush=True)
        return False


def segredo_da_fila() -> str:
    """S9: a cópia local do segredo da fila das automáticas (o mesmo do Vault physiq_automaticas_fila_segredo). Nunca vai para a saída."""
    arq = Path.home() / ARQ_SEGREDO
    valor = arq.read_text(encoding="utf-8").strip() if arq.exists() else ""
    if len(valor) < 32:
        raise RuntimeError(f"falta ~/{ARQ_SEGREDO} (S9, o segredo da fila das automáticas, 600): python3 scripts/segredos/servidor.py "
                           "automaticas_fila gerar → aceitar → (publicar a automaticas-fila) → trocar → conferir")
    return valor


def chamar_fila(segredo: str | None, corpo) -> tuple[int, object]:
    """POST na automaticas-fila (verify_jwt false; a rodada responde no fim, com o que fez)."""
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/automaticas-fila", corpo, cab_fila(segredo), timeout=150)
    return st, r


def esperar(funcao, segundos: float, passo: float = 3.0):
    fim = time.time() + segundos
    while True:
        v = funcao()
        if v or time.time() >= fim:
            return v
        time.sleep(passo)


def matricula_de_teste() -> dict | None:
    return um(f"""select p.id::text as id, p.conta_id::text as conta, p.ativo, p.user_id::text as aluno_uid, c.origem,
                         c.dono_id::text as dono
                    from {S}.pacientes p join auth.users u on u.id = p.user_id left join {S}.contas c on c.id = p.conta_id
                   where lower(u.email) = {lit(B.CONTAS[ALUNO][0])} and p.deleted_at is null
                   order by p.ativo desc, p.created_at limit 1""")


def colunas_wp() -> int:
    """As 9 colunas da 20261011010000 no staging."""
    return um(f"""select count(*)::int as n from information_schema.columns where table_schema = '{S}' and (
                    (table_name = 'pacientes' and column_name in ('plano_modalidade', 'plano_valor_negociado'))
                 or (table_name = 'planos_aluno' and column_name in ('meses', 'modalidades', 'max_parcelas_cartao', 'valor_parcela_mensal'))
                 or (table_name = 'cobrancas' and column_name in ('meses_cobertos', 'parcelas_total', 'parcela_num')))""")["n"]


def tem_fila() -> bool:
    return bool(um(f"select to_regclass('{S}.automaticas_fila') is not null as ok")["ok"])


def achar_membro() -> dict | None:
    """Decisão 1: um profissional de TESTE ativo numa conta (fora a do app) SEM o papel de dono, com a senha em ~ e que entra."""
    emails = ", ".join(lit(e) for _, e in MEMBROS)
    linhas = sql(f"""select lower(u.email) as email, m.conta_id::text as conta, u.id::text as uid, m.papeis
                       from {S}.conta_membros m join auth.users u on u.id = m.user_id join {S}.contas c on c.id = m.conta_id
                      where m.status = 'ativo' and not ('dono' = any (m.papeis)) and c.origem is distinct from 'app'
                        and lower(u.email) in ({emails})""")
    for chave, email in MEMBROS:
        linha = next((x for x in linhas if x["email"] == email), None)
        arq = Path.home() / f".physiq-teste-{chave}"
        if not linha or not arq.exists():
            continue
        B.CONTAS.setdefault(chave, (email, arq.read_text(encoding="utf-8").strip()))
        if login_ok(chave):
            return {"chave": chave, **linha}
    return None


def aluno_do_membro(mb: dict) -> str | None:
    """Um aluno da conta pelo qual o membro é responsável (personal ou nutricionista, com o papel) — o prof_definir dele chega na
    guarda da mensalidade (só o dono)."""
    r = um(f"""select p.id::text as id from {S}.pacientes p join {S}.conta_membros m on m.conta_id = p.conta_id and m.user_id = '{mb['uid']}'
                where p.conta_id = '{mb['conta']}' and p.deleted_at is null and m.status = 'ativo'
                  and ((p.personal_id = m.user_id and 'personal' = any (m.papeis))
                    or (p.nutricionista_id = m.user_id and 'nutricionista' = any (m.papeis)))
                order by p.created_at limit 1""")
    return r["id"] if r else None


def nova_assinatura(status: str, valor: float | None = None, simulada: bool = True) -> str:
    """Uma cobrança automática de TESTE da matrícula — passa a ser a mais recente (a que a função lê). simulada: "sim-…" +
    payload.simulada (o staging não vai ao MP: sem_automatica); senão um id que o MP não conhece (o PUT falha: "na_fila")."""
    pre = ("sim-wp-e2e-" if simulada else "wp-e2e-falso-") + uuid.uuid4().hex
    payload = {"teste_wp": True, "simulada": True} if simulada else {"teste_wp": True}
    v = "null" if valor is None else f"{float(valor):.2f}"
    return um(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, payload)
                  values ('{CTX['pac']}', '{CTX['conta']}', {lit(pre)}, {lit(status)}, {v}, {lit(json.dumps(payload))}::jsonb)
                  returning id::text as id""")["id"]


def ativas_do_aluno() -> int:
    return um(f"""select count(*)::int as n from {S}.aluno_assinaturas where paciente_id = '{CTX['pac']}'
                   and status in ('authorized', 'pending', 'paused')""")["n"]


def valor_do_aluno() -> float | None:
    return um(f"select mensalidade_valor::float as v from {S}.pacientes where id = '{CTX['pac']}'")["v"]


def esconder_mensalidades_da_rodada() -> None:
    """Some com as mensalidades que a rodada criou (a cobertura volta a zero e o MP deixa pagar de novo); a limpeza apaga no fim."""
    sql(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and deleted_at is null
              and created_at >= {lit(CTX['t0'])}::timestamptz""")


def linha_da_fila(fila_id: int) -> dict | None:
    return um(f"""select id, motivo, tentativas, feito_em is null as pendente, resultado, erro from {S}.automaticas_fila
                   where id = {int(fila_id)}""")


def ultima_da_fila(motivo: str | None = None) -> dict | None:
    """A pendência mais nova da matrícula de teste criada nesta rodada (id acima do maior de antes)."""
    filtro = f" and motivo = {lit(motivo)}" if motivo else ""
    return um(f"""select id, motivo, tentativas, feito_em is null as pendente, resultado from {S}.automaticas_fila
                   where paciente_id = '{CTX['pac']}' and id > {int(CTX['fila_max'])}{filtro} order by id desc limit 1""")


def processar_e_conferir(segredo: str, fila_id: int, rotulo: str) -> None:
    """Chama a automaticas-fila com o segredo e confere a pendência: feita, resultado sem_automatica (o staging simula o MP). Se o
    pg_net (logo depois do commit) ou o pg_cron (minuto 7) chegou antes, a pendência já está feita — o 200 desta chamada vale igual."""
    st, r = chamar_fila(segredo, pedido_fila(S))
    saida = saida_da_fila(r, fila_id)
    n = r.get("processadas") if isinstance(r, dict) else None
    p.check(st == 200 and isinstance(n, int), f"a automaticas-fila com o segredo: 200 ({st} {erro_de(r) or ''} processadas={n}; "
                                              f"{rotulo}: {saida or 'não estava pendente nesta rodada'})")
    linha = esperar(lambda: (lambda x: x if x and not x["pendente"] else None)(linha_da_fila(fila_id)), 30)
    por = "esta chamada" if saida and saida.get("destino") == "feito" else "outra rodada (pg_net ou pg_cron)"
    p.check(bool(linha) and linha["resultado"] == "sem_automatica",
            f"{rotulo}: feita com resultado sem_automatica — o staging simula o MP (por {por}) ({linha or linha_da_fila(fila_id)})")


def salvar(**mudancas) -> tuple[int, dict]:
    """prof_plano_salvar do plano de teste: o corpo inteiro (como a tela) com as mudanças por cima do último salvo."""
    corpo = {**CTX["corpo_plano"], **mudancas}
    st, r = pedir(DONO, "prof_plano_salvar", corpo)
    if st == 200:
        CTX["corpo_plano"] = corpo
    return st, r


# ───────────────────────── a guarda da W2: a forma de recebimento × as automáticas vivas ─────────────────────────

def sql_vivas_de_fora(conta: str, pac: str, antes) -> str:
    """Quantas automáticas vivas da conta NÃO são massa desta rodada: as dos outros alunos e as da matrícula de teste que já estavam na
    foto. A guarda conta todas; o E2E não cancela nenhuma delas."""
    return (f"select count(*)::int as n from {S}.aluno_assinaturas a join {S}.pacientes p on p.id = a.paciente_id "
            f"where p.conta_id = '{conta}' and a.status in {VIVAS} "
            f"and not (a.paciente_id = '{pac}' and not (a.id = any({arr_uuid(antes)})))")


def sql_cancelar_vivas_da_rodada(pac: str, antes) -> str:
    """As automáticas VIVAS que a rodada criou na matrícula de teste (fora da foto) viram canceladas no banco — a do sandbox que o MP não
    deixou cancelar fica 'pending'. Só elas: nada de antes, nada de outro aluno."""
    return (f"update {S}.aluno_assinaturas set status = 'cancelled' where paciente_id = '{pac}' "
            f"and not (id = any({arr_uuid(antes)})) and status in {VIVAS} returning id::text as id")


def vivas_de_fora(conta: str, pac: str, antes) -> int:
    return um(sql_vivas_de_fora(conta, pac, antes))["n"]


def motivo_para_nao_comecar(conta: str, pac: str, modo: str | None, antes) -> str | None:
    """O ponto de partida põe a conta no Pix na chave. A guarda da W2 recusa (também para o postgres) se ela estiver num Mercado Pago com
    automática viva — todas de fora da rodada, que ainda não criou nada —, e sair do Mercado Pago do personal desconecta a integração de
    quem a ligou. → o motivo (a rodada não começa e nada é gravado) ou None."""
    if modo == "mercadopago_conta":
        return (f"a conta do {DONO} está no Mercado Pago do personal (W2): sair dele desconecta a integração — a rodada não começa (nada "
                "foi gravado); confira à mão (o desfazer do e2e/w2 não terminou?)")
    if modo in MODOS_MP:
        n = vivas_de_fora(conta, pac, antes)
        if n:
            return (f"a conta do {DONO} está no Mercado Pago com {n} cobrança(s) automática(s) viva(s) de fora da rodada: a guarda da W2 "
                    "recusa a troca para o Pix — a rodada não começa (nada foi gravado); confira à mão")
    return None


def sair_do_mp(conta: str, pac: str, antes, modo: str | None) -> None:
    """Devolve a forma de recebimento mesmo com a automática da RODADA ainda viva (o sandbox recusou cancelar): ela vira cancelada no
    banco ANTES — o caminho que a guarda aceita; as de fora não são tocadas (se houver, a troca é recusada e o erro sobe)."""
    canceladas = sql(sql_cancelar_vivas_da_rodada(pac, antes))
    if canceladas:
        print(f"   {len(canceladas)} automática(s) da rodada ainda viva(s) (o MP não cancelou): cancelada(s) só no banco antes de sair "
              "do Mercado Pago", flush=True)
    sql(f"update {S}.contas set recebimento_modo = {lit(modo)} where id = '{conta}' and recebimento_modo is distinct from {lit(modo)}")


# ───────────────────────── a foto e o desfazer ─────────────────────────

def foto(pac: str, conta: str) -> dict:
    pa = um(f"""select plano_aluno_id::text as plano_aluno_id, plano_modalidade, plano_valor_negociado::text as plano_valor_negociado,
                       mensalidade_valor::text as mensalidade_valor, mensalidade_desde::text as mensalidade_desde,
                       mensalidade_pago_ate::text as mensalidade_pago_ate, cobranca_pausada
                  from {S}.pacientes where id = '{pac}'""")
    modo = (um(f"select recebimento_modo from {S}.contas where id = '{conta}'") or {}).get("recebimento_modo")
    vivas = [x["id"] for x in sql(f"""select id::text as id from {S}.cobrancas where paciente_id = '{pac}' and tipo = 'mensalidade'
                                         and deleted_at is null order by id""")]
    assinaturas = [x["id"] for x in sql(f"select id::text as id from {S}.aluno_assinaturas where paciente_id = '{pac}' order by id")]
    return {"pacientes": pa, "recebimento_modo": modo, "vivas": vivas, "assinaturas": assinaturas}


def guardar_estado(est: dict) -> None:
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)


def ler_estado() -> dict | None:
    if not ESTADO_ARQ.exists():
        return None
    try:
        return json.loads(ESTADO_ARQ.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise RuntimeError(f"o arquivo de estado {ESTADO_ARQ} não abre ({e}): conferir à mão antes de rodar de novo") from e


def preparar() -> None:
    """A foto da matrícula de TESTE (no arquivo de estado ANTES de mexer) e o ponto de partida dos casos: as mensalidades vivas
    escondidas (as parcelas e a cobertura começam do zero; voltam no fim), a cobrança liberada, a conta no Pix manual e uma automática
    simulada já cancelada como a mais recente (o que lê "a assinatura do aluno" pega uma da rodada, nunca uma de antes)."""
    m = matricula_de_teste()
    dono_uid = B.uid(DONO)
    if not m or not m["ativo"] or m["origem"] == "app" or m["dono"] != dono_uid:
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar ativa e na conta do {DONO} ({m})")
    if colunas_wp() != 9:
        raise RuntimeError(f"o {S} está sem as colunas da W-P: aplique a 20261011010000 (e a 20261011020000) antes")
    pac, conta = m["id"], m["conta"]
    sql(f"select {S}.mensalidade_recalcular('{pac}')")  # a régua de hoje: a foto e a volta comparam a mesma conta
    t0 = um("select clock_timestamp()::text as t0")["t0"]
    fila_max = um(f"select coalesce(max(id), 0)::bigint as n from {S}.automaticas_fila")["n"] if tem_fila() else None
    f = foto(pac, conta)
    motivo = motivo_para_nao_comecar(conta, pac, f["recebimento_modo"], f["assinaturas"])
    if motivo:
        raise RuntimeError(motivo)
    est = {"t0": t0, "paciente": pac, "conta": conta, "aluno_uid": m["aluno_uid"], "dono_uid": dono_uid, "fila_max": fila_max,
           "pacientes": f["pacientes"], "recebimento_modo": f["recebimento_modo"], "escondidas": f["vivas"], "assinaturas": f["assinaturas"]}
    guardar_estado(est)  # se a rodada cair no meio, a próxima (ou --limpar) desfaz por este arquivo
    CTX.update(estado=est, pac=pac, conta=conta, dono_uid=dono_uid, aluno_uid=m["aluno_uid"], t0=t0, fila_max=fila_max or 0)
    if est["escondidas"]:
        sql(f"update {S}.cobrancas set deleted_at = now() where id = any({arr_uuid(est['escondidas'])}) and deleted_at is null")
    sql(f"update {S}.pacientes set cobranca_pausada = false where id = '{pac}' and cobranca_pausada")
    sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}' and recebimento_modo is distinct from 'pix_manual'")
    nova_assinatura("cancelled")
    print(f"   matrícula de teste pronta: {len(est['escondidas'])} mensalidade(s) escondida(s) até o fim · estado em {ESTADO_ARQ}", flush=True)


def cancelar_automatica_do_sandbox(est: dict) -> None:
    """A automática de verdade (sandbox) que a rodada criou: cancelada no MP pela própria função (prof_cancelar_assinatura)."""
    vivas = sql(f"""select id::text as id from {S}.aluno_assinaturas where paciente_id = '{est['paciente']}'
                     and not (id = any({arr_uuid(est['assinaturas'])})) and status in ('authorized', 'pending', 'paused')
                     and coalesce(mp_preapproval_id, '') !~ '^(sim-|wp-e2e-)'""")
    if vivas:
        st, r = pedir(DONO, "prof_cancelar_assinatura", {"aluno": est["paciente"]})
        print(f"   a automática do sandbox cancelada no MP: {st} {r.get('erro') or 'ok'}", flush=True)


def limpar(est: dict) -> None:
    pac, conta, t0 = est["paciente"], est["conta"], lit(est["t0"])
    cancelar_automatica_do_sandbox(est)
    # as automáticas da rodada saem ANTES de a conta voltar à forma de antes: a guarda da W2 recusa sair de um Mercado Pago com uma viva
    # (a do sandbox que o MP não cancelou, ou a de um caso que caiu no meio); as de antes da rodada ficam
    sql(f"delete from {S}.aluno_assinaturas where paciente_id = '{pac}' and not (id = any({arr_uuid(est['assinaturas'])}))")
    # a matrícula como estava (o gatilho do plano zera o negociado quando a modalidade volta a nula)
    a = est["pacientes"]
    pausada = "true" if a["cobranca_pausada"] else "false"
    sql(f"""update {S}.pacientes set plano_aluno_id = {lit(a['plano_aluno_id'])}, plano_modalidade = {lit(a['plano_modalidade'])},
                   plano_valor_negociado = {lit(a['plano_valor_negociado'])}, mensalidade_valor = {lit(a['mensalidade_valor'])},
                   mensalidade_desde = {lit(a['mensalidade_desde'])}, cobranca_pausada = {pausada}
             where id = '{pac}'""")
    sql(f"update {S}.contas set recebimento_modo = {lit(est['recebimento_modo'])} where id = '{conta}'")
    # o que a rodada criou
    sql(f"delete from {S}.cobrancas where paciente_id = '{pac}' and created_at >= {t0}::timestamptz")
    if est.get("fila_max") is not None:
        sql(f"delete from {S}.automaticas_fila where paciente_id = '{pac}' and id > {int(est['fila_max'])}")
    sql(f"""delete from {S}.avisos where destino_user_id = any({arr_uuid([est['aluno_uid'], est['dono_uid']])})
              and criado_em >= {t0}::timestamptz""")
    # as mensalidades de antes voltam; os planos de teste saem (a matrícula já saiu deles); a cobertura pela régua
    if est["escondidas"]:
        sql(f"update {S}.cobrancas set deleted_at = null where id = any({arr_uuid(est['escondidas'])})")
    sql(f"delete from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')}")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")


def sobras(est: dict) -> dict:
    pac, t0 = est["paciente"], lit(est["t0"])
    fila = (f", (select count(*) from {S}.automaticas_fila where paciente_id = '{pac}' and id > {int(est['fila_max'])})::int as fila"
            if est.get("fila_max") is not None else "")
    return um(f"""select (select count(*) from {S}.cobrancas where paciente_id = '{pac}' and created_at >= {t0}::timestamptz)::int as cobrancas,
                         (select count(*) from {S}.aluno_assinaturas where paciente_id = '{pac}'
                             and not (id = any({arr_uuid(est['assinaturas'])})))::int as assinaturas,
                         (select count(*) from {S}.avisos where destino_user_id = any({arr_uuid([est['aluno_uid'], est['dono_uid']])})
                             and criado_em >= {t0}::timestamptz)::int as avisos,
                         (select count(*) from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')})::int as planos{fila}""")


def desfazer(est: dict) -> None:
    print("\n── desfazer: sai o que a rodada criou e a matrícula de teste volta à foto de antes")
    try:
        limpar(est)
        agora = foto(est["paciente"], est["conta"])
        sobra = sobras(est)
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/wp/api.py --limpar"[:500])
        return
    antes = {"pacientes": est["pacientes"], "recebimento_modo": est["recebimento_modo"], "vivas": est["escondidas"],
             "assinaturas": est["assinaturas"]}
    difs = diferencas(antes, agora)
    p.check(not difs and not any(sobra.values()),
            f"a matrícula de teste voltou à foto de antes e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── os casos ─────────────────────────

def decisao_1_membro() -> None:
    """Decisão 1 (Weslley, 10/10): só o dono (e o master) vê os planos e os valores — o membro da conta recebe 403 so_o_dono."""
    mb = achar_membro()
    if not mb:
        p.check(False, "decisão 1 sem prova: nenhum membro de TESTE (não dono) ativo, com a senha em ~ e que entra ("
                + ", ".join(c for c, _ in MEMBROS) + ") — rode e2e/w07/contas.py")
        return
    CTX["membro"] = mb
    quem = f"o membro {mb['chave']} ({'/'.join(mb['papeis'] or [])})"
    temp = um(f"""insert into {S}.planos_aluno (conta_id, nome, valor, meses, modalidades)
                  values ('{mb['conta']}', {lit(nome_de_teste())}, 100, 1, array['avista']) returning id::text as id""")["id"]
    try:
        st, r = pedir(mb["chave"], "prof_planos", {"conta_id": mb["conta"]})
        p.check(st == 403 and r.get("erro") == "so_o_dono", f"{quem} não vê os planos da conta: 403 so_o_dono ({st} {r.get('erro')})")
        st, r = pedir(mb["chave"], "prof_plano_salvar", pedido_plano(mb["conta"], nome_de_teste(), 1, 10, ["avista"]))
        p.check(st == 403 and r.get("erro") == "so_o_dono", f"{quem} não grava plano: 403 so_o_dono ({st} {r.get('erro')})")
        st, r = B.rest(mb["chave"], "GET", f"planos_aluno?conta_id=eq.{mb['conta']}&select=id")
        p.check((st == 200 and r == []) or st in (401, 403),
                f"{quem} não lê os planos direto pelo banco (policy 'dono lê' no lugar de 'membros leem') ({st} {r})")
        aluno = aluno_do_membro(mb)
        if aluno:
            # plano que não existe: se a guarda falhasse, o pedido pararia em plano_invalido sem gravar nada na matrícula da outra W
            st, r = pedir(mb["chave"], "prof_definir", pedido_no_plano(aluno, str(uuid.uuid4()), "avista"))
            p.check(st == 403 and r.get("erro") == "so_o_dono", f"{quem} não põe o aluno dele num plano: 403 so_o_dono ({st} {r.get('erro')})")
        else:
            print(f"   ({quem} não é responsável por nenhum aluno da conta: pulei o prof_definir)", flush=True)
    finally:
        sql(f"delete from {S}.planos_aluno where id = '{temp}'")


def caso_planos() -> None:
    print("\n── planos: o dono cria e vê; nome repetido; Pix manual sem cartão parcelado; desativado não entra; trava I5; decisão 1")
    conta, pac = CTX["conta"], CTX["pac"]
    nome = nome_de_teste()
    corpo = pedido_plano(conta, nome, 12, 1000, ["avista", "mensal"])
    st, r = pedir(DONO, "prof_plano_salvar", corpo)
    pl = r.get("plano") or {}
    p.check(st == 200 and pl.get("meses") == 12 and pl.get("valor") == 1000 and pl.get("modalidades") == ["avista", "mensal"]
            and r.get("automaticas") == {"enfileiradas": 0},
            f"o dono cria o plano (12 meses, R$ 1.000, à vista e mês a mês); plano novo não enfileira ({st} {r.get('erro')} {r.get('automaticas')})")
    if st != 200 or not uuid_ok(pl.get("id")):
        return
    CTX["plano"], CTX["corpo_plano"] = pl["id"], {**corpo, "id": pl["id"]}
    plano = CTX["plano"]
    st, r = pedir(DONO, "prof_plano_salvar", pedido_plano(conta, nome.upper(), 1, 10, ["avista"]))
    p.check(st == 409 and r.get("erro") == "nome_repetido", f"nome repetido (em outra caixa) recusado ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_plano_salvar", pedido_plano(conta, f"{nome} X", 6, 10, ["cartao_parcelado"], max_parcelas=3))
    p.check(st == 400 and r.get("erro") == "modalidade_da_conta", f"a conta no Pix manual não oferece cartão parcelado (3.6) ({st} {r.get('erro')})")
    for acao, corpo_aluno in (("prof_plano_salvar", pedido_plano(conta, f"{nome} Y", 1, 10, ["avista"])), ("prof_planos", {"conta_id": conta})):
        st, r = pedir(ALUNO, acao, corpo_aluno)
        p.check(st == 403 and r.get("erro") == "sem_permissao", f"o aluno não chega na tela de Planos ({acao}: {st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_planos", {"conta_id": conta})
    meu = next((x for x in r.get("planos") or [] if x.get("id") == plano), {})
    p.check(st == 200 and meu.get("completo") is True and meu.get("parcela") == parcela_do_plano(1000, 12) and meu.get("alunos") == 0,
            f"a lista do dono traz o plano completo, a parcela 83,33 e 0 alunos ({st} {r.get('erro')} "
            f"{ {k: meu.get(k) for k in ('completo', 'parcela', 'alunos', 'ativo')} })")
    p.check(r.get("modo") == "pix_manual" and r.get("modalidades_da_conta") == ["avista", "mensal"] and r.get("pode_editar") is True,
            f"… com o modo da conta, as modalidades que ela recebe e o pode_editar ({r.get('modo')} {r.get('modalidades_da_conta')} {r.get('pode_editar')})")
    st, r = pedir(DONO, "prof_plano_ativo", {"conta_id": conta, "id": plano, "ativo": False})
    p.check(st == 200 and (r.get("plano") or {}).get("ativo") is False, f"o dono desativa o plano ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "avista", inicio=B.hoje()))
    p.check(st == 400 and r.get("erro") == "modalidade_indisponivel", f"plano desativado não entra na ficha de quem não está nele ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_plano_ativo", {"conta_id": conta, "id": plano, "ativo": True})
    p.check(st == 200 and (r.get("plano") or {}).get("ativo") is True, f"e reativa ({st} {r.get('erro')})")
    st, r = B.rest(DONO, "GET", f"planos_aluno?id=eq.{plano}&select=id")
    p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"o dono lê o plano direto pelo banco (policy 'dono lê') ({st} {r})")
    st, r = B.rest(ALUNO, "GET", f"planos_aluno?id=eq.{plano}&select=id")
    p.check((st == 200 and r == []) or st in (401, 403), f"o aluno não lê o plano direto pelo banco ({st} {r})")
    B.rest(DONO, "PATCH", f"planos_aluno?id=eq.{plano}", {"valor": 1})
    v = um(f"select valor::float as v from {S}.planos_aluno where id = '{plano}'")["v"]
    p.check(v == 1000.0, f"o app não grava direto em planos_aluno, nem o dono (I5: {v})")
    decisao_1_membro()


def caso_periodo() -> None:
    print("\n── periodo: à vista de 12 meses (automática ligada pede o OK; o APK antigo recebe 409; por fora cobre 12 meses)")
    pac, plano = CTX["pac"], CTX["plano"]
    automatica = nova_assinatura("authorized", valor=valor_do_aluno() or 99.9)
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "avista", inicio=B.hoje()))
    mo = um(f"select plano_modalidade as mo from {S}.pacientes where id = '{pac}'")["mo"]
    p.check(st == 409 and r.get("erro") == "automatica_ativa" and mo is None,
            f"com a automática ligada, o período todo pede o OK: 409 automatica_ativa e nada gravado ({st} {r.get('erro')} {mo})")
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "avista", inicio=B.hoje(), cancelar=True))
    ms = r.get("mensalidade") or {}
    p.check(st == 200 and ms.get("valor") == 1000 and ms.get("modalidade") == "avista" and ms.get("meses") == 12 and ms.get("automatica") is False,
            f"com o OK: R$ 1.000 por 12 meses, sem automática ({st} {r.get('erro')} {ms.get('valor')} {ms.get('modalidade')} {ms.get('meses')})")
    est = um(f"select status from {S}.aluno_assinaturas where id = '{automatica}'")["status"]
    p.check(est == "cancelled", f"a automática foi desligada ({est})")
    st, r = pedir(DONO, "prof_definir", pedido_apk_antigo(pac, 99.9))
    p.check(st == 409 and r.get("erro") == "aluno_em_plano_novo", f"o APK antigo não mexe em quem está no plano novo ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_registrar", pedido_por_fora(pac, B.hoje(), "dinheiro"))
    c = r.get("cobranca") or {}
    linha = um(f"""select meses_cobertos, (cobre_ate::date - cobre_de::date) as dias from {S}.cobrancas
                    where id = '{c['id']}'""") if uuid_ok(c.get("id")) else None
    p.check(st == 200 and bool(linha) and linha["meses_cobertos"] == 12 and 360 <= (linha["dias"] or 0) <= 366,
            f"o pagamento por fora cobre 12 meses ({st} {r.get('erro')} {linha})")
    st, r = pedir(ALUNO, "aluno_status")
    mm = (matricula_da_lista(r, pac) or {}).get("mensalidade") or {}
    p.check(st == 200 and mm.get("modalidade") == "avista" and mm.get("meses") == 12 and mm.get("coberta") is True and mm.get("automatica") is False,
            f"o aluno vê o plano de 12 meses coberto e sem automática ({st} {mm.get('modalidade')} {mm.get('coberta')} {mm.get('automatica')})")
    if uuid_ok(c.get("id")):
        st, r = pedir(DONO, "prof_remover", {"cobranca_id": c["id"]})
        ate = um(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{pac}'")["ate"]
        p.check(st == 200 and ate is None, f"remover o pagamento por fora recua a cobertura ({st} {r.get('erro')} {ate})")
    st, r = pedir(DONO, "prof_definir", pedido_modo_de_hoje(pac, 99.9))
    v = um(f"select mensalidade_valor::float as v, plano_modalidade as mo from {S}.pacientes where id = '{pac}'")
    p.check(st == 200 and v == {"v": 99.9, "mo": None}, f"de volta ao modo de hoje com o valor digitado ({st} {r.get('erro')} {v})")


def caso_mensal() -> None:
    print("\n── mensal: mês a mês (parcela 83,33, 'parcela 3 de 12'); a trava I5 segura a gravação direta do dono; a avulsa direta continua")
    pac, plano, conta = CTX["pac"], CTX["plano"], CTX["conta"]
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal", inicio=B.hoje()))
    ms = r.get("mensalidade") or {}
    p.check(st == 200 and ms.get("valor") == parcela_do_plano(1000, 12) and ms.get("automatica") is True and ms.get("parcela") == {"num": 1, "total": 12},
            f"parcela de R$ 83,33, automática liberada, a próxima é a 1 de 12 ({st} {r.get('erro')} {ms.get('valor')} {ms.get('parcela')})")
    ids = []
    for d in (B.dias(-40), B.dias(-10)):
        st, r = pedir(DONO, "prof_registrar", pedido_por_fora(pac, d, "pix"))
        cid = (r.get("cobranca") or {}).get("id")
        p.check(st == 200 and uuid_ok(cid), f"parcela paga por fora em {d} ({st} {r.get('erro')})")
        if uuid_ok(cid):
            ids.append(cid)
    nums = [x["parcela_num"] for x in sql(f"select parcela_num from {S}.cobrancas where id = any({arr_uuid(ids)}) order by pago_em")] if ids else []
    p.check(nums == [1, 2], f"parcelas 1 e 2 ({nums})")
    st, r = pedir(ALUNO, "aluno_status")
    mm = (matricula_da_lista(r, pac) or {}).get("mensalidade") or {}
    p.check(st == 200 and mm.get("parcela") == {"num": 3, "total": 12}, f"o aluno vê: parcela 3 de 12 ({st} {mm.get('parcela')})")
    B.rest(DONO, "PATCH", f"pacientes?id=eq.{pac}", {"mensalidade_valor": 1, "plano_modalidade": "avista", "cobranca_pausada": True})
    v = um(f"select mensalidade_valor::float as v, plano_modalidade as mo, cobranca_pausada as pa from {S}.pacientes where id = '{pac}'")
    p.check(v == {"v": parcela_do_plano(1000, 12), "mo": "mensal", "pa": False}, f"o dono não grava as colunas de cobrança direto (I5: {v})")
    st, r = B.rest(DONO, "POST", "cobrancas", {
        "paciente_id": pac, "conta_id": conta, "nutricionista_id": CTX["dono_uid"], "criado_por": CTX["dono_uid"], "tipo": "avulsa",
        "descricao": "teste wp I5", "valor": 10, "vencimento": B.hoje(), "status": "aberta", "meses_cobertos": 12, "origem": "teste_wp"})
    cid = (r[0] if isinstance(r, list) and r else {}).get("id")
    meses = um(f"select meses_cobertos from {S}.cobrancas where id = '{cid}'") if uuid_ok(cid) else None
    p.check(st in (200, 201) and bool(meses) and meses["meses_cobertos"] == 1, f"a avulsa direta continua, sem período (I5: {st} {meses})")


def caso_fila() -> None:
    print("\n── fila: decisão 2 — a troca do valor das automáticas vai para a fila e a automaticas-fila a esvazia com o segredo S9")
    pac, plano = CTX["pac"], CTX["plano"]
    if not tem_fila():
        p.check(False, f"o {S} está sem a fila ({S}.automaticas_fila): aplique a 20261011030000 antes")
        return
    try:
        segredo = segredo_da_fila()  # o valor nunca vai para a saída
    except RuntimeError as e:
        p.check(False, str(e))
        return
    # 1 aluno (prof_definir): a troca é na hora (1 PUT); o MP recusou → a fila tenta de hora em hora, sem aviso agora
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal", inicio=B.hoje()))
    p.check(st == 200 and (r.get("mensalidade") or {}).get("valor") == parcela_do_plano(1000, 12), f"aluno no mês a mês: R$ 83,33 ({st} {r.get('erro')})")
    falsa = nova_assinatura("authorized", valor=parcela_do_plano(1000, 12), simulada=False)
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal", negociado=75))
    ms = r.get("mensalidade") or {}
    p.check(st == 200 and ms.get("valor") == 75 and ms.get("negociado") == 75 and r.get("automatica") == "na_fila",
            f"negociado com a automática ligada e o MP recusando o PUT → automatica 'na_fila' ({st} {r.get('erro')} {r.get('automatica')} {ms.get('valor')})")
    r1 = ultima_da_fila()
    p.check(bool(r1) and r1["pendente"] and r1["motivo"] == "aluno" and r1["tentativas"] == 0,
            f"a pendência do aluno está na fila (motivo aluno, 0 tentativas, pronta) ({r1})")
    n = um(f"""select count(*)::int as n from {S}.avisos where destino_user_id = '{CTX['dono_uid']}'
                and criado_em >= {lit(CTX['t0'])}::timestamptz and titulo like 'Não deu para mudar o valor%'""")["n"]
    p.check(n == 0, f"sem aviso ao dono agora: a fila tenta de hora em hora e só avisa na 24ª falha ({n})")
    sql(f"update {S}.aluno_assinaturas set status = 'cancelled' where id = '{falsa}'")  # a fila vai achar o aluno sem automática
    # a porta da automaticas-fila (o schema é conferido depois do segredo: com o segredo certo)
    st, r = chamar_fila(None, pedido_fila(S))
    p.check(st == 401 and erro_de(r) == "segredo_invalido", f"automaticas-fila sem o segredo → 401 ({st} {erro_de(r)})")
    st, r = chamar_fila(secrets.token_urlsafe(36), pedido_fila(S))
    p.check(st == 401 and erro_de(r) == "segredo_invalido", f"segredo errado → 401 ({st} {erro_de(r)})")
    st, r = chamar_fila(segredo, pedido_fila("outro"))
    p.check(st == 400 and erro_de(r) == "schema_invalido", f"schema inválido → 400 ({st} {erro_de(r)})")
    st, r = chamar_fila(segredo, pedido_fila([S]))
    p.check(st == 400 and erro_de(r) == "schema_invalido", f"schema que não é texto → 400 ({st} {erro_de(r)})")
    if r1:
        processar_e_conferir(segredo, r1["id"], "a pendência do aluno")
    # o plano (prof_plano_salvar): em lote, pela fila (o pg_net chama a automaticas-fila depois do commit)
    st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal"))
    p.check(st == 200 and (r.get("mensalidade") or {}).get("valor") == parcela_do_plano(1000, 12),
            f"sem o negociado, de volta à parcela do plano ({st} {r.get('erro')})")
    simulada = nova_assinatura("authorized", valor=parcela_do_plano(1000, 12))
    st, r = salvar(valor=1200)
    enf = (r.get("automaticas") or {}).get("enfileiradas")
    p.check(st == 200 and isinstance(enf, int) and enf >= 1,
            f"o dono muda o valor do plano com o aluno em automática → enfileiradas ≥ 1 ({st} {r.get('erro')} {r.get('automaticas')})")
    v = valor_do_aluno()
    p.check(v == parcela_do_plano(1200, 12), f"o valor do aluno acompanha o plano: 1.200 ÷ 12 = 100,00 ({v})")
    r2 = ultima_da_fila("plano")
    p.check(bool(r2), f"a pendência do plano está na fila (motivo plano) ({r2})")
    if r2:
        processar_e_conferir(segredo, r2["id"], "a pendência do plano")
    sql(f"update {S}.aluno_assinaturas set status = 'cancelled' where id = '{simulada}'")
    esperado = 1 if ativas_do_aluno() else 0  # uma automática ativa de antes da rodada também entra (a fila acha a mais recente: cancelada)
    st, r = salvar(valor=1000)
    p.check(st == 200 and (r.get("automaticas") or {}).get("enfileiradas") == esperado,
            f"sem automática ativa o aluno não entra na fila (enfileiradas {esperado}) ({st} {r.get('erro')} {r.get('automaticas')})")


def caso_mp() -> None:
    print("\n── mp: conta no Mercado Pago (sandbox) — cartão parcelado até 3×, automática só no mês a mês")
    pac, plano, conta = CTX["pac"], CTX["plano"], CTX["conta"]
    faltam = [n for n in (".physiq-mp-test", ".physiq-mp-public-test") if not (Path.home() / n).exists()]
    if faltam:
        p.check(False, f"falta a credencial de TESTE do Mercado Pago em ~ ({faltam})")
        return
    antes = CTX["estado"]["assinaturas"]
    fora = vivas_de_fora(conta, pac, antes)
    if fora:
        p.check(False, f"a conta do {DONO} tem {fora} cobrança(s) automática(s) viva(s) de fora da rodada: o caso mp não liga o Mercado Pago "
                       "(a guarda da W2 recusaria a volta ao Pix e o E2E não mexe no que não criou) — pulei")
        return
    sql(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{conta}'")  # liberar o MP é do master: aqui, pelo banco
    try:
        st, r = salvar(valor=1000, modalidades=list(MODALIDADES), max_parcelas_cartao=3)
        p.check(st == 200 and (r.get("plano") or {}).get("max_parcelas_cartao") == 3, f"o plano aceita cartão parcelado até 3× ({st} {r.get('erro')})")
        esconder_mensalidades_da_rodada()
        st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "cartao_parcelado", cancelar=True))
        ms = r.get("mensalidade") or {}
        p.check(st == 200 and ms.get("modalidade") == "cartao_parcelado" and ms.get("max_parcelas") == 3 and ms.get("valor") == 1000,
                f"aluno no cartão parcelado: R$ 1.000 em até 3× ({st} {r.get('erro')} {ms.get('max_parcelas')})")
        st, r = pedir(ALUNO, "aluno_mp_cartao", pedido_cartao(pac, B.token_cartao("APRO"), 4))
        p.check(st == 400 and r.get("erro") == "parcelas_invalidas", f"4× recusado (o plano deixa até 3×) ({st} {r.get('erro')})")
        st, r = pedir(ALUNO, "aluno_mp_cartao", pedido_cartao(pac, B.token_cartao("APRO"), 3))
        c = r.get("cobranca") or {}
        linha = um(f"select meses_cobertos, valor::float as v from {S}.cobrancas where id = '{c['id']}'") if uuid_ok(c.get("id")) else None
        p.check(st == 200 and c.get("status") == "paga" and linha == {"meses_cobertos": 12, "v": 1000.0},
                f"3× aprovado (APRO) cobre os 12 meses ({st} {r.get('erro') or r.get('status')} {linha})")
        st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": pac, "checkout": True})
        p.check(st == 400 and r.get("erro") == "modalidade_sem_automatica", f"sem automática no período todo ({st} {r.get('erro')})")
        esconder_mensalidades_da_rodada()
        st, r = pedir(DONO, "prof_definir", pedido_no_plano(pac, plano, "mensal"))
        p.check(st == 200 and (r.get("mensalidade") or {}).get("valor") == parcela_do_plano(1000, 12), f"aluno no mês a mês ({st} {r.get('erro')})")
        st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": pac, "checkout": True})
        a = r.get("assinatura") or {}
        p.check(st == 200 and a.get("valor") is not None and float(a["valor"]) == parcela_do_plano(1000, 12),
                f"automática no mês a mês com a parcela (pendente no sandbox) ({st} {r.get('erro')} {a.get('status')} {a.get('valor')})")
    finally:
        cancelar_automatica_do_sandbox(CTX["estado"])
        sair_do_mp(conta, pac, antes, "pix_manual")  # a automática que o sandbox não cancelou não segura a volta (a guarda da W2)


FUNCOES = {"planos": caso_planos, "periodo": caso_periodo, "mensal": caso_mensal, "fila": caso_fila, "mp": caso_mp}


# ───────────────────────── --seco ─────────────────────────

def ambiente(casos: list[str]) -> None:
    """Só leitura: as migrations e a policy nova no staging, as 2 funções publicadas, o segredo S9 nos 2 lados, as chaves do MP."""
    p.check(colunas_wp() == 9, f"{S}: as colunas da W-P (20261011010000)")
    pol = {x["policyname"] for x in sql(f"select policyname from pg_policies where schemaname = '{S}' and tablename = 'planos_aluno'")}
    p.check("planos_aluno: dono lê" in pol and not pol & {"planos_aluno: membros leem", "planos_aluno: dono edita"},
            f"{S}: planos_aluno só o dono lê e ninguém grava direto (20261011020000 reaplicada) ({sorted(pol)})")
    for slug, jwt in (("pagamentos-aluno", True), ("automaticas-fila", False)):
        st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/functions/{slug}", None,
                          {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
        r = r if isinstance(r, dict) else {}
        quando = time.strftime("%d/%m %H:%M", time.localtime(r["updated_at"] / 1000)) if isinstance(r.get("updated_at"), (int, float)) else "?"
        p.check(st == 200 and r.get("verify_jwt") is jwt, f"função {slug} publicada com verify_jwt {str(jwt).lower()} "
                                                          f"(HTTP {st}, versão {r.get('version')}, {quando}, {r.get('status')})")
    if "fila" in casos:
        p.check(tem_fila(), f"{S}: a fila das automáticas (20261011030000)")
        job = um(f"select count(*)::int as n from cron.job where jobname = 'automaticas-fila-{S}'")["n"]
        p.check(job == 1, f"o pg_cron automaticas-fila-{S} existe ({job})")
        vault = um(f"select exists (select 1 from vault.secrets where name = '{VAULT}') as ok")["ok"]
        p.check(bool(vault), f"o Vault {VAULT} existe (o pg_net manda o segredo na automaticas-fila)")
        try:
            segredo_da_fila()
            p.check(True, f"~/{ARQ_SEGREDO} com o segredo S9 (o valor não aparece)")
        except RuntimeError as e:
            p.check(False, str(e))
    if "mp" in casos:
        faltam = [n for n in (".physiq-mp-test", ".physiq-mp-public-test") if not (Path.home() / n).exists()]
        p.check(not faltam, f"a credencial de TESTE do Mercado Pago em ~ ({faltam or 'ok'})")


def seco(casos: list[str]) -> int:
    print("── seco: os logins e a montagem dos pedidos (+ leituras) — nenhuma ação é chamada, nada é gravado")
    if ESTADO_ARQ.exists():
        p.check(False, f"há uma rodada que não foi desfeita ({ESTADO_ARQ}): rode  python3 e2e/wp/api.py --limpar")
    for conta in (DONO, ALUNO):
        p.check(login_ok(conta), f"login da conta de TESTE {conta} ({B.CONTAS[conta][0]})")
    m = matricula_de_teste()
    dono_uid = B.uid(DONO)
    p.check(bool(m) and m["ativo"] and m["origem"] != "app" and m["dono"] == dono_uid,
            f"a matrícula de TESTE do {ALUNO} está ativa e na conta do {DONO}, fora da conta do app ({m})")
    mb = achar_membro()
    p.check(bool(mb), f"membro de TESTE (não dono) para a decisão 1: {mb['chave'] + ' (' + '/'.join(mb['papeis'] or []) + ')' if mb else 'nenhum'}")
    ambiente(casos)
    if m:
        pedidos = pedidos_da_rodada(m["id"], m["conta"], str(uuid.uuid4()), mb, aluno_do_membro(mb) if mb else None, B.hoje(), B.dias(-40))
        ruins = [(c, a, validar_pedido(a, corpo)) for c, a, corpo in pedidos if validar_pedido(a, corpo)]
        contagem = Counter(a for _, a, _ in pedidos)
        p.check(not ruins, f"{len(pedidos)} pedidos montados com o contrato da pagamentos-aluno ({ruins or dict(contagem)})")
        p.check(set(cab_fila("x" * 32)) == {"x-espelho-segredo"} and cab_fila(None) == {} and pedido_fila(S) == {"schema": "staging"},
                "o pedido da automaticas-fila: x-espelho-segredo + {schema: staging} (e sem o cabeçalho para o 401)")
    return p.fim()


# ───────────────────────── main ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W-P — E2E de servidor dos planos do aluno (staging)")
    ap.add_argument("--casos", default=",".join(CASOS), help=f"lista separada por vírgula ({', '.join(CASOS)}); o planos entra sempre")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true", help="só os logins e a montagem dos pedidos (nenhuma ação, nada gravado)")
    modo.add_argument("--limpar", action="store_true", help="só desfaz uma rodada que caiu no meio")
    a = ap.parse_args()
    try:
        casos = casos_da_linha(a.casos)
    except ValueError as e:
        ap.error(str(e))
    carregar_base()
    if not B.saude_treino():
        print("   o banco do Treino não está saudável — parar (regra de 10/10)")
        return 2
    if a.seco:
        return seco(casos)
    pendente = ler_estado()
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer(pendente)
        if ESTADO_ARQ.exists():
            return p.fim()  # não desfez: não empilha outra rodada por cima
    if a.limpar:
        if not pendente:
            n = um(f"select count(*)::int as n from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')}")["n"]
            p.check(n == 0, f"nenhuma rodada pendente e nenhum plano '{PREFIXO} …' sobrando no {S} ({n})")
        return p.fim()
    print(f"── W-P api ({S}): {', '.join(casos)}")
    try:
        preparar()
    except Exception as e:  # noqa: BLE001
        p.check(False, f"preparar quebrou: {e!r}"[:400])
        if CTX.get("estado"):
            desfazer(CTX["estado"])
        return p.fim()
    try:
        for nome in casos:
            if nome != "planos" and not CTX.get("plano"):
                p.check(False, f"[{nome}] sem o plano de teste (o caso planos não o criou) — pulei")
                continue
            try:
                FUNCOES[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    finally:
        desfazer(CTX["estado"])
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
