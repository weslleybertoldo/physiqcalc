#!/usr/bin/env python3
"""Physiq W-P — E2E de TELA dos planos do aluno (Task 17), com o Edge e as contas de TESTE no STAGING, em série (o Banco do Treino
é uma VM Nano) e com a guarda de /health dos 2 projetos antes de cada conta que entra. O painel no layout de computador (1280) e no
de celular (390, os "-390"); o app do aluno a 390 × 844. As telas mostram as decisões do Weslley (10/10): só o dono/master vê a aba
Planos e o plano na ficha (ponto 1); trocar o valor de um plano com aluno em cobrança automática avisa "As cobranças automáticas dos
alunos vão ser atualizadas em instantes." (ponto 2); no período todo o pagamento diz "Pagar o plano"/"Renovar o plano" e a faixa do
topo "Seu plano vence em…" (o plano de 1 mês e o mês a mês continuam falando de mensalidade).

Passos (em ordem: cada um usa o que o anterior deixou; a massa é a conta do prof2 — "Rafael Lima", Pix na chave — com o aluno2):
  1-2  painel do dono › Financeiro › Planos: Novo plano (12 meses, R$ 1.000, à vista e mês a mês; no Pix na chave o cartão parcelado
       vem desligado; a parcela sugerida 12× de R$ 83,33) → o cartão do plano na lista (R$ 1.000,00/ano · ou 12× de R$ 83,33)
  3    a ficha do aluno: o plano com período pede a forma (à vista; o 1º vencimento de quem nunca pagou) → o cartão diz R$ 1.000/ANO
  4    Mensalidades: R$ 1.000,00/ano na linha do aluno
  5    app do aluno › Pagamentos: "Plano · …", /ano, "Pagar R$ 1.000,00" → o painel "Pagar o plano"
  6    pago por fora há 362 dias → "Renovar plano · R$ 1.000,00" (o painel continua "Pagar o plano"), a faixa "Seu plano vence em 3
       dias" e a ficha "Hora de renovar o plano"; renovado hoje → em dia → "Adiantar a renovação" → o painel "Renovar o plano"
  7    mês a mês (pela ficha) + 3 parcelas por fora → "parcela 4 de 12" no app e "Próximo pagamento: parcela 4 de 12" na ficha; o
       Adiantar fala de mensalidade ("Adiantar a mensalidade")
  8    automática simulada (o staging não vai ao MP) → o dono muda o valor do plano → o aviso das cobranças automáticas + a pendência
       na fila (motivo plano) e o valor do aluno acompanhando (1.200 ÷ 12 = 100,00)
  9    a conta no Mercado Pago (pelo banco: liberar é do master) → cartão parcelado até 3× no plano e na ficha → o app: "Pagar o plano"
       com "Pagar com cartão (até 3×)", sem a cobrança automática no período todo, e o cartão "Em até 3× no cartão"
  10   membro da conta (não dono — w7-nutri, nutricionista da "Consultoria Ferreira W7"): sem a aba Planos (o ?aba=planos abre o Resumo)
       e a ficha do aluno dele sem o plano nem o valor (roda por último: é outra conta)
  11   o plano de 1 mês (à vista = mês a mês, B2) fala de mensalidade: "Pagar R$ 99,90" sem o "Renovar plano", o painel "Pagar a
       mensalidade", a faixa "Sua mensalidade vence em…" e a ficha sem "Hora de renovar o plano"
--loja: o localhost:8080 serve o build da loja (VITE_DISTRIBUICAO=play — o health.json diz "play"): o mesmo roteiro — o aluno pagando
o PROFISSIONAL (Pix na chave e o Mercado Pago da conta dele) continua igual na versão da Google Play.
Cada print mede antes: nada passa da largura (o scrollWidth da página ≤ a largura). Prints em
~/projetos/physiqcalc-scratch/prints/wp/<base>/ (o build da loja em …/<base>/loja/); a cópia da saída em ~/projetos/physiqcalc-scratch/wp/.
Desfazer: a foto da matrícula de TESTE, a do espelho dela no Treino (physiq_profiles.plano_nome e mensalidade_valor, que a ficha grava
pelo admin-update-user) e a do plano do PROFISSIONAL da conta (situacao, vence_em, teste_ate — com o teste grátis do prof2 vencido o
painel dele trava: a rodada libera só enquanto roda) vão para ~/projetos/physiqcalc-scratch/wp/telas-estado.json ANTES de mexer; no
fim (ou na próxima rodada / --limpar, se esta cair no meio) sai o que a rodada criou — o desfazer do e2e/wp/api.py (planos "WP e2e …",
cobranças, assinaturas, fila, avisos; as mensalidades escondidas voltam; a conta volta ao recebimento de antes) + o espelho do Treino +
o plano da conta — e o último ✅ confere campo a campo com a foto.
Precisa: o servidor da W-P publicado (pagamentos-aluno, automaticas-fila) e as migrations 20261011010000–030000 no staging; ~/.pc-pat;
as senhas das contas de TESTE (prof2/aluno2: ~/.physiqcalc-teste-admin; w7-nutri: ~/.physiq-teste-w7-nutri).
Uso: python3 e2e/wp/telas.py --base local|staging [--loja] [--canal msedge] [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
E2E = AQUI.parent


def _carregar(nome: str, caminho: Path):
    if nome in sys.modules:
        return sys.modules[nome]
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# A ordem importa: a base da W6 primeiro (ela carrega a da W5 e o _comum da W2); a da hml-18 (→ hml-17 → hml-09) reaproveita os
# mesmos módulos — uma base da W5 só, com as mesmas CONTAS e o mesmo schema; o api.py da W-P importa "_base" = esta base da W6.
W6 = _carregar("_base_w06", E2E / "w06" / "_base.py")
sys.modules.setdefault("_base", W6)
B = _carregar("_base_hml18", E2E / "hml18" / "_base.py")
API = _carregar("_wp_api", AQUI / "api.py")
API.carregar_base()
assert B.B5 is W6.B5 and API.B is W6, "a base da W5 e a da W6 têm de ser as mesmas nas 3 bases"

S = API.S
DONO, ALUNO = API.DONO, API.ALUNO
MEMBRO, EMAIL_MEMBRO = "w7-nutri", "w7.nutri.teste.claude@physiqnutri.app"
NOME = f"{API.PREFIXO} tela {uuid.uuid4().hex[:5]}"  # "WP e2e tela …": o desfazer do api.py apaga os planos "WP e2e …"
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch"
ESTADO_ARQ = SCRATCH / "wp" / "telas-estado.json"
AVISO_AUTOMATICAS = "As cobranças automáticas dos alunos vão ser atualizadas em instantes."
CTX: dict = {"prints": []}


class Parou(Exception):
    """A guarda de /health mandou parar: nada mais roda (o desfazer roda no finally)."""


# ───────────────────────── funções puras ─────────────────────────

def texto_do_vencimento(dias: int | None) -> str:
    """O textoDoVencimento da tela para quem está coberto e vence em até 7 dias (src/financeiro/regras.ts)."""
    if dias is None:
        return "?"
    if dias <= 0:
        return "vence hoje"
    return "vence amanhã" if dias == 1 else f"vence em {dias} dias"


def limpo(t: str | None) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def painel_travado(c: dict | None, hoje: str) -> bool:
    """A trava do painel pelo plano do PROFISSIONAL (situacaoEfetiva + travaDoPainel de src/nucleo/cobranca/regras.ts; a GatePlano
    pula a cobrança legada e a conta do app)."""
    if not c or c.get("cobranca_legada") or c.get("origem") == "app" or c.get("situacao") == "isenta":
        return False
    if c.get("situacao") in ("suspensa", "cancelada"):
        return True
    if c.get("vence_em"):
        fim = dt.date.fromisoformat(c["vence_em"][:10]) + dt.timedelta(days=max(0, c.get("tolerancia_dias") or 0))
        if fim.isoformat() >= hoje:
            return False
    return not (c.get("teste_ate") and c["teste_ate"][:10] >= hoje)


# ───────────────────────── a guarda e o banco ─────────────────────────

def saude_dos_2() -> bool:
    """/health do Treino e do principal pela Management API (db, auth, rest): UNHEALTHY, sem resposta ou lento (≥ 10 s) → parar."""
    ok = True
    for nome, ref in (("Treino", W6.TREINO_REF), ("principal", W6.PRINCIPAL_REF)):
        t0 = time.time()
        try:
            st, r, _ = W6.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db&services=auth&services=rest", None,
                               {"Authorization": f"Bearer {W6.ler('.pc-pat')}"}, timeout=30)
        except Exception as e:  # noqa: BLE001
            st, r = type(e).__name__, None
        dt_ = time.time() - t0
        bom = st == 200 and isinstance(r, list) and bool(r) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < 10
        estado = [(x.get("name"), x.get("status")) for x in r] if isinstance(r, list) else r
        print(f"   /health do {nome}: {st} {estado} em {dt_:.1f} s", flush=True)
        ok = ok and bom
    return ok


def guarda() -> None:
    if not saude_dos_2():
        raise Parou("um dos 2 bancos não está saudável — parar (regra de 10/10)")


def espelho_do_treino(treino: str | None) -> dict | None:
    """O que a ficha espelha no Treino (admin-update-user → physiq_profiles), para a foto e a volta."""
    if not treino:
        return None
    r = W6.sql_treino(f"select plano_nome, mensalidade_valor::text as mensalidade_valor from {S}.physiq_profiles where id = '{treino}'")
    return r[0] if r else None


def devolver_espelho(est: dict) -> None:
    e = est.get("espelho")
    if not est.get("treino") or e is None:
        return
    W6.exec_treino(f"""update {S}.physiq_profiles set plano_nome = {API.lit(e['plano_nome'])},
                              mensalidade_valor = {API.lit(e['mensalidade_valor'])}::numeric
                        where id = '{est['treino']}' and (plano_nome is distinct from {API.lit(e['plano_nome'])}
                          or mensalidade_valor is distinct from {API.lit(e['mensalidade_valor'])}::numeric)""")


def plano_da_conta(conta: str) -> dict | None:
    """Os campos do plano do PROFISSIONAL (o que a trava do painel lê)."""
    return API.um(f"""select situacao, vence_em::text as vence_em, teste_ate::text as teste_ate, tolerancia_dias, cobranca_legada, origem
                        from {S}.contas where id = '{conta}'""")


def devolver_plano_da_conta(est: dict) -> None:
    pc = est.get("plano_conta")
    if not pc:
        return
    sit, vence, teste = API.lit(pc["situacao"]), API.lit(pc["vence_em"]), API.lit(pc["teste_ate"])
    API.sql(f"""update {S}.contas set situacao = {sit}, vence_em = {vence}::date, teste_ate = {teste}::date
                 where id = '{est['conta']}' and (situacao is distinct from {sit} or vence_em is distinct from {vence}::date
                   or teste_ate is distinct from {teste}::date)""")


def guardar_estado(est: dict) -> None:
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)


def ler_estado() -> dict | None:
    if not ESTADO_ARQ.exists():
        return None
    try:
        return json.loads(ESTADO_ARQ.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise RuntimeError(f"o arquivo de estado {ESTADO_ARQ} não abre ({e}): conferir à mão antes de rodar de novo") from e


def preparar(R) -> None:
    """A foto da matrícula de TESTE (e do espelho no Treino) no arquivo de estado ANTES de mexer; depois o ponto de partida: as
    mensalidades vivas escondidas (voltam no fim) e a cobertura recalculada (o aluno "nunca pagou"), a cobrança liberada e a conta no
    Pix na chave."""
    m = API.matricula_de_teste()
    dono_uid = W6.uid(DONO)
    if not m or not m["ativo"] or m["origem"] == "app" or m["dono"] != dono_uid:
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar ativa e na conta do {DONO} ({m})")
    if API.colunas_wp() != 9:
        raise RuntimeError(f"o {S} está sem as colunas da W-P (20261011010000)")
    pac, conta = m["id"], m["conta"]
    treino = API.um(f"select treino_user_id::text as t from {S}.pacientes where id = '{pac}'")["t"]
    API.sql(f"select {S}.mensalidade_recalcular('{pac}')")  # a régua de hoje: a foto e a volta comparam a mesma conta
    t0 = API.um("select clock_timestamp()::text as t0")["t0"]
    fila_max = API.um(f"select coalesce(max(id), 0)::bigint as n from {S}.automaticas_fila")["n"] if API.tem_fila() else None
    f = API.foto(pac, conta)
    motivo = API.motivo_para_nao_comecar(conta, pac, f["recebimento_modo"], f["assinaturas"])  # a guarda da W2: nada gravado
    if motivo:
        raise RuntimeError(motivo)
    est = {"t0": t0, "paciente": pac, "conta": conta, "treino": treino, "aluno_uid": m["aluno_uid"], "dono_uid": dono_uid,
           "fila_max": fila_max, "pacientes": f["pacientes"], "recebimento_modo": f["recebimento_modo"], "escondidas": f["vivas"],
           "assinaturas": f["assinaturas"], "espelho": espelho_do_treino(treino), "plano_conta": plano_da_conta(conta)}
    guardar_estado(est)  # se a rodada cair no meio, a próxima (ou --limpar) desfaz por este arquivo
    CTX.update(est=est, pac=pac, conta=conta, treino=treino, t0=t0, fila_max=fila_max or 0)
    API.CTX.update(pac=pac, conta=conta)  # o nova_assinatura() do api.py lê daqui
    if est["escondidas"]:
        API.sql(f"update {S}.cobrancas set deleted_at = now() where id = any({API.arr_uuid(est['escondidas'])}) and deleted_at is null")
    API.sql(f"update {S}.pacientes set cobranca_pausada = false where id = '{pac}' and cobranca_pausada")
    API.sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}' and recebimento_modo is distinct from 'pix_manual'")
    if painel_travado(est["plano_conta"], W6.hoje()):
        # o plano do PROFISSIONAL da conta de TESTE venceu (o teste grátis acabou): o painel do dono fica travado — liberado só
        # durante a rodada (ativa, vence em 30 dias); o desfazer devolve situacao, vence_em e teste_ate
        API.sql(f"update {S}.contas set situacao = 'ativa', vence_em = {API.lit(W6.dias(30))}::date where id = '{conta}'")
        R.linha(f"   o painel do {DONO} estava travado (o plano do profissional da conta de TESTE: {est['plano_conta']}): liberado só durante a rodada")
    API.sql(f"select {S}.mensalidade_recalcular('{pac}')")
    ate = API.um(f"select mensalidade_pago_ate::text as ate from {S}.pacientes where id = '{pac}'")["ate"]
    R.ok(ate is None, f"preparo: a matrícula de teste sem cobertura ({len(est['escondidas'])} mensalidade(s) escondida(s) até o fim; "
                      f"estado em {ESTADO_ARQ.name}) ({ate})")


def esconder_da_rodada() -> None:
    """Some com as mensalidades que a rodada criou (a cobertura volta a zero); o desfazer apaga no fim."""
    API.sql(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade'
                  and deleted_at is null and created_at >= {API.lit(CTX['t0'])}::timestamptz""")
    API.sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")


def dias_ate_vencer() -> int | None:
    r = API.um(f"""select ((mensalidade_pago_ate at time zone 'America/Sao_Paulo')::date
                         - (now() at time zone 'America/Sao_Paulo')::date) as dias from {S}.pacientes where id = '{CTX['pac']}'""")
    return r["dias"] if r else None


def matricula_no_banco() -> dict:
    return API.um(f"""select plano_aluno_id::text as plano, plano_modalidade as mo, mensalidade_valor::float as v
                        from {S}.pacientes where id = '{CTX['pac']}'""")


def por_fora(R, dias: int, metodo: str, rotulo: str) -> dict:
    """Pagamento por fora pela pagamentos-aluno, como o dono (a mesma sessão do navegador)."""
    st, r = W6.pag(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": W6.dias(dias), "metodo": metodo})
    c = r.get("cobranca") or {}
    linha = API.um(f"""select meses_cobertos, parcela_num, (cobre_ate at time zone 'America/Sao_Paulo')::date::text as ate
                         from {S}.cobrancas where id = '{c['id']}'""") if API.uuid_ok(c.get("id")) else None
    R.ok(st == 200 and bool(linha), f"{rotulo}: pago por fora em {W6.dias(dias)} ({metodo}) ({st} {r.get('erro') or ''} {linha})")
    return linha or {}


def sessao_unica(conta: str) -> None:
    """As ações pela função (W6.pag) usam a MESMA sessão do navegador (a dos Logins): o logout local do fim fecha as duas."""
    W6._tokens[conta] = (time.time(), CTX["logins"].token(conta))


# ───────────────────────── o navegador ─────────────────────────

class Tela(B.Celular):
    """O Celular da hml-18 (o Edge em modo celular, a sessão antes do 1º documento, o `legal` desligado só no navegador, o diálogo
    nativo contado) com o print de nome fixo e a medida da largura. A 1280 o painel abre no layout de computador (o mesmo contexto,
    set_viewport_size — como o saida.py da hml-18)."""

    def __init__(self, nav, base: str, R, rotulo: str, largura: int = 390) -> None:
        super().__init__(nav, base, 390)
        self.R, self.rotulo = R, rotulo
        if largura != 390:
            self.largura_(largura)

    def largura_(self, largura: int) -> None:
        self.tamanho(largura)
        self.pg.wait_for_timeout(900)

    def texto(self, seletor: str) -> str:
        try:
            loc = self.pg.locator(seletor)
            return limpo(loc.first.inner_text(timeout=5000)) if loc.count() else ""
        except Exception:  # noqa: BLE001 — navegando
            return ""

    def textos(self, seletor: str) -> str:
        try:
            return limpo(" | ".join(self.pg.locator(seletor).all_inner_texts()))
        except Exception:  # noqa: BLE001
            return ""

    def clicar(self, seletor: str, timeout: float = 15_000) -> None:
        self.pg.locator(seletor).first.click(timeout=timeout)

    def opcoes(self, seletor: str) -> list[str]:
        return self.pg.eval_on_selector_all(f"{seletor} option", "os => os.map((o) => o.value).filter(Boolean)")

    def painel_aberto(self) -> bool:
        return self.pg.locator("[role=dialog][data-state=open]").count() > 0

    def titulo_do_painel(self) -> str:
        return self.texto("[role=dialog][data-state=open] h2")

    def fechar_painel(self) -> bool:
        self.pg.keyboard.press("Escape")
        return self.esperar(lambda: not self.painel_aberto(), 10)

    def foto(self, nome: str, alvo: str | None = None) -> str:
        """O print em <pasta>/<nome>.png com o elemento à vista; antes, a medida: nada passa da largura (scrollWidth da página)."""
        if alvo:
            try:
                self.pg.locator(alvo).first.scroll_into_view_if_needed(timeout=5000)
            except Exception:  # noqa: BLE001
                pass
        self.pg.wait_for_timeout(700)
        try:
            m = self.pg.evaluate(B.JS_LARGURA)
        except Exception as e:  # noqa: BLE001
            m = {"passa": None, "raizes": [type(e).__name__]}
        pasta: Path = CTX["pasta"]
        pasta.mkdir(parents=True, exist_ok=True)
        arq = pasta / f"{nome}.png"
        for tentativa in range(3):
            try:
                self.pg.screenshot(path=str(arq))
                break
            except Exception as e:  # noqa: BLE001
                if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                    raise
                self.pg.wait_for_timeout(1500)
        passa = m.get("passa")
        raizes = "; " + ", ".join(m.get("raizes") or [])[:220] if passa else ""
        self.R.ok(passa is not None and passa <= 0, f"   print {arq.name} ({self.largura} px): nada passa da largura (passa {passa} px{raizes})")
        CTX["prints"].append(str(arq))
        return str(arq)

    def fotos(self, nome: str, alvo: str | None = None) -> None:
        """A mesma tela no computador (1280: <nome>.png) e no celular (390: <nome>-390.png); volta para a largura de antes."""
        antes = self.largura
        for largura, sufixo in ((1280, ""), (390, "-390")):
            if self.largura != largura:
                self.largura_(largura)
            self.foto(nome + sufixo, alvo)
        if self.largura != antes:
            self.largura_(antes)

    def diagnostico(self, nome: str) -> None:
        try:
            pasta: Path = CTX["pasta"] / "falhas"
            pasta.mkdir(parents=True, exist_ok=True)
            self.pg.screenshot(path=str(pasta / f"{nome}_{self.rotulo.replace(' ', '_')}.png"))
            print(f"   diagnóstico [{self.rotulo}]: {self.caminho()} · erros de página {self.erros[-3:]}", flush=True)
        except Exception:  # noqa: BLE001
            pass

    def encerrar(self) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        self.R.ok(not graves and not self.dialogos, f"[{self.rotulo}] sem erro de página nem diálogo nativo ({graves[:2]} {self.dialogos[:2]})")
        self.fim()


def painel(R, rota: str) -> Tela:
    """O painel do dono (prof2), aberto 1 vez na rodada (a 1280); as próximas chamadas só navegam."""
    t = CTX.get("painel")
    if t is None:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "painel do dono", 1280)
        CTX["painel"] = t
        t.entrar(CTX["logins"], DONO, rota)
    else:
        if t.largura != 1280:
            t.largura_(1280)
        t.ir(rota)
    return t


def app_do_aluno(R) -> Tela:
    """O app do aluno (aluno2) a 390 em Perfil › Pagamentos, aberto 1 vez na rodada; as próximas chamadas recarregam a tela."""
    t = CTX.get("aluno")
    if t is None:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "app do aluno", 390)
        CTX["aluno"] = t
        t.entrar(CTX["logins"], ALUNO, "/perfil/pagamentos")
    else:
        t.ir("/perfil/pagamentos")
    return t


def ficha() -> str:
    return f"/painel/alunos/{CTX['treino'] or CTX['pac']}/financeiro"


def card_do_plano() -> str:
    return f"[data-plano-card='{CTX['plano']}']"


def abrir_edicao(t: Tela, R, rotulo: str) -> bool:
    """Aba Planos aberta: Editar o plano de teste e esperar o painel com os valores salvos (o efeito que preenche já rodou)."""
    ok = t.esperar(lambda: t.tem(f"[data-editar-plano='{CTX['plano']}']"), 60)
    if ok:
        t.clicar(f"[data-editar-plano='{CTX['plano']}']")
        ok = t.esperar(lambda: t.tem("[data-form-plano]") and t.pg.input_value("[data-plano-nome]") == NOME, 20)
    R.ok(ok, f"{rotulo}: Editar abre o painel do plano com o que está salvo")
    return ok


# ───────────────────────── os passos ─────────────────────────

def passo_planos(R) -> None:
    R.linha("\n── 1-2. painel do dono › Financeiro › Planos: a aba e o plano novo pela tela")
    t = painel(R, "/painel/financeiro?aba=planos")
    R.ok(t.esperar(lambda: t.tem("[data-aba-planos]") and t.tem("[data-novo-plano]"), 60), "1. o dono abre Financeiro › Planos (a lista e o Novo plano)")
    R.ok(t.tem("[data-aba-financeiro-botao='planos']"), "1. a aba Planos está na barra do Financeiro do dono (decisão 1)")
    t.clicar("[data-novo-plano]")
    R.ok(t.esperar(lambda: t.tem("[data-form-plano]"), 20) and t.titulo_do_painel() == "Novo plano", f"2. 'Novo plano' abre o painel ({t.titulo_do_painel()!r})")
    t.pg.wait_for_timeout(400)  # o efeito que zera o formulário ao abrir roda antes de digitar
    t.pg.fill("[data-plano-nome]", NOME)
    t.pg.select_option("[data-plano-meses]", "12")
    t.pg.fill("[data-plano-valor]", "1.000,00")
    mensal = t.pg.locator("[data-plano-modalidade='mensal']")
    if not mensal.is_checked():
        mensal.check()
    cartao = t.pg.locator("[data-plano-modalidade='cartao_parcelado']")
    rot = t.texto("[data-plano-modalidades] label:has([data-plano-modalidade='cartao_parcelado'])")
    R.ok(cartao.is_disabled() and "não aceita" in rot, f"2. Pix na chave: o cartão parcelado vem desligado ({rot!r})")
    R.ok(t.esperar(lambda: "12× de R$ 83,33 = R$ 999,96" in t.texto("[data-plano-total-mensal]"), 10),
         f"2. o mês a mês sugere a parcela: 12× de R$ 83,33 = R$ 999,96 ({t.texto('[data-plano-total-mensal]')!r})")
    preenchido = (t.pg.input_value("[data-plano-nome]"), t.pg.input_value("[data-plano-meses]"), t.pg.input_value("[data-plano-valor]"))
    R.ok(preenchido == (NOME, "12", "1.000,00"), f"2. o painel preenchido: nome, 12 meses, R$ 1.000,00 ({preenchido})")
    t.foto("02-plano-dialog", "[data-plano-salvar]")
    t.clicar("[data-plano-salvar]")
    card_nome = f"[data-lista-planos] [data-plano-card]:has-text('{NOME}')"
    R.ok(t.esperar(lambda: t.pg.locator(card_nome).count() == 1 and not t.tem("[data-form-plano]"), 30), "1. salvo: o painel fecha e o plano aparece na lista")
    toast = t.textos("[data-sonner-toast]")
    R.ok("Plano salvo." in toast and AVISO_AUTOMATICAS not in toast, f"1. 'Plano salvo.' — plano novo não mexe em cobrança automática ({toast[:120]!r})")
    pl = API.um(f"""select id::text as id, meses, valor::float as valor, modalidades, max_parcelas_cartao as max, ativo
                      from {S}.planos_aluno where nome = {API.lit(NOME)} and conta_id = '{CTX['conta']}'""")
    R.ok(bool(pl) and pl["meses"] == 12 and pl["valor"] == 1000.0 and pl["modalidades"] == ["avista", "mensal"] and pl["max"] is None and pl["ativo"],
         f"no banco: o plano com 12 meses, R$ 1.000, à vista e mês a mês ({pl})")
    if not pl:
        return
    CTX["plano"] = pl["id"]
    txt = t.texto(card_do_plano())
    R.ok("R$ 1.000,00/ano · ou 12× de R$ 83,33" in txt and "anual" in txt.lower() and "0 alunos" in txt,
         f"1. o cartão do plano: R$ 1.000,00/ano · ou 12× de R$ 83,33, Anual, 0 alunos ({txt[:150]!r})")
    t.fotos("01-painel-aba-planos", card_do_plano())
    t.largura_(390)
    if abrir_edicao(t, R, "2. no celular"):
        t.foto("02-plano-dialog-390", "[data-plano-salvar]")
        t.fechar_painel()
    t.largura_(1280)


def passo_ficha(R) -> None:
    R.linha("\n── 3. a ficha do aluno: o plano com período (à vista)")
    t = painel(R, ficha())
    R.ok(t.esperar(lambda: t.tem("[data-form-mensalidade]") and t.pg.locator(f"[data-mensalidade-plano] option[value='{CTX['plano']}']").count() == 1, 60),
         "3. a ficha do aluno abre com o plano novo na lista")
    t.pg.select_option("[data-mensalidade-plano]", CTX["plano"])
    R.ok(t.esperar(lambda: t.tem("[data-form-mensalidade][data-modo-plano='periodo']"), 10), "3. plano com período: a ficha pede como o aluno paga")
    ops = t.opcoes("[data-mensalidade-modalidade]")
    R.ok(ops == ["avista", "mensal"], f"3. as formas que o plano e o Pix na chave aceitam ({ops})")
    t.pg.select_option("[data-mensalidade-modalidade]", "avista")
    R.ok(t.esperar(lambda: t.texto("[data-mensalidade-previsto]") == "Cada pagamento: R$ 1.000,00", 10), f"3. 'Cada pagamento: R$ 1.000,00' ({t.texto('[data-mensalidade-previsto]')!r})")
    R.ok(t.tem("[data-mensalidade-inicio]"), "3. nunca pagou: a ficha pede o 1º vencimento")
    t.clicar("[data-mensalidade-salvar]")
    R.ok(t.esperar(lambda: "R$ 1.000/ANO" in t.texto("[data-cartao-mensalidade]").upper(), 30),
         f"3. salvo: o cartão da mensalidade diz R$ 1.000/ANO ({t.texto('[data-cartao-mensalidade]')[:90]!r})")
    m = matricula_no_banco()
    R.ok(m == {"plano": CTX["plano"], "mo": "avista", "v": 1000.0}, f"no banco: a matrícula no plano, à vista, R$ 1.000 ({m})")
    t.fotos("03-ficha-plano", "[data-cartao-mensalidade]")


def passo_mensalidades(R) -> None:
    R.linha("\n── 4. Financeiro › Mensalidades: o sufixo do plano de período")
    t = painel(R, "/painel/financeiro?aba=mensalidades")
    linha = f"[data-lista='mensalidades'] [data-cobranca-aluno='{CTX['treino'] or CTX['pac']}']"
    R.ok(t.esperar(lambda: "R$ 1.000,00/ano" in t.texto(linha), 60), f"4. a linha do aluno: R$ 1.000,00/ano ({t.texto(linha)[:120]!r})")
    t.fotos("04-mensalidades-sufixo", linha)


def passo_aluno_periodo(R) -> None:
    R.linha("\n── 5. app do aluno › Pagamentos: o plano do período todo")
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno]") and t.tem("[data-pagar-mensalidade]"), 60), "5. Pagamentos abre com o cartão do plano e o Pagar")
    txt = t.texto("[data-mensalidade-aluno]")
    R.ok(f"Plano · {NOME}" in txt and "R$ 1.000,00/ano" in txt, f"5. o cartão: 'Plano · {NOME}' e R$ 1.000,00/ano ({txt[:140]!r})")
    R.ok(t.texto("[data-linha-mensalidade]") == "Vence hoje · Pix", f"5. a linha: 'Vence hoje · Pix' ({t.texto('[data-linha-mensalidade]')!r})")
    botao = t.texto("[data-pagar-mensalidade]")
    R.ok(botao == "Pagar R$ 1.000,00", f"5. o botão paga o período todo: 'Pagar R$ 1.000,00' ({botao!r} · {'loja' if CTX['loja'] else 'site'})")
    t.foto("05-aluno-pagamentos-periodo", "[data-mensalidade-aluno]")
    t.clicar("[data-pagar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-pix-manual] [data-pix-qr]"), 20), "5. o Pix na chave do profissional abre com o QR")
    R.ok(t.titulo_do_painel() == "Pagar o plano", f"5. o painel de pagar diz 'Pagar o plano' ({t.titulo_do_painel()!r})")
    t.foto("05b-aluno-pagar-o-plano", "[data-pagar-pix-manual]")
    R.ok(t.fechar_painel(), "5. o painel fecha")


def passo_renovar(R) -> None:
    R.linha("\n── 6. Renovar: pago por fora há 362 dias (vence em 3 dias) e renovado hoje")
    li = por_fora(R, -362, "dinheiro", "6. período todo")
    R.ok(li.get("meses_cobertos") == 12, f"6. o pagamento do período todo cobre 12 meses (até {li.get('ate')})")
    dias = dias_ate_vencer()
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno='vence_em_breve'] [data-pagar-mensalidade][data-renovar='1']"), 60),
         "6. vencendo: o botão do período todo vira Renovar")
    botao, chip = t.texto("[data-pagar-mensalidade]"), t.texto("[data-chip-mensalidade]")
    R.ok(botao == "Renovar plano · R$ 1.000,00", f"6. 'Renovar plano · R$ 1.000,00' ({botao!r})")
    R.ok(chip.lower() == texto_do_vencimento(dias), f"6. o chip: '{texto_do_vencimento(dias)}' ({chip!r})")
    t.foto("07-aluno-renovar", "[data-mensalidade-aluno]")
    t.clicar("[data-pagar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-pix-manual]"), 20) and t.titulo_do_painel() == "Pagar o plano",
         f"6. Renovar abre o painel 'Pagar o plano' ({t.titulo_do_painel()!r})")
    t.fechar_painel()
    R.linha("── 9. a faixa do topo na abertura do app")
    # a faixa lê o resumo guardado no aparelho por 10 min (useResumoFinanceiro — o desenho da W6) e o app já o guardou no passo 5,
    # antes do pagamento por fora: sem ele, a abertura busca o de agora (o mesmo que abrir o app depois dos 10 min)
    t.pg.evaluate("() => localStorage.removeItem('physiq_financeiro_resumo')")
    t.ir("/")
    R.ok(t.esperar(lambda: t.tem("[data-faixa-mensalidade='vencendo']"), 60), "9. a faixa âmbar aparece na abertura do app")
    titulo, sub = t.texto("[data-faixa-titulo]"), t.texto("[data-faixa-subtitulo]")
    R.ok(titulo == f"Seu plano {texto_do_vencimento(dias)}", f"9. a faixa fala do plano: 'Seu plano {texto_do_vencimento(dias)}' ({titulo!r})")
    R.ok(sub == "R$ 1.000,00 · Pix" and t.texto("[data-faixa-pagar]") == "Pagar", f"9. 'R$ 1.000,00 · Pix' e o Pagar ({sub!r})")
    t.foto("09-faixa-seu-plano", "[data-faixa-mensalidade]")
    p = painel(R, ficha())
    R.ok(p.esperar(lambda: p.tem("[data-mensalidade-renovar]"), 60), f"6. a ficha do aluno: '{p.texto('[data-mensalidade-renovar]') or 'Hora de renovar o plano'}'")
    p.foto("07c-ficha-hora-de-renovar", "[data-cartao-mensalidade]")
    por_fora(R, 0, "pix", "6. renovação")
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno='em_dia'] [data-adiantar-mensalidade]"), 60), "6. renovado: em dia, com o Adiantar")
    R.ok(t.texto("[data-adiantar-mensalidade]") == "Adiantar a renovação", f"6. 'Adiantar a renovação' ({t.texto('[data-adiantar-mensalidade]')!r})")
    t.clicar("[data-adiantar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-pix-manual]"), 20) and t.titulo_do_painel() == "Renovar o plano",
         f"6. o painel de adiantar diz 'Renovar o plano' ({t.titulo_do_painel()!r})")
    t.foto("07b-aluno-renovar-o-plano", "[data-pagar-pix-manual]")
    t.fechar_painel()


def passo_mes_a_mes(R) -> None:
    R.linha("\n── 7. mês a mês pela ficha + 3 parcelas por fora → parcela 4 de 12")
    esconder_da_rodada()
    p = painel(R, ficha())
    R.ok(p.esperar(lambda: p.tem("[data-form-mensalidade][data-modo-plano='periodo'] [data-mensalidade-modalidade]"), 60), "7. a ficha abre no plano do aluno")
    p.pg.select_option("[data-mensalidade-modalidade]", "mensal")
    R.ok(p.esperar(lambda: p.texto("[data-mensalidade-previsto]") == "Cada pagamento: R$ 83,33", 10), f"7. 'Cada pagamento: R$ 83,33' ({p.texto('[data-mensalidade-previsto]')!r})")
    p.clicar("[data-mensalidade-salvar]")
    R.ok(p.esperar(lambda: "R$ 83,33/MÊS" in p.texto("[data-cartao-mensalidade]").upper(), 30), f"7. o cartão: R$ 83,33/MÊS ({p.texto('[data-cartao-mensalidade]')[:80]!r})")
    m = matricula_no_banco()
    R.ok(m == {"plano": CTX["plano"], "mo": "mensal", "v": 83.33}, f"no banco: mês a mês com a parcela de R$ 83,33 ({m})")
    nums = [por_fora(R, d, "pix", f"7. parcela {i + 1}").get("parcela_num") for i, d in enumerate((-70, -40, -10))]
    nums_agora = [x["parcela_num"] for x in API.sql(f"""select parcela_num from {S}.cobrancas where paciente_id = '{CTX['pac']}' and tipo = 'mensalidade'
                                                         and deleted_at is null and created_at >= {API.lit(CTX['t0'])}::timestamptz order by pago_em""")]
    R.ok(nums_agora == [1, 2, 3], f"7. as parcelas 1, 2 e 3 de 12 ({nums} → {nums_agora})")
    p = painel(R, ficha())
    R.ok(p.esperar(lambda: p.texto("[data-mensalidade-parcela]") == "Próximo pagamento: parcela 4 de 12", 60),
         f"7. a ficha: 'Próximo pagamento: parcela 4 de 12' ({p.texto('[data-mensalidade-parcela]')!r})")
    p.foto("06b-ficha-parcela-4-de-12", "[data-cartao-mensalidade]")
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: "parcela 4 de 12" in t.texto("[data-linha-mensalidade]"), 60), f"7. o app: 'parcela 4 de 12' ({t.texto('[data-linha-mensalidade]')!r})")
    txt = t.texto("[data-mensalidade-aluno]")
    R.ok(f"Plano · {NOME}" in txt and "R$ 83,33/mês" in txt, f"7. o cartão: 'Plano · …' e R$ 83,33/mês ({txt[:140]!r})")
    R.ok(t.texto("[data-adiantar-mensalidade]") == "Adiantar a próxima parcela", f"7. 'Adiantar a próxima parcela' ({t.texto('[data-adiantar-mensalidade]')!r})")
    t.foto("06-aluno-parcela-4-de-12", "[data-mensalidade-aluno]")
    t.clicar("[data-adiantar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-pix-manual]"), 20) and t.titulo_do_painel() == "Adiantar a mensalidade",
         f"7. no mês a mês o painel fala de mensalidade: 'Adiantar a mensalidade' ({t.titulo_do_painel()!r})")
    t.fechar_painel()


def passo_aviso_automaticas(R) -> None:
    R.linha("\n── 8. decisão 2: mudar o valor do plano com aluno em cobrança automática → o aviso")
    sim = API.nova_assinatura("authorized", valor=83.33, simulada=True)  # "sim-…": o staging não vai ao MP
    CTX["simulada"] = sim
    try:
        p = painel(R, "/painel/financeiro?aba=planos")
        R.ok(p.esperar(lambda: "1 aluno" in p.texto(card_do_plano()), 60), f"8. a lista conta o aluno no plano ({p.texto(card_do_plano())[-40:]!r})")
        if not abrir_edicao(p, R, "8. o dono"):
            return
        p.pg.fill("[data-plano-valor]", "1.200,00")
        p.clicar("[data-plano-salvar]")
        R.ok(p.esperar(lambda: AVISO_AUTOMATICAS in p.textos("[data-sonner-toast]"), 25),
             f"8. o aviso: '{AVISO_AUTOMATICAS}' ({p.textos('[data-sonner-toast]')[:160]!r})")
        p.foto("02b-plano-aviso-automaticas")
        fila = API.um(f"""select count(*)::int as n from {S}.automaticas_fila where paciente_id = '{CTX['pac']}'
                            and id > {int(CTX['fila_max'])} and motivo = 'plano'""")
        R.ok(fila["n"] >= 1, f"8. no banco: a pendência do aluno na fila das automáticas (motivo plano: {fila['n']})")
        m = matricula_no_banco()
        R.ok(m["v"] == 100.0, f"8. o valor do aluno acompanha o plano: 1.200 ÷ 12 = 100,00 ({m})")
    finally:
        API.sql(f"update {S}.aluno_assinaturas set status = 'cancelled' where id = '{sim}'")


def passo_cartao_parcelado(R) -> None:
    R.linha("\n── 9. a conta no Mercado Pago: cartão parcelado até 3× (plano, ficha e o app do aluno)")
    antes = CTX["est"]["assinaturas"]
    fora = API.vivas_de_fora(CTX["conta"], CTX["pac"], antes)
    if fora:
        R.ok(False, f"9. a conta do {DONO} tem {fora} cobrança(s) automática(s) viva(s) de fora da rodada: não ligo o Mercado Pago (a "
                    "guarda da W2 recusaria a volta e o E2E não mexe no que não criou) — pulei")
        return
    API.sql(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{CTX['conta']}'")  # liberar o MP é do master: pelo banco
    try:
        p = painel(R, "/painel/financeiro?aba=planos")
        if not abrir_edicao(p, R, "9. o dono"):
            return
        cartao = p.pg.locator("[data-plano-modalidade='cartao_parcelado']")
        R.ok(not cartao.is_disabled(), "9. no Mercado Pago o cartão parcelado liga no plano")
        if not cartao.is_checked():
            cartao.check()
        R.ok(p.esperar(lambda: p.tem("[data-plano-max]"), 10), "9. aparece 'Parcelas no cartão (até)'")
        p.pg.select_option("[data-plano-max]", "3")
        p.clicar("[data-plano-salvar]")
        R.ok(p.esperar(lambda: not p.tem("[data-form-plano]") and "Cartão parcelado até 3×" in p.texto(card_do_plano()), 30),
             f"9. salvo: o cartão do plano com 'Cartão parcelado até 3×' ({p.texto(card_do_plano())[:160]!r})")
        pl = API.um(f"select modalidades, max_parcelas_cartao as max from {S}.planos_aluno where id = '{CTX['plano']}'")
        R.ok(pl == {"modalidades": ["avista", "cartao_parcelado", "mensal"], "max": 3}, f"no banco: as 3 formas e até 3× no cartão ({pl})")
        p.foto("08c-plano-cartao-parcelado", card_do_plano())
        p = painel(R, ficha())
        R.ok(p.esperar(lambda: "cartao_parcelado" in p.opcoes("[data-mensalidade-modalidade]"), 60), "9. a ficha oferece o cartão parcelado")
        p.pg.select_option("[data-mensalidade-modalidade]", "cartao_parcelado")
        R.ok(p.esperar(lambda: p.texto("[data-mensalidade-previsto]") == "Cada pagamento: R$ 1.200,00", 10), f"9. 'Cada pagamento: R$ 1.200,00' ({p.texto('[data-mensalidade-previsto]')!r})")
        p.clicar("[data-mensalidade-salvar]")
        R.ok(p.esperar(lambda: "R$ 1.200/ANO" in p.texto("[data-cartao-mensalidade]").upper(), 30), f"9. o cartão: R$ 1.200/ANO ({p.texto('[data-cartao-mensalidade]')[:80]!r})")
        m = matricula_no_banco()
        R.ok(m == {"plano": CTX["plano"], "mo": "cartao_parcelado", "v": 1200.0}, f"no banco: cartão parcelado, R$ 1.200 ({m})")
        esconder_da_rodada()
        t = app_do_aluno(R)
        R.ok(t.esperar(lambda: t.texto("[data-pagar-mensalidade]") == "Pagar R$ 1.200,00", 60), f"9. o app: 'Pagar R$ 1.200,00' ({t.texto('[data-pagar-mensalidade]')!r})")
        R.ok(t.texto("[data-linha-mensalidade]") == "Vence hoje · Pix ou cartão", f"9. 'Vence hoje · Pix ou cartão' ({t.texto('[data-linha-mensalidade]')!r})")
        t.clicar("[data-pagar-mensalidade]")
        R.ok(t.esperar(lambda: t.tem("[data-pagar-mp] [data-mp-cartao]"), 20) and t.titulo_do_painel() == "Pagar o plano",
             f"9. o Mercado Pago da conta: o painel 'Pagar o plano' ({t.titulo_do_painel()!r})")
        R.ok(t.texto("[data-mp-cartao]") == "Pagar com cartão (até 3×)", f"9. 'Pagar com cartão (até 3×)' ({t.texto('[data-mp-cartao]')!r})")
        R.ok(not t.tem("[data-mp-assinar]"), "9. sem a cobrança automática no período todo")
        t.foto("08a-aluno-pagar-o-plano-mp", "[data-pagar-mp]")
        t.clicar("[data-mp-cartao]")
        R.ok(t.esperar(lambda: t.tem("[data-cartao-mp='avista']"), 20), "9. o cartão abre")
        txt = t.texto("[data-cartao-mp='avista']")
        R.ok("Em até 3× no cartão" in txt and "R$ 1.200,00" in txt, f"9. 'Em até 3× no cartão' · R$ 1.200,00 ({txt[:80]!r})")
        brick = t.esperar(lambda: t.pg.locator("[data-brick-mp] iframe").count() > 0, 25)
        R.linha(f"   o formulário do cartão (Brick do Mercado Pago) {'carregou' if brick else 'não carregou em 25 s'} — informativo")
        t.foto("08-cartao-parcelado", "[data-cartao-mp='avista']")
        t.fechar_painel()
    finally:
        # a automática da rodada que ficou viva (o passo 8 caiu no meio) não segura a volta à forma da foto (a guarda da W2)
        API.sair_do_mp(CTX["conta"], CTX["pac"], antes, CTX["est"]["recebimento_modo"])


def passo_um_mes(R) -> None:
    R.linha("\n── 11. o plano de 1 mês fala de mensalidade (o Pagar, o painel de pagar, a faixa e a ficha — sem 'Renovar')")
    st, r = API.pedir(DONO, "prof_plano_salvar", API.pedido_plano(CTX["conta"], f"{NOME} 1m", 1, 99.9, ["avista"]))
    pl = r.get("plano") or {}
    R.ok(st == 200 and API.uuid_ok(pl.get("id")) and pl.get("meses") == 1, f"11. o plano de 1 mês (R$ 99,90, à vista) pela função ({st} {r.get('erro')})")
    if not API.uuid_ok(pl.get("id")):
        return
    esconder_da_rodada()
    st, r = API.pedir(DONO, "prof_definir", API.pedido_no_plano(CTX["pac"], pl["id"], "avista"))
    ms = r.get("mensalidade") or {}
    R.ok(st == 200 and ms.get("valor") == 99.9, f"11. o aluno no plano de 1 mês, à vista ({st} {r.get('erro')} {ms.get('valor')})")
    # pago há 1 mês menos 4 dias: a cobertura (1 mês) acaba daqui a 4 dias (a conta de mês do banco)
    dia = API.um("select ((now() at time zone 'America/Sao_Paulo')::date + 4 - interval '1 month')::date::text as d")["d"]
    st, r = W6.pag(DONO, "prof_registrar", {"aluno": CTX["pac"], "data": dia, "metodo": "pix"})
    R.ok(st == 200, f"11. pago por fora em {dia}: cobre 1 mês ({st} {r.get('erro') or ''})")
    dias = dias_ate_vencer()
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno='vence_em_breve'] [data-pagar-mensalidade]"), 60), f"11. Pagamentos: {texto_do_vencimento(dias)}, com o Pagar")
    txt, botao = t.texto("[data-mensalidade-aluno]"), t.texto("[data-pagar-mensalidade]")
    R.ok(f"Plano · {NOME} 1m" in txt and "R$ 99,90/mês" in txt, f"11. o cartão: 'Plano · {NOME} 1m' e R$ 99,90/mês ({txt[:140]!r})")
    R.ok(botao == "Pagar R$ 99,90" and not t.tem("[data-pagar-mensalidade][data-renovar='1']"), f"11. 'Pagar R$ 99,90', sem o 'Renovar plano' ({botao!r})")
    t.clicar("[data-pagar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-pix-manual]"), 20) and t.titulo_do_painel() == "Pagar a mensalidade",
         f"11. o painel diz 'Pagar a mensalidade' ({t.titulo_do_painel()!r})")
    t.foto("11-aluno-plano-de-1-mes", "[data-pagar-pix-manual]")
    t.fechar_painel()
    t.pg.evaluate("() => localStorage.removeItem('physiq_financeiro_resumo')")  # o resumo guardado (10 min) é de antes deste pagamento
    t.ir("/")
    R.ok(t.esperar(lambda: t.tem("[data-faixa-mensalidade='vencendo']"), 60), "11. a faixa âmbar na abertura do app")
    titulo = t.texto("[data-faixa-titulo]")
    R.ok(titulo == f"Sua mensalidade {texto_do_vencimento(dias)}", f"11. a faixa do plano de 1 mês: 'Sua mensalidade {texto_do_vencimento(dias)}' ({titulo!r})")
    t.foto("11b-faixa-plano-de-1-mes", "[data-faixa-mensalidade]")
    p = painel(R, ficha())
    R.ok(p.esperar(lambda: "R$ 99,90/MÊS" in p.texto("[data-cartao-mensalidade]").upper(), 60) and not p.tem("[data-mensalidade-renovar]"),
         f"11. a ficha: R$ 99,90/MÊS, sem 'Hora de renovar o plano' ({p.texto('[data-cartao-mensalidade]')[:90]!r})")
    p.foto("11c-ficha-plano-de-1-mes", "[data-cartao-mensalidade]")


def passo_membro(R) -> None:
    R.linha("\n── 10. decisão 1: o membro da conta (não dono) não vê a aba Planos nem o plano na ficha")
    arq = Path.home() / f".physiq-teste-{MEMBRO}"
    vinculo = API.um(f"""select m.papeis, c.nome from {S}.conta_membros m join auth.users u on u.id = m.user_id join {S}.contas c on c.id = m.conta_id
                          where lower(u.email) = {API.lit(EMAIL_MEMBRO)} and m.status = 'ativo' and not ('dono' = any (m.papeis))
                          order by m.criado_em limit 1""") if arq.exists() else None
    R.ok(bool(vinculo), f"10. o membro de TESTE {MEMBRO} ativo numa conta sem ser dono ({vinculo})")
    if not vinculo:
        return
    W6.B5.CONTAS.setdefault(MEMBRO, (EMAIL_MEMBRO, arq.read_text(encoding="utf-8").strip()))
    aluno_m = API.um(f"""select coalesce(p.treino_user_id, p.id)::text as rota from {S}.pacientes p
                           join {S}.conta_membros m on m.conta_id = p.conta_id join auth.users u on u.id = m.user_id
                          where lower(u.email) = {API.lit(EMAIL_MEMBRO)} and m.status = 'ativo' and p.deleted_at is null and p.ativo
                            and ((p.nutricionista_id = m.user_id and 'nutricionista' = any (m.papeis))
                              or (p.personal_id = m.user_id and 'personal' = any (m.papeis)))
                          order by (p.treino_user_id is null) desc, p.created_at limit 1""")
    guarda()
    t = Tela(CTX["nav"], CTX["base"], R, "membro", 1280)
    try:
        t.entrar(CTX["logins"], MEMBRO, "/painel/financeiro?aba=planos")
        R.ok(t.esperar(lambda: t.tem("[data-pagina-financeiro-painel][data-aba-financeiro]") and t.tem("[data-abas-financeiro]"), 60), "10. o membro abre o Financeiro")
        t.esperar_quieto(minimo=4, maximo=30)  # o resumo da conta chega (o `dono` dele também decide a aba)
        pagina = "[data-pagina-financeiro-painel]"
        estado = (t.pg.get_attribute(pagina, "data-aba-financeiro"), t.pg.get_attribute(pagina, "data-dono"))
        R.ok(t.pg.locator("[data-aba-financeiro-botao='planos']").count() == 0, f"10. sem a aba Planos na barra ({t.textos('[data-abas-financeiro] [role=tab]')!r})")
        R.ok(estado == ("resumo", "0") and t.pg.locator("[data-aba-planos]").count() == 0, f"10. o ?aba=planos abre o Resumo para quem não é dono ({estado})")
        t.fotos("10-membro-sem-planos", "[data-abas-financeiro]")
        if aluno_m:
            t.ir(f"/painel/alunos/{aluno_m['rota']}/financeiro")
            R.ok(t.esperar(lambda: t.tem("[data-cartao-mensalidade='sem-permissao']"), 60) and not t.tem("[data-form-mensalidade]"),
                 f"10. a ficha do aluno dele: sem o plano nem o valor ({t.texto('[data-cartao-mensalidade]')[:100]!r})")
            t.foto("10b-membro-ficha-sem-plano", "[data-cartao-mensalidade]")
        else:
            R.ok(False, f"10. o {MEMBRO} não é responsável por nenhum aluno ativo da conta: sem a ficha")
    finally:
        t.encerrar()


PASSOS = (("planos", passo_planos), ("ficha", passo_ficha), ("mensalidades", passo_mensalidades), ("aluno", passo_aluno_periodo),
          ("renovar", passo_renovar), ("mes_a_mes", passo_mes_a_mes), ("automaticas", passo_aviso_automaticas),
          ("cartao", passo_cartao_parcelado), ("um_mes", passo_um_mes), ("membro", passo_membro))


# ───────────────────────── o desfazer ─────────────────────────

def desfazer(R, est: dict) -> None:
    R.linha("\n── desfazer: sai o que a rodada criou, a matrícula de teste volta à foto e o espelho do Treino também")
    try:
        API.limpar(est)
        devolver_plano_da_conta(est)
        devolver_espelho(est)
        agora = API.foto(est["paciente"], est["conta"])
        sobra = API.sobras(est)
        espelho = espelho_do_treino(est.get("treino"))
        plano_conta = plano_da_conta(est["conta"]) if est.get("plano_conta") else None
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  python3 e2e/wp/telas.py --base local --limpar"[:500])
        return
    antes = {"pacientes": est["pacientes"], "recebimento_modo": est["recebimento_modo"], "vivas": est["escondidas"],
             "assinaturas": est["assinaturas"]}
    difs = API.diferencas(antes, agora)
    if espelho != est.get("espelho"):
        difs.append(f"physiq_profiles: {est.get('espelho')} → {espelho}")
    if plano_conta != est.get("plano_conta"):
        difs.append(f"o plano da conta: {est.get('plano_conta')} → {plano_conta}")
    R.ok(not difs and not any(sobra.values()),
         f"a matrícula de teste e o espelho no Treino voltaram à foto de antes e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    ESTADO_ARQ.unlink(missing_ok=True)


# ───────────────────────── main ─────────────────────────

def conferir_canal(R, base: str, loja: bool) -> bool:
    """O health.json do build servido diz o canal: "play" no build da loja, "site" no do site."""
    d = B.ler_saude(base)
    esperado = "play" if loja else "site"
    return R.ok(d.get("distribuicao") == esperado, f"o build servido é o {'da loja' if loja else 'do site'} (health.json: distribuicao {d.get('distribuicao')})")


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W-P — E2E de tela dos planos do aluno (painel e app; site e loja)")
    ap.add_argument("--base", required=True, choices=("local", "staging"), help="local (o vite preview do build de staging no :8080) | staging")
    ap.add_argument("--loja", action="store_true", help="o localhost:8080 está servindo o build da loja (VITE_DISTRIBUICAO=play)")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--limpar", action="store_true", help="só desfaz uma rodada que caiu no meio (pelo arquivo de estado)")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    if producao:
        raise SystemExit("o E2E de tela da W-P cria massa: só local e staging")
    B.SAIDA = SCRATCH / "wp"
    R = B.Rodada(f"wp_telas_{prefixo}{'_loja' if a.loja else ''}")
    if API.ESTADO_ARQ.exists():
        R.ok(False, f"há uma rodada do e2e/wp/api.py sem desfazer ({API.ESTADO_ARQ}): rode  python3 e2e/wp/api.py --limpar  antes")
        return R.fim()
    if not saude_dos_2():
        R.linha("   um dos 2 bancos não está saudável — parar (regra de 10/10)")
        return 2
    CTX.update(base=base, loja=a.loja, pasta=SCRATCH / "prints" / "wp" / prefixo / ("loja" if a.loja else ""),
               logins=B.Logins(f"wp/telas.py {prefixo}"))
    pendente = ler_estado()
    if pendente:
        R.linha(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes")
        desfazer(R, pendente)
        if ESTADO_ARQ.exists():
            return R.fim()
    if a.limpar:
        if not pendente:
            n = API.um(f"select count(*)::int as n from {S}.planos_aluno where nome like {API.lit(API.PREFIXO + ' %')}")["n"]
            R.ok(n == 0, f"nenhuma rodada pendente e nenhum plano '{API.PREFIXO} …' sobrando no {S} ({n})")
        return R.fim()
    R.linha(f"── W-P telas ({prefixo}{' · build da loja' if a.loja else ''}): plano de teste '{NOME}' · prints em {CTX['pasta']}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        CTX["nav"] = nav
        try:
            if B.conferir_build(R, nav, base, producao) and conferir_canal(R, base, a.loja):
                preparar(R)
                sessao_unica(DONO)
                for nome, fn in PASSOS:
                    if nome != "planos" and nome != "membro" and not CTX.get("plano"):
                        R.ok(False, f"[{nome}] sem o plano de teste (o passo planos não o criou) — pulei")
                        continue
                    t0 = time.time()
                    try:
                        fn(R)
                    except Parou as e:
                        R.ok(False, f"[{nome}] {e}")
                        break
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                        for t in (CTX.get("painel"), CTX.get("aluno")):
                            if t is not None:
                                t.diagnostico(nome)
                    R.linha(f"   ({time.time() - t0:.0f} s)")
        finally:
            for chave in ("painel", "aluno"):
                if CTX.get(chave) is not None:
                    CTX[chave].encerrar()
            if CTX.get("est"):
                desfazer(R, CTX["est"])
            CTX["logins"].fechar(R)
            nav.close()
    R.linha(f"\nprints ({len(CTX['prints'])}):\n" + "\n".join(f"   {x}" for x in CTX["prints"]))
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
