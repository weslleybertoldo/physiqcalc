#!/usr/bin/env python3
"""Physiq hml-15 (H-33, D16) — servidor estático do `dist/` com os MESMOS cabeçalhos do `vercel.json` (a prova local da CSP).

O `vite preview` não lê o `vercel.json`; este lê:
  - aplica os `headers` (re.fullmatch do `source` no caminho pedido; o `has` de host só casa no host certo), os `redirects` com
    `has` de host (só com --host) e os `rewrites` depois dos arquivos, como a Vercel;
  - serve os tipos iguais aos da Vercel (medidos no staging em 09/10/2026: `.js` application/javascript, `.webmanifest`
    application/manifest+json, `.wasm` application/wasm, `.woff2` font/woff2, `.glb` model/gltf-binary): o `nosniff` se comporta
    como lá;
  - SÓ NO LOCAL: acrescenta `; report-uri /__csp` à CSP e grava cada relatório (POST /__csp, application/csp-report ou
    application/reports+json) numa linha do JSONL (padrão ~/projetos/physiqcalc-scratch/hml/hml15/csp_relatorios_local.jsonl).
    É o único jeito de ver violação de DENTRO dos workers e do service worker: lá o evento dispara no escopo do worker, não na
    página. Staging e produção ficam sem coletor (D7).

  --valendo   troca a chave Content-Security-Policy-Report-Only por Content-Security-Policy (o passo 2), com o mesmo valor
  --host H    responde como se o pedido viesse para o host H (ex.: physiqcalc-staging.vercel.app → o X-Robots-Tag do staging)

Uso: python3 e2e/hml15/servidor_dist.py --dist dist --porta 8080 [--valendo]
     (para: Ctrl+C, ou `pgrep -f "[s]ervidor_dist"` + `kill <pid>`)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
JSONL_PADRAO = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml15" / "csp_relatorios_local.jsonl"
CSP_RO = "Content-Security-Policy-Report-Only"
CSP = "Content-Security-Policy"
COLETOR = "/__csp"
CACHE_PADRAO = "public, max-age=0, must-revalidate"  # o que a Vercel manda quando nenhuma regra põe Cache-Control
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".ico": "image/vnd.microsoft.icon",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".ktx2": "image/ktx2",
    ".bin": "application/octet-stream",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
}


def carregar_vercel(caminho: Path) -> dict:
    cfg = json.loads(caminho.read_text(encoding="utf-8"))
    for regra in cfg.get("headers", []) + cfg.get("rewrites", []):
        re.compile(regra["source"])  # source inválido para o re = para já, não no meio da rodada
    return cfg


def has_casa(has: list | None, host: str) -> bool:
    """Só o `has` de host é usado no vercel.json do Physiq; qualquer outro tipo não casa no local (fica de fora, como sem o dado)."""
    for cond in has or []:
        if cond.get("type") != "host" or cond.get("value", "").lower() != host.lower():
            return False
    return True


def cabecalhos_para(cfg: dict, caminho: str, host: str, valendo: bool) -> list[tuple[str, str]]:
    """Os cabeçalhos das regras que casam com o caminho (todas as que casam, na ordem; chave repetida = a última vale)."""
    saida: dict[str, tuple[str, str]] = {}
    for regra in cfg.get("headers", []):
        if re.fullmatch(regra["source"], caminho) and has_casa(regra.get("has"), host):
            for h in regra["headers"]:
                chave = h["key"]
                if valendo and chave.lower() == CSP_RO.lower():
                    chave = CSP
                saida[chave.lower()] = (chave, h["value"])
    for chave in (CSP.lower(), CSP_RO.lower()):
        if chave in saida:
            nome, valor = saida[chave]
            saida[chave] = (nome, valor.rstrip("; ") + f"; report-uri {COLETOR}")
    if "cache-control" not in saida:
        saida["cache-control"] = ("Cache-Control", CACHE_PADRAO)
    return list(saida.values())


def _padrao_redirect(source: str) -> re.Pattern:
    """O `source` dos redirects do Physiq ("/" e "/:path*") no formato do path-to-regexp → regex com o grupo nomeado."""
    partes = re.split(r"(:\w+\*)", source)
    return re.compile("".join(f"(?P<{x[1:-1]}>.*)" if re.fullmatch(r":\w+\*", x) else re.escape(x) for x in partes))


def redirect_para(cfg: dict, caminho: str, consulta: str, host: str) -> tuple[int, str] | None:
    for regra in cfg.get("redirects", []):
        if not has_casa(regra.get("has"), host):
            continue
        m = _padrao_redirect(regra["source"]).fullmatch(caminho)
        if m:
            destino = regra["destination"]
            for nome, valor in m.groupdict().items():
                destino = destino.replace(f":{nome}*", valor or "")
            if consulta:
                destino += ("&" if "?" in destino else "?") + consulta
            return (308 if regra.get("permanent", True) else 307), destino
    return None


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, endereco, dist: Path, cfg: dict, valendo: bool, host: str | None, jsonl: Path) -> None:
        super().__init__(endereco, Manipulador)
        self.dist, self.cfg, self.valendo, self.host_fixo, self.jsonl = dist.resolve(), cfg, valendo, host, jsonl
        self.trava = threading.Lock()
        self.relatorios = 0


class Manipulador(BaseHTTPRequestHandler):
    server: Servidor
    protocol_version = "HTTP/1.1"

    def log_request(self, code: object = "-", size: object = "-") -> None:  # só os erros (o resto vira ruído na rodada)
        if str(code)[:1] in ("4", "5"):
            sys.stderr.write(f"[servidor_dist] {code} {self.requestline}\n")

    def log_message(self, formato: str, *args) -> None:
        sys.stderr.write("[servidor_dist] " + (formato % args) + "\n")

    # ── o arquivo que responde ao caminho (a ordem da Vercel: arquivo → rewrite → 404) ──
    def _arquivo(self, caminho: str) -> Path | None:
        rel = urllib.parse.unquote(caminho).lstrip("/")
        alvo = (self.server.dist / rel).resolve()
        if not alvo.is_relative_to(self.server.dist):
            return None
        if alvo.is_dir():
            alvo = alvo / "index.html"
        return alvo if alvo.is_file() else None

    def _resolver(self, caminho: str) -> tuple[int, Path | None]:
        achado = self._arquivo(caminho)
        if achado:
            return 200, achado
        for regra in self.server.cfg.get("rewrites", []):
            if re.fullmatch(regra["source"], caminho):
                destino = self._arquivo(regra["destination"])
                if destino:
                    return 200, destino
        pagina = self._arquivo("/404.html")
        return 404, pagina

    def _host(self) -> str:
        return self.server.host_fixo or (self.headers.get("Host") or "").split(":")[0]

    def _responder(self, com_corpo: bool) -> None:
        partes = urllib.parse.urlsplit(self.path)
        caminho = partes.path or "/"
        redir = redirect_para(self.server.cfg, caminho, partes.query, self._host())
        if redir:
            self.send_response(redir[0])
            self.send_header("Location", redir[1])
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        status, arquivo = self._resolver(caminho)
        corpo = arquivo.read_bytes() if arquivo else b"The page could not be found\n\nNOT_FOUND\n"
        tipo = TIPOS.get(arquivo.suffix.lower(), "application/octet-stream") if arquivo else "text/plain; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        for chave, valor in cabecalhos_para(self.server.cfg, caminho, self._host(), self.server.valendo):
            self.send_header(chave, valor)
        self.end_headers()
        if com_corpo:
            self.wfile.write(corpo)

    def do_GET(self) -> None:  # noqa: N802 — nome do http.server
        self._responder(True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._responder(False)

    def do_POST(self) -> None:  # noqa: N802
        tamanho = min(int(self.headers.get("Content-Length") or 0), 256 * 1024)
        bruto = self.rfile.read(tamanho) if tamanho else b""
        if urllib.parse.urlsplit(self.path).path != COLETOR:
            self.send_response(405)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            corpo: object = json.loads(bruto.decode("utf-8", "replace") or "null")
        except ValueError:
            corpo = {"_nao_json": bruto[:500].decode("utf-8", "replace")}
        linha = {"t": round(time.time(), 3), "quando": time.strftime("%Y-%m-%d %H:%M:%S"), "tipo": self.headers.get("Content-Type", ""),
                 "ua": (self.headers.get("User-Agent") or "")[:160], "corpo": corpo}
        with self.server.trava:
            self.server.jsonl.parent.mkdir(parents=True, exist_ok=True)
            with self.server.jsonl.open("a", encoding="utf-8") as f:
                f.write(json.dumps(linha, ensure_ascii=False) + "\n")
            self.server.relatorios += 1
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-15 — o dist/ com os cabeçalhos do vercel.json + o coletor local de relatórios de CSP")
    ap.add_argument("--dist", default=str(REPO / "dist"), help="a pasta do build (padrão: dist/ da worktree)")
    ap.add_argument("--porta", type=int, default=8080)
    ap.add_argument("--endereco", default="127.0.0.1", help="padrão 127.0.0.1 (só esta máquina)")
    ap.add_argument("--vercel", default=str(REPO / "vercel.json"), help="o vercel.json lido (padrão: o da worktree)")
    ap.add_argument("--valendo", action="store_true", help="a CSP com a chave que vale (Content-Security-Policy), não a Report-Only")
    ap.add_argument("--host", help="responde como se o pedido viesse para este host (o has de host do vercel.json)")
    ap.add_argument("--jsonl", default=str(JSONL_PADRAO), help="onde gravar os relatórios de CSP (1 por linha)")
    a = ap.parse_args()
    dist = Path(a.dist)
    if not (dist / "index.html").is_file():
        raise SystemExit(f"{dist}/index.html não existe: rode o build antes")
    cfg = carregar_vercel(Path(a.vercel))
    srv = Servidor((a.endereco, a.porta), dist, cfg, a.valendo, a.host, Path(a.jsonl))
    print(f"servidor_dist: http://localhost:{a.porta} · {dist.resolve()} · CSP {'VALENDO' if a.valendo else 'Report-Only'}"
          f"{' · host ' + a.host if a.host else ''} · relatórios em {a.jsonl}", flush=True)
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        print(f"servidor_dist: parado ({srv.relatorios} relatório(s) gravado(s))", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
