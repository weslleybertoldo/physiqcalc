#!/usr/bin/env python3
"""Physiq hml-15 (H-33) — E2E da CSP e dos cabeçalhos de segurança do site.

Cada tela abre com a CSP do vercel.json e as violações são juntadas por tela: o evento `securitypolicyviolation` da página e dos
pop-ups (um script de início em todo contexto, só na origem do Physiq: o iframe de terceiro tem a política dele), as mensagens do
console (CSP, Permissions-Policy, "Unrecognized feature" e o aviso do Mercado Pago) e, no local, os relatórios que o
e2e/hml15/servidor_dist.py grava em JSONL — o único jeito de ver o que acontece DENTRO dos workers e do service worker.
Passa com 0 violação fora das esperadas (e2e/hml15/csp_esperadas.json: diretiva + regex do bloqueado/amostra + o motivo);
qualquer outra = ❌, com print.

Reusa (sem copiar) do e2e/hml14/telas.py o carregar() (a base da hml-09 e a da W5), as BASES e a detecção de produção, a Rodada
(sessão da conta de TESTE, recusa conta que não é de teste, a porta do aceite), a Guarda (produção: aborta escrita) e o
conferir_build() (a faixa "Ambiente de teste" = build de staging); o Caso do e2e/w05/_base.py; o registro da rodada do
e2e/w02/_comum.py; e do e2e/hml12/telas.py o código do /c/ (conta_do_dono, codigo_de_teste_producao) e o /f/ de produção.

Bases: local (o servidor_dist.py com o build de STAGING, http://localhost:8080; outra porta: --base http://localhost:8091) ·
staging · prod (SÓ LEITURA: a Guarda do hml14 bloqueia escrita no navegador; sem --com-sw).
--modo relatorio|valendo: só diz o que esperar (quem manda é o cabeçalho; o grupo "cabecalhos" confere que é o do modo).
  relatorio  Content-Security-Policy-Report-Only: nada é barrado, toda violação é relatada
  valendo    Content-Security-Policy: as sondas negativas são barradas e as telas têm que funcionar (Turnstile, brick, PDF, 3D…)
--com-sw: todo contexto com o service worker ligado + o grupo "offline". --com-tela: o Edge com janela (o D4 dos Impressos).
--emular-host H (só local, só --so plano): o navegador acha que está no host H e o servidor local responde tudo. O antifraude do MP
  escolhe a variante e os hosts pelo domínio da página (localhost e o staging .app → www.mercadolivre.com; physiqcalc.com.br →
  www.mercadopago.com.br): é a prova local do que a produção carrega. Nada vai à produção (o build e o schema são os do staging).

Grupos (--so a,b; padrão: todos menos o offline, que entra com --com-sw):
  cabecalhos  os 5 cabeçalhos (e o X-Robots-Tag só no host do staging) em /, /treino, /sw.js, um worker de /assets e /health
  publicas    /entrar, /entrar/email (Turnstile), /c/<código> (Turnstile do cadastro), /f/<slug>, /d/<código> (foto → prévia
              blob:, sem enviar), /privacidade, /termos, /calculator, /boas-vindas
  painel      /painel, alunos, agenda, financeiro, dietas › diário, configurações › perfil
  impressos   /painel/impressos + Visualizar → pop-up blob: com o PDF (D4: com --com-tela, o print da aba diz se renderiza)
  plano       configurações › plano + Cartão → o brick do Mercado Pago (sandbox, sem pagar) e a prova do antifraude (nonce)
  clinico     prontuário › anexos + Ver → <iframe> do PDF (URL assinada do principal), avaliação, dietas › diário
  treino      /painel/treinos histórico · relatório · biblioteca + 1 exercício com 3D (o canvas pronto)
  master      /master e as 8 páginas (no staging o w27-master vira master SÓ no staging.profiles enquanto o grupo roda e volta
              ao papel de antes no fim, mesmo se falhar)
  aluno       (390 px) /, /treino, /dieta, /evolucao, /perfil, /perfil/pagamentos, /perfil/conta
  sondas      numa página logada: data:, blob:, worker blob:, WASM, eval e new Function num worker (P1), script com o nonce
              (permitidos); script inline, onerror= e javascript: (barrados); <embed> de PDF blob: (D4, informativa); fetch de
              host fora da lista dentro de um worker (local: o coletor vê o worker)
  offline     (--com-sw) o SW instala, e a 2ª abertura do / e do /treino é SEM rede
Contas (TESTE; troca com --contas grupo=chave): local/staging w5-dono (painel, impressos, plano, sondas), a nutri do aluno com o
anexo em PDF (clinico; o banco diz qual, só leitura), w13-dono (treino), w27-master (master), w13-aluno (aluno); produção
nutri-legado, master (admin.teste) e aluno-calc.

Uso: python3 e2e/hml15/csp.py --base local --canal msedge --modo relatorio
     python3 e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-tela --so impressos
     python3 e2e/hml15/csp.py --base local --canal msedge --modo valendo --com-sw
     python3 e2e/hml15/csp.py --base local --canal msedge --modo valendo --so plano --emular-host physiqcalc.com.br
     python3 e2e/hml15/csp.py --base staging --canal msedge --modo relatorio
Saída: ~/projetos/physiqcalc-scratch/hml/hml15/csp_<base>_<modo>[_sw|_tela|_so-…].txt (+ .json com cada violação e as origens
contatadas por grupo) · prints em ~/projetos/physiqcalc-scratch/prints/hml15/ · a rodada no ~/projetos/physiqcalc-scratch/e2e-rodadas.tsv.
Nada no /tmp.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from dataclasses import dataclass, field
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(REPO / "e2e" / "hml14"))
import telas as T  # noqa: E402 — carregar(), BASES, Rodada, Guarda, conferir_build() (nada lê banco nem credencial ao importar)

SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml15"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml15"
JSONL = SAIDA / "csp_relatorios_local.jsonl"
ESPERADAS = AQUI / "csp_esperadas.json"
MANIFESTO_3D = REPO / "src" / "lib" / "exercicios3dManifest.json"
MP_INIT = REPO / "src" / "components" / "pagamentos" / "mpInit.ts"
VERCEL = REPO / "vercel.json"
HOST_STAGING = "physiqcalc-staging.vercel.app"
CSP_RO, CSP_VALE = "content-security-policy-report-only", "content-security-policy"
GRUPOS = ("cabecalhos", "publicas", "painel", "impressos", "plano", "clinico", "treino", "master", "aluno", "sondas", "offline")
CONTAS_TESTE = {"painel": "w5-dono", "impressos": "w5-dono", "plano": "w5-dono", "sondas": "w5-dono", "treino": "w13-dono",
                "master": "w27-master", "aluno": "w13-aluno"}
CONTAS_PROD = {"painel": "nutri-legado", "impressos": "nutri-legado", "plano": "nutri-legado", "sondas": "nutri-legado",
               "treino": "master", "master": "master", "aluno": "aluno-calc"}
# o Edge do notebook sem GPU: o 3D (WebGL) pelo SwiftShader, como o scripts/exercicios3d/foto.py
ARGS_NAVEGADOR = ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
CONSOLE_CSP = re.compile(r"Content.Security.Policy|Refused to|Permissions-Policy|Unrecognized feature", re.I)
CONSOLE_PP = re.compile(r"Permissions-Policy|Unrecognized feature", re.I)
CONSOLE_MP = re.compile(r"MercadoPago|DeviceProfile", re.I)

# o coletor: vale para a página, os pop-ups e os iframes (só conta o que é da origem do Physiq — o iframe de terceiro tem a política
# dele). Cada violação vai na hora para o Python (__cspAviso) e fica também em window.__csp (lida no fim da tela; o id evita repetir).
COLETOR = r"""(() => {
  if (window.__cspColetor) return;
  window.__cspColetor = true;
  window.__csp = [];
  const ORIGEM = %s;
  document.addEventListener("securitypolicyviolation", (e) => {
    if (location.origin !== ORIGEM) return;
    const v = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9), diretiva: e.effectiveDirective,
      bloqueado: e.blockedURI, origem: e.sourceFile, linha: e.lineNumber, amostra: (e.sample || "").slice(0, 80),
      disposicao: e.disposition, rota: location.pathname, documento: location.href.slice(0, 160) };
    window.__csp.push(v);
    try { if (typeof window.__cspAviso === "function") window.__cspAviso(v); } catch (x) { /* a página fechando */ }
  }, true);
})();"""

# as sondas (§4.4): (nome, JS, argumento, resultado esperado no modo relatorio, no modo valendo, a regra esperada que TEM que aparecer)
# resultado None = informativa (só registra). As negativas, no modo relatorio, RODAM (Report-Only não barra) e relatam.
_ESPERA = "await new Promise((r) => setTimeout(r, %d));"
SONDAS = (
    ("data", "async () => (await (await fetch('data:text/plain,ok')).text()) === 'ok'", None, True, True, None),
    ("blob", "async () => (await (await fetch(URL.createObjectURL(new Blob(['ok'])))).text()) === 'ok'", None, True, True, None),
    ("worker", """async () => await new Promise((ok) => { try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'],
        { type: 'text/javascript' }))); w.onmessage = (e) => { ok(e.data === 1); w.terminate(); }; w.onerror = (e) => ok('erro: ' +
        (e.message || 'worker')); setTimeout(() => ok('tempo'), 5000); } catch (e) { ok('erro: ' + e.message); } })""", None, True, True, None),
    ("wasm", """async () => { try { await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return true; }
        catch (e) { return 'erro: ' + e.message; } }""", None, True, True, None),
    ("eval", "() => { try { return eval('1 + 1') === 2; } catch (e) { return 'erro: ' + e.message; } }", None, True, True, None),
    ("worker_function", """async () => await new Promise((ok) => { const w = new Worker(URL.createObjectURL(new Blob([
        "try { postMessage(new Function('return 2')()); } catch (e) { postMessage('erro: ' + e.message); }"], { type: 'text/javascript' })));
        w.onmessage = (e) => { ok(e.data === 2 ? true : e.data); w.terminate(); }; w.onerror = (e) => ok('erro: ' + (e.message || 'worker'));
        setTimeout(() => ok('tempo'), 5000); })""", None, True, True, None),
    ("nonce", "async (n) => { const s = document.createElement('script'); s.nonce = n; s.textContent = 'window.__sondaNonce = 1'; "
              "document.head.appendChild(s); " + _ESPERA % 300 + " s.remove(); return window.__sondaNonce === 1; }", "NONCE", True, True, None),
    ("inline", "async () => { const s = document.createElement('script'); s.textContent = 'window.__sondaInline = 1'; "
               "document.head.appendChild(s); " + _ESPERA % 300 + " s.remove(); return window.__sondaInline === 1; }", None, True, False,
     "sonda-inline"),
    ("atributo", "async () => { const d = document.createElement('div'); d.innerHTML = '<img src=\"data:,\" "
                 "onerror=\"window.__sondaAtributo=1\">'; document.body.appendChild(d); " + _ESPERA % 600 +
     " d.remove(); return window.__sondaAtributo === 1; }", None, True, False, "sonda-atributo"),
    ("javascript", "async () => { const a = document.createElement('a'); a.href = 'javascript:void(window.__sondaJs=1)'; "
                   "document.body.appendChild(a); a.click(); " + _ESPERA % 600 + " a.remove(); return window.__sondaJs === 1; }",
     None, True, False, "sonda-javascript"),
    ("embed", "async () => { const e = document.createElement('embed'); e.type = 'application/pdf'; e.style.cssText = "
              "'width:20px;height:20px'; e.src = URL.createObjectURL(new Blob(['%PDF-1.1\\n%%EOF\\n'], { type: 'application/pdf' })); "
              "document.body.appendChild(e); " + _ESPERA % 1500 + " e.remove(); return true; }", None, None, None, None),
    ("worker_connect", """async () => await new Promise((ok) => { const w = new Worker(URL.createObjectURL(new Blob([
        "fetch('https://csp-sonda.invalid/x').then(() => postMessage('foi'), (e) => postMessage('erro: ' + e.message));"],
        { type: 'text/javascript' }))); w.onmessage = (e) => { ok(e.data); w.terminate(); }; setTimeout(() => ok('tempo'), 8000); })""",
     None, None, None, "sonda-worker"),
)


# ───────────────────────── o coletor de violações ─────────────────────────
@dataclass
class Violacao:
    fonte: str          # pagina (evento) | coletor (JSONL do servidor local)
    tela: str
    diretiva: str
    bloqueado: str
    origem: str = ""
    linha: object = None
    amostra: str = ""
    disposicao: str = ""
    documento: str = ""
    esperada: str | None = None

    def texto(self) -> str:
        partes = [f"{self.diretiva or '?'} ← {self.bloqueado or '-'}"]
        if self.origem:
            partes.append(f"de {self.origem[-80:]}:{self.linha}")
        if self.amostra:
            partes.append(f"amostra {self.amostra[:60]!r}")
        if self.documento:
            partes.append(f"doc {self.documento[-70:]}")
        return " · ".join(partes) + f" [{self.fonte}{', ' + self.disposicao if self.disposicao else ''}]"


def relatorios_do_corpo(corpo) -> list[dict]:
    """O corpo de um POST /__csp → as violações (application/csp-report: {"csp-report": {...}}; application/reports+json: [{type,
    body}])."""
    saida: list[dict] = []
    if isinstance(corpo, dict) and isinstance(corpo.get("csp-report"), dict):
        r = corpo["csp-report"]
        saida.append({"diretiva": r.get("effective-directive") or (r.get("violated-directive") or "").split(" ")[0],
                      "bloqueado": r.get("blocked-uri") or "", "origem": r.get("source-file") or "", "linha": r.get("line-number"),
                      "amostra": r.get("script-sample") or "", "disposicao": r.get("disposition") or "", "documento": r.get("document-uri") or ""})
    elif isinstance(corpo, list):
        for item in corpo:
            b = (item or {}).get("body") or {}
            if (item or {}).get("type") != "csp-violation":
                continue
            saida.append({"diretiva": b.get("effectiveDirective") or "", "bloqueado": b.get("blockedURL") or "", "origem": b.get("sourceFile") or "",
                          "linha": b.get("lineNumber"), "amostra": b.get("sample") or "", "disposicao": b.get("disposition") or "",
                          "documento": b.get("documentURL") or ""})
    return saida


class Coletor:
    def __init__(self, origem: str, regras: list[dict], jsonl: Path | None) -> None:
        self.origem, self.regras, self.jsonl = origem, regras, jsonl
        self.pos = jsonl.stat().st_size if jsonl and jsonl.exists() else 0
        self.tela = "(início)"
        self.violacoes: list[Violacao] = []
        self.vistos: set[str] = set()
        self.console: list[dict] = []
        self.mp_console: list[str] = []
        self.pp_erros: list[str] = []
        self.origens: dict[str, set[str]] = {}
        self.grupo = "(início)"
        self.paginas: list = []

    # ── no contexto novo (NavCsp) ──
    def instalar(self, ctx) -> None:
        ctx.add_init_script(COLETOR % json.dumps(self.origem))
        ctx.expose_binding("__cspAviso", lambda _fonte, v: self.da_pagina(v))
        ctx.on("page", self.nova_pagina)
        ctx.on("request", self._pedido)

    def nova_pagina(self, pg) -> None:
        if any(p is pg for p in self.paginas):
            return
        self.paginas.append(pg)
        pg.on("console", self._console)

    def _pedido(self, req) -> None:
        try:
            u = urllib.parse.urlparse(req.url)
            if u.scheme in ("http", "https", "ws", "wss") and f"{u.scheme}://{u.netloc}" != self.origem:
                self.origens.setdefault(self.grupo, set()).add(f"{req.resource_type} {u.scheme}://{u.netloc}")
        except Exception:  # noqa: BLE001 — pedido de página fechando
            pass

    def _console(self, m) -> None:
        try:
            texto, tipo, local = m.text, m.type, (m.location or {}).get("url", "")
        except Exception:  # noqa: BLE001
            return
        if CONSOLE_MP.search(texto):
            self.mp_console.append(f"{self.tela}: {tipo}: {texto[:300]}")
        if not CONSOLE_CSP.search(texto):
            return
        self.console.append({"tela": self.tela, "tipo": tipo, "texto": texto[:500], "local": local[:160]})
        # erro do Permissions-Policy do NOSSO cabeçalho (o local é o documento do Physiq ou vazio); o de iframe de terceiro não conta
        if CONSOLE_PP.search(texto) and (not local or local.startswith(self.origem) or local.startswith("blob:" + self.origem)):
            self.pp_erros.append(f"{self.tela}: {texto[:300]}")

    # ── as violações ──
    def classificar(self, v: Violacao) -> str | None:
        for r in self.regras:
            campos = [(k, getattr(v, k)) for k in ("diretiva", "bloqueado", "amostra", "origem", "documento") if r.get(k)]
            if campos and all(re.search(r[k], str(valor or "")) for k, valor in campos):
                return r["id"]
        return None

    def juntar(self, v: Violacao) -> None:
        v.esperada = self.classificar(v)
        self.violacoes.append(v)
        marca = f"esperada: {v.esperada}" if v.esperada else "INESPERADA"
        print(f"   ⚠️ violação [{v.tela}] {v.texto()} — {marca}", flush=True)

    def da_pagina(self, v) -> None:
        if not isinstance(v, dict) or not v.get("id") or v["id"] in self.vistos:
            return
        self.vistos.add(v["id"])
        self.juntar(Violacao("pagina", self.tela, str(v.get("diretiva") or ""), str(v.get("bloqueado") or ""), str(v.get("origem") or ""),
                             v.get("linha"), str(v.get("amostra") or ""), str(v.get("disposicao") or ""), str(v.get("documento") or "")))

    def ler_paginas(self) -> None:
        """O que ficou em window.__csp (se o aviso imediato não chegou): de cada página aberta, sem repetir."""
        for pg in list(self.paginas):
            try:
                if pg.is_closed():
                    continue
                for v in pg.evaluate("() => (window.__csp || []).splice(0)") or []:
                    self.da_pagina(v)
            except Exception:  # noqa: BLE001 — navegando ou fechando
                pass

    def ler_jsonl(self) -> int:
        """As linhas novas do JSONL do servidor local (só as completas)."""
        if not self.jsonl or not self.jsonl.exists():
            return 0
        with self.jsonl.open("rb") as f:
            f.seek(self.pos)
            bruto = f.read()
        fim = bruto.rfind(b"\n")
        if fim < 0:
            return 0
        self.pos += fim + 1
        n = 0
        for linha in bruto[:fim].decode("utf-8", "replace").splitlines():
            try:
                reg = json.loads(linha)
            except ValueError:
                continue
            for r in relatorios_do_corpo(reg.get("corpo")):
                self.juntar(Violacao("coletor", self.tela, str(r["diretiva"]), str(r["bloqueado"]), str(r["origem"]), r["linha"],
                                     str(r["amostra"])[:80], str(r["disposicao"]), str(r["documento"])))
                n += 1
        return n

    def da_tela(self, nome: str) -> list[Violacao]:
        return [v for v in self.violacoes if v.tela == nome]


class NavCsp:
    """O navegador com o coletor em todo contexto novo (o Caso do w05 abre o contexto com nav.new_context). Com --com-sw, o
    service worker ligado (o Caso abre com service_workers="block")."""

    def __init__(self, nav, col: Coletor, com_sw: bool) -> None:
        self._nav, self._col, self._com_sw = nav, col, com_sw

    def new_context(self, **kw):
        if self._com_sw:
            kw["service_workers"] = "allow"
        ctx = self._nav.new_context(**kw)
        self._col.instalar(ctx)
        return ctx

    def __getattr__(self, nome: str):
        return getattr(self._nav, nome)


# ───────────────────────── a rodada ─────────────────────────
@dataclass
class Ex:
    o: object
    R: object
    col: Coletor
    a: argparse.Namespace
    local: bool
    producao: bool
    contas: dict
    nonce: str
    H12: object
    resumo: list = field(default_factory=list)
    evidencias: dict = field(default_factory=dict)
    avisos: list = field(default_factory=list)


EX: Ex | None = None


def ex() -> Ex:
    assert EX is not None
    return EX


def aviso(texto: str) -> None:
    ex().avisos.append(texto)
    ex().o.linha("⚠️ " + texto)


def assentar(caso, rede: float = 12) -> None:
    """A rede assenta (networkidle, até `rede` s) e mais um pouco para o que carrega depois (lazy, workers)."""
    try:
        caso.pg.wait_for_load_state("networkidle", timeout=rede * 1000)
    except Exception:  # noqa: BLE001 — SPA com pedido aberto: segue
        pass
    caso.pg.wait_for_timeout(1200)


def novo_caso(nav, nome: str, desktop: bool = True):
    caso, _ = ex().R.novo_caso(nav, nome, desktop=desktop)
    ex().col.nova_pagina(caso.pg)
    return caso


def abrir(caso, nome: str, rota: str, pronto: str | None = None, tempo: float = 60, conta: str | None = None) -> bool:
    """Começa a tela `nome`: a rota (com a sessão da conta de TESTE, se `conta`), espera o `pronto` e a rede assentar."""
    E = ex()
    E.col.tela = nome
    try:
        if conta:
            E.R.entrar(caso, rota, conta)
        else:
            caso.ir(rota)
        ok = caso.esperar(lambda: caso.tem(pronto), tempo) if pronto else True
        assentar(caso)
        return ok
    except Exception as e:  # noqa: BLE001
        E.o.linha(f"   [{nome}] {type(e).__name__}: {str(e)[:240]}")
        return False


def fechar(caso, nome: str, abriu: bool, detalhe: str = "", print_: bool = True, pg=None) -> None:
    """Fim da tela: lê o que sobrou (páginas e JSONL), o print e o placar dela (abriu? violações esperadas e inesperadas)."""
    E = ex()
    alvo = pg or caso.pg
    try:
        alvo.wait_for_timeout(1500)  # o relatório do worker chega depois do evento
    except Exception:  # noqa: BLE001
        time.sleep(1.5)
    E.col.ler_paginas()
    E.col.ler_jsonl()
    arq = ""
    if print_:
        try:
            if pg is None:
                arq = caso.print(nome)
            else:
                PRINTS.mkdir(parents=True, exist_ok=True)
                arq = str(PRINTS / f"{E.R.prefixo}_{nome}.png")
                pg.screenshot(path=arq)
        except Exception as e:  # noqa: BLE001
            arq = f"(sem print: {type(e).__name__})"
    vs = E.col.da_tela(nome)
    esperadas = [v for v in vs if v.esperada]
    inesperadas = [v for v in vs if not v.esperada]
    E.resumo.append({"tela": nome, "abriu": abriu, "pagina": sum(1 for v in vs if v.fonte == "pagina"),
                     "coletor": sum(1 for v in vs if v.fonte == "coletor"), "esperadas": len(esperadas), "inesperadas": len(inesperadas)})
    E.o.ok(abriu, f"[{nome}] a tela abriu{(' — ' + detalhe) if detalhe else ''}")
    E.o.ok(not inesperadas, f"[{nome}] 0 violação inesperada ({len(vs)} no total: {len(esperadas)} esperada(s)"
                            f"{'; ' + ', '.join(sorted({v.esperada for v in esperadas})) if esperadas else ''})")
    for v in inesperadas[:8]:
        E.o.linha(f"      ✗ {v.texto()}")
    if arq:
        E.o.linha(f"   print: {arq}")
    if (not abriu or inesperadas) and pg is None:
        caso.diagnostico()


def esperar_frame(caso, prefixo: str, tempo: float) -> bool:
    return caso.esperar(lambda: any(f.url.startswith(prefixo) for f in caso.pg.frames), tempo)


def png_minimo(largura: int = 64, altura: int = 48) -> bytes:
    """Uma foto PNG pequena (gerada aqui: nada do disco) para a prévia blob: do diário público."""
    def bloco(tipo: bytes, corpo: bytes) -> bytes:
        return struct.pack(">I", len(corpo)) + tipo + corpo + struct.pack(">I", zlib.crc32(tipo + corpo) & 0xFFFFFFFF)
    linha = b"\x00" + bytes((139, 92, 246)) * largura
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(linha * altura)) + bloco(b"IEND", b""))


def schema() -> str:
    return "public" if ex().producao else "staging"


def ler(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no banco principal (read_only da Management API)."""
    E = ex()
    return E.R.C.ler(E.R.C.PRINCIPAL_REF, sql)


def chave_da_conta(email: str) -> str | None:
    e = (email or "").lower()
    return next((k for k, (em, _) in ex().R.B5.CONTAS.items() if em.lower() == e), None)


# ───────────────────────── grupo: cabeçalhos ─────────────────────────
def pedir(url: str, host: str | None = None) -> tuple[int, dict, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "physiq-hml15/csp", **({"Host": host} if host else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(400_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, ""


def politica_do_repo() -> dict[str, str]:
    regra = next(r for r in json.loads(VERCEL.read_text(encoding="utf-8"))["headers"] if r["source"] == "/(.*)" and not r.get("has"))
    return {h["key"].lower(): h["value"] for h in regra["headers"]}


def g_cabecalhos() -> None:
    E = ex()
    o, base, modo = E.o, E.R.base, E.a.modo
    host = urllib.parse.urlparse(base).hostname or ""
    repo = politica_do_repo()
    csp_repo = repo.get(CSP_RO) or repo.get(CSP_VALE) or ""
    _, _, sw = pedir(base + "/sw.js")
    m = re.search(r"assets/[^\"'\s]*[wW]orker[^\"'\s]*\.js", sw)
    caminhos = ["/", "/treino", "/sw.js"] + (["/" + m.group(0)] if m else []) + ["/health"]
    if not m:
        o.ok(False, "[cabeçalhos] um worker do PowerSync no precache do /sw.js (assets/*worker*.js)")
    for c in caminhos:
        st, h, _ = pedir(base + c)
        chave, outra = (CSP_RO, CSP_VALE) if modo == "relatorio" else (CSP_VALE, CSP_RO)
        valor = re.sub(r";\s*report-uri /__csp$", "", h.get(chave, ""))  # o report-uri é só do servidor local
        robots = h.get("x-robots-tag")
        o.ok(st == 200 and valor == csp_repo and outra not in h,
             f"[cabeçalhos] {c}: {st} · {chave} = a do vercel.json ({'igual' if valor == csp_repo else 'DIFERENTE' if valor else 'FALTA'})"
             f"{' · a outra chave também veio' if outra in h else ''}")
        faltam = [k for k, v in (("x-content-type-options", "nosniff"), ("x-frame-options", "DENY"),
                                 ("referrer-policy", "strict-origin-when-cross-origin"),
                                 ("permissions-policy", repo.get("permissions-policy"))) if h.get(k) != v]
        o.ok(not faltam, f"[cabeçalhos] {c}: nosniff, X-Frame-Options DENY, Referrer-Policy e Permissions-Policy" + (f" — falta/diferente: {faltam}" if faltam else ""))
        if host == HOST_STAGING:
            o.ok(robots == "noindex, nofollow", f"[cabeçalhos] {c}: X-Robots-Tag no staging ({robots!r})")
        else:
            o.ok(robots is None, f"[cabeçalhos] {c}: sem X-Robots-Tag fora do host do staging ({robots!r})")
        tipo = h.get("content-type", "")
        if c.endswith(".js"):
            o.ok("javascript" in tipo, f"[cabeçalhos] {c}: Content-Type de JS com o nosniff ({tipo})")
    if E.local:  # o `has` de host do servidor local (o mesmo do vercel.json): pedindo como o host do staging, o X-Robots-Tag vem
        _, h, _ = pedir(base + "/", HOST_STAGING)
        o.ok(h.get("x-robots-tag") == "noindex, nofollow", f"[cabeçalhos] local com Host {HOST_STAGING}: X-Robots-Tag ({h.get('x-robots-tag')!r})")


# ───────────────────────── grupo: públicas ─────────────────────────
def g_publicas(o, nav, R) -> None:
    E = ex()
    caso = novo_caso(nav, "publicas")
    try:
        E.col.grupo = "publicas"
        ab = abrir(caso, "publicas_entrar", "/entrar", "[data-entrar-google], [data-entrada-staging]")
        fechar(caso, "publicas_entrar", ab)
        ab = abrir(caso, "publicas_entrar_email", "/entrar/email")
        ts = esperar_frame(caso, "https://challenges.cloudflare.com", 45)
        fechar(caso, "publicas_entrar_email", ab and ts, f"o iframe do Turnstile ({'carregou' if ts else 'NÃO carregou'})")
        codigo = None
        try:
            if E.producao:
                codigo = E.H12.codigo_de_teste_producao()
            else:
                dono = E.H12.conta_do_dono()
                codigo = dono[2] if dono else None
        except Exception as e:  # noqa: BLE001
            o.linha(f"   (o código do /c/: {type(e).__name__}: {str(e)[:160]})")
        if o.ok(bool(codigo), "o código do /c/ da conta de teste (w5-dono no staging; nutri.teste em produção), só leitura"):
            ab = abrir(caso, "publicas_cadastro", f"/c/{urllib.parse.quote(codigo)}", "[data-form-cadastro-publico]")
            ts = esperar_frame(caso, "https://challenges.cloudflare.com", 45)
            detalhe = f"o formulário e o iframe do Turnstile do cadastro ({'carregou' if ts else 'NÃO carregou'}), sem enviar"
            if ab and not ts:
                # o useCaptcha monta o widget só se a caixa já existir quando o script carrega; no /c/ a caixa só aparece depois do
                # pedido do formulário (src/nucleo/captcha.ts + src/publico/Cadastro.tsx). Script carregado (window.turnstile) e a
                # caixa parada em "carregando" = a corrida do app, não a CSP (a CSP do Turnstile está provada no /entrar/email)
                st = caso.pg.evaluate("() => { const c = document.querySelector('[data-captcha]'); "
                                      "return { caixa: c ? c.getAttribute('data-captcha') : null, api: typeof window.turnstile }; }")
                if st.get("api") == "object" and st.get("caixa") == "carregando":
                    ts = True
                    detalhe = ("o formulário abriu e o script do Turnstile carregou e rodou (window.turnstile), mas o widget não montou: a "
                               "caixa do captcha ainda não existia quando o script ficou pronto (a corrida do app, fora da CSP)")
                    aviso("[publicas_cadastro] o /c/ não montou o widget do Turnstile: o useCaptcha só monta se a caixa já existir quando o "
                          "script carrega, e no /c/ ela aparece depois do pedido do formulário (corrida do app; fora da CSP)")
                else:
                    detalhe += f" — estado {st}"
            fechar(caso, "publicas_cadastro", ab and ts, detalhe)
        slug = None
        try:
            slug = E.H12.slug_de_teste_producao() if E.producao else slug_de_teste_staging()
        except Exception as e:  # noqa: BLE001
            o.linha(f"   (o slug do /f/: {type(e).__name__}: {str(e)[:160]})")
        if not slug:
            aviso("o /f/ sem formulário ativo de conta de teste: a tela 'formulário não encontrado' (a mesma casca pública)")
        ab = abrir(caso, "publicas_formulario", f"/f/{slug or 'hml15-nao-existe'}",
                   "[data-form-publico]" if slug else "[data-formulario-nao-encontrado], [data-pagina-formulario-publico]")
        fechar(caso, "publicas_formulario", ab)
        g_diario_publico(caso)
        for nome, rota, pronto in (("publicas_privacidade", "/privacidade", "[data-pagina-legal], h1"), ("publicas_termos", "/termos", "[data-pagina-legal], h1"),
                                   ("publicas_calculadora", "/calculator", "[data-pagina-calculadora-publica]"),
                                   ("publicas_boas_vindas", "/boas-vindas", None)):
            ab = abrir(caso, nome, rota, pronto)
            fechar(caso, nome, ab, caso.caminho())
    finally:
        caso.fim()


def slug_de_teste_staging() -> str | None:
    r = ler("""select f.slug from staging.formularios_preconsulta f join auth.users u on u.id = f.nutricionista_id
                where f.ativo and f.deleted_at is null and lower(u.email) like '%.teste.claude@physiqnutri.app' limit 1""")
    return r[0]["slug"] if r else None


def g_diario_publico(caso) -> None:
    E = ex()
    codigo = None
    if not E.producao:
        r = ler("""select p.link_codigo as c from staging.pacientes p join auth.users u on u.id = p.nutricionista_id
                    where p.deleted_at is null and p.link_codigo is not null and lower(u.email) like '%.teste.claude@physiqnutri.app'
                    order by (lower(u.email) like 'w13.%') desc limit 1""")
        codigo = r[0]["c"] if r else None
    if not codigo:
        aviso("o /d/ sem código de aluno de teste (produção: só o 'não encontrado', sem foto)")
    nome = "publicas_diario"
    ab = abrir(caso, nome, f"/d/{codigo or 'naoexiste99'}", "[data-pagina-diario-publico]")
    detalhe = caso.caminho()
    if codigo and ab:
        form = caso.esperar(lambda: caso.tem("[data-form-diario]"), 30)
        previa = False
        if form:
            caso.pg.set_input_files("[data-campo-foto]", files=[{"name": "foto-hml15.png", "mimeType": "image/png", "buffer": png_minimo()}])
            previa = caso.esperar(lambda: caso.pg.locator("[data-previa-foto] img[src^='blob:']").count() > 0, 20)
        detalhe = f"o formulário {'abriu' if form else 'NÃO abriu'}; a foto escolhida → prévia blob: {'na tela' if previa else 'NÃO apareceu'} (sem enviar)"
        ab = ab and form and previa
    fechar(caso, nome, ab, detalhe)


# ───────────────────────── grupos do profissional ─────────────────────────
def g_painel(o, nav, R) -> None:
    E = ex()
    conta = E.contas["painel"]
    caso = novo_caso(nav, "painel")
    try:
        E.col.grupo = "painel"
        telas = (("painel_inicio", "/painel", "[data-menu-lateral]"), ("painel_alunos", "/painel/alunos", "[data-menu-lateral]"),
                 ("painel_agenda", "/painel/agenda", "[data-menu-lateral]"), ("painel_financeiro", "/painel/financeiro", "[data-menu-lateral]"),
                 ("painel_dietas_diario", "/painel/dietas?aba=diario", "[data-menu-lateral]"),
                 ("painel_perfil", "/painel/configuracoes/perfil", "[data-menu-lateral]"))
        for i, (nome, rota, pronto) in enumerate(telas):
            ab = abrir(caso, nome, rota, pronto, conta=conta if i == 0 else None)
            fechar(caso, nome, ab, f"{conta} · {caso.caminho()}")
    finally:
        caso.fim()


def g_impressos(o, nav, R) -> None:
    E = ex()
    conta = E.contas["impressos"]
    caso = novo_caso(nav, "impressos")
    try:
        E.col.grupo = "impressos"
        ab = abrir(caso, "impressos", "/painel/impressos", "[data-lista-impressos] [data-btn-visualizar]", conta=conta)
        fechar(caso, "impressos", ab, conta)
        if not ab:
            return
        nome = "impressos_pdf"
        E.col.tela = nome
        popup = None
        try:
            with caso.ctx.expect_page(timeout=30000) as info:
                caso.pg.locator("[data-lista-impressos] [data-btn-visualizar]").first.click()
            popup = info.value
            E.col.nova_pagina(popup)
            try:
                popup.wait_for_load_state("load", timeout=30000)
            except Exception:  # noqa: BLE001 — o visualizador de PDF não dispara o load em todo canal
                pass
            popup.wait_for_timeout(4000)
        except Exception as e:  # noqa: BLE001
            o.linha(f"   [{nome}] o pop-up não abriu: {type(e).__name__}: {str(e)[:200]}")
        if popup is None:
            fechar(caso, nome, False, "o pop-up com o PDF não abriu (o app cai no download quando o pop-up é bloqueado)")
            return
        info_pdf = {}
        try:
            info_pdf = popup.evaluate("""() => ({ tipo: document.contentType, embed: (document.querySelector('embed') || {}).type || null,
                                          texto: (document.body && document.body.innerText || '').slice(0, 80) })""")
        except Exception as e:  # noqa: BLE001
            info_pdf = {"erro": f"{type(e).__name__}: {str(e)[:120]}"}
        url = popup.url
        bloqueio = [c for c in E.col.console if c["tela"] == nome and re.search(r"plugin|object-src", c["texto"], re.I)]
        objeto = [v for v in E.col.da_tela(nome) if v.diretiva == "object-src"]
        E.evidencias["d4"] = {"url": url[:60], "documento": info_pdf, "console_plugin": [c["texto"][:200] for c in bloqueio],
                              "violacoes_object_src": [v.texto() for v in objeto], "com_tela": E.a.com_tela}
        o.linha(f"   D4: pop-up {url[:50]} · documento {info_pdf} · object-src: {len(objeto)} violação(ões) · console 'plugin': {len(bloqueio)}"
                + ("" if E.a.com_tela else " (sem tela: o visualizador de PDF do modo sem janela não decide o D4)"))
        fechar(caso, nome, url.startswith("blob:"), f"pop-up {url[:40]}… (D4: confira o print da aba)", pg=popup)
        try:
            popup.close()
        except Exception:  # noqa: BLE001
            pass
    finally:
        caso.fim()


CARTAO_TESTE = "5031433215406351"  # Mastercard de TESTE do Mercado Pago (o mesmo do e2e/w04): só digitado, nunca enviado


def g_plano(o, nav, R) -> None:
    """O brick do Mercado Pago (Card Payment, sandbox no staging) e a prova do antifraude ("device profile") com o nonce.
    Com --emular-host (só no local): a MESMA tela servida pelo servidor local, mas com o navegador achando que está no host dado
    (ex.: physiqcalc.com.br) — o widget do antifraude escolhe para onde manda os pixels pelo domínio da página (o TLD .br →
    www.mercadopago.com.br), e o local (localhost) e o staging (.app) não mostram isso. Nada vai para a produção: todo pedido ao
    host emulado é respondido pelo servidor local (o build de staging, o schema staging)."""
    E = ex()
    conta = E.contas["plano"]
    emulado = E.a.emular_host
    base_real, origem_real = E.R.base, E.col.origem
    if emulado:
        E.R.base = E.col.origem = f"https://{emulado}"
    try:
        _g_plano(o, nav, R, conta, emulado, base_real)
    finally:
        E.R.base, E.col.origem = base_real, origem_real


def proxy_local(base_local: str):
    """Responde os pedidos ao host emulado com o servidor local (mesmo caminho, mesmo método e corpo; os cabeçalhos do vercel.json)."""
    def rota(route, request) -> None:
        u = urllib.parse.urlsplit(request.url)
        try:
            route.fulfill(response=route.fetch(url=base_local + u.path + (f"?{u.query}" if u.query else ""), max_redirects=0))
        except Exception:  # noqa: BLE001 — página fechando
            try:
                route.abort()
            except Exception:  # noqa: BLE001
                pass
    return rota


def digitar_cartao(caso) -> str:
    """Só o número do cartão de TESTE no campo seguro do brick (o brick consulta o BIN e mostra a bandeira); nada é enviado."""
    for sel in ("[data-brick-mp] iframe[name*='cardNumber']", "[data-brick-mp] iframe"):
        if caso.pg.locator(sel).count():
            campo = caso.pg.frame_locator(sel).first.locator("input").first
            try:
                campo.click(timeout=15000)
                campo.press_sequentially(CARTAO_TESTE, delay=60)
                return f"o número de teste digitado no campo seguro ({sel})"
            except Exception as e:  # noqa: BLE001
                return f"não deu para digitar no campo seguro: {type(e).__name__}: {str(e)[:120]}"
    return "sem o campo seguro do número"


def _g_plano(o, nav, R, conta: str, emulado: str | None, base_local: str) -> None:
    E = ex()
    caso = novo_caso(nav, "plano")
    if emulado:
        caso.ctx.route(f"https://{emulado}/**", proxy_local(base_local))
    widget: dict = {}
    bins: list[str] = []

    def resposta(r) -> None:
        if "/devices/widgets" in r.url and r.request.method == "POST":
            try:
                widget.update(status=r.status, url=r.url.split("?")[0], dados=r.json())
            except Exception as e:  # noqa: BLE001
                widget.update(status=r.status, url=r.url.split("?")[0], erro=f"{type(e).__name__}")

    caso.pg.on("response", resposta)
    caso.pg.on("request", lambda r: bins.append(r.url.split("?")[0]) if "api.mercadopago.com" in r.url and "bins=" in r.url else None)
    try:
        E.col.grupo = "plano" + (f" (host emulado {emulado})" if emulado else "")
        ab = abrir(caso, "plano", "/painel/configuracoes/plano", "[data-botao-cartao], [data-botao-pix], [data-card-plano]", conta=conta)
        tem_cartao = caso.esperar(lambda: caso.tem("[data-botao-cartao]"), 30) if ab else False
        fechar(caso, "plano", ab, f"{conta} · botão do cartão {'na tela' if tem_cartao else 'NÃO apareceu'}")
        if not tem_cartao:
            (aviso if E.producao else lambda t: o.ok(False, t))(f"[plano_cartao] o botão 'Cartão' não apareceu para {conta}: o brick fica de fora")
            return
        nome = "plano_cartao"
        E.col.tela = nome
        botao = caso.pg.locator("[data-botao-cartao]").first
        if not botao.is_enabled():  # sem plano/faixa escolhidos: a 1ª opção de cada (só a escolha na tela)
            for sel in ("[data-plano-opcao]", "[data-faixa-opcao]"):
                if caso.pg.locator(sel).count():
                    caso.pg.locator(sel).first.click()
        botao.click()
        # a troca de plano pode pedir confirmação na tela (diálogo próprio)
        if caso.esperar(lambda: caso.pg.get_by_role("button", name=re.compile(r"^(Confirmar|Continuar|Sim)", re.I)).count() > 0, 3):
            caso.pg.get_by_role("button", name=re.compile(r"^(Confirmar|Continuar|Sim)", re.I)).first.click()
        painel = caso.esperar(lambda: caso.tem("[data-cartao-mp]"), 20)
        brick = caso.esperar(lambda: caso.pg.locator("[data-brick-mp] iframe").count() > 0, 60)
        caso.esperar(lambda: bool(widget), 30)
        cartao = digitar_cartao(caso) if brick else "-"
        caso.esperar(lambda: bool(bins), 20)
        caso.pg.wait_for_timeout(8000)  # o script do antifraude roda e carrega o que precisa; a bandeira aparece
        prova = provar_antifraude(caso, widget)
        fechar(caso, nome, painel and brick, f"o painel do cartão {'abriu' if painel else 'NÃO abriu'} e o brick "
                                             f"{'carregou (campos seguros em iframe)' if brick else 'NÃO carregou'}; {cartao}; consulta do BIN: "
                                             f"{bins[-1] if bins else 'NÃO houve'} — sem pagar")
        o.ok(prova["ok"], f"[plano_cartao] o antifraude do Mercado Pago rodou com o nonce: {prova['texto']}")
    finally:
        caso.fim()


def provar_antifraude(caso, widget: dict) -> dict:
    """A prova (P2 do dono, 09/10): o SDK busca o widget do antifraude (POST /devices/widgets), põe o <script> inline com o nonce
    (deviceProfileCspNonce) e ele roda: sem o aviso "DeviceProfile could not be loaded", sem violação vinda dele e com o efeito do
    script na página (o que o widget define: MP_DEVICE_SESSION_ID ou outro global, conferido pelo texto do widget)."""
    E = ex()
    dados = widget.get("dados") if isinstance(widget.get("dados"), dict) else {}
    codigo = str(dados.get("widget") or "")
    if codigo:
        SAIDA.mkdir(parents=True, exist_ok=True)
        (SAIDA / f"mp_widget_{E.R.prefixo}.js").write_text(codigo, encoding="utf-8")
    hosts = sorted(set(re.findall(r"https?://[A-Za-z0-9.-]+", codigo)))
    globais = sorted(set(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=", codigo)) | set(re.findall(r"\bvar\s+([A-Z_][A-Z0-9_]+)\s*=", codigo)))
    estado = caso.pg.evaluate("""([n, globais]) => {
        const scripts = [...document.scripts].filter((s) => !s.src && s.nonce === n);
        const vals = {};
        for (const g of ['MP_DEVICE_SESSION_ID', 'MELI_SESSION_ID', ...globais]) {
          const v = window[g];
          vals[g] = v === undefined ? null : (typeof v === 'string' ? 'texto(' + v.length + ')' : typeof v);
        }
        return { scriptsComNonce: scripts.length, globais: vals };
    }""", [E.nonce, globais])
    avisos_mp = [m for m in E.col.mp_console if "DeviceProfile could not be loaded" in m or "Invalid options" in m]
    vindas = [v for v in E.col.da_tela("plano_cartao") if not v.esperada]
    definidos = {k: v for k, v in (estado.get("globais") or {}).items() if v is not None}
    ok = (widget.get("status") == 200 and bool(codigo) and bool(dados.get("session_id")) and estado.get("scriptsComNonce", 0) >= 1
          and not avisos_mp and not vindas and bool(definidos))
    E.evidencias["antifraude"] = {"status": widget.get("status"), "url": widget.get("url"), "widget_bytes": len(codigo),
                                  "session_id": bool(dados.get("session_id")), "hosts_no_widget": hosts, "globais_no_widget": globais,
                                  "na_pagina": estado, "avisos_mp": avisos_mp, "console_mp": E.col.mp_console[-6:]}
    texto = (f"POST {widget.get('url') or '/devices/widgets'} → {widget.get('status')}, widget {len(codigo)} bytes, session_id "
             f"{'sim' if dados.get('session_id') else 'NÃO'}; <script> com o nonce na página: {estado.get('scriptsComNonce')}; definidos: "
             f"{definidos or 'nada'}; aviso 'DeviceProfile could not be loaded': {len(avisos_mp)}; violações da tela: {len(vindas)}; "
             f"hosts citados no widget: {hosts or '-'}")
    return {"ok": ok, "texto": texto}


def anexo_de_teste() -> tuple[str, str] | None:
    """(rota do aluno, chave da conta da nutricionista) de um anexo em PDF de conta de TESTE — só leitura."""
    r = ler(f"""select coalesce(p.treino_user_id::text, p.id::text) as rota, lower(u.email) as email
                  from {schema()}.anexos a join {schema()}.pacientes p on p.id = a.paciente_id join auth.users u on u.id = a.nutricionista_id
                 where a.mime = 'application/pdf' and p.deleted_at is null and lower(u.email) like '%.teste.claude@physiqnutri.app'
                 order by a.created_at desc limit 5""")
    for x in r:
        chave = chave_da_conta(x["email"])
        if chave:
            return x["rota"], chave
    return None


def g_clinico(o, nav, R) -> None:
    E = ex()
    achado = anexo_de_teste()
    if not achado:
        (aviso if E.producao else lambda t: o.ok(False, t))("[clinico] nenhum anexo em PDF de conta de teste com login conhecido: o grupo fica de fora")
        return
    rota, conta = achado
    caso = novo_caso(nav, "clinico")
    try:
        E.col.grupo = "clinico"
        nome = "clinico_anexos"
        ab = abrir(caso, nome, f"/painel/alunos/{rota}/prontuario?secao=anexos", "[data-btn-ver-anexo]", conta=conta)
        iframe = False
        if ab:
            caso.pg.locator("[data-btn-ver-anexo]").first.click()
            iframe = caso.esperar(lambda: caso.pg.locator("[data-iframe-anexo]").count() > 0, 30) and esperar_frame(
                caso, "https://api-principal.physiqcalc.com.br/", 30)
            caso.pg.wait_for_timeout(2500)
        fechar(caso, nome, ab and iframe, f"{conta} · Ver → o <iframe> do PDF (URL assinada do principal) {'carregou' if iframe else 'NÃO carregou'}")
        try:
            caso.pg.keyboard.press("Escape")
        except Exception:  # noqa: BLE001
            pass
        for nome, r_ in (("clinico_avaliacao", f"/painel/alunos/{rota}/avaliacao"), ("clinico_dietas_diario", "/painel/dietas?aba=diario")):
            ab = abrir(caso, nome, r_, "[data-menu-lateral]")
            fechar(caso, nome, ab, caso.caminho())
    finally:
        caso.fim()


def g_treino(o, nav, R) -> None:
    E = ex()
    conta = E.contas["treino"]
    caso = novo_caso(nav, "treino")
    try:
        E.col.grupo = "treino"
        for i, aba in enumerate(("historico", "relatorio", "biblioteca")):
            nome = f"treino_{aba}"
            ab = abrir(caso, nome, f"/painel/treinos?aba={aba}", "[data-menu-lateral]", conta=conta if i == 0 else None)
            if aba == "biblioteca":
                ab = ab and caso.esperar(lambda: caso.pg.locator("[data-exercicio-biblioteca]").count() > 0, 60)
            fechar(caso, nome, ab, f"{conta} · {caso.caminho()}")
        com3d = set(json.loads(MANIFESTO_3D.read_text(encoding="utf-8"))["exercicios"])
        nome = "treino_3d"
        E.col.tela = nome
        alvo = None
        for _ in range(4):  # a 1ª página da biblioteca global costuma ter; senão, as próximas
            ids = caso.pg.locator("[data-exercicio-biblioteca]").evaluate_all("els => els.map((e) => e.getAttribute('data-exercicio-biblioteca'))")
            alvo = next((x for x in ids if x in com3d), None)
            if alvo or not caso.tem("[data-pagina-proxima]:not([disabled])"):
                break
            caso.pg.locator("[data-pagina-proxima]").first.click()
            caso.pg.wait_for_timeout(2500)
        pronto = False
        estado3d = "-"
        if alvo:
            caso.pg.locator(f"[data-exercicio-biblioteca='{alvo}'] [data-exercicio-abrir]").first.click()
            caso.esperar(lambda: caso.tem("[data-ficha-3d]"), 30)
            pronto = caso.esperar(lambda: caso.pg.locator("[data-ficha-3d][data-3d='pronto']").count() > 0
                                  or caso.pg.locator("[data-ficha-3d][data-3d='indisponivel']").count() > 0, 90)
            estado3d = caso.pg.locator("[data-ficha-3d]").first.get_attribute("data-3d") if caso.pg.locator("[data-ficha-3d]").count() else "-"
            pronto = estado3d == "pronto"
            caso.pg.wait_for_timeout(2000)
        fechar(caso, nome, bool(alvo) and pronto, f"exercício com 3D {'achado' if alvo else 'NÃO achado'} na biblioteca; o boneco: {estado3d} "
                                                  "(GLB + Meshopt/WASM + texturas blob:)")
    finally:
        caso.fim()


def g_master(o, nav, R) -> None:
    E = ex()
    conta = E.contas["master"]
    volta = None
    if not E.producao:  # master SÓ no staging.profiles enquanto o grupo roda (o dar/tirar_master da massa da hml-14d)
        _, MP_ = T.M._modulos()
        ctx_m = MP_.resolver_master(E.R.B5.CONTAS[conta][0])
        if ctx_m["papel"] != "master":
            T.M.sql_staging(MP_.sql_dar_master(ctx_m))
            volta = (MP_, ctx_m)
            o.linha(f"   (master: {conta} virou master no staging.profiles; volta para '{ctx_m['papel']}' no fim)")
    try:
        caso = novo_caso(nav, "master")
        try:
            E.col.grupo = "master"
            rotas = (("master_visao_geral", "/master"), ("master_contas", "/master/contas"), ("master_alunos", "/master/alunos"),
                     ("master_financeiro", "/master/financeiro"), ("master_planos", "/master/planos"), ("master_integracoes", "/master/integracoes"),
                     ("master_app_do_aluno", "/master/app-do-aluno"), ("master_biblioteca", "/master/biblioteca"),
                     ("master_configuracoes", "/master/configuracoes"))
            for i, (nome, rota) in enumerate(rotas):
                ab = abrir(caso, nome, rota, "[data-menu-lateral]", conta=conta if i == 0 else None)
                fechar(caso, nome, ab, f"{conta} · {caso.caminho()}")
        finally:
            caso.fim()
    finally:
        if volta:
            MP_, ctx_m = volta
            T.M.sql_staging(MP_.sql_tirar_master(ctx_m["master_id"], ctx_m["papel"]))
            papel = (T.M.ler(f"select role from staging.profiles where id = {T.M.lit(ctx_m['master_id'])}::uuid") or [{}])[0].get("role")
            o.ok(papel == ctx_m["papel"], f"[master] {conta} voltou ao papel de antes no staging.profiles ({papel!r})")


def g_aluno(o, nav, R) -> None:
    E = ex()
    conta = E.contas["aluno"]
    caso = novo_caso(nav, "aluno", desktop=False)
    try:
        E.col.grupo = "aluno"
        rotas = (("aluno_inicio", "/"), ("aluno_treino", "/treino"), ("aluno_dieta", "/dieta"), ("aluno_evolucao", "/evolucao"),
                 ("aluno_perfil", "/perfil"), ("aluno_pagamentos", "/perfil/pagamentos"), ("aluno_conta", "/perfil/conta"))
        for i, (nome, rota) in enumerate(rotas):
            ab = abrir(caso, nome, rota, None, conta=conta if i == 0 else None)
            ab = ab and caso.esperar(lambda: len(caso.texto().strip()) > 40, 30)
            fechar(caso, nome, ab, f"{conta} (390 px) · {caso.caminho()}")
    finally:
        caso.fim()


def g_sondas(o, nav, R) -> None:
    E = ex()
    conta = E.contas["sondas"]
    caso = novo_caso(nav, "sondas")
    try:
        E.col.grupo = "sondas"
        ab = abrir(caso, "sondas_pagina", "/painel", "[data-menu-lateral]", conta=conta)
        fechar(caso, "sondas_pagina", ab, f"{conta} · a página logada das sondas")
        if not ab:
            return
        valendo = E.a.modo == "valendo"
        for nome, js, arg, esp_rel, esp_val, regra in SONDAS:
            tela = f"sonda_{nome}"
            E.col.tela = tela
            try:
                res = caso.pg.evaluate(js, E.nonce if arg == "NONCE" else arg) if arg else caso.pg.evaluate(js)
            except Exception as e:  # noqa: BLE001
                res = f"erro: {type(e).__name__}: {str(e)[:160]}"
            caso.pg.wait_for_timeout(1500)
            E.col.ler_paginas()
            E.col.ler_jsonl()
            vs = E.col.da_tela(tela)
            inesperadas = [v for v in vs if not v.esperada]
            achou = any(v.esperada == regra for v in vs) if regra else None
            esperado = esp_val if valendo else esp_rel
            E.resumo.append({"tela": tela, "abriu": True, "pagina": sum(1 for v in vs if v.fonte == "pagina"),
                             "coletor": sum(1 for v in vs if v.fonte == "coletor"), "esperadas": len(vs) - len(inesperadas),
                             "inesperadas": len(inesperadas)})
            if nome == "embed":
                E.evidencias["sonda_embed"] = [v.texto() for v in vs]
                o.linha(f"   ℹ️ [sonda embed] (D4, informativa) <embed> de PDF blob: → {'barrado: ' + vs[0].texto() if vs else 'sem violação neste canal'}")
                o.ok(not inesperadas, f"[{tela}] 0 violação inesperada")
                continue
            if nome == "worker_connect":
                if E.local:
                    o.ok(achou, f"[{tela}] o fetch de dentro do worker blob: para host fora da lista aparece no coletor local "
                                f"(o JSONL vê o worker): {[v.texto() for v in vs if v.esperada == regra][:1] or 'NÃO apareceu'} · o worker: {res!r}")
                else:
                    o.linha(f"   ℹ️ [{tela}] fora do local não há coletor: o worker respondeu {res!r}")
                o.ok(not inesperadas, f"[{tela}] 0 violação inesperada")
                continue
            o.ok(res == esperado, f"[{tela}] {'permitido' if esperado else 'BARRADO'} como esperado no modo {E.a.modo} (resultado: {res!r})")
            if regra:
                o.ok(achou, f"[{tela}] a violação '{regra}' foi relatada ({'sim' if achou else 'NÃO'})")
            o.ok(not inesperadas, f"[{tela}] 0 violação inesperada" + (f": {[v.texto() for v in inesperadas][:2]}" if inesperadas else ""))
    finally:
        caso.fim()


def g_offline(o, nav, R) -> None:
    """--com-sw: o SW instala (precache), a página passa a ser controlada e a 2ª abertura do / e do /treino é SEM rede (o index.html
    do precache, com a CSP de quando foi guardado). O JSONL não pode trazer violação vinda do sw.js."""
    E = ex()
    conta = E.contas["aluno"]
    caso = novo_caso(nav, "offline", desktop=False)
    try:
        E.col.grupo = "offline"
        ab = abrir(caso, "offline_1a_abertura", "/", None, conta=conta)
        ativo = caso.pg.evaluate("""async () => { if (!('serviceWorker' in navigator)) return 'sem suporte';
            const r = await Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 60000))]);
            return r && r.active ? r.active.scriptURL : 'não ativou'; }""")
        caso.pg.reload(wait_until="domcontentloaded")
        assentar(caso)
        controlado = caso.esperar(lambda: caso.pg.evaluate("() => !!navigator.serviceWorker.controller"), 30)
        fechar(caso, "offline_1a_abertura", ab and controlado, f"SW ativo: {ativo}; a página controlada pelo SW: {controlado}")
        ab = abrir(caso, "offline_treino_online", "/treino")
        fechar(caso, "offline_treino_online", ab, "com rede, pelo SW")
        caso.ctx.set_offline(True)
        try:
            for nome, rota in (("offline_2a_abertura_inicio", "/"), ("offline_2a_abertura_treino", "/treino")):
                E.col.tela = nome
                ok = False
                try:
                    caso.pg.goto(E.R.base + rota, wait_until="domcontentloaded", timeout=30000)
                    ok = caso.esperar(lambda: caso.pg.locator("#root *").count() > 0 and len(caso.texto().strip()) > 20, 30)
                    caso.pg.wait_for_timeout(2500)
                except Exception as e:  # noqa: BLE001
                    o.linha(f"   [{nome}] {type(e).__name__}: {str(e)[:200]}")
                fechar(caso, nome, ok, f"SEM rede: o {rota} veio do precache do SW")
        finally:
            caso.ctx.set_offline(False)
        caso.pg.wait_for_timeout(3000)
        E.col.tela = "offline_fim"
        E.col.ler_jsonl()
        do_sw = [v for v in E.col.violacoes if re.search(r"/sw\.js|workbox-", f"{v.documento} {v.origem}")]
        o.ok(not [v for v in do_sw if not v.esperada], f"[offline] nenhuma violação vinda do sw.js/workbox ({len(do_sw)} no total)")
    finally:
        caso.fim()


# ───────────────────────── principal ─────────────────────────
def carregar_hml12():
    """O e2e/hml12/telas.py como módulo (o código do /c/ e o /f/ de produção, só leitura). Carregado ANTES do T.carregar: ele mexe no
    schema e nos prints da base da W5, que o T.carregar e o main() acertam depois."""
    espec = importlib.util.spec_from_file_location("_telas_hml12", REPO / "e2e" / "hml12" / "telas.py")
    mod = importlib.util.module_from_spec(espec)
    sys.modules["_telas_hml12"] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def nonce_do_app() -> str:
    m = re.search(r'MP_CSP_NONCE\s*=\s*"([^"]+)"', MP_INIT.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit(f"MP_CSP_NONCE não achado em {MP_INIT}")
    return m.group(1)


def resumo_final(o) -> int:
    E = ex()
    o.linha("\n== por tela: violações (página · coletor) · esperadas · inesperadas")
    for r in E.resumo:
        o.linha(f"   {r['tela']:<32} {'✅' if r['abriu'] else '❌'}  {r['pagina']:>3} · {r['coletor']:>3}   esperadas {r['esperadas']:>2}   "
                f"inesperadas {r['inesperadas']:>2}")
    sem_tela = [v for v in E.col.violacoes if v.tela not in {r["tela"] for r in E.resumo}]
    for v in sem_tela:
        o.linha(f"   (fora de tela: {v.tela}) {v.texto()} — {'esperada ' + v.esperada if v.esperada else 'INESPERADA'}")
    inesperadas = [v for v in E.col.violacoes if not v.esperada]
    o.ok(not inesperadas, f"0 violação inesperada na rodada inteira: {len(E.col.violacoes)} violação(ões), "
                          f"{len(E.col.violacoes) - len(inesperadas)} esperada(s), {len(inesperadas)} inesperada(s)")
    o.ok(not E.col.pp_erros, "sem erro do Permissions-Policy no console (recurso desconhecido no cabeçalho)" + (f": {E.col.pp_erros[:2]}" if E.col.pp_erros else ""))
    if E.col.origens:
        o.linha("\n== origens de fora contatadas, por grupo (tipo + origem)")
        for g, s in E.col.origens.items():
            o.linha(f"   {g}: " + ", ".join(sorted(s)))
    detalhe = SAIDA / f"{o.nome}.json"
    try:
        SAIDA.mkdir(parents=True, exist_ok=True)
        detalhe.write_text(json.dumps({"violacoes": [vars(v) for v in E.col.violacoes], "resumo": E.resumo,
                                       "origens": {g: sorted(s) for g, s in E.col.origens.items()}, "console": E.col.console[-200:],
                                       "evidencias": E.evidencias, "avisos": E.avisos}, ensure_ascii=False, indent=1, default=str),
                           encoding="utf-8")
        o.linha(f"   detalhe (cada violação, as origens e as evidências): {detalhe}")
    except OSError as e:
        o.linha(f"   detalhe: não gravou ({e})")
    return len(inesperadas)


def main() -> int:
    global EX
    ap = argparse.ArgumentParser(description="hml-15 — E2E da CSP e dos cabeçalhos do site (grupos, contas e uso no topo do arquivo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod | <url> (ex.: http://localhost:8091)")
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--modo", default="relatorio", choices=("relatorio", "valendo"), help="o que esperar (quem manda é o cabeçalho)")
    ap.add_argument("--com-sw", action="store_true", help="todo contexto com o service worker ligado + o grupo offline")
    ap.add_argument("--com-tela", action="store_true", help="o navegador com janela (o D4: o PDF dos Impressos na aba nova)")
    ap.add_argument("--so", default="", help=f"só estes grupos ({', '.join(GRUPOS)})")
    ap.add_argument("--prefixo", help="o começo dos prints e da saída (padrão: local, staging, prod ou url)")
    ap.add_argument("--jsonl", default=str(JSONL), help="o JSONL do servidor_dist.py (só no local)")
    ap.add_argument("--contas", default="", help="troca a conta de TESTE de um grupo: grupo=chave,... (chaves das CONTAS da W5)")
    ap.add_argument("--emular-host", help="só no local e só com --so plano: o navegador acha que está neste host (ex.: physiqcalc.com.br) e o "
                                          "servidor local responde tudo — o antifraude do MP escolhe os hosts pelo domínio da página")
    a = ap.parse_args()

    base = T.BASES.get(a.base, a.base).rstrip("/")
    partes = urllib.parse.urlparse(base)
    host = partes.hostname or ""
    producao = host in T.HOSTS_DE_PRODUCAO
    local = host in ("localhost", "127.0.0.1")
    if a.base == "prod" and not producao:
        raise SystemExit("--base prod precisa ser a produção")
    if producao and a.com_sw:
        raise SystemExit("--com-sw na produção: recusado (o pedido que passa pelo service worker escapa da Guarda)")
    grupos = [g.strip() for g in a.so.split(",") if g.strip()] or [g for g in GRUPOS if g != "offline" or a.com_sw]
    if a.com_sw and not a.so and "offline" not in grupos:
        grupos.append("offline")
    desconhecidos = set(grupos) - set(GRUPOS)
    if desconhecidos:
        raise SystemExit(f"grupos desconhecidos: {sorted(desconhecidos)} (conhecidos: {', '.join(GRUPOS)})")
    if "offline" in grupos and not a.com_sw:
        raise SystemExit("o grupo offline precisa do --com-sw")
    if a.emular_host and (not local or set(grupos) != {"plano"}):
        raise SystemExit("--emular-host só no local e só com --so plano")
    contas = dict(CONTAS_PROD if producao else CONTAS_TESTE)
    for par in (x.strip() for x in a.contas.split(",") if x.strip()):
        g, _, chave = par.partition("=")
        contas[g.strip()] = chave.strip()
    prefixo = a.prefixo or (a.base if a.base in T.BASES else "local" if local else "url")
    sufixo = (("_sw" if a.com_sw else "") + ("_tela" if a.com_tela else "") + (f"_so-{'-'.join(grupos)}" if a.so else "")
              + (f"_host-{a.emular_host}" if a.emular_host else ""))

    H12 = carregar_hml12()
    C, B5 = T.carregar("public" if producao else "staging")
    C.SAIDA, B5.PRINTS = SAIDA, PRINTS  # as saídas e os prints desta W
    o = C.Saida(f"csp_{prefixo}_{a.modo}{sufixo}", parar=False)
    R = T.Rodada(C=C, B5=B5, o=o, base=base, prefixo=f"{prefixo}_{a.modo}{sufixo}", producao=producao, sess=C.Sessoes())
    for g, chave in contas.items():
        if chave not in B5.CONTAS or not B5.email_de_teste(B5.CONTAS[chave][0]):
            raise SystemExit(f"a conta do grupo {g} ({chave}) não é conta de TESTE das CONTAS da W5")
    regras = json.loads(ESPERADAS.read_text(encoding="utf-8"))["esperadas"]
    col = Coletor(f"{partes.scheme}://{partes.netloc}", regras, Path(a.jsonl) if local else None)
    EX = Ex(o=o, R=R, col=col, a=a, local=local, producao=producao, contas=contas, nonce=nonce_do_app(), H12=H12)
    o.linha(f"base {base} · {'produção (só leitura)' if producao else 'schema staging'} · modo {a.modo} · grupos {', '.join(grupos)}"
            + (" · SW ligado" if a.com_sw else "") + (" · com tela" if a.com_tela else "") + (f" · coletor {a.jsonl}" if local else " · sem coletor"))
    if "cabecalhos" in grupos:
        col.tela = col.grupo = "cabecalhos"
        try:
            g_cabecalhos()
        except Exception as e:  # noqa: BLE001
            o.ok(False, f"[cabeçalhos] {type(e).__name__}: {str(e)[:240]}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    funcoes = {"publicas": g_publicas, "painel": g_painel, "impressos": g_impressos, "plano": g_plano, "clinico": g_clinico, "treino": g_treino,
               "master": g_master, "aluno": g_aluno, "sondas": g_sondas, "offline": g_offline}
    with sync_playwright() as pw:

        def rodar(fn) -> None:
            """Cada grupo num navegador NOVO; caiu no meio → 1 nova tentativa noutro (o molde do rodar() do e2e/hml14/telas.py)."""
            for tentativa in (1, 2):
                nav = NavCsp(pw.chromium.launch(channel=a.canal, headless=not a.com_tela, args=ARGS_NAVEGADOR), col, a.com_sw)
                try:
                    fn(o, nav, R)
                    return
                except Exception as e:  # noqa: BLE001
                    caiu = any(x in str(e) for x in ("Target crashed", "Unable to capture screenshot", "has been closed"))
                    if not caiu or tentativa == 2:
                        o.ok(False, f"{fn.__name__}: {type(e).__name__}: {str(e)[:300]}")
                        caso = B5.ESTADO.get("caso")
                        if caso:
                            caso.diagnostico()
                        return
                    o.linha(f"   ({fn.__name__}: o navegador caiu no meio — o grupo de novo, num navegador novo)")
                finally:
                    try:
                        nav.close()
                    except Exception:  # noqa: BLE001
                        pass

        def build(o_, nav, R_) -> None:
            col.tela = col.grupo = "build"
            R_.build_ok = T.conferir_build(o_, nav, R_)

        try:
            rodar(build)
            if not R.build_ok:
                o.ok(False, "parei antes das telas com conta: o build não é o esperado para esta base")
            else:
                if producao:
                    R.guarda = T.Guarda(("api-principal.physiqcalc.com.br", "api.physiqcalc.com.br", f"{C.PRINCIPAL_REF}.supabase.co",
                                         f"{C.TREINO_REF}.supabase.co"))
                for g in grupos:
                    if g in funcoes:
                        o.linha(f"\n== {g}")
                        rodar(funcoes[g])
        finally:
            R.sess.fechar(o)
    col.tela = "(fim)"
    time.sleep(2)
    col.ler_jsonl()
    if R.guarda:
        o.linha(f"   escritas bloqueadas pelo navegador (produção): {R.guarda.bloqueadas}")
    graves = [x for bom, x in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página nem falha da base ({graves[:2]})")
    resumo_final(o)
    if EX.avisos:
        o.linha(f"\n⚠️ {len(EX.avisos)} aviso(s) (não contam como falha):")
        for x in EX.avisos:
            o.linha(f"   - {x}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
