#!/usr/bin/env python3
"""hml-11 (H-28, D14) → a VIRADA (29/10/2026) — as telas dos textos legais publicados: /privacidade, /termos e /assinatura com os
textos novos (sem a faixa "em revisão") em TODO build, o resumo antes de pagar nas telas que vendem, as frases da exclusão e a trava
de pagamento que deixa excluir a conta.

Três modos (o build decide o que existe; desde a virada o texto legal é o mesmo nos 3):
  --modo staging    build com VITE_DB_SCHEMA=staging (o vite preview local — a "ponte", com o banco do staging — ou o
                    physiqcalc-staging.vercel.app): as páginas e, com as contas de TESTE do schema staging, as telas logadas.
  --modo producao   build public (o vite preview local ou physiqcalc.com.br): SÓ as páginas públicas (sem conta) e o JS — o texto legal
                    TEM de estar no HTML/JS (o controle positivo da guarda de CI) e a faixa "em revisão" não.
  --modo loja       build:loja (VITE_DISTRIBUICAO=play): a /assinatura da versão da Google Play — o mesmo texto SEM o que só vale no site
                    (nada de Pix, Mercado Pago, cartão, cobrança automática nem a tabela de preços em R$), com a §15 e a desistência.

Casos: S2 /excluir-conta (a frase nova dos backups e a da desistência) · S3 /privacidade · S4 /termos · S5 /assinatura (+ o rodapé
com "Assinatura") · S5L /assinatura da loja · S10 impressão da /termos (PDF) · S6 Configurações › Plano (w5-dono, em teste) · S7
Boas-vindas › Treinar sem profissional (excluir2 com a situação forçada sem_nada SÓ na resposta: a data, o consentimento e o resumo) ·
S8 Perfil › Meu plano (w7b-sozinho) · S9 Configurações › Excluir minha conta (w5-dono) · S11 trava "Seus dias grátis acabaram"
(w7b-vence com o financeiro_do_aluno forçado vencido SÓ na resposta) → Perfil reduzido → Excluir aberto e FECHADO · JS.
S6–S9 e S11 só no modo staging (contas de TESTE do schema staging). NADA é pago, assinado, começado nem excluído: o script
nunca clica em pagar, assinar, "Começar" nem confirma a exclusão; no fim, logout scope=local das sessões que abriu.

Uso: python3 e2e/hml11/telas.py --base http://localhost:8080 --prefixo local --modo staging --canal msedge [--casos S3,S4]
     python3 e2e/hml11/telas.py --base http://localhost:8081 --prefixo local-prod --modo producao --canal msedge
     python3 e2e/hml11/telas.py --base http://localhost:8082 --prefixo local-loja --modo loja --canal msedge
     python3 e2e/hml11/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging --modo staging
     python3 e2e/hml11/telas.py --base https://physiqcalc.com.br --prefixo prod --modo producao
Prints em ~/projetos/physiqcalc-scratch/prints/hml11/<prefixo>_<caso>.png (HML11_PRINTS troca a pasta); cópia da saída em
~/projetos/physiqcalc-scratch/hml/hml11/.
"""
from __future__ import annotations

import argparse
import os
import concurrent.futures as cf
import datetime as dt
import importlib.util
import json
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
B5.PRINTS = Path(os.environ["HML11_PRINTS"]) if os.environ.get("HML11_PRINTS") else Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml11"

# a virada (29/10/2026): a versão e a data dos textos vêm do app (src/publico/legal/versao.ts), nunca fixas aqui
VERSAO = B5.versao_dos_textos()
_DATA = re.search(r'DATA_DOS_TEXTOS\s*=\s*"([^"]+)"', (B5.REPO / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8"))
DATA_DOS_TEXTOS = _DATA.group(1) if _DATA else ""
# a guarda de CI (scripts/ci/sem-texto-legal-novo.sh) depois da virada: o texto legal TEM de estar no build; a faixa "em revisão", não
MARCAS_DO_TEXTO = ("Termos de assinatura do Physiq", "data-pagina-legal", "data-aceite-no-acesso", "data-resumo-antes-de-pagar")
MARCA_EM_REVISAO = "data-texto-em-revisao"
# o que é só do site e não pode aparecer na /assinatura da versão da Google Play (a regra de pagamentos da Play)
SO_DO_SITE_NA_LOJA = re.compile(r"Mercado Pago|\bPix\b|cart[ãa]o|autom[áa]tic|R\$", re.I)
# \b: o "para confirmar que é uma pessoa" do Cloudflare (SERVICOS_TERCEIROS) não é o "a confirmar" de pendência (o mesmo do textos.test.ts)
MARCADORES_DE_RASCUNHO = re.compile(r"\[(?:CONFERIR|DEPENDE|P\d+\])|rascunho|\ba confirmar\b", re.I)
CONTAS = {
    "w5-dono": "w5.dono.teste.claude@physiqnutri.app",
    "w7b-sozinho": "w7b.sozinho.teste.claude@physiqnutri.app",
    "w7b-vence": "w7b.vence.teste.claude@physiqnutri.app",
    "excluir2": "excluir2.teste.claude@physiqnutri.app",
}
TODOS = ("S2", "S3", "S4", "S5", "S5L", "S10", "S6", "S7", "S8", "S9", "S11", "JS")


_PRINT_ORIGINAL = B5.Caso.print


def _print_com_nova_tentativa(self, nome: str) -> str:
    """O print com até 3 tentativas: no notebook o Chromium às vezes devolve "Unable to capture screenshot" num print isolado (o
    processo de GPU reinicia); a página continua viva e a tentativa seguinte sai. Outro erro (página caída) sobe na hora."""
    for tentativa in range(3):
        try:
            return _PRINT_ORIGINAL(self, nome)
        except Exception as e:  # noqa: BLE001
            if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                raise
            print(f"   (print {nome}: 'Unable to capture screenshot' — tentativa {tentativa + 2} de 3)", flush=True)
            self.pg.wait_for_timeout(1500)
    raise AssertionError("inalcançável")


B5.Caso.print = _print_com_nova_tentativa


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
def s2_excluir_conta(o, nav, base: str, prefixo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "S2", desktop=False)
    try:
        o.ok(abrir_publica(caso, "/excluir-conta", "[data-secao-excluir='guardado']"), "S2 /excluir-conta abre")
        backups = texto_de(caso, "[data-secao-excluir='guardado'] [data-frase-backups]")
        o.ok("são cifradas, guardadas no Brasil e apagadas em até 30 dias" in backups, "S2 'O que fica guardado' com a frase nova dos backups")
        corpo = caso.texto()
        # a virada: a frase da desistência e a dos aceites valem em todo build
        o.ok(caso.tem("[data-frase-desistencia]") and "salvo a desistência em até 7 dias" in texto_de(caso, "[data-frase-desistencia]")
             and "sem reembolso" not in corpo, "S2 a frase da desistência em 7 dias no lugar de 'sem reembolso'")
        o.ok("guardado por 5 anos, só para provar o aceite" in texto_de(caso, "[data-frase-aceites]"), "S2 o registro dos aceites fica 5 anos")
        rolar_ate(caso, "[data-secao-excluir='guardado']")
        o.linha(f"   print: {caso.print('excluir_conta_guardado')}")
    finally:
        caso.fim()


def conferir_documento(o, caso, tipo: str, titulo_caso: str) -> str:
    sel = f"[data-pagina-legal='{tipo}']"
    o.ok(caso.esperar(lambda: caso.tem(sel), 30), f"{titulo_caso} abre o documento '{tipo}'")
    pagina = caso.pg.locator(sel)
    o.ok(pagina.count() and pagina.first.get_attribute("data-versao") == VERSAO, f"{titulo_caso} versão {VERSAO}")
    # a virada: publicado — sem a faixa "Versão em revisão — ainda não publicada"
    o.ok(caso.pg.locator(f"[{MARCA_EM_REVISAO}]").count() == 0 and "ainda não publicada" not in caso.texto(), f"{titulo_caso} sem a faixa 'em revisão'")
    o.ok(caso.tem("[data-imprimir]"), f"{titulo_caso} botão Imprimir ou salvar em PDF")
    outros = {"politica", "termos", "assinatura"} - {tipo}
    links = {l.get_attribute("data-link-legal") for l in caso.pg.locator("[data-link-legal]").all()}
    o.ok(outros <= links, f"{titulo_caso} links para os outros 2 documentos ({sorted(links)})")
    corpo = texto_de(caso, sel)
    o.ok(not MARCADORES_DE_RASCUNHO.search(corpo), f"{titulo_caso} nenhum marcador de rascunho ({(MARCADORES_DE_RASCUNHO.search(corpo) or [''])[0]!r})")
    o.ok(f"Versão de {DATA_DOS_TEXTOS}" in caso.texto(), f"{titulo_caso} 'Versão de {DATA_DOS_TEXTOS}'")
    o.ok("Weslley Bertoldo" in corpo and bool(re.search(r"CPF|CNPJ", corpo)), f"{titulo_caso} o vendedor identificado (nome + CPF/CNPJ)")
    return corpo


def abrir_pelo_link(caso, doc: str) -> None:
    """Troca de documento pelo link do topo da página, como a pessoa faz (a navegação do app, sem recarregar). Recarregar 3 páginas
    longas seguidas na mesma aba (goto) derruba o chromium_headless_shell do Playwright na 3ª ("Target crashed" / "Unable to capture
    screenshot"; 6 de 6 em 08/10/2026) — no Chromium inteiro e no Edge a mesma sequência passa, e pelos links passa 10 de 10."""
    caso.pg.locator(f"header [data-link-legal='{doc}']").first.click()


def s3_s5_textos_novos(o, nav, base: str, prefixo: str, telas: tuple[bool, ...] = (False, True)) -> None:
    for desktop in telas:
        caso = B5.Caso(nav, base, prefixo, "S3-S5" + ("-pc" if desktop else ""), desktop=desktop)
        sufixo = "_pc" if desktop else ""
        try:
            caso.ir("/privacidade")
            politica = conferir_documento(o, caso, "politica", f"S3{sufixo} /privacidade nova")
            o.ok(caso.pg.locator("[data-pagina-privacidade]").count() == 0, f"S3{sufixo} a Política de antes não aparece (saiu na virada)")
            if not desktop:
                for trecho in ("controlador", "operador", "16 anos", "18 anos", "Telegram", "art. 33"):
                    o.ok(trecho in politica, f"S3 a Política nova cita '{trecho}'")
            o.linha(f"   print: {caso.print('privacidade' + sufixo)}")
            abrir_pelo_link(caso, "termos")
            termos = conferir_documento(o, caso, "termos", f"S4{sufixo} /termos novo")
            o.ok(termos != politica and "não é um dispositivo médico" in termos and "Anexo" in termos, f"S4{sufixo} /termos ≠ /privacidade, com o Anexo")
            o.linha(f"   print: {caso.print('termos' + sufixo)}")
            abrir_pelo_link(caso, "assinatura")
            assinatura = conferir_documento(o, caso, "assinatura", f"S5{sufixo} /assinatura")
            if not desktop:
                for trecho in ("39,90", "59,90", "20,00", "35,00", "14 dias", "72 h", "7 dias", "Maceió"):
                    o.ok(trecho in assinatura, f"S5 os Termos de assinatura citam '{trecho}'")
            o.linha(f"   print: {caso.print('assinatura' + sufixo)}")
            if not desktop:
                # o rodapé público leva à assinatura (a virada: em todo build); a casca some na impressão (S10)
                o.ok(caso.tem("[data-rodape-assinatura]") and caso.pg.locator("[data-rodape-assinatura]").first.get_attribute("href") == "/assinatura",
                     "S5 rodapé público com 'Assinatura' (/assinatura)")
                largura = caso.pg.evaluate("document.documentElement.scrollWidth")
                o.ok(largura <= 392, f"S5 sem rolagem horizontal da página em 390 px (scrollWidth {largura})")
                rolar_ate(caso, "footer")
                o.linha(f"   print: {caso.print('rodape_assinatura')}")
        finally:
            caso.fim()


def s10_impressao(o, nav, base: str, prefixo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "S10", desktop=True)
    try:
        caso.ir("/termos")
        o.ok(caso.esperar(lambda: caso.tem("[data-pagina-legal='termos']"), 30), "S10 /termos aberto para imprimir")
        caso.pg.emulate_media(media="print")
        caso.pg.wait_for_timeout(500)
        o.linha(f"   print: {caso.print('termos_impressao')}")
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
            o.linha(f"   print: {caso.print('plano_profissional')}")
            if caso.tem("[data-frase-renovacao]"):
                o.ok("renova todo mês até você cancelar" in texto_de(caso, "[data-frase-renovacao]"), "S6 a renovação sem 'sem aviso'")
            o.ok("sem aviso" not in caso.texto(), "S6 a frase 'renova todo mês, sem aviso' não aparece (saiu na virada)")
        if "S9" in casos:
            # a frase da desistência é a da cobrança automática do plano (regras.ts, textosDaCobranca): só aparece com ela ligada, e
            # a conta de teste (em teste) não tem — forçada SÓ na resposta da conferência (simular: true; nada muda no banco)
            forcados = {"n": 0}

            def com_cobranca(route) -> None:
                corpo_pedido = route.request.post_data or ""
                if route.request.method != "POST" or '"simular":true' not in corpo_pedido.replace(" ", ""):
                    route.continue_()
                    return
                r = route.fetch()
                try:
                    corpo = r.json()
                except Exception:  # noqa: BLE001
                    route.fulfill(response=r)
                    return
                for conta in corpo.get("contas") or [] if isinstance(corpo, dict) else []:
                    if isinstance(conta, dict) and isinstance(conta.get("cobrancas"), dict):
                        conta["cobrancas"]["plano"] = max(1, conta["cobrancas"].get("plano") or 0)
                        forcados["n"] += 1
                route.fulfill(response=r, json=corpo)

            caso.pg.route("**/functions/v1/excluir-minha-conta*", com_cobranca)
            caso.ir("/painel/configuracoes/excluir-conta")
            o.ok(caso.esperar(lambda: caso.tem("[data-frase-desistencia]"), 45), "S9 Excluir minha conta (dono) com a frase da desistência")
            o.ok("salvo a desistência em até 7 dias" in texto_de(caso, "[data-frase-desistencia]"), f"S9 'salvo a desistência em até 7 dias depois do pagamento' (cobrança forçada {forcados['n']}×)")
            rolar_ate(caso, "[data-frase-desistencia]")
            o.linha(f"   print: {caso.print('excluir_conta_dono')}")
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
        # hml-12 → a virada: a data de nascimento (18+) e o consentimento de saúde em destaque, antes do resumo e do "Começar"
        o.ok(caso.esperar(lambda: caso.tem("[data-campo-nascimento]") and caso.tem('[data-consentimento-saude="app"]'), 30),
             "S7 a data de nascimento e o consentimento de saúde antes de começar")
        comecar = caso.pg.locator("[data-sozinho-enviar]")
        o.ok(comecar.count() > 0 and comecar.first.is_disabled(), "S7 'Começar' travado sem a data e o consentimento (nada é começado)")
        conferir_resumo(o, caso, "sem-profissional", "S7 Treinar sem profissional")
        rolar_ate(caso, "[data-campo-nascimento]")
        o.linha(f"   print: {caso.print('treinar_sem_profissional')}")
        rolar_ate(caso, "[data-resumo-antes-de-pagar='sem-profissional']")
        o.linha(f"   print: {caso.print('treinar_sem_profissional_resumo')}")
    finally:
        caso.fim()


def s8_meu_plano(o, nav, base: str, prefixo: str, sess) -> None:
    caso = B5.Caso(nav, base, prefixo, "S8", desktop=False)
    try:
        entrar(caso, "w7b-sozinho", "/perfil/meu-plano", sess)
        o.ok(caso.esperar(lambda: caso.tem("[data-pagina-meu-plano='app']"), 60), "S8 Perfil › Meu plano do aluno do app")
        conferir_resumo(o, caso, "meu-plano", "S8 Meu plano")
        o.linha(f"   print: {caso.print('meu_plano')}")
    finally:
        caso.fim()


# hml-20d (H-42): o resumo leve do app (a faixa, a trava do inadimplente, o chip do Perfil) não lê mais a RPC financeiro_do_aluno no
# navegador — sai pelo `ler` da função financeiro (o item { q: "fin_do_aluno" } do lote). O S11 força a trava na RESPOSTA que a tela
# recebe pelos 2 caminhos (a RPC direta do front de antes e o item do `ler` do front de agora) — nada muda no banco.
ROTA_DO_LER_FINANCEIRO = re.compile(r"/functions/v1/financeiro(\?.*)?$")


def forcar_vencido(lista: object, vencido: str) -> int:
    """A conta do app com o teste acabado e sem pagamento, na lista do resumo leve (o que a tela recebe); devolve quantas forçou."""
    n = 0
    if isinstance(lista, list):
        for m in lista:
            if isinstance(m, dict) and m.get("app"):
                m.update({"pago_ate": vencido, "teste_ate": vencido, "bloquear_inadimplente": True, "pausada": False,
                          "assinatura_ativa": False, "aguardando": False, "abertas": [], "aguardando_avulsas": 0})
                n += 1
    return n


def posicoes_do_resumo(corpo: str | None) -> list[int]:
    """As posições do item fin_do_aluno num corpo `ler` da financeiro (o resto do lote passa como veio); outro corpo: nenhuma."""
    try:
        b = json.loads(corpo or "{}")
    except (ValueError, TypeError):
        return []
    itens = b.get("itens") if isinstance(b, dict) and b.get("acao") == "ler" else None
    return [k for k, it in enumerate(itens or []) if isinstance(it, dict) and it.get("q") == "fin_do_aluno"]


def vencer_no_ler(dados: object, posicoes: list[int], vencido: str) -> int:
    """A resposta do `ler` com o valor (a lista) de cada item fin_do_aluno forçado; devolve quantas contas forçou."""
    itens = dados.get("itens") if isinstance(dados, dict) else None
    n = 0
    for k in posicoes:
        if isinstance(itens, list) and k < len(itens) and isinstance(itens[k], dict) and itens[k].get("ok") is True:
            n += forcar_vencido(itens[k].get("valor"), vencido)
    return n


def seco_s11(o) -> None:
    """hml-20d: o S11 sem rede e sem navegador — o item do `ler` é achado e forçado; o resto do lote e os outros corpos passam como vieram."""
    vencido = "2026-10-10T00:00:00+00:00"
    corpo = json.dumps({"acao": "ler", "itens": [{"q": "aluno_dieta", "dia": "2026-10-12"}, {"q": "fin_do_aluno"}]})
    o.ok(posicoes_do_resumo(corpo) == [1], "S11 seco: o item fin_do_aluno é achado no corpo `ler` da financeiro (a posição 1)")
    o.ok(posicoes_do_resumo(json.dumps({"acao": "transacao_criar"})) == [] and posicoes_do_resumo("x") == []
         and posicoes_do_resumo(json.dumps({"action": "ler", "itens": [{"q": "fin_do_aluno"}]})) == [],
         "S11 seco: a gravação, o corpo ilegível e o `action` disfarçado passam sem mexer")
    dados = {"ok": True, "itens": [{"ok": True, "valor": {"x": 1}},
                                   {"ok": True, "valor": [{"app": True, "pago_ate": None}, {"app": False, "pago_ate": "2099-01-01"}]}]}
    n = vencer_no_ler(dados, [1], vencido)
    app, outra = dados["itens"][1]["valor"]
    o.ok(n == 1 and app["bloquear_inadimplente"] is True and app["teste_ate"] == vencido and app["abertas"] == []
         and outra == {"app": False, "pago_ate": "2099-01-01"} and dados["itens"][0] == {"ok": True, "valor": {"x": 1}},
         "S11 seco: só a conta do app do item fin_do_aluno fica vencida (a trava); a matrícula comum e o outro item como vieram")
    o.ok(vencer_no_ler({"ok": True, "itens": [{"ok": False, "erro": "sem_login"}]}, [0], vencido) == 0,
         "S11 seco: o item que falhou passa como veio (a tela mostra o erro dela)")
    o.ok(bool(ROTA_DO_LER_FINANCEIRO.search("https://api-principal.physiqcalc.com.br/functions/v1/financeiro"))
         and not ROTA_DO_LER_FINANCEIRO.search("https://api-principal.physiqcalc.com.br/functions/v1/master-financeiro")
         and not ROTA_DO_LER_FINANCEIRO.search("https://api-principal.physiqcalc.com.br/functions/v1/financeiro-x"),
         "S11 seco: a rota pega só a função financeiro (não a master-financeiro)")


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
        forcados["n"] += forcar_vencido(lista, vencido)
        route.fulfill(response=r, json=lista)

    def vencer_ler(route) -> None:
        # hml-20d: o POST `ler` da financeiro com o item fin_do_aluno — SÓ a resposta desse item muda (o resto do lote passa)
        req = route.request
        posicoes = posicoes_do_resumo(req.post_data) if req.method == "POST" else []
        if not posicoes:
            route.continue_()
            return
        r = route.fetch()
        try:
            dados = r.json()
        except Exception:  # noqa: BLE001
            route.fulfill(response=r)
            return
        forcados["n"] += vencer_no_ler(dados, posicoes, vencido)
        route.fulfill(response=r, json=dados)

    try:
        caso.pg.route("**/rest/v1/rpc/financeiro_do_aluno*", vencer)
        caso.pg.route(ROTA_DO_LER_FINANCEIRO, vencer_ler)
        entrar(caso, "w7b-vence", "/treino", sess)
        sel_trava = "[data-trava-app='pagamento-pendente-app']"
        o.ok(caso.esperar(lambda: caso.tem(sel_trava), 60), f"S11 a trava da conta do app (forçada {forcados['n']}×)")
        o.ok("Seus dias grátis acabaram" in texto_de(caso, sel_trava), "S11 'Seus dias grátis acabaram'")
        o.ok(caso.tem("[data-trava-pagar]") and caso.tem("[data-trava-meus-dados]"), "S11 a trava tem 'Pagar' e 'Exportar ou excluir meus dados'")
        o.linha(f"   print: {caso.print('trava_pagamento')}")
        caso.pg.locator("[data-trava-meus-dados]").first.click()
        o.ok(caso.esperar(lambda: caso.tem("[data-aba-perfil='reduzido']"), 30), "S11 o link abriu o Perfil reduzido")
        o.ok(caso.tem("[data-perfil-reduzido='pagamento-pendente-app']"), "S11 o Perfil reduzido diz o motivo (pagamento)")
        o.linha(f"   print: {caso.print('perfil_reduzido')}")
        caso.ir("/perfil?excluir=1")
        folha = caso.pg.locator("[data-sheet-excluir]")
        estado = lambda: (folha.first.get_attribute("data-estado-excluir") or "") if folha.count() else ""  # noqa: E731
        caso.esperar(lambda: estado() not in ("", "conferindo"), 60)
        o.ok(estado() == "pronto", f"S11 /perfil?excluir=1 (a volta da /excluir-conta) abre o Excluir ({estado() or 'sem a folha'})")
        o.linha(f"   print: {caso.print('excluir_aberto')}")
        caso.pg.keyboard.press("Escape")
        o.ok(caso.esperar(lambda: not caso.tem("[data-sheet-excluir]"), 10), "S11 a folha fechou sem confirmar (nada foi excluído)")
    finally:
        caso.fim()


# ───────────────────────── a /assinatura da versão da Google Play (o build:loja) ─────────────────────────
def s5l_assinatura_loja(o, nav, base: str, prefixo: str) -> None:
    """A virada (pedido da LINUX 1): na versão da Google Play, a /assinatura é o mesmo texto SEM o que só vale no site."""
    caso = B5.Caso(nav, base, prefixo, "S5L", desktop=False)
    try:
        caso.ir("/assinatura")
        o.ok(caso.esperar(lambda: caso.tem("[data-pagina-legal='assinatura']"), 30), "S5L a /assinatura da loja abre")
        documento = texto_de(caso, "[data-pagina-legal] [data-texto-legal]")
        cabecalho = texto_de(caso, "[data-pagina-legal] header")
        achado = SO_DO_SITE_NA_LOJA.search(f"{cabecalho} {documento}")
        o.ok(bool(documento) and not achado, f"S5L sem Pix, Mercado Pago, cartão, cobrança automática nem preço em R$ ({achado.group(0) if achado else 'nada'})")
        o.ok(caso.pg.locator("[data-tabela-legal]").count() == 0, "S5L sem a tabela de preços do site")
        titulos = [t.strip() for t in caso.pg.locator("[data-pagina-legal] [data-texto-legal] h2").all_inner_texts()]
        o.ok("15. Versão da Google Play" in titulos and "9. Desistência (direito de arrependimento)" in titulos and "8. Cancelamento" in titulos,
             f"S5L ficam a §15, a desistência e o cancelamento ({titulos})")
        o.ok("4. Formas de pagamento" not in titulos and not any(t.startswith("2.") or t.startswith("2 ") for t in titulos),
             "S5L saíram as formas de pagamento e os planos e preços do banco")
        o.ok("A Google Play também recebe pedidos de reembolso pelas regras dela." in documento, "S5L o reembolso pela Google Play")
        o.ok(f"Versão de {DATA_DOS_TEXTOS}" in cabecalho and caso.pg.locator(f"[{MARCA_EM_REVISAO}]").count() == 0, "S5L a versão publicada, sem a faixa")
        o.linha(f"   print: {caso.print('assinatura_loja')}")
        rolar_ate(caso, "[id='15-versao-da-google-play']")  # (o id começa com número: o seletor #… do CSS não vale)
        o.linha(f"   print: {caso.print('assinatura_loja_secao15')}")
    finally:
        caso.fim()


# ───────────────────────── o JS do build: o texto legal dentro, a faixa "em revisão" fora ─────────────────────────
def baixar(url: str) -> str:
    """O corpo do arquivo; nome que não existe (o regex dos chunks pega um ou outro texto que parece nome) → ""."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "physiq-hml11"}), timeout=30) as r:  # noqa: S310
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def js_texto_legal(o, base: str) -> None:
    """A virada: o que a guarda de CI confere no dist, aqui no site servido — cada marca do texto legal em algum JS (o controle
    positivo: a página, a porta do aceite e o resumo vão em todo build) e a faixa "em revisão" em nenhum."""
    html = baixar(base + "/")
    vistos: set[str] = set()
    fila = set(re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', html))
    achadas: dict[str, list[str]] = {m: [] for m in (*MARCAS_DO_TEXTO, MARCA_EM_REVISAO)}
    while len(vistos) < 800:
        # um nome pode entrar na fila e ser baixado no MESMO lote: tirar os já vistos antes de montar o próximo (sem isso o lote
        # sai vazio, a fila nunca diminui e o laço não termina — travou 2× em 08/10/2026)
        fila -= vistos
        if not fila:
            break
        lote = sorted(fila)[:40]
        fila -= set(lote)
        with cf.ThreadPoolExecutor(8) as ex:
            for caminho, corpo in zip(lote, ex.map(lambda c: baixar(base + c), lote)):
                vistos.add(caminho)
                for m in achadas:
                    if m in corpo:
                        achadas[m].append(caminho)
                fila |= {"/assets/" + n for n in re.findall(r'(?:assets/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js)', corpo)} - vistos
    o.ok(len(vistos) > 50, f"JS do build baixados: {len(vistos)} arquivos")
    faltam = [m for m in MARCAS_DO_TEXTO if not achadas[m]]
    o.ok(not faltam, f"JS: o texto legal está no build — as {len(MARCAS_DO_TEXTO)} marcas (faltam {faltam})")
    o.ok(not achadas[MARCA_EM_REVISAO] and MARCA_EM_REVISAO not in html, f"JS: a faixa 'em revisão' em nenhum arquivo ({achadas[MARCA_EM_REVISAO][:2]})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    # hml-20d: --seco = a lógica do S11 sem rede nem navegador (o item fin_do_aluno do `ler` da financeiro)
    if "--seco" in sys.argv:
        o = C.Saida("telas_hml11_seco", parar=False)
        seco_s11(o)
        return o.fim()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--modo", required=True, choices=("staging", "producao", "loja"))
    ap.add_argument("--casos", default=",".join(TODOS))
    # no notebook, o Chromium do Playwright cai recarregando as telas do build local (vite preview) e o Edge não — 08/10/2026
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    base = a.base.rstrip("/")
    casos = {c.strip().upper() for c in a.casos.split(",") if c.strip()}
    o = C.Saida(f"telas_{a.prefixo}", parar=False)
    sess = C.Sessoes()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:

        def rodar(fn, *args, **kw) -> None:
            """Cada grupo de casos num navegador NOVO e, se o navegador cair no meio, 1 nova tentativa do grupo inteiro noutro. No
            notebook (08/10/2026) o Chromium cai no meio dos prints destas páginas longas depois de alguns casos no mesmo navegador:
            o chromium_headless_shell padrão com "trap int3" na thread Compositor (14×, sempre no mesmo endereço) e o Chromium
            inteiro com o processo de GPU reiniciando (exit_code=9; o Vulkan incompleto do Mesa no Intel Ivy Bridge, máquina
            carregada). Sozinha, cada tela passa (3 de 3) — é do navegador, não do app; no Edge a mesma sequência passa
            (--canal msedge, o usado na fase local)."""
            for tentativa in (1, 2):
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, *args, **kw)
                    return
                except Exception as e:  # noqa: BLE001
                    caiu = any(t in str(e) for t in ("Target crashed", "Unable to capture screenshot", "has been closed"))
                    if not caiu or tentativa == 2:
                        raise
                    o.linha(f"   ({fn.__name__}: o navegador caiu no meio — o grupo de novo, num navegador novo)")
                finally:
                    try:
                        nav.close()
                    except Exception:  # noqa: BLE001
                        pass

        try:
            if a.modo == "loja":
                # só a /assinatura da versão da Google Play (o build:loja)
                if "S5L" in casos:
                    rodar(s5l_assinatura_loja, base, a.prefixo)
                if "JS" in casos:
                    js_texto_legal(o, base)
            else:
                # a virada: as páginas públicas são as mesmas no staging e na produção
                if "S2" in casos:
                    rodar(s2_excluir_conta, base, a.prefixo)
                if casos & {"S3", "S4", "S5"}:
                    rodar(s3_s5_textos_novos, base, a.prefixo, telas=(False,))  # celular
                    rodar(s3_s5_textos_novos, base, a.prefixo, telas=(True,))  # computador, noutro navegador
                if "S10" in casos:
                    rodar(s10_impressao, base, a.prefixo)
                if "JS" in casos:
                    js_texto_legal(o, base)
            if a.modo == "staging":
                # as telas logadas: só com as contas de TESTE do schema staging
                if casos & {"S6", "S9"}:
                    rodar(s6_s9_dono, base, a.prefixo, sess, casos)
                if "S7" in casos:
                    rodar(s7_sem_profissional, base, a.prefixo, sess)
                if "S8" in casos:
                    rodar(s8_meu_plano, base, a.prefixo, sess)
                if "S11" in casos:
                    rodar(s11_trava, base, a.prefixo, sess)
        finally:
            sess.fechar(o)
    graves = [t for bom, t in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página ({graves[:2]})")
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
