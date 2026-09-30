"""Physiq W8 — base dos testes de ponta a ponta da aba Treino nova (tela 2) e dos smokes de UI do treino adaptados.

Login como o app: sessão do banco principal injetada no aparelho (a W3), troca de token pelo próprio app e o PowerSync.

P20 — o PowerSync de desenvolvimento está parado: no local e no staging o app LÊ o `public` (instância de produção) e GRAVA o
`staging` (o upload do connector respeita o schema do build). Gravar com internet no local/staging "some" da tela em ~3 s
(o próximo checkpoint, que lê o public, desfaz a mudança local). Por isso os fluxos de ESCRITA do aluno rodam SEM INTERNET
depois do 1º sync (o SQLite do aparelho é a verdade da tela — é o que a aba promete: funcionar sem internet) e, na volta da
internet, conferem que a fila subiu para o `staging` do Banco do Treino. Nada é gravado no `public` (produção).

Conta: `teste@teste.com` (aluno de teste do Calc; Treino c62c7533…; o treino do profissional "Peito + tríceps" está liberado
para ele). Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas em ~/.physiqcalc-teste-* e ~/.physiq-teste-*.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w07", Path(__file__).parent.parent / "w07" / "_base.py")
B7 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w07"] = B7
_ESPEC.loader.exec_module(B7)  # type: ignore[union-attr]

B5 = B7.B5
p = B7.p
ESTADO, CONTAS = B7.ESTADO, B7.CONTAS
Caso, sql_treino, sql_principal, saude_treino = B7.Caso, B7.sql_treino, B7.sql_principal, B7.saude_treino

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w08"
B5.PRINTS = PRINTS
B7.PRINTS = PRINTS

ALUNO = "aluno-calc"  # teste@teste.com
# aluno do app SEM profissional (W7b, só Treino — "Carla Treino"): o vazio com "Montar o meu" e "Usar um treino pronto"
CONTAS.setdefault("w7b-treino", ("w7b.treino.teste.claude@physiqnutri.app", B7.senha_de("w7b-treino")))
USER_TESTE = "c62c7533-14ff-4e01-9ffa-06b3cdff1cc5"
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"
GRUPO_NOME = "Peito + tríceps"
FUSO = dt.timezone(dt.timedelta(hours=-3))


def hoje() -> dt.date:
    return dt.datetime.now(FUSO).date()


def schema() -> str:
    return ESTADO["schema"]


def agora_iso() -> str:
    """Instante (UTC, ISO) — o corte da limpeza: só o que o teste gravou depois disto."""
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def toasts(c) -> str:
    """Textos dos avisos (sonner) na tela — lidos de uma vez (um aviso pode sumir no meio da leitura)."""
    try:
        return c.pg.evaluate("() => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | ')")
    except Exception:  # noqa: BLE001
        return ""


def pausa(s: float) -> None:
    time.sleep(s)


# ───────────────────────── navegador ─────────────────────────

def abrir_treino(nav, base: str, prefixo: str, nome: str, conta: str = ALUNO, rota: str = "/treino") -> "Caso":
    """Contexto limpo (390 × 844 × 3,4), sessão injetada, espera a aba Treino e o 1º sync do PowerSync."""
    if conta == ALUNO:
        preparar_staging()
    c = Caso(nav, base, prefixo, nome, desktop=False)
    c.entrar(conta, rota, zerar=True)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-aba-treino]") and (c.tem("[data-cartao-treino]") or c.tem("[data-sem-treino-dia]")), 120)
    p.check(ok, f"[{nome}] a aba Treino abriu já logada (sem cair no Entrar)")
    p.check("Entrar com o Google" not in c.texto() and not c.caminho().startswith("/entrar"), f"[{nome}] não caiu na tela de entrada")
    # o 1º sync: o indicador "Baixando o seu treino" some
    c.esperar(lambda: not c.tem('[data-sync="primeira"]'), 90)
    c.pg.wait_for_timeout(1200)
    return c


def sem_internet(c: "Caso", sim: bool = True) -> None:
    c.ctx.set_offline(sim)
    c.pg.wait_for_timeout(900)


def texto(c: "Caso", seletor: str) -> str:
    loc = c.pg.locator(seletor)
    return loc.first.inner_text() if loc.count() else ""


def ir_para_dia(c: "Caso", data: dt.date) -> None:
    """Navega pela faixa (setas de semana) até o dia e toca nele."""
    chave = data.isoformat()
    for _ in range(60):
        if c.pg.locator(f'[data-dia="{chave}"]').count():
            break
        hoje_ = hoje()
        c.pg.locator("[data-semana-proxima]" if data > hoje_ else "[data-semana-anterior]").click()
        c.pg.wait_for_timeout(200)
    c.pg.locator(f'[data-dia="{chave}"]').click()
    c.pg.wait_for_timeout(700)


def escolher_treino_do_dia(c: "Caso", grupo_nome: str = GRUPO_NOME) -> bool:
    """Põe o treino do profissional no dia da tela (a troca do dia, tb_treino_dia_override): pelo vazio ou pelo ⋯."""
    if c.tem("[data-sem-treino-adicionar]"):
        c.pg.locator("[data-sem-treino-adicionar]").click()
    elif c.tem("[data-sem-treino-escolher]"):
        c.pg.locator("[data-sem-treino-escolher]").click()
    else:
        c.pg.locator("[data-treino-opcoes]").first.click()
        c.esperar(lambda: c.tem("[data-opcoes-treino]"), 8)
        c.pg.get_by_text("Trocar o treino do dia").click()
    c.esperar(lambda: c.tem("[data-alterar-treino]"), 10)
    c.pg.locator("[data-alterar-treino] [data-escolher-treino]", has_text=grupo_nome).first.click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-slot-grupo="{grupo_nome}"] [data-exercicio-id]').count() > 0, 20)
    c.pg.wait_for_timeout(600)
    return ok


def exercicios(c: "Caso") -> list[str]:
    return c.pg.locator("[data-exercicio-id]").evaluate_all("els => els.map(e => e.getAttribute('data-exercicio-id'))")


def linha(c: "Caso", ex_id: str):
    return c.pg.locator(f'[data-exercicio-id="{ex_id}"]')


def abrir_exercicio(c: "Caso", ex_id: str) -> None:
    l = linha(c, ex_id)
    if l.get_attribute("data-aberto") != "1":
        l.locator("[data-exercicio-abrir]").click()
        c.esperar(lambda: linha(c, ex_id).get_attribute("data-aberto") == "1", 5)


def pular_descanso(c: "Caso") -> bool:
    if c.tem("[data-descanso-pular]"):
        c.pg.locator("[data-descanso-pular]").click()
        c.pg.wait_for_timeout(250)
        return True
    return False


def ok_na_primeira_serie(c: "Caso", ex_id: str) -> bool:
    abrir_exercicio(c, ex_id)
    oks = linha(c, ex_id).locator("[data-serie-ok]")
    if oks.count() == 0:
        return False
    oks.first.click()
    c.pg.wait_for_timeout(350)
    return True


def fila_pendente(c: "Caso") -> int:
    try:
        return int(c.pg.locator("[data-sync]").first.get_attribute("data-sync-pendentes") or 0) if c.pg.locator("[data-sync]").count() else 0
    except Exception:  # noqa: BLE001
        return -1


def esperar_fila_vazia(c: "Caso", timeout: float = 90) -> bool:
    """Depois de voltar a internet: a fila do PowerSync esvazia (o indicador some)."""
    return c.esperar(lambda: not c.tem("[data-sync]"), timeout, passo=1.0)


# ───────────────────────── servidor (staging) ─────────────────────────

TABELAS_LIMPEZA = [
    ("tb_treino_series", "updated_at"),
    ("tb_treino_concluido", "created_at"),
    ("treino_historico", "created_at"),
    ("exercicio_substituicao_usuario", "created_at"),
    ("exercicio_ordem_usuario", "updated_at"),
    ("tb_exercicio_comentarios", "created_at"),
    ("tb_academia_pesos", "updated_at"),
    ("tb_series_padrao_usuario", "updated_at"),
    ("tb_treino_dia_override", "created_at"),
    ("tb_exercicios_usuario", "created_at"),
]


def limpar_staging(desde: str, motivo: str) -> None:
    """Apaga do STAGING só o que a conta de teste gravou desde `desde` (nada do public; nada anterior ao teste)."""
    assert schema() == "staging", "limpeza só no staging"
    total = 0
    # treinos próprios criados no teste (e os exercícios deles)
    grupos = sql_treino(f"select id from staging.tb_grupos_treino_usuario where user_id = '{USER_TESTE}' and created_at >= '{desde}'")
    if grupos:
        ids = ",".join(f"'{g['id']}'" for g in grupos)
        sql_treino(f"delete from staging.tb_grupos_exercicios_usuario where grupo_usuario_id in ({ids})")
        sql_treino(f"delete from staging.tb_grupos_treino_usuario where id in ({ids})")
        total += len(grupos)
    for tabela, col in TABELAS_LIMPEZA:
        r = sql_treino(f"with d as (delete from staging.{tabela} where user_id = '{USER_TESTE}' and {col} >= '{desde}' returning 1) select count(*)::int n from d")
        total += int(r[0]["n"]) if r else 0
    print(f"   limpeza do staging ({motivo}): {total} linhas da conta de teste", flush=True)


def preparar_staging() -> None:
    """Antes do caso: tira do STAGING o que a conta de teste tem de HOJE EM DIANTE (séries, concluídos, trocas do dia, histórico)
    deixado por testes anteriores. O aparelho não enxerga essas linhas (o PowerSync do staging lê o public — P20): uma série
    nova no mesmo exercício/dia/nº bateria na chave única do servidor e o connector descartaria o envio. Nada do public."""
    assert schema() == "staging"
    d = hoje().isoformat()
    for q in (
        f"delete from staging.tb_treino_series where user_id = '{USER_TESTE}' and data_treino >= '{d}'",
        f"delete from staging.tb_treino_concluido where user_id = '{USER_TESTE}' and data_treino >= '{d}'",
        f"delete from staging.tb_treino_dia_override where user_id = '{USER_TESTE}' and data_treino >= '{d}'",
        f"delete from staging.exercicio_substituicao_usuario where user_id = '{USER_TESTE}' and (data_treino >= '{d}' or data_treino is null)",
        f"delete from staging.treino_historico where user_id = '{USER_TESTE}' and iniciado_em >= '{d}'",
        f"delete from staging.exercicio_ordem_usuario where user_id = '{USER_TESTE}' and updated_at >= '{d}'",
    ):
        sql_treino(q)


def conta_staging(tabela: str, desde: str, col: str = "created_at", extra: str = "") -> int:
    r = sql_treino(f"select count(*)::int n from staging.{tabela} where user_id = '{USER_TESTE}' and {col} >= '{desde}' {extra}")
    return int(r[0]["n"]) if r else 0


def esperar_staging(pred, timeout: float = 90, passo: float = 3) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pred():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(passo)
    return False


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


# ───────────────────────── painel (smokes das telas do profissional) ─────────────────────────

ADMIN_TREINO = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"  # admin.teste.claude no Banco do Treino (profissional E aluno de si mesmo)


def abrir_painel(nav, base: str, prefixo: str, nome: str, rota: str, desktop: bool = True) -> "Caso":
    """O profissional de teste (admin.teste.claude, master só no staging) entra como o app de hoje: sessão do principal
    injetada + troca de token; depois abre a rota (as antigas /admin?… redirecionam para o painel novo)."""
    c = Caso(nav, base, prefixo, nome, desktop=desktop)
    c.entrar("master", rota, zerar=True)
    c.fechar_avisos()
    return c
