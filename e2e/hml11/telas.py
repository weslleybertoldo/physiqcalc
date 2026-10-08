#!/usr/bin/env python3
"""hml-11 (H-28, D14) — as telas dos textos legais: a Política em vigor com as correções de fato (A2), o texto novo em revisão
(só no build de staging), o resumo antes de pagar nas 3 telas que vendem e a trava de pagamento que deixa excluir a conta.

Dois modos (o build decide o que existe):
  --modo staging    build com VITE_DB_SCHEMA=staging (o vite preview local ou o physiqcalc-staging.vercel.app): /privacidade,
                    /termos e /assinatura são o texto NOVO com a faixa "em revisão"; o resumo aparece nas telas que vendem.
  --modo producao   build public (o vite preview local ou physiqcalc.com.br): a Política de hoje com o A2; /assinatura não
                    existe; nenhuma marca do texto novo no HTML nem nos JS (o mesmo que a guarda de CI confere no dist).

Casos (spec §3.3): S1 /privacidade de hoje com o A2 (producao) · S2 /excluir-conta (a frase nova dos backups; no staging, a da
desistência) · S3 /privacidade nova · S4 /termos · S5 /assinatura · S10 impressão da /termos (PDF) · S6 Configurações › Plano
(w5-dono, em teste) · S7 Boas-vindas › Treinar sem profissional (excluir2 com a situação forçada sem_nada SÓ na resposta) ·
S8 Perfil › Meu plano (w7b-sozinho) · S9 Configurações › Excluir minha conta (w5-dono) · S11 trava "Seus dias grátis
acabaram" (w7b-vence com o financeiro_do_aluno forçado vencido SÓ na resposta) → Perfil reduzido → Excluir aberto e FECHADO.
S6–S9 e S11 só no modo staging (contas de TESTE do schema staging). NADA é pago, assinado, começado nem excluído: o script
nunca clica em pagar, assinar, "Começar" nem confirma a exclusão; no fim, logout scope=local das sessões que abriu.

Uso: python3 e2e/hml11/telas.py --base http://localhost:8080 --prefixo local --modo staging [--casos S3,S4]
     python3 e2e/hml11/telas.py --base http://localhost:8081 --prefixo local-prod --modo producao
     python3 e2e/hml11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --modo staging
     python3 e2e/hml11/telas.py --base https://physiqcalc.com.br --prefixo prod --modo producao
Prints em ~/projetos/physiqcalc-scratch/prints/hml11/<prefixo>_<caso>.png; cópia da saída em ~/projetos/physiqcalc-scratch/hml/hml11/.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import importlib.util
import re
import sys
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", Path(__file__).resolve().parent.parent / "hml09" / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]

B5 = C.B5
B5.ESTADO["schema"] = "staging"  # local e staging falam com o schema staging (as contas de teste só existem lá)
C.SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml11"
B5.PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml11"

VERSAO = "2026-10-08"
# marcas que só existem no texto novo (as mesmas da guarda scripts/ci/sem-texto-legal-novo.sh)
MARCAS_NOVAS = ("Termos de assinatura do Physiq", "data-texto-em-revisao", "data-pagina-legal", "data-resumo-antes-de-pagar")
MARCADORES_DE_RASCUNHO = re.compile(r"\[(?:CONFERIR|DEPENDE|P\d+\])|rascunho|a confirmar", re.I)
CONTAS = {
    "w5-dono": "w5.dono.teste.claude@physiqnutri.app",
    "w7b-sozinho": "w7b.sozinho.teste.claude@physiqnutri.app",
    "w7b-vence": "w7b.vence.teste.claude@physiqnutri.app",
    "excluir2": "excluir2.teste.claude@physiqnutri.app",
}
TODOS = ("S1", "S2", "S3", "S4", "S5", "S10", "S6", "S7", "S8", "S9", "S11", "JS")


def texto_de(caso, seletor: str) -> str:
    loc = caso.pg.locator(seletor)
    return re.sub(r"\s+", " ", loc.first.inner_text()).strip() if loc.count() else ""


def abrir_publica(caso, rota: str, seletor: str, timeout: float = 30) -> bool:
    caso.ir(rota)
    return caso.esperar(lambda: caso.tem(seletor), timeout)


def rolar_ate(caso, seletor: str) -> None:
    loc = caso.pg.locator(seletor)
    if loc.count():
        loc.first.scroll_into_view_if_needed()
        caso.pg.wait_for_timeout(400)


# ───────────────────────── páginas públicas ─────────────────────────
def s1_politica_de_hoje(o, nav, base: str, prefixo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "S1", desktop=False)
    try:
        o.ok(abrir_publica(caso, "/privacidade", "[data-pagina-privacidade]"), "S1 /privacidade abre a Política em vigor (a de hoje)")
        o.ok(caso.pg.locator("[data-pagina-legal]").count() == 0 and caso.pg.locator("[data-texto-em-revisao]").count() == 0,
             "S1 sem o texto novo e sem a faixa 'em revisão'")
        o.ok(texto_de(caso, "[data-atualizada-em]") == "Última atualização: 8 de outubro de 2026", f"S1 data nova ({texto_de(caso, '[data-atualizada-em]')!r})")
        servicos = [s.get_attribute("data-servico") for s in caso.pg.locator("[data-servico]").all()]
        o.ok("telegram" in servicos, f"S1 o Telegram está nos serviços ({servicos})")
        google = texto_de(caso, "[data-servico='google']")
        o.ok("texto do aviso" not in google and "texto curto, fixo para cada tipo de aviso" in google, "S1 a frase nova do Google (push só com o texto fixo)")
        corpo = caso.texto()
        o.ok("us-east-1 (Estados Unidos)" in corpo, "S1 us-east-1 = Estados Unidos")
        o.ok(texto_de(caso, "[data-frase-series]").endswith("do aparelho e do banco."), "S1 as séries de 12 meses saem do aparelho e do banco")
        o.ok("o cadastro de um aluno removido não é apagado pela lixeira" in texto_de(caso, "[data-frase-lixeira]"), "S1 a lixeira diz o que apaga")
        backups = texto_de(caso, "[data-secao-privacidade='retencao'] [data-frase-backups]")
        o.ok("a cópia diária" in backups and "provedor" not in backups, "S1 a frase nova dos backups (a cópia diária cifrada)")
        o.linha(f"   print: {caso.print('S1_privacidade_topo')}")
        rolar_ate(caso, "[data-secao-privacidade='terceiros']")
        o.linha(f"   print: {caso.print('S1_privacidade_servicos')}")
        rolar_ate(caso, "[data-secao-privacidade='retencao']")
        o.linha(f"   print: {caso.print('S1_privacidade_retencao')}")
        caso.ir("/termos")
        caso.esperar(lambda: caso.tem("[data-pagina-privacidade]"), 30)
        o.ok(caso.pg.locator("[data-pagina-privacidade]").first.get_attribute("data-rota") == "termos", "S4 /termos = a mesma página de hoje (parte dos termos)")
        caso.ir("/assinatura")
        o.ok(caso.esperar(lambda: caso.tem("[data-nao-encontrada]"), 30), "S5 /assinatura → 'Página não encontrada'")
    finally:
        caso.fim()


def s2_excluir_conta(o, nav, base: str, prefixo: str, staging: bool) -> None:
    caso = B5.Caso(nav, base, prefixo, "S2", desktop=False)
    try:
        o.ok(abrir_publica(caso, "/excluir-conta", "[data-secao-excluir='guardado']"), "S2 /excluir-conta abre")
        backups = texto_de(caso, "[data-secao-excluir='guardado'] [data-frase-backups]")
        o.ok("são cifradas, guardadas no Brasil e apagadas em até 30 dias" in backups, "S2 'O que fica guardado' com a frase nova dos backups")
        corpo = caso.texto()
        if staging:
            o.ok(caso.tem("[data-frase-desistencia]") and "salvo a desistência em até 7 dias" in texto_de(caso, "[data-frase-desistencia]"),
                 "S2 (staging) a frase da desistência em 7 dias no lugar de 'sem reembolso'")
        else:
            o.ok("sem reembolso do que já foi pago" in corpo and not caso.tem("[data-frase-desistencia]"), "S2 (produção) a frase de hoje ('sem reembolso') continua")
        rolar_ate(caso, "[data-secao-excluir='guardado']")
        o.linha(f"   print: {caso.print('S2_excluir_conta_guardado')}")
    finally:
        caso.fim()


def conferir_documento(o, caso, tipo: str, titulo_caso: str) -> str:
    sel = f"[data-pagina-legal='{tipo}']"
    o.ok(caso.esperar(lambda: caso.tem(sel), 30), f"{titulo_caso} abre o documento '{tipo}'")
    pagina = caso.pg.locator(sel)
    o.ok(pagina.count() and pagina.first.get_attribute("data-versao") == VERSAO, f"{titulo_caso} versão {VERSAO}")
    o.ok(caso.tem("[data-texto-em-revisao]"), f"{titulo_caso} faixa 'Versão em revisão' presente")
    o.ok(caso.tem("[data-imprimir]"), f"{titulo_caso} botão Imprimir ou salvar em PDF")
    outros = {"politica", "termos", "assinatura"} - {tipo}
    links = {l.get_attribute("data-link-legal") for l in caso.pg.locator("[data-link-legal]").all()}
    o.ok(outros <= links, f"{titulo_caso} links para os outros 2 documentos ({sorted(links)})")
    corpo = texto_de(caso, sel)
    o.ok(not MARCADORES_DE_RASCUNHO.search(corpo), f"{titulo_caso} nenhum marcador de rascunho ({(MARCADORES_DE_RASCUNHO.search(corpo) or [''])[0]!r})")
    o.ok("8 de outubro de 2026" in corpo, f"{titulo_caso} 'Versão de 8 de outubro de 2026'")
    o.ok("Weslley Bertoldo" in corpo and bool(re.search(r"CPF|CNPJ", corpo)), f"{titulo_caso} o vendedor identificado (nome + CPF/CNPJ)")
    return corpo


def s3_s5_textos_novos(o, nav, base: str, prefixo: str) -> None:
    for desktop in (False, True):
        caso = B5.Caso(nav, base, prefixo, "S3-S5" + ("-pc" if desktop else ""), desktop=desktop)
        sufixo = "_pc" if desktop else ""
        try:
            caso.ir("/privacidade")
            politica = conferir_documento(o, caso, "politica", f"S3{sufixo} /privacidade nova")
            o.ok(caso.pg.locator("[data-pagina-privacidade]").count() == 0, f"S3{sufixo} a página antiga não aparece no staging")
            if not desktop:
                for trecho in ("controlador", "operador", "16 anos", "18 anos", "Telegram", "art. 33"):
                    o.ok(trecho in politica, f"S3 a Política nova cita '{trecho}'")
            o.linha(f"   print: {caso.print('S3_politica_nova' + sufixo)}")
            caso.ir("/termos")
            termos = conferir_documento(o, caso, "termos", f"S4{sufixo} /termos novo")
            o.ok(termos != politica and "não é um dispositivo médico" in termos and "Anexo" in termos, f"S4{sufixo} /termos ≠ /privacidade, com o Anexo")
            o.linha(f"   print: {caso.print('S4_termos' + sufixo)}")
            caso.ir("/assinatura")
            assinatura = conferir_documento(o, caso, "assinatura", f"S5{sufixo} /assinatura")
            if not desktop:
                for trecho in ("39,90", "59,90", "29,90", "49,90", "14 dias", "72 h", "7 dias", "Maceió"):
                    o.ok(trecho in assinatura, f"S5 os Termos de assinatura citam '{trecho}'")
            o.linha(f"   print: {caso.print('S5_assinatura' + sufixo)}")
            if not desktop:
                # o rodapé público do staging leva à assinatura; a casca some na impressão (S10)
                o.ok(caso.tem("[data-rodape-assinatura]"), "S5 rodapé público com 'Assinatura' (staging)")
                largura = caso.pg.evaluate("document.documentElement.scrollWidth")
                o.ok(largura <= 392, f"S5 sem rolagem horizontal da página em 390 px (scrollWidth {largura})")
        finally:
            caso.fim()


def s10_impressao(o, nav, base: str, prefixo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "S10", desktop=True)
    try:
        caso.ir("/termos")
        o.ok(caso.esperar(lambda: caso.tem("[data-pagina-legal='termos']"), 30), "S10 /termos aberto para imprimir")
        caso.pg.emulate_media(media="print")
        caso.pg.wait_for_timeout(500)
        o.linha(f"   print: {caso.print('S10_termos_impressao')}")
        pdf = B5.PRINTS / f"{prefixo}_S10_termos.pdf"
        caso.pg.pdf(path=str(pdf), format="A4", print_background=False)
        tamanho = pdf.stat().st_size if pdf.exists() else 0
        o.ok(tamanho > 20_000, f"S10 PDF da /termos gerado ({tamanho // 1024} KB) — {pdf}")
        caso.pg.emulate_media(media="screen")
    finally:
        caso.fim()


# ───────────────────────── telas logadas (staging) ─────────────────────────
def entrar(caso, conta: str, rota: str, sess) -> None:
    email = CONTAS[conta]
    if not C.eh_email_de_teste(email):
        raise SystemExit(f"não é conta de teste: {email}")
    B5.CONTAS[conta] = (email, B5.senha_de(conta))
    s = caso.entrar(conta, rota)
    sess.guardar("principal", s["access_token"], f"{conta} (sessão injetada)")
    caso.fechar_avisos()


def conferir_resumo(o, caso, marca: str, titulo: str) -> None:
    sel = f"[data-resumo-antes-de-pagar='{marca}']"
    o.ok(caso.esperar(lambda: caso.tem(sel), 45), f"{titulo} o resumo antes de pagar aparece")
    links = caso.pg.locator(f"{sel} [data-link-legal]")
    alvos = {(l.get_attribute("data-link-legal"), l.get_attribute("target"), l.get_attribute("href")) for l in links.all()}
    o.ok(("assinatura", "_blank", "/assinatura") in alvos and ("politica", "_blank", "/privacidade") in alvos,
         f"{titulo} links 'Termos de assinatura' e 'Política' em outra aba ({sorted(alvos)})")
    rolar_ate(caso, sel)


def s6_s9_dono(o, nav, base: str, prefixo: str, sess, casos: set[str]) -> None:
    caso = B5.Caso(nav, base, prefixo, "S6-S9", desktop=True)
    try:
        entrar(caso, "w5-dono", "/painel/configuracoes/plano", sess)
        if "S6" in casos:
            caso.ir("/painel/configuracoes/plano")
            conferir_resumo(o, caso, "plano-profissional", "S6 Configurações › Plano")
            o.linha(f"   print: {caso.print('S6_plano_resumo')}")
            if caso.tem("[data-frase-renovacao]"):
                o.ok("renova todo mês até você cancelar" in texto_de(caso, "[data-frase-renovacao]"), "S6 a renovação sem 'sem aviso'")
            o.ok("sem aviso" not in caso.texto(), "S6 a frase 'renova todo mês, sem aviso' não aparece no staging")
        if "S9" in casos:
            caso.ir("/painel/configuracoes/excluir-conta")
            o.ok(caso.esperar(lambda: caso.tem("[data-frase-desistencia]"), 45), "S9 Excluir minha conta (dono) com a frase da desistência")
            o.ok("salvo a desistência em até 7 dias" in texto_de(caso, "[data-frase-desistencia]"), "S9 'salvo a desistência em até 7 dias depois do pagamento'")
            rolar_ate(caso, "[data-frase-desistencia]")
            o.linha(f"   print: {caso.print('S9_excluir_conta_dono')}")
    finally:
        caso.fim()


def s7_sem_profissional(o, nav, base: str, prefixo: str, sess) -> None:
    caso = B5.Caso(nav, base, prefixo, "S7", desktop=False)
    forcados = {"n": 0}

    def sem_nada(route) -> None:
        if route.request.method == "OPTIONS":
            route.continue_()
            return
        r = route.fetch()
        try:
            corpo = r.json()
        except Exception:  # noqa: BLE001
            route.fulfill(response=r)
            return
        alvo = corpo.get("situacao") if isinstance(corpo, dict) and isinstance(corpo.get("situacao"), dict) else corpo
        if isinstance(alvo, dict) and "sem_nada" in alvo:
            alvo["sem_nada"] = True
            forcados["n"] += 1
        route.fulfill(response=r, json=corpo)

    try:
        caso.pg.route("**/rest/v1/rpc/minha_situacao*", sem_nada)
        caso.pg.route("**/functions/v1/pos-login*", sem_nada)
        entrar(caso, "excluir2", "/", sess)
        caso.esperar(lambda: caso.tem("[data-sozinho-abrir]"), 60)
        o.ok(forcados["n"] > 0 and caso.tem("[data-sozinho-abrir]"), f"S7 Boas-vindas com 'Treinar sem profissional' (sem_nada forçado {forcados['n']}×)")
        caso.pg.locator("[data-sozinho-abrir]").first.click()
        o.ok(caso.esperar(lambda: caso.tem("[data-form-sozinho]"), 30), "S7 o cartão abriu (sem clicar em 'Começar')")
        conferir_resumo(o, caso, "sem-profissional", "S7 Treinar sem profissional")
        o.linha(f"   print: {caso.print('S7_sem_profissional_resumo')}")
    finally:
        caso.fim()


def s8_meu_plano(o, nav, base: str, prefixo: str, sess) -> None:
    caso = B5.Caso(nav, base, prefixo, "S8", desktop=False)
    try:
        entrar(caso, "w7b-sozinho", "/perfil/meu-plano", sess)
        o.ok(caso.esperar(lambda: caso.tem("[data-pagina-meu-plano='app']"), 60), "S8 Perfil › Meu plano do aluno do app")
        conferir_resumo(o, caso, "meu-plano", "S8 Meu plano")
        o.linha(f"   print: {caso.print('S8_meu_plano_resumo')}")
    finally:
        caso.fim()


def s11_trava(o, nav, base: str, prefixo: str, sess) -> None:
    caso = B5.Caso(nav, base, prefixo, "S11", desktop=False)
    forcados = {"n": 0}
    vencido = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat()

    def vencer(route) -> None:
        # SÓ a resposta que a tela recebe: a conta do app fica com o teste acabado e sem pagamento (nada muda no banco)
        if route.request.method == "OPTIONS":
            route.continue_()
            return
        r = route.fetch()
        try:
            lista = r.json()
        except Exception:  # noqa: BLE001
            route.fulfill(response=r)
            return
        if isinstance(lista, list):
            for m in lista:
                if isinstance(m, dict) and m.get("app"):
                    m.update({"pago_ate": vencido, "teste_ate": vencido, "bloquear_inadimplente": True, "pausada": False,
                              "assinatura_ativa": False, "aguardando": False, "abertas": [], "aguardando_avulsas": 0})
                    forcados["n"] += 1
        route.fulfill(response=r, json=lista)

    try:
        caso.pg.route("**/rest/v1/rpc/financeiro_do_aluno*", vencer)
        entrar(caso, "w7b-vence", "/treino", sess)
        sel_trava = "[data-trava-app='pagamento-pendente-app']"
        o.ok(caso.esperar(lambda: caso.tem(sel_trava), 60), f"S11 a trava da conta do app (forçada {forcados['n']}×)")
        o.ok("Seus dias grátis acabaram" in texto_de(caso, sel_trava), "S11 'Seus dias grátis acabaram'")
        o.ok(caso.tem("[data-trava-pagar]") and caso.tem("[data-trava-meus-dados]"), "S11 a trava tem 'Pagar' e 'Exportar ou excluir meus dados'")
        o.linha(f"   print: {caso.print('S11_trava')}")
        caso.pg.locator("[data-trava-meus-dados]").first.click()
        o.ok(caso.esperar(lambda: caso.tem("[data-aba-perfil='reduzido']"), 30), "S11 o link abriu o Perfil reduzido")
        o.ok(caso.tem("[data-perfil-reduzido='pagamento-pendente-app']"), "S11 o Perfil reduzido diz o motivo (pagamento)")
        o.linha(f"   print: {caso.print('S11_perfil_reduzido')}")
        caso.ir("/perfil?excluir=1")
        folha = caso.pg.locator("[data-sheet-excluir]")
        estado = lambda: (folha.first.get_attribute("data-estado-excluir") or "") if folha.count() else ""  # noqa: E731
        caso.esperar(lambda: estado() not in ("", "conferindo"), 60)
        o.ok(estado() == "pronto", f"S11 /perfil?excluir=1 (a volta da /excluir-conta) abre o Excluir ({estado() or 'sem a folha'})")
        o.linha(f"   print: {caso.print('S11_excluir_aberto')}")
        caso.pg.keyboard.press("Escape")
        o.ok(caso.esperar(lambda: not caso.tem("[data-sheet-excluir]"), 10), "S11 a folha fechou sem confirmar (nada foi excluído)")
    finally:
        caso.fim()


# ───────────────────────── produção: nenhuma marca do texto novo nos JS ─────────────────────────
def baixar(url: str) -> str:
    """O corpo do arquivo; nome que não existe (o regex dos chunks pega um ou outro texto que parece nome) → ""."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "physiq-hml11"}), timeout=30) as r:  # noqa: S310
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def js_sem_marcas(o, base: str) -> None:
    html = baixar(base + "/")
    vistos: set[str] = set()
    fila = set(re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', html))
    achados: list[str] = []
    while fila and len(vistos) < 800:
        lote = sorted(fila - vistos)[:40]
        fila -= set(lote)
        with cf.ThreadPoolExecutor(8) as ex:
            for caminho, corpo in zip(lote, ex.map(lambda c: baixar(base + c), lote)):
                vistos.add(caminho)
                achados += [f"{caminho}: {m}" for m in MARCAS_NOVAS if m in corpo]
                fila |= {"/assets/" + n for n in re.findall(r'(?:assets/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js)', corpo)} - vistos
    o.ok(len(vistos) > 50, f"JS de produção baixados: {len(vistos)} arquivos")
    o.ok(not achados and not any(m in html for m in MARCAS_NOVAS), f"nenhuma marca do texto novo no HTML nem nos JS ({achados[:3]})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--modo", required=True, choices=("staging", "producao"))
    ap.add_argument("--casos", default=",".join(TODOS))
    a = ap.parse_args()
    base = a.base.rstrip("/")
    casos = {c.strip().upper() for c in a.casos.split(",") if c.strip()}
    staging = a.modo == "staging"
    o = C.Saida(f"telas_{a.prefixo}", parar=False)
    sess = C.Sessoes()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            if not staging:
                if casos & {"S1", "S4", "S5"}:
                    s1_politica_de_hoje(o, nav, base, a.prefixo)
                if "S2" in casos:
                    s2_excluir_conta(o, nav, base, a.prefixo, staging=False)
                if "JS" in casos:
                    js_sem_marcas(o, base)
            else:
                if "S2" in casos:
                    s2_excluir_conta(o, nav, base, a.prefixo, staging=True)
                if casos & {"S3", "S4", "S5"}:
                    s3_s5_textos_novos(o, nav, base, a.prefixo)
                if "S10" in casos:
                    s10_impressao(o, nav, base, a.prefixo)
                if casos & {"S6", "S9"}:
                    s6_s9_dono(o, nav, base, a.prefixo, sess, casos)
                if "S7" in casos:
                    s7_sem_profissional(o, nav, base, a.prefixo, sess)
                if "S8" in casos:
                    s8_meu_plano(o, nav, base, a.prefixo, sess)
                if "S11" in casos:
                    s11_trava(o, nav, base, a.prefixo, sess)
        finally:
            nav.close()
            sess.fechar(o)
    graves = [t for bom, t in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página ({graves[:2]})")
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
