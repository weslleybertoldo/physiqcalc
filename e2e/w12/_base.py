"""Physiq W12 — base dos testes de ponta a ponta da aba Início (tela 1).

Login como o app: sessão do banco principal injetada no aparelho (W3) + troca de token pelo próprio app (quem tem Treino) e o
PowerSync. O Início junta o que as outras abas leem: o treino de hoje (SQLite do PowerSync — P20: no local e no staging ele LÊ
o `public` do Banco do Treino), a dieta e as metas (minha_dieta() no principal, schema staging), a agenda e o Perfil (W7) e a
evolução (W10: REST do Treino + minha_evolucao()).

Contas (só *.teste.claude@physiqnutri.app e teste@teste.com — P26; senhas em ~/.physiq-teste-<nome>):
  w10-aluno    "Diego Almeida" — Treino + Nutrição (Lucas, personal · Camila, nutricionista): os 6 blocos da tela 1
  w7-aluno     "Rafael Moura"  — Treino + Nutrição com a mensalidade de R$ 249,00 vencendo (a faixa da W6) e a agenda
  w7-treino    "Bruno Treino"  — só Treino (sem avaliação)
  paciente     "Paciente Teste Claude" — só Nutrição (o paciente do site antigo): plano de todo dia e 2 metas
  w7b-novo     "Ana Lima"      — aluna do app SEM profissional, Treino + Alimentação (os pratos prontos), nos dias grátis
  w7b-treino   "Carla Treino"  — aluna do app SEM profissional, só Treino
  master       admin.teste.claude — profissional: abre no painel
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w11", Path(__file__).parent.parent / "w11" / "_base.py")
B11 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w11"] = B11
_ESPEC.loader.exec_module(B11)  # type: ignore[union-attr]

B10, B8, B7, B5 = B11.B10, B11.B8, B11.B7, B11.B5
p = B11.p
ESTADO, CONTAS = B11.ESTADO, B11.CONTAS
Caso, sql_treino, sql_principal, saude_treino = B11.Caso, B11.sql_treino, B11.sql_principal, B11.saude_treino
http, service, anon, rpc, uid, treino_id, sessao = B5.http, B5.service, B5.anon, B5.rpc, B5.uid, B5.treino_id, B5.sessao
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w12"
for _b in (B5, B7, B8, B10, B11):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w12"
BACKUP = Path.home() / "backups" / "physiq" / "2026-09-30-w12"

EMAIL = dict(B11.EMAIL)
EMAIL.update({
    "w7-aluno": "w7.aluno.teste.claude@physiqnutri.app",
    "w7-treino": "w7.treino.teste.claude@physiqnutri.app",
    "w7b-treino": "w7b.treino.teste.claude@physiqnutri.app",
})
for _k, _e in EMAIL.items():
    if _k != "nutri":
        CONTAS.setdefault(_k, (_e, B5.senha_de(_k)))


def schema() -> str:
    return ESTADO["schema"]


def abrir(nav, base: str, prefixo: str, nome: str, conta: str, rota: str = "/", esperar: str | None = "[data-aba-inicio]",
          sw: bool = False) -> "Caso":
    """Contexto limpo no celular (390 × 844 × 3,4 = 1326 × 2870, como as telas do app), sessão injetada e a rota."""
    c = Caso(nav, base, prefixo, nome, desktop=False)
    if sw:  # o service worker ligado (o "sem internet" de verdade: o app abre do cache do aparelho)
        c.ctx.close()
        c.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="allow")
        c.pg = c.ctx.new_page()
        c.pg.on("pageerror", lambda e: c.erros.append(str(e)))
        c.pg.on("console", lambda m: c.console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        c.pg.on("dialog", lambda d: d.accept())
    c.entrar(conta, rota, zerar=schema() == "staging")
    c.fechar_avisos()
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 120)
        p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
        p.check(not c.caminho().startswith("/entrar"), f"[{nome}] não caiu na tela de entrada")
    return c


def attr(c, seletor: str, nome: str) -> str | None:
    try:
        loc = c.pg.locator(seletor).first
        return loc.get_attribute(nome, timeout=2000) if loc.count() else None
    except Exception:  # noqa: BLE001
        return None


def txt(c, seletor: str) -> str:
    try:
        loc = c.pg.locator(seletor).first
        return loc.inner_text(timeout=2000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def foto(c, nome: str) -> str:
    """Print sem os avisos (toasts) por cima."""
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)
    return c.print(nome)


def aba(c, rotulo: str) -> None:
    """Toca na aba da barra de baixo (navegação dentro do app, sem recarregar a página)."""
    c.pg.locator("[data-tabbar] [data-aba]", has_text=rotulo).first.click()
    c.pg.wait_for_timeout(700)


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def pausa(s: float) -> None:
    time.sleep(s)
