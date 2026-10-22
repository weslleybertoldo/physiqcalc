#!/usr/bin/env python3
"""Physiq play-W6 — E2E de SERVIDOR da assinatura da Google Play, LOCAL (o molde do e2e/mpc/api.py --local): a play-compras, a
play-conferir, a pagamentos-aluno e a excluir-minha-conta no Deno LOCAL (e2e/w1/servir_local.ts) contra o banco do STAGING (x-schema staging —
outro schema nunca; a migration da play-W6 já no staging — a versão de 16/10: a §8, a rotina do pg_cron, só entra na F4, e esta prova não
precisa dela: a play-conferir é chamada aqui direto, como o pg_net faria) e o SIMULADOR da Play (e2e/playw6/simulador_play.py: a API — o GET,
o acknowledge, o cancel, o defer, o revoke e a Voided Purchases API — e o OAuth da conta de serviço FALSA). O Deno só alcança 127.0.0.1 e o
Supabase (--allow-net): o Google e o Mercado Pago de verdade nem são alcançáveis.
22/10/2026: o aviso do Google pelo Pub/Sub (o RTDN, a play-rtdn com o OIDC) saiu — sem faturamento no Google Cloud não há Pub/Sub —; no
lugar, a play-conferir (de hora em hora pelo pg_cron, com o segredo S11): os casos dela tomam o lugar dos casos do aviso.

Contas de TESTE (staging): w7b-treino (vencida: as compras, a conferência, a troca e o vínculo), w7b-removido (no teste grátis: o defer; e a
exclusão), w7b-vence (coberta pelo mês do MP: a corrida com a automática e o 409 do site); a matrícula do w7b-novo só como "outro dono"
(sem login). Casos (--local, na ordem):
  conferir_porta  a porta da play-conferir (verify_jwt false): sem o segredo e com o errado → o MESMO 401 segredo_invalido; GET → 405;
               schema fora → 400 schema_invalido; limite 0 → 400 limite_invalido
  janela       a 1ª rodada lê a Voided Purchases API com type=1 e a janela de 24 h (sem o marcador) e grava o marcador app_config
               play_conferir; a seguinte começa no marcador menos 10 min
  registrar    a compra conferida no Google, gravada (ativa; a cobertura = o fim da Play; 1 cobrança google_play paga) e reconhecida; 2× = 1 linha
  outro_dono   a compra de OUTRA matrícula → 409 compra_de_outra_conta (nada gravado nem reconhecido)
  token_falso  o token que o Google não conhece → 400 compra_invalida; fora do formato → 400 pedido_invalido
  estado       disponivel, a matrícula, a assinatura (só estado, renova, expira_em e produto: sem token nem pedido)
  teste_defer  no teste grátis: a 1ª compra é adiada pelos dias que faltam (≥ 1 dia) e a cobertura vai ao fim novo — com o GET de depois do
               defer CAINDO (a marca já gravada) e a conferência de hora em hora que roda em seguida SEM adiar de novo (a revisão, 🟡1)
  mp_vivo      com a automática do MP viva (a corrida; a automática SIMULADA "sim-playw6-…", que só existe no banco): a do MP cancelada, a
               Play segue, adiada pelo que o MP pagou
  conferir     cada mudança no Google entra na rodada seguinte da play-conferir: renovada → +1 cobrança e a cobertura anda · a rodada de
               novo = nada (idempotente) · carência → cobre · suspensa → trava · pausada → trava · recuperada · cancelada → vale até o fim ·
               expirada → trava · a devolução SEM cortar o acesso (Voided) → só a cobrança daquele pedido · a devolução que corta (Voided) →
               revogada + a cobrança devolvida, trava
  troca        para o completo NA HORA (a anterior substituída, o plano na hora) · para o Treino NA RENOVAÇÃO (o plano só na renovação, que a
               conferência traz; o GET do token novo com as 2 linhas da doc, a nova primeiro — a revisão, 🟡2)
  ressincroniza a viva vencida no banco (a conferência que ainda não passou): o estado lê o Google e grava — a renovação (+1 cobrança, sem
               reconhecer nem adiar) e a cancelada vencida (fora do aluno_status; gravada expirada) (a revisão, 🟡3)
  devolucao_velha  a devolvida (Voided) de um token que o Google esqueceu (GET 410): a cobrança devolvida pelo orderId (a revisão, ⚪13)
  sobra        o limite por rodada: com limite 1, 1 conferida e o resto contado como sobra; a rodada seguinte confere OUTRA (a que está há mais
               tempo sem conferir)
  vinculo      2 matrículas do app SINTÉTICAS ("PLAYW6 Vínculo A/B" do w7b-treino, encerradas pelo vínculo — o molde do e2e/w19) com a Play
               viva: a A renova → a rede da conferência cancela; depois a B: o aluno_status (a rede da pagamentos-aluno) cancela — as 2
               com DEVELOPER_REQUESTED_STOP_PAYMENTS (vale até o fim, sem devolver)
  exclusao     o Google fora → 502 play_nao_cancelada e nada apagado (o Treino nem é chamado para excluir); o Google ok → a da Play cancelada
               ANTES e o Treino (FALSO, local: o "excluir" falha) → 502 treino_indisponivel com play_cancelada (a revisão, ⚪14) — nada
               apagado no principal nem no login
  site_409     com a Play viva, o Pix do site/APK antigo → 409 assinatura_play; o aluno_status traz o play (sem o token)
  mp_409       o registrar recusado (outra Play viva → 409) NÃO cancela a automática do MP (a revisão, ⚪12)
  sem_credencial  um 5º Deno, só da play-conferir e SEM o PLAY_SERVICE_ACCOUNT: 200 pulou play_sem_credencial + o log; nada vai ao Google
  log          o log do Deno da rodada sem os valores de teste (os tokens de compra, os pedidos, os e-mails, os segredos da rodada): 0 ocorrência
A FOTO (antes de gravar, em ~/projetos/physiqcalc-scratch/hml/playw6/local/api-estado.json, 600): as matrículas das 3 contas e o marcador
app_config play_conferir (que a play-conferir da rodada grava). No fim (ou no --limpar): saem as assinaturas da Play da rodada (token
"simtok-"), as cobranças google_play delas, a automática simulada ("sim-playw6-"), as matrículas sintéticas ("PLAYW6 ") e os eventos de plano
da rodada; o plano volta ao da foto e a cobertura é recalculada; o marcador volta ao da foto (sem ele antes: sai); a conferência (SQL SÓ
LEITURA pelo ~/projetos/physiqcalc-scratch/hml/sqlro.py, só contagens) pede 0 linha com a marca da rodada, as 3 matrículas iguais à foto e o
marcador igual ao da foto. Os logins (1 por conta usada) saem com logout local no fim. O segredo S11 da rodada nasce aqui (só na memória:
ao Deno vai só o sha256, na SEGREDO_PLAY_CONFERIR_ACEITOS).
Saída sem dado pessoal nem segredo: códigos, status, contagens e booleanos.
Precisa: ~/.pc-pat, as senhas das contas de TESTE, o ~/.deno/bin/deno e as portas 8791–8797 livres.
O vermelho das correções: PLAYW6_FUNCOES_DE=<as funções de antes, por git archive, fora do repo> roda os mesmos casos contra o código velho.
Uso: python3 e2e/playw6/api.py --seco
     python3 e2e/playw6/api.py --local [--casos registrar,conferir,...]
     python3 e2e/playw6/api.py --limpar
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
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
# só para provar o VERMELHO das correções: as funções de antes (git archive do commit velho, fora do repo); o padrão é a worktree
FUNCOES_DIR = Path(os.environ.get("PLAYW6_FUNCOES_DE") or (RAIZ / "supabase-principal" / "functions"))
PORTAS = {"compras": 8791, "conferir": 8792, "pag": 8793, "excluir": 8794, "treino": 8795, "sim": 8796, "conferir_sem": 8797}
FUNCOES = {"compras": "play-compras", "conferir": "play-conferir", "pag": "pagamentos-aluno", "excluir": "excluir-minha-conta"}
CONTAS = ("w7b-treino", "w7b-removido", "w7b-vence")
OUTRO_DONO = "w7b-novo"
MARCA_AUTOMATICA = "sim-playw6-"
MARCA_SINTETICA = "PLAYW6 "
CANCELAMENTO = "DEVELOPER_REQUESTED_STOP_PAYMENTS"
CASOS = ("conferir_porta", "janela", "registrar", "outro_dono", "token_falso", "estado", "teste_defer", "mp_vivo", "conferir", "troca",
         "ressincroniza", "devolucao_velha", "sobra", "vinculo", "exclusao", "site_409", "mp_409", "sem_credencial", "log")
ESTADOS_VIVOS = ("pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada")
CAMPOS_FOTO = ("ativo", "plano_id", "valor", "pago_ate", "teste_ate", "encerrada_em", "encerrada_motivo")

B = None   # a base da W7b (e2e/w07b/_base.py: as contas de TESTE, o login e o SQL) — carregada no --local/--limpar (o --seco não abre rede)
p = None
# o segredo S11 da rodada (só na memória; ao Deno vai só o sha256) e os errados que o caso da porta manda (a busca no log)
CTX: dict = {"tokens": [], "pedidos": [], "freio": [], "logins": [], "segredo": secrets.token_urlsafe(48), "segredos_errados": []}
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


def coberta_por(cob: dt.datetime | None, dias: float) -> bool:
    """A cobertura vai além de agora + `dias`?"""
    return cob is not None and cob > agora() + dt.timedelta(days=dias)


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


def conferir(limite: int | None = None, segredo: str | None = None, corpo: dict | None = None, porta: str = "conferir") -> tuple[int, dict]:
    """Uma rodada da play-conferir local — o que o pg_net faz de hora em hora —, com o segredo S11 desta rodada no x-espelho-segredo
    (segredo="" = sem o cabeçalho)."""
    c = corpo if corpo is not None else {"schema": S, **({"limite": limite} if limite else {})}
    cab = {} if segredo == "" else {"x-espelho-segredo": segredo or CTX["segredo"]}
    st, r = rede("POST", f"http://127.0.0.1:{PORTAS[porta]}", c, cab)
    return st, (r if isinstance(r, dict) else {})


def voided_desde(n0: int) -> list[dict]:
    """As idas à Voided Purchases API desde o pedido n0 do simulador (o type, a janela em segundos e quantas)."""
    return [x for x in sim_pedidos(n0) if x.get("acao") == "voided"]


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
        # o S11 da play-conferir: só o sha256 do segredo desta rodada (o molde do e2e/w2/api.py com o S10)
        "SEGREDO_PLAY_CONFERIR_ACEITOS": hashlib.sha256(CTX["segredo"].encode()).hexdigest(),
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
    CTX["env"] = env
    rede_ = f"127.0.0.1,{B.PRINCIPAL_REF}.supabase.co"
    for nome, funcao in FUNCOES.items():
        procs[nome] = subprocess.Popen([str(DENO), "run", f"--allow-net={rede_}", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                        str(FUNCOES_DIR / funcao / "index.ts"), str(PORTAS[nome])],
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

def marcador() -> str | None:
    """O marcador app_config play_conferir (o JSON em texto; None = sem a linha) — a play-conferir da rodada grava nele."""
    r = um(f"select valor::text as v from {S}.app_config where chave = 'play_conferir'")
    return r["v"] if r else None


def foto() -> dict:
    est = {"inicio": agora().isoformat(), "uid_treino": B.uid("w7b-treino"), "matriculas": {}, "marca": marcador()}
    for c in CONTAS:
        m = matricula(c)
        est["matriculas"][c] = {"id": m["id"], **{k: m[k] for k in CAMPOS_FOTO}}
    DIR.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est), encoding="utf-8")
    os.chmod(ESTADO_ARQ, 0o600)
    return est


def preparar(est: dict) -> None:
    """Os casos pedem as contas de TESTE em 3 estados, e o staging muda com o tempo (22/10/2026: o W8 renova por 30 dias o grátis do app
    da w7b-treino — e2e/w08/telas.py › garantir_gratis_do_app —; o grátis da w7b-removido acabou; o mês pago da w7b-vence anda para o
    fim). Só o teste grátis do app (app_teste_ate) é ajustado aqui, com a cobertura recalculada — e volta ao da FOTO no desfazer (a
    conferência confere o teste_ate e a cobertura):
      w7b-treino   VENCIDA (o grátis acabou há 2 dias): as compras sem adiar e as travas;
      w7b-removido no teste grátis (mais 5 dias): o defer da 1ª compra;
      w7b-vence    coberta por mais de 3 dias (o mês pago pelo MP; sem ele, o grátis por mais 10 dias): o defer da corrida com o MP."""
    ids = {c: est["matriculas"][c]["id"] for c in CONTAS}
    vence = matricula("w7b-vence")
    cmds = [f"update {S}.pacientes set app_teste_ate = now() - interval '2 days' where id = {lit(ids['w7b-treino'])}::uuid",
            f"update {S}.pacientes set app_teste_ate = now() + interval '5 days' where id = {lit(ids['w7b-removido'])}::uuid"]
    if not coberta_por(ts(vence["pago_ate"]), 3):
        cmds.append(f"update {S}.pacientes set app_teste_ate = now() + interval '10 days' where id = {lit(ids['w7b-vence'])}::uuid")
    cmds += [f"select {S}.mensalidade_recalcular({lit(i)}::uuid)" for i in ids.values()]
    sql("begin;\n" + ";\n".join(cmds) + ";\ncommit;")
    t_, r_, v_ = (matricula(c) for c in CONTAS)
    p.check(travada(ts(t_["pago_ate"])) and coberta_por(ts(r_["pago_ate"]), 1) and coberta_por(ts(v_["pago_ate"]), 3),
            "preparar · a w7b-treino vencida, a w7b-removido no teste grátis e a w7b-vence coberta (só o teste grátis; volta ao da foto)")


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
    if "marca" in est:
        # o marcador da Voided Purchases API volta ao da foto (sem ele antes: sai — a migration de 16/10 no staging não o cria)
        cmds.append(f"delete from {S}.app_config where chave = 'play_conferir'" if est["marca"] is None else
                    f"update {S}.app_config set valor = {lit(est['marca'])}::jsonb where chave = 'play_conferir'")
    for m in est["matriculas"].values():
        # o teste grátis volta ao da foto (o preparar mexe nele)
        cmds.append(f"update {S}.pacientes set app_teste_ate = {lit(m['teste_ate'])}::timestamptz "
                    f"where id = {lit(m['id'])}::uuid and app_teste_ate is distinct from {lit(m['teste_ate'])}::timestamptz")
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
    marca = ("(select count(*) from {S}.app_config where chave = 'play_conferir') = 0" if est.get("marca") is None else
             f"exists (select 1 from {S}.app_config where chave = 'play_conferir' and valor = {lit(est['marca'])}::jsonb)").replace("{S}", S)
    return f"""select
  ({marca}) as marca,
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
    marcador_igual = str(r.get("marca")).lower() in ("true", "t") or "marca" not in est
    ok = all(v == 0 for v in marca.values()) and iguais == len(est["matriculas"]) and marcador_igual
    p.check(ok, f"a limpeza CONFERIDA (sqlro, só leitura): {', '.join(f'{k} {v}' for k, v in marca.items())} (todos 0) · "
                f"{iguais}/{len(est['matriculas'])} matrículas iguais à foto · o marcador play_conferir igual à foto: {marcador_igual}")
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

def caso_conferir_porta() -> None:
    """A porta da play-conferir (verify_jwt false, o segredo S11): sem o segredo e com o errado → o MESMO 401, sem detalhe; só POST; o corpo
    conferido (o schema e o limite) — nada disto chega à rodada (nenhuma ida ao "Google")."""
    errado = secrets.token_urlsafe(48)
    CTX["segredos_errados"].append(errado)
    n0 = sim_n()
    st1, r1 = conferir(segredo="")
    st2, r2 = conferir(segredo=errado)
    p.check(st1 == 401 and st2 == 401 and r1 == r2 == {"ok": False, "erro": "segredo_invalido"},
            f"conferir_porta · sem o segredo e com o errado → o MESMO 401 segredo_invalido ({st1}, {st2})")
    st, _r = rede("GET", f"http://127.0.0.1:{PORTAS['conferir']}", None, {"x-espelho-segredo": CTX["segredo"]})
    p.check(st == 405, f"conferir_porta · GET → 405 ({st})")
    st, r = conferir(corpo={"schema": "outro"})
    p.check(st == 400 and r.get("erro") == "schema_invalido", f"conferir_porta · o schema fora → 400 schema_invalido ({st})")
    st, r = conferir(corpo={"schema": S, "limite": 0})
    p.check(st == 400 and r.get("erro") == "limite_invalido", f"conferir_porta · o limite 0 → 400 limite_invalido ({st})")
    p.check(sim_n() == n0, "conferir_porta · nenhuma ida ao Google (simulador) nos 5 pedidos recusados")


def caso_janela(est: dict) -> None:
    """A Voided Purchases API: a 1ª rodada lê com type=1 e, sem o marcador, as últimas 24 h; a janela inteira lida → o marcador app_config
    play_conferir = o fim dela; a rodada seguinte começa no marcador menos a folga (10 min)."""
    n0 = sim_n()
    t0 = time.time()
    st, r = conferir()
    v = voided_desde(n0)
    marca = (um(f"select valor ->> 'voided_ate' as v from {S}.app_config where chave = 'play_conferir'") or {}).get("v")
    antes = json.loads(est["marca"]).get("voided_ate") if est.get("marca") else None
    inicio_esperado = (ts(antes).timestamp() - 600) if antes else (t0 - 86400)
    p.check(st == 200 and r.get("ok") is True and len(v) == 1 and v[0].get("type") == "1" and abs(v[0].get("inicio_s", 0) - inicio_esperado) <= 120
            and r.get("devolvidas_completa") is True,
            f"janela · a 1ª rodada: a Voided com type=1 e a janela {'do marcador − 10 min' if antes else 'de 24 h (sem o marcador)'} — {st}")
    fim = v[0].get("fim_s", 0) if v else 0
    p.check(bool(marca) and abs(ts(marca).timestamp() - fim) <= 2, "janela · a janela inteira lida: o marcador play_conferir = o fim dela")
    n1 = sim_n()
    st2, _r2 = conferir()
    v2 = voided_desde(n1)
    p.check(st2 == 200 and len(v2) == 1 and bool(marca) and abs(v2[0].get("inicio_s", 0) - (ts(marca).timestamp() - 600)) <= 2,
            f"janela · a rodada seguinte começa no marcador menos a folga (10 min) — {st2}")


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
    """🟡1 da revisão: o GET logo DEPOIS do defer cai (o cenário falhas_get_pos_defer) e a conferência de hora em hora roda em seguida — a
    marca adiada_em já está no banco (gravada logo depois do 2xx, com o fim novo da resposta do defer): nada de 2º defer."""
    antes = ts(m["pago_ate"])
    p.check(antes is not None and antes > agora() + dt.timedelta(days=1), "teste_defer · a matrícula no teste grátis, coberta por mais de 1 dia")
    c = comprar("app_treino", m["id"])
    inicio = ts(info(c["token"])["expira"]) - dt.timedelta(days=30)
    sim("/_cenario", {"falhas_get_pos_defer": 1})
    try:
        st, r = registrar("w7b-removido", c["token"], "app_treino")
    finally:
        sim("/_cenario", {})
    a = assinatura(c["token"])
    i = info(c["token"])
    dias = math.ceil((antes - inicio).total_seconds() / 86400) if antes else None
    p.check(st == 200 and r.get("adiada") is True and a.get("adiada") is True and perto(ts(a.get("adiar_ate")), antes),
            f"teste_defer · a 1ª compra no teste, com o GET de depois do defer caindo: adiar_ate = o fim de antes e a marca gravada — {st} {r.get('adiada')}")
    p.check(dias is not None and dias >= 1 and i["adiada_dias"] == dias and i["adiamentos"] == 1,
            f"teste_defer · o defer no Google = os dias que faltam ({i['adiada_dias']} = {dias}; {i['adiamentos']} defer)")
    p.check(perto(cobertura(m["id"]), ts(i["expira"])) and ts(i["expira"]) > antes + dt.timedelta(days=29),
            "teste_defer · a cobertura vai ao fim novo (o da resposta do defer; o mês pago começa depois do teste)")
    st9, _r9 = conferir()
    i = info(c["token"])
    p.check(st9 == 200 and i["adiamentos"] == 1 and i["adiada_dias"] == dias and perto(cobertura(m["id"]), ts(i["expira"])),
            f"teste_defer · a conferência que roda depois NÃO adia de novo ({i['adiamentos']} defer, {i['adiada_dias']} dias) — {st9}")
    return c["token"]


def caso_mp_vivo(m: dict) -> str:
    # a automática simulada vence no fim do que já está coberto (o mês pago): a âncora dela (o dia do vencimento) não encurta a cobertura
    # (mensalidade_recalcular › financeiro_proxima_ancora) — com outro dia, o mês pago encolheria e não haveria o que adiar
    fim = ts(m["pago_ate"])
    vence = lit(fim.isoformat()) + "::timestamptz" if coberta_por(fim, 2) else "now() + interval '20 days'"
    sql(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload)
            values ({lit(m['id'])}::uuid, {S}.conta_do_app(), '{MARCA_AUTOMATICA}{secrets.token_hex(6)}', 'authorized', 29.90,
                    {vence}, jsonb_build_object('simulada', true, 'playw6', true))""")
    antes = cobertura(m["id"])
    p.check(coberta_por(antes, 1), "mp_vivo · (o ensaio) com a automática viva, a matrícula coberta por mais de 1 dia")
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


def devolvidas_de(pid: str) -> int:
    return sum(1 for x in cobrancas_play(pid) if x["status"] == "cancelada" and x["reembolsada"])


def caso_conferir(m: dict, token: str) -> None:
    """A conferência de hora em hora (no lugar do aviso do Google pelo Pub/Sub): cada mudança no Google entra na rodada seguinte da
    play-conferir — o GET de TODAS as vivas e as devolvidas da Voided Purchases API, pela mesma sincronia do registrar."""
    pid = m["id"]
    mudar(token, "renovar")
    st, r = conferir()
    i = info(token)
    p.check(st == 200 and r.get("ok") is True and len(cobrancas_play(pid)) == 2 and perto(cobertura(pid), ts(i["expira"]))
            and int(r.get("mudaram") or 0) >= 1, f"conferir · renovada → +1 cobrança (2) e a cobertura anda — {st}, mudaram {r.get('mudaram')}")
    st, r = conferir()
    p.check(st == 200 and len(cobrancas_play(pid)) == 2 and assinatura(token).get("estado") == "ativa" and r.get("mudaram") == 0
            and r.get("devolvidas_marcadas") == 0, f"conferir · a rodada de novo = nada novo (idempotente) — {st}, mudaram {r.get('mudaram')}")
    mudar(token, "carencia")
    st, _r = conferir()
    i = info(token)
    p.check(st == 200 and assinatura(token).get("estado") == "carencia" and perto(cobertura(pid), ts(i["expira"])) and len(cobrancas_play(pid)) == 2,
            f"conferir · carência: cobre até o fim estendido, sem cobrança do pedido recusado — {st}")
    mudar(token, "suspender")
    st, _r = conferir()
    p.check(st == 200 and assinatura(token).get("estado") == "suspensa" and travada(cobertura(pid)), f"conferir · suspensa → trava — {st}")
    st_e, r_e = compras("w7b-treino", {"acao": "estado"})
    p.check(st_e == 200 and (r_e.get("assinatura") or {}).get("estado") == "suspensa" and "ressincronizada" not in r_e,
            f"conferir · o estado com a suspensa (o fim no passado) NÃO vem ressincronizada (nada mudou no Google) — {st_e}")
    mudar(token, "pausar")
    st, _r = conferir()
    p.check(st == 200 and assinatura(token).get("estado") == "pausada" and travada(cobertura(pid)), f"conferir · pausada → trava — {st}")
    mudar(token, "recuperar")
    st, _r = conferir()
    p.check(st == 200 and assinatura(token).get("estado") == "ativa" and len(cobrancas_play(pid)) == 3 and not travada(cobertura(pid)),
            f"conferir · recuperada → ativa, +1 cobrança (3), cobre — {st}")
    mudar(token, "cancelar_usuario")
    st, _r = conferir()
    a = assinatura(token)
    i = info(token)
    p.check(st == 200 and a.get("estado") == "cancelada" and a.get("renova") is False and a.get("cancelada_por") == "google"
            and perto(cobertura(pid), ts(i["expira"])) and not travada(cobertura(pid)), f"conferir · cancelada (google) → vale até o fim — {st}")
    mudar(token, "expirar")
    st, _r = conferir()
    p.check(st == 200 and assinatura(token).get("estado") == "expirada" and travada(cobertura(pid)), f"conferir · expirada → trava — {st}")
    # a devolução de um pedido SEM cortar o acesso (a Voided Purchases API): só a cobrança daquele pedido; a assinatura segue ativa
    c2 = comprar("app_treino", pid)
    st0, _ = registrar("w7b-treino", c2["token"], "app_treino")
    mudar(c2["token"], "renovar")
    st1, _ = conferir()
    n_cob = len(cobrancas_play(pid))
    dev0 = devolvidas_de(pid)
    mudar(c2["token"], "devolver_sem_revogar")
    st, r = conferir()
    p.check(st0 == 200 and st1 == 200 and st == 200 and devolvidas_de(pid) == dev0 + 1 and len(cobrancas_play(pid)) == n_cob
            and assinatura(c2["token"]).get("estado") == "ativa" and not travada(cobertura(pid)) and int(r.get("devolvidas_marcadas") or 0) == 1,
            f"conferir · a devolução SEM cortar o acesso (Voided): só a cobrança do pedido devolvida; a assinatura segue ativa — {st}")
    mudar(c2["token"], "expirar")
    st, _r = conferir()
    # a devolução dela ainda está na folga da janela da Voided (10 min): a rodada relê a devolvida, o GET diz EXPIRED e ela sai como
    # revogada (a regra do aviso de devolução de antes: o GET não separa) — expirada ou revogada, as 2 sem acesso e fora das vivas
    e2 = assinatura(c2["token"]).get("estado")
    p.check(st == 200 and e2 in ("expirada", "revogada"), f"conferir · (o ensaio) a 2ª compra sai das vivas ({e2}) — {st}")
    # a devolução que CORTA o acesso (o Google revoga; a Voided Purchases API traz o pedido): revogada + a cobrança devolvida, trava
    c3 = comprar("app_treino", pid)
    st0, _ = registrar("w7b-treino", c3["token"], "app_treino")
    dev0 = devolvidas_de(pid)
    mudar(c3["token"], "devolver")
    st, r = conferir()
    p.check(st0 == 200 and st == 200 and devolvidas_de(pid) == dev0 + 1 and assinatura(c3["token"]).get("estado") == "revogada"
            and travada(cobertura(pid)) and int(r.get("devolvidas_aplicadas") or 0) >= 1,
            f"conferir · a devolução que corta o acesso (Voided): a cobrança devolvida e a assinatura revogada, trava — {st}")


def caso_troca(m: dict) -> str:
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
    sim("/_cenario", {"deferred_nova_primeiro": True})   # 🟡2: o GET do token novo com a linha do Treino (sem data) ANTES da atual
    try:
        st, _r = registrar("w7b-treino", t3, "app_treino")
    finally:
        sim("/_cenario", {})
    p.check(st == 200 and assinatura(t2).get("estado") == "substituida" and matricula("w7b-treino")["plano"] == "app_treino_alimentacao"
            and len(cobrancas_play(pid)) == n_cob,
            f"troca · para o Treino NA RENOVAÇÃO: o plano segue o completo até renovar, sem cobrança nova — {st}")
    mudar(t3, "renovar")
    st, _r = conferir()
    mm = matricula("w7b-treino")
    p.check(st == 200 and mm["plano"] == "app_treino" and float(mm["valor"]) == 29.9 and len(cobrancas_play(pid)) == n_cob + 1,
            f"troca · a renovação (a conferência a traz) vira o plano para o Treino (R$ 29,90) e cobra — {st}")
    return t3


def caso_ressincroniza(m: dict, token: str) -> None:
    """🟡3 da revisão: a viva que já venceu no banco (a conferência de hora em hora ainda não passou): o estado da play-compras lê o Google e
    grava, sem reconhecer nem adiar; e a cancelada vencida sai das leituras de "viva" do servidor (a regra da play_aplicar)."""
    pid = m["id"]
    # (a) a renovação que a conferência ainda não trouxe: o Google renovou; no banco, o fim gravado já passou (o tempo, simulado no fim gravado)
    mudar(token, "renovar")
    n_cob = len(cobrancas_play(pid))
    sql(f"update {S}.play_assinaturas set expira_em = now() - interval '1 minute' where token = {lit(token)}")
    p.check(travada(cobertura(pid)), "ressincroniza · (o ensaio) o fim gravado já passou: a cobertura travou")
    n0 = sim_n()
    st, r = compras("w7b-treino", {"acao": "estado"})
    i = info(token)
    a = assinatura(token)
    acoes = [x.get("acao") for x in sim_pedidos(n0)]
    p.check(st == 200 and (r.get("assinatura") or {}).get("estado") == "ativa" and perto(ts(a.get("expira_em")), ts(i["expira"]))
            and not travada(cobertura(pid)) and len(cobrancas_play(pid)) == n_cob + 1 and "get" in acoes
            and "acknowledge" not in acoes and "defer" not in acoes and r.get("ressincronizada") is True,
            f"ressincroniza · a renovação antes da conferência: o estado lê o Google e grava (o fim novo, +1 cobrança; sem reconhecer nem adiar) — {st}")
    # (b) a cancelada que venceu e a conferência ainda não passou: não é mais "viva" e o estado grava a expirada
    mudar(token, "cancelar_usuario")
    mudar(token, "expirar")
    sql(f"update {S}.play_assinaturas set estado = 'cancelada', renova = false, expira_em = now() - interval '1 minute' where token = {lit(token)}")
    st2, r2 = pag("w7b-treino", "aluno_status")
    mat = next((x for x in (r2.get("matriculas") or []) if x.get("paciente_id") == pid), {})
    p.check(st2 == 200 and mat.get("play") is None,
            f"ressincroniza · a cancelada vencida fora da leitura de \"viva\" do servidor (o aluno_status sem a Play) — {st2}")
    st, r = compras("w7b-treino", {"acao": "estado"})
    p.check(st == 200 and r.get("assinatura") is None and assinatura(token).get("estado") == "expirada",
            f"ressincroniza · o estado: sem assinatura viva e a vencida gravada expirada (o Google) — {st}")


def caso_devolucao_velha(m: dict) -> None:
    """⚪13 da revisão: a devolvida (a Voided Purchases API) de um token que o Google já esqueceu (o GET 410): a cobrança do pedido devolvida
    pelo orderId, sem o GET."""
    pid = m["id"]
    c4 = comprar("app_treino", pid)
    st0, _r = registrar("w7b-treino", c4["token"], "app_treino")
    antes = devolvidas_de(pid)
    mudar(c4["token"], "devolver")
    sim("/_cenario", {"get_status": 410})
    try:
        st, r = conferir()
    finally:
        sim("/_cenario", {})
    depois = devolvidas_de(pid)
    p.check(st0 == 200 and st == 200 and depois == antes + 1,
            f"devolucao_velha · o token que o Google esqueceu (GET 410): a cobrança do pedido devolvida pelo orderId — {st0} {st}, {antes}→{depois}")
    # (o ensaio) a rodada seguinte, com o Google de volta, assenta a compra (revogada) — a matrícula fica sem Play viva
    st, _r = conferir()
    p.check(st == 200 and assinatura(c4["token"]).get("estado") == "revogada", f"devolucao_velha · (o ensaio) a rodada seguinte assenta a revogada — {st}")


def vivas_da_rodada() -> list[dict]:
    return sql(f"""select token, atualizada_em::text as em from {S}.play_assinaturas where token like 'simtok-%'
                   and estado in ({', '.join(lit(e) for e in ESTADOS_VIVOS)}) order by atualizada_em desc""")


def caso_sobra() -> None:
    """O limite por rodada: com limite 1, só 1 vai ao Google e o resto conta como sobra; a rodada seguinte confere OUTRA — a que está há
    mais tempo sem conferir (o atualizada_em)."""
    st0, _r = conferir()   # assenta as devolvidas da janela e as vivas
    vivas = vivas_da_rodada()
    st1, r1 = conferir(limite=1)
    topo1 = (vivas_da_rodada() or [{}])[0].get("token")
    st2, r2 = conferir(limite=1)
    topo2 = (vivas_da_rodada() or [{}])[0].get("token")
    n = len(vivas)
    p.check(st0 == 200 and n >= 2 and st1 == 200 and r1.get("conferidas") == 1 and r1.get("sobraram") == n - 1
            and st2 == 200 and r2.get("conferidas") == 1 and r2.get("sobraram") == n - 1 and topo1 and topo2 and topo1 != topo2,
            f"sobra · limite 1 com {n} vivas: 1 conferida e {n - 1} de sobra; a rodada seguinte confere OUTRA (a mais antiga) — {st1} {st2}")


def caso_mp_409(m: dict) -> None:
    """⚪12 da revisão: o registrar que falha (outra assinatura da Play viva → 409) NÃO cancela a automática do MP."""
    sql(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload)
            values ({lit(m['id'])}::uuid, {S}.conta_do_app(), '{MARCA_AUTOMATICA}{secrets.token_hex(6)}', 'authorized', 29.90,
                    now() + interval '20 days', jsonb_build_object('simulada', true, 'playw6', true))""")
    c = comprar("app_treino", m["id"])
    st, r = registrar("w7b-vence", c["token"], "app_treino")
    vivas = int(um(f"""select count(*) as n from {S}.aluno_assinaturas where paciente_id = {lit(m['id'])}::uuid
                        and status in ('authorized', 'pending', 'paused')""")["n"])
    p.check(st == 409 and r.get("erro") == "assinatura_duplicada" and vivas == 1,
            f"mp_409 · o registrar recusado (outra Play viva → 409) não cancela a automática do MP — {st} {r.get('erro')}, vivas {vivas}")


def caso_vinculo(est: dict) -> None:
    uid = est["uid_treino"]
    # A: a matrícula encerrada pelo vínculo com a Play viva; ela renova → a rede da conferência cancela
    a_id = sintetica(uid, "A")
    ca = comprar("app_treino", a_id)
    ra = play_aplicar_direto(a_id, ca["token"], info(ca["token"])["expira"])
    p.check(ra.get("ok") is True and ra.get("matricula_ativa") is False,
            "vinculo · a massa A: a matrícula do app encerrada pelo vínculo, com a Play viva (ativa, renova)")
    mudar(ca["token"], "renovar")
    n0 = sim_n()
    st, r = conferir()
    canc = cancelamentos_desde(n0)
    a = assinatura(ca["token"])
    p.check(st == 200 and len(canc) == 1 and canc[0].get("tipo") == CANCELAMENTO and a.get("estado") == "cancelada" and a.get("cancelada_por") == "vinculo"
            and r.get("canceladas_rede") == 1,
            f"vinculo · a renovação da matrícula encerrada: a conferência cancela ({CANCELAMENTO}), vale até o fim — {st}, {len(canc)} cancel")
    # B (nasce DEPOIS da conferência — senão ela cancelaria as 2): a rede do aluno_status (pagamentos-aluno) — a mesma da vincular-aluno e
    # da pos-login (cancelarAssinaturasDoAppEncerrado)
    b_id = sintetica(uid, "B")
    cb = comprar("app_treino", b_id)
    rb = play_aplicar_direto(b_id, cb["token"], info(cb["token"])["expira"])
    n0 = sim_n()
    st, _r = pag("w7b-treino", "aluno_status")
    canc = cancelamentos_desde(n0)
    b = assinatura(cb["token"])
    p.check(rb.get("ok") is True and st == 200 and len(canc) == 1 and canc[0].get("tipo") == CANCELAMENTO and b.get("estado") == "cancelada"
            and b.get("cancelada_por") == "vinculo" and b.get("renova") is False and info(cb["token"])["revogada"] is False,
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
    p.check(r.get("play_cancelada") is True, f"exclusao · o 502 conta que a assinatura da Play já foi cancelada (play_cancelada: {r.get('play_cancelada')})")
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


def caso_sem_credencial() -> None:
    """Sem o PLAY_SERVICE_ACCOUNT, a play-conferir pula com o log play_sem_credencial — nada quebra e nada vai ao Google: um 5º Deno, só da
    play-conferir e sem o segredo da Play, de pé só durante este caso."""
    env = {k: v for k, v in (CTX.get("env") or {}).items() if k != "PLAY_SERVICE_ACCOUNT"}
    rede_ = f"127.0.0.1,{B.PRINCIPAL_REF}.supabase.co"
    pr = subprocess.Popen([str(DENO), "run", f"--allow-net={rede_}", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                           str(FUNCOES_DIR / "play-conferir" / "index.ts"), str(PORTAS["conferir_sem"])],
                          cwd=RAIZ, env=env, stdout=CTX["saida"], stderr=CTX["saida"])
    CTX["procs"]["conferir_sem"] = pr
    if not esperar(lambda: porta_aberta(PORTAS["conferir_sem"]), 240, 1.0):
        p.check(False, "sem_credencial · o 5º Deno não subiu em 240 s")
        return
    n_log, n_sim = tamanho_do_log(), sim_n()
    st, r = conferir(porta="conferir_sem")
    p.check(st == 200 and r == {"ok": True, "pulou": "play_sem_credencial"} and sim_n() == n_sim and "play_sem_credencial" in log_desde(n_log),
            f"sem_credencial · sem o PLAY_SERVICE_ACCOUNT: 200 pulou play_sem_credencial + o log; nada foi ao Google — {st}")


def caso_log() -> None:
    texto = log_desde(CTX.get("log_inicio", 0))
    valores = [*CTX["tokens"], *CTX["pedidos"], *(B.EMAIL[c] for c in (*CONTAS, OUTRO_DONO)), SIM.CONTA_SERVICO_EMAIL, CTX["segredo"],
               *CTX["segredos_errados"]]
    achados = sum(texto.count(v) for v in valores if v)
    p.check(achados == 0 and len(CTX["tokens"]) >= 10 and len(CTX["pedidos"]) >= 10,
            f"log · o log do Deno da rodada sem tokens, pedidos, e-mails de teste e os segredos da rodada: {achados} ocorrência(s) "
            f"({len(CTX['tokens'])} tokens, {len(CTX['pedidos'])} pedidos, {len(CONTAS) + 2} e-mails e {1 + len(CTX['segredos_errados'])} segredos procurados)")


def rodar_local(casos: set[str]) -> int:
    carregar_base()
    if ESTADO_ARQ.exists():
        raise SystemExit(f"há uma rodada anterior sem desfazer ({ESTADO_ARQ}): rode --limpar antes")
    est = foto()
    m = {c: dict(est["matriculas"][c]) for c in CONTAS}
    try:
        preparar(est)
        m = {c: matricula(c) for c in CONTAS}   # depois do preparar (o teste grátis e a cobertura de agora)
        subir()
        sim("/_zerar")
        if "conferir_porta" in casos:
            caso_conferir_porta()
        if "janela" in casos:
            caso_janela(est)   # a 1ª rodada da play-conferir da rodada (o marcador da foto decide a janela esperada)
        tok = caso_registrar(m["w7b-treino"]) if casos & {"registrar", "estado", "conferir", "troca", "ressincroniza", "devolucao_velha"} else None
        if "outro_dono" in casos:
            caso_outro_dono(m["w7b-treino"])
        if "token_falso" in casos:
            caso_token_falso()
        if "estado" in casos and tok:
            caso_estado(m["w7b-treino"], tok)
        tok_teste = caso_teste_defer(m["w7b-removido"]) if casos & {"teste_defer", "exclusao", "sobra"} else None
        tok_mp = caso_mp_vivo(m["w7b-vence"]) if casos & {"mp_vivo", "site_409", "mp_409", "sobra"} else None
        if casos & {"conferir", "troca", "ressincroniza", "devolucao_velha"} and tok:
            caso_conferir(m["w7b-treino"], tok)   # a troca precisa da matrícula sem a Play viva: a conferência deixa a última revogada
        tok_troca = caso_troca(m["w7b-treino"]) if casos & {"troca", "ressincroniza", "devolucao_velha"} else None
        if casos & {"ressincroniza", "devolucao_velha"} and tok_troca:
            caso_ressincroniza(m["w7b-treino"], tok_troca)   # a devolução velha precisa da matrícula sem a Play viva: a ressincronia expira a da troca
        if "devolucao_velha" in casos and tok_troca:
            caso_devolucao_velha(m["w7b-treino"])
        if "sobra" in casos:
            caso_sobra()   # as vivas do defer (w7b-removido) e da corrida com o MP (w7b-vence)
        if "vinculo" in casos:
            caso_vinculo(est)
        if "exclusao" in casos and tok_teste:
            caso_exclusao(m["w7b-removido"], tok_teste)
        if "site_409" in casos and tok_mp:
            caso_site_409(m["w7b-vence"], tok_mp)
        if "mp_409" in casos and tok_mp:
            caso_mp_409(m["w7b-vence"])
        if "sem_credencial" in casos:
            caso_sem_credencial()
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
    est = {"inicio": "2026-10-16T00:00:00+00:00", "uid_treino": "00000000-0000-4000-8000-000000000009", "marca": None,
           "matriculas": {c: {"id": f"00000000-0000-4000-8000-00000000000{n}", "ativo": True, "plano_id": None, "valor": "29.90", "pago_ate": None,
                              "teste_ate": None, "encerrada_em": None, "encerrada_motivo": None} for n, c in enumerate(CONTAS, 1)}}
    cmds = comandos_do_desfazer(est)
    p.check(all(f" {S}." in c for c in cmds) and not any(" public." in c for c in cmds), f"seco · o desfazer só toca o staging ({len(cmds)} comandos)")
    apagar = [c for c in cmds if c.startswith("delete")]
    p.check(all(("simtok-" in c) or (MARCA_AUTOMATICA in c) or (MARCA_SINTETICA in c) or ("google_play" in c and "GPA." in c)
                or ("conta_eventos" in c and "em >=" in c) or ("app_config" in c and "chave = 'play_conferir'" in c) for c in apagar),
            f"seco · cada delete do desfazer leva a marca da rodada (ou é o marcador play_conferir que não existia na foto) ({len(apagar)})")
    com_marca = comandos_do_desfazer({**est, "marca": '{"voided_ate": "2026-10-22T20:00:00.000Z"}'})
    p.check(any(c.startswith(f"update {S}.app_config set valor = ") for c in com_marca) and not any("app_config" in c and c.startswith("delete")
                                                                                                for c in com_marca),
            "seco · com o marcador na foto, o desfazer o devolve ao valor da foto (não apaga)")
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
