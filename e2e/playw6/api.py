#!/usr/bin/env python3
"""Physiq play-W6 — E2E de SERVIDOR da assinatura da Google Play, LOCAL (o molde do e2e/mpc/api.py --local): a play-compras, a play-rtdn,
a pagamentos-aluno e a excluir-minha-conta no Deno LOCAL (e2e/w1/servir_local.ts) contra o banco do STAGING (x-schema staging — outro
schema nunca; a migration da play-W6 já no staging) e o SIMULADOR da Play (e2e/playw6/simulador_play.py: a API, o OAuth da conta de serviço
FALSA e o push ASSINADO por chave local — o JWKS dele no lugar do do Google pelo PLAY_OIDC_JWKS, que a produção não tem). O Deno só alcança
127.0.0.1 e o Supabase (--allow-net): o Google e o Mercado Pago de verdade nem são alcançáveis.

Contas de TESTE (staging): w7b-treino (vencida: as compras, o RTDN, a troca e o vínculo), w7b-removido (no teste grátis: o defer; e a
exclusão), w7b-vence (coberta pelo mês do MP: a corrida com a automática e o 409 do site); a matrícula do w7b-novo só como "outro dono"
(sem login). Casos (--local, na ordem):
  oidc         o push: OIDC válido (a notificação de teste → 204 + log play_rtdn_teste) · ausente · outra chave · outra audiência · outro e-mail
               · e-mail não verificado · vencido · kid desconhecido → 401
  registrar    a compra conferida no Google, gravada (ativa; a cobertura = o fim da Play; 1 cobrança google_play paga) e reconhecida; 2× = 1 linha
  outro_dono   a compra de OUTRA matrícula → 409 compra_de_outra_conta (nada gravado nem reconhecido)
  token_falso  o token que o Google não conhece → 400 compra_invalida; fora do formato → 400 pedido_invalido
  estado       disponivel, a matrícula, a assinatura (só estado, renova, expira_em e produto: sem token nem pedido)
  teste_defer  no teste grátis: a 1ª compra é adiada pelos dias que faltam (≥ 1 dia) e a cobertura vai ao fim novo
  mp_vivo      com a automática do MP viva (a corrida; a automática SIMULADA "sim-playw6-…", que só existe no banco): a do MP cancelada, a
               Play segue, adiada pelo que o MP pagou
  rtdn         RENEWED → +1 cobrança e a cobertura anda · o mesmo aviso de novo = nada · IN_GRACE → cobre · ON_HOLD → trava · RECOVERED · CANCELED
               → vale até o fim · EXPIRED → trava · REVOKED → revogada, trava · VOIDED → a cobrança devolvida
  troca        para o completo NA HORA (a anterior substituída, o plano na hora) · para o Treino NA RENOVAÇÃO (o plano só no RENEWED)
  vinculo      2 matrículas do app SINTÉTICAS ("PLAYW6 Vínculo A/B" do w7b-treino, encerradas pelo vínculo — o molde do e2e/w19) com a Play
               viva: o aviso RENEWED da A → a rede do play-rtdn cancela; o aluno_status (a rede da pagamentos-aluno) cancela a B — as 2 com
               DEVELOPER_REQUESTED_STOP_PAYMENTS (vale até o fim, sem devolver)
  exclusao     o Google fora → 502 play_nao_cancelada e nada apagado (o Treino nem é chamado para excluir); o Google ok → a da Play cancelada
               ANTES e o Treino (FALSO, local: o "excluir" falha) → 502 treino_indisponivel — nada apagado no principal nem no login
  site_409     com a Play viva, o Pix do site/APK antigo → 409 assinatura_play; o aluno_status traz o play (sem o token)
  log          o log do Deno da rodada sem os valores de teste (os tokens de compra, os pedidos, os e-mails): 0 ocorrência
A FOTO (antes de gravar, em ~/projetos/physiqcalc-scratch/hml/playw6/local/api-estado.json, 600): as matrículas das 3 contas. No fim (ou no
--limpar): saem as assinaturas da Play da rodada (token "simtok-"), as cobranças google_play delas, a automática simulada ("sim-playw6-"),
as matrículas sintéticas ("PLAYW6 ") e os eventos de plano da rodada; o plano volta ao da foto e a cobertura é recalculada; a conferência
(SQL SÓ LEITURA pelo ~/projetos/physiqcalc-scratch/hml/sqlro.py, só contagens) pede 0 linha com a marca da rodada e as 3 matrículas iguais
à foto. Os logins (1 por conta usada) saem com logout local no fim.
Saída sem dado pessoal nem segredo: códigos, status, contagens e booleanos.
Precisa: ~/.pc-pat, as senhas das contas de TESTE, o ~/.deno/bin/deno e as portas 8791–8796 livres.
Uso: python3 e2e/playw6/api.py --seco
     python3 e2e/playw6/api.py --local [--casos registrar,rtdn,...]
     python3 e2e/playw6/api.py --limpar
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(AQUI))
import simulador_play as SIM  # noqa: E402

S = "staging"
CASA = Path.home()
DIR = CASA / "projetos" / "physiqcalc-scratch" / "hml" / "playw6" / "local"
ESTADO_ARQ = DIR / "api-estado.json"
LOG_DENO = DIR / "deno-local.log"
SQLRO = CASA / "projetos" / "physiqcalc-scratch" / "hml" / "sqlro.py"
DENO = CASA / ".deno" / "bin" / "deno"
PORTAS = {"compras": 8791, "rtdn": 8792, "pag": 8793, "excluir": 8794, "treino": 8795, "sim": 8796}
FUNCOES = {"compras": "play-compras", "rtdn": "play-rtdn", "pag": "pagamentos-aluno", "excluir": "excluir-minha-conta"}
CONTAS = ("w7b-treino", "w7b-removido", "w7b-vence")
OUTRO_DONO = "w7b-novo"
MARCA_AUTOMATICA = "sim-playw6-"
MARCA_SINTETICA = "PLAYW6 "
CANCELAMENTO = "DEVELOPER_REQUESTED_STOP_PAYMENTS"
CASOS = ("oidc", "registrar", "outro_dono", "token_falso", "estado", "teste_defer", "mp_vivo", "rtdn", "troca", "vinculo", "exclusao", "site_409", "log")
CAMPOS_FOTO = ("ativo", "plano_id", "valor", "pago_ate", "teste_ate", "encerrada_em", "encerrada_motivo")

B = None   # a base da W7b (e2e/w07b/_base.py: as contas de TESTE, o login e o SQL) — carregada no --local/--limpar (o --seco não abre rede)
p = None
CTX: dict = {"tokens": [], "pedidos": [], "freio": [], "logins": []}
_ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({}))


# ───────────────────────── a base, o banco e a rede ─────────────────────────

def carregar_base() -> None:
    """A base da W7b + o contador de logins (cada sessao() nova = 1 login de verdade no Auth)."""
    global B, p
    if B is not None:
        return
    sys.path.insert(0, str(RAIZ / "e2e" / "w07b"))
    import _base  # noqa: PLC0415

    B, p = _base, _base.p
    B.ESTADO["schema"] = S
    original = B.B7.sessao

    def sessao_contada(conta: str) -> dict:
        CTX["logins"].append(conta)
        return original(conta)

    B.B7.sessao = sessao_contada


def carregar_placar() -> None:
    global p
    if p is None:
        sys.path.insert(0, str(RAIZ / "e2e" / "w02"))
        from _comum import Placar  # noqa: PLC0415

        p = Placar()


def sql(q: str) -> list:
    return B.sql_principal(q)


def um(q: str) -> dict | None:
    r = sql(q)
    return r[0] if r else None


def lit(v) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def sql_so_leitura(q: str) -> list[dict]:
    """A conferência pelo sqlro.py (Management API com read_only: true) — a saída dele é k=v por linha (mascarada); devolve as linhas."""
    env = {**os.environ, "SUPABASE_PAT": (CASA / ".pc-pat").read_text(encoding="utf-8").strip()}
    r = subprocess.run([sys.executable, str(SQLRO), B.PRINCIPAL_REF], input=q, capture_output=True, text=True, env=env, timeout=240)
    linhas = r.stdout.strip().splitlines()
    if r.returncode != 0 or not linhas or not linhas[0].startswith(("status 200", "status 201")):
        raise RuntimeError(f"sqlro: rc {r.returncode}, {linhas[0] if linhas else 'sem saída'}")
    return [dict(par.split("=", 1) for par in linha.split(" ") if "=" in par) for linha in linhas[1:]]


def rede(metodo: str, url: str, corpo=None, cab: dict | None = None, timeout: float = 120) -> tuple[int, object]:
    dados = None if corpo is None else json.dumps(corpo).encode()
    h = {"User-Agent": "physiq-e2e-playw6"}
    if corpo is not None:
        h["Content-Type"] = "application/json"
    h.update(cab or {})
    req = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    try:
        with _ABRIR.open(req, timeout=timeout) as r:
            st, txt = r.status, r.read()
    except urllib.error.HTTPError as e:
        try:
            st, txt = e.code, e.read()
        finally:
            e.close()
    try:
        return st, (json.loads(txt) if txt else None)
    except ValueError:
        return st, txt.decode("utf-8", "replace")


def porta_aberta(porta: int) -> bool:
    with socket.socket() as s_:
        s_.settimeout(0.5)
        return s_.connect_ex(("127.0.0.1", porta)) == 0


def esperar(funcao, segundos: float, passo: float = 1.0):
    fim = time.time() + segundos
    while True:
        v = funcao()
        if v or time.time() >= fim:
            return v
        time.sleep(passo)


def agora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def ts(texto: str | None) -> dt.datetime | None:
    if not texto:
        return None
    t = texto.replace("Z", "+00:00").replace(" ", "T")
    if len(t) >= 3 and t[-3] in "+-" and t[-2:].isdigit():
        t += ":00"
    return dt.datetime.fromisoformat(t)


def perto(a: dt.datetime | None, b: dt.datetime | None, s: float = 2.0) -> bool:
    return a is not None and b is not None and abs((a - b).total_seconds()) <= s


def travada(cob: dt.datetime | None) -> bool:
    return cob is None or cob <= agora()


# ───────────────────────── o simulador e o Treino falso ─────────────────────────

def sim(caminho: str, corpo: dict | None = None) -> dict:
    st, r = rede("POST", f"http://127.0.0.1:{PORTAS['sim']}{caminho}", corpo or {})
    if st != 200:
        raise RuntimeError(f"simulador {caminho}: {st}")
    return r if isinstance(r, dict) else {}


def sim_pedidos(desde: int = 0) -> list[dict]:
    st, r = rede("GET", f"http://127.0.0.1:{PORTAS['sim']}/_pedidos?desde={desde}")
    return r.get("pedidos", []) if st == 200 and isinstance(r, dict) else []


def sim_n() -> int:
    st, r = rede("GET", f"http://127.0.0.1:{PORTAS['sim']}/_pedidos?desde=999999")
    return int(r.get("n", 0)) if st == 200 and isinstance(r, dict) else 0


def cancelamentos_desde(n0: int) -> list[dict]:
    return [x for x in sim_pedidos(n0) if x.get("acao") == "cancel" and x.get("status") == 200]


def comprar(produto: str, conta: str | None, **extra) -> dict:
    """Uma compra no simulador (o que a folha da Play devolveria ao app) — o token e o pedido entram na lista da rodada (a busca no log)."""
    c = sim("/_compra", {"produto": produto, "conta": conta, **extra})
    CTX["tokens"].append(c["token"])
    if c.get("pedido"):
        CTX["pedidos"].append(c["pedido"])
    return c


def mudar(token: str, acao: str) -> dict:
    r = sim("/_mudar", {"token": token, "acao": acao})
    if r.get("pedido"):
        CTX["pedidos"].append(r["pedido"])
    return r


def info(token: str) -> dict:
    return sim("/_compra_info", {"token": token})


def empurrar(**d) -> int:
    return int(sim("/_push", {"url": f"http://127.0.0.1:{PORTAS['rtdn']}/play-rtdn", **d}).get("status") or 0)


class TreinoFalso:
    """O lugar da delete-my-account do Treino na exclusão (o TREINO_URL do Deno local): o "conferir" responde ok (sem vínculo) e o
    "excluir" falha (503) — a exclusão para ali (502 treino_indisponivel) e NADA é apagado. Guarda as ações que chegaram."""

    def __init__(self, porta: int) -> None:
        self.acoes: list[str] = []
        dono = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *_a) -> None:
                return

            def do_POST(self) -> None:  # noqa: N802
                n = int(self.headers.get("Content-Length") or 0)
                try:
                    acao = str(json.loads(self.rfile.read(n) or b"{}").get("acao") or "")
                except ValueError:
                    acao = "?"
                dono.acoes.append(acao)
                corpo = json.dumps({"ok": True, "sem_vinculo": True} if acao == "conferir" else {"erro": "treino_falso"}).encode()
                self.send_response(200 if acao == "conferir" else 503)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

        self.srv = ThreadingHTTPServer(("127.0.0.1", porta), H)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def fechar(self) -> None:
        self.srv.shutdown()
        self.srv.server_close()


# ───────────────────────── o Deno local ─────────────────────────

def ambiente_deno(conta_servico: dict) -> dict:
    """O ambiente do Deno local (só neste processo; nada impresso)."""
    fora = ("MP_", "SEGREDO_", "SUPABASE_", "PLAY_", "TREINO_", "ERROS_", "INFINITEPAY_", "TELEGRAM_", "PROXY_")
    env = {k: v for k, v in os.environ.items() if not k.startswith(fora)}
    base_sim = f"http://127.0.0.1:{PORTAS['sim']}"
    env |= {
        "DENO_NO_PACKAGE_JSON": "1", "ERROS_AVISO_DESLIGADO": "1",
        "SUPABASE_URL": B.PRINCIPAL_URL, "SUPABASE_SERVICE_ROLE_KEY": B.service(B.PRINCIPAL_REF), "SUPABASE_ANON_KEY": B.anon(B.PRINCIPAL_REF),
        # a Play: a conta de serviço FALSA do simulador (a chave é desta execução) e as 3 trocas que só o teste local tem
        "PLAY_SERVICE_ACCOUNT": json.dumps(conta_servico), "PLAY_API_BASE": base_sim, "PLAY_OAUTH_URL": f"{base_sim}/token",
        "PLAY_OIDC_JWKS": f"{base_sim}/jwks",
        # o MP num endereço FECHADO (a automática da rodada é simulada: cancela só no banco)
        "MP_API_BASE": "http://127.0.0.1:19", "MP_ACCESS_TOKEN_TEST": "TEST-0-playw6-fechado", "MP_ACCESS_TOKEN_PROD": "APP_USR-0-playw6-fechado",
        "INFINITEPAY_API": "http://127.0.0.1:19",
        # o Treino FALSO (a exclusão nunca apaga nada)
        "TREINO_URL": f"http://127.0.0.1:{PORTAS['treino']}", "TREINO_ANON_KEY": "anon-falso-playw6", "SEGREDO_CONTA_TREINO": secrets.token_urlsafe(32),
    }
    return env


def tamanho_do_log() -> int:
    return LOG_DENO.stat().st_size if LOG_DENO.exists() else 0


def log_desde(pos: int) -> str:
    time.sleep(0.4)
    with LOG_DENO.open("rb") as f:
        f.seek(pos)
        return f.read().decode("utf-8", "replace")


def subir(rotulo: str = "e2e/playw6/api.py --local") -> dict:
    for nome, porta in PORTAS.items():
        if porta_aberta(porta):
            raise RuntimeError(f"a porta {porta} ({nome}) já está em uso — outra rodada?")
    DIR.mkdir(parents=True, exist_ok=True)
    saida = LOG_DENO.open("a", encoding="utf-8")
    saida.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} {rotulo} =====\n")
    saida.flush()
    CTX["saida"], CTX["log_inicio"] = saida, tamanho_do_log()
    procs: dict = {}
    CTX["procs"] = procs
    procs["sim"] = subprocess.Popen([sys.executable, str(AQUI / "simulador_play.py"), "--porta", str(PORTAS["sim"])], cwd=RAIZ,
                                    stdout=saida, stderr=saida)
    if not esperar(lambda: porta_aberta(PORTAS["sim"]), 30, 0.5):
        raise RuntimeError("o simulador não subiu")
    CTX["treino"] = TreinoFalso(PORTAS["treino"])
    env = ambiente_deno(sim("/_conta_servico"))
    rede_ = f"127.0.0.1,{B.PRINCIPAL_REF}.supabase.co"
    for nome, funcao in FUNCOES.items():
        procs[nome] = subprocess.Popen([str(DENO), "run", f"--allow-net={rede_}", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                        f"supabase-principal/functions/{funcao}/index.ts", str(PORTAS[nome])],
                                       cwd=RAIZ, env=env, stdout=saida, stderr=saida)
    print(f"   processos: {', '.join(f'{k} pid {v.pid}' for k, v in procs.items())} + o Treino falso (porta {PORTAS['treino']}) (log: {LOG_DENO})",
          flush=True)
    if not esperar(lambda: all(porta_aberta(PORTAS[n]) for n in FUNCOES), 240, 1.0):
        raise RuntimeError(f"o Deno local não subiu em 240 s (veja {LOG_DENO})")
    return procs


def descer() -> None:
    """Cada processo da rodada pelo pid (SIGTERM; 15 s depois, SIGKILL) e o Treino falso."""
    procs = CTX.get("procs") or {}
    for pr in procs.values():
        if pr.poll() is None:
            pr.terminate()
    for nome, pr in procs.items():
        try:
            pr.wait(timeout=15)
        except subprocess.TimeoutExpired:
            pr.kill()
            pr.wait(timeout=15)
        print(f"   {nome} (pid {pr.pid}) encerrado: {pr.returncode}", flush=True)
    CTX["procs"] = {}
    if CTX.get("treino"):
        CTX["treino"].fechar()
        CTX["treino"] = None
    if CTX.get("saida"):
        CTX["saida"].close()
        CTX["saida"] = None


# ───────────────────────── as chamadas ─────────────────────────

def frear() -> None:
    """A play-compras tem freio de 20 pedidos/min por pessoa: perto dele a rodada espera (o freio não é o que os casos provam)."""
    t = time.time()
    CTX["freio"] = [x for x in CTX["freio"] if x > t - 60]
    if len(CTX["freio"]) >= 15:
        espera = 61 - (t - CTX["freio"][0])
        print(f"   (o freio da play-compras: espera {espera:.0f} s)", flush=True)
        time.sleep(max(1.0, espera))
        CTX["freio"] = []
    CTX["freio"].append(time.time())


def cab_pessoa(conta: str) -> dict:
    return {"Authorization": f"Bearer {B.token(conta)}", "x-schema": S, "Origin": "http://localhost:8080"}


def compras(conta: str, corpo: dict) -> tuple[int, dict]:
    frear()
    st, r = rede("POST", f"http://127.0.0.1:{PORTAS['compras']}", corpo, cab_pessoa(conta))
    return st, (r if isinstance(r, dict) else {})


def registrar(conta: str, token: str, produto: str) -> tuple[int, dict]:
    return compras(conta, {"acao": "registrar", "token": token, "produto": produto})


def pag(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r = rede("POST", f"http://127.0.0.1:{PORTAS['pag']}", {"acao": acao, **(corpo or {})}, cab_pessoa(conta))
    return st, (r if isinstance(r, dict) else {})


def excluir(conta: str) -> tuple[int, dict]:
    st, r = rede("POST", f"http://127.0.0.1:{PORTAS['excluir']}", {"confirmacao": "EXCLUIR"}, cab_pessoa(conta))
    return st, (r if isinstance(r, dict) else {})


# ───────────────────────── o banco (staging) ─────────────────────────

def matricula(conta: str) -> dict:
    """A matrícula do app (a ativa; sem ativa, a mais recente) da conta de teste, no staging (o id fica só na memória)."""
    r = um(f"""select p.id::text as id, p.ativo, p.plano_aluno_id::text as plano_id, p.mensalidade_valor::text as valor,
                      p.mensalidade_pago_ate::text as pago_ate, p.app_teste_ate::text as teste_ate, p.app_encerrada_em::text as encerrada_em,
                      p.app_encerrada_motivo as encerrada_motivo, pa.codigo as plano
                 from {S}.pacientes p left join {S}.planos_aluno pa on pa.id = p.plano_aluno_id
                where p.user_id = (select id from auth.users where lower(email) = {lit(B.EMAIL[conta])})
                  and p.conta_id = {S}.conta_do_app() and p.deleted_at is null and p.nome not like '{MARCA_SINTETICA}%'
                order by p.ativo desc, p.created_at desc limit 1""")
    if not r:
        raise RuntimeError(f"a conta de teste {conta} sem matrícula do app no staging")
    return r


def assinatura(token: str) -> dict:
    return um(f"""select estado, renova, expira_em::text as expira_em, produto, (reconhecida_em is not null) as reconhecida, teste,
                         cancelada_por, adiar_ate::text as adiar_ate, (adiada_em is not null) as adiada
                    from {S}.play_assinaturas where token = {lit(token)}""") or {}


def linhas_do_token(token: str) -> int:
    return int((um(f"select count(*) as n from {S}.play_assinaturas where token = {lit(token)}") or {}).get("n") or 0)


def cobrancas_play(pid: str) -> list[dict]:
    return sql(f"""select status, valor::text as valor, (reembolsado_em is not null) as reembolsada, (cobre_de is null and cobre_ate is null) as sem_cobre,
                          meses_cobertos, tipo from {S}.cobrancas where paciente_id = {lit(pid)} and forma = 'google_play' order by created_at""")


def cobertura(pid: str) -> dt.datetime | None:
    return ts((um(f"select mensalidade_pago_ate::text as v from {S}.pacientes where id = {lit(pid)}") or {}).get("v"))


def sintetica(uid: str, rotulo: str) -> str:
    """Uma matrícula do app SINTÉTICA, encerrada pelo vínculo (o molde do e2e/w19/app_encerrado.py) — sai no desfazer pela marca."""
    return um(f"""insert into {S}.pacientes (conta_id, user_id, nome, ativo, app_encerrada_em, app_encerrada_motivo)
                  values ({S}.conta_do_app(), {lit(uid)}, '{MARCA_SINTETICA}Vínculo {rotulo}', false, now(), 'vinculou_profissional')
                  returning id::text as id""")["id"]


def play_aplicar_direto(pid: str, token: str, expira: str) -> dict:
    """A massa do vínculo: a assinatura viva gravada pela própria play_aplicar (o servidor; a compra existe no simulador)."""
    r = um(f"""select {S}.play_aplicar(jsonb_build_object('paciente_id', {lit(pid)}, 'token', {lit(token)}, 'produto', 'app_treino',
                      'plano_base', 'mensal', 'estado', 'ativa', 'renova', true, 'expira_em', {lit(expira)})) as r""")
    v = (r or {}).get("r")
    return json.loads(v) if isinstance(v, str) else (v or {})


# ───────────────────────── a foto e o desfazer ─────────────────────────

def foto() -> dict:
    est = {"inicio": agora().isoformat(), "uid_treino": B.uid("w7b-treino"), "matriculas": {}}
    for c in CONTAS:
        m = matricula(c)
        est["matriculas"][c] = {"id": m["id"], **{k: m[k] for k in CAMPOS_FOTO}}
    DIR.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est), encoding="utf-8")
    os.chmod(ESTADO_ARQ, 0o600)
    return est


def comandos_do_desfazer(est: dict) -> list[str]:
    ids = [m["id"] for m in est["matriculas"].values()]
    lista = ", ".join(f"{lit(i)}::uuid" for i in ids)
    sinteticas = f"select id from {S}.pacientes where user_id = {lit(est['uid_treino'])}::uuid and nome like '{MARCA_SINTETICA}%'"
    cmds = [
        f"delete from {S}.cobrancas where paciente_id in ({lista}) and forma = 'google_play' and play_pedido like 'GPA.%'",
        f"delete from {S}.cobrancas where paciente_id in ({sinteticas}) and forma = 'google_play'",
        f"delete from {S}.play_assinaturas where token like 'simtok-%'",
        f"delete from {S}.aluno_assinaturas where mp_preapproval_id like '{MARCA_AUTOMATICA}%'",
        f"delete from {S}.conta_eventos where tipo = 'plano' and por is null and (depois ->> 'paciente_id') in ({', '.join(lit(i) for i in ids)}) "
        f"and em >= {lit(est['inicio'])}::timestamptz",
        f"delete from {S}.pacientes where id in ({sinteticas})",
    ]
    for m in est["matriculas"].values():
        # o plano volta ao da foto (a troca da rodada); o ativo e o encerramento a rodada não toca (a conferência prova)
        cmds.append(f"update {S}.pacientes set plano_aluno_id = {lit(m['plano_id'])}::uuid, mensalidade_valor = {lit(m['valor'])}::numeric "
                    f"where id = {lit(m['id'])}::uuid and (plano_aluno_id is distinct from {lit(m['plano_id'])}::uuid "
                    f"or mensalidade_valor is distinct from {lit(m['valor'])}::numeric)")
        cmds.append(f"select {S}.mensalidade_recalcular({lit(m['id'])}::uuid)")
    return cmds


def sql_da_conferencia(est: dict) -> str:
    """SÓ LEITURA, só contagens: a marca da rodada (0) e as matrículas iguais à foto (N)."""
    ids = list(est["matriculas"].values())
    lista = ", ".join(f"{lit(m['id'])}::uuid" for m in ids)
    textos = ", ".join(lit(m["id"]) for m in ids)
    iguais = " or ".join(
        f"""(p.id = {lit(m['id'])}::uuid and p.ativo is not distinct from {str(bool(m['ativo'])).lower()}
             and p.plano_aluno_id is not distinct from {lit(m['plano_id'])}::uuid and p.mensalidade_valor is not distinct from {lit(m['valor'])}::numeric
             and p.mensalidade_pago_ate is not distinct from {lit(m['pago_ate'])}::timestamptz
             and p.app_teste_ate is not distinct from {lit(m['teste_ate'])}::timestamptz
             and p.app_encerrada_em is not distinct from {lit(m['encerrada_em'])}::timestamptz
             and p.app_encerrada_motivo is not distinct from {lit(m['encerrada_motivo'])})""" for m in ids)
    return f"""select
  (select count(*) from {S}.play_assinaturas where token like 'simtok-%') as play,
  (select count(*) from {S}.cobrancas where paciente_id in ({lista}) and forma = 'google_play') as cobrancas,
  (select count(*) from {S}.aluno_assinaturas where mp_preapproval_id like '{MARCA_AUTOMATICA}%') as automaticas,
  (select count(*) from {S}.pacientes where user_id = {lit(est['uid_treino'])}::uuid and nome like '{MARCA_SINTETICA}%') as sinteticas,
  (select count(*) from {S}.conta_eventos where tipo = 'plano' and por is null and (depois ->> 'paciente_id') in ({textos})
     and em >= {lit(est['inicio'])}::timestamptz) as eventos,
  (select count(*) from {S}.pacientes p where {iguais}) as iguais"""


def desfazer(est: dict) -> bool:
    """Desfaz a rodada (idempotente, numa transação) e confere pelo sqlro.py: 0 linha com a marca e as matrículas iguais à foto."""
    sql("begin;\n" + ";\n".join(comandos_do_desfazer(est)) + ";\ncommit;")
    r = (sql_so_leitura(sql_da_conferencia(est)) or [{}])[0]
    marca = {k: int(r.get(k, -1)) for k in ("play", "cobrancas", "automaticas", "sinteticas", "eventos")}
    iguais = int(r.get("iguais", -1))
    ok = all(v == 0 for v in marca.values()) and iguais == len(est["matriculas"])
    p.check(ok, f"a limpeza CONFERIDA (sqlro, só leitura): {', '.join(f'{k} {v}' for k, v in marca.items())} (todos 0) · "
                f"{iguais}/{len(est['matriculas'])} matrículas iguais à foto")
    if ok:
        ESTADO_ARQ.unlink(missing_ok=True)
    return ok


def sair_local() -> int:
    """O logout (scope=local) de cada sessão da rodada — nunca o global."""
    n = 0
    for conta, (_t0, tok) in list(B.B7._tokens.items()):
        st, _r, _h = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/logout?scope=local", {},
                            {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        n += 1 if st in (200, 204) else 0
        B.esquecer_token(conta)
    return n


# ───────────────────────── os casos ─────────────────────────

def caso_oidc() -> None:
    n0 = tamanho_do_log()
    st = empurrar(tipo="teste", oidc="valido")
    p.check(st == 204, f"oidc · válido (a notificação de teste do Console) → 204 ({st})")
    p.check("play_rtdn_teste" in log_desde(n0), "oidc · o log play_rtdn_teste")
    for modo in ("ausente", "forjado", "aud", "email", "nao_verificado", "expirado", "kid"):
        st = empurrar(tipo="teste", oidc=modo)
        p.check(st == 401, f"oidc · {modo} → 401 ({st})")


def caso_registrar(m: dict) -> str:
    c = comprar("app_treino", m["id"])
    st, r = registrar("w7b-treino", c["token"], "app_treino")
    a = assinatura(c["token"])
    i = info(c["token"])
    p.check(st == 200 and r.get("estado") == "ativa" and r.get("reconhecida") is True and r.get("adiada") is False,
            f"registrar · 200 ativa, reconhecida, sem adiar (a matrícula vencida) — {st} {r.get('estado') or r.get('erro')}")
    p.check(a.get("estado") == "ativa" and a.get("reconhecida") is True and a.get("teste") is False and i["reconhecida"] is True,
            "registrar · a play_assinaturas ativa e reconhecida; o acknowledge chegou ao Google (simulador)")
    p.check(perto(cobertura(m["id"]), ts(i["expira"])), "registrar · a cobertura = o fim da Play (expiryTime)")
    cob = cobrancas_play(m["id"])
    p.check(len(cob) == 1 and cob[0]["status"] == "paga" and float(cob[0]["valor"]) == 29.9 and cob[0]["sem_cobre"] is True
            and int(cob[0]["meses_cobertos"]) == 1 and cob[0]["tipo"] == "mensalidade",
            f"registrar · 1 cobrança google_play paga (R$ 29,90 = o preço da Play, 1 mês, sem cobre_*) — {len(cob)}")
    st2, _r2 = registrar("w7b-treino", c["token"], "app_treino")
    p.check(st2 == 200 and len(cobrancas_play(m["id"])) == 1 and linhas_do_token(c["token"]) == 1,
            f"registrar · 2× = 1 linha (1 assinatura, 1 cobrança) — {st2}")
    return c["token"]


def caso_outro_dono(m: dict) -> None:
    outro = um(f"""select p.id::text as id from {S}.pacientes p
                    where p.user_id = (select id from auth.users where lower(email) = {lit(B.EMAIL[OUTRO_DONO])})
                      and p.conta_id = {S}.conta_do_app() and p.deleted_at is null order by p.ativo desc, p.created_at desc limit 1""")
    c = comprar("app_treino", outro["id"])
    st, r = registrar("w7b-treino", c["token"], "app_treino")
    p.check(st == 409 and r.get("erro") == "compra_de_outra_conta" and linhas_do_token(c["token"]) == 0 and info(c["token"])["reconhecida"] is False,
            f"outro_dono · 409 compra_de_outra_conta, nada gravado nem reconhecido — {st} {r.get('erro')}")


def caso_token_falso() -> None:
    falso = f"simtok-falso-{secrets.token_urlsafe(16)}"
    CTX["tokens"].append(falso)
    st, r = registrar("w7b-treino", falso, "app_treino")
    p.check(st == 400 and r.get("erro") == "compra_invalida" and linhas_do_token(falso) == 0,
            f"token_falso · o Google não conhece → 400 compra_invalida — {st} {r.get('erro')}")
    st, r = registrar("w7b-treino", "curto", "app_treino")
    p.check(st == 400 and r.get("erro") == "pedido_invalido", f"token_falso · fora do formato → 400 pedido_invalido — {st} {r.get('erro')}")


def caso_estado(m: dict, token: str) -> None:
    st, r = compras("w7b-treino", {"acao": "estado"})
    texto = json.dumps(r)
    p.check(st == 200 and r.get("disponivel") is True and (r.get("matricula") or {}).get("id") == m["id"]
            and (r.get("assinatura") or {}).get("estado") == "ativa" and r.get("automatica_mp") is False,
            f"estado · disponivel, a matrícula do app, a assinatura ativa, sem automática do MP — {st}")
    p.check(token not in texto and "GPA." not in texto and sorted((r.get("assinatura") or {}).keys()) == ["estado", "expira_em", "produto", "renova"],
            "estado · sem token nem pedido (só estado, renova, expira_em e produto)")


def caso_teste_defer(m: dict) -> str:
    antes = ts(m["pago_ate"])
    p.check(antes is not None and antes > agora() + dt.timedelta(days=1), "teste_defer · a matrícula no teste grátis, coberta por mais de 1 dia")
    c = comprar("app_treino", m["id"])
    inicio = ts(info(c["token"])["expira"]) - dt.timedelta(days=30)
    st, r = registrar("w7b-removido", c["token"], "app_treino")
    a = assinatura(c["token"])
    i = info(c["token"])
    dias = math.ceil((antes - inicio).total_seconds() / 86400) if antes else None
    p.check(st == 200 and r.get("adiada") is True and a.get("adiada") is True and perto(ts(a.get("adiar_ate")), antes),
            f"teste_defer · a 1ª compra no teste: adiar_ate = o fim da cobertura de antes e adiada — {st} {r.get('erro') or ''}")
    p.check(dias is not None and dias >= 1 and i["adiada_dias"] == dias, f"teste_defer · o defer no Google = os dias que faltam ({i['adiada_dias']} = {dias})")
    p.check(perto(cobertura(m["id"]), ts(i["expira"])) and ts(i["expira"]) > antes + dt.timedelta(days=29),
            "teste_defer · a cobertura vai ao fim novo (o mês pago começa depois do teste)")
    return c["token"]


def caso_mp_vivo(m: dict) -> str:
    sql(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload)
            values ({lit(m['id'])}::uuid, {S}.conta_do_app(), '{MARCA_AUTOMATICA}{secrets.token_hex(6)}', 'authorized', 29.90,
                    now() + interval '20 days', jsonb_build_object('simulada', true, 'playw6', true))""")
    st0, r0 = compras("w7b-vence", {"acao": "estado"})
    p.check(st0 == 200 and r0.get("automatica_mp") is True, "mp_vivo · o estado mostra a automática do MP viva (a tela não oferece a Play)")
    c = comprar("app_treino", m["id"])
    st, r = registrar("w7b-vence", c["token"], "app_treino")
    vivas = int(um(f"""select count(*) as n from {S}.aluno_assinaturas where paciente_id = {lit(m['id'])}::uuid
                        and status in ('authorized', 'pending', 'paused')""")["n"])
    motivo = (um(f"""select payload ->> 'motivo_cancelamento' as m from {S}.aluno_assinaturas
                      where mp_preapproval_id like '{MARCA_AUTOMATICA}%' limit 1""") or {}).get("m")
    i = info(c["token"])
    p.check(st == 200 and vivas == 0 and motivo == "assinou_pela_google_play" and assinatura(c["token"]).get("estado") == "ativa",
            f"mp_vivo · a corrida: a automática do MP cancelada (assinou_pela_google_play) e a Play ativa — {st}, vivas {vivas}")
    p.check(r.get("adiada") is True and i["adiada_dias"] >= 1, f"mp_vivo · o defer guarda o que o MP pagou ({i['adiada_dias']} dias)")
    return c["token"]


def caso_rtdn(m: dict, token: str) -> None:
    pid = m["id"]
    mudar(token, "renovar")
    st = empurrar(tipo="assinatura", notificacao=2, token=token, repetir_id="playw6-renovado")
    i = info(token)
    p.check(st == 204 and len(cobrancas_play(pid)) == 2 and perto(cobertura(pid), ts(i["expira"])),
            f"rtdn · RENEWED → 204, +1 cobrança (2) e a cobertura anda — {st}")
    st = empurrar(tipo="assinatura", notificacao=2, token=token, repetir_id="playw6-renovado")
    p.check(st == 204 and len(cobrancas_play(pid)) == 2 and assinatura(token).get("estado") == "ativa", f"rtdn · o mesmo aviso de novo = nada novo — {st}")
    mudar(token, "carencia")
    st = empurrar(tipo="assinatura", notificacao=6, token=token)
    i = info(token)
    p.check(st == 204 and assinatura(token).get("estado") == "carencia" and perto(cobertura(pid), ts(i["expira"])) and len(cobrancas_play(pid)) == 2,
            f"rtdn · IN_GRACE_PERIOD → carência: cobre até o fim estendido, sem cobrança do pedido recusado — {st}")
    mudar(token, "suspender")
    st = empurrar(tipo="assinatura", notificacao=5, token=token)
    p.check(st == 204 and assinatura(token).get("estado") == "suspensa" and travada(cobertura(pid)), f"rtdn · ON_HOLD → suspensa, trava — {st}")
    mudar(token, "recuperar")
    st = empurrar(tipo="assinatura", notificacao=1, token=token)
    p.check(st == 204 and assinatura(token).get("estado") == "ativa" and len(cobrancas_play(pid)) == 3 and not travada(cobertura(pid)),
            f"rtdn · RECOVERED → ativa, +1 cobrança (3), cobre — {st}")
    mudar(token, "cancelar_usuario")
    st = empurrar(tipo="assinatura", notificacao=3, token=token)
    a = assinatura(token)
    i = info(token)
    p.check(st == 204 and a.get("estado") == "cancelada" and a.get("renova") is False and a.get("cancelada_por") == "google"
            and perto(cobertura(pid), ts(i["expira"])) and not travada(cobertura(pid)), f"rtdn · CANCELED → cancelada (google), vale até o fim — {st}")
    mudar(token, "expirar")
    st = empurrar(tipo="assinatura", notificacao=13, token=token)
    p.check(st == 204 and assinatura(token).get("estado") == "expirada" and travada(cobertura(pid)), f"rtdn · EXPIRED → expirada, trava — {st}")
    # REVOKED: uma compra nova (a anterior já venceu), o Google revoga
    t2 = comprar("app_treino", pid)["token"]
    st0, _ = registrar("w7b-treino", t2, "app_treino")
    mudar(t2, "devolver")
    st = empurrar(tipo="assinatura", notificacao=12, token=t2)
    p.check(st0 == 200 and st == 204 and assinatura(t2).get("estado") == "revogada" and travada(cobertura(pid)), f"rtdn · REVOKED → revogada, trava — {st}")
    # VOIDED: a devolução do pedido
    c3 = comprar("app_treino", pid)
    st0, _ = registrar("w7b-treino", c3["token"], "app_treino")
    pedido = mudar(c3["token"], "devolver")["pedido"]
    devolvidas0 = sum(1 for x in cobrancas_play(pid) if x["status"] == "cancelada" and x["reembolsada"])
    st = empurrar(tipo="devolucao", token=c3["token"], pedido=pedido)
    devolvidas = sum(1 for x in cobrancas_play(pid) if x["status"] == "cancelada" and x["reembolsada"])
    p.check(st0 == 200 and st == 204 and devolvidas == devolvidas0 + 1 and assinatura(c3["token"]).get("estado") == "revogada" and travada(cobertura(pid)),
            f"rtdn · VOIDED → a cobrança do pedido devolvida (cancelada + reembolsado_em) e a assinatura revogada, trava — {st}")


def caso_troca(m: dict) -> None:
    pid = m["id"]
    t1 = comprar("app_treino", pid)["token"]
    st0, _ = registrar("w7b-treino", t1, "app_treino")
    t2 = comprar("app_treino_alimentacao", pid, ligada=t1, modo="na_hora")["token"]
    st, _r = registrar("w7b-treino", t2, "app_treino_alimentacao")
    mm = matricula("w7b-treino")
    cob = cobrancas_play(pid)
    p.check(st0 == 200 and st == 200 and assinatura(t1).get("estado") == "substituida" and mm["plano"] == "app_treino_alimentacao"
            and float(mm["valor"]) == 49.9 and bool(cob) and float(cob[-1]["valor"]) == 49.9,
            f"troca · para o completo NA HORA: a anterior substituída, o plano já é o completo (R$ 49,90) e a cobrança do pedido novo — {st}")
    t3 = comprar("app_treino", pid, ligada=t2, modo="na_renovacao")["token"]
    n_cob = len(cobrancas_play(pid))
    st, _r = registrar("w7b-treino", t3, "app_treino")
    p.check(st == 200 and assinatura(t2).get("estado") == "substituida" and matricula("w7b-treino")["plano"] == "app_treino_alimentacao"
            and len(cobrancas_play(pid)) == n_cob,
            f"troca · para o Treino NA RENOVAÇÃO: o plano segue o completo até renovar, sem cobrança nova — {st}")
    mudar(t3, "renovar")
    st = empurrar(tipo="assinatura", notificacao=2, token=t3)
    mm = matricula("w7b-treino")
    p.check(st == 204 and mm["plano"] == "app_treino" and float(mm["valor"]) == 29.9 and len(cobrancas_play(pid)) == n_cob + 1,
            f"troca · no RENEWED o plano vira o Treino (R$ 29,90) e a renovação cobra — {st}")


def caso_vinculo(est: dict) -> None:
    uid = est["uid_treino"]
    a_id, b_id = sintetica(uid, "A"), sintetica(uid, "B")
    ca, cb = comprar("app_treino", a_id), comprar("app_treino", b_id)
    ra = play_aplicar_direto(a_id, ca["token"], info(ca["token"])["expira"])
    rb = play_aplicar_direto(b_id, cb["token"], info(cb["token"])["expira"])
    p.check(ra.get("ok") is True and rb.get("ok") is True and ra.get("matricula_ativa") is False,
            "vinculo · a massa: 2 matrículas do app encerradas pelo vínculo, cada uma com a Play viva (ativa, renova)")
    # A: o aviso RENEWED chega para a matrícula que saiu do app → a rede do play-rtdn cancela
    n0 = sim_n()
    st = empurrar(tipo="assinatura", notificacao=2, token=ca["token"])
    canc = cancelamentos_desde(n0)
    a = assinatura(ca["token"])
    p.check(st == 204 and len(canc) == 1 and canc[0].get("tipo") == CANCELAMENTO and a.get("estado") == "cancelada" and a.get("cancelada_por") == "vinculo",
            f"vinculo · o aviso da matrícula encerrada: o play-rtdn cancela ({CANCELAMENTO}), vale até o fim — {st}, {len(canc)} cancel")
    # B: a rede do aluno_status (pagamentos-aluno) — a mesma da vincular-aluno e da pos-login (cancelarAssinaturasDoAppEncerrado)
    n0 = sim_n()
    st, _r = pag("w7b-treino", "aluno_status")
    canc = cancelamentos_desde(n0)
    b = assinatura(cb["token"])
    p.check(st == 200 and len(canc) == 1 and canc[0].get("tipo") == CANCELAMENTO and b.get("estado") == "cancelada" and b.get("cancelada_por") == "vinculo"
            and b.get("renova") is False and info(cb["token"])["revogada"] is False,
            f"vinculo · o aluno_status cancela a da Play da matrícula encerrada ({CANCELAMENTO}; sem devolver) — {st}, {len(canc)} cancel")


def caso_exclusao(m: dict, token: str) -> None:
    treino = CTX["treino"]
    uid_antes = B.uid("w7b-removido")
    sim("/_cenario", {"cancelar_status": 503})
    treino.acoes.clear()
    st, r = excluir("w7b-removido")
    p.check(st == 502 and r.get("erro") == "play_nao_cancelada" and "excluir" not in treino.acoes and assinatura(token).get("estado") == "ativa",
            f"exclusao · o Google fora → 502 play_nao_cancelada; a assinatura segue; o Treino não foi chamado para excluir — {st} {r.get('erro')}")
    sim("/_cenario", {})
    treino.acoes.clear()
    n0 = sim_n()
    st, r = excluir("w7b-removido")
    canc = cancelamentos_desde(n0)
    a = assinatura(token)
    p.check(st == 502 and r.get("erro") == "treino_indisponivel" and len(canc) == 1 and canc[0].get("tipo") == CANCELAMENTO
            and a.get("estado") == "cancelada" and a.get("cancelada_por") == "exclusao" and treino.acoes == ["conferir", "excluir"],
            f"exclusao · a da Play cancelada ({CANCELAMENTO}) ANTES do Treino; o Treino falhou → 502 e parou — {st} {r.get('erro')}")
    mm = matricula("w7b-removido")
    p.check(B.uid("w7b-removido") == uid_antes and mm["id"] == m["id"] and mm["ativo"] is True,
            "exclusao · nada apagado: o login e a matrícula seguem")


def caso_site_409(m: dict, token: str) -> None:
    st, r = pag("w7b-vence", "aluno_mp_pix", {"paciente_id": m["id"]})
    p.check(st == 409 and r.get("erro") == "assinatura_play", f"site_409 · com a Play viva, o Pix do site → 409 assinatura_play — {st} {r.get('erro')}")
    st, r = pag("w7b-vence", "aluno_status")
    mat = next((x for x in (r.get("matriculas") or []) if x.get("paciente_id") == m["id"]), {})
    texto = json.dumps(r)
    p.check(st == 200 and (mat.get("play") or {}).get("estado") == "ativa" and token not in texto and "GPA." not in texto,
            f"site_409 · o aluno_status traz o play (ativa), sem token nem pedido — {st}")


def caso_log() -> None:
    texto = log_desde(CTX.get("log_inicio", 0))
    valores = [*CTX["tokens"], *CTX["pedidos"], *(B.EMAIL[c] for c in (*CONTAS, OUTRO_DONO)), SIM.CONTA_SERVICO_EMAIL]
    achados = sum(texto.count(v) for v in valores if v)
    p.check(achados == 0 and len(CTX["tokens"]) >= 10 and len(CTX["pedidos"]) >= 10,
            f"log · o log do Deno da rodada sem tokens, pedidos e e-mails de teste: {achados} ocorrência(s) "
            f"({len(CTX['tokens'])} tokens, {len(CTX['pedidos'])} pedidos e {len(CONTAS) + 2} e-mails procurados)")


def rodar_local(casos: set[str]) -> int:
    carregar_base()
    if ESTADO_ARQ.exists():
        raise SystemExit(f"há uma rodada anterior sem desfazer ({ESTADO_ARQ}): rode --limpar antes")
    est = foto()
    m = {c: dict(est["matriculas"][c]) for c in CONTAS}
    try:
        subir()
        sim("/_zerar")
        if "oidc" in casos:
            caso_oidc()
        tok = caso_registrar(m["w7b-treino"]) if casos & {"registrar", "estado", "rtdn", "troca"} else None
        if "outro_dono" in casos:
            caso_outro_dono(m["w7b-treino"])
        if "token_falso" in casos:
            caso_token_falso()
        if "estado" in casos and tok:
            caso_estado(m["w7b-treino"], tok)
        tok_teste = caso_teste_defer(m["w7b-removido"]) if casos & {"teste_defer", "exclusao"} else None
        tok_mp = caso_mp_vivo(m["w7b-vence"]) if casos & {"mp_vivo", "site_409"} else None
        if casos & {"rtdn", "troca"} and tok:
            caso_rtdn(m["w7b-treino"], tok)   # a troca precisa da matrícula sem a Play viva: o rtdn deixa a última revogada
        if "troca" in casos:
            caso_troca(m["w7b-treino"])
        if "vinculo" in casos:
            caso_vinculo(est)
        if "exclusao" in casos and tok_teste:
            caso_exclusao(m["w7b-removido"], tok_teste)
        if "site_409" in casos and tok_mp:
            caso_site_409(m["w7b-vence"], tok_mp)
    except Exception as e:  # noqa: BLE001 — a rodada cai, mas o desfazer roda; só o tipo do erro sai (nada de dado)
        p.check(False, f"a rodada parou: {type(e).__name__} (veja o log do Deno; o desfazer roda agora)")
    finally:
        descer()
        try:
            desfazer(est)
        except Exception as e:  # noqa: BLE001
            p.check(False, f"o desfazer falhou ({type(e).__name__}) — rode --limpar")
    if "log" in casos:
        caso_log()
    saidas = sair_local()
    print(f"\n   logins da rodada: {len(CTX['logins'])} ({', '.join(sorted(CTX['logins'])) or 'nenhum'}) · logout local: {saidas}", flush=True)
    return p.fim()


def rodar_seco() -> int:
    """Sem rede: os testes do simulador e o desfazer que só toca o staging (o que cada comando apaga tem a marca da rodada)."""
    carregar_placar()
    r = subprocess.run([sys.executable, "-m", "unittest", "-q", "test_simulador_play"], cwd=AQUI, capture_output=True, text=True,
                       env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    ultima = (r.stderr.strip().splitlines() or ["?"])[-1]
    p.check(r.returncode == 0, f"seco · os testes do simulador ({ultima})")
    est = {"inicio": "2026-10-16T00:00:00+00:00", "uid_treino": "00000000-0000-4000-8000-000000000009",
           "matriculas": {c: {"id": f"00000000-0000-4000-8000-00000000000{n}", "ativo": True, "plano_id": None, "valor": "29.90", "pago_ate": None,
                              "teste_ate": None, "encerrada_em": None, "encerrada_motivo": None} for n, c in enumerate(CONTAS, 1)}}
    cmds = comandos_do_desfazer(est)
    p.check(all(f" {S}." in c for c in cmds) and not any(" public." in c for c in cmds), f"seco · o desfazer só toca o staging ({len(cmds)} comandos)")
    apagar = [c for c in cmds if c.startswith("delete")]
    p.check(all(("simtok-" in c) or (MARCA_AUTOMATICA in c) or (MARCA_SINTETICA in c) or ("google_play" in c and "GPA." in c)
                or ("conta_eventos" in c and "em >=" in c) for c in apagar), f"seco · cada delete do desfazer leva a marca da rodada ({len(apagar)})")
    conf = sql_da_conferencia(est).lower()
    p.check(not any(w in conf for w in ("insert ", "update ", "delete ", "begin", "commit")), "seco · a conferência é só leitura")
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seco", action="store_true")
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--casos", default="")
    a = ap.parse_args()
    if a.seco:
        return rodar_seco()
    if a.limpar:
        carregar_base()
        if not ESTADO_ARQ.exists():
            print("nada a desfazer (sem o arquivo de estado da rodada)")
            return 0
        ok = desfazer(json.loads(ESTADO_ARQ.read_text(encoding="utf-8")))
        p.fim()
        return 0 if ok else 1
    if a.local:
        casos = {x.strip() for x in a.casos.split(",") if x.strip()} or set(CASOS)
        desconhecidos = casos - set(CASOS)
        if desconhecidos:
            raise SystemExit(f"casos desconhecidos: {sorted(desconhecidos)}")
        return rodar_local(casos)
    ap.error("escolha --seco, --local ou --limpar (a etapa 1 é só local)")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
