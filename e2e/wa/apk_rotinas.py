#!/usr/bin/env python3
"""Physiq W-A P3 — a prova dos lembretes NO APARELHO (spec §5.4, §6 "P3", §7; plano mestre §3 › P3; revisão C3): o APK de STAGING (debug,
montado no notebook — o do CI é o de PRODUÇÃO) num Android pelo adb — o Moto G7 (a Depuração por Wi-Fi) ou o emulador do notebook — e a
WebView pelo DevTools (a cópia gerada do capacitor.config.json com a depuração ligada SÓ no APK de teste; nada no git).
Conta de TESTE: w7b-sozinho (o aluno do app sem profissional — P9; nenhuma rotina de profissional). Passos:
  A0  o aparelho: fuso −03:00, RAM livre ≥ 300 MB, a Depuração por Wi-Fi (adb_wifi_enabled = 1 — NUNCA desligar), o Termux de pé (o pid) e o
      carteiro da ponte (/saude) — no G7; se o Physiq já estava instalado (com outra assinatura → PARA: não desinstalo app de ninguém)
  A1  a porta do aceite da conta de teste pelo SITE de staging (se pendente; a do APK abre já aceita) e a sessão de teste
  A2  instala o APK (adb install -r), a permissão de notificação e o "Alarmes e lembretes" (o alarme exato — a prova não espera o inexato)
  A3  abre o app, acha a WebView (adb forward + /json/list), põe a sessão e espera o Início
  A4  2 rotinas pela função (como o aluno): "Agora" (+4 min) e "Antes" (+5 min), todos os dias, lembrete → recarrega → o getPending do
      próprio app: 7 ids da faixa para cada uma (40000 + posição × 10 + dia) e o armazenamento do plugin (run-as, o que ele relê depois de
      reiniciar) com os mesmos 14
  A5  marcar ANTES: ✓ na "Antes" na página → o id de hoje dela sai (13); desmarcar → volta (14); marcar de novo → sai (13)
  A6  app FECHADO: HOME + am kill (o processo morre; os alarmes ficam) → na hora da "Agora", a notificação (dumpsys) → r_apk_notificacao (a
      bandeja aberta) → "Feito" (uiautomator) → o app abre e marca → r_apk_feito; no banco, a "Agora" feita hoje
  A7  a "Antes" (marcada antes) NÃO tocou no horário dela
  A8  --reiniciar (SÓ no emulador — o G7 é o carteiro da ponte): uma 3ª rotina "Depois de reiniciar" (+4 min), reinicia o aparelho SEM abrir o
      app → o armazenamento do plugin com os ids dela e, na hora, a notificação
  A9  Sair (o do app: GLOBAL nos 2 bancos — combinado com a LINUX 1): o getPending e o armazenamento sem nenhum id da faixa
  Fim (sempre): apaga as rotinas da rodada, desinstala o APK de teste (se não estava lá), tira o adb forward e — no G7 — põe o Termux de volta na
  frente (a tela preta) e confere de novo o Termux (o MESMO pid), o carteiro e a Depuração por Wi-Fi.
Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p3/apk-<alvo>/r_apk_notificacao.png e r_apk_feito.png. Saída: w-a/p3/apk_rotinas_<alvo>.txt.
Uso: python3 e2e/wa/apk_rotinas.py --alvo g7|emulador --serial <ip:porta | emulator-5554> --apk <app-debug.apk> [--adb-porta 5038]
     [--chave <adbkey>] [--reiniciar] [--site https://physiqcalc-staging.vercel.app] [--canal msedge] | --limpar
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
SP = ZoneInfo("America/Sao_Paulo")
PACOTE = "com.bertoldo.physiqcalc"
ADB = str(Path.home() / "android-sdk" / "platform-tools" / "adb")
CONTA = "w7b-sozinho"  # --conta troca (a w5p-aluna, se o w7b estiver numa trava do app — o Sair global combinado com a LINUX 1)
ESTADO = B.SCRATCH / "w-a" / "p3-apk-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p3"
URL_ALUNO_DIA = f"{B.H.API_P}/functions/v1/aluno-dia"
FAIXA = (40000, 40299)
PORTA_LOCAL = 9223


# ───────────────────────── o aparelho (adb) ─────────────────────────
class Aparelho:
    def __init__(self, porta: int, serial: str, chave: str | None) -> None:
        self.base = [ADB, "-P", str(porta), "-s", serial]
        self.env = dict(os.environ)
        if chave:
            self.env["ADB_VENDOR_KEYS"] = chave

    def adb(self, *args: str, timeout: int = 120, check: bool = True) -> str:
        r = subprocess.run(self.base + list(args), capture_output=True, text=True, timeout=timeout, env=self.env)
        if check and r.returncode != 0:
            raise RuntimeError(f"adb {args[0]}: {(r.stderr or r.stdout).strip()[:300]}")
        return r.stdout

    def sh(self, comando: str, timeout: int = 60, check: bool = True) -> str:
        """adb shell "<comando>": a string vai inteira para o shell DO APARELHO."""
        return self.adb("shell", comando, timeout=timeout, check=check)

    def print(self, caminho: Path) -> str:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(self.base + ["exec-out", "screencap", "-p"], capture_output=True, timeout=60, env=self.env)
        caminho.write_bytes(r.stdout)
        return str(caminho)

    def pid(self, pacote: str) -> str:
        return self.sh(f"pidof {pacote}", check=False).strip()

    def ids_da_bandeja(self) -> list[int]:
        """As notificações do Physiq na bandeja (dumpsys notification: pkg=… id=…)."""
        saida = self.sh("dumpsys notification", timeout=60)
        return sorted({int(m.group(1)) for m in re.finditer(rf"pkg={re.escape(PACOTE)}\s+user=\S+\s+id=(\d+)", saida)})

    def armazenamento(self) -> list[int]:
        """O que o plugin guardou (o que ele REAGENDA depois de reiniciar — LocalNotificationRestoreReceiver): os ids da faixa."""
        xml = self.sh(f"run-as {PACOTE} cat shared_prefs/NOTIFICATION_STORE.xml", check=False)
        return sorted(i for i in (int(x) for x in re.findall(r'<string name="(\d+)">', xml)) if FAIXA[0] <= i <= FAIXA[1])

    def tocar_no_texto(self, *textos: str) -> bool:
        """uiautomator: toca no 1º nó cujo texto (sem maiúsculas) é um dos `textos`."""
        self.sh("uiautomator dump /data/local/tmp/p3_ui.xml", timeout=90, check=False)
        xml = self.sh("cat /data/local/tmp/p3_ui.xml", check=False)
        alvos = {t.lower() for t in textos}
        for m in re.finditer(r'<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
            if m.group(1).strip().lower() in alvos:
                x = (int(m.group(2)) + int(m.group(4))) // 2
                y = (int(m.group(3)) + int(m.group(5))) // 2
                self.sh(f"input tap {x} {y}")
                return True
        return False


# ───────────────────────── a WebView (o DevTools pelo adb forward; um cliente CDP mínimo, sem dependência) ─────────────────────────
class CDP:
    def __init__(self, url: str) -> None:
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port), timeout=30)
        chave = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {chave}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            pedaco = self.s.recv(4096)
            if not pedaco:
                raise RuntimeError("CDP: a WebView fechou a conexão no aperto de mão")
            resp += pedaco
        if b" 101 " not in resp.split(b"\r\n", 1)[0]:
            raise RuntimeError("CDP: a WebView recusou o websocket")
        self.resto = resp.split(b"\r\n\r\n", 1)[1]
        self.n = 0

    def _enviar(self, texto: str) -> None:
        dados = texto.encode("utf-8")
        cab = bytearray([0x81])
        n = len(dados)
        if n < 126:
            cab.append(0x80 | n)
        elif n < 65536:
            cab.append(0x80 | 126)
            cab += struct.pack(">H", n)
        else:
            cab.append(0x80 | 127)
            cab += struct.pack(">Q", n)
        mascara = os.urandom(4)
        self.s.sendall(bytes(cab) + mascara + bytes(b ^ mascara[i % 4] for i, b in enumerate(dados)))

    def _exato(self, n: int) -> bytes:
        while len(self.resto) < n:
            pedaco = self.s.recv(65536)
            if not pedaco:
                raise RuntimeError("CDP: a WebView fechou a conexão")
            self.resto += pedaco
        d, self.resto = self.resto[:n], self.resto[n:]
        return d

    def _receber(self) -> str:
        partes = b""
        while True:
            b1, b2 = self._exato(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exato(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exato(8))[0]
            if b2 & 0x80:
                self._exato(4)
            dados = self._exato(n)
            op = b1 & 0x0F
            if op == 0x8:
                raise RuntimeError("CDP: a WebView fechou")
            if op in (0x9, 0xA):
                continue
            partes += dados
            if b1 & 0x80:
                return partes.decode("utf-8", "replace")

    def avaliar(self, expressao: str, timeout: float = 45) -> object:
        """Runtime.evaluate (espera a promessa; devolve o valor)."""
        self.n += 1
        meu = self.n
        try:
            self._enviar(json.dumps({"id": meu, "method": "Runtime.evaluate",
                                     "params": {"expression": expressao, "awaitPromise": True, "returnByValue": True}}))
        except OSError as ex:
            raise ConexaoCaiu(f"CDP: o pedido não saiu ({type(ex).__name__})") from ex
        fim = time.time() + timeout
        while time.time() < fim:
            m = json.loads(self._receber())
            if m.get("id") != meu:
                continue
            r = m.get("result") or {}
            if r.get("exceptionDetails"):
                raise RuntimeError("CDP: " + json.dumps(r["exceptionDetails"].get("text", "erro"))[:200])
            return (r.get("result") or {}).get("value")
        raise TimeoutError("CDP: sem resposta")

    def fechar(self) -> None:
        try:
            self.s.close()
        except OSError:
            pass


class ConexaoCaiu(OSError):
    """O websocket do DevTools já tinha caído quando o pedido ia sair: ele NÃO chegou à página (seguro mandar de novo)."""


class WebViewDoApp:
    """A conexão do DevTools que se refaz sozinha. Com o emulador carregado, o transporte do adb derruba o websocket com o app VIVO
    (diag_a9b: caiu ~30 s depois do Sair com o app em primeiro plano; rodada 4: BrokenPipe entre o A3 e o A4 — sem crash do app nem da
    WebView no dropbox). Caiu antes de o pedido sair → reconecta pelo processo do app e manda de novo; caiu esperando a resposta → reconecta
    para a PRÓXIMA chamada e repassa o erro (o pedido pode ter chegado: um clique não se repete)."""

    def __init__(self, ap: Aparelho, espera: float = 60) -> None:
        self.ap = ap
        self.w = conectar(ap, espera)
        self.reconexoes = 0  # vai para a saída (o A4): separa a demora do app da queda do DevTools

    def _refazer(self) -> None:
        self.reconexoes += 1
        self.w.fechar()
        self.w = conectar(self.ap, 60)

    def avaliar(self, expressao: str, timeout: float = 45) -> object:
        try:
            return self.w.avaliar(expressao, timeout)
        except ConexaoCaiu:
            self._refazer()
            return self.w.avaliar(expressao, timeout)
        except (OSError, RuntimeError) as ex:
            if isinstance(ex, OSError) or "fechou" in str(ex):
                self._refazer()
            raise

    def fechar(self) -> None:
        self.w.fechar()


def webview(ap: Aparelho, espera: float = 60) -> WebViewDoApp:
    """A página do app pelo DevTools da WebView, com a reconexão sozinha (WebViewDoApp)."""
    return WebViewDoApp(ap, espera)


def conectar(ap: Aparelho, espera: float = 60) -> CDP:
    """A página do app pelo DevTools da WebView (o socket webview_devtools_remote_<pid> do processo do app)."""
    fim = time.time() + espera
    while time.time() < fim:
        pid = ap.pid(PACOTE).split()
        if pid and f"webview_devtools_remote_{pid[0]}" in ap.sh("cat /proc/net/unix", check=False):
            ap.adb("forward", f"tcp:{PORTA_LOCAL}", f"localabstract:webview_devtools_remote_{pid[0]}")
            try:
                lista = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORTA_LOCAL}/json/list", timeout=15).read())
                pagina = next((x for x in lista if x.get("type") == "page" and str(x.get("url", "")).startswith("https://localhost")), None)
                if pagina:
                    w = CDP(pagina["webSocketDebuggerUrl"])
                    # o /json/list já mostra a URL do app enquanto o documento ainda é o about:blank do início (no emulador: o
                    # location.pathname deu "blank" e o localStorage dali, "Uncaught" no A3) → só devolve com a origem do app de fato
                    if esperar(lambda: w.avaliar("location.origin", timeout=10) == "https://localhost", max(1.0, fim - time.time()), 0.5):
                        return w
                    w.fechar()
            except (OSError, ValueError, RuntimeError):
                pass
        time.sleep(2)
    raise RuntimeError("a WebView do app não abriu o DevTools (o APK é o de teste, com a depuração ligada na cópia gerada?)")


def esperar(cond, timeout: float, passo: float = 1.0) -> bool:
    fim = time.time() + timeout
    while time.time() < fim:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001 — a página recarregando no meio
            pass
        time.sleep(passo)
    return False


def tem(w: WebViewDoApp, seletor: str) -> bool:
    return bool(w.avaliar(f"!!document.querySelector({json.dumps(seletor)})", timeout=15))


def clicar(w: WebViewDoApp, seletor: str) -> bool:
    return bool(w.avaliar(f"(() => {{ const e = document.querySelector({json.dumps(seletor)}); if (!e) return false; e.click(); return true; }})()", timeout=15))


def ir(w: WebViewDoApp, rota: str) -> None:
    w.avaliar(f"(location.assign('https://localhost{rota}'), true)", timeout=15)


PENDENTES_JS = ("(async () => { const r = await window.Capacitor.Plugins.LocalNotifications.getPending();"
                " return r.notifications.map((n) => ({ id: n.id, dia: (n.extra || {}).dia, rotina: (n.extra || {}).rotina_id })); })()")


def pendentes(w: WebViewDoApp) -> list[dict]:
    lista = w.avaliar(PENDENTES_JS) or []
    return sorted((x for x in lista if FAIXA[0] <= int(x["id"]) <= FAIXA[1]), key=lambda x: x["id"])


# ───────────────────────── o banco e a função ─────────────────────────
def uid(conta: str) -> str:
    return B.ler(f"select id::text as id from auth.users where lower(email) = {B.txt(B.CONTAS[conta])}")[0]["id"]


def rotinas(e: dict) -> list[dict]:
    return B.ler(f"""select r.id::text as id, r.nome, r.criada_em,
                            (select count(*) from {S}.rotinas_feitas f where f.rotina_id = r.id
                               and f.dia = (now() at time zone 'America/Sao_Paulo')::date) as feita_hoje
                       from {S}.rotinas r where r.dono_user_id = {B.txt(e['dono'])} and r.nome like {B.txt(e['marca'] + '%')} order by r.criada_em""")


def funcao(token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"}
    st, r, _h = B5.http("POST", URL_ALUNO_DIA, corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def hora_sp(minutos: int) -> str:
    return (dt.datetime.now(SP) + dt.timedelta(minutes=minutos)).strftime("%H:%M")


def esperar_ate(hora: str, folga_s: int) -> None:
    """Dorme até a hora (HH:MM de hoje em SP) + a folga."""
    agora = dt.datetime.now(SP)
    alvo = agora.replace(hour=int(hora[:2]), minute=int(hora[3:]), second=0, microsecond=0) + dt.timedelta(seconds=folga_s)
    if alvo > agora:
        time.sleep((alvo - agora).total_seconds())


def dia_da_semana_sp() -> int:
    return dt.datetime.now(SP).isoweekday()


def limpar(e: dict | None = None) -> dict:
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {})
    if e.get("dono") and e.get("marca"):
        B.escrever(f"delete from {S}.rotinas where dono_user_id = {B.txt(e['dono'])} and nome like {B.txt(e['marca'] + '%')}")
    ESTADO.write_text("{}", encoding="utf-8")
    return {k: int(v) for k, v in B.Massa().sobras().items()}


# ───────────────────────── o G7: o carteiro da ponte e o Termux ─────────────────────────
def carteiro() -> dict:
    """/saude do carteiro da ponte do Telegram (no G7) — só o que diz se ele está vivo; o token nunca sai daqui."""
    cfg = json.loads((Path.home() / ".claude" / "remoto-telegram" / "config.json").read_text(encoding="utf-8"))
    for url in str(cfg.get("carteiro_url", "")).split("|"):
        try:
            pedido = urllib.request.Request(url.rstrip("/") + "/saude", headers={"X-Carteiro": cfg["carteiro_token"]})
            d = json.loads(urllib.request.urlopen(pedido, timeout=10).read())
            return {"poll": d.get("poll"), "poll_erro": d.get("poll_erro"), "ultimo_poll_ok_ha_s": d.get("ultimo_poll_ok_ha_s")}
        except (OSError, ValueError, KeyError):
            continue
    return {"poll": None, "poll_erro": "sem resposta"}


def carteiro_ok(c: dict) -> bool:
    return c.get("poll") is True and not c.get("poll_erro") and isinstance(c.get("ultimo_poll_ok_ha_s"), (int, float)) and c["ultimo_poll_ok_ha_s"] < 120


# ───────────────────────── os passos ─────────────────────────
def a0(o, ap: Aparelho, alvo: str, e: dict) -> bool:
    fuso = ap.sh("date +%z").strip()
    livre = int((re.search(r"MemAvailable:\s+(\d+)", ap.sh("cat /proc/meminfo")) or [0, 0])[1])
    instalado = bool(ap.sh(f"pm path {PACOTE}", check=False).strip())
    e["instalado_antes"] = instalado
    ok = o.ok(fuso == "-0300", f"A0 o fuso do aparelho {fuso} (o horário da rotina é o de SP)")
    ok = o.ok(livre >= 300_000, f"A0 RAM livre {livre // 1024} MB (≥ 300)") and ok
    if alvo == "g7":
        wifi = ap.sh("settings get global adb_wifi_enabled").strip()
        e["termux_pid"] = ap.pid("com.termux")
        c = carteiro()
        ok = o.ok(wifi == "1", f"A0 a Depuração por Wi-Fi ligada ({wifi}) — fica ligada no fim") and ok
        ok = o.ok(bool(e["termux_pid"]), f"A0 o Termux de pé (pid {e['termux_pid'] or '—'})") and ok
        ok = o.ok(carteiro_ok(c), f"A0 o carteiro da ponte vivo {c}") and ok
    o.linha(f"   o Physiq já estava instalado: {instalado}")
    return ok


def a1_porta_do_aceite(o, R: dict, site: str, canal: str) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            t = B.Tela(nav, site, "p3", "apk-aceite", desktop=False)
            t.entrar(R["L"], CONTA, "/")
            t.caso.fechar_avisos()
            o.ok(t.esperar(lambda: t.tem("[data-aba-inicio]") or t.tem("[data-card-rotinas-hoje]"), 60),
                 f"A1 a conta de teste ({CONTA}) abre o app no site de staging sem a porta do aceite pendente")
            t.fim()
        finally:
            nav.close()


def a2_instalar(o, ap: Aparelho, apk: str) -> bool:
    try:
        ap.adb("install", "-r", apk, timeout=600)
    except RuntimeError as ex:
        return o.ok(False, f"A2 adb install: {ex} (INSTALL_FAILED_UPDATE_INCOMPATIBLE = há um Physiq de outra assinatura: PARO, não desinstalo)")
    ap.sh(f"pm grant {PACOTE} android.permission.POST_NOTIFICATIONS", check=False)
    ap.sh(f"appops set {PACOTE} SCHEDULE_EXACT_ALARM allow", check=False)
    return o.ok(bool(ap.sh(f"pm path {PACOTE}").strip()), "A2 o APK de teste instalado, com a notificação e o 'Alarmes e lembretes' liberados")


def abrir_app(ap: Aparelho) -> None:
    ap.sh(f"monkey -p {PACOTE} -c android.intent.category.LAUNCHER 1", check=False)


def a3_entrar(o, ap: Aparelho, sessao: dict) -> WebViewDoApp:
    abrir_app(ap)
    w = webview(ap)
    w.avaliar(f"""(() => {{ localStorage.setItem('physiq-principal-auth', {json.dumps(json.dumps(sessao))});
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true');
        localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        location.replace('https://localhost/'); return true; }})()""")
    o.ok(esperar(lambda: tem(w, "[data-aba-inicio]"), 90),
         f"A3 o app abriu no Início com a conta de teste {CONTA} (a sessão posta pela WebView) — senão: trava do app? rode com --conta w5p-aluna",
         parar=True)
    return w


def a4_criar_e_pendentes(o, ap: Aparelho, w: WebViewDoApp, R: dict) -> dict:
    e = R["e"]
    horas = {"Agora": hora_sp(4), "Antes": hora_sp(5)}
    for nome, hora in horas.items():
        st, r = funcao(R["L"].token(CONTA), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} {nome}", "tipo": "habito", "horario": hora,
                                                                         "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
        o.ok(st == 200 and r.get("ok") is True, f"A4 a rotina '{nome}' ({hora}) pela função, como o aluno: {st}")
    e["horas"] = horas
    ids = {x["nome"].replace(e["marca"] + " ", ""): x["id"] for x in rotinas(e)}
    e["ids"] = ids
    ir(w, "/perfil/rotinas")
    esperar(lambda: tem(w, f'[data-rotina-linha="{ids.get("Antes", "x")}"]'), 60)
    dow = dia_da_semana_sp()
    hoje_agora, hoje_antes = 40000 + dow, 40010 + dow
    # 90 s (eram 30): na rodada 5, com o emulador carregado, as 14 estavam lá logo depois dos 30 s (a mesma linha mostrou 7 + 7)
    t0 = time.time()
    ok = esperar(lambda: len(pendentes(w)) == 14, 90)
    demorou = round(time.time() - t0, 1)
    p = pendentes(w)
    por_rotina = {k: [x["id"] for x in p if x["rotina"] == v] for k, v in ids.items()}
    o.ok(ok and len(por_rotina.get("Agora", [])) == 7 and len(por_rotina.get("Antes", [])) == 7 and hoje_agora in por_rotina["Agora"]
         and hoje_antes in por_rotina["Antes"],
         f"A4 getPending: 7 avulsas de cada uma, na faixa ({por_rotina}; em {demorou} s, {w.reconexoes} reconexão(ões) do DevTools)")
    guardados = ap.armazenamento()
    o.ok(guardados == sorted(x["id"] for x in p), f"A4 o armazenamento do plugin (o que ele reagenda ao reiniciar) = o getPending ({len(guardados)} ids)")
    return {"hoje_agora": hoje_agora, "hoje_antes": hoje_antes}


def a5_marcar_antes(o, w: WebViewDoApp, R: dict, ids_hoje: dict) -> None:
    antes = R["e"]["ids"]["Antes"]
    alvo = f'[data-rotina-marcar="{antes}"]'
    sem = lambda: ids_hoje["hoje_antes"] not in [x["id"] for x in pendentes(w)]  # noqa: E731
    clicar(w, alvo)
    o.ok(esperar(sem, 30), f"A5 ✓ ANTES da hora na 'Antes' → o id de hoje dela ({ids_hoje['hoje_antes']}) sai do getPending")
    clicar(w, alvo)
    o.ok(esperar(lambda: not sem(), 30), "A5 desmarcar → volta")
    clicar(w, alvo)
    o.ok(esperar(sem, 30), "A5 marcar de novo → sai (fica marcada)")


def a6_app_fechado(o, ap: Aparelho, R: dict, ids_hoje: dict, pasta: Path) -> None:
    e = R["e"]
    ap.sh("input keyevent KEYCODE_HOME")
    time.sleep(2)

    def fechado() -> bool:
        # o `am kill` só mata o processo já em 2º plano (oom adj ≥ SERVICE_ADJ); logo depois do HOME a atividade ainda pode estar parando
        # (no emulador, 2 s depois do HOME o 1º `am kill` não matou; com o app no adj 700 matou) → de novo a cada volta até o processo sair
        if not ap.pid(PACOTE):
            return True
        ap.sh(f"am kill {PACOTE}", check=False)
        return not ap.pid(PACOTE)

    o.ok(esperar(fechado, 40, 2), "A6 o app FECHADO (HOME + am kill: o processo morreu; os alarmes ficam)")
    esperar_ate(e["horas"]["Agora"], 15)
    tocou = esperar(lambda: ids_hoje["hoje_agora"] in ap.ids_da_bandeja(), 120, 5)
    o.ok(tocou, f"A6 na hora da 'Agora' ({e['horas']['Agora']}), com o app fechado, a notificação {ids_hoje['hoje_agora']} está na bandeja")
    ap.sh("cmd statusbar expand-notifications", check=False)
    time.sleep(3)
    R["provas"].append(ap.print(pasta / "r_apk_notificacao.png"))
    feito = ap.tocar_no_texto("Feito")
    if not feito:
        feito = ap.tocar_no_texto("Hora da rotina")
        o.linha("   (o botão 'Feito' não apareceu na bandeja recolhida: toquei no corpo — o toque também marca)")
    o.ok(feito, "A6 toquei no 'Feito' da notificação")
    # o "Feito" abre o app A FRIO (o processo tinha morrido) na página e marca: o print espera a tela com o "… feita · Desfazer" (o toast
    # fica 8 s) e a lista — antes, o print saía assim que o banco marcava e pegava a página ainda no esqueleto
    tela = esperar_feito_na_tela(ap)
    R["provas"].append(ap.print(pasta / "r_apk_feito.png"))
    o.linha(f"   a tela do print r_apk_feito: {tela}")
    marcou = esperar(lambda: next((x["feita_hoje"] for x in rotinas(e) if x["id"] == e["ids"]["Agora"]), 0) == 1, 90, 1)
    o.ok(marcou, "A6 o app abriu e marcou: no banco, a 'Agora' feita hoje")


TOASTS_JS = "[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.innerText).join(' | ')"


def esperar_feito_na_tela(ap: Aparelho, espera: float = 45) -> dict:
    """Pelo DevTools da WebView (que nasce com o app): o toast "… feita · Desfazer" e, com ele na tela, a lista da página (até 6 s — o toast
    fica 8 s). Devolve o que viu (vai para a saída; o print sai logo depois)."""
    visto: dict = {"toast": False, "lista": False}
    w = None
    try:
        w = webview(ap, espera)
        visto["toast"] = esperar(lambda: "Desfazer" in str(w.avaliar(TOASTS_JS, timeout=10) or ""), espera, 0.3)
        if visto["toast"]:
            visto["lista"] = esperar(lambda: tem(w, '[data-pagina-rotinas="lista"]'), 6, 0.3)
    except Exception as ex:  # noqa: BLE001 — o print sai de qualquer jeito (e o banco decide o caso)
        visto["erro"] = f"{type(ex).__name__}: {str(ex)[:120]}"
    finally:
        if w:
            w.fechar()
    return visto


def a7_antes_nao_tocou(o, ap: Aparelho, R: dict, ids_hoje: dict) -> None:
    esperar_ate(R["e"]["horas"]["Antes"], 60)
    o.ok(ids_hoje["hoje_antes"] not in ap.ids_da_bandeja(), f"A7 a 'Antes' (marcada antes) NÃO tocou às {R['e']['horas']['Antes']}")


def a8_reiniciar(o, ap: Aparelho, w: WebViewDoApp, R: dict) -> None:
    e = R["e"]
    hora = hora_sp(5)  # +5 (não +4): a espera da 3ª agendada + o reboot do emulador (~2 min) + 40 s ainda acabam antes da hora
    st, r = funcao(R["L"].token(CONTA), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Depois de reiniciar", "tipo": "habito",
                                                                     "horario": hora, "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": True}})
    o.ok(st == 200, f"A8 a rotina 'Depois de reiniciar' ({hora}) pela função: {st}")
    ir(w, "/perfil/rotinas")
    dow = dia_da_semana_sp()
    pos = len(e["ids"])  # Agora 0, Antes 1 → a 3ª é a posição 2
    alvo = 40000 + pos * 10 + dow
    # a página recarrega e a reconciliação agenda a 3ª — esperar por ela (antes, 8 s fixos: no emulador a 3ª ainda não estava agendada
    # quando o armazenamento foi lido e o aparelho reiniciou → 12 → 12 ids e a notificação dela nunca tocou)
    agendou = esperar(lambda: alvo in [x["id"] for x in pendentes(w)], 60, 1)
    antes = ap.armazenamento()
    o.linha(f"   a 3ª agendada antes de reiniciar: {agendou} (o armazenamento com {len(antes)} ids)")
    w.fechar()
    ap.adb("reboot", check=False)
    time.sleep(10)
    ap.adb("wait-for-device", timeout=600)
    esperar(lambda: ap.sh("getprop sys.boot_completed", check=False).strip() == "1", 600, 5)
    time.sleep(40)
    depois = ap.armazenamento()
    o.ok(depois == antes and alvo in depois,
         f"A8 reiniciou SEM abrir o app: o armazenamento do plugin igual ({len(antes)} → {len(depois)} ids, com o {alvo} da 3ª: {alvo in depois})")
    esperar_ate(hora, 15)
    o.ok(esperar(lambda: alvo in ap.ids_da_bandeja(), 120, 5), f"A8 na hora, depois de reiniciar e sem abrir o app, a notificação {alvo} tocou")


def a9_sair(o, ap: Aparelho, R: dict) -> None:
    abrir_app(ap)
    w = webview(ap, 120)
    R["w"] = w
    ir(w, "/perfil")
    # depois de reiniciar, a 1ª abertura é lenta (no emulador, ~45 s no "Carregando…" até o Perfil — diag_a9b); antes, 60 s e o clique sem
    # conferir: sem o botão, o Sair não acontecia e o A9 falhava sem dizer por quê
    achou = esperar(lambda: tem(w, "[data-perfil-sair]"), 150)
    clicou = achou and clicar(w, "[data-perfil-sair]")
    confirmou = clicou and esperar(lambda: tem(w, "[data-perfil-sair-confirmar]"), 20) and clicar(w, "[data-perfil-sair-confirmar]")
    if confirmou:
        # o Sair do app é GLOBAL: a sessão de teste que o script abriu saiu junto (o logout local do fim daria 403)
        R["L"].sessoes.esquecer(R["L"].token(CONTA))
    visto: dict = {}

    def vazio() -> bool:
        visto["armazenamento"] = len(ap.armazenamento())
        try:
            visto["getPending"] = len(pendentes(R["w"]))
        except Exception:  # noqa: BLE001 — o emulador carregado pode derrubar a conexão do DevTools: de novo pelo processo do app
            R["w"].fechar()
            R["w"] = webview(ap, 60)
            visto["getPending"] = len(pendentes(R["w"]))
        return visto["getPending"] == 0 and visto["armazenamento"] == 0

    ok = bool(confirmou) and esperar(vazio, 60, 2)
    o.ok(ok, f"A9 Sair: o getPending e o armazenamento do plugin sem nenhum id da faixa 40000–40299 (o botão {achou}, "
             f"clicou {bool(clicou)}, confirmou {bool(confirmou)}; {visto})")


def fim(o, ap: Aparelho, alvo: str, R: dict) -> None:
    w = R.get("w")
    if w:
        w.fechar()
    ap.adb("forward", "--remove", f"tcp:{PORTA_LOCAL}", check=False)
    if not R["e"].get("instalado_antes"):
        ap.adb("uninstall", PACOTE, check=False)
    ap.sh("rm -f /data/local/tmp/p3_ui.xml", check=False)
    if alvo == "g7":
        ap.sh("am start -n com.termux/.app.TermuxActivity", check=False)
        time.sleep(3)
        wifi = ap.sh("settings get global adb_wifi_enabled", check=False).strip()
        o.ok(ap.pid("com.termux") == R["e"].get("termux_pid"), f"fim: o Termux com o MESMO pid ({ap.pid('com.termux')}) — nada dele parou")
        o.ok(carteiro_ok(carteiro()), "fim: o carteiro da ponte vivo")
        o.ok(wifi == "1", "fim: a Depuração por Wi-Fi continua LIGADA (nunca desligar)")


def main() -> int:
    global CONTA  # noqa: PLW0603 — a conta da rodada (os passos leem daqui)
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--alvo", choices=["g7", "emulador"])
    ap_.add_argument("--serial")
    ap_.add_argument("--apk")
    ap_.add_argument("--adb-porta", type=int, default=5038)
    ap_.add_argument("--chave", default="")
    ap_.add_argument("--reiniciar", action="store_true")
    ap_.add_argument("--site", default="https://physiqcalc-staging.vercel.app")
    ap_.add_argument("--canal", default="msedge")
    ap_.add_argument("--conta", default=CONTA)
    ap_.add_argument("--limpar", action="store_true")
    a = ap_.parse_args()
    B.usar_schema(S)
    CONTA = a.conta
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if not (a.alvo and a.serial and a.apk):
        ap_.error("--alvo, --serial e --apk (ou --limpar)")
    if a.reiniciar and a.alvo == "g7":
        raise SystemExit("--reiniciar é SÓ no emulador: reiniciar o G7 derruba o carteiro da ponte (e a Depuração por Wi-Fi pode não voltar)")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior ({ESTADO}): rode --limpar antes")
    o = C.Saida(f"apk_rotinas_{a.alvo}")
    B.exigir_saude("a prova no aparelho")
    pasta = B.pasta_prints("p3") / f"apk-{a.alvo}"
    ap = Aparelho(a.adb_porta, a.serial, a.chave or None)
    R: dict = {"L": B.Logins(), "provas": [], "e": {"marca": f"WA E2E P3 APK {time.strftime('%H%M%S')}", "dono": uid(CONTA)}}
    vivas = B.ler(f"select count(*) as n from {S}.rotinas where dono_user_id = {B.txt(R['e']['dono'])} and arquivada_em is null")[0]["n"]
    if vivas:
        raise SystemExit(f"a conta {CONTA} tem {vivas} rotina(s) viva(s) no staging: os ids da prova contam com 0 — conferir quem criou (nada foi feito)")
    ESTADO.write_text(json.dumps(R["e"]), encoding="utf-8")
    try:
        if not a0(o, ap, a.alvo, R["e"]):
            o.linha("PAREI no A0: o aparelho não está pronto (nada foi instalado)")
        else:
            ESTADO.write_text(json.dumps(R["e"]), encoding="utf-8")
            a1_porta_do_aceite(o, R, a.site, a.canal)
            if a2_instalar(o, ap, a.apk):
                w = a3_entrar(o, ap, R["L"].sessao(CONTA))
                R["w"] = w
                ids_hoje = a4_criar_e_pendentes(o, ap, w, R)
                a5_marcar_antes(o, w, R, ids_hoje)
                w.fechar()
                R["w"] = None
                a6_app_fechado(o, ap, R, ids_hoje, pasta)
                a7_antes_nao_tocou(o, ap, R, ids_hoje)
                if a.reiniciar:
                    w = webview(ap)
                    a8_reiniciar(o, ap, w, R)
                a9_sair(o, ap, R)
    except Exception as ex:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(ex).__name__}: {str(ex)[:300]}")
    finally:
        try:
            fim(o, ap, a.alvo, R)
        finally:
            R["L"].fechar(o)
            sobras = limpar(R["e"])
            o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da W-A {sobras}")
    o.linha(f"\nprints: {R['provas']}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
