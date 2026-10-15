#!/usr/bin/env python3
"""Physiq W16b — E2E das TELAS da trava de e-mail/CPF repetido (Playwright, contexto limpo por caso, staging do banco principal).

  novo_email      Painel › Alunos › Novo aluno › Cadastrar (Lucas, dono): o e-mail de OUTRO aluno (o w16b-app, aluno do app em
                  outra conta) → mensagem vermelha embaixo do campo ao sair dele; "Cadastrar" não grava; e-mail único → some
  dados           Perfil do aluno › Editar dados (Rafael Moura): hml-25 (H-137) primeiro "a troca do Treino atrasada com a folha
                  aberta" — a trocar-token fica segurada (page.route) até a pessoa digitar o objetivo; solta, a altura/peso do Treino
                  aparecem na folha, o digitado FICA e o "Salvar" grava (o banco confere; o objetivo volta ao que era no fim; a sobra
                  de uma rodada cortada — o objetivo já igual ao do teste — volta a null antes, para o caso nunca passar no vazio). Depois,
                  CPF e e-mail de outras pessoas → as 2 mensagens embaixo dos campos; "Salvar" não grava; voltar ao que era → somem
  cadastro_link   /c/<código do Lucas> (público, celular): e-mail que já é de um aluno → enviado como os outros, sem frase
                  (hml-05b, H-18: o aviso vai para o profissional ao aprovar); o pendente criado é apagado no fim
Prints: ~/projetos/physiqcalc-scratch/prints/w16b/<prefixo>_trava_email.png, _troca_atrasada.png, _trava_cpf.png, _trava_cadastro_link.png
Pré-requisito: e2e/w16b/causa.py (a conta w16b-app com a matrícula do app no staging) e a massa da W13 (e2e/w13/massa.py).
--seco: sem navegador e sem rede (o socket fica bloqueado) — o "segura" da troca com páginas falsas, o SQL que devolve o objetivo (só
o staging), a sobra de uma rodada cortada, o --canal no lançamento do navegador e os seletores e a correção nas telas.
--canal: o navegador (o molde da e2e/w15/telas.py; o padrão é o chromium do Playwright). No notebook, SEMPRE --canal msedge.
Uso: python3 e2e/w16b/telas.py --base http://localhost:5173 --prefixo local [--casos novo_email,dados,cadastro_link] [--canal msedge]
     python3 e2e/w16b/telas.py --seco
"""
from __future__ import annotations

import argparse
import re
import socket
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
A = "w16b-app"
MSG_EMAIL, MSG_CPF = "Já existe um aluno com este e-mail.", "Já existe um aluno com este CPF."
DICA = "Para trazer essa pessoa, use o convite ou o seu código."
CPF_OUTRO = "529.982.247-25"
NOME_CPF = "W16b CPF de Outra Pessoa"
REPO = Path(__file__).resolve().parents[2]
# hml-25 (H-137): o que a pessoa digita com a troca do Treino no ar (o objetivo volta ao que era no fim do caso)
OBJETIVO = "hipertrofia (troca atrasada hml-25)"
TROCA_MAX_S = 38  # o app desiste da trocar-token aos 40 s (src/nucleo/trocaToken.ts, TEMPO_TROCA_MS)


# ───────────────────────── hml-25 (H-137): peças puras (o --seco confere) ─────────────────────────
class Segura:
    """Segura os POST de uma função (page.route) até o soltar() — a troca do Treino que chega com a folha aberta. O preflight
    (OPTIONS) passa; depois de solto, tudo passa direto e a rota sai da página."""

    def __init__(self, pg, funcao: str) -> None:
        self.pg = pg
        self.padrao = re.compile(rf"/functions/v1/{re.escape(funcao)}(\?|$)")
        self.presos: list = []
        self.n = 0
        self.desde: float | None = None
        self.solto = False
        self._f = self._pegar
        pg.route(self.padrao, self._f)

    def _pegar(self, route) -> None:
        if self.solto or route.request.method != "POST":
            route.continue_()
            return
        self.n += 1
        self.desde = self.desde or time.time()
        self.presos.append(route)

    def soltar(self) -> float:
        """Solta os pedidos segurados (idempotente). Devolve quantos segundos o 1º ficou segurado."""
        espera = time.time() - self.desde if self.desde and not self.solto else 0.0
        self.solto = True
        for r in self.presos:
            try:
                r.continue_()
            except Exception:  # noqa: BLE001 — o app já desistiu (40 s) ou a página fechou
                pass
        self.presos.clear()
        try:
            self.pg.unroute(self.padrao, self._f)
        except Exception:  # noqa: BLE001
            pass
        return espera


def sql_voltar_objetivo(pid: str, valor: str | None, schema: str = S) -> str:
    """O objetivo do aluno de teste de volta ao que era antes do caso — SÓ no staging, só a linha dele (o id é um uuid)."""
    assert schema == "staging", "o objetivo só volta no staging"
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", pid), "id inválido"
    assert valor is None or "$o$" not in valor, "valor inválido"
    v = "null" if valor is None else f"$o${valor}$o$"
    return f"update {schema}.pacientes set objetivo = {v} where id = '{pid}'"


def sem_sobra(ler, executar) -> dict:
    """O aluno de teste antes do caso da troca atrasada. Uma rodada cortada entre o Salvar e o finally deixa o objetivo igual ao OBJETIVO:
    aí o fill não muda nada, o Salvar fecha sem gravar e o caso passaria no vazio. Essa sobra volta a null (pelo sql_voltar_objetivo: só o
    staging, só o uuid dele) e o aluno é lido de novo."""
    r = ler()
    if r["objetivo"] == OBJETIVO:
        executar(sql_voltar_objetivo(r["id"], None))
        r = ler()
    return r


def q(sql: str) -> list:
    return B.sql_principal(sql)


def texto(c, sel: str) -> str:
    try:
        loc = c.pg.locator(sel).first
        return loc.inner_text(timeout=3000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def caso(nav, base: str, pref: str, nome: str, conta: str | None, rota: str, desktop: bool = True, esperar: str | None = None, antes=None):
    c = B.Caso(nav, base, pref, nome, desktop=desktop)
    if antes:
        antes(c)  # hml-25: o que precisa estar na página antes de entrar (o page.route da troca do Treino)
    if conta:
        c.entrar(conta, rota, zerar=True)
        c.fechar_avisos()
    else:
        c.ir(rota)
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 90)
        p.check(ok, f"[{nome}] {rota} abriu ({esperar})")
        if not ok:
            c.diagnostico()
    return c


def foto(c, nome: str) -> str:
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 10)
    return c.print(nome)


def erro_do(c, campo_sel: str) -> str:
    """A mensagem vermelha embaixo do campo (o <span data-erro-campo> do mesmo <label>)."""
    return texto(c, f"label:has({campo_sel}) [data-erro-campo]")


def novo_email(nav, base, pref):
    conta = B.conta_w13()
    c = caso(nav, base, pref, "novo_email", "w13-dono", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        c.pg.click("[data-novo-aluno-abrir]")
        ok = c.esperar(lambda: c.tem('[data-novo-aluno="cadastrar"]'), 15)
        p.check(ok, "[novo] a folha Novo aluno › Cadastrar abriu")
        c.pg.fill("[data-novo-nome]", "Teste Trava W16b")
        c.pg.fill("[data-novo-email]", B.EMAIL[A].upper())
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_EMAIL in erro_do(c, "[data-novo-email]"), 20)
        msg = erro_do(c, "[data-novo-email]")
        p.check(ok and DICA in msg, f"[novo] e-mail de outro aluno (outra conta, outra caixa) → vermelho embaixo do campo ao sair dele: {msg!r}")
        p.check(c.pg.get_attribute("[data-novo-email]", "aria-invalid") == "true", "[novo] o campo fica marcado como inválido (borda rosa)")
        foto(c, "trava_email")
        c.pg.click("[data-novo-cadastrar]")
        c.pg.wait_for_timeout(2500)
        n = q(f"select count(*)::int n from {S}.pacientes where conta_id = '{conta}' and nome = 'Teste Trava W16b'")[0]["n"]
        p.check(n == 0 and MSG_EMAIL in erro_do(c, "[data-novo-email]") and not c.tem("[data-novo-feito]"),
                f"[novo] 'Cadastrar aluno' NÃO grava com o e-mail repetido ({n} linha) e a mensagem fica")
        c.pg.fill("[data-novo-email]", "w16b.unico.teste.claude@physiqnutri.app")
        ok = c.esperar(lambda: erro_do(c, "[data-novo-email]") == "", 5)
        c.pg.keyboard.press("Tab")
        c.pg.wait_for_timeout(2500)
        p.check(ok and erro_do(c, "[data-novo-email]") == "" and c.pg.get_attribute("[data-novo-email]", "aria-invalid") is None,
                "[novo] (positivo) e-mail que ninguém usa → sem mensagem, o campo volta ao normal")
    finally:
        c.fim()


def dados(nav, base, pref):
    conta = B.conta_w13()
    raf = sem_sobra(lambda: q(f"select id::text, email, cpf, objetivo from {S}.pacientes where conta_id = '{conta}' and nome = 'Rafael Moura' "
                              "and deleted_at is null limit 1")[0], q)
    p.check(raf["objetivo"] != OBJETIVO,
            "[dados] hml-25: o objetivo de antes não é o do teste (a sobra de uma rodada cortada volta a null) — o Salvar do caso tem o que gravar")
    nutri2 = q("select id::text from auth.users where lower(email) = 'teste@physiqnutri.app'")[0]["id"]
    q(f"delete from {S}.pacientes where nome = $n${NOME_CPF}$n$")
    q(f"insert into {S}.pacientes (nutricionista_id, nome, cpf) values ('{nutri2}', $n${NOME_CPF}$n$, '{CPF_OUTRO}')")
    troca: list[Segura] = []
    c = caso(nav, base, pref, "dados", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-dados-editar]",
             antes=lambda x: troca.append(Segura(x.pg, "trocar-token")))
    try:
        # hml-25 (H-137): a troca do Treino atrasada com a folha aberta — a trocar-token fica no ar até a pessoa digitar
        t = troca[0]
        c.pg.click("[data-dados-editar]")
        ok = c.esperar(lambda: c.tem("[data-editar-dados]") and t.n >= 1, 15)
        p.check(ok and t.n >= 1 and not c.tem("[data-editar-altura]"),
                f"[dados] hml-25: a troca do Treino segurada ({t.n} pedido) e a folha aberta sem a altura/peso do Treino")
        c.pg.fill("[data-editar-objetivo]", OBJETIVO)
        espera = t.soltar()
        ok = c.esperar(lambda: c.tem("[data-editar-altura]") and c.tem("[data-editar-peso]"), 45)
        p.check(ok and espera < TROCA_MAX_S,
                f"[dados] hml-25: a troca do Treino chegou com a folha aberta (segurada {espera:.1f} s) — a altura e o peso do Treino apareceram")
        p.check(c.pg.input_value("[data-editar-objetivo]") == OBJETIVO, "[dados] hml-25 (H-137): o que a pessoa digitou FICA depois da troca do Treino")
        foto(c, "troca_atrasada")
        c.pg.click("[data-editar-salvar]")
        ok = c.esperar(lambda: not c.tem("[data-editar-dados]"), 30)
        gravado = q(f"select objetivo from {S}.pacientes where id = '{raf['id']}'")[0]["objetivo"]
        p.check(ok and gravado == OBJETIVO, "[dados] hml-25 (H-137): o 'Salvar' gravou o que a pessoa digitou (a folha fechou e o banco confere)")
        # a trava do e-mail/CPF repetido (W16b), com a troca do Treino já feita
        c.pg.click("[data-dados-editar]")
        ok = c.esperar(lambda: c.tem("[data-editar-dados]"), 15)
        p.check(ok, "[dados] a folha Editar dados abriu")
        c.pg.fill("[data-editar-cpf]", CPF_OUTRO)
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_CPF in erro_do(c, "[data-editar-cpf]"), 20)
        p.check(ok, f"[dados] CPF de outra pessoa → vermelho embaixo do CPF: {erro_do(c, '[data-editar-cpf]')!r}")
        c.pg.fill("[data-editar-email]", f"  {B.EMAIL[A]} ")
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_EMAIL in erro_do(c, "[data-editar-email]"), 20)
        p.check(ok, f"[dados] e-mail de outro aluno → vermelho embaixo do e-mail: {erro_do(c, '[data-editar-email]')!r}")
        foto(c, "trava_cpf")
        c.pg.click("[data-editar-salvar]")
        c.pg.wait_for_timeout(2500)
        r2 = q(f"select email, cpf from {S}.pacientes where id = '{raf['id']}'")[0]
        p.check(c.tem("[data-editar-dados]") and r2["cpf"] == raf["cpf"] and r2["email"] == raf["email"],
                "[dados] 'Salvar' NÃO grava com CPF/e-mail repetidos (a folha continua aberta e o banco igual)")
        c.pg.fill("[data-editar-cpf]", raf["cpf"] or "")
        c.pg.fill("[data-editar-email]", raf["email"] or "")
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: erro_do(c, "[data-editar-cpf]") == "" and erro_do(c, "[data-editar-email]") == "", 10)
        p.check(ok, "[dados] (positivo) voltar ao CPF/e-mail que ele já tinha → as mensagens somem")
        c.pg.keyboard.press("Escape")
    finally:
        for t in troca:
            t.soltar()
        c.fim()
        q(f"delete from {S}.pacientes where nome = $n${NOME_CPF}$n$")
        q(sql_voltar_objetivo(raf["id"], raf["objetivo"]))


def captcha(ligado: bool) -> None:
    q(f"""update {S}.app_config set valor = jsonb_set(valor, '{{captcha}}', '{str(ligado).lower()}'::jsonb) where chave = 'login_limite'""")


def cadastro_link(nav, base, pref):
    conta = B.conta_w13()
    cod = q(f"select codigo_convite from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}'")[0]["codigo_convite"]
    antes = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
    c = caso(nav, base, pref, "cadastro_link", None, f"/c/{cod}", desktop=False, esperar="[data-form-cadastro-publico]")
    try:
        c.pg.fill("[data-cad-nome]", "Wagner Cadastro W16b")
        c.pg.fill("[data-cad-email]", B.EMAIL[A])
        c.pg.fill("[data-cad-telefone]", "(82) 97777-1616")
        captcha(False)  # o Chromium automatizado cai no desafio do Turnstile: no staging, só neste envio, o captcha fica desligado
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: c.tem("[data-cadastro-enviado]"), 40)
        finally:
            captcha(True)
        p.check(ok and "Já existe" not in c.texto(), "[/c/] e-mail que já é de um aluno → enviado, sem dizer que já existe (hml-05b, H-18)")
        foto(c, "trava_cadastro_link")
        depois = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
        p.check(depois == antes + 1, f"[/c/] o cadastro pendente nasceu ({antes} → {depois})")
    finally:
        c.fim()
        q(f"delete from {S}.cadastros_pendentes where conta_id = '{conta}' and nome = 'Wagner Cadastro W16b'")


CASOS = {"novo_email": novo_email, "dados": dados, "cadastro_link": cadastro_link}


class _RotaFalsa:
    def __init__(self, url: str, metodo: str = "POST", falha: bool = False) -> None:
        self.request = type("Pedido", (), {"url": url, "method": metodo})()
        self.seguiu, self.falha = 0, falha

    def continue_(self) -> None:
        self.seguiu += 1
        if self.falha:
            raise RuntimeError("o app já desistiu")


class _PaginaFalsa:
    def __init__(self) -> None:
        self.rotas: list = []

    def route(self, padrao, f) -> None:
        self.rotas.append((padrao, f))

    def unroute(self, padrao, f) -> None:
        self.rotas.remove((padrao, f))


class _PlaywrightFalso:
    """O sync_playwright falso do --seco: guarda o que o lançamento do navegador recebeu."""

    def __init__(self) -> None:
        self.chromium = self
        self.lancamentos: list[dict] = []

    def launch(self, **k):
        self.lancamentos.append(k)
        return self


def seco() -> int:
    """Sem navegador e sem rede (o socket fica bloqueado): o "segura" da troca, o SQL do objetivo, a sobra de uma rodada cortada, o
    --canal no lançamento do navegador e os seletores/a correção nas telas."""
    def sem_rede(*_a, **_k):
        raise RuntimeError("--seco não usa a rede")

    socket.socket.connect = sem_rede  # type: ignore[method-assign]
    url = "https://treino.exemplo.invalid/functions/v1/trocar-token"
    pg = _PaginaFalsa()
    s = Segura(pg, "trocar-token")
    padrao, pegar = pg.rotas[0]
    p.check(padrao.search(url) and padrao.search(url + "?x=1") and not padrao.search(url + "-x")
            and not padrao.search("https://treino.exemplo.invalid/functions/v1/admin-get-user"),
            "seco: a rota pega só a trocar-token (com ou sem ?; não a admin-get-user nem outro nome que comece igual)")
    pre, um, dois = _RotaFalsa(url, "OPTIONS"), _RotaFalsa(url), _RotaFalsa(url, falha=True)
    pegar(pre), pegar(um), pegar(dois)
    segurou = pre.seguiu == 1 and um.seguiu == 0 and dois.seguiu == 0 and s.n == 2
    espera = s.soltar()
    depois = _RotaFalsa(url)
    pegar(depois)
    p.check(segurou and um.seguiu == 1 and dois.seguiu == 1 and depois.seguiu == 1 and not pg.rotas and espera >= 0 and s.soltar() == 0.0,
            "seco: segura os POST (o preflight passa) até o soltar(); solta todos (o que o app já largou não derruba), sai da página e depois passa direto")
    pid = "00000000-0000-4000-8000-0000000000aa"
    recusas = 0
    for args in ((pid, "x", "public"), ("1; drop table x", "x", S), (pid, "a$o$b", S)):
        try:
            sql_voltar_objetivo(*args)
        except AssertionError:
            recusas += 1
    p.check(sql_voltar_objetivo(pid, "definição") == f"update staging.pacientes set objetivo = $o$definição$o$ where id = '{pid}'"
            and sql_voltar_objetivo(pid, None).endswith(f"set objetivo = null where id = '{pid}'") and recusas == 3,
            "seco: o objetivo volta só no staging e só na linha do aluno de teste (o public, o id que não é uuid e o valor com $o$ são recusados)")
    sobra, sqls = [{"id": pid, "objetivo": OBJETIVO}, {"id": pid, "objetivo": None}], []
    sem = [{"id": pid, "objetivo": "definição"}, {"id": pid, "objetivo": "x"}]
    r1 = sem_sobra(lambda: sobra.pop(0), sqls.append)
    r2 = sem_sobra(lambda: sem.pop(0), sqls.append)
    p.check(r1["objetivo"] is None and not sobra and r2["objetivo"] == "definição" and len(sem) == 1 and sqls == [sql_voltar_objetivo(pid, None)],
            "seco: a sobra de uma rodada cortada (o objetivo já é o do teste) volta a null e o aluno é lido de novo; outro objetivo fica (0 SQL, 1 leitura)")
    pw = _PlaywrightFalso()
    abrir_navegador(pw, opcoes(["--casos", "dados", "--canal", "msedge"]).canal)
    p.check(pw.lancamentos == [{"channel": "msedge", "args": ARGS_NAVEGADOR}] and opcoes([]).canal == "chromium",
            "seco: o --canal msedge chega ao lançamento do navegador (sem ele, o chromium do Playwright, como na w15)")
    fontes = {rel: (REPO / rel).read_text(encoding="utf-8") for rel in (
        "src/painel/aluno/dados/SheetEditarDados.tsx", "src/painel/aluno/resumo/CardDadosAluno.tsx", "src/nucleo/trocaToken.ts")}
    folha = fontes["src/painel/aluno/dados/SheetEditarDados.tsx"]
    do_app = re.search(r"\$\{[^}]*\}(/functions/v1/trocar-token)`", fontes["src/nucleo/trocaToken.ts"])
    p.check(all(f"data-editar-{x}" in folha for x in ("dados", "objetivo", "altura", "peso", "salvar", "cpf", "email"))
            and "data-dados-editar" in fontes["src/painel/aluno/resumo/CardDadosAluno.tsx"]
            and bool(do_app and padrao.search(do_app.group(1))),
            "seco: os seletores do teste existem nas telas e a rota pega a URL da troca que o app chama")
    salvar_so_tocados = all(x in folha for x in ("const g = mesclarForm(f, base, tocados.current)", "mudancas(g, base)", "cadastroParaTreino(g, hojeSP())"))
    p.check("mesclarForm(x, inicial, tocados.current)" in folha and salvar_so_tocados and "precisaConferir(campo, valor, base[campo])" in folha,
            "seco: a folha mescla o inicial novo com ela aberta, o Salvar manda só os campos tocados (o resto vai com a base) e o repetido compara com a base "
            "(H-137, SheetEditarDados.tsx)")
    try:
        socket.create_connection(("127.0.0.1", 9), timeout=1)
        bloqueado = False
    except RuntimeError:
        bloqueado = True
    except OSError:
        bloqueado = False
    p.check(bloqueado, "seco: a rede fica bloqueada (nada foi ao banco nem ao site)")
    return p.fim()


ARGS_NAVEGADOR = ["--no-sandbox", "--disable-dev-shm-usage"]


def opcoes(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    # hml-25: o E2E de tela com o Edge no notebook (o molde da e2e/w15/telas.py — o Chromium do Playwright cai nas páginas longas)
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--seco", action="store_true", help="sem navegador e sem rede: o segura da troca, o SQL do objetivo, o --canal e os seletores")
    return ap.parse_args(argv)


def abrir_navegador(pw, canal: str):
    """O navegador dos casos, no canal do --canal."""
    return pw.chromium.launch(channel=canal, args=ARGS_NAVEGADOR)


def main() -> int:
    a = opcoes()
    if a.seco:
        return seco()
    with sync_playwright() as pw:
        nav = abrir_navegador(pw, a.canal)
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav, a.base, a.prefixo)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            time.sleep(3)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
