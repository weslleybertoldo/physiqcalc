#!/usr/bin/env python3
"""Physiq W1b — E2E de SERVIDOR da conferência do pagamento do Mercado Pago (a 2ª camada do C1: pagamentoDaLinha → pagamentoEDaCobranca)
na pagamentos-aluno PUBLICADA, no STAGING, com o sandbox do MP (a credencial de TESTE) e as contas de TESTE do e2e/w06: o aluno-calc
(teste@teste.com) e o master de teste (dono da conta "Admin Teste"). É teste de REGRESSÃO do NOSSO servidor: as linhas de cobrança são
gravadas pelo "servidor de teste" (REST com a chave de serviço — o service_role, que a guarda do banco não pega: o retrato de uma linha de
antes da guarda ou de um erro do master) e os pagamentos são Pix PENDENTES do sandbox, sem notification_url (nenhum webhook é avisado por
estes pedidos; nada é aprovado, nada a estornar).
Casos:
  legitimo  a avulsa de TESTE com um Pix cuja referência é a DELA (physiq:staging:aluno:<matrícula>:avulsa:<cobrança>, a que a
            pagamentos-aluno grava) → o detalhe_mp responde 200 com o pagamento, para o aluno e para o master; o prof_cobranca_cancelar
            dá 200 e fecha o Pix dela no MP (o GET a mais da W1b não atrapalha o caminho legítimo)
  outro     a linha "paga pelo MP" com o id de um Pix de OUTRA referência — a do plano da conta (physiq:staging:conta:<conta>:mensal:<uma
            fatura que não existe>), o ataque do C1 → prof_reembolsar e detalhe_mp (aluno e master) = 409 cobranca_de_outro_pagamento, sem
            nenhum dado do pagamento; aguardando → prof_cobranca_cancelar = 409 e a linha fica; o Pix segue pendente no MP, sem estorno
Cada 409 manda o aviso de erro [staging] "cobranca_de_outro_pagamento" (o rastro do C1 — esperado; a trava do registrar_aviso_erro segura
a repetição).
Desfazer: ANTES de mexer, a foto (as cobranças da matrícula do aluno-calc fora as de teste, as de teste, o modo da conta e as
automáticas) vai para ~/projetos/physiqcalc-scratch/w1b/api-estado.json, e cada Pix criado no sandbox entra nele na hora; no fim (ou na
próxima rodada / --limpar, se esta cair no meio) o Pix ainda aberto é cancelado no sandbox, as linhas de teste (origem 'teste_w1b_api')
saem e o último ✅ confere a foto.
Precisa: a pagamentos-aluno com a conferência da W1b publicada (sem ela o detalhe responde 200 e o estorno tenta o /refunds de um Pix
pendente: o MP recusa e nada sai), ~/.pc-pat, as senhas das contas de TESTE e a credencial de TESTE do MP (~/.physiq-mp-test). O sandbox
do MP às vezes devolve 500 (11/10 14:06): confira antes — sem ele os casos ficam ❌ e nada fica gravado.
Uso: python3 e2e/w1b/api_w1b.py [--casos legitimo,outro] [--sinal ARQ] [--seco | --limpar]
  --seco    monta e confere aqui as referências, os pedidos ao MP e ao banco e o desfazer — NADA vai à rede (nem o login)
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
  --sinal   o arquivo-sinal da trava do banco do staging (dividido entre sessões): sem ele a rodada não começa; se ele sumir no meio,
            a rodada para ANTES do próximo caso, desfaz e sai com 3
Saída sem dado pessoal: ids de teste, códigos e status.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.dont_write_bytecode = True

S = "staging"
ALUNO, DONO = "aluno-calc", "master"
ORIGEM = "teste_w1b_api"   # a marca das linhas desta rodada (outra que a do sql_w1b.py: um desfazer não apaga o do outro)
CASOS = ("legitimo", "outro")
ESTADO_ARQ = Path.home() / "projetos" / "physiqcalc-scratch" / "w1b" / "api-estado.json"
RAIZ = Path(__file__).resolve().parent.parent.parent
PAGADOR = "comprador.physiqcalc@example.com"   # o pagador genérico do sandbox (o do MP_TEST_PAYER_EMAIL e do e2e/w06)
ABERTOS = ("pending", "in_process", "authorized")
FECHADOS = ("cancelled", "refunded", "rejected", "expired", "charged_back")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

B = None  # a base dos E2E da W6 (e2e/w06/_base.py), carregada no main
p = None
CTX: dict = {}


# ───────────────────────── a base, a rede e o banco ─────────────────────────

def carregar_base() -> None:
    global B, p
    if B is not None:
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
    import _base  # noqa: PLC0415

    B, p = _base, _base.p
    B.ESTADO["schema"] = S


def um(q: str) -> dict | None:
    r = B.sql_principal(q)
    return r[0] if r else None


def cab_servidor(chave: str) -> dict:
    """O servidor de teste: a chave de serviço (service_role) SÓ no schema staging."""
    return {"apikey": chave, "Authorization": f"Bearer {chave}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}


def rest_servidor(metodo: str, caminho: str, corpo=None) -> tuple[int, object]:
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/rest/v1/{caminho}", corpo, cab_servidor(B.service(B.PRINCIPAL_REF)))
    return st, r


def saude_principal(limite_s: float = 10.0) -> bool:
    """/health do banco principal pela Management API (o molde do e2e/w1/api.py)."""
    t0 = time.time()
    st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/health?services=db&services=auth&services=rest", None,
                      {"Authorization": f"Bearer {B.ler('.pc-pat')}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < limite_s
    print(f"   /health do principal: {st} {[(x.get('name'), x.get('status')) for x in (r or [])] if isinstance(r, list) else r} em {dt_:.1f} s",
          flush=True)
    return ok


# ───────────────────────── o que vai ao MP e ao banco (puro: o --seco confere) ─────────────────────────

def referencia_aluno(pac: str, cobranca: str) -> str:
    """A que a pagamentos-aluno grava no pedido da avulsa (referenciaAluno do _shared/financeiro-regras.ts)."""
    return f"physiq:{S}:aluno:{pac}:avulsa:{cobranca}"


def referencia_de_fora(conta: str, fatura: str) -> str:
    """A do PLANO da conta (referenciaConta do _shared/cobranca-regras.ts) com uma fatura que NÃO existe: o ataque do C1 sem efeito em
    lugar nenhum (se algum aviso chegasse, a mp-webhook-conta diria fatura_inexistente e a mp-webhook-aluno, nao_e_de_aluno)."""
    return f"physiq:{S}:conta:{conta}:mensal:{fatura}"


def pedido_pix(referencia: str, descricao: str) -> dict:
    """Um Pix de R$ 1,00 no sandbox, sem notification_url e sem cartão: fica pendente (nada aprovado, nada a estornar)."""
    return {"transaction_amount": 1, "payment_method_id": "pix", "payer": {"email": PAGADOR}, "external_reference": referencia,
            "description": descricao}


def linha_do_servidor(pac: str, conta: str, dono: str, vencimento: str, status: str, descricao: str, mp_id: str | None,
                      mp_status: str | None) -> dict:
    """A avulsa "do MP" como o servidor grava (criado_por nulo), com a origem de teste."""
    return {"paciente_id": pac, "conta_id": conta, "nutricionista_id": dono, "criado_por": None, "tipo": "avulsa", "descricao": descricao,
            "valor": 1, "vencimento": vencimento, "status": status, "forma": "mp", "metodo": "pix", "mp_payment_id": mp_id,
            "mp_status": mp_status, "origem": ORIGEM}


def caminho_limpar(pac: str) -> str:
    """O DELETE do desfazer: SÓ as linhas de teste desta rodada na matrícula de TESTE."""
    return f"cobrancas?paciente_id=eq.{pac}&origem=eq.{ORIGEM}"


def sql_foto(pac: str, conta: str) -> str:
    fora = f"c.paciente_id = '{pac}' and c.origem is distinct from '{ORIGEM}'"
    return f"""select (select count(*) from {S}.cobrancas c where {fora})::int as n,
                      (select md5(coalesce(string_agg(c.id::text || c.status || coalesce(c.forma, '') || coalesce(c.mp_payment_id, '')
                                                      || c.updated_at::text, ',' order by c.id), '')) from {S}.cobrancas c where {fora}) as assinatura,
                      (select count(*) from {S}.cobrancas c where c.paciente_id = '{pac}' and c.origem = '{ORIGEM}')::int as teste,
                      (select recebimento_modo from {S}.contas where id = '{conta}') as modo,
                      (select count(*) from {S}.aluno_assinaturas where paciente_id = '{pac}')::int as automaticas"""


def limpeza_no_mp(status: str | None) -> str:
    """O desfazer no sandbox: o Pix ainda aberto é cancelado; aprovado (não devia haver: só Pix pendente) é estornado; o resto fica."""
    if status in ABERTOS:
        return "cancelar"
    return "estornar" if status == "approved" else "nada"


# ───────────────────────── a foto e o desfazer ─────────────────────────

def foto(pac: str, conta: str) -> dict:
    return B.sql_principal("set transaction read only;\n" + sql_foto(pac, conta))[0]


def salvar_estado(est: dict) -> None:
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)


def preparar() -> None:
    m = B.matricula(ALUNO)
    conta = um(f"select c.dono_id::text as dono, c.origem from {S}.contas c where c.id = '{m['conta_id']}'")
    if not conta or conta["origem"] == "app" or conta["dono"] != B.uid(DONO):
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar na conta do {DONO} ({conta})")
    est = {"paciente": m["id"], "conta": m["conta_id"], "dono": conta["dono"], "foto": foto(m["id"], m["conta_id"]), "pagamentos": []}
    if est["foto"]["teste"]:
        raise RuntimeError(f"já há linha '{ORIGEM}' na matrícula de TESTE sem o arquivo de estado (outra rodada?): confira e apague-as")
    salvar_estado(est)
    CTX.update(estado=est, pac=m["id"], conta=m["conta_id"], dono=conta["dono"])


def status_no_mp(pid: str, tentativas: int = 3) -> str:
    """O status do pagamento no sandbox (o PUT/estorno pode demorar um instante para aparecer no GET)."""
    situacao = "?"
    for i in range(tentativas):
        st, pay = B.mp_teste("GET", f"/v1/payments/{pid}")
        situacao = str(pay.get("status")) if st == 200 and isinstance(pay, dict) else f"HTTP {st}"
        if situacao in FECHADOS or i == tentativas - 1:
            break
        time.sleep(2)
    return situacao


def desfazer(est: dict) -> None:
    print("\n── desfazer: o Pix de TESTE ainda aberto é cancelado no sandbox, as linhas de teste saem e a foto tem que ser a mesma")
    finais: dict[str, str] = {}
    try:
        for pid in est["pagamentos"]:
            acao = limpeza_no_mp(status_no_mp(pid, 1))
            if acao == "cancelar":
                B.mp_teste("PUT", f"/v1/payments/{pid}", {"status": "cancelled"})
            elif acao == "estornar":
                B.mp_teste("POST", f"/v1/payments/{pid}/refunds", {})
            finais[pid] = status_no_mp(pid)
        st, r = rest_servidor("DELETE", caminho_limpar(est["paciente"]))
        if st not in (200, 204):
            raise RuntimeError(f"DELETE das linhas de teste: HTTP {st} {str(r)[:200]}")
        agora = foto(est["paciente"], est["conta"])
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/w1b/api_w1b.py --limpar"[:500])
        return
    fechados = all(v in FECHADOS for v in finais.values())
    p.check(agora == est["foto"] and fechados,
            f"tudo voltou à foto e os Pix de TESTE estão fechados no sandbox (foto igual: {agora == est['foto']} · linhas de teste: "
            f"{agora['teste']} · Pix: {finais or 'nenhum'})")
    if agora == est["foto"] and fechados:
        ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── os casos ─────────────────────────

def criar_pix(referencia: str, descricao: str) -> str | None:
    """Um Pix pendente no sandbox (a credencial de TESTE): o id entra no estado NA HORA (o desfazer o cancela)."""
    st, pay = B.mp_teste("POST", "/v1/payments", pedido_pix(referencia, descricao))
    pay = pay if isinstance(pay, dict) else {}
    pid = str(pay["id"]) if pay.get("id") else None
    if pid:
        CTX["estado"]["pagamentos"].append(pid)
        salvar_estado(CTX["estado"])
    ok = st in (200, 201) and bool(pid) and pay.get("status") == "pending"
    p.check(ok, f"Pix de TESTE pendente no sandbox ({descricao}: {st} {pay.get('status') or pay.get('error') or pay.get('message')})"[:300])
    return pid if ok else None


def gravar_linha(corpo: dict) -> str:
    """O servidor de teste grava a cobrança (REST + chave de serviço): a guarda do banco não pega o service_role."""
    st, r = rest_servidor("POST", "cobrancas", corpo)
    cid = (r[0] if isinstance(r, list) and r else {}).get("id")
    if st not in (200, 201) or not cid:
        raise RuntimeError(f"o servidor de teste não gravou a linha ({st} {str(r)[:200]})")
    return cid


def linha_agora(c: str) -> dict:
    return um(f"select status, forma, mp_payment_id, reembolsado_em is not null as estornada from {S}.cobrancas where id = '{c}'") or {}


def caso_legitimo() -> None:
    print("\n── legitimo: o Pix com a referência DESTA cobrança — o detalhe responde e o cancelar fecha no MP")
    c = gravar_linha(linha_do_servidor(CTX["pac"], CTX["conta"], CTX["dono"], B.hoje(), "aguardando_confirmacao", "teste w1b legítima",
                                       None, None))
    x = criar_pix(referencia_aluno(CTX["pac"], c), "w1b legitimo")
    if not x:
        return
    st, r = rest_servidor("PATCH", f"cobrancas?id=eq.{c}", {"mp_payment_id": x, "mp_status": "pending"})
    p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"o servidor de teste grava o id do Pix na linha ({st})")
    for conta in (ALUNO, DONO):
        st, r = B.pag(conta, "detalhe_mp", {"cobranca_id": c})
        mp = r.get("mp") or {}
        p.check(st == 200 and mp.get("mp_payment_id") == x and mp.get("status") == "pending",
                f"detalhe_mp do pagamento DESTA cobrança, como o {conta}: 200 com o pagamento ({st} {r.get('erro') or mp.get('status')})")
    st, r = B.pag(DONO, "prof_cobranca_cancelar", {"cobranca_id": c})
    situacao = status_no_mp(x)
    p.check(st == 200 and linha_agora(c).get("status") == "cancelada" and situacao == "cancelled",
            f"prof_cobranca_cancelar: 200, a linha cancelada e o Pix DELA fechado no MP ({st} {r.get('erro')} · MP {situacao})")


def caso_outro() -> None:
    print("\n── outro: a linha com o Pix de OUTRA referência (a do plano da conta — o ataque do C1) → 409 e nada vai ao MP")
    y = criar_pix(referencia_de_fora(CTX["conta"], str(uuid.uuid4())), "w1b outro")
    if not y:
        return
    c = gravar_linha(linha_do_servidor(CTX["pac"], CTX["conta"], CTX["dono"], B.hoje(), "paga", "teste w1b de outro pagamento", y,
                                       "approved"))
    st, r = B.pag(DONO, "prof_reembolsar", {"cobranca_id": c})
    p.check(st == 409 and r.get("erro") == "cobranca_de_outro_pagamento",
            f"prof_reembolsar → 409 cobranca_de_outro_pagamento, sem ir ao /refunds ({st} {r.get('erro')})")
    for conta in (ALUNO, DONO):
        st, r = B.pag(conta, "detalhe_mp", {"cobranca_id": c})
        p.check(st == 409 and r.get("erro") == "cobranca_de_outro_pagamento" and "mp" not in r,
                f"detalhe_mp como o {conta} → 409 sem nenhum dado do pagamento ({st} {r.get('erro')})")
    st, r = rest_servidor("PATCH", f"cobrancas?id=eq.{c}", {"status": "aguardando_confirmacao", "mp_status": "pending"})
    if st != 200:
        raise RuntimeError(f"o servidor de teste não voltou a linha para aguardando ({st} {str(r)[:200]})")
    st, r = B.pag(DONO, "prof_cobranca_cancelar", {"cobranca_id": c})
    agora = linha_agora(c)
    p.check(st == 409 and r.get("erro") == "cobranca_de_outro_pagamento" and agora.get("status") == "aguardando_confirmacao",
            f"prof_cobranca_cancelar → 409 e a linha fica aguardando ({st} {r.get('erro')} · {agora.get('status')})")
    st, pay = B.mp_teste("GET", f"/v1/payments/{y}")
    pay = pay if isinstance(pay, dict) else {}
    p.check(st == 200 and pay.get("status") == "pending" and not pay.get("refunds"),
            f"o Pix de fora segue pendente no MP, sem estorno ({st} {pay.get('status')} · estornos {len(pay.get('refunds') or [])})")


FUNCOES = {"legitimo": caso_legitimo, "outro": caso_outro}


# ───────────────────────── seco, ambiente e main ─────────────────────────

class _SemRede(RuntimeError):
    pass


def sem_rede() -> list:
    """--seco: toda ida à rede (o urlopen e o opener sem redirecionamento do _comum) vira erro — e fica anotada."""
    idas: list = []

    def barrar(*a, **k):
        alvo = a[-1] if a else k.get("url")
        idas.append(str(getattr(alvo, "full_url", alvo))[:80])
        raise _SemRede("seco: ida à rede")

    urllib.request.urlopen = barrar  # type: ignore[assignment]
    urllib.request.OpenerDirector.open = barrar  # type: ignore[method-assign]
    return idas


def molde_no_servidor() -> tuple[bool, bool]:
    """As referências daqui têm o MESMO molde das do servidor: o referenciaAluno e o referenciaConta na fonte."""
    fin = (RAIZ / "supabase-principal/functions/_shared/financeiro-regras.ts").read_text(encoding="utf-8")
    cob = (RAIZ / "supabase-principal/functions/_shared/cobranca-regras.ts").read_text(encoding="utf-8")
    return ('return `physiq:${schema}:aluno:${pacienteId}:${tipo}${cobrancaId ? `:${cobrancaId}` : ""}`;' in fin,
            'return `physiq:${schema}:conta:${contaId}:${tipo}${faturaId ? `:${faturaId}` : ""}`;' in cob)


def seco(casos: list[str]) -> int:
    print("── seco: as referências, os pedidos ao MP e ao banco e o desfazer montados e conferidos aqui — NADA vai à rede (nem o login)")
    idas = sem_rede()
    pac, conta, cob, fatura, dono = (str(uuid.uuid4()) for _ in range(5))
    aluno_ts, conta_ts = molde_no_servidor()
    ref, fora = referencia_aluno(pac, cob), referencia_de_fora(conta, fatura)
    p.check(aluno_ts and ref == f"physiq:{S}:aluno:{pac}:avulsa:{cob}",
            "seco: a referência legítima tem o molde do referenciaAluno do servidor (physiq:staging:aluno:<matrícula>:avulsa:<cobrança>)")
    partes = fora.split(":")
    p.check(conta_ts and partes[:3] == ["physiq", S, "conta"] and partes[4] == "mensal" and all(UUID.match(x) for x in (partes[3], partes[5])),
            "seco: a de fora tem o molde do referenciaConta (o plano da conta, com uma fatura inventada): não é de aluno e começa com "
            "physiq — a conferência a recusa sem olhar o Calc nem as automáticas")
    pix = pedido_pix(fora, "w1b")
    p.check(pix["payment_method_id"] == "pix" and pix["transaction_amount"] == 1 and not ({"notification_url", "token", "metadata"} & set(pix)),
            "seco: o pedido ao sandbox é um Pix de R$ 1,00 sem notification_url, sem cartão e sem automática (nada aprovado, nenhum webhook)")
    linha = linha_do_servidor(pac, conta, dono, "2026-10-11", "paga", "teste w1b", "123", "approved")
    p.check(linha["origem"] == ORIGEM != "teste_w1b" and linha["forma"] == "mp" and linha["criado_por"] is None and linha["tipo"] == "avulsa",
            f"seco: a linha do servidor de teste é a avulsa do MP como o servidor grava (sem autor), com a origem '{ORIGEM}' (não a do sql_w1b)")
    cab = cab_servidor("chave-de-mentira")
    p.check(cab["Accept-Profile"] == S and cab["Content-Profile"] == S, "seco: a chave de serviço só fala com o schema staging")
    q = sql_foto(pac, conta)
    p.check(set(re.findall(r"\b(\w+)\.(?:cobrancas|contas|aluno_assinaturas)\b", q)) == {S} and not re.search(r"\b(update|delete|insert)\b", q, re.I),
            "seco: a foto só LÊ o staging")
    p.check(caminho_limpar(pac) == f"cobrancas?paciente_id=eq.{pac}&origem=eq.{ORIGEM}",
            f"seco: o desfazer apaga SÓ as linhas '{ORIGEM}' da matrícula de TESTE")
    p.check([limpeza_no_mp(s) for s in ("pending", "in_process", "authorized", "approved", "cancelled", "refunded", "rejected", None)]
            == ["cancelar"] * 3 + ["estornar"] + ["nada"] * 4,
            "seco: no desfazer o Pix aberto é cancelado, o aprovado (não devia haver) é estornado e o fechado fica")
    est = {"paciente": pac, "conta": conta, "dono": dono, "foto": {"n": 1, "assinatura": "x", "teste": 0, "modo": "pix_manual", "automaticas": 0},
           "pagamentos": ["1"]}
    p.check(json.loads(json.dumps(est)) == est and ESTADO_ARQ.parent.name == "w1b", f"seco: o estado da rodada vai e volta em JSON ({ESTADO_ARQ})")
    p.check(set(casos) <= set(FUNCOES) and set(FUNCOES) == set(CASOS), f"seco: os casos pedidos existem ({', '.join(casos)})")
    try:
        B.http("GET", "https://exemplo.invalid/seco")
        barrou = False
    except _SemRede:
        barrou = True
    p.check(barrou and idas == ["https://exemplo.invalid/seco"], f"seco: a rede está barrada e ninguém foi a ela antes da sonda ({idas})")
    return p.fim()


def ambiente() -> None:
    """Só leitura: a pagamentos-aluno publicada (a versão vai na saída — a W1b é a que tem a conferência)."""
    st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/functions/pagamentos-aluno", None,
                      {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
    r = r if isinstance(r, dict) else {}
    p.check(st == 200 and r.get("verify_jwt") is True, f"a pagamentos-aluno publicada com verify_jwt true (versão {r.get('version')})")


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W1b — E2E de servidor da conferência do pagamento do MP (staging)")
    ap.add_argument("--casos", default=",".join(CASOS), help="lista separada por vírgula (padrão: todos)")
    ap.add_argument("--sinal", default=None, help="arquivo-sinal da trava do banco do staging: sem ele não começa; sumiu → para antes do próximo caso")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true", help="só monta e confere: nada vai à rede")
    modo.add_argument("--limpar", action="store_true", help="só desfaz uma rodada que caiu no meio")
    a = ap.parse_args()
    casos = [c.strip() for c in a.casos.split(",") if c.strip()]
    if any(c not in CASOS for c in casos):
        ap.error(f"casos: {', '.join(CASOS)}")
    carregar_base()
    if a.seco:
        return seco(casos)
    if not B.saude_treino() or not saude_principal():
        print("   o banco do Treino ou o principal não está saudável — parar (regra de 10/10)")
        return 2
    pendente = json.loads(ESTADO_ARQ.read_text(encoding="utf-8")) if ESTADO_ARQ.exists() else None
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer(pendente)
        if ESTADO_ARQ.exists():
            return p.fim()
    if a.limpar:
        return p.fim()
    sinal = Path(a.sinal).expanduser() if a.sinal else None
    if sinal and not sinal.exists():
        print(f"   sem o sinal {sinal} (a trava do banco do staging): a rodada não começa", flush=True)
        return 3
    ambiente()
    try:
        preparar()
    except Exception as e:  # noqa: BLE001
        p.check(False, f"preparar quebrou (nada foi gravado): {e!r}"[:400])
        return p.fim()
    try:
        for nome in casos:
            if sinal and not sinal.exists():
                print(f"\n⏸️  o sinal {sinal.name} sumiu (o banco do staging voltou para a outra sessão): parei antes do caso '{nome}'", flush=True)
                CTX["interrompida"] = nome
                break
            try:
                FUNCOES[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    finally:
        desfazer(CTX["estado"])
    r = p.fim()
    if CTX.get("interrompida"):
        print(f"   rodada INTERROMPIDA antes de '{CTX['interrompida']}' (o sinal sumiu): a massa foi desfeita — rode de novo com o sinal")
        return 3
    return r


if __name__ == "__main__":
    sys.exit(main())
