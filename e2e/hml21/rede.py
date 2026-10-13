#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — a REDE de cada tela da casca e do app do aluno, no navegador (Edge, celular
390 × 844), antes × depois, na MESMA planilha (hml21/medicao/rede_hml21a.tsv). Spec hml-21 §4 (rede.py) e §1.2; contrato da 21a,
decisões H, K, M e N.

Com a aluna de TESTE (w5p-aluna), a rodada abre o Início (goto: a carga fria), o sino (o clique, com os não lidos da massa) e o sino de novo
(sem não lidos), o Perfil, a Conta, a Agenda e o Meu plano (pela navegação do app; o Meu plano lê o meu_plano_app de qualquer aluno — a aluna
tem profissional: a página "com-profissional"; o print do aluno sem profissional é o telas.py) e a guarda que CONTA (_base.contar_area)
separa, em cada tela:
  · as chamadas DIRETAS da área (--area casca: GET/PATCH em avisos, as RPCs minha_situacao/marcar_aviso_mudanca/minha_senha_definida/
    push_registrar/push_esquecer/aceitar_no_acesso/criar_minha_conta; --area app: o profiles, as RPCs meu_perfil_aluno/minha_agenda/
    minha_agenda_lista/meu_plano_app/pratos_prontos_do_app/mudar_objetivo_app/entrar_sem_profissional e o Storage fotos-perfil(-staging),
    menos o PUT no link que o servidor assinou e o GET da imagem pública);
  · o `ler` da conta (com as consultas de cada um) e as ações da conta;
  · à parte (não é falha): as da OUTRA área da 21a e as de fora da 21a (a Agenda do aluno — 21b; os treinos prontos — 21d; o desvio 23);
  · as gravações ao abrir (a regra da Guarda dos E2E, com o corpo).
Depois da 21a (--base local, e o staging depois do push): 0 chamada direta da área em todas as telas; no máximo 1 `ler` por tela (2 no Início:
a casca e os cards podem pedir em voltas diferentes — a linha SÉRIE avisa; o ## TEMPO é da sessão/agente); 0 gravação ao abrir — e o sino
(decisão M): abrir com não lidos = 1 ação avisos_marcar_lidos e 0 PATCH/GET em avisos (o `ler` que relê a lista depois de marcar: ≤ 1).
Antes (--base staging com o código antigo, o 3e52fbd): as leituras iam direto (a linha de base da mesma planilha).
A massa (--area casca, fora da produção): os avisos não lidos da aluna pelos caminhos do app, com a marca, apagados no fim (o Estado; o
--limpar do api.py). Produção (--base prod, decisão N): SÓ abre as telas com a Guarda (hml17 + as 6 RPCs de leitura do front antigo) — 0
gravação tentada; o sino NÃO é clicado (abrir com não lidos grava o lido_em); sem massa.
No fim, o logout (scope=local) da sessão do TREINO que a troca do app abriu neste navegador (decisão 23 da hml-20).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "rede.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml21/rede.py --area casca|app --base local|staging|prod --canal msedge [--seco]
  --seco  sem rede e sem navegador: os seletores e as rotas existem no código; a guarda acerta pedidos de exemplo (antes e depois, as duas
          áreas); a Guarda da produção deixa passar as leituras (o `ler` da conta e as 6 RPCs do front antigo) e barra o resto
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
PLANILHA = B.MEDICAO / "rede_hml21a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "area", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "acoes", "outra_area", "fora",
             "gravacoes", "pedidos", "t_pronto_s"]
# a tela, a rota (None = o clique no sino) e o que diz que ela abriu (o --seco confere cada seletor no código)
SINO_ABERTO = "[data-sino-lista] [data-aviso], [data-sino-vazio]"
TELAS = (
    ("inicio", "/", "[data-aba-inicio]"),
    ("sino", None, SINO_ABERTO),
    ("sino_vazio", None, SINO_ABERTO),
    ("perfil", "/perfil", "[data-aba-perfil]"),
    ("conta", "/perfil/conta", "[data-pagina-conta]"),
    ("agenda", "/perfil/agenda", "[data-pagina-agenda]"),
    ("meu_plano", "/perfil/meu-plano", "[data-pagina-meu-plano]"),
)
DO_SINO = {"sino", "sino_vazio"}
SELETORES = {
    "src/app-aluno/abas/Inicio.tsx": ["data-aba-inicio", "<Sino"],
    "src/app-aluno/abas/Perfil.tsx": ["data-aba-perfil", '"/perfil/conta"', '"/perfil/agenda"'],
    "src/app-aluno/perfil/Conta.tsx": ["data-pagina-conta"],
    "src/app-aluno/perfil/Agenda.tsx": ["data-pagina-agenda"],
    "src/app-aluno/perfil/MeuPlano.tsx": ["data-pagina-meu-plano"],
    "src/app-aluno/sozinho/pecas/GrupoDoApp.tsx": ['"/perfil/meu-plano"'],
    "src/ui/premium/Sino.tsx": ["data-sino", "data-sino-lista", "data-sino-vazio", "data-aviso", "`Avisos (${naoLidos} novos)`", "marcarLidos()"],
}
# depois: o teto de `ler` por tela (o Início pode ter a casca e os cards em 2 voltas; o sino relê a lista depois de marcar)
TETO_LER = {"inicio": 2, "sino": 1, "sino_vazio": 1, "perfil": 1, "conta": 1, "agenda": 1, "meu_plano": 1}
# as telas onde o ANTES SEMPRE lê direto da área (a carga fria do Início: o sino, o card do aluno e a agenda): a linha de base confere que o
# código antigo lia direto. Nas outras telas o antes depende do cache do React Query na mesma navegação (a 1ª rodada antes, 13/10 00:00: o
# Perfil sem nenhuma — a agenda do Início ainda fresca — e a Conta com a minha_agenda): só anotado na planilha
ANTES_DIRETO = {"casca": {"inicio"}, "app": {"inicio"}}
NAO_LIDOS = re.compile(r"\((\d+) novos?\)")


def telas_da_rodada(area: str, base: str) -> list[tuple[str, str | None, str]]:
    """O app da aluna inteiro nas 2 áreas; o sino só na casca (é dela) e nunca na produção (abrir com não lidos grava — decisão N)."""
    return [x for x in TELAS if x[0] not in DO_SINO or (area == "casca" and base != "prod")]


def nao_lidos(t) -> int:
    """Os não lidos que o sino mostra (o rótulo do botão: "Avisos (N novos)")."""
    rotulo = (t.attr("[data-sino]", "aria-label") or [""])[0] or ""
    m = NAO_LIDOS.search(rotulo)
    return int(m.group(1)) if m else 0


def abrir_sino(t) -> None:
    """Fecha o sino se estiver aberto (Escape), zera os pedidos e clica no sino (o Popover abre e, com não lidos, marca)."""
    if t.n("[data-sino-lista]"):
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(400)
    t.zerar_pedidos()
    t.clicar("[data-sino]")


def conferir(o, base: str, fase: str, area: str, tela: str, cont: dict, pronta: dict, nl: int) -> None:
    acoes, grav = cont["acoes"], cont["gravacoes"]
    diretas = sum(cont["diretas"].values())
    if tela == "sino" and nl > 0:
        if fase == "depois":
            o.ok(acoes == {"avisos_marcar_lidos": 1} and grav == {"fn:conta(avisos_marcar_lidos)": 1} and diretas == 0,
                 f"[depois] sino aberto com {nl} não lido(s): 1 ação avisos_marcar_lidos e 0 PATCH/GET em avisos (decisão M) — ações {acoes or '—'}, "
                 f"gravações {grav or '—'}, diretas {cont['diretas'] or '—'}")
        else:
            o.ok(any(k.startswith("tab:avisos:PATCH") for k in cont["diretas"]) and not acoes,
                 f"[antes] sino aberto com {nl} não lido(s): o PATCH em avisos ia do navegador ({cont['diretas']})")
    elif tela == "sino":
        o.linha(f"   [{base}] sino: sem não lidos ao abrir (a massa não chegou?) — a decisão M não foi medida nesta abertura")
        o.ok(not grav, f"[{base}] sino sem não lidos: 0 gravação ({grav or '—'})")
    else:
        o.ok(not grav, f"[{base}] {tela}: 0 gravação ao abrir ({grav or '—'})")
    if fase == "antes":
        if tela in ANTES_DIRETO[area]:
            o.ok(diretas >= 1, f"[antes] {tela}: a leitura da área ia direto do navegador ({cont['diretas']})")
        return
    ler = cont["ler"]
    o.ok(diretas == 0, f"[depois] {tela}: 0 chamada direta da área {area} ({cont['diretas'] or '—'})")
    o.ok(ler <= TETO_LER[tela], f"[depois] {tela}: {ler} `ler` (≤ {TETO_LER[tela]}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")
    if ler > 1:
        instantes = [(p.get("t"), ",".join(B.B20.consultas_do_corpo(p.get("corpo")))) for p in pronta["pedidos"] if B.chamada_da_conta(p) == "ler"]
        o.linha(f"SÉRIE {tela}: {ler} `ler` na mesma tela — os instantes (s desde a navegação) e as consultas: {instantes} — o ## TEMPO {tela} "
                "série, se não juntar sem mudar componente")
    if tela != "sino" and acoes:
        o.ok(False, f"[depois] {tela}: nenhuma ação da conta ao abrir ({acoes})")
    if cont["outra_area"] or cont["fora"]:
        o.linha(f"   [{base}] {tela}: à parte — da outra área da 21a {cont['outra_area'] or '—'}; de fora da 21a {cont['fora'] or '—'}")


def anotar(base: str, commit: str, fase: str, area: str, tela: str, cont: dict, pronta: dict) -> None:
    j = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA, CABECALHO, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, tela, sum(cont["diretas"].values()), j(cont["diretas"]), cont["ler"],
        j(cont["consultas"]), j(cont["acoes"]), j(cont["outra_area"]), j(cont["fora"]), j(cont["gravacoes"]), len(pronta["pedidos"]),
        pronta["t_pronto_s"],
    ])


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores e rotas existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    P, T = B.API_P, B.API_T
    uid = "33333333-3333-4333-8333-333333333333"
    rpc = lambda n: {"metodo": "POST", "tipo": "rpc", "nome": n, "url": f"{P}/rest/v1/rpc/{n}", "corpo": "{}"}  # noqa: E731
    tab = lambda n, m="GET", host=P: {"metodo": m, "tipo": "tab", "nome": n, "url": f"{host}/rest/v1/{n}?select=id", "corpo": "" if m == "GET" else "{}"}  # noqa: E731
    fn = lambda corpo: {"metodo": "POST", "tipo": "fn", "nome": "conta", "acao": corpo.get("acao"), "url": f"{P}/functions/v1/conta", "corpo": json.dumps(corpo)}  # noqa: E731
    sto = lambda m, caminho: {"metodo": m, "tipo": "storage", "nome": "objeto", "url": f"{P}/storage/v1/object/{caminho}", "corpo": ""}  # noqa: E731
    antes = [tab("avisos"), tab("avisos"), tab("avisos", "PATCH"), rpc("minha_situacao"), rpc("meu_perfil_aluno"), rpc("minha_agenda"),
             tab("profiles"), sto("POST", f"fotos-perfil-staging/{uid}/foto-1.png"), rpc("minhas_regras_agenda"),
             tab("physiq_treinos_prontos", host=T), sto("GET", f"public/fotos-perfil-staging/{uid}/foto-1.png")]
    c = B.contar_area(antes, "casca")
    o.ok(c["diretas"] == {"tab:avisos:GET": 2, "tab:avisos:PATCH": 1, "rpc:minha_situacao": 1}
         and c["outra_area"] == {"rpc:meu_perfil_aluno": 1, "rpc:minha_agenda": 1, "tab:profiles:GET": 1, "storage:fotos-perfil-staging": 1}
         and c["fora"] == {"rpc:minhas_regras_agenda": 1, "tab:physiq_treinos_prontos": 1} and not c["ler"],
         f"a guarda do ANTES (casca): o sino e a sessão diretos; o app na outra área; a Agenda e o Treino de fora à parte: {c}")
    c = B.contar_area(antes, "app")
    o.ok(c["diretas"] == {"rpc:meu_perfil_aluno": 1, "rpc:minha_agenda": 1, "tab:profiles:GET": 1, "storage:fotos-perfil-staging": 1}
         and c["outra_area"] == {"tab:avisos:GET": 2, "tab:avisos:PATCH": 1, "rpc:minha_situacao": 1}
         and any(k.startswith("rest_") for k in c["gravacoes"]) and "storage_grava" in c["gravacoes"],
         f"a guarda do ANTES (app): as RPCs, o profiles e o upload direto do bucket; as gravações (o PATCH, o upload) achadas: {c['gravacoes']}")
    ler = {"acao": "ler", "itens": [{"q": "avisos"}, {"q": "aviso_membro_removido", "tipo": "membro_removido"}, {"q": "meu_perfil_aluno"},
                                    {"desde": "2026-07-14T00:00:00.000Z", "q": "minha_agenda"}]}
    depois = [fn(ler), fn({"ids": [uid], "acao": "avisos_marcar_lidos"}), fn({"acao": "ler", "itens": [{"q": "avisos"}]}),
              {"metodo": "PUT", "tipo": "storage", "nome": "objeto", "url": f"{P}/storage/v1/object/upload/sign/fotos-perfil-staging/{uid}/foto-1.png?token=t", "corpo": ""},
              sto("GET", f"public/fotos-perfil-staging/{uid}/foto-1.png"), rpc("minhas_regras_agenda"),
              {"metodo": "OPTIONS", "tipo": "fn", "nome": "conta", "acao": None, "url": f"{P}/functions/v1/conta", "corpo": ""},
              {"metodo": "POST", "tipo": "fn", "nome": "pos-login", "acao": None, "url": f"{P}/functions/v1/pos-login", "corpo": "{}"}]
    for area in ("casca", "app"):
        c = B.contar_area(depois, area)
        o.ok(not c["diretas"] and not c["outra_area"] and c["ler"] == 2 and c["acoes"] == {"avisos_marcar_lidos": 1}
             and c["consultas"] == {"avisos": 2, "aviso_membro_removido": 1, "meu_perfil_aluno": 1, "minha_agenda": 1}
             and c["gravacoes"] == {"fn:conta(avisos_marcar_lidos)": 1, "storage_link_assinado": 1} and c["fora"] == {"rpc:minhas_regras_agenda": 1},
             f"a guarda do DEPOIS ({area}): 0 direta (o PUT no link que o servidor assinou e o GET da imagem não contam como diretas — o PUT "
             f"é gravação: só existe trocando a foto), 2 `ler` (as consultas), 1 ação (gravação), a Agenda de fora à parte: {c}")
    disfarce = B.contar_area([fn({"action": "ler", "acao": "avisos_marcar_lidos"}), fn({"acao": "ler", "x": 1})], "casca")
    o.ok(disfarce["acoes"] == {"avisos_marcar_lidos": 1} and disfarce["gravacoes"] == {"fn:conta(avisos_marcar_lidos)": 1} and disfarce["ler"] == 1,
         f"o `ler` disfarçado (action: ler, acao: <ação>) conta como a ação/gravação — o campo é o que a conta lê: {disfarce}")
    # a Guarda da produção (decisão N): o `ler` e as 6 RPCs de leitura do front antigo passam; o resto é barrado
    g = B.guarda_da_w()
    Ped = type("Ped", (), {})

    def pedido(metodo: str, url: str, corpo: dict | None = None):
        x = Ped()
        x.method, x.url, x.post_data = metodo, url, (json.dumps(corpo) if corpo is not None else None)
        return x

    passam = [pedido("POST", f"{P}/functions/v1/conta", ler)] + [pedido("POST", f"{P}/rest/v1/rpc/{n}", {}) for n in sorted(B.RPCS_DE_LEITURA_DA_21A)] \
        + [pedido("GET", f"{P}/rest/v1/avisos?select=id")]
    barram = [pedido("POST", f"{P}/functions/v1/conta", {"ids": [uid], "acao": "avisos_marcar_lidos"}),
              pedido("POST", f"{P}/functions/v1/conta", {"action": "ler", "acao": "perfil_nome"}), pedido("PATCH", f"{P}/rest/v1/avisos?id=eq.{uid}", {}),
              pedido("POST", f"{P}/rest/v1/rpc/push_registrar", {}), pedido("POST", f"{P}/rest/v1/rpc/marcar_aviso_mudanca", {}),
              pedido("POST", f"{P}/storage/v1/object/fotos-perfil/{uid}/foto-1.png", None)]
    o.ok(not any(g.escrita(x) for x in passam) and all(g.escrita(x) for x in barram),
         f"a Guarda da produção: passam o `ler` da conta e as 6 RPCs de leitura do front antigo ({len(passam)}); barram as ações da conta, o "
         f"`ler` disfarçado, o PATCH no sino, as RPCs que gravam e o upload direto ({len(barram)})")
    o.ok(not B.B17.Guarda().leitura & B.RPCS_DE_LEITURA_DA_21A,
         "a lista da Guarda do repo (o repeticao.ts) já não tem as 6 (saíram do front na 21a) — só a guarda_da_w() as soma (o front antigo)")
    o.ok([x[0] for x in telas_da_rodada("casca", "prod")] == ["inicio", "perfil", "conta", "agenda", "meu_plano"]
         and [x[0] for x in telas_da_rodada("app", "staging")] == ["inicio", "perfil", "conta", "agenda", "meu_plano"]
         and [x[0] for x in telas_da_rodada("casca", "local")] == [t for t, _r, _m in TELAS] and set(TETO_LER) == {t for t, _r, _m in TELAS},
         "a produção nunca clica no sino (decisão N); o sino só na casca; cada tela tem o teto de `ler` do depois")
    fonte = Path(__file__).read_text(encoding="utf-8")
    o.ok('if base == "prod":\n                t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)' in fonte and "class LegalDesligado(B19.LegalDesligado)" in
         (B.REPO / "e2e" / "hml21" / "_base.py").read_text(encoding="utf-8"),
         "a produção abre sem a marca local de aviso visto (o 🟡1) e o LegalDesligado da 21a cobre a situação pelo `ler` da conta")
    o.ok(NAO_LIDOS.search("Avisos (2 novos)").group(1) == "2" and NAO_LIDOS.search("Avisos (1 novos)") and not NAO_LIDOS.search("Avisos"),
         "os não lidos saem do rótulo do sino (\"Avisos (N novos)\")")
    o.ok(B.fase_do_codigo("local", "x") == "depois" and B.fase_do_codigo("staging", "53f2583") == "antes" and B.fase_do_codigo("staging", "HEAD") == "depois",
         "antes × depois vem do CÓDIGO medido (o 53f2583 não tem src/conta/ler.ts: antes; o HEAD tem: depois)")


def rodar(o, area: str, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    L = B.Sessoes(f"rede21 {area} {base}")  # na produção o motivo termina em "prod" (o registro: fora do teto do staging)
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    massa = area == "casca" and base != "prod"
    estado = None
    try:
        B.exigir_saude(o, f"o rede.py --area {area} da hml-21a")
        if massa:
            B.guardar_sino(o, s)  # os não lidos de ANTES da etapa 2 (abrir o sino marca todos): voltam no api.py --devolver-sino
            estado = B.abrir_rodada(o, s)
            B.criar_massa_avisos(o, estado, L, s, L.uid(B.ALUNA), estado.d["rodada"])
        guarda = B.guarda_da_w() if base == "prod" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml21_{base}", f"rede_{area}", desktop=False, guarda=guarda)
            if base == "prod":
                t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)  # o 🟡1: sem a marca local de aviso visto (a sessão gravaria sozinha)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase} · área {area}")
                for i, (tela, rota, marca) in enumerate(telas_da_rodada(area, base)):
                    nl = 0
                    if i == 0:
                        t.entrar(L, B.ALUNA, rota)  # a sessão antes do 1º documento; o aceite e o "mudou" saem pelo LegalDesligado
                    elif rota is None:
                        o.ok(t.esperar(lambda: t.n("[data-sino]") > 0, 20), f"[{base}] o sino está no Início", parar=True)
                        if tela == "sino":
                            t.esperar(lambda: nao_lidos(t) > 0, 15)  # a lista do sino chegou (com a massa: os não lidos)
                        nl = nao_lidos(t)
                        abrir_sino(t)
                    else:
                        if t.n("[data-sino-lista]"):
                            t.pg.keyboard.press("Escape")
                            t.pg.wait_for_timeout(400)
                        B.navegar(t, rota)
                    pronta = B.esperar_pronto(t, pend, marca=marca, max_s=40 if i == 0 else B.MAX_S)
                    o.ok(t.n(marca) > 0, f"[{base}] {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)")
                    cont = B.contar_area(pronta["pedidos"], area)
                    conferir(o, base, fase, area, tela, cont, pronta, nl)
                    anotar(base, commit, fase, area, tela, cont, pronta)
                if guarda:
                    o.ok(not guarda.bloqueadas, f"[prod] a Guarda não barrou nada (as telas só leram; o `ler` passa): {guarda.bloqueadas or '—'}")
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] rede {area}", t)
                L.do_navegador(B.ALUNA, t.pg)
                t.fim()
                nav.close()
    finally:
        try:
            if estado is not None:
                B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a — a rede das telas (antes × depois): a casca e o app do aluno")
    ap.add_argument("--area", required=True, choices=("casca", "app"))
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    if a.seco:
        o = C.Saida(f"rede21_{a.area}_seco")
        seco(o)
        return o.fim()
    o = C.Saida(f"rede21_{a.area}_{a.base}")
    try:
        rodar(o, a.area, a.base, a.canal)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
