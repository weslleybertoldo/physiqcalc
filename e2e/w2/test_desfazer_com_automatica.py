#!/usr/bin/env python3
"""A guarda da W2 nos desfazer dos E2E de antes (e2e/wp/api.py, e2e/wp/telas.py, e2e/w1/api.py e e2e/w06/api.py), SEM rede: cada script
roda o desfazer DE VERDADE contra um staging de mentira com a regra da guarda contas_guard_mp (migration 20261011210000): sair de um
Mercado Pago ('mercadopago' ou 'mercadopago_conta') com cobrança automática viva na conta → P0001 automaticas_ativas:<n> (também para o
postgres dos scripts); entrar no MP do personal sem a integração ativa → P0001 mp_conta_sem_integracao.
O que se prova: a automática da RODADA que ficou viva (o sandbox recusou cancelar; o caso caiu no meio) não segura a volta da forma de
recebimento; a de FORA da rodada nunca é tocada (a rodada não começa / o caso não liga o MP); a ordem do desfazer (as automáticas da
rodada saem ANTES do modo). O staging de mentira só entende os comandos destes desfazer — um comando novo nas automáticas ou no modo
que ele não conhece faz o teste falhar (melhor do que passar sem provar).
Rodar:  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w2/test_desfazer_com_automatica.py"""
from __future__ import annotations

import importlib.util
import inspect
import re
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
E2E = Path(__file__).resolve().parents[1]
S = "staging"
MODOS_MP = ("mercadopago", "mercadopago_conta")
VIVAS = ("authorized", "pending", "paused")
CONTA, OUTRA_CONTA = "c0000000-0000-4000-8000-000000000001", "c0000000-0000-4000-8000-000000000002"
PAC, OUTRO = "a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002"
ALUNO_UID, DONO_UID = "b0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000002"
T0, ANTES_DE_T0, DEPOIS_DE_T0 = "2026-10-12 03:00:00+00", "2026-10-01 10:00:00+00", "2026-10-12 03:00:05+00"
PACIENTES = {"plano_aluno_id": None, "plano_modalidade": None, "plano_valor_negociado": None, "mensalidade_valor": "99.90",
             "mensalidade_desde": "2026-09-01", "mensalidade_pago_ate": None, "cobranca_pausada": False}


class Staging:
    """O staging de mentira: a forma da conta de teste, as automáticas (PAC = o aluno de teste; OUTRO = outro aluno da mesma conta) e a
    guarda da W2. Guarda cada comando, na ordem, e as trocas de forma aceitas."""

    def __init__(self, modo: str = "pix_manual") -> None:
        self.modo = modo
        self.integracao_mp_ativa = False
        self.ass: list[dict] = []
        self.comandos: list[str] = []
        self.trocas: list[tuple[str, str]] = []
        self.respostas: list[tuple[str, list]] = []   # (trecho do comando, linhas) para as leituras do caso que o teste monta

    def nova(self, pac: str, status: str, criado: str = ANTES_DE_T0, pre: str | None = None) -> str:
        i = str(uuid.uuid4())
        self.ass.append({"id": i, "pac": pac, "status": status, "criado": criado, "pre": pre or f"sim-teste-{i[:8]}"})
        return i

    def status(self, i: str) -> str | None:
        return next((a["status"] for a in self.ass if a["id"] == i), None)

    def trocar_modo(self, novo: str) -> None:
        """A contas_guard_mp: o gatilho só olha quando a forma MUDA."""
        if novo == self.modo:
            return
        if novo == "mercadopago_conta" and not self.integracao_mp_ativa:
            raise RuntimeError("SQL HTTP 400: ERROR: P0001: mp_conta_sem_integracao")
        n = len({a["pac"] for a in self.ass if a["status"] in VIVAS})
        if self.modo in MODOS_MP and n:
            raise RuntimeError(f"SQL HTTP 400: ERROR: P0001: automaticas_ativas:{n}")
        self.trocas.append((self.modo, novo))
        self.modo = novo

    def indice(self, trecho: str) -> int:
        return next((i for i, c in enumerate(self.comandos) if trecho in " ".join(c.split())), -1)

    def sql(self, q: str) -> list:
        self.comandos.append(q)
        t = " ".join(q.split())
        ids = re.search(r"not \((?:a\.)?id = any\(array\[([^\]]*)\]::uuid\[\]\)\)", t)
        foto = set(re.findall(r"'([0-9a-f-]{36})'", ids.group(1))) if ids else set()
        m = re.fullmatch(rf"update {S}\.contas set recebimento_modo = '([a-z_]+)'(?:, bloquear_app_inadimplente = (?:true|false))? "
                         r"where id = '([0-9a-f-]+)'(.*)", t)
        if m:
            novo, conta, cond = m.groups()
            if conta != CONTA:
                return []
            c = re.fullmatch(r" and recebimento_modo (is distinct from|=) '([a-z_]+)'", cond) if cond else None
            if cond and not c:
                raise AssertionError(f"o staging de mentira não conhece esta troca de forma: {t[:220]}")
            if not c or (c.group(1) == "=" and self.modo == c.group(2)) or (c.group(1) != "=" and self.modo != c.group(2)):
                self.trocar_modo(novo)
            return []
        m = re.fullmatch(rf"delete from {S}\.aluno_assinaturas where paciente_id = '([0-9a-f-]+)' and not \(id = any\(array\[[^\]]*\]::uuid\[\]\)\)", t)
        if m:
            self.ass = [a for a in self.ass if not (a["pac"] == m.group(1) and a["id"] not in foto)]
            return []
        m = re.fullmatch(rf"update {S}\.aluno_assinaturas set status = 'cancelled' where paciente_id = '([0-9a-f-]+)' and not \(id = any\(array\["
                         r"[^\]]*\]::uuid\[\]\)\) and status in \('authorized', 'pending', 'paused'\) returning id::text as id", t)
        if m:
            alvo = [a for a in self.ass if a["pac"] == m.group(1) and a["id"] not in foto and a["status"] in VIVAS]
            for a in alvo:
                a["status"] = "cancelled"
            return [{"id": a["id"]} for a in alvo]
        m = re.fullmatch(rf"update {S}\.aluno_assinaturas set status = 'cancelled' where paciente_id = '([0-9a-f-]+)' and criado_em >= '([^']+)'"
                         r"::timestamptz and status in \('authorized', 'pending', 'paused'\) returning id::text as id", t)
        if m:
            alvo = [a for a in self.ass if a["pac"] == m.group(1) and a["criado"] >= m.group(2) and a["status"] in VIVAS]
            for a in alvo:
                a["status"] = "cancelled"
            return [{"id": a["id"]} for a in alvo]
        m = re.fullmatch(rf"update {S}\.aluno_assinaturas set status = 'cancelled' where paciente_id = '([0-9a-f-]+)' and status <> 'cancelled'", t)
        if m:
            for a in self.ass:
                if a["pac"] == m.group(1):
                    a["status"] = "cancelled"
            return []
        m = re.fullmatch(rf"select id::text as id from {S}\.aluno_assinaturas where paciente_id = '([0-9a-f-]+)' and not \(id = any\(array\["
                         r"[^\]]*\]::uuid\[\]\)\) and status in \('authorized', 'pending', 'paused'\) and coalesce\(mp_preapproval_id, ''\) "
                         r"!~ '\^\(sim-\|wp-e2e-\)'", t)
        if m:
            return [{"id": a["id"]} for a in self.ass if a["pac"] == m.group(1) and a["id"] not in foto and a["status"] in VIVAS
                    and not re.match(r"^(sim-|wp-e2e-)", a["pre"])]
        m = re.fullmatch(rf"select count\(\*\)::int as n from {S}\.aluno_assinaturas a join {S}\.pacientes p on p\.id = a\.paciente_id where "
                         r"p\.conta_id = '([0-9a-f-]+)' and a\.status in \('authorized', 'pending', 'paused'\) and not \(a\.paciente_id = "
                         r"'([0-9a-f-]+)' and not \(a\.id = any\(array\[[^\]]*\]::uuid\[\]\)\)\)", t)
        if m:
            return [{"n": sum(1 for a in self.ass if a["status"] in VIVAS and not (a["pac"] == m.group(2) and a["id"] not in foto))}]
        m = re.fullmatch(rf"select c\.recebimento_modo as modo, clock_timestamp\(\)::text as t0, \(select count\(\*\) from {S}\.aluno_assinaturas a "
                         rf"join {S}\.pacientes p on p\.id = a\.paciente_id where p\.conta_id = c\.id and a\.paciente_id <> '([0-9a-f-]+)' and "
                         rf"a\.status in \('authorized', 'pending', 'paused'\)\)::int as fora from {S}\.contas c where c\.id = '([0-9a-f-]+)'", t)
        if m:
            return [{"modo": self.modo, "t0": T0, "fora": sum(1 for a in self.ass if a["pac"] != m.group(1) and a["status"] in VIVAS)}]
        if re.fullmatch(rf"select recebimento_modo as m from {S}\.contas where id = '{CONTA}'", t):
            return [{"m": self.modo}]
        m = re.fullmatch(rf"select status from {S}\.aluno_assinaturas where paciente_id = '([0-9a-f-]+)' order by criado_em desc limit 1", t)
        if m:
            dele = sorted((a for a in self.ass if a["pac"] == m.group(1)), key=lambda a: a["criado"])
            return [{"status": dele[-1]["status"]}] if dele else []
        for trecho, linhas in self.respostas:
            if trecho in t:
                return linhas
        if "aluno_assinaturas" in t or "recebimento_modo" in t:
            raise AssertionError(f"o staging de mentira não conhece este comando: {t[:220]}")
        return []


class Placar:
    def __init__(self) -> None:
        self.checks: list[tuple[bool, str]] = []

    def check(self, ok: object, texto: str) -> bool:
        self.checks.append((bool(ok), str(texto)))
        return bool(ok)

    def falhas(self) -> list[str]:
        return [t for ok, t in self.checks if not ok]


class Rodada(Placar):
    """O R dos telas.py (ok/linha)."""

    def ok(self, cond: object, texto: str, parar: bool | None = None) -> bool:  # noqa: ARG002
        return self.check(cond, texto)

    def linha(self, texto: str) -> None:
        pass


# ───────────────────────── a carga dos scripts (sem rede, sem senha) ─────────────────────────

_GUARDADOS: dict[str, object] = {}
MOD: dict[str, types.ModuleType] = {}


def _no_sys_modules(nome: str, mod) -> None:
    if nome not in _GUARDADOS:
        _GUARDADOS[nome] = sys.modules.get(nome)
    sys.modules[nome] = mod


def _carregar(nome: str, arq: Path) -> types.ModuleType:
    espec = importlib.util.spec_from_file_location(nome, arq)
    mod = importlib.util.module_from_spec(espec)
    _no_sys_modules(nome, mod)
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


class Base(types.ModuleType):
    """A base dos E2E de mentira (no lugar da e2e/w06/_base.py): o SQL vai ao staging de mentira; pag/rest respondem o que o teste manda."""

    def __init__(self) -> None:
        super().__init__("_base")
        self.p = Placar()
        self.ESTADO = {"schema": S}
        self.B5 = types.SimpleNamespace()
        self.PRINCIPAL_URL = "http://127.0.0.1:9"
        self.banco = Staging()
        self.pag_respostas: dict = {}
        self.pedidos: list[tuple[str, str]] = []
        self.rest_pedidos: list[tuple[str, str, str]] = []

    def sql_principal(self, q: str) -> list:
        return self.banco.sql(q)

    def pag(self, conta: str, acao: str, corpo: dict | None = None):
        self.pedidos.append((conta, acao))
        r = self.pag_respostas.get(acao, (200, {}))
        return r(corpo or {}) if callable(r) else r

    def rest(self, conta: str, metodo: str, caminho: str, corpo=None, prefer: str = ""):  # noqa: ARG002
        self.rest_pedidos.append((conta, metodo, caminho))
        if caminho.startswith(f"contas?id=eq.{CONTA}"):
            if metodo == "PATCH":
                try:
                    self.banco.trocar_modo(corpo["recebimento_modo"])
                except RuntimeError as e:
                    return 400, {"code": "P0001", "message": str(e)}
            return 200, [{"recebimento_modo": self.banco.modo}]
        return 200, []

    def matricula(self, conta: str) -> dict:
        return {"id": PAC, "conta_id": CONTA, "treino_user_id": None} if conta == "aluno-calc" else {"id": OUTRO, "conta_id": OUTRA_CONTA}

    def http(self, *_a, **_k):
        raise AssertionError("o teste não vai à rede")

    def token_cartao(self, titular: str = "APRO") -> str:
        return f"tok-{titular}"

    def hoje(self) -> str:
        return "2026-10-12"

    def dias(self, n: int) -> str:
        return f"2026-10-{12 + n:02d}"

    def uid(self, conta: str) -> str:
        return DONO_UID


BASE = Base()


def setUpModule() -> None:  # noqa: N802
    _no_sys_modules("_base", BASE)                                     # o "import _base" do w06/api.py e o do wp/api.py
    MOD["wp"] = _carregar("_wp_api", E2E / "wp" / "api.py")            # o nome que o wp/telas.py procura
    MOD["wp"].B, MOD["wp"].p = BASE, BASE.p
    hml18 = types.ModuleType("_base_hml18")
    hml18.B5 = BASE.B5
    hml18.Celular = type("Celular", (), {})
    hml18.JS_LARGURA = "() => ({})"
    _no_sys_modules("_base_w06", BASE)
    _no_sys_modules("_base_hml18", hml18)
    MOD["wp_telas"] = _carregar("_teste_wp_telas", E2E / "wp" / "telas.py")
    MOD["w1"] = _carregar("_teste_w1_api", E2E / "w1" / "api.py")
    MOD["w1"].B, MOD["w1"].p = BASE, BASE.p
    MOD["w06"] = _carregar("_teste_w06_api", E2E / "w06" / "api.py")


def tearDownModule() -> None:  # noqa: N802
    for nome, antes in _GUARDADOS.items():
        if antes is None:
            sys.modules.pop(nome, None)
        else:
            sys.modules[nome] = antes


class _Caso(unittest.TestCase):
    def setUp(self) -> None:
        BASE.banco = self.banco = Staging()
        BASE.p = self.p = Placar()
        BASE.pag_respostas, BASE.pedidos, BASE.rest_pedidos = {}, [], []
        for chave in ("wp", "w1"):
            MOD[chave].p = BASE.p
        MOD["w06"].p = BASE.p
        self.antiga = self.banco.nova(PAC, "cancelled")           # a da foto (de antes da rodada)


# ───────────────────────── e2e/wp/api.py ─────────────────────────

class WpApi(_Caso):
    def setUp(self) -> None:
        super().setUp()
        self.wp = MOD["wp"]
        self.est = {"t0": T0, "paciente": PAC, "conta": CONTA, "aluno_uid": ALUNO_UID, "dono_uid": DONO_UID, "fila_max": 10,
                    "pacientes": dict(PACIENTES), "recebimento_modo": "pix_manual", "escondidas": [], "assinaturas": [self.antiga]}
        self.wp.CTX.clear()
        self.wp.CTX.update(estado=self.est, pac=PAC, conta=CONTA, plano=str(uuid.uuid4()), t0=T0, fila_max=10)
        BASE.pag_respostas["prof_cancelar_assinatura"] = (502, {"erro": "mp_falhou"})   # o sandbox recusa a credencial TEST- (11/10)

    def test_limpar_com_a_automatica_da_rodada_viva_e_a_conta_no_mp_devolve_a_forma(self) -> None:
        # a rodada caiu (processo morto) com a conta no MP e a automática do sandbox 'pending': o --limpar da próxima rodada
        self.banco.modo = "mercadopago"
        da_rodada = self.banco.nova(PAC, "pending", DEPOIS_DE_T0, pre="1234567890")
        self.wp.limpar(self.est)
        self.assertEqual(self.banco.modo, "pix_manual")
        self.assertIsNone(self.banco.status(da_rodada), "a automática da rodada saiu")
        self.assertEqual(self.banco.status(self.antiga), "cancelled", "a de antes da rodada ficou")
        self.assertIn(("prof2", "prof_cancelar_assinatura"), BASE.pedidos, "tentou cancelar no MP antes (pela função)")
        i_ass = self.banco.indice(f"delete from {S}.aluno_assinaturas")
        i_modo = self.banco.indice(f"update {S}.contas set recebimento_modo")
        self.assertTrue(0 <= i_ass < i_modo, f"as automáticas da rodada saem ANTES da forma ({i_ass} < {i_modo})")

    def test_limpar_nao_toca_a_automatica_de_outro_aluno(self) -> None:
        de_fora = self.banco.nova(OUTRO, "authorized")
        self.banco.nova(PAC, "pending", DEPOIS_DE_T0, pre="1234567890")
        self.wp.limpar(self.est)                                      # a conta já no Pix: a guarda não olha
        self.assertEqual(self.banco.status(de_fora), "authorized")

    def test_caso_mp_que_cai_com_a_automatica_da_rodada_viva_volta_ao_pix(self) -> None:
        def salvar_e_cair(**_k):
            self.banco.nova(PAC, "pending", DEPOIS_DE_T0, pre="1234567890")   # o sandbox criou a automática e o caso caiu
            raise RuntimeError("caiu no meio do caso")

        with tempfile.TemporaryDirectory() as casa, mock.patch.object(Path, "home", return_value=Path(casa)), \
                mock.patch.object(self.wp, "salvar", salvar_e_cair):
            for nome in (".physiq-mp-test", ".physiq-mp-public-test"):
                (Path(casa) / nome).write_text("x", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                self.wp.caso_mp()
        self.assertEqual(self.banco.trocas, [("pix_manual", "mercadopago"), ("mercadopago", "pix_manual")])
        self.assertEqual([a["status"] for a in self.banco.ass if a["criado"] == DEPOIS_DE_T0], ["cancelled"])
        self.assertEqual(self.banco.status(self.antiga), "cancelled")

    def test_caso_mp_com_automatica_viva_de_fora_nao_liga_o_mp(self) -> None:
        de_fora = self.banco.nova(OUTRO, "pending")
        with tempfile.TemporaryDirectory() as casa, mock.patch.object(Path, "home", return_value=Path(casa)):
            for nome in (".physiq-mp-test", ".physiq-mp-public-test"):
                (Path(casa) / nome).write_text("x", encoding="utf-8")
            self.wp.caso_mp()
        self.assertEqual(self.banco.trocas, [], "o caso não ligou o MP")
        self.assertEqual(self.banco.status(de_fora), "pending", "a de fora ficou como estava")
        self.assertTrue(any("de fora da rodada" in t for t in self.p.falhas()), self.p.checks)

    def test_ponto_de_partida_recusa_sem_gravar(self) -> None:
        self.assertIsNone(self.wp.motivo_para_nao_comecar(CONTA, PAC, "pix_manual", [self.antiga]))
        self.assertEqual(self.banco.comandos, [], "no Pix nem pergunta ao banco")
        self.assertIsNone(self.wp.motivo_para_nao_comecar(CONTA, PAC, "mercadopago", [self.antiga]))
        self.banco.nova(OUTRO, "authorized")
        self.assertIn("não começa", self.wp.motivo_para_nao_comecar(CONTA, PAC, "mercadopago", [self.antiga]) or "")
        self.assertIn("personal", self.wp.motivo_para_nao_comecar(CONTA, PAC, "mercadopago_conta", [self.antiga]) or "")
        fonte = inspect.getsource(self.wp.preparar)
        self.assertLess(fonte.index("motivo_para_nao_comecar("), fonte.index("guardar_estado(est)"), "recusa ANTES de gravar o estado")

    def test_a_automatica_de_antes_da_rodada_do_aluno_de_teste_conta_como_de_fora(self) -> None:
        viva_de_antes = self.banco.nova(PAC, "authorized")
        self.assertEqual(self.wp.vivas_de_fora(CONTA, PAC, [self.antiga, viva_de_antes]), 1)
        self.assertEqual(self.wp.vivas_de_fora(CONTA, PAC, [self.antiga]), 0, "fora da foto = da rodada")


# ───────────────────────── e2e/wp/telas.py ─────────────────────────

class WpTelas(_Caso):
    def setUp(self) -> None:
        super().setUp()
        self.telas, self.wp = MOD["wp_telas"], MOD["wp"]
        est = {"t0": T0, "paciente": PAC, "conta": CONTA, "aluno_uid": ALUNO_UID, "dono_uid": DONO_UID, "fila_max": 10,
               "pacientes": dict(PACIENTES), "recebimento_modo": "pix_manual", "escondidas": [], "assinaturas": [self.antiga]}
        self.telas.CTX.clear()
        self.telas.CTX.update(prints=[], est=est, pac=PAC, conta=CONTA, t0=T0, fila_max=10, plano=str(uuid.uuid4()))
        self.R = Rodada()

    def test_passo_9_que_cai_com_a_automatica_da_rodada_viva_volta_a_forma_da_foto(self) -> None:
        da_rodada = self.banco.nova(PAC, "authorized", DEPOIS_DE_T0)    # a simulada do passo 8, que ficou viva

        def navegador_caiu(*_a, **_k):
            raise RuntimeError("o navegador caiu com a conta no Mercado Pago")

        with mock.patch.object(self.telas, "painel", navegador_caiu), self.assertRaises(RuntimeError):
            self.telas.passo_cartao_parcelado(self.R)
        self.assertEqual(self.banco.trocas, [("pix_manual", "mercadopago"), ("mercadopago", "pix_manual")])
        self.assertEqual(self.banco.status(da_rodada), "cancelled")
        self.assertEqual(self.banco.status(self.antiga), "cancelled")

    def test_passo_9_com_automatica_viva_de_fora_nao_liga_o_mp(self) -> None:
        de_fora = self.banco.nova(OUTRO, "paused")
        with mock.patch.object(self.telas, "painel", side_effect=AssertionError("não devia abrir o painel")):
            self.telas.passo_cartao_parcelado(self.R)
        self.assertEqual(self.banco.trocas, [])
        self.assertEqual(self.banco.status(de_fora), "paused")
        self.assertTrue(any("de fora da rodada" in t for t in self.R.falhas()), self.R.checks)

    def test_preparar_recusa_antes_de_gravar_e_o_desfazer_e_o_do_api(self) -> None:
        fonte = inspect.getsource(self.telas.preparar)
        self.assertLess(fonte.index("API.motivo_para_nao_comecar("), fonte.index("guardar_estado(est)"))
        self.assertIn("API.limpar(est)", inspect.getsource(self.telas.desfazer))


# ───────────────────────── e2e/w1/api.py ─────────────────────────

class W1Api(_Caso):
    def setUp(self) -> None:
        super().setUp()
        self.w1 = MOD["w1"]
        self.est = {"t0": T0, "paciente": PAC, "conta_id": CONTA, "aluno_uid": ALUNO_UID, "dono_uid": DONO_UID,
                    "pacientes": {k: v for k, v in PACIENTES.items() if k != "mensalidade_pago_ate"},
                    "conta": {"modo": "pix_manual", "bloquear": False}, "chaves": [], "integracao": None, "flag": None, "vivas": [],
                    "assinaturas": [self.antiga], "rodada": None}
        self.w1.CTX.clear()
        self.w1.CTX.update(estado=self.est, pac=PAC, conta=CONTA, t0=T0)

    def test_limpar_com_a_automatica_do_caso_trocar_viva_devolve_a_forma(self) -> None:
        # o caso trocar caiu entre ligar o MP (com a automática simulada 'authorized') e o OK que a cancela
        self.banco.modo = "mercadopago"
        da_rodada = self.banco.nova(PAC, "authorized", DEPOIS_DE_T0)
        self.w1.limpar(self.est)
        self.assertEqual(self.banco.modo, "pix_manual")
        self.assertIsNone(self.banco.status(da_rodada))
        self.assertEqual(self.banco.status(self.antiga), "cancelled")
        i_ass = self.banco.indice(f"delete from {S}.aluno_assinaturas")
        i_modo = self.banco.indice(f"update {S}.contas set recebimento_modo")
        self.assertTrue(0 <= i_ass < i_modo, f"as automáticas da rodada saem ANTES da forma ({i_ass} < {i_modo})")

    def test_limpar_so_desfaz_a_integracao_da_infinitepay(self) -> None:
        self.w1.limpar(self.est)
        integ = [c for c in self.banco.comandos if "recebimento_integracoes" in c and c.lstrip().startswith("delete")]
        self.assertEqual(len(integ), 1)
        self.assertIn("provedor = 'infinitepay'", integ[0], "a integração do MP do personal (W2) não é desta rodada")

    def test_caso_trocar_com_automatica_viva_de_fora_nao_liga_o_mp(self) -> None:
        de_fora = self.banco.nova(OUTRO, "authorized")
        self.w1.caso_trocar()
        self.assertEqual(self.banco.trocas, [])
        self.assertEqual(self.banco.status(de_fora), "authorized")
        self.assertEqual(BASE.pedidos, [], "nem pediu o OK à função (que cancelaria a de fora)")
        self.assertTrue(any("de fora da rodada" in t for t in self.p.falhas()), self.p.checks)

    def test_ponto_de_partida_recusa_sem_gravar(self) -> None:
        self.assertIsNone(self.w1.motivo_para_nao_comecar(CONTA, PAC, "infinitepay", [self.antiga]))
        self.banco.nova(OUTRO, "pending")
        self.assertIn("não começa", self.w1.motivo_para_nao_comecar(CONTA, PAC, "mercadopago", [self.antiga]) or "")
        self.assertIn("personal", self.w1.motivo_para_nao_comecar(CONTA, PAC, "mercadopago_conta", [self.antiga]) or "")
        fonte = inspect.getsource(self.w1.preparar)
        self.assertLess(fonte.index("motivo_para_nao_comecar("), fonte.index("ESTADO_ARQ.write_text("))


# ───────────────────────── e2e/w06/api.py ─────────────────────────

class W06Api(_Caso):
    COB, AVULSA = "d0000000-0000-4000-8000-000000000001", "d0000000-0000-4000-8000-000000000002"

    def setUp(self) -> None:
        super().setUp()
        self.w06 = MOD["w06"]
        self.banco.respostas = [
            (f"select mp_payment_id from {S}.cobrancas", [{"mp_payment_id": "sim-pix-1"}]),
            ("mensalidade_pago_ate is not null as ok", [{"ok": True}]),
            (f"select status, reembolsado_em is not null as r, mp_status from {S}.cobrancas", [{"status": "cancelada", "r": True, "mp_status": "refunded"}]),
            (f"select recebimento_modo from {S}.contas where id = '{OUTRA_CONTA}'", [{"recebimento_modo": "pix_manual"}]),
        ]
        pix = {"id": self.COB, "forma": "mp", "status": "aguardando_confirmacao", "pix_copia_cola": "000201"}
        vezes = {"pix": 0}

        def aluno_mp_pix(_c):
            vezes["pix"] += 1
            if vezes["pix"] == 1:
                return 200, {"cobranca": pix}
            return (200, {"cobranca": pix, "reutilizada": True}) if vezes["pix"] == 2 else (400, {"erro": "ainda_coberto"})

        def aluno_mp_cartao(c):
            return (200, {"status": "paga"}) if c.get("card_token") == "tok-APRO" else (400, {"erro": "ja_paga"})

        def aluno_mp_assinar(_c):
            self.banco.nova(PAC, "pending", DEPOIS_DE_T0, pre="2c9380848f0000000000")   # nasce pendente no sandbox
            return 200, {"assinatura": {"status": "pending"}, "sandbox": True}

        BASE.pag_respostas.update({
            "aluno_mp_pix": aluno_mp_pix, "simular_aprovacao": (200, {"cobranca": {"status": "paga"}}),
            "prof_cobranca_criar": (200, {"cobranca": {"id": self.AVULSA}}), "aluno_mp_cartao": aluno_mp_cartao,
            "prof_reembolsar": (200, {}), "aluno_mp_assinar": aluno_mp_assinar,
            "prof_cancelar_assinatura": (502, {"erro": "mp_falhou"}),                     # o sandbox recusa cancelar
        })

    def test_o_sandbox_recusa_cancelar_e_o_master_sai_do_mp_mesmo_assim(self) -> None:
        self.w06.caso_mp()
        self.assertEqual(self.banco.modo, "pix_manual")
        self.assertEqual(self.banco.trocas, [("pix_manual", "mercadopago"), ("mercadopago", "pix_manual")])
        do_caso = [a for a in self.banco.ass if a["criado"] == DEPOIS_DE_T0]
        self.assertEqual([a["status"] for a in do_caso], ["cancelled"], "a do caso cancelada só no banco antes de sair")
        falhas = self.p.falhas()
        self.assertTrue(any("cancela a assinatura" in t for t in falhas), "o ❌ do cancelamento recusado continua contado")
        self.assertFalse(any("pode sair do Mercado Pago" in t for t in falhas), falhas)

    def test_o_caso_que_cai_no_meio_devolve_a_conta_ao_pix(self) -> None:
        BASE.pag_respostas["aluno_mp_pix"] = (502, {"erro": "mp_falhou"})   # o sandbox recusa o Pix: c = {} → KeyError no meio
        with self.assertRaises(KeyError):
            self.w06.caso_mp()
        self.assertEqual(self.banco.modo, "pix_manual")
        self.assertEqual(self.banco.trocas, [("pix_manual", "mercadopago"), ("mercadopago", "pix_manual")])

    def test_o_caso_que_cai_depois_de_criar_a_automatica_cancela_so_a_dele(self) -> None:
        de_antes = self.banco.nova(PAC, "authorized")                   # do aluno de teste, de antes: o caso a cancela no começo (como sempre)

        def cair(_c):
            raise ConnectionError("a rede caiu no cancelamento")

        BASE.pag_respostas["prof_cancelar_assinatura"] = cair
        with self.assertRaises(ConnectionError):
            self.w06.caso_mp()
        self.assertEqual(self.banco.modo, "pix_manual")
        self.assertEqual(self.banco.status(de_antes), "cancelled")
        self.assertEqual([a["status"] for a in self.banco.ass if a["criado"] == DEPOIS_DE_T0], ["cancelled"])

    def test_com_automatica_viva_de_outro_aluno_nao_liga_o_mp(self) -> None:
        de_fora = self.banco.nova(OUTRO, "authorized")
        self.w06.caso_mp()
        self.assertEqual(self.banco.trocas, [])
        self.assertEqual(self.banco.status(de_fora), "authorized")
        self.assertTrue(any("de outro aluno" in t for t in self.p.falhas()), self.p.checks)

    def test_no_mp_do_personal_nao_liga_o_mp(self) -> None:
        self.banco.modo = "mercadopago_conta"
        self.w06.caso_mp()
        self.assertEqual(self.banco.trocas, [])
        self.assertEqual(self.banco.modo, "mercadopago_conta")


class StagingDeMentira(unittest.TestCase):
    """O próprio staging de mentira segue a guarda (sem isso os testes acima não provariam nada)."""

    def test_a_guarda(self) -> None:
        b = Staging("mercadopago")
        b.nova(OUTRO, "pending")
        with self.assertRaisesRegex(RuntimeError, "automaticas_ativas:1"):
            b.sql(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{CONTA}'")
        b.sql(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{CONTA}'")   # não mudou: o gatilho não olha
        b2 = Staging("pix_manual")
        with self.assertRaisesRegex(RuntimeError, "mp_conta_sem_integracao"):
            b2.sql(f"update {S}.contas set recebimento_modo = 'mercadopago_conta' where id = '{CONTA}'")
        with self.assertRaises(AssertionError):
            b2.sql(f"update {S}.aluno_assinaturas set status = 'cancelled' where conta_id = '{CONTA}'")   # comando que ele não conhece


if __name__ == "__main__":
    unittest.main()
