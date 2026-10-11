#!/usr/bin/env python3
"""Physiq W1 — E2E de SERVIDOR da InfinitePay (pagamentos-aluno + infinitepay-webhook-aluno) no STAGING, com as contas de TESTE prof2
(dono da conta "Rafael Lima") e aluno2, em série e com a guarda de /health (Treino e principal) antes.
Casos (padrão — as funções PUBLICADAS e a API DE VERDADE da InfinitePay, só chamadas que NÃO cobram):
  recebimento  jeito 2: o dono lê e grava pela função (chave: criar normalizada, recusar a ruim, ligar 1 só, excluir; bloquear); o aluno
               → 403; a chave de OUTRA conta → 404 e ela fica; o dono grava a InfinitePay direto pelo banco sem integração → a guarda desfaz
  ligar        flag desligada → some e 403; Testar com InfiniteTag inventada → 400 infinitepay_checkout_desligado com o link de ativar
               (a API responde igual para a tag que não existe e para o checkout desligado — sondado 11/10); Testar com a de teste →
               página da InfinitePay (não salva); sem tag → 409; com a tag → InfinitePay ligada + link de teste; tirar a tag em uso →
               409; volta ao Pix
  link         o aluno abre o pagamento: url da InfinitePay; a tentativa (forma, InfiniteTag, 72 h, valor) e o link 1 (pedido <id>-1, I4);
               o 2º toque reaproveita; a trava vê "aguardando"; conferir só pelo pedido (W1-B2) → não pago; o 2º conferir em < 30 s não
               chama de novo; outra pessoa → 404
  forjado      webhook com o pedido vivo e NSU inventado → 200 "registrado" com ms < 1000; o payment_check de verdade → não pago: o
               aviso é REAGENDADO (I1), nada muda, ninguém avisado; formato ruim / o id puro da cobrança (I4) / pedido de fora / schema
               ruim → 200 ignorado; I6: corpo > 16 KB → 413, link velho → ignorado_prazo, 20 avisos → ignorado_teto; a rodada
               (pg_net) reenvia e confere de novo
  vencida      72 h depois (forçado): o aluno_status fecha a tentativa (fora do histórico, a InfiniteTag guardada) e a trava solta o
               "aguardando"; pagar de novo cria outra tentativa
  avulsa       a cobrança avulsa vira a tentativa; vencida, volta a "aberta" com a InfiniteTag guardada; pagar de novo = OUTRO link
               (pedido <id>-2 — I4: a unicidade do order_nsu é nossa)
  trocar       conta no MP com automática (simulada) → trocar para a InfinitePay pede o OK (409 automaticas_ativas); com o OK cancela e avisa
  periodo      P-B: a conta InfinitePay recebe [à vista, mês a mês]; o plano antigo com cartão parcelado salva; plano novo com ele → 400;
               o aluno no cartão parcelado paga o período todo (R$ 120 por 12 meses)
Casos --local (o caminho da BAIXA sem pagar: as 2 funções no Deno local — e2e/w1/servir_local.ts — contra o banco do STAGING e o
SIMULADOR — e2e/w1/simulador_ip.py — no lugar da API):
  baixa        o webhook + o "pago" do simulador: paga (NSU, slug, recibo, meio, valor pago), o "pago até" anda, avisos ao aluno e ao
               personal, o payment_check foi com a InfiniteTag e o pedido do LINK (I4); o mesmo webhook de novo → nada muda
  repetido     C1, o PIOR caso (o simulador não amarra o NSU ao pedido): o mesmo link avisado com outro NSU → nenhum período a mais,
               nenhuma linha nova, 1 aviso "confira" ao personal (o 2º forjado em seguida não repete o sino); a avulsa igual (sem
               "Pagamento repetido")
  forjado_pago C1, o caso negativo (o simulador amarra o NSU): NSU inventado num pedido JÁ pago → "não pago", reagendado, nada muda,
               ninguém avisado
  valor        o payment_check com outro amount → sem baixa + aviso ao personal
  volta        a volta da página (aluno_ip_volta) dá baixa na hora
  atrasado     a tentativa vencida (fechada) paga depois → volta e fica paga
  pedido       W1-B2 + C1: o payment_check só pelo pedido diz "pago" → paga com o NSU do pedido; o webhook de verdade depois NÃO troca
               o NSU nem cria linha: 1 aviso "confirmou de novo" ao personal
  naopago      I1: "não pago" na 1ª conferência (a volta antes da aprovação do cartão) → reagendado; fechado como na 24ª; o mesmo
               aviso chega de novo → reabre e dá baixa
  registrado   I5: o personal registra a mensalidade à mão com a tentativa aberta → a MESMA linha vira paga (sem nascer outra); a
               confirmação da InfinitePay depois → "já registrado" ao personal, sem 2º período
  fora         a InfinitePay fora do ar (503) → o aviso fica para depois (tentativas 1); na 24ª desiste e avisa o personal
  desligado    o checkout externo desligado (o 404 de 11/10): o link → 400 com o link de ativar e a tentativa desfeita; a
               conferência → sem decisão (o aviso fica aberto, nunca "não pago")
  O aluno_ip_link aceita 10 links em 10 min por pessoa, contados na memória da instância; os 11 casos pedem 11 links da mesma conta de
  TESTE: antes do que passaria do limite, a pagamentos-aluno local recomeça (instância nova — o limite não é o que estes casos provam).
Desfazer: ANTES de mexer, a foto (a matrícula do aluno2, a conta do prof2 — forma, bloqueio, chaves, integração — e a flag do staging) vai para
~/projetos/physiqcalc-scratch/w1/api-estado.json; no fim (ou na próxima rodada / --limpar, se esta cair no meio) sai tudo o que a rodada
criou (cobranças e os avisos da caixa delas, avisos do sino, chaves "w1e2e…", assinaturas e planos "W1 e2e …") e o resto volta à foto — o
último ✅ confere campo a campo.
Precisa:
  · a W1 no staging (a migration 20261011200000; a flag é ligada e devolvida pela rodada) e, no padrão, as 2 funções publicadas;
  · ~/.pc-pat e as senhas das contas de TESTE;
  · a InfiniteTag de teste em ~/.physiq-infinitetag-teste (600). Ela já existe e o checkout externo dela está LIGADO (sondado 11/10);
  · no --local, o ~/.deno/bin/deno. A InfiniteTag do --local é inventada (o simulador não confere a tag).
No --local, a rodada de 15 min do staging fica PARADA e volta como estava no desfazer: ela chamaria a função publicada, que fala com
a API de verdade, com a tag inventada (MENOR 12 da revisão).
Saída sem a InfiniteTag de teste: o placar (PlacarSemTag) troca por <InfiniteTag> em toda mensagem — a linha do banco, os links, o erro.
Uso: python3 e2e/w1/api.py [--local] [--casos …] [--sinal ARQ] [--seco | --limpar]
  --seco    só os logins, a montagem dos pedidos e as leituras (no --local, sobe e derruba os 3 processos e cutuca cada um: o webhook lê o
            banco e a pagamentos-aluno confere a sessão, sem ação) — nada é gravado
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
  --sinal   o arquivo-sinal da trava do banco do staging (dividido entre sessões): sem ele a rodada não começa; se ele sumir no meio,
            a rodada para ANTES do próximo caso, desfaz a massa e sai com 3
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.dont_write_bytecode = True

S = "staging"
DONO, ALUNO = "prof2", "aluno2"
PREFIXO = "W1 e2e"
CASOS_STAGING = ("recebimento", "ligar", "link", "forjado", "vencida", "avulsa", "trocar", "periodo")
CASOS_LOCAL = ("baixa", "repetido", "forjado_pago", "valor", "volta", "atrasado", "pedido", "naopago", "registrado", "fora", "desligado")
PRECISAM_DA_TAG = {"ligar", "link", "forjado", "vencida", "avulsa", "periodo"}
ARQ_TAG = Path.home() / ".physiq-infinitetag-teste"
TAG_LOCAL = "physiq.simulador"
ESTADO_ARQ = Path.home() / "projetos" / "physiqcalc-scratch" / "w1" / "api-estado.json"
LOG_LOCAL = Path.home() / "projetos" / "physiqcalc-scratch" / "w1" / "deno-local.log"
RAIZ = Path(__file__).resolve().parent.parent.parent
PORTA_PAG, PORTA_WEB, PORTA_SIM = 8790, 8791, 8799
# o permitido(`ip-link:<uid>`, 10, 600_000) do aluno_ip_link (pagamentos-aluno): 10 links em 10 min por pessoa, na memória da instância
LINKS_POR_JANELA, JANELA_LINKS_S = 10, 600
HOST_IP = re.compile(r"^https://([a-z0-9-]+\.)*(infinitepay\.io|infinitepay\.com\.br)(/|$)", re.I)
ATIVAR = "https://app.infinitepay.io/external-checkout#configuracoes?enabled=true"
# a resposta de verdade do /links (e do payment_check) com o checkout externo desligado — ou a InfiniteTag que não existe (sondado 11/10)
DESLIGADO = {"success": False, "error": "external_checkout_not_enabled", "message": "External checkout is not enabled for this merchant.",
             "redirect_url": ATIVAR}

B = None  # a base dos E2E da W6 (e2e/w06/_base.py), carregada no main
p = None
CTX: dict = {}


# ───────────────────────── a base, o banco e as chamadas ─────────────────────────

def sem_tag(texto: str) -> str:
    """A InfiniteTag de teste é dado pessoal (do Weslley): nunca na saída — nem dentro da linha do banco, da url ou de um erro (o sem_tag
    do telas.py). A tag é a da rodada (CTX["tag"])."""
    tag = CTX.get("tag")
    return re.sub(re.escape(tag), "<InfiniteTag>", texto, flags=re.I) if tag else texto


class PlacarSemTag:
    """O placar da W6 que troca a InfiniteTag de teste por <InfiniteTag> em TODA mensagem antes de imprimir e guardar (o molde do RodadaW1
    do telas.py): a linha da tentativa vencida e a da avulsa aberta de novo (a coluna ip_handle), os links da avulsa (a coluna handle), o
    erro que quebrou um caso (o SQL que falhou pode trazer a tag) e a diferença do desfazer (a integração da conta). O fim() repete as
    falhas já trocadas."""

    def __init__(self, placar) -> None:
        self._placar = placar

    def check(self, ok: object, texto: str) -> bool:
        return self._placar.check(ok, sem_tag(str(texto)))

    def __getattr__(self, nome: str):
        return getattr(self._placar, nome)


def carregar_base() -> None:
    global B, p
    if B is not None:
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
    import _base  # noqa: PLC0415

    B, p = _base, PlacarSemTag(_base.p)
    B.ESTADO["schema"] = S


def sql(q: str) -> list:
    return B.sql_principal(q)


def um(q: str) -> dict | None:
    r = sql(q)
    return r[0] if r else None


def lit(v) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def tag_de_teste() -> str | None:
    v = ARQ_TAG.read_text(encoding="utf-8").strip().lstrip("$").lower() if ARQ_TAG.exists() else ""
    return v if re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,39}", v) else None


def saude_principal(limite_s: float = 10.0) -> bool:
    """/health do banco principal (o staging é um schema dele) pela Management API — o molde do B.saude_treino."""
    t0 = time.time()
    st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/health?services=db&services=auth&services=rest", None,
                      {"Authorization": f"Bearer {B.ler('.pc-pat')}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < limite_s
    print(f"   /health do principal: {st} {[(x.get('name'), x.get('status')) for x in (r or [])] if isinstance(r, list) else r} em {dt_:.1f} s",
          flush=True)
    return ok


def links_no_limite(momentos: list[float], agora: float) -> bool:
    """Já foram LINKS_POR_JANELA links nos últimos JANELA_LINKS_S segundos (o próximo seria 429 rate_limited)?"""
    return sum(1 for t in momentos if agora - t < JANELA_LINKS_S) >= LINKS_POR_JANELA


def limite_de_links() -> None:
    """Antes de cada aluno_ip_link no --local: no que passaria do limite da instância, a pagamentos-aluno local recomeça."""
    agora = time.time()
    momentos = CTX.setdefault("links", [])
    if links_no_limite(momentos, agora):
        reiniciar_pagamentos()
        momentos.clear()
    momentos.append(agora)


def pedir(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    """Uma ação da pagamentos-aluno como a conta de TESTE: a publicada (x-schema staging) ou a do Deno local (--local)."""
    corpo = corpo or {}
    if CTX.get("local"):
        if acao == "aluno_ip_link":
            limite_de_links()
        st, r, _ = B.http("POST", f"http://127.0.0.1:{PORTA_PAG}", {"acao": acao, **corpo},
                          {"Authorization": f"Bearer {B.token(conta)}", "x-schema": S, "Origin": "http://localhost:8080"}, timeout=60)
    else:
        st, r = B.pag(conta, acao, corpo)
    return st, (r if isinstance(r, dict) else {})


def webhook(corpo, schema: str = S, metodo: str = "POST") -> tuple[int, dict, float]:
    """O webhook (o publicado ou o local), sem JWT, como a InfinitePay → (status, corpo, segundos medidos daqui)."""
    url = (f"http://127.0.0.1:{PORTA_WEB}?schema={schema}" if CTX.get("local")
           else f"{B.PRINCIPAL_URL}/functions/v1/infinitepay-webhook-aluno?schema={schema}")
    t0 = time.time()
    st, r, _ = B.http(metodo, url, corpo, {}, timeout=30)
    return st, (r if isinstance(r, dict) else {}), time.time() - t0


def esperar(funcao, segundos: float, passo: float = 2.0):
    fim = time.time() + segundos
    while True:
        v = funcao()
        if v or time.time() >= fim:
            return v
        time.sleep(passo)


def cenario(**c) -> None:
    req = urllib.request.Request(f"http://127.0.0.1:{PORTA_SIM}/_cenario", data=json.dumps(c).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()


def pedidos_do_simulador() -> list:
    with urllib.request.urlopen(f"http://127.0.0.1:{PORTA_SIM}/_pedidos", timeout=10) as r:
        return json.loads(r.read() or b"[]")


# ───────────────────────── o Deno local e o simulador ─────────────────────────

def porta_aberta(porta: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", porta)) == 0


def _deno(slug: str, porta: int) -> subprocess.Popen:
    """Uma função do principal no Deno local (o ambiente com as chaves fica só neste processo — nada impresso)."""
    lo = CTX["local_proc"]
    return subprocess.Popen([lo["deno"], "run", "--allow-net", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                             f"supabase-principal/functions/{slug}/index.ts", str(porta)], cwd=RAIZ, env=lo["env"],
                            stdout=lo["saida"], stderr=lo["saida"])


def subir_local() -> list:
    """O simulador e as 2 funções no Deno local, contra o banco do STAGING (as chaves só no ambiente destes processos — nada impresso)."""
    for porta in (PORTA_PAG, PORTA_WEB, PORTA_SIM):
        if porta_aberta(porta):
            raise RuntimeError(f"a porta {porta} já está em uso (ss -ltnp | grep {porta}) — outra sessão?")
    env = {**os.environ, "SUPABASE_URL": B.PRINCIPAL_URL, "SUPABASE_SERVICE_ROLE_KEY": B.service(B.PRINCIPAL_REF),
           "SUPABASE_ANON_KEY": B.anon(B.PRINCIPAL_REF), "INFINITEPAY_API": f"http://127.0.0.1:{PORTA_SIM}",
           "ERROS_AVISO_DESLIGADO": "1", "DENO_NO_PACKAGE_JSON": "1"}
    LOG_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    saida = LOG_LOCAL.open("a", encoding="utf-8")
    CTX["local_proc"] = {"env": env, "saida": saida, "deno": str(Path.home() / ".deno" / "bin" / "deno")}
    procs = [subprocess.Popen([sys.executable, str(RAIZ / "e2e" / "w1" / "simulador_ip.py"), "--porta", str(PORTA_SIM)], cwd=RAIZ,
                              stdout=saida, stderr=saida)]
    for slug, porta in (("pagamentos-aluno", PORTA_PAG), ("infinitepay-webhook-aluno", PORTA_WEB)):
        procs.append(_deno(slug, porta))
    CTX["procs"] = procs   # [simulador, pagamentos-aluno, webhook] — o reiniciar_pagamentos troca o do meio NESTA lista
    if not esperar(lambda: all(porta_aberta(x) for x in (PORTA_PAG, PORTA_WEB, PORTA_SIM)), 90, 1.0):
        descer_local(procs)
        raise RuntimeError(f"o Deno local não subiu em 90 s (veja {LOG_LOCAL})")
    return procs


def reiniciar_pagamentos() -> None:
    """A pagamentos-aluno local recomeça (o limite de links da instância zera) — a mesma lista de processos, para o descer_local."""
    procs = CTX["procs"]
    descer_local([procs[1]])
    if not esperar(lambda: not porta_aberta(PORTA_PAG), 15, 0.5):
        raise RuntimeError(f"a porta {PORTA_PAG} não soltou depois de parar a pagamentos-aluno local")
    procs[1] = _deno("pagamentos-aluno", PORTA_PAG)
    if not esperar(lambda: porta_aberta(PORTA_PAG), 90, 1.0):
        raise RuntimeError(f"a pagamentos-aluno local não voltou em 90 s (veja {LOG_LOCAL})")
    print(f"   (a pagamentos-aluno local recomeçou: {LINKS_POR_JANELA} links em {JANELA_LINKS_S // 60} min é o limite da instância)",
          flush=True)


def descer_local(procs: list) -> None:
    for pr in procs:
        pr.terminate()
    for pr in procs:
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()


# ───────────────────────── a foto e o desfazer ─────────────────────────

def rodada_do_staging(ativa: bool | None = None) -> bool | None:
    """A rodada de 15 min do staging (pg_cron). No --local ela fica parada: chamaria a função PUBLICADA, que fala com a API de verdade
    com a tag inventada do simulador (MENOR 12 da revisão). Sem argumento, só lê."""
    if ativa is not None:
        sql(f"select cron.alter_job(j.jobid, active := {str(ativa).lower()}) from cron.job j where j.jobname = 'infinitepay-rodada-{S}'")
    r = um(f"select active from cron.job where jobname = 'infinitepay-rodada-{S}'")
    return None if not r else bool(r["active"])


def foto(pac: str, conta: str) -> dict:
    pa = um(f"""select plano_aluno_id::text as plano_aluno_id, plano_modalidade, plano_valor_negociado::text as plano_valor_negociado,
                       mensalidade_valor::text as mensalidade_valor, mensalidade_desde::text as mensalidade_desde, cobranca_pausada
                  from {S}.pacientes where id = '{pac}'""")
    co = um(f"select recebimento_modo as modo, bloquear_app_inadimplente as bloquear from {S}.contas where id = '{conta}'")
    chaves = sql(f"select id::text as id, ativa from {S}.recebimento_chaves where conta_id = '{conta}' order by id")
    integ = um(f"""select infinitepay_handle as handle, status from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'infinitepay'""")
    flag = um(f"select valor::text as v from {S}.app_config where chave = 'infinitepay'")
    vivas = [x["id"] for x in sql(f"""select id::text as id from {S}.cobrancas where paciente_id = '{pac}' and tipo = 'mensalidade'
                                         and deleted_at is null order by id""")]
    assin = [x["id"] for x in sql(f"select id::text as id from {S}.aluno_assinaturas where paciente_id = '{pac}' order by id")]
    return {"pacientes": pa, "conta": co, "chaves": chaves, "integracao": integ, "flag": flag and flag["v"], "vivas": vivas, "assinaturas": assin,
            "rodada": rodada_do_staging()}


def preparar() -> None:
    m = um(f"""select p.id::text as id, p.conta_id::text as conta, p.user_id::text as aluno_uid, c.dono_id::text as dono_uid, c.origem
                 from {S}.pacientes p join auth.users u on u.id = p.user_id left join {S}.contas c on c.id = p.conta_id
                where lower(u.email) = {lit(B.CONTAS[ALUNO][0])} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    if not m or m["origem"] == "app" or m["dono_uid"] != B.uid(DONO):
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar na conta do {DONO} ({m})")
    if not um(f"select to_regclass('{S}.infinitepay_avisos') is not null as ok")["ok"]:
        raise RuntimeError(f"o {S} está sem a W1: aplique a 20261011200000_w1_infinitepay.sql antes")
    pac, conta = m["id"], m["conta"]
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    t0 = um("select clock_timestamp()::text as t0")["t0"]
    # o id da conta vai em "conta_id": a foto tem a chave "conta" (forma e bloqueio) e cobriria o id
    est = {"t0": t0, "paciente": pac, "conta_id": conta, "aluno_uid": m["aluno_uid"], "dono_uid": m["dono_uid"], **foto(pac, conta)}
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)
    CTX.update(estado=est, pac=pac, conta=conta, aluno_uid=m["aluno_uid"], dono_uid=m["dono_uid"], t0=t0,
               tag_em_uso=TAG_LOCAL if CTX.get("local") else CTX.get("tag"))
    # o ponto de partida: as mensalidades de antes escondidas (voltam no fim), modo de hoje com R$ 10,00 vencida, Pix na chave, flag ligada
    if est["vivas"]:
        sql(f"update {S}.cobrancas set deleted_at = now() where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    sql(f"""update {S}.pacientes set plano_modalidade = null, plano_valor_negociado = null, mensalidade_valor = 10, cobranca_pausada = false,
                   mensalidade_desde = now() - interval '1 day' where id = '{pac}'""")
    sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}'")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay'")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    if CTX.get("local"):
        rodada_do_staging(False)   # MENOR 12: parada durante o --local (volta no desfazer)


def conta_do_estado(est: dict) -> str:
    """O id da conta da rodada. O estado gravado antes da correção de 11/10 não tem o "conta_id" (a foto da conta, "conta", cobria o
    id): aí ele vem da matrícula (a rodada não troca a conta do aluno)."""
    if est.get("conta_id"):
        return est["conta_id"]
    return um(f"select conta_id::text as c from {S}.pacientes where id = {lit(est['paciente'])}")["c"]


def limpar(est: dict) -> None:
    pac, conta, t0 = est["paciente"], conta_do_estado(est), lit(est["t0"])
    sql(f"delete from {S}.cobrancas where paciente_id = '{pac}' and created_at >= {t0}::timestamptz")   # a caixa sai junto (cascade)
    sql(f"""delete from {S}.avisos where destino_user_id in ('{est['aluno_uid']}', '{est['dono_uid']}') and criado_em >= {t0}::timestamptz""")
    sql(f"delete from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com'")
    for ch in est["chaves"]:
        sql(f"update {S}.recebimento_chaves set ativa = false where id = '{ch['id']}'")
    for ch in est["chaves"]:
        if ch["ativa"]:
            sql(f"update {S}.recebimento_chaves set ativa = true where id = '{ch['id']}'")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}'")
    if est["integracao"]:
        sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status)
                values ('{conta}', 'infinitepay', {lit(est['integracao']['handle'])}, {lit(est['integracao']['status'])})""")
    c = est["conta"]
    sql(f"update {S}.contas set recebimento_modo = {lit(c['modo'])}, bloquear_app_inadimplente = {str(bool(c['bloquear'])).lower()} where id = '{conta}'")
    if est["flag"]:
        sql(f"update {S}.app_config set valor = {lit(est['flag'])}::jsonb where chave = 'infinitepay'")
    sql(f"""delete from {S}.aluno_assinaturas where paciente_id = '{pac}'
              and not (id = any(array[{', '.join(lit(x) for x in est['assinaturas']) or ''}]::uuid[]))""")
    a = est["pacientes"]
    sql(f"""update {S}.pacientes set plano_aluno_id = {lit(a['plano_aluno_id'])}, plano_modalidade = {lit(a['plano_modalidade'])},
                   plano_valor_negociado = {lit(a['plano_valor_negociado'])}, mensalidade_valor = {lit(a['mensalidade_valor'])},
                   mensalidade_desde = {lit(a['mensalidade_desde'])}, cobranca_pausada = {str(bool(a['cobranca_pausada'])).lower()}
             where id = '{pac}'""")
    if est["vivas"]:
        sql(f"update {S}.cobrancas set deleted_at = null where id = any(array[{', '.join(lit(x) for x in est['vivas'])}]::uuid[])")
    sql(f"delete from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')}")
    sql(f"select {S}.mensalidade_recalcular('{pac}')")
    if est.get("rodada") is not None:
        rodada_do_staging(est["rodada"])


def desfazer(est: dict) -> None:
    print("\n── desfazer: sai o que a rodada criou e a matrícula, a conta e a flag voltam à foto de antes")
    try:
        limpar(est)
        agora = foto(est["paciente"], conta_do_estado(est))
        sobra = um(f"""select (select count(*) from {S}.cobrancas where paciente_id = '{est['paciente']}' and created_at >= {lit(est['t0'])}::timestamptz)::int as cobrancas,
                              (select count(*) from {S}.planos_aluno where nome like {lit(PREFIXO + ' %')})::int as planos,
                              (select count(*) from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com')::int as chaves""")
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/w1/api.py --limpar"[:500])
        return
    antes = {k: est.get(k) for k in ("pacientes", "conta", "chaves", "integracao", "flag", "vivas", "assinaturas", "rodada")}
    difs = [f"{k}: {antes[k]!r} → {agora[k]!r}" for k in antes if antes[k] != agora[k]]
    p.check(not difs and not any(sobra.values()), f"tudo voltou à foto e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── ajudantes dos casos ─────────────────────────

def garantir_integracao() -> None:
    sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em)
            values ('{CTX['conta']}', 'infinitepay', {lit(CTX['tag_em_uso'])}, 'ativa', now())
            on conflict (conta_id, provedor) do update set infinitepay_handle = excluded.infinitepay_handle, status = 'ativa'""")


def ligar_infinitepay() -> None:
    """Atalho pelo banco (o caso 'ligar' prova o caminho pela função)."""
    garantir_integracao()
    sql(f"update {S}.contas set recebimento_modo = 'infinitepay' where id = '{CTX['conta']}'")


def esconder() -> None:
    """As mensalidades que a rodada criou saem (a cobertura volta a zero e o aluno pode pagar de novo)."""
    sql(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and deleted_at is null
              and created_at >= {lit(CTX['t0'])}::timestamptz""")
    sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")


def garantir_tentativa() -> str:
    ligar_infinitepay()
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    if st != 200 or not c:
        raise RuntimeError(f"aluno_ip_link falhou ({st} {r.get('erro')})")
    return c


def centavos_de(c: str) -> int:
    return round(um(f"select valor::float as v from {S}.cobrancas where id = '{c}'")["v"] * 100)


def avisos(tipo: str, texto: str | None = None) -> dict:
    filtro = f" and titulo like {lit('%' + texto + '%')}" if texto else ""
    r = um(f"""select count(*) filter (where destino_user_id = '{CTX['aluno_uid']}')::int as aluno,
                      count(*) filter (where destino_user_id = '{CTX['dono_uid']}')::int as personal
                 from {S}.avisos where tipo = {lit(tipo)} and criado_em >= {lit(CTX['t0'])}::timestamptz{filtro}""")
    return {"aluno": r["aluno"], "personal": r["personal"]}


def pago_ate() -> str | None:
    return um(f"select mensalidade_pago_ate::text as a from {S}.pacientes where id = '{CTX['pac']}'")["a"]


def aguardando() -> bool | None:
    st, fin = B.rpc(ALUNO, "financeiro_do_aluno")
    return next((x.get("aguardando") for x in (fin or []) if isinstance(x, dict) and x.get("paciente_id") == CTX["pac"]), None)


def aviso_da_caixa(c: str, nsu: str) -> dict | None:
    return um(f"""select resultado, tentativas, conferido_em is not null as conferido, proxima_em > now() as adiado, origem
                    from {S}.infinitepay_avisos where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)} order by id desc limit 1""")


def pedido_de(c: str) -> str:
    """O pedido do link mais novo da cobrança (I4: o order_nsu é por link — `<cobranca_id>-<n>`)."""
    return um(f"select pedido from {S}.infinitepay_links where cobranca_id = '{c}' order by n desc limit 1")["pedido"]


def mensalidades_pagas() -> int:
    return um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade' and status = 'paga'
                    and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]


# ───────────────────────── casos (staging, API de verdade) ─────────────────────────

def caso_recebimento() -> None:
    print("\n── recebimento: o jeito 2 — a tela grava pela função, como a pessoa")
    conta, est = CTX["conta"], CTX["estado"]
    st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    p.check(st == 200 and (r.get("conta") or {}).get("id") == conta and isinstance(r.get("chaves"), list) and "infinitepay" in r,
            f"o dono lê a conta, as chaves e a InfinitePay numa chamada ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "prof_recebimento", {"conta_id": conta})
    p.check(st == 403 and r.get("erro") == "so_o_dono", f"o aluno não chega ({st} {r.get('erro')})")
    email = f"w1e2e{secrets.token_hex(3)}@teste.com"
    st, r = pedir(DONO, "prof_chave_salvar", {"conta_id": conta, "tipo": "email", "chave": email.upper(), "favorecido": "  W1   Teste ", "banco": ""})
    ch = r.get("chave") or {}
    p.check(st == 200 and ch.get("chave") == email and ch.get("favorecido") == "W1 Teste" and ch.get("banco") is None,
            f"chave nova normalizada ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_chave_salvar", {"conta_id": conta, "tipo": "cpf", "chave": "123"})
    p.check(st == 400 and r.get("erro") == "chave_invalida" and "11 dígitos" in str(r.get("mensagem")), "chave ruim → a frase da tela")
    st, _ = pedir(DONO, "prof_chave_ligar", {"conta_id": conta, "id": ch.get("id"), "ligar": True})
    lig = [x["id"] for x in sql(f"select id::text as id from {S}.recebimento_chaves where conta_id = '{conta}' and ativa")]
    p.check(st == 200 and lig == [ch.get("id")], f"ligar deixa 1 só ligada ({st} {len(lig)})")
    outra = um(f"""insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa)
                   select c.id, 'email', 'w1e2e-outra@teste.com', false from {S}.contas c where c.id <> '{conta}' and c.origem <> 'app' limit 1
                   returning id::text as id""")
    st, _ = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": outra["id"]})
    fica = um(f"select count(*)::int as n from {S}.recebimento_chaves where id = '{outra['id']}'")["n"]
    p.check(st == 404 and fica == 1, f"a chave de OUTRA conta: 404 e ela fica ({st} {fica})")
    st, _ = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "bloquear": not est["conta"]["bloquear"]})
    b = um(f"select bloquear_app_inadimplente as b from {S}.contas where id = '{conta}'")["b"]
    p.check(st == 200 and b == (not est["conta"]["bloquear"]), f"bloquear o inadimplente pela função ({st} {b})")
    st, _ = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": ch.get("id")})
    st2, r2 = pedir(DONO, "prof_chave_excluir", {"conta_id": conta, "id": ch.get("id")})
    p.check(st == 200 and st2 == 404 and r2.get("erro") == "chave_inexistente", f"excluir; de novo → 404 ({st} {st2})")
    sql(f"delete from {S}.recebimento_integracoes where conta_id = '{conta}'")
    B.rest(DONO, "PATCH", f"contas?id=eq.{conta}", {"recebimento_modo": "infinitepay"})
    modo = um(f"select recebimento_modo as m from {S}.contas where id = '{conta}'")["m"]
    p.check(modo != "infinitepay", f"o dono não liga a InfinitePay direto pelo banco sem a InfiniteTag (contas_guard: {modo})")


def caso_ligar() -> None:
    print("\n── ligar: a InfiniteTag (API de verdade — criar link não cobra)")
    conta, tag = CTX["conta"], CTX["tag"]
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'infinitepay'")
    st, r = pedir(DONO, "prof_recebimento", {"conta_id": conta})
    st2, r2 = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "handle": tag})
    p.check(st == 200 and r["infinitepay"]["disponivel"] is False and st2 == 403 and r2.get("erro") == "infinitepay_em_teste",
            f"flag desligada: a opção some e não grava ({st2} {r2.get('erro')})")
    sql(f"update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay'")
    st, r = pedir(DONO, "prof_ip_testar", {"conta_id": conta, "handle": f"physiq-w1-{secrets.token_hex(6)}"})
    p.check(st == 400 and r.get("erro") == "infinitepay_checkout_desligado" and bool(HOST_IP.match(r.get("ativar") or "")),
            f"InfiniteTag inventada: 'confira a tag e ative o checkout externo', com o link de ativar (sondado 11/10) ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_ip_testar", {"conta_id": conta, "handle": f"${tag.upper()}"})
    p.check(st == 200 and bool(HOST_IP.match(r.get("url") or "")), f"Testar com a InfiniteTag de teste → a página da InfinitePay ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay"})
    p.check(st == 409 and r.get("erro") == "sem_infinitetag", f"InfinitePay sem a InfiniteTag → 409 ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay", "handle": tag})
    p.check(st == 200 and r["conta"]["modo"] == "infinitepay" and r["infinitepay"]["handle"] == tag and bool(HOST_IP.match(r.get("link_teste") or "")),
            f"salvar a InfiniteTag e a forma: InfinitePay ligada ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "handle": None})
    p.check(st == 409 and r.get("erro") == "em_uso", f"tirar a InfiniteTag em uso → 409 ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "pix_manual"})
    p.check(st == 200 and r["conta"]["modo"] == "pix_manual", f"volta ao Pix na chave ({st})")


def caso_link() -> None:
    print("\n── link: o aluno abre o pagamento (API de verdade)")
    ligar_infinitepay()
    pac = CTX["pac"]
    st, r = pedir(ALUNO, "aluno_status")
    m = next((x for x in r.get("matriculas", []) if x.get("paciente_id") == pac), {})
    p.check(st == 200 and (m.get("conta") or {}).get("modo") == "infinitepay" and m.get("chave") is None, "o aluno vê a forma InfinitePay")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": pac})
    c = r.get("cobranca") or {}
    p.check(st == 200 and bool(HOST_IP.match(r.get("url") or "")) and r.get("reutilizado") is False and c.get("forma") == "infinitepay"
            and c.get("status") == "aguardando_confirmacao" and c.get("ip_link") == r.get("url"), f"o link e a tentativa ({st} {r.get('erro')})")
    CTX["tentativa"] = c.get("id")
    linha = um(f"""select ip_handle as h, extract(epoch from ip_expira_em - now())::int as s, valor::float as v from {S}.cobrancas where id = '{c.get('id')}'""")
    p.check(bool(linha) and linha["h"] == CTX["tag_em_uso"] and 72 * 3600 - 600 <= linha["s"] <= 72 * 3600 and linha["v"] == 10.0,
            f"a InfiniteTag usada, 72 h e o valor gravados ({linha and {'s': linha['s'], 'v': linha['v']}})")
    lk = um(f"select pedido, handle, centavos from {S}.infinitepay_links where cobranca_id = '{c.get('id')}'")
    p.check(bool(lk) and lk["pedido"] == f"{c.get('id')}-1" and lk["handle"] == CTX["tag_em_uso"] and lk["centavos"] == 1000,
            "o link 1 (I4): o pedido <id>-1 com a InfiniteTag e o preço dele")
    st, r2 = pedir(ALUNO, "aluno_ip_link", {"paciente_id": pac})
    p.check(st == 200 and r2.get("reutilizado") is True and r2.get("url") == r.get("url") and (r2.get("cobranca") or {}).get("id") == c.get("id"),
            "o 2º toque reaproveita o mesmo link")
    p.check(aguardando() is True, "a trava vê 'aguardando' enquanto a tentativa vale")
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    t1 = um(f"select ip_conferido_em::text as t from {S}.cobrancas where id = '{c.get('id')}'")["t"]
    p.check(st == 200 and r.get("paga") is False and bool(t1), f"conferir só pelo pedido (W1-B2): não pago ({st} {r.get('resultado')})")
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    t2 = um(f"select ip_conferido_em::text as t from {S}.cobrancas where id = '{c.get('id')}'")["t"]
    p.check(st == 200 and r.get("resultado") == "cedo" and t2 == t1, "o 2º conferir em < 30 s não chama a InfinitePay de novo")
    st, _ = pedir(DONO, "aluno_ip_conferir", {"cobranca_id": c.get("id")})
    p.check(st == 404, f"outra pessoa não confere a tentativa de quem não é ela ({st})")


def caso_forjado() -> None:
    print("\n── forjado: webhook sem assinatura não dá baixa (o payment_check DE VERDADE decide) e a rota pública tem teto (I6)")
    c = CTX.get("tentativa") or garantir_tentativa()
    ped = pedido_de(c)
    nsu = f"FORJADO-{secrets.token_hex(4)}"
    st, r, seg = webhook({"order_nsu": ped, "transaction_nsu": nsu, "invoice_slug": "forjado", "amount": 1000, "paid_amount": 1000,
                          "capture_method": "pix", "receipt_url": "https://recibo.infinitepay.io/forjado"})
    p.check(st == 200 and r.get("resultado") == "registrado" and isinstance(r.get("ms"), int) and r["ms"] < 1000,
            f"200 'registrado' em < 1 s no servidor (ms {r.get('ms')} · {seg:.2f} s daqui)")
    linha = esperar(lambda: (lambda x: x if x and x["tentativas"] >= 1 else None)(aviso_da_caixa(c, nsu)), 40)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"] and linha["resultado"] is None,
            f"o payment_check de verdade: não pago → o aviso é REAGENDADO, não fechado (I1) ({linha})")
    est = um(f"select status from {S}.cobrancas where id = '{c}'")["status"]
    p.check(est == "aguardando_confirmacao" and avisos("pagamento_confirmado") == {"aluno": 0, "personal": 0}, f"nada muda, ninguém avisado ({est})")
    for corpo, esperado in (({"order_nsu": "teste-1", "transaction_nsu": "x"}, "ignorado_formato"),
                            ({"order_nsu": c, "transaction_nsu": "x"}, "ignorado_formato"),   # I4: o id puro da cobrança não é pedido
                            ({"order_nsu": f"{uuid.uuid4()}-1", "transaction_nsu": "x"}, "ignorado_pedido"),
                            ("lixo", "ignorado_formato")):
        st, r, _ = webhook(corpo)
        p.check(st == 200 and r.get("resultado") == esperado, f"webhook → {esperado} ({st} {r.get('resultado')})")
    st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": "x"}, schema="producao")
    p.check(st == 200 and r.get("resultado") == "schema_invalido", "schema inválido → 200 ignorado")
    # I6: o corpo grande, o link velho e o teto de avisos por cobrança
    st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": "grande", "lixo": "x" * 17_000})
    p.check(st == 413 and r.get("resultado") == "corpo_grande", f"corpo > 16 KB → 413 ({st} {r.get('resultado')})")
    criado = um(f"select criado_em::text as t from {S}.infinitepay_links where pedido = {lit(ped)}")["t"]
    sql(f"update {S}.infinitepay_links set criado_em = now() - interval '11 days' where pedido = {lit(ped)}")
    try:
        st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": f"VELHO-{secrets.token_hex(3)}"})
    finally:
        sql(f"update {S}.infinitepay_links set criado_em = {lit(criado)}::timestamptz where pedido = {lit(ped)}")
    p.check(st == 200 and r.get("resultado") == "ignorado_prazo", f"link com mais de 72 h + 7 dias → ignorado ({st} {r.get('resultado')})")
    sql(f"""insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem, conferido_em, resultado)
            select '{c}', {lit(ped)}, 'TETO-' || g, 'webhook', now(), 'nao_pago' from generate_series(1, 19) g""")
    try:
        st, r, _ = webhook({"order_nsu": ped, "transaction_nsu": f"TETO-X-{secrets.token_hex(3)}"})
    finally:
        sql(f"delete from {S}.infinitepay_avisos where cobranca_id = '{c}' and transaction_nsu like 'TETO-%'")
    p.check(st == 200 and r.get("resultado") == "ignorado_teto", f"20 avisos na cobrança → o 21º é ignorado ({st} {r.get('resultado')})")
    sql(f"""update {S}.infinitepay_avisos set tentado_em = null, proxima_em = now() - interval '1 minute'
             where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}""")
    antes = (aviso_da_caixa(c, nsu) or {}).get("tentativas", 0)
    rod = um(f"select {S}.infinitepay_rodada() as r")["r"]
    linha = esperar(lambda: (lambda x: x if x and x["tentativas"] > antes else None)(aviso_da_caixa(c, nsu)), 60)
    p.check((rod or {}).get("reenviados", 0) >= 1 and bool(linha) and not linha["conferido"],
            f"a rodada reenviou pelo pg_net e o webhook conferiu de novo — ainda não pago, ainda aberto ({rod} → {linha})")


def caso_vencida() -> None:
    print("\n── vencida: 72 h depois a tentativa sai e a trava volta")
    c = CTX.get("tentativa") or garantir_tentativa()
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{c}'")
    sql(f"update {S}.infinitepay_avisos set conferido_em = coalesce(conferido_em, now()), resultado = coalesce(resultado, 'nao_pago') where cobranca_id = '{c}'")
    st, _ = pedir(ALUNO, "aluno_status")
    linha = um(f"select status, deleted_at is not null as fora, ip_handle as h from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and linha == {"status": "cancelada", "fora": True, "h": CTX["tag_em_uso"]}, f"o aluno_status fechou a tentativa ({linha})")
    p.check(aguardando() is False, "a trava não vê mais 'aguardando'")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    p.check(st == 200 and r.get("reutilizado") is False and (r.get("cobranca") or {}).get("id") != c, "pagar de novo cria outra tentativa")
    CTX["tentativa"] = (r.get("cobranca") or {}).get("id")


def caso_avulsa() -> None:
    print("\n── avulsa: a cobrança avulsa vira a tentativa; vencida, volta a 'aberta'")
    ligar_infinitepay()
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa", "valor": 2, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    p.check(st == 200 and bool(av), f"o personal cria a avulsa ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    c = r.get("cobranca") or {}
    p.check(st == 200 and c.get("id") == av and c.get("forma") == "infinitepay" and bool(HOST_IP.match(r.get("url") or "")),
            f"a avulsa é a tentativa ({st} {r.get('erro')})")
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{av}'")
    pedir(ALUNO, "aluno_status")
    linha = um(f"select status, forma, ip_handle as h, ip_link_url as u from {S}.cobrancas where id = '{av}'")
    p.check(linha == {"status": "aberta", "forma": None, "h": CTX["tag_em_uso"], "u": None}, f"vencida: aberta de novo, a InfiniteTag guardada ({linha})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    links = sql(f"select n, handle from {S}.infinitepay_links where cobranca_id = '{av}' order by n")
    p.check(st == 200 and [x["n"] for x in links] == [1, 2] and all(x["handle"] == CTX["tag_em_uso"] for x in links),
            f"pagar de novo: OUTRO link com outro pedido (<id>-2) — a InfinitePay aceita; a unicidade é nossa (I4) ({st} {links})")


def caso_trocar() -> None:
    print("\n── trocar: sair do Mercado Pago com cobrança automática viva pede o OK e cancela")
    conta = CTX["conta"]
    garantir_integracao()
    sql(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{conta}'")   # como o master liga
    a = um(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, payload)
               values ('{CTX['pac']}', '{conta}', 'sim-w1e2e-{secrets.token_hex(4)}', 'authorized', 10, '{{"simulada": true, "teste_w1": true}}'::jsonb)
               returning id::text as id""")["id"]
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay"})
    p.check(st == 409 and r.get("erro") == "automaticas_ativas" and r.get("alunos") == 1, f"pede o OK ({st} {r.get('erro')} {r.get('alunos')})")
    st, r = pedir(DONO, "prof_recebimento_salvar", {"conta_id": conta, "modo": "infinitepay", "cancelar_automaticas": True})
    s = um(f"select status from {S}.aluno_assinaturas where id = '{a}'")["status"]
    p.check(st == 200 and r["conta"]["modo"] == "infinitepay" and r.get("automaticas_canceladas") == 1 and s == "cancelled"
            and avisos("geral", "forma de receber")["aluno"] == 1, f"com o OK: cancela, avisa o aluno e liga a InfinitePay ({st} {s})")


def caso_periodo() -> None:
    print("\n── periodo (P-B): na InfinitePay, à vista e cartão parcelado = o período todo")
    conta = CTX["conta"]
    nome = f"{PREFIXO} anual {secrets.token_hex(3)}"
    plano = um(f"""insert into {S}.planos_aluno (conta_id, nome, valor, meses, modalidades, max_parcelas_cartao)
                   values ('{conta}', {lit(nome)}, 120, 12, array['avista', 'cartao_parcelado', 'mensal'], 3) returning id::text as id""")["id"]
    esconder()
    sql(f"""update {S}.pacientes set plano_aluno_id = '{plano}', plano_modalidade = 'cartao_parcelado', mensalidade_desde = now() - interval '1 day'
             where id = '{CTX['pac']}'""")
    ligar_infinitepay()
    st, r = pedir(DONO, "prof_planos", {"conta_id": conta})
    p.check(st == 200 and r.get("modalidades_da_conta") == ["avista", "mensal"], f"a conta InfinitePay recebe período todo e mês a mês ({r.get('modalidades_da_conta')})")
    st, r = pedir(DONO, "prof_plano_salvar", {"conta_id": conta, "id": plano, "nome": nome, "meses": 12, "valor": 120,
                                               "modalidades": ["avista", "cartao_parcelado", "mensal"], "max_parcelas_cartao": 3})
    p.check(st == 200, f"o plano que já tinha cartão parcelado salva sem tirar ({st} {r.get('erro')})")
    st, r = pedir(DONO, "prof_plano_salvar", {"conta_id": conta, "nome": f"{PREFIXO} novo {secrets.token_hex(3)}", "meses": 6, "valor": 60,
                                               "modalidades": ["cartao_parcelado"], "max_parcelas_cartao": 3})
    p.check(st == 400 and r.get("erro") == "modalidade_da_conta", f"plano novo com cartão parcelado na InfinitePay → 400 ({st} {r.get('erro')})")
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    c = (r.get("cobranca") or {}).get("id")
    linha = um(f"select valor::float as v, meses_cobertos as m from {S}.cobrancas where id = '{c}'") if c else None
    p.check(st == 200 and linha == {"v": 120.0, "m": 12}, f"o aluno no cartão parcelado paga o período todo: R$ 120 por 12 meses ({st} {r.get('erro')} {linha})")


# ───────────────────────── casos --local (o simulador no lugar da API) ─────────────────────────

def pagar_pelo_webhook(pedido: str, nsu: str, slug: str = "slug-1", **extra) -> None:
    st, r, _ = webhook({"order_nsu": pedido, "transaction_nsu": nsu, "invoice_slug": slug, "receipt_url": "https://recibo.infinitepay.io/w1e2e",
                        "capture_method": "pix", **extra})
    if st != 200 or r.get("resultado") != "registrado":
        raise RuntimeError(f"webhook local não registrou ({st} {r})")


def conferido(c: str, nsu: str, segundos: float = 30):
    return esperar(lambda: (lambda x: x if x and x["conferido"] else None)(aviso_da_caixa(c, nsu)), segundos)


def reagendado(c: str, nsu: str, segundos: float = 30):
    return esperar(lambda: (lambda x: x if x and x["tentativas"] >= 1 else None)(aviso_da_caixa(c, nsu)), segundos)


def caso_baixa() -> None:
    print("\n── baixa (local): o webhook + o 'pago' do simulador dão baixa uma vez")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    nsu = f"NSU-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, paid_amount=cts + 45, installments=1, capture_method="pix", nsus=[nsu], amarra_nsu=True)
    antes = pago_ate()
    pagar_pelo_webhook(ped, nsu)
    linha = esperar(lambda: um(f"""select ip_transaction_nsu as nsu, ip_slug as slug, ip_recibo_url as rec, ip_meio as meio, metodo,
                                          ip_valor_pago::float as pago from {S}.cobrancas where id = '{c}' and status = 'paga'"""), 30)
    p.check(bool(linha) and linha["nsu"] == nsu and linha["slug"] == "slug-1" and linha["rec"] == "https://recibo.infinitepay.io/w1e2e"
            and linha["meio"] == "pix" and linha["metodo"] == "pix" and abs(linha["pago"] - (cts + 45) / 100) < 0.001, f"paga com o que a InfinitePay disse ({linha})")
    p.check(pago_ate() != antes, f"o 'pago até' andou ({antes} → {pago_ate()})")
    chk = [x for x in pedidos_do_simulador() if x["caminho"] == "/payment_check"]
    p.check(bool(chk) and chk[-1]["corpo"] == {"handle": CTX["tag_em_uso"], "order_nsu": ped, "transaction_nsu": nsu, "slug": "slug-1"},
            "o payment_check foi com a InfiniteTag e o pedido do LINK (I4), o NSU e o slug")
    # os avisos saem DEPOIS da baixa, na mesma conferência em 2º plano (avisarPago): espera por eles, não só pelo "paga"
    p.check(esperar(lambda: avisos("pagamento_confirmado") == {"aluno": 1, "personal": 1}, 15), "'pagamento confirmado' ao aluno e ao personal")
    pagar_pelo_webhook(ped, nsu)
    time.sleep(4)
    n = um(f"select count(*)::int as n from {S}.cobrancas where ip_transaction_nsu = {lit(nsu)}")["n"]
    p.check(avisos("pagamento_confirmado") == {"aluno": 1, "personal": 1} and n == 1, "o mesmo webhook de novo: nada muda")
    CTX["paga"] = {"id": c, "pedido": ped, "centavos": cts, "nsu": nsu}


def caso_repetido() -> None:
    print("\n── repetido (local, C1): outro NSU no link já pago, no PIOR caso (a InfinitePay não amarra o NSU): só o aviso ao personal")
    if not CTX.get("paga"):
        caso_baixa()
    c, ped, cts = CTX["paga"]["id"], CTX["paga"]["pedido"], CTX["paga"]["centavos"]
    cenario(pago=True, amount=cts, amarra_nsu=False)
    antes, pagas = pago_ate(), mensalidades_pagas()
    nsu2 = f"NSU2-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu2, slug="slug-2")
    linha = conferido(c, nsu2)
    p.check(bool(linha) and linha["resultado"] == "outro_pagamento" and pago_ate() == antes and mensalidades_pagas() == pagas
            and avisos("geral", "outro pagamento")["personal"] == 1,
            f"mensalidade: nenhum período a mais, nenhuma linha nova; 1 aviso 'confira' ao personal ({linha})")
    nsu3 = f"NSU3-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu3, slug="slug-3")
    conferido(c, nsu3)
    p.check(avisos("geral", "outro pagamento")["personal"] == 1, "o forjado seguinte: o sino não repete (1 aviso por cobrança a cada 24 h)")
    st, r = pedir(DONO, "prof_cobranca_criar", {"aluno": CTX["pac"], "descricao": f"{PREFIXO} avulsa 2x", "valor": 3, "vencimento": B.hoje()})
    av = (r.get("cobranca") or {}).get("id")
    pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"], "cobranca_id": av})
    pav = pedido_de(av)
    cenario(pago=True, amount=300, amarra_nsu=False)
    pagar_pelo_webhook(pav, f"A1-{secrets.token_hex(3)}")
    esperar(lambda: um(f"select 1 as ok from {S}.cobrancas where id = '{av}' and status = 'paga'"), 30)
    a2 = f"A2-{secrets.token_hex(3)}"
    pagar_pelo_webhook(pav, a2, slug="slug-a2")
    linha = conferido(av, a2)
    rep = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and descricao like 'Pagamento repetido%'
                   and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]
    p.check(bool(linha) and linha["resultado"] == "outro_pagamento" and rep == 0 and avisos("geral", "outro pagamento")["personal"] == 2,
            f"avulsa paga 2×: sem 'Pagamento repetido', só o aviso ({linha})")


def caso_forjado_pago() -> None:
    print("\n── forjado_pago (local, C1): NSU inventado num pedido JÁ pago, com a InfinitePay conferindo o NSU → nada muda, ninguém avisado")
    if not CTX.get("paga"):
        caso_baixa()
    c, ped, cts, nsu_ok = (CTX["paga"][k] for k in ("id", "pedido", "centavos", "nsu"))
    cenario(pago=True, amount=cts, nsus=[nsu_ok], amarra_nsu=True)
    antes, geral = pago_ate(), avisos("geral")
    forjado = f"FORJ-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, forjado, slug="forjado")
    linha = reagendado(c, forjado)
    gravado = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(bool(linha) and linha["resultado"] is None and linha["adiado"] and pago_ate() == antes and avisos("geral") == geral
            and gravado == nsu_ok, f"'não pago' para o NSU inventado: reagendado; o NSU de verdade fica; ninguém avisado ({linha})")


def caso_valor() -> None:
    print("\n── valor (local): o payment_check com outro amount não dá baixa")
    esconder()
    c = garantir_tentativa()
    cenario(pago=True, amount=centavos_de(c) - 1)
    nsu = f"V-{secrets.token_hex(4)}"
    pagar_pelo_webhook(pedido_de(c), nsu)
    linha = conferido(c, nsu)
    st = um(f"select status from {S}.cobrancas where id = '{c}'")["status"]
    p.check(bool(linha) and linha["resultado"] == "valor_diferente" and st == "aguardando_confirmacao"
            and avisos("geral", "valor diferente")["personal"] == 1, f"sem baixa + aviso ao personal ({linha} {st})")


def caso_volta() -> None:
    print("\n── volta (local): a volta da página dá baixa na hora")
    esconder()
    c = garantir_tentativa()
    cenario(pago=True, amount=centavos_de(c), installments=3, capture_method="credit_card")
    nsu = f"VOLTA-{secrets.token_hex(4)}"
    st, r = pedir(ALUNO, "aluno_ip_volta", {"order_nsu": pedido_de(c), "transaction_nsu": nsu, "slug": "volta-1",
                                             "receipt_url": "https://recibo.infinitepay.io/volta", "capture_method": "credit_card"})
    linha = um(f"select ip_parcelas as n, ip_meio as meio, metodo from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and r.get("paga") is True and (aviso_da_caixa(c, nsu) or {}).get("origem") == "volta"
            and linha == {"n": 3, "meio": "credit_card", "metodo": "cartao"}, f"paga pela volta, cartão em 3× ({st} {r.get('resultado')} {linha})")


def caso_atrasado() -> None:
    print("\n── atrasado (local): a tentativa vencida (fechada) paga depois")
    esconder()
    c = garantir_tentativa()
    sql(f"update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = '{c}'")
    pedir(ALUNO, "aluno_status")
    fora = um(f"select deleted_at is not null as f from {S}.cobrancas where id = '{c}'")["f"]
    cenario(pago=True, amount=centavos_de(c))
    pagar_pelo_webhook(pedido_de(c), f"ATR-{secrets.token_hex(4)}")
    linha = esperar(lambda: um(f"select status, deleted_at is null as volta from {S}.cobrancas where id = '{c}' and status = 'paga'"), 30)
    p.check(fora is True and linha == {"status": "paga", "volta": True}, f"fechada e depois paga: volta ao histórico ({fora} → {linha})")


def caso_pedido() -> None:
    print("\n── pedido (local, W1-B2 + C1): pago só pelo pedido; o NSU de verdade depois NÃO troca nem cria linha — só o aviso")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    real = f"REAL-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, nsus=[real], amarra_nsu=True)
    st, r = pedir(ALUNO, "aluno_ip_conferir", {"cobranca_id": c})
    nsu = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(st == 200 and r.get("paga") is True and nsu == f"pedido:{ped}", f"paga pelo pedido ({st} {r.get('resultado')} {nsu})")
    pagar_pelo_webhook(ped, real)
    linha = conferido(c, real)
    depois = um(f"select ip_transaction_nsu as n from {S}.cobrancas where id = '{c}'")["n"]
    p.check(bool(linha) and linha["resultado"] == "nsu_novo" and depois == f"pedido:{ped}" and mensalidades_pagas() == 1
            and avisos("geral", "confirmou de novo")["personal"] == 1,
            f"o NSU de verdade não troca o do pedido, não nasce 2ª linha e o personal recebe 1 aviso ({linha} {depois})")


def caso_naopago() -> None:
    print("\n── naopago (local, I1): 'não pago' na 1ª conferência não fecha o aviso; o mesmo aviso depois reabre e dá baixa")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    nsu = f"NP-{secrets.token_hex(4)}"
    cenario(pago=False, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"] and linha["resultado"] is None, f"'não pago' → reagendado, aberto ({linha})")
    # fechado como na 24ª conferência ("não pago" em todas); o webhook verdadeiro chega de novo depois da aprovação
    sql(f"""update {S}.infinitepay_avisos set conferido_em = now(), resultado = 'nao_pago', tentativas = 24
             where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}""")
    cenario(pago=True, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    paga = esperar(lambda: um(f"select 1 as ok from {S}.cobrancas where id = '{c}' and status = 'paga'"), 30)
    # o aviso fecha como "pago" DEPOIS da baixa e dos avisos do sino (aplicar → avisarPago → fechar): espera por ele
    fechou = esperar(lambda: (aviso_da_caixa(c, nsu) or {}).get("resultado") == "pago", 15)
    p.check(bool(paga) and fechou, "o mesmo aviso reabriu e deu baixa: o pagamento não se perde")


def caso_registrado() -> None:
    print("\n── registrado (local, I5): registrar à mão com a tentativa aberta usa a MESMA linha; a confirmação depois só avisa")
    esconder()
    c = garantir_tentativa()
    ped, cts = pedido_de(c), centavos_de(c)
    st, r = pedir(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": B.hoje(), "metodo": "pix", "valor": 10})
    linha = um(f"select status, forma from {S}.cobrancas where id = '{c}'")
    p.check(st == 200 and (r.get("cobranca") or {}).get("id") == c and linha == {"status": "paga", "forma": "manual"} and mensalidades_pagas() == 1,
            f"a tentativa virou a linha registrada, sem nascer outra ({st} {r.get('erro')} {linha})")
    antes = pago_ate()
    nsu = f"REG-{secrets.token_hex(4)}"
    cenario(pago=True, amount=cts, nsus=[nsu], amarra_nsu=True)
    pagar_pelo_webhook(ped, nsu)
    av = conferido(c, nsu)
    p.check(bool(av) and av["resultado"] == "ja_pago_por_fora" and pago_ate() == antes and mensalidades_pagas() == 1
            and avisos("geral", "já tinha registrado")["personal"] == 1, f"a confirmação depois: 'já registrado' ao personal, sem 2º período ({av})")


def caso_fora() -> None:
    print("\n── fora (local): a InfinitePay fora do ar")
    esconder()
    c = garantir_tentativa()
    ped = pedido_de(c)
    cenario(check_status=503)
    nsu = f"FORA-{secrets.token_hex(4)}"
    pagar_pelo_webhook(ped, nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["adiado"], f"fica para depois (tentativas 1, proxima_em adiante) ({linha})")
    sql(f"update {S}.infinitepay_avisos set tentativas = 23, tentado_em = null where cobranca_id = '{c}' and transaction_nsu = {lit(nsu)}")
    pagar_pelo_webhook(ped, nsu)
    linha = conferido(c, nsu)
    p.check(bool(linha) and linha["resultado"] == "desistiu" and avisos("geral", "Não conseguimos confirmar")["personal"] == 1,
            f"na 24ª desiste e avisa o personal ({linha})")


def caso_desligado() -> None:
    print("\n── desligado (local): o checkout externo desligado — o link volta com o 'ativar'; a conferência fica sem decisão (não fecha)")
    esconder()
    ligar_infinitepay()
    cenario(links_status=404, links_corpo=DESLIGADO)
    st, r = pedir(ALUNO, "aluno_ip_link", {"paciente_id": CTX["pac"]})
    sobra = um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and forma = 'infinitepay'
                     and status = 'aguardando_confirmacao' and deleted_at is null and created_at >= {lit(CTX['t0'])}::timestamptz""")["n"]
    p.check(st == 400 and r.get("erro") == "infinitepay_checkout_desligado" and r.get("ativar") == ATIVAR and sobra == 0,
            f"o link: 400 com o link de ativar e a tentativa desfeita ({st} {r.get('erro')} {sobra})")
    cenario()
    c = garantir_tentativa()
    nsu = f"DESL-{secrets.token_hex(4)}"
    cenario(check_status=404, check_corpo=DESLIGADO)
    pagar_pelo_webhook(pedido_de(c), nsu)
    linha = reagendado(c, nsu)
    p.check(bool(linha) and not linha["conferido"] and linha["resultado"] is None, f"a conferência: sem decisão, o aviso fica para depois ({linha})")


FUNCOES = {"recebimento": caso_recebimento, "ligar": caso_ligar, "link": caso_link, "forjado": caso_forjado, "vencida": caso_vencida,
           "avulsa": caso_avulsa, "trocar": caso_trocar, "periodo": caso_periodo, "baixa": caso_baixa, "repetido": caso_repetido,
           "forjado_pago": caso_forjado_pago, "valor": caso_valor, "volta": caso_volta, "atrasado": caso_atrasado, "pedido": caso_pedido,
           "naopago": caso_naopago, "registrado": caso_registrado, "fora": caso_fora, "desligado": caso_desligado}


# ───────────────────────── seco, ambiente e main ─────────────────────────

def ambiente(casos: list[str]) -> None:
    """Só leitura: a W1 no staging, a flag, as funções publicadas (no padrão), a InfiniteTag de teste, o deno (no --local)."""
    w1 = um(f"select to_regclass('{S}.infinitepay_avisos') is not null as ok")["ok"]
    p.check(bool(w1), f"{S}: a W1 (20261011200000_w1_infinitepay.sql)")
    if not CTX.get("local"):
        for slug, jwt in (("pagamentos-aluno", True), ("infinitepay-webhook-aluno", False)):
            st, r, _ = B.http("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/functions/{slug}", None,
                              {"Authorization": f"Bearer {B.ler('.pc-pat')}"})
            r = r if isinstance(r, dict) else {}
            p.check(st == 200 and r.get("verify_jwt") is jwt, f"função {slug} publicada com verify_jwt {str(jwt).lower()} (versão {r.get('version')})")
        if set(casos) & PRECISAM_DA_TAG:
            p.check(bool(CTX.get("tag")), f"a InfiniteTag de teste em ~/{ARQ_TAG.name} (cofre: 'InfinitePay — InfiniteTag do Weslley (testes da W1)')")
    else:
        p.check((Path.home() / ".deno" / "bin" / "deno").exists(), "o deno local (~/.deno/bin/deno)")


class _PlacarFalso:
    """Um placar que só guarda o texto (o autoteste do PlacarSemTag no --seco)."""

    def __init__(self) -> None:
        self.textos: list[str] = []

    def check(self, ok: object, texto: str) -> bool:
        self.textos.append(texto)
        return bool(ok)


def autoteste_sem_tag() -> None:
    """--seco: o PlacarSemTag troca a InfiniteTag em toda mensagem — com uma tag inventada (a de verdade não passa por aqui): a linha da
    tentativa vencida (dict), os links da avulsa (lista), o erro de SQL em maiúsculas, a url e o $; e o placar da rodada é ele."""
    falso, antes = _PlacarFalso(), CTX.get("tag")
    CTX["tag"] = "fulano.teste"
    try:
        sp = PlacarSemTag(falso)
        sp.check(True, f"o aluno_status fechou a tentativa ({ {'status': 'cancelada', 'fora': True, 'h': 'fulano.teste'} })")
        sp.check(True, f"pagar de novo: OUTRO link (200 {[{'n': 1, 'handle': 'fulano.teste'}, {'n': 2, 'handle': 'fulano.teste'}]})")
        sp.check(False, "[avulsa] quebrou: RuntimeError('SQL HTTP 400: Key (handle)=(FULANO.TESTE)') https://checkout.infinitepay.io/fulano.teste?l=1 $fulano.teste")
    finally:
        CTX["tag"] = antes
    p.check(isinstance(p, PlacarSemTag) and len(falso.textos) == 3 and all("fulano.teste" not in t.lower() and "<InfiniteTag>" in t for t in falso.textos),
            "seco: o placar troca a InfiniteTag por <InfiniteTag> em toda mensagem — a linha do banco, os links, o erro, a url e o $")


def seco(casos: list[str]) -> int:
    print("── seco: logins, leituras e (no --local) os 3 processos — nenhuma ação é chamada, nada é gravado")
    autoteste_sem_tag()
    for conta in (DONO, ALUNO):
        try:
            p.check(bool(B.token(conta)), f"login da conta de TESTE {conta}")
        except Exception as e:  # noqa: BLE001
            p.check(False, f"login {conta}: {type(e).__name__}")
    ambiente(casos)
    if CTX.get("local"):
        procs = subir_local()
        try:
            st, r, _ = webhook(None, metodo="GET")
            p.check(st == 200 and r.get("resultado") == "ignorado_metodo", f"o webhook local responde ({st} {r.get('resultado')})")
            st, _, _ = B.http("OPTIONS", f"http://127.0.0.1:{PORTA_PAG}", None, {"Origin": "http://localhost:8080"})
            p.check(st == 200, f"a pagamentos-aluno local responde ({st})")
            cenario(pago=False)
            p.check(pedidos_do_simulador() == [], "o simulador responde")
            # só leitura: as chaves do ambiente servem no Deno local (o webhook lê o banco; a pagamentos-aluno confere a sessão no Auth)
            st, r, _ = webhook({"order_nsu": f"{uuid.uuid4()}-1", "transaction_nsu": "seco"})
            p.check(st == 200 and r.get("resultado") == "ignorado_pedido",
                    f"o webhook local lê o banco do {S} com a chave do servidor (pedido que não é nosso → ignorado_pedido) ({st} {r.get('resultado')})")
            st, r = pedir(ALUNO, "seco_sem_acao")
            p.check(st == 400 and r.get("erro") == "acao_invalida",
                    f"a pagamentos-aluno local confere a sessão do {ALUNO} (ação que não existe → 400 acao_invalida) ({st} {r.get('erro')})")
            p.check(pedidos_do_simulador() == [], "no seco ninguém chamou a 'InfinitePay' (o simulador)")
        finally:
            descer_local(procs)
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W1 — E2E de servidor da InfinitePay (staging)")
    ap.add_argument("--local", action="store_true", help="as 2 funções no Deno local + o simulador (o caminho da baixa)")
    ap.add_argument("--casos", default=None, help="lista separada por vírgula (padrão: todos do modo)")
    ap.add_argument("--sinal", default=None, help="arquivo-sinal da trava do banco do staging: sem ele não começa; sumiu → para antes do próximo caso")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    CTX["local"] = a.local
    todos = CASOS_LOCAL if a.local else CASOS_STAGING
    casos = [c.strip() for c in (a.casos or ",".join(todos)).split(",") if c.strip()]
    if any(c not in todos for c in casos):
        ap.error(f"casos deste modo: {', '.join(todos)}")
    sinal = Path(a.sinal).expanduser() if a.sinal else None
    carregar_base()
    CTX["tag"] = tag_de_teste()
    if not B.saude_treino() or not saude_principal():
        print("   o banco do Treino ou o principal não está saudável — parar (regra de 10/10)")
        return 2
    if a.seco:
        return seco(casos)
    pendente = json.loads(ESTADO_ARQ.read_text(encoding="utf-8")) if ESTADO_ARQ.exists() else None
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer(pendente)
        if ESTADO_ARQ.exists():
            return p.fim()
    if a.limpar:
        return p.fim()
    if sinal and not sinal.exists():
        print(f"   sem o sinal {sinal} (a trava do banco do staging): a rodada não começa", flush=True)
        return 3
    procs = subir_local() if a.local else []
    try:
        preparar()
        for nome in casos:
            if sinal and not sinal.exists():
                print(f"\n⏸️  o sinal {sinal.name} sumiu (o banco do staging voltou para a outra sessão): parei antes do caso '{nome}'", flush=True)
                CTX["interrompida"] = nome
                break
            if not a.local and nome in PRECISAM_DA_TAG and not CTX.get("tag"):
                p.check(False, f"[{nome}] falta a InfiniteTag de teste (~/{ARQ_TAG.name} — está no cofre) — pulei")
                continue
            try:
                FUNCOES[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
    finally:
        if CTX.get("estado"):
            desfazer(CTX["estado"])
        descer_local(procs)
    r = p.fim()
    if CTX.get("interrompida"):
        print(f"   rodada INTERROMPIDA antes de '{CTX['interrompida']}' (o sinal sumiu): a massa foi desfeita — rode de novo com o sinal")
        return 3
    return r


if __name__ == "__main__":
    sys.exit(main())
