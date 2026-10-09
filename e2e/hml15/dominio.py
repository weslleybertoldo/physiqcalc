#!/usr/bin/env python3
"""Physiq hml-15 (H-33, H-34, H-52) — as conferências do domínio depois das mudanças na Cloudflare (spec §2.4 e §4.5). SÓ LEITURA:
GET/HEAD nas APIs e no site, `openssl s_client`, `dig`/`delv` e GET na API v4 da Cloudflare (nenhum PATCH/POST/DELETE).

Itens (--so a,b; padrão: todos — cada mudança da Cloudflare pode ser conferida sozinha, na ordem da spec: 5, 6, 7, depois 1 a 4 e 8):
  https    (1) http:// das 2 APIs → 301 + location https://… (sem seguir) · always_use_https = on
  tls      (2) TLS 1.0 e 1.1 recusados, 1.2 e 1.3 aceitos (as 2 APIs) · min_tls_version = 1.2
  hsts     (3) HSTS 1 ano (sem includeSubDomains, sem preload) + nosniff nas 2 APIs · security_header da zona
  ssl      (4) ssl = strict · /healthz das 2 APIs = 200
  dmarc    (5) _dmarc = v=DMARC1; p=none (ou quarantine, o P3) com rua · DMARC Management ligado, sem status de erro
  spf      (6) v=spf1 -all no apex · o SPF do send. igual a antes (o envelope do Resend)
  caa      (7) CAA issue letsencrypt.org, pki.goog, sectigo.com e ssl.com · os pacotes de certificado active (ou backup_issued)
  dnssec   (8) DNSSEC pending (sem o DS do dono) ou active (com o DS: o DS no .br e a validação) · o DS para o Registro.br vai
               para dnssec_ds.txt (se ainda não existe)
  apex     o site igual: http → 308 https, o HSTS da Vercel (2 anos), sem X-Robots-Tag na produção; o staging com o X-Robots-Tag
Token: ~/.cloudflare-pessoal-token (de conta; nunca vai para a saída). Saída: ~/projetos/physiqcalc-scratch/hml/hml15/dominio_depois.txt
(--saida <nome> troca o nome; nada no /tmp) e a rodada no ~/projetos/physiqcalc-scratch/e2e-rodadas.tsv.

Uso: python3 e2e/hml15/dominio.py [--so dmarc,spf,caa] [--saida dominio_depois]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml15"
ZONA = "efa77ce5a75431cf5ae1a4c176a8d7dd"  # infra/cloudflare/physiqcalc-api/deploy.sh
DOMINIO = "physiqcalc.com.br"
APIS = ("api.physiqcalc.com.br", "api-principal.physiqcalc.com.br")
STAGING = "physiqcalc-staging.vercel.app"
CAS = ("letsencrypt.org", "pki.goog", "sectigo.com", "ssl.com")
SPF_SEND = "v=spf1 include:amazonses.com ~all"  # medido em 09/10/2026 (dig_antes.txt): não pode mudar
HSTS_VERCEL = "max-age=63072000"
ITENS = ("https", "tls", "hsts", "ssl", "dmarc", "spf", "caa", "dnssec", "apex")


def _comum_w02():
    """O e2e/w02/_comum.py (o http() com seguir=False e o Placar, que registra a rodada no e2e-rodadas.tsv)."""
    if hasattr(sys.modules.get("_comum"), "Placar"):
        return sys.modules["_comum"]
    espec = importlib.util.spec_from_file_location("_comum", REPO / "e2e" / "w02" / "_comum.py")
    mod = importlib.util.module_from_spec(espec)
    sys.modules["_comum"] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


W2 = _comum_w02()
p = W2.Placar()
LINHAS: list[str] = []


def linha(texto: str) -> None:
    print(texto, flush=True)
    LINHAS.append(texto)


def ok(cond: object, texto: str) -> bool:
    LINHAS.append(("✅ " if cond else "❌ ") + texto)
    return p.check(bool(cond), texto)


def cabecalho(h: dict, nome: str) -> str:
    return next((str(v) for k, v in (h or {}).items() if k.lower() == nome.lower()), "")


# ───────────────────────── leituras ─────────────────────────
def cf_get(caminho: str) -> dict:
    """GET na API v4 da Cloudflare (zona do Physiq). Só GET: nada aqui grava."""
    token = (Path.home() / ".cloudflare-pessoal-token").read_text(encoding="utf-8").strip()
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/zones/{ZONA}{caminho}", method="GET",
                                 headers={"Authorization": f"Bearer {token}", "User-Agent": "physiq-hml15/dominio"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except ValueError:
            return {"success": False, "errors": [{"code": e.code}]}


def cf_valor(caminho: str):
    r = cf_get(caminho)
    return (r.get("result") or {}).get("value") if r.get("success") else ("ERRO", [x.get("code") for x in r.get("errors") or []])


def dig(tipo: str, nome: str, servidor: str = "1.1.1.1", extra: tuple[str, ...] = ("+short",)) -> str:
    r = subprocess.run(["dig", *extra, tipo, nome, f"@{servidor}"], capture_output=True, text=True, timeout=30)
    return r.stdout.strip()


VERSOES_TLS = {"tls1": "TLSv1", "tls1_1": "TLSv1.1", "tls1_2": "TLSv1.2", "tls1_3": "TLSv1.3"}


def tls(host: str, versao: str) -> tuple[bool, str]:
    """openssl s_client com uma versão só (-tls1, -tls1_1, -tls1_2, -tls1_3). Aceito = a linha "New, <versão>, Cipher is <cifra>"
    com a versão pedida e uma cifra de verdade (na recusa o OpenSSL escreve "New, (NONE), Cipher is (NONE)" e, no bloco da sessão,
    ainda põe a versão tentada: por isso o "Protocol :" não serve de prova)."""
    cmd = ["openssl", "s_client", "-connect", f"{host}:443", "-servername", host, f"-{versao}"]
    if versao in ("tls1", "tls1_1", "tls1_2"):
        cmd += ["-cipher", "DEFAULT@SECLEVEL=0"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=25, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return False, "tempo esgotado"
    saida = r.stdout + r.stderr
    m = re.search(r"New, (TLSv[\d.]+), Cipher is (\S+)", saida)
    if m and m.group(2) != "(NONE)" and m.group(1) == VERSOES_TLS[versao]:
        return True, f"{m.group(1)} {m.group(2)}"
    erro = re.search(r"alert protocol version|no protocols available|wrong version number|unsupported protocol|handshake failure", saida)
    return False, erro.group(0) if erro else (saida.strip().splitlines()[-1][:80] if saida.strip() else "?")


# ───────────────────────── os itens ─────────────────────────
def item_https() -> None:
    for host in APIS:
        st, _, h = W2.http("GET", f"http://{host}/healthz", seguir=False, timeout=30)
        loc = cabecalho(h, "Location")
        ok(st == 301 and loc.startswith(f"https://{host}/"), f"[https] http://{host}/healthz → {st} {loc or '(sem location)'}")
    ok(cf_valor("/settings/always_use_https") == "on", f"[https] always_use_https = {cf_valor('/settings/always_use_https')!r}")


def item_tls() -> None:
    for host in APIS:
        for versao, aceito in (("tls1", False), ("tls1_1", False), ("tls1_2", True), ("tls1_3", True)):
            foi, det = tls(host, versao)
            ok(foi == aceito, f"[tls] {host} {versao}: {'aceito' if foi else 'recusado'} ({det}) — esperado {'aceito' if aceito else 'recusado'}")
    ok(cf_valor("/settings/min_tls_version") == "1.2", f"[tls] min_tls_version = {cf_valor('/settings/min_tls_version')!r}")


def item_hsts() -> None:
    for host in APIS:
        st, _, h = W2.http("GET", f"https://{host}/healthz", timeout=30)
        hsts, nosniff = cabecalho(h, "Strict-Transport-Security"), cabecalho(h, "X-Content-Type-Options")
        ok(st == 200 and "max-age=31536000" in hsts and "includesubdomains" not in hsts.lower() and "preload" not in hsts.lower()
           and nosniff.lower() == "nosniff", f"[hsts] {host}: {st} · HSTS {hsts!r} · nosniff {nosniff!r}")
    sh = cf_valor("/settings/security_header")
    sts = (sh or {}).get("strict_transport_security", {}) if isinstance(sh, dict) else {}
    ok(sts.get("enabled") is True and sts.get("max_age") == 31536000 and sts.get("include_subdomains") is False and sts.get("preload") is False
       and sts.get("nosniff") is True, f"[hsts] security_header da zona = {sts or sh}")


def item_ssl() -> None:
    ok(cf_valor("/settings/ssl") == "strict", f"[ssl] ssl = {cf_valor('/settings/ssl')!r}")
    for host in APIS:
        st, _, _ = W2.http("GET", f"https://{host}/healthz", timeout=30)
        ok(st == 200, f"[ssl] https://{host}/healthz → {st}")


def item_dmarc() -> None:
    txt = dig("TXT", f"_dmarc.{DOMINIO}")
    ok(re.search(r"v=DMARC1;\s*p=(none|quarantine)", txt) and "rua=mailto:" in txt, f"[dmarc] _dmarc.{DOMINIO} = {txt or '(vazio)'}")
    r = cf_get("/email/auth/dmarc-reports")
    res = r.get("result") or {}
    ok(r.get("success") and res.get("enabled") is True and not res.get("status"),
       f"[dmarc] DMARC Management: enabled {res.get('enabled')!r}, status {res.get('status')!r}")


def item_spf() -> None:
    apex = dig("TXT", DOMINIO)
    ok('"v=spf1 -all"' in apex.splitlines(), f"[spf] TXT {DOMINIO} = {apex or '(vazio)'}")
    send = dig("TXT", f"send.{DOMINIO}")
    ok(send.strip('"') == SPF_SEND, f"[spf] TXT send.{DOMINIO} igual a antes ({send})")


def item_caa() -> None:
    caa = dig("CAA", DOMINIO)
    faltam = [ca for ca in CAS if not re.search(rf'^0 issue "{re.escape(ca)}"$', caa, flags=re.M)]
    ok(not faltam, f"[caa] CAA {DOMINIO}: {caa.splitlines() or '(vazio)'}" + (f" — falta: {faltam}" if faltam else ""))
    r = cf_get("/ssl/certificate_packs?status=all")
    pacotes = [(x.get("type"), x.get("certificate_authority"), x.get("status")) for x in r.get("result") or []]
    ruins = [x for x in pacotes if x[2] not in ("active", "backup_issued")]
    ok(r.get("success") and pacotes and not ruins, f"[caa] pacotes de certificado: {pacotes}" + (f" — fora de active: {ruins}" if ruins else ""))


def item_dnssec() -> None:
    r = cf_get("/dnssec")
    res = r.get("result") or {}
    status = res.get("status")
    ok(r.get("success") and status in ("pending", "active"), f"[dnssec] status na Cloudflare: {status!r}")
    if res.get("ds"):
        arq = SAIDA / "dnssec_ds.txt"
        if not arq.exists():
            SAIDA.mkdir(parents=True, exist_ok=True)
            arq.write_text("\n".join(f"{k}: {res.get(k)}" for k in ("ds", "key_tag", "algorithm", "digest_type", "digest")) + "\n", encoding="utf-8")
        linha(f"   DS para o Registro.br (passo do dono): key_tag {res.get('key_tag')}, algoritmo {res.get('algorithm')}, digest_type "
              f"{res.get('digest_type')} → {arq}")
    ds = dig("DS", DOMINIO, "a.dns.br")
    if status == "active":
        ok(bool(ds), f"[dnssec] DS no .br: {ds or '(vazio)'}")
        delv = subprocess.run(["delv", "@1.1.1.1", DOMINIO], capture_output=True, text=True, timeout=30)
        ok("fully validated" in delv.stdout + delv.stderr, f"[dnssec] delv: {(delv.stdout + delv.stderr).strip().splitlines()[:1]}")
    else:
        linha(f"   ℹ️ [dnssec] pendente até o DS do dono no Registro.br (DS no .br hoje: {ds or 'nenhum'}) — pendente não estraga nada")


def item_apex() -> None:
    st, _, h = W2.http("GET", f"http://{DOMINIO}/", seguir=False, timeout=30)
    loc = cabecalho(h, "Location")
    ok(st in (301, 308) and loc.startswith(f"https://{DOMINIO}"), f"[apex] http://{DOMINIO}/ → {st} {loc}")
    st, _, h = W2.http("GET", f"https://{DOMINIO}/", timeout=30)
    hsts = cabecalho(h, "Strict-Transport-Security")
    ok(st == 200 and hsts.startswith(HSTS_VERCEL) and not cabecalho(h, "X-Robots-Tag"),
       f"[apex] https://{DOMINIO}/ → {st} · HSTS {hsts!r} (o da Vercel) · X-Robots-Tag {cabecalho(h, 'X-Robots-Tag')!r} (nenhum)")
    st, _, h = W2.http("GET", f"https://{STAGING}/", timeout=30)
    ok(st == 200 and cabecalho(h, "X-Robots-Tag") == "noindex, nofollow", f"[apex] staging → {st} · X-Robots-Tag {cabecalho(h, 'X-Robots-Tag')!r}")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-15 — as conferências do domínio (só leitura; itens e uso no topo do arquivo)")
    ap.add_argument("--so", default="", help=f"só estes itens ({', '.join(ITENS)})")
    ap.add_argument("--saida", default="dominio_depois", help="o nome do arquivo de saída (sem .txt) em ~/projetos/physiqcalc-scratch/hml/hml15/")
    a = ap.parse_args()
    itens = [x.strip() for x in a.so.split(",") if x.strip()] or list(ITENS)
    desconhecidos = set(itens) - set(ITENS)
    if desconhecidos:
        raise SystemExit(f"itens desconhecidos: {sorted(desconhecidos)} (conhecidos: {', '.join(ITENS)})")
    linha(f"# dominio.py · {time.strftime('%Y-%m-%d %H:%M:%S')} · itens {', '.join(itens)} (só leitura)")
    funcoes = {"https": item_https, "tls": item_tls, "hsts": item_hsts, "ssl": item_ssl, "dmarc": item_dmarc, "spf": item_spf,
               "caa": item_caa, "dnssec": item_dnssec, "apex": item_apex}
    for item in itens:
        linha(f"\n== {item}")
        try:
            funcoes[item]()
        except Exception as e:  # noqa: BLE001 — um item com erro não derruba os outros
            ok(False, f"[{item}] {type(e).__name__}: {str(e)[:200]}")
    codigo = p.fim()  # o placar e a rodada no e2e-rodadas.tsv
    falhas = [t for bom, t in p.itens if not bom]
    LINHAS.append(f"\n{len(p.itens) - len(falhas)}/{len(p.itens)} ok" + (f" — FALHAS: {len(falhas)}" if falhas else ""))
    SAIDA.mkdir(parents=True, exist_ok=True)
    arq = SAIDA / f"{a.saida}.txt"
    arq.write_text("\n".join(LINHAS) + "\n", encoding="utf-8")
    print(f"cópia: {arq}")
    return codigo


if __name__ == "__main__":
    raise SystemExit(main())
