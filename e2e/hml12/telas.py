#!/usr/bin/env python3
"""hml-12 (H-30) — as telas do aceite no acesso e do consentimento: a porta do aceite (Termos de Uso + Política de Privacidade da
versão vigente), o consentimento de saúde destacado (aluno do app, Treinar sem profissional e a pré-consulta /f/), a regra de idade
(16+; 16–17 só com o consentimento do responsável registrado pelo profissional; plano do app e profissional 18+) e o que muda nas
telas que já existem. Tudo isso só existe no build de staging até a virada (a produção sai sem as peças: a prova é o JS).

Dois modos (o build decide o que existe):
  --modo staging    build com VITE_DB_SCHEMA=staging (o vite preview local — a "ponte": o build de staging com o banco de staging —
                    ou o physiqcalc-staging.vercel.app), contas de TESTE do schema staging. Antes de entrar com qualquer conta, o
                    teste confere que o build é o de staging (a faixa "Ambiente de teste") e que a versão dos textos no banco do
                    staging é a do app (src/publico/legal/versao.ts); senão para.
  --modo producao   build public (o vite preview local ou physiqcalc.com.br): SÓ visitante e SÓ leitura — o rodapé antigo, o /c/ e o
                    /f/ sem as peças novas, /assinatura "não encontrada" e nenhuma das 8 marcas no HTML nem nos JS.

Casos (spec §9.3; contas de TESTE do schema staging, todas *.teste.claude@physiqnutri.app):
  T1   porta: aluno de profissional (w5-aluno2) → caixa, links (o Voltar do texto volta), Aceitar → app; o 2º acesso não pede e o
       banco tem 1 aceite só daquela versão
  T2   porta: aluno do app (w7b-sozinho) → caixa de saúde em destaque e a data; 17 anos → a frase; 30 anos → entra
  T3   porta: profissional no /painel (w5-dono) e conta sem nada nas Boas-vindas (excluir2)
  T4   versao_desatualizada (o banco "na frente" do app, forçado só na resposta) → "Recarregue" → Recarregar
  T5   Treinar sem profissional (excluir2): data + consentimento + o resumo da hml-11; "Começar" travado sem os 2 (sem clicar)
  T6   Treinar sem profissional com 17 anos → "maiores de 18" (nada criado)
  T7   /f/ (formulário de teste criado e apagado aqui): sem marcar → a frase; marcado → enviado, com o consentimento na resposta
  T8   /c/ (código da w5-dono) com 15 anos → a frase (nada criado); a linha da idade mínima
  T9   ficha do aluno de 17 anos (w5-aluno1, pela w5-dono) → aviso → Registrar → registrado → Retirar
  T10  app do aluno de 17 sem registro → trava; menor de 16 (forçado só na resposta) → a outra trava; depois do registro → abre
  T11  Editar dados com 15 anos → "menor de 16" (o banco recusa; a data fica)
  T12  Exportar meus dados (w5-aluno2) → o arquivo tem `aceites`
  T13  o rodapé da entrada só com os links (produção: o antigo)
  T14  Sou profissional com a linha de declaração (excluir2; sem criar a conta)
  T15  Pendentes com a dica dos 16–17 (cadastro pendente de teste criado e apagado aqui)
  T16  celular 390 px: a tela do aceite cabe na largura
  JS   produção: nenhuma das 8 marcas no HTML nem nos JS e /assinatura "não encontrada"; staging: controle (as marcas existem)

Repetível: a conta que aceitou uma vez não vê mais a porta (o aceite só cresce). Para a porta aparecer de novo, o teste força SÓ NA
RESPOSTA da situação (pos-login e rpc/minha_situacao) o `legal` pendente; o clique em "Aceitar" chama a RPC de verdade (o 2º aceite
da mesma versão continua 1 linha) e, deu certo, a situação real recarregada libera. Mesma técnica no T4 (a recusa) e no T10 (menor
de 16). Dado mudado (a data de nascimento do aluno de teste; o captcha do staging durante 1 envio do /c/) volta ao valor de antes no
`finally`; o que o teste cria (formulário, cadastro pendente) ele apaga. Os eventos de aceite ficam (só crescem; é o staging).
NADA é pago nem excluído: o teste nunca clica em pagar, "Começar", "Criar conta", "Excluir minha conta" nem "Sair"; no fim, logout
scope=local das sessões que abriu.

Uso: python3 e2e/hml12/telas.py --base local --prefixo local --canal msedge                 (build de staging no vite preview :8080)
     python3 e2e/hml12/telas.py --base http://localhost:8081 --prefixo local-prod --modo producao --canal msedge
     python3 e2e/hml12/telas.py --base staging --prefixo staging [--casos T1,T2]
     python3 e2e/hml12/telas.py --base prod --prefixo prod                                   (= --modo producao)
Prints em ~/projetos/physiqcalc-scratch/prints/hml12/<prefixo>_<caso>.png; cópia da saída em ~/projetos/physiqcalc-scratch/hml/hml12/.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import importlib.util
import json
import re
import secrets
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", Path(__file__).resolve().parent.parent / "hml09" / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]

B5 = C.B5
B5.ESTADO["schema"] = "staging"  # local e staging falam com o schema staging (as contas de teste só existem lá)
C.SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml12"
B5.PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml12"

BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
HOSTS_DE_PRODUCAO = {"physiqcalc.com.br", "www.physiqcalc.com.br"}
VERSAO = B5.versao_dos_textos()
PORTA = B5.PORTA
# as marcas que só existem no código cortado na produção (as mesmas da guarda scripts/ci/sem-texto-legal-novo.sh, spec §4.5)
MARCAS_NOVAS = ("data-aceite-no-acesso", "data-consentimento-saude", "data-tela-menor", "data-secao-responsavel", "data-rodape-aceite",
                "data-aviso-idade-cadastro", "data-declaracao-profissional", "data-pendente-idade",
                # as 3 que a revisão acrescentou à guarda (a linha do Novo aluno e a frase dos aceites na exclusão)
                "data-novo-aviso-idade", "data-frase-aceites", "registro dos seus aceites")
CONTAS = {
    "w5-dono": "w5.dono.teste.claude@physiqnutri.app",  # profissional (dono + personal da "Consultoria Equipe W5")
    "w5-aluno1": "w5.aluno1.teste.claude@physiqnutri.app",  # aluno da conta da w5-dono (T9–T11: a data vai a 17 anos e volta)
    "w5-aluno2": "w5.aluno2.teste.claude@physiqnutri.app",  # aluno de profissional (T1, T4, T12)
    "w7b-sozinho": "w7b.sozinho.teste.claude@physiqnutri.app",  # aluno do app, sem profissional (T2)
    "excluir2": "excluir2.teste.claude@physiqnutri.app",  # conta sem nada (T3, T5, T6, T14)
}
NOME_PENDENTE = "hml12 Pendente Dezessete"
EMAIL_PENDENTE = "hml12.pendente.teste.claude@physiqnutri.app"
NOME_CADASTRO_15 = "hml12 Cadastro Quinze"
TITULO_FORM = "hml12 E2E consentimento da pré-consulta"
TODOS = ("T13", "T1", "T16", "T4", "T12", "T2", "T3", "T5", "T6", "T14", "T7", "T8", "T15", "T9", "T10", "T11", "JS")

_PRINT_ORIGINAL = B5.Caso.print


def _print_com_nova_tentativa(self, nome: str) -> str:
    """O print com até 3 tentativas (no notebook o Chromium às vezes devolve "Unable to capture screenshot" num print isolado; a
    página continua viva). Outro erro sobe na hora. (O mesmo da hml-11.)"""
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


# ───────────────────────── utilidades ─────────────────────────
def texto_de(caso, seletor: str) -> str:
    loc = caso.pg.locator(seletor)
    return re.sub(r"\s+", " ", loc.first.inner_text()).strip() if loc.count() else ""


def rolar_ate(caso, seletor: str) -> None:
    loc = caso.pg.locator(seletor)
    if loc.count():
        loc.first.scroll_into_view_if_needed()
        caso.pg.wait_for_timeout(400)


def largura(caso) -> int:
    try:
        return int(caso.pg.evaluate("document.documentElement.scrollWidth"))
    except Exception:  # noqa: BLE001
        return -1


def lit(v: object) -> str:
    """Literal do SQL (texto ou null)."""
    return "null" if v is None else C.txt(v)


def ler(sql: str) -> list[dict]:
    """Leitura no banco principal: SQL só leitura pela Management API (read_only). A tabela `aceites` não dá privilégio a ninguém além
    do dono: se o papel só leitura não a enxergar, a MESMA consulta (um select, conferido aqui) vai pelo caminho de sempre do B5."""
    try:
        return C.ler(C.PRINCIPAL_REF, sql)
    except RuntimeError as e:
        so_select = re.match(r"\s*select\b", sql, flags=re.I) and not re.search(r"\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b",
                                                                           re.sub(r"'(?:[^']|'')*'", "''", sql), flags=re.I)
        if "permission denied" not in str(e) or not so_select:
            raise
        return B5.sql_principal(sql)


def sql_staging(sql: str) -> list:
    """Escrita no banco principal SÓ no schema staging (trava: todo insert/update/delete aponta para staging.<tabela> e nada cita o
    schema public). Usada para o que o teste prepara e desfaz: a data do aluno de teste, o captcha do staging durante 1 envio, o
    formulário e o cadastro pendente de teste."""
    sem_texto = re.sub(r"\$(\w*)\$.*?\$\1\$|'(?:[^']|'')*'", "''", sql, flags=re.S)
    alvos = re.findall(r"\b(?:insert\s+into|update|delete\s+from)\s+([^\s(;]+(?:\s*\.\s*[^\s(;]+)?)", sem_texto, flags=re.I)
    if re.search(r"\bpublic\s*\.", sem_texto, flags=re.I) or any(not re.match(r"staging\s*\.", a, flags=re.I) for a in alvos):
        raise SystemExit("trava: escrita fora do schema staging recusada")
    return B5.sql_principal(sql)


def uid(conta: str) -> str | None:
    return C.uid_por_email(CONTAS[conta])


def entrar(caso, conta: str, rota: str, sess) -> None:
    """Sessão injetada (login por senha da conta de TESTE, como o B5) e a rota; a porta NÃO é aceita aqui (cada caso decide)."""
    email = CONTAS[conta]
    if not C.eh_email_de_teste(email):
        raise SystemExit(f"não é conta de teste: {conta}")
    B5.CONTAS[conta] = (email, B5.senha_de(conta))
    s = caso.entrar(conta, rota)
    sess.guardar("principal", s["access_token"], f"{conta} (sessão injetada)")


def esperar_porta(caso, timeout: float = 60) -> bool:
    return caso.esperar(lambda: caso.tem(PORTA), timeout)


def app_aberto(caso) -> bool:
    """Depois da porta: o app (a barra de abas), uma trava de sempre (que não seja a de idade) ou o aviso "o Physiq mudou"."""
    if caso.tem(PORTA) or caso.tem("[data-tela-menor]"):
        return False
    if caso.tem("[data-tabbar]") or caso.tem("[data-aviso-mudanca-ok]") or caso.tem("[data-menu-lateral]"):
        return True
    trava = caso.pg.locator("[data-trava-app]")
    return trava.count() > 0 and trava.first.is_visible() and not (trava.first.get_attribute("data-trava-app") or "").startswith("idade-")


class Rede:
    """As respostas de uma função da borda na página, para o relatório: o status, a ação (do corpo do pedido) e o código do erro —
    nada do corpo além do código. Status 0 = o pedido nem saiu (falha de rede). `limitado`: o 429 do teto por IP da Cloudflare (H-46,
    infra/cloudflare/physiq-principal-api/worker.js: {"code": "muitos_pedidos"}), que nem chega à função."""

    def __init__(self, caso, trecho: str):
        self.trecho, self.eventos = trecho, []
        caso.pg.on("response", self._resposta)
        caso.pg.on("requestfailed", self._falhou)

    @staticmethod
    def _acao(req) -> str:
        try:
            return str(json.loads(req.post_data or "{}").get("acao") or "")
        except Exception:  # noqa: BLE001
            return ""

    def _resposta(self, r) -> None:
        if self.trecho not in r.url or r.request.method == "OPTIONS":
            return
        codigo = ""
        if r.status >= 400:
            try:
                c = r.json()
                codigo = str((c.get("erro") or c.get("code") or c.get("error") or "") if isinstance(c, dict) else "")
            except Exception:  # noqa: BLE001
                codigo = "sem_json"
        self.eventos.append({"status": r.status, "acao": self._acao(r.request), "codigo": codigo})

    def _falhou(self, req) -> None:
        if self.trecho in req.url and req.method != "OPTIONS":
            self.eventos.append({"status": 0, "acao": self._acao(req), "codigo": f"falha de rede: {req.failure}"})

    def desde(self, n: int, acao: str | None = None) -> list[dict]:
        return [e for e in self.eventos[n:] if acao is None or e["acao"] == acao]

    @staticmethod
    def limitado(eventos: list[dict]) -> bool:
        return any(e["status"] == 429 and e["codigo"] == "muitos_pedidos" for e in eventos)

    @staticmethod
    def resumo(eventos: list[dict]) -> str:
        return ", ".join(" ".join(x for x in (str(e["status"]), e["acao"], e["codigo"]) if x) for e in eventos) or "nenhuma resposta"


class Forcar:
    """Muda SÓ a resposta da situação que a tela recebe (functions/v1/pos-login e rest/v1/rpc/minha_situacao) — o banco não muda.

    legal      os campos do `legal` a forçar (só com a versão dos textos ligada no banco: com `legal` nulo nada é forçado e o caso
               falha dizendo isso);
    sem_nada   a conta sem nada (as Boas-vindas), como na hml-11;
    recusa     a resposta do aceitar_no_acesso: o pedido vai ao banco com uma versão velha (recusado lá, nada gravado) e a resposta
               volta com esta recusa (os cabeçalhos são os de verdade);
    ate_o_fim  força o tempo todo (o T10); senão, o `legal` para de ser forçado assim que o aceite der certo — a situação recarregada
               é a real (a conta já aceitou), e a porta libera.
    """

    def __init__(self, caso, legal: dict | None = None, sem_nada: bool = False, recusa: dict | None = None, ate_o_fim: bool = False):
        self.legal, self.sem_nada, self.recusa, self.ate_o_fim = legal, sem_nada, recusa, ate_o_fim
        self.n = self.sem_versao = self.aceites = 0
        caso.pg.route("**/functions/v1/pos-login*", self._situacao)
        caso.pg.route("**/rest/v1/rpc/minha_situacao*", self._situacao)
        caso.pg.route("**/rest/v1/rpc/aceitar_no_acesso*", self._aceite)

    def _situacao(self, route) -> None:
        if route.request.method == "OPTIONS" or (not self.legal and not self.sem_nada):
            route.continue_()
            return
        r = route.fetch()
        try:
            corpo = r.json()
        except Exception:  # noqa: BLE001
            route.fulfill(response=r)
            return
        alvo = corpo.get("situacao") if isinstance(corpo, dict) and isinstance(corpo.get("situacao"), dict) else corpo
        if isinstance(alvo, dict):
            if self.sem_nada and "sem_nada" in alvo:
                alvo["sem_nada"] = True
            leg = alvo.get("legal")
            if self.legal:
                if isinstance(leg, dict) and leg.get("versao"):
                    leg.update(self.legal)
                    self.n += 1
                else:
                    self.sem_versao += 1
        route.fulfill(response=r, json=corpo)

    def _aceite(self, route) -> None:
        if route.request.method == "OPTIONS":
            route.continue_()
            return
        self.aceites += 1
        if self.recusa is not None:
            try:
                pedido = json.loads(route.request.post_data or "{}")
            except Exception:  # noqa: BLE001
                pedido = {}
            pedido["p_versao"] = "2000-01-01"  # o banco recusa (versao_desatualizada) antes de gravar qualquer coisa
            r = route.fetch(post_data=json.dumps(pedido))
            route.fulfill(response=r, json=self.recusa)
            return
        r = route.fetch()
        try:
            corpo = r.json()
        except Exception:  # noqa: BLE001
            corpo = None
        if isinstance(corpo, dict) and corpo.get("ok") is True and not self.ate_o_fim:
            self.legal = None  # o aceite valeu: daqui em diante a situação é a do banco
        route.fulfill(response=r)

    def resumo(self) -> str:
        return f"forçado {self.n}×" + (f"; {self.sem_versao}× SEM a versão ligada no banco" if self.sem_versao else "")


# ───────────────────────── antes de tudo (staging): o build e o banco ─────────────────────────
def conferir_banco_staging(o) -> bool:
    try:
        r = ler("select a.valor ->> 'versao' as v from staging.app_config a where a.chave = 'textos_legais'")
    except Exception as e:  # noqa: BLE001
        o.ok(False, f"a versão dos textos no banco do staging: não deu para ler ({type(e).__name__})")
        return False
    v = r[0]["v"] if r else None
    return o.ok(v == VERSAO, f"a versão dos textos no banco do staging ({v}) = a do app (VERSAO_TEXTOS {VERSAO}) — a migração da hml-12 aplicada")


def g_t13_build(o, nav, base: str, prefixo: str, staging: bool, guarda: dict) -> None:
    """T13 + a guarda do build: no staging a faixa "Ambiente de teste" tem que estar lá (senão NENHUM caso logado roda — o build
    public falaria com o banco de produção); na produção, não."""
    caso = B5.Caso(nav, base, prefixo, "T13", desktop=False)
    try:
        caso.ir("/entrar")
        o.ok(caso.esperar(lambda: caso.tem("[data-entrar-google]"), 60), "T13 /entrar abre")
        e_staging = caso.tem("[data-entrada-staging]")
        guarda["build_staging"] = e_staging
        rodape = texto_de(caso, "footer")
        if staging:
            o.ok(e_staging, "o build é o de staging (a faixa 'Ambiente de teste' na entrada) — senão os casos logados não rodam", parar=False)
            links = {(l.get_attribute("href"), l.inner_text().strip()) for l in caso.pg.locator("[data-rodape-aceite] a").all()}
            o.ok(caso.tem("[data-rodape-aceite]") and {("/termos", "Termos de Uso"), ("/privacidade", "Política de Privacidade")} <= links,
                 f"T13 o rodapé da entrada só com os links 'Termos de Uso · Política de Privacidade' ({sorted(links)})")
            o.ok("Ao continuar você aceita" not in rodape, "T13 sem 'Ao continuar você aceita…' (o aceite é a porta, depois do login)")
        else:
            o.ok(not e_staging, "o build é o de produção (sem a faixa 'Ambiente de teste')")
            o.ok("Ao continuar você aceita" in rodape and caso.pg.locator("[data-rodape-aceite]").count() == 0,
                 "T13 (produção) o rodapé antigo: 'Ao continuar você aceita a Política de Privacidade e os termos de uso', sem a marca nova")
        rolar_ate(caso, "footer")
        o.linha(f"   print: {caso.print('T13_rodape_entrada')}")
    finally:
        caso.fim()


# ───────────────────────── T1, T16, T4, T12: aluno de profissional ─────────────────────────
def linhas_de_aceite(user_id: str, documento: str = "textos") -> int:
    r = ler(f"""select count(*)::int as n from staging.aceites
                 where user_id = {C.txt(C.uuid_ok(user_id))} and documento = {C.txt(documento)} and evento = 'aceitou' and versao = {C.txt(VERSAO)}""")
    return r[0]["n"] if r else -1


ALUNO_DE_PROFISSIONAL = "w5-aluno2"


def g_t1_t16(o, nav, base: str, prefixo: str, sess, casos: set[str]) -> None:
    conta = ALUNO_DE_PROFISSIONAL
    if casos & {"T1", "T16"}:
        caso = B5.Caso(nav, base, prefixo, "T1", desktop=False)
        f = Forcar(caso, legal={"aceite_pendente": True})
        try:
            entrar(caso, conta, "/", sess)
            if not o.ok(esperar_porta(caso), f"T1 a porta do aceite aparece logo depois do login (aluno de profissional; {f.resumo()})"):
                return
            o.ok(caso.pg.locator(PORTA).first.get_attribute("data-aceite-no-acesso") == VERSAO, f"T1 a porta é da versão vigente ({VERSAO})")
            o.ok(not caso.tem("[data-tabbar]") and caso.pg.locator("[data-aviso-mudanca-ok]").count() == 0,
                 "T1 nada do app nem dos avisos globais monta por trás da porta")
            o.ok(caso.pg.locator(f"{PORTA} [data-consentimento-saude]").count() == 0
                 and caso.pg.locator(f"{PORTA} [data-campo-nascimento]").count() == 0,
                 "T1 aluno de profissional: sem a caixa de saúde e sem a data de nascimento (o profissional atende: art. 11, II, 'f')")
            caixa = texto_de(caso, "label:has([data-aceite-caixa])")
            o.ok("Li e aceito os Termos de Uso e a Política de Privacidade" in caixa and "16 anos ou mais" in caixa, f"T1 a caixa do aceite (com os 16 anos, P5): {caixa!r}")
            o.ok(caso.pg.locator("[data-aceitar]").first.is_disabled(), "T1 'Aceitar e continuar' travado sem a caixa")
            links = {l.get_attribute("data-aceite-link") for l in caso.pg.locator("[data-aceite-link]").all()}
            o.ok(links == {"termos", "privacidade", "assinatura"}, f"T1 os links dos 3 textos ({sorted(x or '' for x in links)})")
            o.ok(caso.tem("[data-aceite-excluir]") and caso.tem("[data-aceite-sair]"), "T1 'Não concorda? Excluir minha conta' e 'Sair' na tela")
            destino = caso.pg.locator("[data-aceite-excluir]").first.get_attribute("href") if caso.pg.locator("[data-aceite-excluir]").count() else ""
            o.ok(destino == "/perfil?excluir=1", f"T1 o 'Excluir minha conta' do aluno vai para a exclusão dele, livre na porta ({destino})")
            o.ok(caso.pg.locator("[data-aceite-resumo]").count() == 1 and len(texto_de(caso, "[data-aceite-resumo]")) > 80, "T1 o resumo dos Termos de Uso")
            o.linha(f"   print: {caso.print('T1_porta')}")
            if "T16" in casos:
                lg = largura(caso)
                o.ok(0 < lg <= 392, f"T16 celular 390 px: a tela do aceite cabe na largura (scrollWidth {lg})")
                rolar_ate(caso, "[data-aceitar]")
                o.linha(f"   print: {caso.print('T16_porta_390px')}")
            if "T1" in casos:
                caso.pg.locator("[data-aceite-link='termos']").first.click()
                o.ok(caso.esperar(lambda: caso.tem("[data-pagina-legal='termos']"), 30), "T1 'Termos de Uso' abre o texto na mesma janela (rota livre)")
                o.linha(f"   print: {caso.print('T1_termos_pela_porta')}")
                voltar = caso.pg.locator("[data-voltar='app']")
                o.ok(voltar.count() > 0, "T1 o texto aberto pela porta tem o Voltar do app")
                if voltar.count():
                    voltar.first.click()
                o.ok(esperar_porta(caso, 30), "T1 o Voltar traz de volta à porta")
                B5.marcar(caso.pg.locator("[data-aceite-caixa]"))
                o.ok(caso.esperar(lambda: caso.pg.locator("[data-aceitar]").first.is_enabled(), 10), "T1 com a caixa marcada, 'Aceitar e continuar' destrava")
                caso.pg.locator("[data-aceitar]").first.click()
                saiu = caso.esperar(lambda: not caso.tem(PORTA), 60)
                o.ok(saiu and f.aceites >= 1, f"T1 Aceitar → a RPC aceitar_no_acesso de verdade ({f.aceites}×) e a porta abre")
                o.ok(caso.esperar(lambda: app_aberto(caso), 60), "T1 depois do aceite, o app (ou a trava de sempre) aparece")
                o.linha(f"   print: {caso.print('T1_depois_do_aceite')}")
        finally:
            caso.fim()
        if "T1" in casos:
            caso = B5.Caso(nav, base, prefixo, "T1-2o-acesso", desktop=False)
            try:
                entrar(caso, conta, "/", sess)
                tem_porta = B5.porta_na_tela(caso, 45)
                o.ok(not tem_porta and B5.estado_da_porta(caso) == "livre", f"T1 o 2º acesso (sem forçar nada) não pede o aceite ({B5.estado_da_porta(caso)})")
                u = uid(conta)
                n = linhas_de_aceite(u) if u else -1
                o.ok(n == 1, f"T1 no banco: 1 aceite dos textos da versão {VERSAO} para a conta — o aceite de novo não duplica ({n})")
            finally:
                caso.fim()


def g_t4(o, nav, base: str, prefixo: str, sess) -> None:
    conta = ALUNO_DE_PROFISSIONAL
    caso = B5.Caso(nav, base, prefixo, "T4", desktop=False)
    f = Forcar(caso, legal={"aceite_pendente": True}, recusa={"ok": False, "erro": "versao_desatualizada", "versao": "2099-12-31"})
    try:
        entrar(caso, conta, "/", sess)
        if not o.ok(esperar_porta(caso), f"T4 a porta (aceite pendente forçado só na resposta; {f.resumo()})"):
            return
        B5.marcar(caso.pg.locator("[data-aceite-caixa]"))
        caso.pg.locator("[data-aceitar]").first.click()
        ok = caso.esperar(lambda: caso.tem("[data-aceite-erro='versao_desatualizada']"), 30)
        o.ok(ok and "Os termos foram atualizados. Recarregue para ler a versão nova." in texto_de(caso, "[data-aceite-erro]"),
             f"T4 versao_desatualizada (o banco na frente do app) → 'Os termos foram atualizados…' ({texto_de(caso, '[data-aceite-erro]')!r})")
        o.ok(caso.tem("[data-aceite-recarregar]"), "T4 o botão Recarregar")
        o.linha(f"   print: {caso.print('T4_versao_desatualizada')}")
        caso.pg.evaluate("() => { window.__hml12_antes = 1; }")
        caso.pg.locator("[data-aceite-recarregar]").first.click()
        ok = caso.esperar(lambda: caso.pg.evaluate("() => window.__hml12_antes === undefined") and caso.tem(PORTA)
                          and not caso.tem("[data-aceite-erro]"), 60)
        o.ok(ok, "T4 Recarregar → a página recarrega e a porta volta limpa (o pedido foi recusado no banco: nada gravado)")
    finally:
        caso.fim()


def g_t12(o, nav, base: str, prefixo: str, sess) -> None:
    conta = ALUNO_DE_PROFISSIONAL
    caso = B5.Caso(nav, base, prefixo, "T12", desktop=False)
    try:
        entrar(caso, conta, "/perfil", sess)
        caso.fechar_avisos()
        ok = caso.esperar(lambda: caso.tem("[data-aba-perfil]") and caso.pg.locator("text=Exportar meus dados").count() > 0, 60)
        o.ok(ok, "T12 Perfil com 'Exportar meus dados'")
        caso.pg.locator("text=Exportar meus dados").first.click()
        o.ok(caso.esperar(lambda: caso.tem("[data-sheet-exportar]"), 15), "T12 a folha Exportar abriu")
        # o download OU o erro da folha (sem o expect_download: se a função falha, a folha mostra o erro e o teste diz qual), com o
        # status da função; se for o 429 do teto por IP da Cloudflare (H-46 — não chega à função), 1 nova tentativa depois de 65 s
        rede = Rede(caso, "/functions/v1/exportar-meus-dados")
        baixados: list = []
        caso.pg.on("download", lambda d: baixados.append(d))  # (o Playwright não aceita um método embutido como ouvinte)
        for tentativa in (1, 2):
            n = len(rede.eventos)
            caso.pg.locator("[data-exportar-baixar]").first.click()
            caso.esperar(lambda: bool(baixados) or caso.tem("[data-exportar-erro]"), 150)
            if baixados or tentativa == 2 or not Rede.limitado(rede.desde(n)):
                break
            o.linha("   (T12: 429 do teto por IP da Cloudflare, H-46 — de novo em 65 s)")
            caso.pg.wait_for_timeout(65_000)
        if not o.ok(bool(baixados), f"T12 'Baixar' → o arquivo baixou (exportar-meus-dados: {Rede.resumo(rede.eventos)}; "
                                    f"erro na folha: {texto_de(caso, '[data-exportar-erro]')!r})"):
            o.linha(f"   print: {caso.print('T12_sem_download')}")
            return
        # o arquivo fica no temporário do Playwright (some ao fechar o contexto): lido na memória, nada é guardado
        arq = json.loads(Path(baixados[0].path()).read_text(encoding="utf-8"))
        aceites = (arq.get("banco_principal") or {}).get("aceites")
        textos = [a for a in aceites or [] if isinstance(a, dict) and a.get("documento") == "textos"]
        o.ok(isinstance(aceites, list) and any(a.get("versao") == VERSAO and a.get("evento", "aceitou") == "aceitou" for a in textos),
             f"T12 o arquivo tem 'aceites' com o aceite dos textos da versão {VERSAO} ({len(aceites or [])} evento(s))")
        o.ok(isinstance(aceites, list) and all(isinstance(a, dict) and "registrado_por" not in a for a in aceites),
             "T12 os aceites saem sem 'registrado_por'")
        caso.esperar(lambda: caso.tem("[data-exportar-ok]"), 15)
        o.linha(f"   print: {caso.print('T12_exportar')}")
    finally:
        caso.fim()


# ───────────────────────── T2: aluno do app ─────────────────────────
def matricula_do_app(user_id: str) -> dict | None:
    r = ler(f"""select p.id::text as id, p.nascimento::text as nascimento
                  from staging.pacientes p join staging.contas c on c.id = p.conta_id
                 where p.user_id = {C.txt(C.uuid_ok(user_id))} and c.origem = 'app' and p.deleted_at is null and p.ativo
                 order by p.created_at desc limit 1""")
    return r[0] if r else None


def nascimento_de(matricula_id: str) -> str | None:
    r = ler(f"select nascimento::text as n from staging.pacientes where id = {C.txt(C.uuid_ok(matricula_id))}")
    return r[0]["n"] if r else None


def g_aluno_do_app(o, nav, base: str, prefixo: str, sess) -> None:
    conta = "w7b-sozinho"
    u = uid(conta)
    mat = matricula_do_app(u) if u else None
    if not o.ok(bool(mat), "T2 a conta de teste do aluno do app (w7b-sozinho) tem a matrícula do app no staging (senão: e2e/w07b/contas.py + api.py entrar)"):
        return
    antes = mat["nascimento"]
    adulto = B5.data_com_idade(30)
    try:
        # a data de verdade fica vazia: a tela pede a data e o banco confere de novo (17 anos → menor_de_18; 30 → grava)
        if antes is not None:
            sql_staging(f"update staging.pacientes set nascimento = null where id = {C.txt(mat['id'])}")
        caso = B5.Caso(nav, base, prefixo, "T2", desktop=False)
        f = Forcar(caso, legal={"aceite_pendente": True, "saude_pendente": True, "nascimento_pendente": True})
        try:
            entrar(caso, conta, "/", sess)
            if not o.ok(esperar_porta(caso), f"T2 a porta do aceite do aluno do app ({f.resumo()})"):
                return
            bloco = f"{PORTA} [data-consentimento-saude='app']"
            o.ok(caso.tem(bloco) and caso.pg.locator(f"{bloco} [data-consentimento-saude-caixa]").count() == 1,
                 "T2 a caixa de saúde em destaque, separada da caixa do aceite")
            texto = texto_de(caso, bloco)
            o.ok("Nunca para publicidade" in texto and "retirar este consentimento" in texto and "não funciona" in texto,
                 "T2 o texto diz para que serve, que não vai para publicidade, como retirar e o que acontece sem ele")
            o.ok(caso.tem(f"{PORTA} [data-campo-nascimento] input[type='date']"), "T2 a data de nascimento (o plano sem profissional é 18+)")
            lg = largura(caso)
            o.ok(0 < lg <= 392, f"T16 celular 390 px: a porta do aluno do app (a mais longa) cabe na largura (scrollWidth {lg})")
            o.linha(f"   print: {caso.print('T2_porta_aluno_do_app')}")
            B5.preencher_porta(caso, B5.data_com_idade(17))
            caso.pg.locator("[data-aceitar]").first.click()
            ok = caso.esperar(lambda: caso.tem("[data-aceite-erro='menor_de_18']"), 20)
            o.ok(ok and "Se você tem 16 ou 17 anos, treine com um profissional" in texto_de(caso, "[data-aceite-erro]"),
                 f"T2 17 anos → 'O plano sem profissional é para maiores de 18 anos…' ({texto_de(caso, '[data-aceite-erro]')!r})")
            o.ok(nascimento_de(mat["id"]) is None, "T2 com 17 anos nada foi gravado na matrícula")
            rolar_ate(caso, "[data-aceite-erro]")
            o.linha(f"   print: {caso.print('T2_17_anos')}")
            caso.pg.locator(f"{PORTA} [data-campo-nascimento] input[type='date']").first.fill(adulto)
            caso.pg.locator("[data-aceitar]").first.click()
            saiu = caso.esperar(lambda: not caso.tem(PORTA), 60)
            o.ok(saiu, "T2 30 anos → aceita e a porta abre")
            o.ok(caso.esperar(lambda: app_aberto(caso), 60), "T2 o app do aluno do app aparece")
            o.linha(f"   print: {caso.print('T2_depois_do_aceite')}")
            o.ok(nascimento_de(mat["id"]) == adulto, "T2 a data de nascimento foi gravada na matrícula do app pelo aceite")
        finally:
            caso.fim()
    finally:
        sql_staging(f"update staging.pacientes set nascimento = {lit(antes)} where id = {C.txt(mat['id'])}")
        o.ok(nascimento_de(mat["id"]) == antes, "T2 a data de nascimento da matrícula do app voltou ao valor de antes")


# ───────────────────────── T3: profissional no painel ─────────────────────────
def g_profissional(o, nav, base: str, prefixo: str, sess) -> None:
    caso = B5.Caso(nav, base, prefixo, "T3-painel", desktop=True)
    f = Forcar(caso, legal={"aceite_pendente": True})
    try:
        entrar(caso, "w5-dono", "/painel", sess)
        if not o.ok(esperar_porta(caso), f"T3 profissional: a porta vem antes do /painel ({f.resumo()})"):
            return
        o.ok(not caso.tem("[data-menu-lateral]"), "T3 o painel não monta por trás da porta")
        o.linha(f"   print: {caso.print('T3_porta_painel')}")
        saiu, erro = B5.aceitar_a_porta(caso)
        o.ok(saiu and caso.esperar(lambda: caso.tem("[data-menu-lateral]"), 60), f"T3 aceitou → o painel abre{f' ({erro})' if erro else ''}")
        o.linha(f"   print: {caso.print('T3_painel_depois')}")
    finally:
        caso.fim()


# ───────────────────────── T3 (Boas-vindas), T5, T6, T14: conta sem nada ─────────────────────────
def matriculas_do_app(user_id: str) -> int:
    r = ler(f"""select count(*)::int as n from staging.pacientes p join staging.contas c on c.id = p.conta_id
                 where p.user_id = {C.txt(C.uuid_ok(user_id))} and c.origem = 'app' and p.deleted_at is null""")
    return r[0]["n"] if r else -1


def g_sem_nada(o, nav, base: str, prefixo: str, sess, casos: set[str]) -> None:
    conta = "excluir2"
    u = uid(conta)
    app_antes = matriculas_do_app(u) if u else -1
    caso = B5.Caso(nav, base, prefixo, "T3-T5-T6-T14", desktop=False)
    f = Forcar(caso, legal={"aceite_pendente": True}, sem_nada=True)
    try:
        entrar(caso, conta, "/", sess)
        if "T3" in casos:
            o.ok(esperar_porta(caso), f"T3 conta sem nada: a porta vem antes das Boas-vindas ({f.resumo()})")
            o.ok(caso.pg.locator("[data-onboarding]").count() == 0, "T3 as Boas-vindas não montam por trás da porta")
            o.linha(f"   print: {caso.print('T3_porta_boas_vindas')}")
        if B5.porta_na_tela(caso, 30):
            saiu, erro = B5.aceitar_a_porta(caso)
            o.ok(saiu, f"T3 aceitou a porta da conta sem nada{f' ({erro})' if erro else ''}")
        ok = caso.esperar(lambda: caso.tem("[data-sozinho-abrir]") and caso.pg.locator("[data-onboarding]").count() == 3, 60)
        o.ok(ok, "T3 depois do aceite, as Boas-vindas com as 3 opções")
        if "T3" in casos:
            o.linha(f"   print: {caso.print('T3_boas_vindas_depois')}")
        if casos & {"T5", "T6"}:
            caso.pg.locator("[data-sozinho-abrir]").first.click()
            o.ok(caso.esperar(lambda: caso.tem("[data-form-sozinho]"), 30), "T5 o cartão 'Treinar sem profissional' abriu (sem clicar em 'Começar')")
            bloco = "[data-form-sozinho] [data-consentimento-saude='app']"
            data = caso.pg.locator("[data-form-sozinho] [data-campo-nascimento] input[type='date']")
            enviar = caso.pg.locator("[data-sozinho-enviar]").first
            o.ok(caso.esperar(lambda: caso.tem(bloco), 20) and data.count() == 1,
                 "T5 a data de nascimento e o consentimento de saúde em destaque antes de começar")
            o.ok(enviar.is_disabled(), "T5 'Começar' travado sem a data e o consentimento")
            data.first.fill(B5.nascimento_adulto())
            B5.marcar(caso.pg.locator(f"{bloco} [data-consentimento-saude-caixa]"))
            o.ok(caso.esperar(lambda: enviar.is_enabled(), 10), "T5 com a data de adulto e a caixa marcada, 'Começar' destrava (não clicado)")
            o.ok(caso.tem("[data-resumo-antes-de-pagar='sem-profissional']"), "T5 o resumo dos Termos de assinatura da hml-11 continua")
            rolar_ate(caso, bloco)
            o.linha(f"   print: {caso.print('T5_treinar_sem_profissional')}")
            if "T6" in casos:
                data.first.fill(B5.data_com_idade(17))
                caso.pg.locator("[data-objetivo='emagrecer']").first.click()
                enviar.click()
                ok = caso.esperar(lambda: "Se você tem 16 ou 17 anos" in texto_de(caso, "[data-sozinho-erro]"), 20)
                o.ok(ok, f"T6 17 anos → 'O plano sem profissional é para maiores de 18 anos…' ({texto_de(caso, '[data-sozinho-erro]')!r})")
                rolar_ate(caso, "[data-sozinho-erro]")
                o.linha(f"   print: {caso.print('T6_17_anos')}")
                depois = matriculas_do_app(u) if u else -1
                o.ok(depois == app_antes, f"T6 nada foi criado: matrículas do app da conta {app_antes} → {depois}")
        if "T14" in casos:
            caso.ir("/boas-vindas")
            caso.esperar(lambda: caso.tem("[data-criar-conta-abrir]"), 60)
            caso.pg.locator("[data-criar-conta-abrir]").first.click()
            ok = caso.esperar(lambda: caso.tem("[data-form-criar-conta]") and caso.tem("[data-declaracao-profissional]"), 30)
            linha = texto_de(caso, "[data-declaracao-profissional]")
            o.ok(ok and "18 anos ou mais" in linha and "registro profissional informado é seu e está válido" in linha,
                 f"T14 'Sou profissional' com a linha de declaração ({linha!r}) — sem criar a conta")
            rolar_ate(caso, "[data-declaracao-profissional]")
            o.linha(f"   print: {caso.print('T14_sou_profissional')}")
    finally:
        caso.fim()


# ───────────────────────── T7: pré-consulta /f/ ─────────────────────────
def conta_do_dono() -> tuple[str, str, str] | None:
    """(id do login da w5-dono, conta dela, código do link /c/) — só leitura."""
    d = uid("w5-dono")
    if not d:
        return None
    r = ler(f"""select c.id::text as conta, m.codigo_convite as codigo from staging.contas c
                  join staging.conta_membros m on m.conta_id = c.id and m.user_id = c.dono_id
                 where c.dono_id = {C.txt(C.uuid_ok(d))} and c.origem = 'nova' and m.codigo_convite is not null
                 order by c.criado_em limit 1""")
    return (d, r[0]["conta"], r[0]["codigo"]) if r else None


def g_preconsulta(o, nav, base: str, prefixo: str) -> None:
    dono = conta_do_dono()
    if not o.ok(bool(dono), "T7 a conta de teste da w5-dono existe no staging (e2e/w05/contas_equipe.py)"):
        return
    d, conta, _ = dono
    slug = "hml12" + "".join(secrets.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(8))
    perguntas = json.dumps([{"id": "p1", "texto": "Qual é o seu objetivo agora?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []}])
    form = sql_staging(f"""insert into staging.formularios_preconsulta (nutricionista_id, conta_id, titulo, descricao, origem, slug, perguntas, faixas, ativo)
                            values ({C.txt(d)}, {C.txt(conta)}, {C.txt(TITULO_FORM)}, 'Formulário de teste (hml-12), apagado no fim.', 'personalizado',
                                    {C.txt(slug)}, {C.txt(perguntas)}::jsonb, '[]'::jsonb, true)
                            returning id::text as id""")[0]["id"]
    try:
        caso = B5.Caso(nav, base, prefixo, "T7", desktop=False)
        try:
            caso.ir(f"/f/{slug}")
            o.ok(caso.esperar(lambda: caso.tem("[data-form-publico]"), 60), "T7 o /f/ de teste abre sem login")
            bloco = "[data-consentimento-saude='preconsulta']"
            o.ok(caso.esperar(lambda: caso.tem(bloco), 20), "T7 a caixa de consentimento das respostas de saúde, em destaque, antes de Enviar")
            texto = texto_de(caso, bloco)
            o.ok("Nunca para publicidade" in texto and "Tenho 18 anos ou mais, ou respondo com o meu responsável" in texto,
                 "T7 o texto (para quem vão as respostas, sem publicidade, como retirar) e a idade (P8)")
            caso.pg.locator("[data-campo-nome-publico]").fill("Teste Consentimento hml12")
            caso.pg.locator("[data-campo-texto='0']").fill("Ganhar condicionamento")
            rolar_ate(caso, bloco)
            o.linha(f"   print: {caso.print('T7_consentimento')}")
            caso.pg.locator("[data-btn-enviar-publico]").first.click()
            ok = caso.esperar(lambda: "Para enviar, marque o consentimento." in texto_de(caso, "[data-erro-publico]"), 15)
            o.ok(ok, f"T7 sem marcar → 'Para enviar, marque o consentimento.' ({texto_de(caso, '[data-erro-publico]')!r})")
            rolar_ate(caso, "[data-erro-publico]")
            o.linha(f"   print: {caso.print('T7_sem_marcar')}")
            nenhuma = ler(f"select count(*)::int as n from staging.respostas_preconsulta where formulario_id = {C.txt(form)}")[0]["n"]
            o.ok(nenhuma == 0, f"T7 sem o consentimento nada foi enviado ({nenhuma} resposta)")
            B5.marcar(caso.pg.locator(f"{bloco} [data-consentimento-saude-caixa]"))
            caso.pg.locator("[data-btn-enviar-publico]").first.click()
            o.ok(caso.esperar(lambda: caso.tem("[data-formulario-enviado]"), 40), "T7 marcado → 'Respostas enviadas'")
            o.linha(f"   print: {caso.print('T7_enviado')}")
            r = ler(f"""select consentimento_versao as v, consentimento_em is not null as em from staging.respostas_preconsulta
                         where formulario_id = {C.txt(form)} order by created_at desc limit 1""")
            o.ok(bool(r) and r[0]["v"] == VERSAO and r[0]["em"] is True,
                 f"T7 a resposta guarda o consentimento (versão {r[0]['v'] if r else None}, com data e hora)")
        finally:
            caso.fim()
    finally:
        sql_staging(f"""delete from staging.respostas_preconsulta where formulario_id = {C.txt(form)};
                        delete from staging.formularios_preconsulta where id = {C.txt(form)}""")
        o.linha("   (o formulário de teste e a resposta foram apagados)")


# ───────────────────────── T8: cadastro pelo link /c/ ─────────────────────────
def captcha_do_staging() -> object:
    r = ler("select valor -> 'captcha' as c from staging.app_config where chave = 'login_limite'")
    return r[0]["c"] if r else None


def pendentes_com_nome(conta: str, nome: str) -> int:
    return ler(f"""select count(*)::int as n from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and nome = {C.txt(nome)}""")[0]["n"]


def g_cadastro(o, nav, base: str, prefixo: str) -> None:
    dono = conta_do_dono()
    if not o.ok(bool(dono), "T8 o código do link de cadastro da w5-dono existe no staging"):
        return
    _, conta, codigo = dono
    antes = captcha_do_staging()
    # o Chromium/Edge automatizado não passa no Turnstile: no STAGING o captcha fica desligado do começo ao fim do caso (W13/hml-05b;
    # a função alunos lê a regra a cada pedido) e volta ao valor de antes no finally. A tela espera o token do Turnstile (25 s, ou
    # 120 s se o Cloudflare pedir a caixinha) e só então chama a função: o teste espera até 150 s
    sql_staging("update staging.app_config set valor = jsonb_set(valor, '{captcha}', 'false'::jsonb) where chave = 'login_limite'")
    caso = B5.Caso(nav, base, prefixo, "T8", desktop=False)
    rede = Rede(caso, "/functions/v1/alunos")
    try:
        caso.ir(f"/c/{urllib.parse.quote(codigo)}")
        o.ok(caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60), "T8 o /c/ de teste abre")
        linha = texto_de(caso, "[data-aviso-idade-cadastro]")
        o.ok("16 anos ou mais" in linha and "Política de Privacidade" in linha, f"T8 a linha da idade mínima e da Política (P9): {linha!r}")
        caso.pg.locator("[data-cad-nome]").fill(NOME_CADASTRO_15)
        caso.pg.locator("[data-cad-nascimento]").fill(B5.data_com_idade(15))
        rolar_ate(caso, "[data-aviso-idade-cadastro]")
        o.linha(f"   print: {caso.print('T8_linha_da_idade')}")
        for tentativa in (1, 2):
            n = len(rede.eventos)
            caso.pg.locator("[data-cad-enviar]").first.click()
            # a resposta do cadastro_enviar (ou a falha do pedido) e, depois, a frase na tela
            caso.esperar(lambda: bool(rede.desde(n, "cadastro_enviar")), 150)
            caso.esperar(lambda: bool(texto_de(caso, "[data-cad-erro]")) or caso.tem("[data-cadastro-enviado]"), 10)
            if tentativa == 2 or not Rede.limitado(rede.desde(n)):
                break
            o.linha("   (T8: 429 do teto por IP da Cloudflare, H-46 — de novo em 65 s)")
            caso.pg.wait_for_timeout(65_000)
        frase = texto_de(caso, "[data-cad-erro]")
        o.ok("16 anos ou mais" in frase, f"T8 15 anos → 'O Physiq é para quem tem 16 anos ou mais…' ({frase!r}; alunos: "
                                        f"{Rede.resumo(rede.desde(0, 'cadastro_enviar'))})")
        o.ok(not caso.tem("[data-cadastro-enviado]") and pendentes_com_nome(conta, NOME_CADASTRO_15) == 0, "T8 nada foi criado (nenhum cadastro pendente)")
        rolar_ate(caso, "[data-cad-erro]")
        o.linha(f"   print: {caso.print('T8_15_anos')}")
    finally:
        caso.fim()
        sql_staging(f"update staging.app_config set valor = jsonb_set(valor, '{{captcha}}', {C.txt(json.dumps(antes if antes is not None else True))}::jsonb) "
                    "where chave = 'login_limite'")
        sql_staging(f"delete from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and nome = {C.txt(NOME_CADASTRO_15)}")
        o.ok(captcha_do_staging() == (antes if antes is not None else True), "T8 o captcha do staging voltou ao valor de antes")


# ───────────────────────── T15: Pendentes ─────────────────────────
def g_pendentes(o, nav, base: str, prefixo: str, sess) -> None:
    dono = conta_do_dono()
    if not o.ok(bool(dono), "T15 a conta de teste da w5-dono existe no staging"):
        return
    _, conta, codigo = dono
    sql_staging(f"delete from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and lower(email) = {C.txt(EMAIL_PENDENTE)}")
    dados = json.dumps({"nome": NOME_PENDENTE, "email": EMAIL_PENDENTE, "nascimento": B5.data_com_idade(17)})
    r = sql_staging(f"select staging.cadastro_link_enviar({C.txt(codigo)}, {C.txt(dados)}::jsonb) as r")[0]["r"]
    pid = r.get("id") if isinstance(r, dict) else None
    if not o.ok(isinstance(r, dict) and r.get("ok") is True and C.eh_uuid(pid), f"T15 o cadastro pendente de teste (17 anos) entrou ({C.resumo(r)})"):
        return
    caso = B5.Caso(nav, base, prefixo, "T15", desktop=True)
    try:
        entrar(caso, "w5-dono", "/painel/alunos", sess)
        caso.fechar_avisos()
        o.ok(caso.esperar(lambda: caso.tem("[data-abrir-pendentes]"), 60), "T15 o botão Pendentes")
        caso.pg.locator("[data-abrir-pendentes]").first.click()
        sel = f"[data-pendente='{pid}'] [data-pendente-idade='16_17']"
        ok = caso.esperar(lambda: caso.tem(sel), 30)
        dica = texto_de(caso, sel)
        o.ok(ok and "17 anos" in dica and "registre o consentimento do responsável na ficha" in dica, f"T15 a dica dos 16–17 no pendente: {dica!r}")
        rolar_ate(caso, f"[data-pendente='{pid}']")
        o.linha(f"   print: {caso.print('T15_pendentes_dica')}")
        caso.pg.keyboard.press("Escape")
    finally:
        caso.fim()
        sql_staging(f"delete from staging.cadastros_pendentes where id = {C.txt(pid)} and conta_id = {C.txt(conta)}")
        o.linha("   (o cadastro pendente de teste foi apagado — nada aprovado)")


# ───────────────────────── T9, T10, T11: o responsável (16–17) ─────────────────────────
def matricula_do_aluno1(dono_id: str) -> dict | None:
    a = uid("w5-aluno1")
    if not a:
        return None
    r = ler(f"""select p.id::text as id, p.nascimento::text as nascimento from staging.pacientes p join staging.contas c on c.id = p.conta_id
                 where p.user_id = {C.txt(C.uuid_ok(a))} and c.dono_id = {C.txt(C.uuid_ok(dono_id))} and p.deleted_at is null and p.ativo
                 order by p.created_at limit 1""")
    return r[0] if r else None


def evento_do_responsavel(matricula_id: str) -> str | None:
    r = ler(f"""select evento from staging.aceites where paciente_id = {C.txt(C.uuid_ok(matricula_id))} and documento = 'responsavel'
                 order by em desc limit 1""")
    return r[0]["evento"] if r else None


def abrir_ficha(o, nav, base: str, prefixo: str, sess, mat: str, nome: str):
    caso = B5.Caso(nav, base, prefixo, nome, desktop=True)
    entrar(caso, "w5-dono", f"/painel/alunos/{mat}", sess)
    caso.fechar_avisos()
    o.ok(caso.esperar(lambda: caso.tem(f"[data-card-dados-aluno='{mat}']"), 60), f"[{nome}] a ficha do aluno (Resumo › Dados do aluno)")
    return caso


def retirar(o, caso, rotulo: str) -> bool:
    caso.pg.locator("[data-responsavel-retirar]").first.click()
    o.ok(caso.esperar(lambda: caso.tem("[data-sheet-responsavel='retirar']"), 15)
         and "O app do aluno fecha até um novo registro" in texto_de(caso, "[data-sheet-responsavel='retirar']"),
         f"{rotulo} Retirar pede confirmação ('O app do aluno fecha até um novo registro')")
    caso.pg.locator("[data-responsavel-retirar-confirmar]").first.click()
    return caso.esperar(lambda: caso.tem("[data-responsavel-registrar]") and not caso.tem("[data-responsavel-registrado]"), 30)


def aluno_entra(o, nav, base: str, prefixo: str, sess, nome: str, forcar: dict | None = None):
    caso = B5.Caso(nav, base, prefixo, nome, desktop=False)
    if forcar:
        Forcar(caso, legal=forcar, ate_o_fim=True)
    entrar(caso, "w5-aluno1", "/", sess)
    if B5.porta_na_tela(caso, 45):  # a 1ª vez da conta: o aceite vem antes da trava de idade
        saiu, erro = B5.aceitar_a_porta(caso)
        o.ok(saiu, f"[{nome}] a porta do aceite (antes da trava de idade) aceita{f' ({erro})' if erro else ''}")
    return caso


def g_responsavel(o, nav, base: str, prefixo: str, sess, casos: set[str]) -> None:
    dono = conta_do_dono()
    mat_ = matricula_do_aluno1(dono[0]) if dono else None
    if not o.ok(bool(mat_), "T9 o aluno de teste w5-aluno1 tem matrícula na conta da w5-dono (e2e/w05/contas_equipe.py)"):
        return
    mat, antes = mat_["id"], mat_["nascimento"]
    dezessete = B5.data_com_idade(17)
    try:
        sql_staging(f"update staging.pacientes set nascimento = {C.txt(dezessete)} where id = {C.txt(mat)}")
        o.ok(nascimento_de(mat) == dezessete, "T9 a data do aluno de teste foi a 17 anos (volta ao valor de antes no fim)")
        # T10: sem o registro, o app do aluno de 17 fica fechado
        if "T10" in casos:
            ja_registrado = evento_do_responsavel(mat) == "aceitou"
            caso = aluno_entra(o, nav, base, prefixo, sess, "T10-sem-registro",
                               forcar={"aceite_pendente": False, "saude_pendente": False, "nascimento_pendente": False, "menor": "sem_responsavel"}
                               if ja_registrado else None)
            try:
                sel = "[data-tela-menor='sem_responsavel']"
                ok = caso.esperar(lambda: caso.tem(sel), 60)
                o.ok(ok and "Falta a autorização do seu responsável" in texto_de(caso, sel),
                     "T10 16–17 sem o registro → 'Falta a autorização do seu responsável'" + (" (forçado: havia um registro de antes)" if ja_registrado else ""))
                o.ok(caso.tem(f"{sel} [data-aceite-excluir]") and caso.tem(f"{sel} [data-trava-sair]"), "T10 a trava tem 'Excluir minha conta' e 'Sair'")
                o.ok(not caso.tem("[data-tabbar]"), "T10 o app não abre por trás da trava")
                o.linha(f"   print: {caso.print('T10_sem_responsavel')}")
            finally:
                caso.fim()
            caso = aluno_entra(o, nav, base, prefixo, sess, "T10-menor-16",
                               forcar={"aceite_pendente": False, "saude_pendente": False, "nascimento_pendente": False, "menor": "menor_16"})
            try:
                sel = "[data-tela-menor='menor_16']"
                ok = caso.esperar(lambda: caso.tem(sel), 60)
                o.ok(ok and "O Physiq é para quem tem 16 anos ou mais" in texto_de(caso, sel),
                     "T10 menor de 16 (forçado só na resposta) → 'O Physiq é para quem tem 16 anos ou mais'")
                o.linha(f"   print: {caso.print('T10_menor_16')}")
            finally:
                caso.fim()
        if not (casos & {"T9", "T10", "T11"}):
            return
        prof = abrir_ficha(o, nav, base, prefixo, sess, mat, "T9-ficha")
        try:
            secao = "[data-secao-responsavel='16_17']"
            o.ok(prof.esperar(lambda: prof.tem(secao), 30), "T9 a seção 'Consentimento do responsável' na ficha do aluno de 17 anos")
            if prof.tem("[data-responsavel-registrado]"):  # uma rodada de antes parou no meio: começa do zero
                o.ok(retirar(o, prof, "T9 (limpeza)"), "T9 (limpeza) o registro de uma rodada anterior foi retirado")
            if casos & {"T9", "T10"}:
                falta = texto_de(prof, secao)
                o.ok("falta o consentimento do responsável" in falta and "o app do aluno fica fechado" in falta
                     and prof.tem("[data-responsavel-registrar]"), f"T9 o aviso âmbar e 'Registrar consentimento': {falta!r}")
                o.linha(f"   print: {prof.print('T9_aviso_16_17')}")
                prof.pg.locator("[data-responsavel-registrar]").first.click()
                folha = "[data-sheet-responsavel='registrar']"
                o.ok(prof.esperar(lambda: prof.tem(folha), 15), "T9 a folha 'Consentimento do responsável'")
                prof.pg.locator(f"{folha} [data-responsavel-nome]").fill("Responsável Teste hml12")
                prof.pg.locator("[data-responsavel-vinculo='mae']").first.click()
                prof.pg.locator("[data-responsavel-forma='documento_assinado']").first.click()
                B5.marcar(prof.pg.locator("[data-responsavel-confirmo]"))
                o.linha(f"   print: {prof.print('T9_folha_registrar')}")
                prof.pg.locator("[data-responsavel-salvar]").first.click()
                ok = prof.esperar(lambda: prof.tem("[data-responsavel-registrado]"), 30)
                reg = texto_de(prof, "[data-responsavel-registrado]")
                o.ok(ok and "Responsável Teste hml12" in reg, f"T9 registrado: {reg!r}")
                o.ok(evento_do_responsavel(mat) == "aceitou", "T9 no banco: o último evento do responsável da matrícula é 'aceitou'")
                o.linha(f"   print: {prof.print('T9_registrado')}")
                if "T10" in casos:
                    caso = aluno_entra(o, nav, base, prefixo, sess, "T10-com-registro")
                    try:
                        abriu = caso.esperar(lambda: app_aberto(caso), 60)
                        o.ok(abriu and not caso.tem("[data-tela-menor]"), "T10 depois do registro, o app do aluno de 17 abre")
                        o.linha(f"   print: {caso.print('T10_com_registro')}")
                    finally:
                        caso.fim()
                o.ok(retirar(o, prof, "T9"), "T9 Retirar → volta o aviso (o app do aluno fecha de novo)")
                o.ok(evento_do_responsavel(mat) == "revogou", "T9 no banco: o último evento do responsável da matrícula é 'revogou'")
                o.linha(f"   print: {prof.print('T9_retirado')}")
            if "T11" in casos:
                prof.pg.locator("[data-dados-editar]").first.click()
                o.ok(prof.esperar(lambda: prof.tem("[data-editar-dados]"), 15), "T11 a folha Editar dados abriu")
                prof.pg.locator("[data-editar-nascimento]").fill(B5.data_com_idade(15))
                prof.pg.locator("[data-editar-salvar]").first.click()
                erro = lambda: " ".join(texto_de(prof, s) for s in ("[data-editar-erro]", "[data-editar-dados] [data-erro-campo]"))  # noqa: E731
                ok = prof.esperar(lambda: "16 anos ou mais" in erro(), 30)
                o.ok(ok and "Não cadastre menores de 16" in erro(),
                     f"T11 15 anos → 'O Physiq é para quem tem 16 anos ou mais. Não cadastre menores de 16.' ({erro().strip()!r})")
                o.ok(nascimento_de(mat) == dezessete, "T11 o banco recusou: a data continua a de antes (17 anos)")
                o.linha(f"   print: {prof.print('T11_menor_de_16')}")
                prof.pg.keyboard.press("Escape")
        finally:
            prof.fim()
    finally:
        sql_staging(f"update staging.pacientes set nascimento = {lit(antes)} where id = {C.txt(mat)}")
        o.ok(nascimento_de(mat) == antes, "T9 a data de nascimento do aluno de teste voltou ao valor de antes")


# ───────────────────────── produção (visitante, só leitura) ─────────────────────────
def codigo_de_teste_producao() -> str | None:
    """O código do link /c/ da conta de TESTE nutri.teste.claude no public (o mesmo do e2e/h5/prod.py) — só leitura."""
    r = ler("""select m.codigo_convite as c from public.conta_membros m join auth.users u on u.id = m.user_id
                where lower(u.email) = 'nutri.teste.claude@physiqnutri.app' and m.status = 'ativo' and m.codigo_convite is not null limit 1""")
    return r[0]["c"] if r else None


def slug_de_teste_producao() -> str | None:
    """Um formulário ativo de uma conta de TESTE no public, se houver (o e2e/w21/prod.py cria e apaga o dele) — só leitura."""
    r = ler("""select f.slug from public.formularios_preconsulta f join auth.users u on u.id = f.nutricionista_id
                where f.ativo and f.deleted_at is null and lower(u.email) like '%.teste.claude@physiqnutri.app' limit 1""")
    return r[0]["slug"] if r else None


def g_producao_publicas(o, nav, base: str, prefixo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "producao-publicas", desktop=False)
    try:
        cod = codigo_de_teste_producao()
        if o.ok(bool(cod), "T8 (produção) o código do /c/ da conta de teste nutri.teste.claude existe no public"):
            caso.ir(f"/c/{urllib.parse.quote(cod)}")
            ok = caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60)
            o.ok(ok and caso.pg.locator("[data-aviso-idade-cadastro]").count() == 0, "T8 (produção) o /c/ de teste igual a hoje, sem a linha nova (sem enviar)")
            o.linha(f"   print: {caso.print('T8_producao_cadastro')}")
        slug = slug_de_teste_producao()
        caso.ir(f"/f/{slug or 'hml12-nao-existe'}")
        if slug:
            ok = caso.esperar(lambda: caso.tem("[data-form-publico]"), 60)
            o.ok(ok and caso.pg.locator("[data-consentimento-saude]").count() == 0, "T7 (produção) o /f/ de teste igual a hoje, sem a caixa (sem enviar)")
        else:
            ok = caso.esperar(lambda: caso.tem("[data-formulario-nao-encontrado]"), 60)
            o.ok(ok and caso.pg.locator("[data-consentimento-saude]").count() == 0,
                 "T7 (produção) sem formulário de teste no public: o /f/ abre (não encontrado) sem a caixa — a prova da caixa é o JS")
        o.linha(f"   print: {caso.print('T7_producao_preconsulta')}")
        caso.ir("/assinatura")
        o.ok(caso.esperar(lambda: caso.tem("[data-nao-encontrada]"), 30), "JS (produção) /assinatura → 'Página não encontrada'")
    finally:
        caso.fim()


def baixar(url: str) -> str:
    """O corpo do arquivo; nome que não existe (o regex dos chunks pega um ou outro texto que parece nome) → ""."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "physiq-hml12"}), timeout=30) as r:  # noqa: S310
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def marcas_nos_js(base: str) -> tuple[int, dict[str, list[str]], str]:
    """Baixa o HTML e os chunks JS (seguindo os nomes citados dentro de cada um) e diz onde aparece cada marca nova."""
    html = baixar(base + "/")
    vistos: set[str] = set()
    fila = set(re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', html))
    achados: dict[str, list[str]] = {m: [] for m in MARCAS_NOVAS}
    while len(vistos) < 800:
        # um nome pode entrar na fila e ser baixado no MESMO lote: tirar os já vistos antes de montar o próximo (sem isso o lote
        # sai vazio, a fila nunca diminui e o laço não termina — o PR #156 da hml-11)
        fila -= vistos
        if not fila:
            break
        lote = sorted(fila)[:40]
        fila -= set(lote)
        with cf.ThreadPoolExecutor(8) as ex:
            for caminho, corpo in zip(lote, ex.map(lambda c: baixar(base + c), lote)):
                vistos.add(caminho)
                for m in MARCAS_NOVAS:
                    if m in corpo:
                        achados[m].append(caminho)
                fila |= {"/assets/" + n for n in re.findall(r'(?:assets/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js)', corpo)} - vistos
    return len(vistos), achados, html


def js(o, base: str, staging: bool) -> None:
    n, achados, html = marcas_nos_js(base)
    o.ok(n > 50, f"JS baixados: {n} arquivos")
    if staging:
        # controle: no build de staging as 8 marcas existem — prova que a varredura acha o que procura (senão o "nenhuma" da produção
        # não valeria nada)
        faltam = [m for m, onde in achados.items() if not onde]
        o.ok(not faltam, f"JS (staging, controle) as 8 marcas novas existem nos chunks ({len(MARCAS_NOVAS) - len(faltam)} de 8; faltam {faltam})")
    else:
        com = {m: onde[:2] for m, onde in achados.items() if onde}
        o.ok(not com and not any(m in html for m in MARCAS_NOVAS), f"JS (produção) nenhuma das 8 marcas no HTML nem nos JS ({com})")


# ───────────────────────── principal ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-12 (H-30) — E2E das telas do aceite no acesso e do consentimento (casos e uso no topo do arquivo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod | <url>")
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--modo", choices=("staging", "producao"), help="padrão: producao para a URL da produção, staging para o resto")
    ap.add_argument("--casos", default=",".join(TODOS))
    # no notebook o Chromium do Playwright cai nas páginas longas e o Edge não (hml-11, 08/10/2026): lá, --canal msedge
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    base = BASES.get(a.base, a.base).rstrip("/")
    host = urllib.parse.urlparse(base).hostname or ""
    modo = a.modo or ("producao" if host in HOSTS_DE_PRODUCAO else "staging")
    if modo == "staging" and host in HOSTS_DE_PRODUCAO:
        raise SystemExit("--modo staging na produção: recusado (os casos logados gravariam no banco de produção)")
    staging = modo == "staging"
    casos = {c.strip().upper() for c in a.casos.split(",") if c.strip()}
    desconhecidos = casos - set(TODOS)
    if desconhecidos:
        raise SystemExit(f"casos desconhecidos: {sorted(desconhecidos)} (conhecidos: {', '.join(TODOS)})")
    o = C.Saida(f"telas_{a.prefixo}", parar=False)
    o.linha(f"base {base} · modo {modo} · versão dos textos do app {VERSAO} · casos {','.join(c for c in TODOS if c in casos)}")
    sess = C.Sessoes()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:

        def rodar(fn, *args, **kw) -> None:
            """Cada grupo de casos num navegador NOVO e, se o navegador cair no meio, 1 nova tentativa do grupo inteiro noutro (o mesmo
            da hml-11: no notebook o Chromium cai no meio dos prints de páginas longas; no Edge — --canal msedge — não). Os grupos
            desfazem o que mudam no `finally` e começam do zero (a seção do responsável é limpa no começo do T9)."""
            for tentativa in (1, 2):
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, *args, **kw)
                    return
                except Exception as e:  # noqa: BLE001
                    caiu = any(t in str(e) for t in ("Target crashed", "Unable to capture screenshot", "has been closed"))
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

        try:
            guarda: dict = {}
            if not staging:
                o.linha("modo produção: só visitante e só leitura (T13, o /c/ e o /f/ sem as peças novas, /assinatura e o JS); os casos com conta "
                        "são só do staging")
                rodar(g_t13_build, base, a.prefixo, False, guarda)
                if casos & {"T7", "T8", "JS"}:
                    rodar(g_producao_publicas, base, a.prefixo)
                if "JS" in casos:
                    js(o, base, staging=False)
            else:
                # a guarda vem antes de tudo: o build tem que ser o de staging e o banco do staging tem que ter a versão do app
                rodar(g_t13_build, base, a.prefixo, True, guarda)
                pode = guarda.get("build_staging") is True and conferir_banco_staging(o)
                if not pode:
                    o.ok(False, "parei antes dos casos com conta: o build não é o de staging ou o banco do staging não tem a versão do app")
                else:
                    if casos & {"T1", "T16"}:
                        rodar(g_t1_t16, base, a.prefixo, sess, casos)
                    if "T4" in casos:
                        rodar(g_t4, base, a.prefixo, sess)
                    if "T12" in casos:
                        rodar(g_t12, base, a.prefixo, sess)
                    if "T2" in casos:
                        rodar(g_aluno_do_app, base, a.prefixo, sess)
                    if "T3" in casos:
                        rodar(g_profissional, base, a.prefixo, sess)
                    if casos & {"T3", "T5", "T6", "T14"}:
                        rodar(g_sem_nada, base, a.prefixo, sess, casos)
                    if "T7" in casos:
                        rodar(g_preconsulta, base, a.prefixo)
                    if "T8" in casos:
                        rodar(g_cadastro, base, a.prefixo)
                    if "T15" in casos:
                        rodar(g_pendentes, base, a.prefixo, sess)
                    if casos & {"T9", "T10", "T11"}:
                        rodar(g_responsavel, base, a.prefixo, sess, casos)
                if "JS" in casos:
                    js(o, base, staging=True)
        finally:
            sess.fechar(o)
    graves = [t for bom, t in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página nem falha da base ({graves[:2]})")
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
