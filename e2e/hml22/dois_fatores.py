#!/usr/bin/env python3
"""Physiq hml-22 (H-22) — E2E do 2FA do master (TOTP do Supabase Auth + aal2), no STAGING, com um fator DE VERDADE na conta de TESTE
`w27-master` (decisão do dono, 14/10/2026: OK para cadastrar um fator TOTP numa conta de teste do staging e apagar no fim). O Auth é um
só para o staging e a produção: tudo aqui mira SÓ o uid do w27-master (conferido pelo e-mail antes de qualquer escrita).

Base: a da W27 (e2e/w27/_base.py: o master de teste = só o perfil master em staging.profiles, nunca o claim global — hml-02/H-04; o
login por senha "como servidor", a sessão injetada no navegador → sai aal1; o SQL e o admin pela Management API) + a ponte Android de
mentira da H2 (o C6, como o hml-08). O código do app autenticador sai do RFC 6238 em stdlib (HMAC-SHA1, 30 s, 6 dígitos); o segredo é
lido da tela e fica SÓ na memória (sem trace, sem vídeo, nunca impresso nem gravado); os prints borram o QR e o código em texto.

Casos (contrato hml-22 §4 — rodam em sequência, numa invocação só; o C3–C7 dependem do fator do C2):
  C1  sem fator = hoje: /master abre sem código; a master-contas 200; a troca do Treino 200 (print)
  C2  ativar: Master › Configurações › "Ativar" → QR + código em texto (print borrado); o id do fator vai ao Estado ANTES de conferir;
      os 6 números → "Ligada" (print); SQL: 1 fator verificado da conta
  C3  pede o código: login novo (aal1) → /master e /painel mostram "Digite o código do app autenticador" (print); com esse token: a
      master-contas 403 precisa_2fa, a RPC master_visao_geral → so_master, o REST profiles do staging → só a própria linha, a troca 403
      precisa_2fa
  C4  código errado → "Código errado…" e o token segue aal1 (print)
  C5  código certo (janela nova) → /master abre (print); o token do navegador é aal2 → a master-contas 200, a RPC ok, o REST vê as
      linhas de teste, a troca do Treino 200
  C6  app (o JS do `npm run build:apk` servido local + a ponte Android): o w27-master com fator → "Conta master: use o site", sem a
      tela do código (print). Só com --base-app, numa origem que as funções aceitam (o dev local: http://localhost:8080 ou :5173 —
      login-regras.ts › origemPermitida; noutra porta o CORS barra a função conta e o app não sabe que a conta é master).
  C7  desfazer: DELETE /auth/v1/factors/{id} com o token aal2 → SQL 0 fator → login novo → /master sem código (print)
--casos: o C1/C2 roda sempre (o fator do C2 serve a todos os outros; só o C1 sozinho fica sem ele); o C3–C5 só quando um deles é
pedido (o mesmo login; até o maior pedido) ou com o C7 (que desfaz com o token aal2 do C5); o C6 e o C7 só quando pedidos.

Limpeza GARANTIDA (o --limpar): no finally de toda rodada, no SIGTERM/SIGINT (corte_vira_saida) e à mão. Idempotente: confere que o
uid é o da conta de teste (senão aborta); lista e apaga TODOS os fatores dela pelo admin (não só os do Estado); tira o master
(tirar_master: o claim nulo, o perfil "pessoa" nos 2 schemas e o papel do Treino nulo); fecha as sessões que a rodada abriu (logout
local; sem o token, o DELETE das sessões anotadas — só as do uid de teste) e as do TREINO da conta de teste abertas desde o --preparar
(a troca forçada depois do código abre uma sessão nova que a página pode não guardar: o DELETE só do usuário do Treino ligado ao uid
de teste, desde o início gravado no Estado); confere por SQL (0 fator; não master no staging, no public e no claim; o papel do Treino
nulo; 0 sessão viva) e SÓ ENTÃO tira a chave `hml22` do Estado (o e2e_estado.json de sempre: hml19/agente/). Morte sem finally
(SIGKILL, o PC reiniciou): rodar --limpar à mão; o próximo --preparar limpa antes; e o Estado pendente bloqueia outra rodada.

Logins: o registro hml22/agente/logins_f7_22.txt, no máximo 20 (o login com a troca do Treino conta 2; uma rodada C1–C7 usa 9 — a
DECISÃO da F7: cabe repetir o necessário depois de uma queda que não é do app).

Uso (F7, staging; 1 E2E por vez, /health antes de cada caso):
  python3 e2e/hml22/dois_fatores.py --seco                                   (sem rede: as travas e o TOTP — a prova da etapa 1)
  python3 e2e/hml22/dois_fatores.py --preparar                               (limpa antes, grava o Estado e dá o master de teste)
  python3 e2e/hml22/dois_fatores.py --base staging --canal msedge [--base-app http://localhost:8080] [--casos C1,C2,…]
  python3 e2e/hml22/dois_fatores.py --limpar                                 (à mão: a rodada caiu no meio)
Sem segredo nem dado pessoal na saída: só status, códigos, contagens e tempos.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import hmac
import importlib.util
import json
import re
import struct
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
HML = Path.home() / "projetos" / "physiqcalc-scratch" / "hml"
ESTADO_ARQ = HML / "hml19" / "agente" / "e2e_estado.json"  # o e2e_estado.json de sempre (o da hml-19/20/21)
REG_LOGINS = HML / "hml22" / "agente" / "logins_f7_22.txt"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml22"
CHAVE = "hml22"
MAX_LOGINS = 20
CONTA = "w27-master"
EMAIL_CONTA = "w27.master.teste.claude@physiqnutri.app"
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app"}
TEXTO_TELA = "Digite o código do app autenticador"
TEXTO_ERRADO = "Código errado. Confira o app e tente de novo."
TEXTO_LIGADA = "Pronto. A verificação está ligada. As outras sessões abertas desta conta foram encerradas."
CARTAO_APP = "Conta master: use o site"
CASOS_ORDEM = ("C1", "C2", "C3", "C4", "C5", "C6", "C7")
UA_WEBVIEW = ("Mozilla/5.0 (Linux; Android 14; 21121210G Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36")
SELETORES_SEGREDO = ("[data-2fa-qr]", "[data-2fa-segredo]")
CSS_BORRAR = "[data-2fa-qr], [data-2fa-segredo] { filter: blur(14px) !important; }"
# as origens que as funções aceitam (supabase-principal/functions/_shared/login-regras.ts › origemPermitida; a trocar-token do Treino
# igual): o JS do app servido local (o C6) só funciona numa delas — noutra, o CORS barra a função conta
ORIGENS_ACEITAS = re.compile(r"^(https://(www\.)?physiqcalc\.com\.br|https://physiqcalc-staging\.vercel\.app|https://localhost|"
                             r"capacitor://localhost|http://localhost:(5173|8080))$")


# ───────────────────────── as regras puras (o --seco confere todas, sem rede) ─────────────────────────
def email_de_teste(email: str | None) -> bool:
    """A regra do servidor (supabase-principal/functions/_shared/master-regras.ts › emailDeTeste) — conta de TESTE."""
    e = (email or "").strip().lower()
    return e == "teste@teste.com" or re.fullmatch(r"[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app", e) is not None


def exigir_conta_de_teste(email: str | None) -> None:
    """Só o w27-master: o e-mail certo E de teste (a regra do servidor e a da W5, `.teste.claude@`). Outra conta → aborta."""
    e = (email or "").strip().lower()
    if e != EMAIL_CONTA or not email_de_teste(e) or ".teste.claude@" not in e:
        raise SystemExit("hml-22: a conta não é o w27-master de teste — nada é feito")


def eh_uuid(v: object) -> bool:
    return isinstance(v, str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", v) is not None


def eh_inicio(v: object) -> bool:
    """O início da rodada no Estado (ISO 8601 com o fuso, como o --preparar grava): só esse formato entra no SQL."""
    return isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}", v) is not None


def origem_aceita(url: str | None) -> bool:
    """A origem do --base-app (esquema + host + porta) está entre as que as funções aceitam (ORIGENS_ACEITAS)?"""
    m = re.match(r"^([a-z]+://[^/?#]+)", (url or "").strip())
    return bool(m) and ORIGENS_ACEITAS.match(m.group(1)) is not None


def blocos_dos_casos(casos: list[str]) -> list[str]:
    """O que roda, em ordem, para o --casos: "C1" (só o C1) ou "C1C2" (o fator do C2 serve a todos os outros); o maior de C3/C4/C5
    pedido (o mesmo login; o C7 puxa o C5, porque desfaz com o token aal2 dele); "C6" e "C7" só quando pedidos."""
    ate = max(casos, key=CASOS_ORDEM.index)
    blocos = ["C1" if ate == "C1" else "C1C2"]
    meio = [x for x in casos if x in ("C3", "C4", "C5")] + (["C5"] if "C7" in casos else [])
    if meio:
        blocos.append(max(meio, key=CASOS_ORDEM.index))
    blocos += [x for x in ("C6", "C7") if x in casos]
    return blocos


def totp(segredo_b32: str, agora: float, passo: int = 30, digitos: int = 6) -> str:
    """RFC 6238 (o TOTP do GoTrue: HMAC-SHA1, 30 s, 6 dígitos), só com a stdlib."""
    limpo = re.sub(r"\s+", "", segredo_b32).upper()
    chave = base64.b32decode(limpo + "=" * (-len(limpo) % 8))
    mac = hmac.new(chave, struct.pack(">Q", int(agora // passo)), hashlib.sha1).digest()
    i = mac[-1] & 0x0F
    return str((struct.unpack(">I", mac[i:i + 4])[0] & 0x7FFFFFFF) % (10 ** digitos)).zfill(digitos)


def janela(agora: float, passo: int = 30) -> int:
    return int(agora // passo)


def espera_para_codigo(agora: float, usadas: set[int], folga: float = 5.0, passo: int = 30) -> float:
    """Quantos segundos esperar antes de gerar o código: faltando < `folga` s na janela, ou janela já usada (o código de uma janela
    vale 1 vez), espera o começo da próxima (+0,5 s)."""
    alvo = agora
    while True:
        resta = passo - (alvo % passo)
        if resta >= folga and janela(alvo, passo) not in usadas:
            return alvo - agora
        alvo = (janela(alvo, passo) + 1) * passo + 0.5


def codigo_errado(segredo_b32: str, agora: float) -> str:
    """Um código de 6 números que NÃO vale em nenhuma janela vizinha (o GoTrue aceita a janela de antes e a de depois)."""
    validos = {totp(segredo_b32, agora + d) for d in (-60, -30, 0, 30, 60)}
    for n in range(1_000_000):
        c = str((123456 + n * 7919) % 1_000_000).zfill(6)
        if c not in validos:
            return c
    raise RuntimeError("sem código errado")  # nunca


class Segredo:
    """O código em texto do cadastro: SÓ na memória. Nunca vira texto (repr/str mascarados); só gera o TOTP."""

    __slots__ = ("_v",)

    def __init__(self, valor: str) -> None:
        limpo = re.sub(r"\s+", "", valor or "").upper()
        if not re.fullmatch(r"[A-Z2-7]{16,64}", limpo):
            raise ValueError("o código em texto da tela não tem o formato base32")
        self._v = limpo

    def __repr__(self) -> str:
        return "Segredo(***)"

    __str__ = __repr__

    def __format__(self, _spec: str) -> str:
        return "***"

    def codigo(self, agora: float) -> str:
        return totp(self._v, agora)

    def errado(self, agora: float) -> str:
        return codigo_errado(self._v, agora)


def claims(token: str | None) -> dict:
    try:
        corpo = (token or "").split(".")[1]
        return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))
    except Exception:  # noqa: BLE001
        return {}


def plano_limpeza(uid: str) -> dict:
    """O que o --limpar faz, montado SÓ com o uid do w27-master (puro: o --seco confere que nada mira outro uid)."""
    if not eh_uuid(uid):
        raise SystemExit("hml-22: uid inválido — nada é feito")
    treino = (f"(select treino_user_id from public.physiq_identidades where principal_user_id = '{uid}' "
              f"union select treino_user_id from staging.physiq_identidades where principal_user_id = '{uid}')")
    return {
        "listar_fatores": ("GET", f"/auth/v1/admin/users/{uid}/factors"),
        "apagar_fator": ("DELETE", f"/auth/v1/admin/users/{uid}/factors/{{fator}}"),
        "conferir_email": f"select lower(email) as email from auth.users where id = '{uid}'",
        "conferir": (f"select (select count(*) from auth.mfa_factors where user_id = '{uid}') as fatores, "
                     f"(select role from staging.profiles where id = '{uid}') as staging, "
                     f"(select role from public.profiles where id = '{uid}') as public, "
                     f"(select raw_app_meta_data->>'role' from auth.users where id = '{uid}') as claim"),
        "sessoes": f"delete from auth.sessions where user_id = '{uid}' and id = any(array[{{ids}}]::uuid[])",
        # o Treino (a troca abre sessões lá): só o usuário do Treino ligado ao uid de teste, só as criadas desde o --preparar
        "sessoes_treino": f"delete from auth.sessions where user_id in {treino} and created_at >= '{{inicio}}'::timestamptz",
        "sessoes_treino_vivas": f"select count(*) as n from auth.sessions where user_id in {treino} and created_at >= '{{inicio}}'::timestamptz",
    }


class Estado:
    """A chave `hml22` do e2e_estado.json de sempre (as outras chaves do arquivo ficam como estão). {uid, master_dado, rodada,
    em_andamento, fatores: [ids], sessoes: [ids], janelas: [n]}."""

    def __init__(self, arquivo: Path = ESTADO_ARQ, memoria: dict | None = None) -> None:
        self.arquivo = arquivo
        self._memoria = memoria  # o --seco: nada vai ao disco

    def _ler_tudo(self) -> dict:
        if self._memoria is not None:
            return json.loads(json.dumps(self._memoria))  # uma cópia: só o gravar muda o que está guardado
        try:
            d = json.loads(self.arquivo.read_text(encoding="utf-8"))
            return d if isinstance(d, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _gravar_tudo(self, d: dict) -> None:
        if self._memoria is not None:
            self._memoria.clear()
            self._memoria.update(d)
            return
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.arquivo.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.chmod(0o600)
        tmp.replace(self.arquivo)

    def ler(self) -> dict | None:
        v = self._ler_tudo().get(CHAVE)
        return v if isinstance(v, dict) else None

    def gravar(self, valor: dict) -> None:
        d = self._ler_tudo()
        d[CHAVE] = valor
        self._gravar_tudo(d)

    def anotar(self, campo: str, item: object) -> None:
        v = self.ler() or {}
        lista = v.setdefault(campo, [])
        if item not in lista:
            lista.append(item)
        self.gravar(v)

    def tirar(self) -> None:
        d = self._ler_tudo()
        d.pop(CHAVE, None)
        self._gravar_tudo(d)


class Logins:
    """O registro dos logins da W (no máximo MAX_LOGINS = 20; o login com a troca do Treino conta 2)."""

    def __init__(self, arquivo: Path = REG_LOGINS, memoria: list | None = None) -> None:
        self.arquivo = arquivo
        self._memoria = memoria

    def feitos(self) -> int:
        if self._memoria is not None:
            return sum(n for n, _ in self._memoria)
        if not self.arquivo.exists():
            return 0
        total = 0
        for linha in self.arquivo.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*\+(\d+) ", linha)
            total += int(m.group(1)) if m else 0
        return total

    def contar(self, motivo: str, n: int = 1) -> None:
        if self.feitos() + n > MAX_LOGINS:
            raise SystemExit(f"hml-22: o teto de {MAX_LOGINS} logins da W chegou ({self.arquivo.name}) — nada de login novo")
        if self._memoria is not None:
            self._memoria.append((n, motivo))
            return
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        with self.arquivo.open("a", encoding="utf-8") as f:
            f.write(f"+{n} {time.strftime('%H:%M:%S')} {motivo}\n")


# ───────────────────────── a rede (só fora do --seco): a base da W27 ─────────────────────────
_B = None


def base():
    """A base da W27 (e2e/w27/_base.py), carregada só quando a rodada vai à rede — o --seco nunca a carrega."""
    global _B
    if _B is None:
        espec = importlib.util.spec_from_file_location("_base_w27", REPO / "e2e" / "w27" / "_base.py")
        b = importlib.util.module_from_spec(espec)
        sys.modules["_base_w27"] = b
        espec.loader.exec_module(b)  # type: ignore[union-attr]
        b.ESTADO["schema"] = "staging"
        b.B5.PRINTS = PRINTS
        _B = b
    return _B


_CORTADO: list[str] = []


def corte_vira_saida() -> None:
    """SIGTERM/SIGINT viram SystemExit: o finally da limpeza RODA quando o processo é cortado (o molde da hml-19). Os sinais
    seguintes, com a limpeza em curso, são ignorados (só o SIGKILL interrompe — aí, --limpar à mão)."""
    import signal  # noqa: PLC0415

    def _cortado(sinal: int, _quadro: object) -> None:
        if _CORTADO:
            print(f"(sinal {signal.Signals(sinal).name} de novo: a limpeza já está rodando — ignorado)", flush=True)
            return
        _CORTADO.append(signal.Signals(sinal).name)
        raise SystemExit(f"cortado pelo sinal {signal.Signals(sinal).name} — a limpeza roda agora (finally)")

    for sinal in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sinal, _cortado)


def saude_ok(rotulo: str) -> None:
    """O /health dos 2 projetos (a guarda de sempre, H-80) antes de cada caso: ruim → para tudo."""
    base().saude_ok(rotulo)


class Rodada:
    """O que a rodada abriu e precisa fechar: os tokens das sessões (só na memória) e o placar."""

    def __init__(self, estado: Estado, logins: Logins) -> None:
        self.estado = estado
        self.logins = logins
        self.tokens: dict[str, str] = {}  # session_id → o token mais novo (memória)
        self.segredo: Segredo | None = None
        self.fator: str | None = None
        self.token_aal2: str | None = None

    @property
    def p(self):
        return base().p

    def uid(self) -> str:
        b = base()
        u = b.uid(CONTA)
        if not u:
            raise SystemExit("hml-22: o w27-master não existe (a hml-22 não cria login)")
        r = b.sql_principal(plano_limpeza(u)["conferir_email"])
        exigir_conta_de_teste((r[0] if r else {}).get("email"))
        guardado = (self.estado.ler() or {}).get("uid")
        if guardado and guardado != u:
            raise SystemExit("hml-22: o uid do Estado não é o do w27-master — nada é feito")
        return u

    def anotar_sessao(self, token: str) -> None:
        sid = claims(token).get("session_id")
        if eh_uuid(sid):
            self.tokens[sid] = token
            self.estado.anotar("sessoes", sid)

    def do_navegador(self, c) -> str | None:
        """O token que o navegador guardou agora (o app renova e, depois do código, ele é aal2)."""
        try:
            bruto = c.pg.evaluate("() => localStorage.getItem('physiq-principal-auth')")
            s = json.loads(bruto) if bruto else None
        except Exception:  # noqa: BLE001
            return None
        tok = s.get("access_token") if isinstance(s, dict) else None
        if tok:
            self.anotar_sessao(tok)
        return tok

    def entrar(self, c, rota: str, motivo: str, troca: bool = True) -> dict:
        self.logins.contar(motivo + (" (+ a troca do Treino)" if troca else ""), 2 if troca else 1)
        sess = c.entrar(CONTA, rota)
        self.anotar_sessao(sess["access_token"])
        return sess

    def sondas(self, token: str, so_master_contas: bool = False) -> dict:
        """Com o token dado: a master-contas, a RPC master_visao_geral (como a pessoa), o REST profiles do staging (só a contagem) e a
        troca do Treino (403 não abre sessão; 200 abre — fechada na hora e contada no registro de logins)."""
        b = base()
        st_mc, r_mc = b.funcao("master-contas", {"acao": "visao_geral"}, tok=token)
        if so_master_contas:
            return {"master_contas": (st_mc, (r_mc or {}).get("erro") if isinstance(r_mc, dict) else None)}
        st_rpc, r_rpc, _ = b.http("POST", f"{b.PRINCIPAL_URL}/rest/v1/rpc/master_visao_geral", {},
                                  {"apikey": b.anon(b.PRINCIPAL_REF), "Authorization": f"Bearer {token}",
                                   "Content-Profile": "staging", "Accept-Profile": "staging"})
        st_rest, r_rest, _ = b.http("GET", f"{b.PRINCIPAL_URL}/rest/v1/profiles?select=id", None,
                                    {"apikey": b.anon(b.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": "staging"})
        b.B5.zerar_limite_troca(CONTA)
        st_tt, r_tt, _ = b.http("POST", f"{b.B5.API_T}/functions/v1/trocar-token", {},
                                {"Authorization": f"Bearer {token}", "x-schema": "staging", "Origin": BASES["staging"]}, timeout=60)
        if st_tt == 200 and isinstance(r_tt, dict) and r_tt.get("access_token"):
            self.logins.contar("sonda: a troca do Treino abriu sessão (fechada na hora)", 1)
            b.http("POST", f"{b.B5.API_T}/auth/v1/logout?scope=local", {}, {"apikey": b.anon(b.TREINO_REF),
                                                                            "Authorization": f"Bearer {r_tt['access_token']}"})
        rpc = r_rpc if isinstance(r_rpc, dict) else {}
        return {
            "master_contas": (st_mc, (r_mc or {}).get("erro") if isinstance(r_mc, dict) else None),
            "rpc": (st_rpc, rpc.get("ok"), rpc.get("erro")),
            "rest_profiles": (st_rest, len(r_rest) if isinstance(r_rest, list) else None),
            "troca": (st_tt, (r_tt or {}).get("error") if isinstance(r_tt, dict) else None),
        }

    def fatores_sql(self, uid: str) -> tuple[int, int]:
        r = base().sql_principal(f"select count(*) filter (where status = 'verified') as v, count(*) as t from auth.mfa_factors where user_id = '{uid}'")
        return (int(r[0]["v"]), int(r[0]["t"])) if r else (-1, -1)


def novo_caso(nav, nome: str, ctx: dict, celular: bool = False, ua: str | None = None, ponte: bool = False, base_url: str | None = None):
    """Um contexto limpo do navegador (o Caso da W5) — sem trace e sem vídeo (o segredo passa pela tela no C2)."""
    b = base()
    original = nav.new_context

    def com_ua(**kw):
        if ua:
            kw["user_agent"] = ua
        return original(**kw)

    nav.new_context = com_ua
    try:
        c = b.Caso(nav, base_url or ctx["base"], ctx["prefixo"], nome, desktop=not celular)
    finally:
        nav.new_context = original
    if ponte:
        ponte_js = (REPO / "e2e" / "h2" / "ponte_android.js").read_text(encoding="utf-8")
        c.pg.add_init_script("window.__PONTE_CFG = {};\n" + ponte_js)
    return c


def foto(c, ctx: dict, nome: str, borrar: bool = False) -> None:
    """O print; com borrar, o QR e o código em texto saem cobertos (o CSS de borrão + a máscara do Playwright)."""
    PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = PRINTS / f"{ctx['prefixo']}_{nome}.png"
    c.pg.wait_for_timeout(800)
    mascara = [c.pg.locator(s) for s in SELETORES_SEGREDO] if borrar else None
    c.pg.screenshot(path=str(caminho), mask=mascara)
    print(f"   print: {caminho.name}", flush=True)


def digitar_codigo(c, codigo: str) -> None:
    campo = c.pg.locator("input[data-2fa-codigo]").first
    campo.click()
    campo.fill("")
    campo.type(codigo, delay=40)


def troca_respondeu(c, status: int, desde: int = 0) -> bool:
    return any(x.startswith(f"{status} POST") and x.endswith("trocar-token") for x in c.rede[desde:])


def fechar(c, r: "Rodada") -> None:
    """O fim de todo caso: a sessão do TREINO que a troca do navegador abriu sai (logout local no Auth do Treino — a chave padrão do
    supabase-js, sb-<host>-auth-token) e a do principal fica anotada para o --limpar (logout local no fim). Depois, o fim do Caso."""
    b = base()
    try:
        r.do_navegador(c)
        bruto = c.pg.evaluate("""() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
            if (/^sb-.*-auth-token$/.test(k)) return localStorage.getItem(k); } return null; }""")
        s = json.loads(bruto) if bruto else None
        s = (s.get("currentSession") or s) if isinstance(s, dict) else None
        tok = s.get("access_token") if isinstance(s, dict) else None
        if isinstance(tok, str) and tok:
            st, _, _ = b.http("POST", f"{b.B5.API_T}/auth/v1/logout?scope=local", {}, {"apikey": b.anon(b.TREINO_REF), "Authorization": f"Bearer {tok}"})
            b.p.check(st in (200, 204), f"[{c.nome}] a sessão do Treino que o navegador abriu: logout local ({st})")
    except Exception as e:  # noqa: BLE001 — a página fechou
        print(f"   ({c.nome}: sem a sessão do Treino para fechar — {type(e).__name__})", flush=True)
    c.fim()


# ───────────────────────── os casos ─────────────────────────
def caso_c1_c2(nav, r: Rodada, ctx: dict, uid: str, so_c1: bool) -> None:
    """C1 (sem fator = hoje) e C2 (ativar) na MESMA sessão (aal1 → o cadastro a deixa aal2)."""
    p = r.p
    c = novo_caso(nav, "C1_sem_fator", ctx)
    try:
        r.entrar(c, "/master", "C1 entrar (aal1, sem fator)")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]') and "Carregando" not in c.texto()[:3000], 45)
        p.check(ok, f"[C1] sem fator: /master abre sem a tela do código ({c.caminho()})")
        p.check(TEXTO_TELA not in c.texto(), "[C1] nenhum pedido de código")
        p.check(c.esperar(lambda: troca_respondeu(c, 200), 45), "[C1] a troca do Treino do navegador: 200 (como hoje)")
        tok = r.do_navegador(c)
        st, erro = r.sondas(tok, so_master_contas=True)["master_contas"] if tok else (0, "sem token")
        p.check(st == 200, f"[C1] a master-contas (visao_geral) com o token aal1 sem fator: {st} {erro or ''}")
        foto(c, ctx, "C1_sem_fator_master")
        if so_c1:
            return
        # C2 — Master › Configurações › Ativar
        c.ir("/master/configuracoes")
        c.pg.add_style_tag(content=CSS_BORRAR)  # antes de qualquer print/diagnóstico desta página: o QR e o código em texto borrados
        ok = c.esperar(lambda: c.tem("[data-2fa-ativar]"), 45)
        p.check(ok, "[C2] o cartão \"Verificação em 2 etapas\" está desligado com o \"Ativar\"")
        c.pg.locator("[data-2fa-ativar]").first.click()
        ok = c.esperar(lambda: c.tem("[data-2fa-passos]") and c.tem("img[data-2fa-qr]") and c.tem("[data-2fa-segredo]"), 45)
        p.check(ok, "[C2] os 2 passos: o QR e o código em texto")
        c.pg.add_style_tag(content=CSS_BORRAR)
        r.segredo = Segredo(c.pg.locator("[data-2fa-segredo]").first.inner_text())
        foto(c, ctx, "C2a_ativar_qr_borrado", borrar=True)
        st, lista = base().admin_auth(base().PRINCIPAL_REF, "GET", f"users/{uid}/factors")
        pela_metade = [f.get("id") for f in (lista if isinstance(lista, list) else []) if f.get("status") == "unverified"]
        p.check(st == 200 and len(pela_metade) == 1, f"[C2] o Auth tem 1 fator pela metade da conta de teste ({st}, {len(pela_metade)})")
        if pela_metade:
            r.fator = pela_metade[0]
            r.estado.anotar("fatores", r.fator)  # ANTES de conferir: se a rodada cair, o --limpar sabe dele (e apaga todos)
        espera = espera_para_codigo(time.time(), set((r.estado.ler() or {}).get("janelas", [])))
        time.sleep(espera)
        agora = time.time()
        r.estado.anotar("janelas", janela(agora))
        digitar_codigo(c, r.segredo.codigo(agora))
        ok = c.esperar(lambda: TEXTO_LIGADA in c.texto() and c.tem('[data-2fa-estado="ligada"]'), 30)
        p.check(ok, "[C2] os 6 números certos → \"Ligada\" e o aviso das outras sessões")
        p.check(not c.tem("[data-2fa-segredo]"), "[C2] o código em texto saiu da tela")
        foto(c, ctx, "C2b_ligada")
        v, t = r.fatores_sql(uid)
        p.check((v, t) == (1, 1), f"[C2] SQL: 1 fator verificado da conta de teste ({v} verificado de {t})")
        tok = r.do_navegador(c)
        p.check(claims(tok).get("aal") == "aal2", "[C2] a sessão que ativou virou aal2")
    finally:
        fechar(c, r)


def caso_c3_c4_c5(nav, r: Rodada, ctx: dict, uid: str, ate: str) -> None:
    """C3 (pede o código), C4 (código errado) e C5 (código certo, janela nova) no MESMO login novo (aal1)."""
    p = r.p
    c = novo_caso(nav, "C3_pede_codigo", ctx)
    try:
        sess = r.entrar(c, "/master", "C3 login novo (aal1, com fator)")
        tok1 = sess["access_token"]
        p.check(claims(tok1).get("aal") == "aal1", "[C3] o login novo é aal1")
        ok = c.esperar(lambda: TEXTO_TELA in c.texto(), 45)
        p.check(ok, f"[C3] /master mostra \"{TEXTO_TELA}\" ({c.caminho()})")
        p.check(not c.tem("[data-pagina-master]"), "[C3] nenhuma página do master por trás")
        foto(c, ctx, "C3a_master_pede_codigo")
        c.ir("/painel")
        ok = c.esperar(lambda: TEXTO_TELA in c.texto(), 30)
        p.check(ok and not c.tem("[data-menu-usuario-botao]"), f"[C3] /painel também pede o código, sem o painel ({c.caminho()})")
        foto(c, ctx, "C3b_painel_pede_codigo")
        s = r.sondas(tok1)
        p.check(s["master_contas"] == (403, "precisa_2fa"), f"[C3] a master-contas com aal1 + fator: {s['master_contas']}")
        p.check(s["rpc"][0] == 200 and s["rpc"][1] is False and s["rpc"][2] == "so_master", f"[C3] a RPC master_visao_geral: {s['rpc']}")
        p.check(s["rest_profiles"] == (200, 1), f"[C3] o REST profiles do staging: só a própria linha {s['rest_profiles']}")
        p.check(s["troca"] == (403, "precisa_2fa"), f"[C3] a troca do Treino: {s['troca']}")
        if ate == "C3":
            return
        # C4 — o código errado
        digitar_codigo(c, r.segredo.errado(time.time()))
        ok = c.esperar(lambda: TEXTO_ERRADO in c.texto(), 30)
        p.check(ok, "[C4] código errado → \"Código errado…\"")
        tok = r.do_navegador(c)
        p.check(claims(tok).get("aal") == "aal1" and TEXTO_TELA in c.texto(), "[C4] segue aal1, na tela do código")
        foto(c, ctx, "C4_codigo_errado")
        if ate == "C4":
            return
        # C5 — o código certo, numa janela que ainda não foi usada
        espera = espera_para_codigo(time.time(), set((r.estado.ler() or {}).get("janelas", [])))
        time.sleep(espera)
        agora = time.time()
        r.estado.anotar("janelas", janela(agora))
        desde = len(c.rede)
        digitar_codigo(c, r.segredo.codigo(agora))
        ok = c.esperar(lambda: TEXTO_TELA not in c.texto() and c.tem("[data-menu-usuario-botao]"), 45)
        p.check(ok, f"[C5] código certo → a tela sai e o painel abre ({c.caminho()})")
        c.ir("/master")
        ok = c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]') and "Carregando" not in c.texto()[:3000], 45)
        p.check(ok, f"[C5] /master abre ({c.caminho()})")
        foto(c, ctx, "C5_master_com_codigo")
        p.check(c.esperar(lambda: troca_respondeu(c, 200, desde), 45), "[C5] a troca do Treino refeita pelo navegador: 200")
        tok2 = r.do_navegador(c)
        p.check(claims(tok2).get("aal") == "aal2", "[C5] o token do navegador é aal2")
        r.token_aal2 = tok2
        s = r.sondas(tok2)
        p.check(s["master_contas"][0] == 200, f"[C5] a master-contas com aal2: {s['master_contas']}")
        p.check(s["rpc"][0] == 200 and s["rpc"][2] is None, f"[C5] a RPC master_visao_geral com aal2: {s['rpc'][:1]}")
        p.check(s["rest_profiles"][0] == 200 and (s["rest_profiles"][1] or 0) > 1, f"[C5] o REST profiles vê as linhas de teste: {s['rest_profiles']}")
        p.check(s["troca"][0] == 200, f"[C5] a troca do Treino com aal2: {s['troca'][0]}")
    finally:
        fechar(c, r)


def caso_c6(nav, r: Rodada, ctx: dict, base_app: str | None) -> None:
    """C6 — o app (o JS do build:apk + a ponte Android): a conta master sai do aparelho, sem a tela do código."""
    p = r.p
    if not base_app:
        p.check(False, "[C6] sem --base-app (o JS do npm run build:apk servido local): o caso não rodou")
        return
    c = novo_caso(nav, "C6_app", ctx, celular=True, ua=UA_WEBVIEW, ponte=True, base_url=base_app)
    try:
        r.entrar(c, "/", "C6 o app (a ponte Android)", troca=True)
        ok = c.esperar(lambda: CARTAO_APP in c.texto(), 45)
        p.check(ok, f"[C6] o app mostra \"{CARTAO_APP}\" ({c.caminho()})")
        p.check(TEXTO_TELA not in c.texto() and not c.tem("[data-2fa-tela]"), "[C6] sem a tela do código no app")
        foto(c, ctx, "C6_app_master_use_o_site")
    finally:
        fechar(c, r)


def caso_c7(nav, r: Rodada, ctx: dict, uid: str) -> None:
    """C7 — desfazer pelo próprio Auth (com o token aal2) e conferir que tudo volta a ser como hoje."""
    p = r.p
    b = base()
    if not (r.token_aal2 and r.fator):
        p.check(False, "[C7] sem o token aal2 do C5 ou sem o fator do C2: o caso não rodou")
        return
    st, _, _ = b.http("DELETE", f"{b.PRINCIPAL_URL}/auth/v1/factors/{r.fator}", None,
                      {"apikey": b.anon(b.PRINCIPAL_REF), "Authorization": f"Bearer {r.token_aal2}"})
    p.check(st == 200, f"[C7] DELETE /auth/v1/factors com o token aal2: {st}")
    v, t = r.fatores_sql(uid)
    p.check((v, t) == (0, 0), f"[C7] SQL: 0 fator da conta de teste ({t})")
    c = novo_caso(nav, "C7_sem_fator_de_novo", ctx)
    try:
        r.entrar(c, "/master", "C7 login novo depois de desfazer")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]') and "Carregando" not in c.texto()[:3000], 45)
        p.check(ok and TEXTO_TELA not in c.texto(), f"[C7] /master abre sem código, como hoje ({c.caminho()})")
        foto(c, ctx, "C7_master_sem_codigo")
    finally:
        fechar(c, r)


# ───────────────────────── preparar e limpar ─────────────────────────
def limpar(r: Rodada) -> bool:
    """A limpeza garantida (idempotente). True = conferida por SQL e a chave `hml22` saiu do Estado."""
    b = base()
    p = b.p
    uid = r.uid()  # aborta se não for o w27-master de teste
    plano = plano_limpeza(uid)
    st, lista = b.admin_auth(b.PRINCIPAL_REF, "GET", plano["listar_fatores"][1].replace("/auth/v1/admin/", ""))
    ids = [f.get("id") for f in (lista if isinstance(lista, list) else []) if eh_uuid(f.get("id"))]
    apagados = 0
    for fid in ids:
        st_d, _ = b.admin_auth(b.PRINCIPAL_REF, "DELETE", plano["apagar_fator"][1].replace("/auth/v1/admin/", "").replace("{fator}", fid))
        apagados += st_d in (200, 204)
    b.tirar_master(CONTA)
    # as sessões que a rodada abriu: o logout local com o token da memória; o que sobrar (sem token: rodada que caiu) sai pelo SQL
    fechadas = 0
    for _sid, tok in list(r.tokens.items()):
        st_l, _, _ = b.http("POST", f"{b.PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, {"apikey": b.anon(b.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        fechadas += st_l in (200, 204)
    anotadas = [s for s in (r.estado.ler() or {}).get("sessoes", []) if eh_uuid(s)]
    if anotadas:
        b.sql_principal(plano["sessoes"].replace("{ids}", ", ".join(f"'{s}'" for s in anotadas)))
    # as do TREINO que a rodada abriu (a troca forçada depois do código abre uma nova que a página pode não guardar — o fechar() do
    # caso só vê a guardada): só o usuário do Treino ligado ao uid de teste, só as criadas desde o --preparar (o início no Estado)
    inicio = (r.estado.ler() or {}).get("inicio")
    treino_vivas: int | str = "sem o início no Estado: não varridas"
    if eh_inicio(inicio):
        b.B5.exec_treino(plano["sessoes_treino"].replace("{inicio}", inicio))
        tv = b.sql_treino(plano["sessoes_treino_vivas"].replace("{inicio}", inicio))
        treino_vivas = int(tv[0]["n"]) if tv else -1
    conf = (b.sql_principal(plano["conferir"]) or [{}])[0]
    papel_treino = b.sql_treino(
        "select count(*) as n from auth.users u join (select treino_user_id from public.physiq_identidades where principal_user_id = "
        f"'{uid}' union select treino_user_id from staging.physiq_identidades where principal_user_id = '{uid}') i "
        "on i.treino_user_id = u.id where coalesce(u.raw_app_meta_data->>'role', '') <> ''")
    sem_papel = bool(papel_treino) and int(papel_treino[0]["n"]) == 0
    vivas = b.sql_principal(f"select count(*) as n from auth.sessions where user_id = '{uid}' and id = any(array[{', '.join(repr(s) for s in anotadas) or 'null'}]::uuid[])") \
        if anotadas else [{"n": 0}]
    ok = (int(conf.get("fatores", -1)) == 0 and conf.get("staging") != "master" and conf.get("public") != "master" and not conf.get("claim")
          and sem_papel and int(vivas[0]["n"]) == 0 and treino_vivas in (0, "sem o início no Estado: não varridas"))
    p.check(ok, f"[limpar] fatores {len(ids)} → apagados {apagados}; sessões da rodada fechadas {fechadas} (+ {len(anotadas)} anotadas); "
                f"SQL: {conf.get('fatores')} fator, master staging/public/claim = {conf.get('staging') == 'master'}/"
                f"{conf.get('public') == 'master'}/{bool(conf.get('claim'))}, papel do Treino nulo = {sem_papel}, sessões vivas {vivas[0]['n']}, "
                f"sessões do Treino desde o --preparar vivas {treino_vivas}")
    if ok:
        r.estado.tirar()
    return ok


def preparar(r: Rodada) -> None:
    """Limpa antes (o que sobrou de uma rodada que caiu), grava o Estado (o uid e "master dado") e SÓ ENTÃO dá o master de teste."""
    b = base()
    # limpa SEMPRE antes (é idempotente e confere a conta): a sobra de uma rodada que caiu, com OU sem o Estado (revisão ⚪7)
    if not limpar(r):
        raise SystemExit("hml-22: a limpeza da rodada anterior não fechou — confira à mão antes")
    uid = r.uid()
    r.estado.gravar({"uid": uid, "master_dado": True, "rodada": time.strftime("%m%d%H%M"), "em_andamento": False,
                     "inicio": dt.datetime.now().astimezone().isoformat(timespec="seconds"),  # a limpeza varre o Treino desde aqui
                     "fatores": [], "sessoes": [], "janelas": []})
    b.B5.garantir_usuario(EMAIL_CONTA, b.CONTAS[CONTA][1], b.NOMES[CONTA])  # o login já existe: só a senha do arquivo
    b.dar_master(CONTA)
    v, t = r.fatores_sql(uid)
    papel = b.sql_principal(f"select role from staging.profiles where id = '{uid}'")
    b.p.check(v == 0 and t == 0 and papel and papel[0]["role"] == "master", f"[preparar] master de teste só no staging, 0 fator ({t})")


# ───────────────────────── o --seco (sem rede) ─────────────────────────
def _codigo_sem_textos(linha: str) -> str:
    return re.sub(r'"[^"]*"|\'[^\']*\'', '""', linha)


def linhas_que_vazam(fonte: str) -> list[str]:
    """As linhas que imprimem/registram o segredo (fora dos textos entre aspas): print/check/log com a variável do segredo, o `_v` do
    Segredo ou o texto lido da tela (inner_text) — a tela do C2 mostra o código em texto."""
    saida = []
    for linha in fonte.splitlines():
        codigo = _codigo_sem_textos(linha)
        if re.search(r"\b(print|p\.check|o\.ok|log\w*)\(", codigo) and re.search(r"segredo(?!\.(codigo|errado)\()|\b_v\b|inner_text", codigo, re.I):
            saida.append(linha.strip())
        elif re.search(r"\b(print|p\.check|o\.ok|log\w*)\(", linha) and re.search(r"\{[^}]*segredo[^}]*\}", linha):
            saida.append(linha.strip())  # o segredo dentro do f-string (entre as chaves)
    return saida


def grava_a_tela(fonte: str) -> bool:
    """O Playwright gravando a tela (trace, vídeo ou HAR) — proibido nesta W."""
    codigo = "\n".join(_codigo_sem_textos(l) for l in fonte.splitlines())
    return re.search(r"\.tracing\.(start|stop)\(|record_video_(dir|size)\s*=|record_har_path\s*=", codigo) is not None


class BaseFalsa:
    """A base da W27 de MENTIRA (só o --seco): anota cada chamada (SQL, admin, HTTP, master) e devolve o mínimo plausível. Serve para o
    --seco rodar o preparar e o limpar DE VERDADE sem rede: nada pode mirar outro uid além do do w27-master."""

    PRINCIPAL_REF, TREINO_REF, PRINCIPAL_URL = "ref-principal", "ref-treino", "https://principal.invalido"

    def __init__(self, uid: str, placar, fatores: list[dict]) -> None:
        self._uid, self.p, self.fatores = uid, placar, list(fatores)
        self.chamadas: list[str] = []
        self.CONTAS = {CONTA: (EMAIL_CONTA, "senha-de-mentira")}
        self.NOMES = {CONTA: "Master Teste W27"}
        falsa = self

        class _B5:
            API_T = "https://treino.invalido"

            @staticmethod
            def garantir_usuario(email, _senha, _nome):
                falsa.chamadas.append(f"garantir_usuario {email}")

            @staticmethod
            def zerar_limite_troca(conta):
                falsa.chamadas.append(f"zerar_limite_troca {conta}")

            @staticmethod
            def exec_treino(comando):
                falsa.chamadas.append(f"exec_treino {comando}")

        self.B5 = _B5

    def uid(self, conta):
        self.chamadas.append(f"uid {conta}")
        return self._uid

    def anon(self, _ref):
        return "anon-de-mentira"

    def sql_principal(self, q):
        self.chamadas.append(f"sql {q}")
        if "lower(email)" in q:
            return [{"email": EMAIL_CONTA}]
        if "filter (where status" in q:
            return [{"v": 0, "t": len(self.fatores)}]
        if q.startswith("select role from staging.profiles"):
            return [{"role": "master"}]
        if "as fatores" in q:
            return [{"fatores": len(self.fatores), "staging": "pessoa", "public": "pessoa", "claim": None}]
        if "from auth.sessions" in q and q.startswith("select"):
            return [{"n": 0}]
        return []

    def sql_treino(self, q):
        self.chamadas.append(f"sql_treino {q}")
        return [{"n": 0}]

    def admin_auth(self, _ref, metodo, caminho, corpo=None):
        self.chamadas.append(f"admin {metodo} {caminho}")
        if metodo == "GET":
            return 200, [dict(f) for f in self.fatores]
        self.fatores = [f for f in self.fatores if not caminho.endswith(f["id"])]
        return 200, {}

    def http(self, metodo, url, corpo=None, cab=None, timeout=60):
        self.chamadas.append(f"http {metodo} {url}")
        return 200, {}, {}

    def dar_master(self, conta):
        self.chamadas.append(f"dar_master {conta}")

    def tirar_master(self, conta):
        self.chamadas.append(f"tirar_master {conta}")


def seco() -> int:
    global _B
    espec = importlib.util.spec_from_file_location("_comum_w02", REPO / "e2e" / "w02" / "_comum.py")
    comum = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(comum)  # type: ignore[union-attr]
    p = comum.Placar()
    # 1. o TOTP: os vetores do RFC 6238 (apêndice B, SHA1; 6 dígitos = os 6 últimos dos 8)
    rfc = base64.b32encode(b"12345678901234567890").decode()
    vetores = {59: "287082", 1111111109: "081804", 1111111111: "050471", 1234567890: "005924", 2000000000: "279037", 20000000000: "353130"}
    p.check(all(totp(rfc, t) == c for t, c in vetores.items()), f"[seco] TOTP = os {len(vetores)} vetores do RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos)")
    p.check(totp(rfc.lower(), 59) == "287082" and totp(" ".join(rfc[i:i + 4] for i in range(0, len(rfc), 4)), 59) == "287082",
            "[seco] o código em texto da tela (em grupos de 4, minúsculo) gera o mesmo TOTP")
    # 2. a janela: faltando < 5 s ou janela já usada → espera a próxima
    p.check(espera_para_codigo(30 * 1000 + 3, set()) == 0 and abs(espera_para_codigo(30 * 1000 + 26, set()) - 4.5) < 1e-6,
            "[seco] faltando ≥ 5 s usa a janela; < 5 s espera a próxima (+0,5 s)")
    p.check(abs(espera_para_codigo(30 * 1000 + 3, {1000}) - 27.5) < 1e-6, "[seco] a janela já usada (o código vale 1 vez) espera a próxima")
    erro = codigo_errado(rfc, 1111111111)
    p.check(re.fullmatch(r"\d{6}", erro) is not None and erro not in {totp(rfc, 1111111111 + d) for d in (-60, -30, 0, 30, 60)},
            "[seco] o código errado do C4 não vale em nenhuma janela vizinha")
    # 3. o segredo só na memória: repr/str/format mascarados; nenhum print/check do segredo no fonte
    s = Segredo(rfc)
    p.check(rfc not in (repr(s) + str(s) + f"{s}" + json.dumps({"x": str(s)})), "[seco] o Segredo nunca vira texto (repr, str, format)")
    try:
        Segredo("isto não é base32!")
        p.check(False, "[seco] o Segredo recusa o que não é base32")
    except ValueError:
        p.check(True, "[seco] o Segredo recusa o que não é base32")
    fonte = Path(__file__).read_text(encoding="utf-8")
    vaza = linhas_que_vazam(fonte)
    p.check(not vaza, f"[seco] nenhum print/check/log leva o segredo ({len(vaza)} linha)")
    p.check(not grava_a_tela(fonte), "[seco] sem trace, sem vídeo e sem HAR do Playwright (o segredo passa pela tela no C2)")
    # o controle das 2 varreduras: um fonte de mentira com o vazamento tem de ser pego (senão a varredura é oca)
    # (as linhas de mentira vão em pedaços entre aspas: a varredura do fonte de verdade não as vê)
    falso_fonte = "\n".join(["pr" "int(r.segredo._v)", "pr" "int(f'{segredo}')", "p.ch" "eck(True, f'x {r.segredo}')",
                              "x = c.pg.locator('a').inner" "_text()", "pr" "int(x.inner" "_text())",
                              "ctx.trac" "ing.start(screenshots=True)", "nav.new_context(record_vid" "eo_dir='v')"])
    p.check(len(linhas_que_vazam(falso_fonte)) == 4 and grava_a_tela(falso_fonte),
            "[seco] controle: as varreduras pegam o vazamento de mentira (4 linhas) e o trace/vídeo")
    # 4. a conta: só o w27-master de teste; a regra do servidor
    ts = (REPO / "supabase-principal" / "functions" / "_shared" / "master-regras.ts").read_text(encoding="utf-8")
    p.check("/^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\\.app$/" in ts, "[seco] a regra de conta de teste do E2E = a do servidor (master-regras.ts)")
    p.check(email_de_teste(EMAIL_CONTA) and not email_de_teste("pessoa@gmail.com") and not email_de_teste("w27.master@physiqnutri.app"),
            "[seco] o w27-master é conta de teste; e-mail real não")
    recusas = 0
    for email in ("pessoa@gmail.com", "w27.dono.a.teste.claude@physiqnutri.app", "teste@teste.com", "", None):
        try:
            exigir_conta_de_teste(email)
        except SystemExit:
            recusas += 1
    p.check(recusas == 5, f"[seco] outra conta (real, de teste mas não o w27-master, vazia) → aborta ({recusas}/5)")
    exigir_conta_de_teste(EMAIL_CONTA.upper())
    p.check(True, "[seco] o w27-master passa (maiúscula ou não)")
    # 5. o --limpar só mira o uid dele
    falso = "00000000-0000-4000-8000-0000000000aa"
    plano = plano_limpeza(falso)
    textos = json.dumps(plano)
    p.check(textos.count(falso) == 12 and len(set(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", textos))) == 1,
            "[seco] o plano do --limpar só tem o uid do w27-master (12 lugares, nenhum outro uid)")
    p.check(plano["listar_fatores"][1].endswith(f"/admin/users/{falso}/factors") and "{fator}" in plano["apagar_fator"][1],
            "[seco] o --limpar lista TODOS os fatores da conta pelo admin (não só os do Estado) e apaga um a um")
    p.check(" and id = any(" in plano["sessoes"] and f"user_id = '{falso}'" in plano["sessoes"], "[seco] as sessões: só as anotadas E do uid de teste")
    p.check(all(x.startswith(("delete from auth.sessions where user_id in (select treino_user_id ", "select count(*) as n from auth.sessions where user_id in (select treino_user_id "))
                and x.count(f"principal_user_id = '{falso}'") == 2 and x.endswith("and created_at >= '{inicio}'::timestamptz")
                for x in (plano["sessoes_treino"], plano["sessoes_treino_vivas"])),
            "[seco] as sessões do Treino: só as do usuário do Treino ligado ao uid de teste E criadas desde o --preparar")
    p.check(eh_inicio("2026-10-14T20:26:04-03:00") and not eh_inicio("2026-10-14T20:26:04") and not eh_inicio("2026-10-14T20:26:04-03:00'; drop table x; --")
            and not eh_inicio(None), "[seco] o início da rodada no SQL: só o ISO com o fuso (nada mais entra)")
    try:
        plano_limpeza("'; delete from auth.users; --")
        p.check(False, "[seco] uid fora do formato → aborta")
    except SystemExit:
        p.check(True, "[seco] uid fora do formato → aborta")
    # 6. o Estado (na memória): grava antes de agir, guarda as outras chaves, a limpeza tira só a chave hml22
    mem = {"linhas": [["x", "y"]], "outra": 1}
    est = Estado(memoria=mem)
    est.gravar({"uid": falso, "master_dado": True, "fatores": [], "sessoes": []})
    est.anotar("fatores", "f1")
    est.anotar("fatores", "f1")
    p.check(est.ler()["fatores"] == ["f1"] and mem["outra"] == 1 and mem["linhas"] == [["x", "y"]], "[seco] o Estado anota sem repetir e não mexe nas outras chaves")
    est.tirar()
    p.check(CHAVE not in mem and mem["outra"] == 1, "[seco] a limpeza tira só a chave hml22")
    p.check(ESTADO_ARQ.parts[-3:] == ("hml19", "agente", "e2e_estado.json"), "[seco] o Estado é o e2e_estado.json de sempre (hml19/agente)")
    # 7. os logins: no máximo 20 (a DECISÃO da F7), o login com a troca conta 2
    lg = Logins(memoria=[])
    for i in range(10):
        lg.contar(f"teste {i}", 2)
    try:
        lg.contar("o 21º", 1)
        p.check(False, "[seco] o 21º login é recusado")
    except SystemExit:
        p.check(lg.feitos() == 20 and MAX_LOGINS == 20, "[seco] o teto de 20 logins (10 logins com a troca = 20) recusa o 21º")
    # 8. os casos e a ordem; o --casos roda só o necessário; o --seco não carrega a base da rede
    p.check(CASOS_ORDEM == ("C1", "C2", "C3", "C4", "C5", "C6", "C7"), "[seco] os 7 casos do contrato, na ordem")
    esperado = {"C1,C2,C3,C4,C5,C6,C7": ["C1C2", "C5", "C6", "C7"], "C2,C6": ["C1C2", "C6"], "C6": ["C1C2", "C6"], "C1": ["C1"],
                "C2": ["C1C2"], "C4": ["C1C2", "C4"], "C3,C5": ["C1C2", "C5"], "C7": ["C1C2", "C5", "C7"], "C6,C7": ["C1C2", "C5", "C6", "C7"]}
    erros_blocos = [k for k, v in esperado.items() if blocos_dos_casos(k.split(",")) != v]
    p.check(not erros_blocos, f"[seco] o --casos: o C1/C2 sempre; o C3–C5 só pedido ou com o C7; o C6 e o C7 só pedidos ({len(esperado)} combinações; erradas: {erros_blocos})")
    regras_login = (REPO / "supabase-principal" / "functions" / "_shared" / "login-regras.ts").read_text(encoding="utf-8")
    p.check("return /^http:\\/\\/localhost:(5173|8080)$/.test(origin);" in regras_login
            and "https:\\/\\/localhost|capacitor:\\/\\/localhost)$/.test(origin)" in regras_login,
            "[seco] as origens do C6 = as da função (login-regras.ts › origemPermitida: o dev local só :5173 e :8080)")
    p.check(origem_aceita("http://localhost:8080") and origem_aceita("http://localhost:5173/") and origem_aceita("https://physiqcalc-staging.vercel.app")
            and not origem_aceita("http://localhost:4323") and not origem_aceita("http://localhost:4173") and not origem_aceita("http://127.0.0.1:8080")
            and not origem_aceita("http://localhost:80801") and not origem_aceita(None),
            "[seco] o C6 recusa antes do login a origem que o CORS das funções barra (4323, 4173, 127.0.0.1) e aceita a :8080 e a :5173")
    p.check(_B is None and "_base_w27" not in sys.modules, "[seco] sem rede: a base da W27 (SQL, admin, login) nem foi carregada")
    p.check(claims("cab." + base64.urlsafe_b64encode(json.dumps({"aal": "aal2"}).encode()).decode().rstrip("=") + ".ass").get("aal") == "aal2"
            and claims("quebrado") == {}, "[seco] o aal sai do token do navegador")
    # 9. o preparar e o limpar DE VERDADE, com a base de mentira (nada de rede): o alvo é só o uid do w27-master
    f1, f2, s1 = "00000000-0000-4000-8000-0000000000f1", "00000000-0000-4000-8000-0000000000f2", "00000000-0000-4000-8000-0000000000e1"
    placar_falso = comum.Placar()
    falsa = BaseFalsa(falso, placar_falso, [{"id": f1, "status": "verified"}, {"id": f2, "status": "unverified"}])
    mem2: dict = {CHAVE: {"uid": falso, "master_dado": True, "em_andamento": True, "inicio": "2026-10-14T20:26:04-03:00", "fatores": [f1],
                          "sessoes": [s1], "janelas": []}}
    _B = falsa
    try:
        rodada = Rodada(Estado(memoria=mem2), Logins(memoria=[]))
        ok_limpar = limpar(rodada)  # a rodada que "caiu": 2 fatores (1 fora do Estado) e 1 sessão anotada
        chave_saiu = CHAVE not in mem2
        chamadas_limpar = list(falsa.chamadas)
        falsa.chamadas.clear()
        preparar(rodada)
        chamadas_preparar = list(falsa.chamadas)
    finally:
        _B = None
    tudo = "\n".join(chamadas_limpar + chamadas_preparar)
    outros = set(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", tudo)) - {falso, f1, f2, s1}
    p.check(ok_limpar and chave_saiu, "[seco] limpar (base de mentira): conferido por SQL e só então a chave hml22 saiu do Estado")
    p.check(sum(1 for x in chamadas_limpar if x.startswith("admin DELETE")) == 2 and not falsa.fatores,
            "[seco] limpar: apaga TODOS os fatores da conta (o do Estado e o que não estava nele)")
    p.check(all(falso in x for x in chamadas_limpar if x.startswith(("admin", "sql ", "sql_treino", "exec_treino"))) and not outros,
            "[seco] limpar: todo admin e todo SQL (principal e Treino) miram só o uid do w27-master (nenhum outro uid)")
    p.check("tirar_master w27-master" in chamadas_limpar and any("delete from auth.sessions" in x and s1 in x for x in chamadas_limpar),
            "[seco] limpar: tira o master e fecha a sessão anotada (só a do uid de teste)")
    p.check(sum(1 for x in chamadas_limpar if x.startswith("exec_treino delete from auth.sessions where user_id in (select treino_user_id ")
                and "created_at >= '2026-10-14T20:26:04-03:00'::timestamptz" in x) == 1
            and any(x.startswith("sql_treino select count(*) as n from auth.sessions") for x in chamadas_limpar),
            "[seco] limpar: fecha as sessões do Treino da conta de teste abertas desde o --preparar e confere a contagem")
    i_estado = next((i for i, x in enumerate(chamadas_preparar) if x.startswith("garantir_usuario")), -1)
    p.check(mem2.get(CHAVE, {}).get("master_dado") is True and chamadas_preparar.index("dar_master w27-master") > i_estado >= 0,
            "[seco] preparar: o Estado (uid e master dado) é gravado ANTES de dar o master")
    p.check(all(ok for ok, _t in placar_falso.itens), f"[seco] limpar e preparar sem falha na base de mentira ({len(placar_falso.itens)} conferências)")
    # revisão ⚪7: o --preparar limpa SEMPRE — sem Estado nenhum e com 1 fator que sobrou (o Estado se perdeu), o fator sai antes do master
    sobra = BaseFalsa(falso, comum.Placar(), [{"id": f1, "status": "verified"}])
    mem3: dict = {}
    _B = sobra
    try:
        preparar(Rodada(Estado(memoria=mem3), Logins(memoria=[])))
    finally:
        _B = None
    i_apaga = next((i for i, x in enumerate(sobra.chamadas) if x.startswith("admin DELETE") and f1 in x), -1)
    p.check(i_apaga >= 0 and not sobra.fatores and i_apaga < sobra.chamadas.index("dar_master w27-master") and mem3.get(CHAVE, {}).get("master_dado"),
            "[seco] preparar sem Estado: limpa antes (o fator que sobrou sai) e só depois dá o master")
    p.check(not any(x.startswith("exec_treino") for x in sobra.chamadas) and eh_inicio(mem3.get(CHAVE, {}).get("inicio")),
            "[seco] sem o início no Estado a limpeza não varre o Treino (não sabe desde quando); o --preparar grava o início")
    p.check(_B is None, "[seco] a base de mentira saiu (a de verdade nunca carregou)")
    return p.fim()


# ───────────────────────── main ─────────────────────────
def rodar(a) -> int:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    b = base()
    estado, logins = Estado(), Logins()
    r = Rodada(estado, logins)
    corte_vira_saida()
    pendente = estado.ler()
    if not pendente:
        raise SystemExit("hml-22: rode --preparar antes (o Estado hml22 não existe)")
    if pendente.get("em_andamento"):
        raise SystemExit("hml-22: há uma rodada anterior pendente (em_andamento) — rode --limpar (ou --preparar) antes")
    casos = [x.strip().upper() for x in a.casos.split(",") if x.strip()]
    for x in casos:
        if x not in CASOS_ORDEM:
            raise SystemExit(f"caso desconhecido: {x}")
    blocos = blocos_dos_casos(casos)
    if "C6" in blocos and a.base_app and not origem_aceita(a.base_app):
        # antes de qualquer login: noutra origem o CORS das funções barra a função conta e o C6 cai sem provar nada (F7, 1ª rodada)
        raise SystemExit("hml-22: o --base-app do C6 tem de estar numa origem que as funções aceitam (o dev local: http://localhost:8080 "
                         "ou :5173 — login-regras.ts › origemPermitida) — nada rodou")
    ctx = {"base": BASES.get(a.base, a.base).rstrip("/"), "prefixo": a.prefixo or a.base}
    uid = r.uid()
    pendente["em_andamento"] = True
    estado.gravar(pendente)
    t0 = time.time()
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=None if a.canal == "chromium" else a.canal, args=["--no-sandbox"])
            try:
                saude_ok("o C1/C2")
                caso_c1_c2(nav, r, ctx, uid, so_c1=(blocos[0] == "C1"))
                ate_c5 = next((x for x in blocos if x in ("C3", "C4", "C5")), None)
                if ate_c5:
                    saude_ok("o C3–C5")
                    caso_c3_c4_c5(nav, r, ctx, uid, ate_c5)
                if "C6" in blocos:
                    saude_ok("o C6")
                    caso_c6(nav, r, ctx, a.base_app)
                if "C7" in blocos:
                    saude_ok("o C7")
                    caso_c7(nav, r, ctx, uid)
            finally:
                nav.close()
    except Exception as e:  # noqa: BLE001
        b.p.check(False, f"exceção na rodada: {type(e).__name__}")
    finally:
        limpar(r)
    print(f"\nhml-22 · dois_fatores ({ctx['prefixo']}) · {time.time() - t0:.0f}s")
    return b.p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="E2E do 2FA do master (hml-22)")
    ap.add_argument("--seco", action="store_true", help="sem rede: as travas e o TOTP")
    ap.add_argument("--preparar", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--base", default="staging", help="staging | local | URL")
    ap.add_argument("--base-app", default=None, help="C6: a URL do JS do npm run build:apk servido local (http://localhost:8080 ou :5173)")
    ap.add_argument("--prefixo", default=None)
    ap.add_argument("--casos", default=",".join(CASOS_ORDEM))
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.limpar:
        corte_vira_saida()
        ok = limpar(Rodada(Estado(), Logins()))
        return base().p.fim() if ok else 1
    if a.preparar:
        corte_vira_saida()
        preparar(Rodada(Estado(), Logins()))
        return base().p.fim()
    return rodar(a)


if __name__ == "__main__":
    sys.exit(main())
