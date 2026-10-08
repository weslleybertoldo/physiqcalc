#!/usr/bin/env python3
"""Physiq hml-10 (H-26 e H-48, D5) — E2E das 2 telas de erro e do aviso ao erro-avisar (spec §3.3 S1/S2, §5.1, §5.2, §5.3 P6).

  S1  tela de erro geral (ErrorBoundary): /erro-teste › "quebrar a tela"
  S2  tela de erro de uma parte (LimiteDeErro): /erro-teste › "quebrar esta parte"; "Tentar de novo" com a parte ainda quebrada
      não manda o 2º aviso (1 por código por carregamento)
  PR  promessa sem catch: /erro-teste › "promessa sem catch" (o globalErrorHandler avisa; não é tela, sem print)
  P6  tela de erro de uma parte na PRODUÇÃO, sem rota de teste: o chunk da /privacidade vira um `throw new Error(…)` SÓ no
      navegador do teste (Service Worker bloqueado; nada muda no servidor)
Em cada um: o texto novo, o código de 8 hex na tela, a message do erro (que leva dado pessoal FALSO) fora da tela e o POST ao
erro-avisar com o corpo limpo — sem e-mail, CPF, telefone nem token; rota sem query nem #; pedido simples (text/plain, sem apikey
nem sessão) — e o código da tela = o 🔑 que a função calcula do corpo (lerAviso + assinatura do próprio _shared, pelo Node).

  --base local    o `vite preview` do build de STAGING (http://localhost:8080). O Playwright responde 204 no lugar da erro-avisar
                  e, por garantia, o host do principal nem resolve neste navegador: nenhum aviso de verdade sai. Com --p6 ensaia o
                  P6 aqui (chunk da /privacidade trocado, aviso interceptado).
  --base staging  https://physiqcalc-staging.vercel.app: o POST vai DE VERDADE (aviso "[staging]" no tópico Physiq do grupo
                  Validação; a função segura os iguais por 10 min) e o status de cada um é registrado (204 = aceito).
  --base prod     https://physiqcalc.com.br, só leitura: a /erro-teste não existe (a página de teste foi cortada do build).
     --p6         + o P6 de verdade (1 aviso de teste em produção, decisão P6 da spec): o aviso chega sem "[staging]".

Prints em ~/projetos/physiqcalc-scratch/prints/hml10/<base>_*.png; cópia da saída em ~/projetos/physiqcalc-scratch/hml/hml10/.
Uso: python3 e2e/hml10/telas.py --base local [--p6]      (antes: npx vite preview --port 8080 --strictPort --host localhost)
     python3 e2e/hml10/telas.py --base staging
     python3 e2e/hml10/telas.py --base prod [--p6]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True

from playwright.sync_api import sync_playwright  # noqa: E402

REPO = Path(__file__).resolve().parents[2]  # a worktree onde este arquivo está — nunca ~/projetos/physiqcalc
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml10"
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml10"
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
SCHEMA = {"local": "staging", "staging": "staging", "prod": "public"}
VERSAO_DO_REPO = json.loads((REPO / "package.json").read_text(encoding="utf-8"))["version"]
# a versão que o build aberto manda no aviso: a do /health.json dele (D7); sem ele (deploy antigo), a do package.json daqui
VERSAO = {"esperada": VERSAO_DO_REPO}
ERROS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "erros.ts"
REGRAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "erro-avisar-regras.ts"
CODIGO = re.compile(r"^[0-9a-f]{8}$")

# a /erro-teste abre com query e # (dado pessoal falso também): a rota do aviso tem que sair só "/erro-teste"
ROTA_TESTE = "/erro-teste?email=maria.teste%40exemplo.com&cpf=12345678909#ancora-hml10"
# o que as mensagens de erro da /erro-teste (src/publico/ErroDeTeste.tsx) e do P6 levam: a tela não mostra nada disso…
NA_TELA_NAO = ("hml-10", "quebrou de propósito", "maria.teste", "@exemplo.com", "123.456.789-09", "99999-1234", "assinaturaFalsa")
# …e o aviso não leva o dado pessoal nem a query/# da página
NO_AVISO_NAO = ("maria.teste", "@exemplo.com", "exemplo.com", "123.456.789-09", "12345678909", "99999-1234", "assinaturaFalsa", "eyJ",
                "ancora-hml10", "email=", "cpf=")
CHUNK_QUEBRADO = ('throw new Error("hml-10 P6: erro de teste só neste navegador — maria.teste@exemplo.com, CPF 123.456.789-09");\n')

# lerAviso (o que a erro-avisar faz com o corpo do navegador) + assinatura: o 🔑 que o aviso vai mostrar
NODE_ASSINATURA = r"""
import { pathToFileURL } from "node:url";
const [regras, erros] = process.argv.slice(1);
const { lerAviso } = await import(pathToFileURL(regras).href);
const { assinatura } = await import(pathToFileURL(erros).href);
let texto = "";
for await (const parte of process.stdin) texto += parte;
const lido = lerAviso(JSON.parse(texto), "navegador");
process.stdout.write(lido ? assinatura(lido) : "recusado");
"""


class Saida:
    """✅/❌ na tela e numa cópia em texto (SAIDA/telas_<base>.txt)."""

    def __init__(self, nome: str) -> None:
        self.arquivo = SAIDA / f"{nome}.txt"
        self.linhas: list[str] = []
        self.oks = self.falhas = 0
        self.linha(f"# {nome} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

    def linha(self, texto: str) -> None:
        print(texto, flush=True)
        self.linhas.append(texto)

    def ok(self, cond: object, texto: str) -> bool:
        if cond:
            self.oks += 1
            self.linha("✅ " + texto)
            return True
        self.falhas += 1
        self.linha("❌ " + texto)
        return False

    def fim(self) -> int:
        total = self.oks + self.falhas
        self.linha(f"\n{self.oks}/{total} ok" + (" — COM FALHA" if self.falhas else "") + f" · cópia: {self.arquivo}")
        SAIDA.mkdir(parents=True, exist_ok=True)
        self.arquivo.write_text("\n".join(self.linhas) + "\n", encoding="utf-8")
        return 1 if self.falhas else 0


def assinatura_do_servidor(corpo: dict) -> str:
    """O código que a erro-avisar calcula do corpo (o próprio _shared/erros.ts, pelo Node com os tipos apagados)."""
    r = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", NODE_ASSINATURA, str(REGRAS_TS), str(ERROS_TS)],
        input=json.dumps(corpo), capture_output=True, text=True, timeout=60, cwd=str(REPO),
    )
    return r.stdout.strip() if r.returncode == 0 else f"node falhou: {r.stderr.strip()[:200]}"


def versao_do_build(pw, base: str) -> tuple[str, str]:
    """A versão do build que está no ar: o /health.json dele (D7). Sem ele (deploy de antes da hml-10), a do package.json daqui."""
    req = pw.request.new_context()
    try:
        r = req.get(BASES[base] + "/health.json", timeout=30_000)
        dados = r.json() if r.ok and "json" in (r.headers.get("content-type") or "") else {}
        versao = dados.get("versao") if isinstance(dados, dict) else None
        if isinstance(versao, str) and versao:
            return versao, f"/health.json (schema {dados.get('schema')}, commit {dados.get('commit')})"
    except Exception:  # noqa: BLE001
        pass
    finally:
        req.dispose()
    return VERSAO_DO_REPO, "package.json desta worktree (o build no ar não tem /health.json)"


def host_do_principal() -> str:
    """O host do principal do build local (VITE_PRINCIPAL_URL do .env.local) — no --base local ele não resolve no navegador."""
    try:
        for linha in (REPO / ".env.local").read_text(encoding="utf-8").splitlines():
            if linha.startswith("VITE_PRINCIPAL_URL="):
                return urlparse(linha.split("=", 1)[1].strip().strip('"')).hostname or ""
    except FileNotFoundError:
        pass
    return ""


class Caso:
    """Um contexto limpo do navegador (celular 390 px, Service Worker bloqueado: os pedidos passam pelo Playwright)."""

    def __init__(self, nav, base: str, nome: str) -> None:
        self.base, self.nome = base, nome
        self.url = BASES[base]
        self.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                                   locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
        self.pg = self.ctx.new_page()
        self.avisos: list[dict] = []
        self.erros: list[str] = []
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("request", self._pedido)
        if base == "local":
            # nenhum aviso de verdade no local: a erro-avisar é respondida aqui
            self.ctx.route("**/functions/v1/erro-avisar**", self._responder_204)

    def _pedido(self, req) -> None:
        if "/functions/v1/erro-avisar" in req.url and req.method == "POST":
            bruto = req.post_data or ""
            try:
                corpo = json.loads(bruto)
            except ValueError:
                corpo = {}
            self.avisos.append({"url": req.url, "bruto": bruto, "corpo": corpo, "req": req})

    @staticmethod
    def _responder_204(route) -> None:
        origem = route.request.headers.get("origin") or BASES["local"]
        route.fulfill(status=204, headers={"Access-Control-Allow-Origin": origem, "Vary": "Origin"})

    def ir(self, rota: str) -> None:
        self.pg.goto(self.url + rota, wait_until="domcontentloaded", timeout=60_000)

    def esperar(self, cond, timeout: float, passo: float = 0.4) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — navegando
                pass
            self.pg.wait_for_timeout(passo * 1000)
        return False

    def visivel(self, seletor: str) -> bool:
        loc = self.pg.locator(seletor)
        return loc.count() > 0 and loc.first.is_visible()

    def texto(self) -> str:
        try:
            return self.pg.inner_text("body")
        except Exception:  # noqa: BLE001
            return ""

    def botao(self, nome: str):
        return self.pg.get_by_role("button", name=nome, exact=True)

    def avisos_de(self, origem: str) -> list[dict]:
        return [a for a in self.avisos if a["corpo"].get("origem") == origem]

    def print(self, nome: str) -> str:
        PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = PRINTS / f"{self.base}_{nome}.png"
        self.pg.wait_for_timeout(900)
        self.pg.screenshot(path=str(caminho))
        return str(caminho)

    def fim(self) -> None:
        self.ctx.close()


def status_do_aviso(aviso: dict) -> int | str:
    try:
        resposta = aviso["req"].response()
    except Exception as e:  # noqa: BLE001
        return f"sem resposta ({type(e).__name__})"
    return resposta.status if resposta is not None else "sem resposta"


def conferir_aviso(o: Saida, c: Caso, rotulo: str, aviso: dict, esperado: dict, marcas: tuple[str, ...], codigo_tela: str | None) -> None:
    """O POST ao erro-avisar: endereço, pedido simples, corpo limpo e (com a tela) o mesmo código."""
    corpo, bruto = aviso["corpo"], aviso["bruto"]
    o.ok(aviso["url"].split("/functions/v1/")[-1] == f"erro-avisar?schema={SCHEMA[c.base]}",
         f"[{rotulo}] POST em …/functions/v1/erro-avisar?schema={SCHEMA[c.base]} ({aviso['url']})")
    try:
        cab = {k.lower(): v for k, v in aviso["req"].all_headers().items()}
    except Exception:  # noqa: BLE001
        cab = {k.lower(): v for k, v in aviso["req"].headers.items()}
    o.ok(cab.get("content-type", "").startswith("text/plain") and not any(k in cab for k in ("apikey", "authorization", "x-schema")),
         f"[{rotulo}] pedido simples: text/plain, sem apikey, sessão nem x-schema ({cab.get('content-type')})")
    for chave, valor in esperado.items():
        o.ok(corpo.get(chave) == valor, f"[{rotulo}] corpo.{chave} = {valor!r} ({corpo.get(chave)!r})")
    o.ok(corpo.get("versao") == VERSAO["esperada"] and corpo.get("plataforma") == "site",
         f"[{rotulo}] versão {VERSAO['esperada']} e plataforma site ({corpo.get('versao')!r}, {corpo.get('plataforma')!r})")
    mensagem = str(corpo.get("mensagem", ""))
    o.ok(all(m in mensagem for m in marcas), f"[{rotulo}] mensagem limpa com {', '.join(marcas)}: {mensagem!r}")
    vazou = [p for p in NO_AVISO_NAO if p in bruto]
    o.ok(not vazou, f"[{rotulo}] nada de dado pessoal, query ou # no corpo ({vazou or 'nada'})")
    o.ok(len(bruto.encode("utf-8")) <= 2048, f"[{rotulo}] corpo com {len(bruto.encode('utf-8'))} bytes (≤ 2 KB)")
    servidor = assinatura_do_servidor(corpo)
    if codigo_tela is not None:
        o.ok(servidor == codigo_tela, f"[{rotulo}] o código da tela ({codigo_tela}) = o 🔑 que a erro-avisar calcula do corpo ({servidor})")
    else:
        o.ok(bool(CODIGO.match(servidor)), f"[{rotulo}] a erro-avisar aceita o corpo (🔑 {servidor})")
    st = status_do_aviso(aviso)
    o.ok(st == 204, f"[{rotulo}] resposta da erro-avisar: {st}" + (" (o Playwright, no lugar da função)" if c.base == "local" else " (de verdade)"))


def conferir_tela_limpa(o: Saida, c: Caso, rotulo: str) -> None:
    texto = c.texto()
    vazou = [p for p in NA_TELA_NAO if p in texto]
    o.ok(not vazou, f"[{rotulo}] a message do erro (e o dado pessoal falso) não aparece na tela ({vazou or 'nada'})")
    o.ok(len(texto.strip()) > 40, f"[{rotulo}] tela com conteúdo (sem tela branca): {len(texto.strip())} caracteres")


def codigo_na_tela(o: Saida, c: Caso, rotulo: str) -> str:
    loc = c.pg.locator("[data-codigo-erro]")
    codigo = (loc.first.get_attribute("data-codigo-erro") or "") if loc.count() else ""
    visivel = loc.count() > 0 and loc.first.is_visible() and codigo in (loc.first.inner_text() or "")
    o.ok(bool(CODIGO.match(codigo)) and visivel, f"[{rotulo}] código de 8 hex visível na tela ({codigo or 'sem código'})")
    return codigo


def abrir_teste(o: Saida, c: Caso, rotulo: str) -> bool:
    c.ir(ROTA_TESTE)
    ok = c.esperar(lambda: c.botao("quebrar a tela").is_visible(), 60)
    o.ok(ok, f"[{rotulo}] /erro-teste abre (staging)")
    return ok


def caso_s1(nav, base: str, o: Saida) -> None:
    c = Caso(nav, base, "S1")
    try:
        if not abrir_teste(o, c, "S1"):
            return
        c.botao("quebrar a tela").click()
        ok = c.esperar(lambda: c.pg.get_by_role("heading", name="Algo deu errado").is_visible(), 20)
        o.ok(ok, "[S1] \"quebrar a tela\" → a tela de erro geral (\"Algo deu errado\", o ErrorBoundary)")
        o.ok("Já recebemos o aviso. Tente de novo; se continuar, fale com o suporte." in c.texto(), "[S1] o texto novo")
        codigo = codigo_na_tela(o, c, "S1")
        o.ok(f"Código: {codigo}" in c.texto(), f"[S1] \"Código: {codigo}\" na tela")
        href = c.pg.get_by_role("link", name="Falar com o suporte").get_attribute("href") or ""
        o.ok(href.startswith("mailto:") and codigo in href, f"[S1] \"Falar com o suporte\" com o código no assunto ({href[:90]})")
        conferir_tela_limpa(o, c, "S1")
        c.esperar(lambda: c.avisos_de("tela"), 15)
        o.linha(f"   print: {c.print('S1_tela_de_erro_geral')}")
        avisos = c.avisos_de("tela")
        o.ok(len(avisos) == 1, f"[S1] 1 aviso de origem tela ({len(avisos)})")
        if avisos:
            conferir_aviso(o, c, "S1", avisos[0], {"origem": "tela", "rota": "/erro-teste", "lugar": "tela inteira"},
                           ("hml-10 S1", "[e-mail]", "[cpf]", "[token]"), codigo)
        c.botao("Tentar novamente").click()
        o.ok(c.esperar(lambda: c.botao("quebrar a tela").is_visible(), 20), "[S1] \"Tentar novamente\" volta à página")
        o.ok(not c.erros, f"[S1] sem erro solto na página ({c.erros[:2]})")
    finally:
        c.fim()


def caso_s2(nav, base: str, o: Saida) -> None:
    c = Caso(nav, base, "S2")
    try:
        if not abrir_teste(o, c, "S2"):
            return
        c.botao("quebrar esta parte").click()
        ok = c.esperar(lambda: c.pg.get_by_text("Não deu para abrir esta parte", exact=True).is_visible(), 20)
        o.ok(ok, "[S2] \"quebrar esta parte\" → a tela de erro de uma parte (\"Não deu para abrir esta parte\", o LimiteDeErro)")
        codigo = codigo_na_tela(o, c, "S2")
        o.ok(f"Tente de novo. Se continuar, fale com o suporte (código {codigo})." in c.texto(), "[S2] o texto novo com o código")
        o.ok(c.botao("quebrar a tela").is_visible() and "Teste das telas de erro" in c.texto(), "[S2] o resto da página continua")
        conferir_tela_limpa(o, c, "S2")
        c.esperar(lambda: c.avisos_de("tela"), 15)
        o.linha(f"   print: {c.print('S2_tela_de_erro_parte')}")
        avisos = c.avisos_de("tela")
        o.ok(len(avisos) == 1, f"[S2] 1 aviso de origem tela ({len(avisos)})")
        if avisos:
            conferir_aviso(o, c, "S2", avisos[0], {"origem": "tela", "rota": "/erro-teste", "lugar": "erro de teste"},
                           ("hml-10 S2", "[e-mail]", "[telefone]"), codigo)
        # a parte continua armada: "Tentar de novo" quebra de novo, com o mesmo código e sem 2º aviso neste carregamento
        c.botao("Tentar de novo").click()
        c.pg.wait_for_timeout(2500)
        o.ok(c.pg.get_by_text("Não deu para abrir esta parte", exact=True).is_visible() and codigo_na_tela(o, c, "S2 de novo") == codigo,
             "[S2] \"Tentar de novo\" com a parte ainda quebrada: a mesma tela, o mesmo código")
        o.ok(len(c.avisos_de("tela")) == 1, f"[S2] sem 2º aviso do mesmo erro no mesmo carregamento ({len(c.avisos_de('tela'))})")
        o.ok(not c.erros, f"[S2] sem erro solto na página ({c.erros[:2]})")
    finally:
        c.fim()


def caso_promessa(nav, base: str, o: Saida) -> None:
    c = Caso(nav, base, "PR")
    try:
        if not abrir_teste(o, c, "PR"):
            return
        c.botao("promessa sem catch").click()
        o.ok(c.esperar(lambda: c.avisos_de("promessa"), 15), "[PR] \"promessa sem catch\" → aviso de origem promessa")
        avisos = c.avisos_de("promessa")
        if avisos:
            conferir_aviso(o, c, "PR", avisos[0], {"origem": "promessa", "rota": "/erro-teste"}, ("hml-10 promessa", "[e-mail]"), None)
            o.ok("lugar" not in avisos[0]["corpo"], f"[PR] sem lugar ({avisos[0]['corpo'].get('lugar')!r})")
        c.botao("promessa sem catch").click()
        c.pg.wait_for_timeout(2500)
        o.ok(len(c.avisos_de("promessa")) == 1, f"[PR] a 2ª igual não manda de novo ({len(c.avisos_de('promessa'))})")
        o.ok(c.botao("quebrar a tela").is_visible(), "[PR] a página continua de pé")
        o.ok(any("hml-10 promessa" in e for e in c.erros), f"[PR] o navegador viu a promessa sem catch ({len(c.erros)} erro(s) solto(s))")
    finally:
        c.fim()


def caso_rota_cortada(nav, base: str, o: Saida) -> None:
    c = Caso(nav, base, "sem_rota")
    try:
        c.ir(ROTA_TESTE)
        ok = c.esperar(lambda: "Página não encontrada" in c.texto(), 60)
        o.ok(ok, "[produção] /erro-teste não existe (\"Página não encontrada\"): a página de teste foi cortada do build")
        o.ok(not c.pg.get_by_role("button", name="quebrar a tela", exact=True).count(), "[produção] nenhum botão de teste")
        o.linha(f"   print: {c.print('erro_teste_nao_existe')}")
        o.ok(not c.avisos, f"[produção] nenhum aviso ao abrir a rota ({len(c.avisos)})")
    finally:
        c.fim()


def caso_p6(nav, base: str, o: Saida) -> None:
    c = Caso(nav, base, "P6")
    trocados: list[str] = []

    def trocar_chunk(route) -> None:
        trocados.append(route.request.url)
        route.fulfill(status=200, content_type="application/javascript; charset=utf-8", body=CHUNK_QUEBRADO, headers={"Cache-Control": "no-store"})

    try:
        c.ctx.route(re.compile(r"/assets/Privacidade-[A-Za-z0-9_-]+\.js(?:\?.*)?$"), trocar_chunk)
        c.ir("/privacidade")
        ok = c.esperar(lambda: c.pg.get_by_text("Não deu para abrir esta parte", exact=True).is_visible(), 60)
        o.ok(bool(trocados), f"[P6] o chunk da /privacidade foi trocado só neste navegador ({[t.rsplit('/', 1)[-1] for t in trocados]})")
        o.ok(ok, "[P6] /privacidade com o chunk quebrado → a tela de erro de uma parte (o LimiteDeErro do Carregavel)")
        codigo = codigo_na_tela(o, c, "P6")
        o.ok(f"Tente de novo. Se continuar, fale com o suporte (código {codigo})." in c.texto(), "[P6] o texto novo com o código")
        o.ok(c.visivel('[data-casca="publico"]'), "[P6] a casca pública (marca e rodapé) continua")
        conferir_tela_limpa(o, c, "P6")
        c.esperar(lambda: c.avisos_de("tela"), 15)
        o.linha(f"   print: {c.print('P6_S2_privacidade')}")
        avisos = c.avisos_de("tela")
        o.ok(len(avisos) == 1, f"[P6] 1 aviso de origem tela ({len(avisos)})")
        if avisos:
            conferir_aviso(o, c, "P6", avisos[0], {"origem": "tela", "rota": "/privacidade", "lugar": "pública Privacidade"},
                           ("hml-10 P6", "[e-mail]", "[cpf]"), codigo)
        o.ok(not c.erros, f"[P6] sem erro solto na página ({c.erros[:2]})")
    finally:
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n")[0])
    ap.add_argument("--base", required=True, choices=tuple(BASES))
    ap.add_argument("--p6", action="store_true", help="P6: a tela de erro de uma parte com o chunk da /privacidade trocado (em prod, 1 aviso de verdade)")
    a = ap.parse_args()
    o = Saida(f"telas_{a.base}" + ("_p6" if a.p6 else ""))
    o.linha(f"base {a.base} = {BASES[a.base]} · schema {SCHEMA[a.base]}")
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    if a.base == "local":
        host = host_do_principal()
        if host:
            # garantia: mesmo se a rota do Playwright falhar, o aviso não chega ao principal de verdade
            args.append(f"--host-resolver-rules=MAP {host} ~NOTFOUND")
            o.linha(f"local: {host} não resolve neste navegador; a erro-avisar responde pelo Playwright (204)")
    t0 = time.time()
    with sync_playwright() as pw:
        VERSAO["esperada"], fonte = versao_do_build(pw, a.base)
        o.linha(f"versão esperada no aviso: {VERSAO['esperada']} ({fonte})")
        nav = pw.chromium.launch(args=args)
        try:
            casos = [caso_rota_cortada] if a.base == "prod" else [caso_s1, caso_s2, caso_promessa]
            if a.p6:
                casos.append(caso_p6)
            for caso in casos:
                o.linha(f"\n── {caso.__name__.replace('caso_', '')}")
                try:
                    caso(nav, a.base, o)
                except Exception as e:  # noqa: BLE001
                    o.ok(False, f"[{caso.__name__}] exceção: {str(e)[:300]}")
        finally:
            nav.close()
    o.linha(f"\nhml-10 · telas ({a.base}) · {time.time() - t0:.0f}s")
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
