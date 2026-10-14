#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — as TELAS da casca e do app do aluno (Edge, celular 390 × 844): os prints a_* da
spec §5 e o tempo de cada tela antes × depois (contrato da 21a, decisões I e K), com a aluna de TESTE (w5p-aluna) e, no Meu plano, o aluno
sem profissional (w7b-sozinho) SE existir no staging (SQL só leitura, só contagem; senão a página da aluna — "com-profissional" —, anotado).
Só local e staging (a produção é o F8 da sessão principal: w07/smoke_prod.py telas + rede.py --base prod).
Prints (prints/hml21/a/<prefixo ou base>_<caso>.png + a cópia de 900 px para conferir — tela certa, sem login nem "carregando"):
  --area casca
  a_inicio        o Início (o sino com os não lidos da massa)
  a_sino_aberto   o sino aberto com os não lidos (abrir marca: 1 ação avisos_marcar_lidos depois; antes, o PATCH direto)
  a_sino_vazio    o sino aberto de novo, sem não lidos
  a_erro          o Início recarregado com a conta barrada (depois) / com as leituras diretas da área barradas (antes, o código antigo): o
                  sino sem aviso e o card da consulta com o aviso fixo — "só o texto muda"
  --area app
  a_perfil        o Perfil
  a_conta         a Conta
  a_conta_foto    a Conta depois de trocar a foto por uma de TESTE (um PNG gerado aqui, nunca foto real) PELA TELA: depois, o link que o
                  servidor assina (perfil_foto_preparar → PUT → perfil_foto_salvar; 0 upload direto; a anterior da pasta sai do bucket);
                  a foto de antes volta no fim (a cópia guardada; o caminho muda — anotado) ou sai, se ela não tinha
  a_agenda        a Agenda do aluno
  a_meu_plano     o Meu plano (o w7b-sozinho, se existir no staging; senão a aluna)
Tempo (decisão K, a regra do "pronto" da hml-20 — sem esqueleto/"carregando" e sem pedido pendente, quieto 3 s): cada tela aberta 3 vezes
pela navegação do app (aquecido), a mediana ≤ antes + 0,3 s — casca: o sino aberto (do clique até a lista na tela); app: o Início (o card
da próxima consulta com o dado), o Perfil, a Conta, a Agenda e o Meu plano. O antes = a última rodada do staging com o código antigo nesta
planilha (hml21/medicao/telas_hml21a.tsv); sem ela, o da spec (hml21/medicao/rede_por_tela.tsv). Piorou mais de 0,3 s → a linha "TEMPO
<tela> <antes> × <depois>" (o ## TEMPO do progresso; a decisão é da sessão principal).
A massa (casca) e a foto (app): o Estado (hml19/agente/e2e_estado.json) — desfeitas no fim (o finally; o --limpar do api.py depois de um
corte). No fim, o logout (scope=local) da sessão do TREINO que a troca do app abriu (decisão 23 da hml-20).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "telas.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml21/telas.py --area casca|app --base local|staging --canal msedge [--casos prints,tempo] [--prefixo antes_staging] [--seco]
hml-21b (contrato da 21b, decisões I e K): --area agenda|alunos [--casos prints,tempo,fluxo] — conta por conta (e2e/hml21/painel21b.py), os
prints b_* em prints/hml21/b (a nutri: b_agenda_semana, b_agenda_mes, b_agenda_dialogos_novo/_regras/_travas, b_erro — a Agenda com a conta
barrada —, b_alunos, b_dashboard, b_busca; o dono: os _personal; a aluna: b_agenda_aluno), o tempo de cada tela (3 aberturas aquecidas, ≤ o
antes + 0,3 s; o antes = a rodada do staging com o código antigo em hml21/medicao/telas_hml21b.tsv, senão o da spec) e o FLUXO PELA TELA na
Agenda da nutri (a massa de TESTE com a marca: o calendário, a consulta sem aluno — criar/editar/excluir —, a trava, o bloqueio e a tag;
cada gravação = 1 ação da conta e 0 escrita direta; o calendário sai pela RPC nova) — a massa limpa no fim (o Estado, a chave hml21b).
hml-21d (contrato da 21d, decisões I e K): --area treinos [--casos prints,tempo] [--gate] — conta por conta (e2e/hml21/treinos21d.py), os
prints d_* em prints/hml21/d (o personal: d_treinos, d_detalhe, d_biblioteca, d_folha, d_modelos_treinos, d_busca, d_editor e d_erro — Meus
treinos com a treinos barrada; o aluno sem profissional: d_treinos_prontos_aluno), o tempo de cada tela (3 aberturas aquecidas, ≤ o antes +
0,3 s; o antes = a rodada do staging com o código antigo em hml21/medicao/telas_hml21d.tsv, senão o da spec) e o GATE (--gate, no FIM da
etapa 2, um por vez): Meus treinos e os Treinos prontos do aluno, 10 aberturas cada (5 com a treinos ociosa — ≥ 10 min sem pedido, o
critério da medição logs_borda — e 5 quente) × as 5 do antes (o staging servindo a main), registradas à parte (hml21/medicao/gate_hml21d.tsv).
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import painel21b as P21  # noqa: E402  (hml-21b: as contas, as telas e a massa da Agenda e dos Alunos)
import rede as R  # noqa: E402
import painel21c as P21C  # noqa: E402  (hml-21c: as contas, o aluno de teste, as telas e a ociosa)
import treinos21d as T21  # noqa: E402  (hml-21d: as contas, as telas e o gate do Treino)

C = B.C
PLANILHA = B.MEDICAO / "telas_hml21a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "area", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
PRINTS = {"casca": ("a_inicio", "a_sino_aberto", "a_sino_vazio", "a_erro"),
          "app": ("a_perfil", "a_conta", "a_conta_foto", "a_agenda", "a_meu_plano")}
CASOS = ("prints", "tempo")
FOLGA_S = 0.3        # decisão K: cada tela ≤ antes + 0,3 s
ABERTURAS_TEMPO = 3
DADOS_CONSULTA = '[data-card-consulta="proxima"], [data-card-consulta="vazia"]'
# (medida, rota, marca, o valor: "marca" = o 1º instante do dado na tela; "pronto" = a regra do pronto)
TEMPOS = {
    "casca": (("sino", None, R.SINO_ABERTO, "marca"),),
    "app": (("inicio", "/", DADOS_CONSULTA, "marca"), ("perfil", "/perfil", "[data-aba-perfil]", "pronto"),
            ("conta", "/perfil/conta", "[data-pagina-conta]", "pronto"), ("agenda", "/perfil/agenda", "[data-pagina-agenda]", "pronto"),
            ("meu_plano", "/perfil/meu-plano", "[data-pagina-meu-plano]", "pronto")),
}
# o antes da spec (rede_por_tela.tsv, a w5p-aluna): a rota de cada medida (o Início e o sino não ficaram "prontos" lá: só a rodada antes)
ROTA_DA_SPEC = {"perfil": "/perfil", "conta": "/perfil/conta", "agenda": "/perfil/agenda"}
SELETORES = {
    "src/app-aluno/inicio/CardProximaConsulta.tsx": ['data-card-consulta="proxima"', 'data-card-consulta="vazia"', 'data-card-consulta={!online ? "sem-internet" : "erro"}'],
    "src/app-aluno/perfil/Conta.tsx": ["data-conta-foto-arquivo", "data-pagina-conta", "Foto trocada.", 'accept="image/jpeg,image/png,image/webp"'],
    "src/app-aluno/perfil/MeuPlano.tsx": ['data-pagina-meu-plano={m ? "app" : d?.com_profissional ? "com-profissional" : "sem-plano"}'],
    "src/ui/premium/Sino.tsx": ["data-sino-vazio", "data-sino-lista"],
}
# a_erro: depois, a função conta barrada; antes (o código antigo), as leituras DIRETAS da área no Início (o sino, o card e a sessão)
BARRA_DEPOIS = re.compile(r"https://api-principal\.physiqcalc\.com\.br/functions/v1/conta(\?|$)")
BARRA_ANTES = re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/(avisos|rpc/(meu_perfil_aluno|minha_agenda|minha_situacao))(\?|$)")
PUT_DO_LINK = re.compile(r"^/storage/v1/object/upload/sign/(fotos-perfil(?:-staging)?)/([0-9a-f-]{36}/[A-Za-z0-9._-]{1,200})$")
UPLOAD_DIRETO = re.compile(r"^/storage/v1/object/(fotos-perfil(?:-staging)?)/([0-9a-f-]{36}/[A-Za-z0-9._-]{1,200})$")


def referencia(medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha; sem ela, o número da spec."""
    if PLANILHA.exists():
        linhas = PLANILHA.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    nome = medida.split(":", 1)[-1]
    return B.antes_da_spec().get(ROTA_DA_SPEC.get(nome, "?"))


def anotar(base: str, commit: str, fase: str, area: str, medida: str, valores: list, mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA, CABECALHO, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, medida, len(valores),
                                            ",".join(str(v) for v in valores), mediana, ref, ok])


def abrir(t, pend, rota: str, marca: str, desvio: str) -> dict:
    """Sai para outra tela e volta (a navegação do app: a tela monta de novo) e espera ficar pronta."""
    if t.n("[data-sino-lista]"):
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(400)
    B.navegar(t, desvio)
    t.pg.wait_for_timeout(600)
    B.navegar(t, rota)
    return B.esperar_pronto(t, pend, marca=marca)


def arquivos_de_teste(pedidos: list[dict]) -> tuple[list[tuple[str, str]], int]:
    """Os arquivos que a tela subiu: pelo link assinado (o PUT — depois) e o upload DIRETO no bucket (antes): ([(bucket, caminho)], diretos)."""
    achados: list[tuple[str, str]] = []
    diretos = 0
    for p in pedidos:
        caminho = unquote(urlparse(p.get("url", "")).path)
        m = PUT_DO_LINK.match(caminho) if p.get("metodo") == "PUT" else None
        d = UPLOAD_DIRETO.match(caminho) if p.get("metodo") in ("POST", "PUT") else None
        if m:
            achados.append((m.group(1), m.group(2)))
        elif d:
            achados.append((d.group(1), d.group(2)))
            diretos += 1
    return achados, diretos


# ───────────────────────── os prints ─────────────────────────
def prints_casca(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    pr = lambda caso: B.print_reduzido(t.pg, prefixo or base, caso, o)  # noqa: E731
    ok = t.esperar(lambda: R.nao_lidos(t) > 0, 30)
    o.ok(ok, f"[{base}] a_inicio: o Início com o sino mostrando {R.nao_lidos(t)} não lido(s) (a massa)")
    pr("a_inicio")
    nl = R.nao_lidos(t)
    R.abrir_sino(t)
    r = B.esperar_pronto(t, pend, marca=R.SINO_ABERTO)
    cont = B.contar_area(r["pedidos"], "casca")
    o.ok(t.n("[data-sino-lista] [data-aviso]") >= nl > 0, f"[{base}] a_sino_aberto: a lista com os avisos ({t.n('[data-sino-lista] [data-aviso]')}; "
         f"{nl} não lido(s) ao abrir) — ações {cont['acoes'] or '—'}, diretas {cont['diretas'] or '—'}")
    pr("a_sino_aberto")
    R.abrir_sino(t)
    r = B.esperar_pronto(t, pend, marca=R.SINO_ABERTO)
    cont = B.contar_area(r["pedidos"], "casca")
    o.ok(R.nao_lidos(t) == 0 and not cont["acoes"] and not cont["gravacoes"],
         f"[{base}] a_sino_vazio: aberto de novo, 0 não lido e 0 gravação ({cont['gravacoes'] or '—'})")
    pr("a_sino_vazio")
    t.pg.keyboard.press("Escape")
    # a_erro: o Início RECARREGADO com a conta barrada (depois) ou com as leituras diretas da área barradas (antes)
    barra = BARRA_DEPOIS if fase == "depois" else BARRA_ANTES
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/")
        ok = t.esperar(lambda: t.n('[data-card-consulta="erro"]') > 0, 45)
        o.ok(ok and barrados and R.nao_lidos(t) == 0,
             f"[{base}] a_erro: {'a conta barrada' if fase == 'depois' else 'as leituras diretas da área barradas'} ({len(barrados)} pedido(s)) → o card "
             f"da consulta com o aviso fixo (\"{t.texto('[data-card-consulta]')[:60]}\") e o sino sem aviso")
        pr("a_erro")
    finally:
        t.ctx.unroute(barra)
    t.ir("/")
    t.esperar(lambda: t.n(DADOS_CONSULTA) > 0, 45)


def prints_app(o, t, pend, L, nav, base: str, fase: str, s: str, estado, prefixo: str | None) -> None:
    pr = lambda caso, pg=None: B.print_reduzido(pg or t.pg, prefixo or base, caso, o)  # noqa: E731
    r = abrir(t, pend, "/perfil", "[data-aba-perfil]", "/")
    o.ok(t.n("[data-aba-perfil]") > 0 and t.n("[data-perfil-agenda-valor]") > 0, f"[{base}] a_perfil: o Perfil (pronto em {r['t_pronto_s']} s)")
    pr("a_perfil")
    r = abrir(t, pend, "/perfil/conta", "[data-pagina-conta]", "/perfil")
    o.ok(t.n("[data-conta-foto-arquivo]") > 0 and t.n("[data-conta-nome]") > 0, f"[{base}] a_conta: a Conta com os dados (pronta em {r['t_pronto_s']} s)")
    pr("a_conta")
    # a_conta_foto: trocar a foto PELA TELA (o PNG de teste) — a aluna sem foto (no fim, perfil_foto_tirar) ou com uma da pasta dela (a
    # cópia volta); PULADO só com uma foto de fora da pasta (⚪5, corrigido 23:53)
    uid = L.uid(B.ALUNA)
    troca, motivo = B.foto_pode_trocar(s, uid)
    if not troca:
        o.linha(f"   PADRÃO (⚪5): [{base}] a_conta_foto PULADO — {motivo}: a aluna tem uma foto de fora da pasta dela (não voltaria exatamente "
                "como estava); a troca pelo link assinado fica no api.py e no Vitest")
    else:
        o.linha(f"   a foto da aluna: {motivo}")
        B.guardar_foto(o, estado, s, uid)
        antes = (estado.d.get("hml21_foto") or {}).get("url")
        t.zerar_pedidos()
        t.pg.set_input_files("[data-conta-foto-arquivo]", files=[{"name": "teste-hml21.png", "mimeType": "image/png", "buffer": B.png_sintetico(48)}])
        ok = t.esperar(lambda: "Foto trocada." in t.texto("body"), 45)
        B.esperar_pronto(t, pend, min_s=2.0)
        subidos, diretos = arquivos_de_teste(t.pedidos)
        for bucket, caminho in subidos:
            estado.objeto(bucket, caminho)  # o arquivo de teste: o limpar_foto confere que não fica no bucket
        agora = B.foto_da_conta(s, uid)
        cont = B.contar_area(t.pedidos, "app")
        if fase == "depois":
            o.ok(ok and diretos == 0 and len(subidos) == 1 and cont["acoes"] == {"perfil_foto_preparar": 1, "perfil_foto_salvar": 1}
                 and not cont["diretas"] and agora and agora != antes and B.caminho_da_url(agora, B.bucket_das_fotos(s), uid) == subidos[0][1],
                 f"[{base}] a_conta_foto: a foto de teste pela tela → o link que o servidor assinou (1 PUT, 0 upload direto; ações {cont['acoes']}) "
                 f"e a URL nova no perfil")
            anterior = B.caminho_da_url(antes, B.bucket_das_fotos(s), uid)
            if anterior:
                o.ok(B.objetos(B.bucket_das_fotos(s), [anterior]) == 0, f"[{base}] a_conta_foto: a foto anterior (da pasta da aluna) saiu do bucket (achado 2)")
        else:
            o.ok(ok and len(subidos) >= 1 and agora != antes,
                 f"[{base}] a_conta_foto (antes): a foto de teste pela tela — upload direto {diretos}, diretas {cont['diretas']}")
        pr("a_conta_foto")
    r = abrir(t, pend, "/perfil/agenda", "[data-pagina-agenda]", "/perfil")
    o.ok(t.n("[data-pagina-agenda]") > 0, f"[{base}] a_agenda: a Agenda do aluno (pronta em {r['t_pronto_s']} s)")
    pr("a_agenda")
    # a_meu_plano: o aluno sem profissional, se existir no staging (decisão I); senão a página da aluna
    n = B.sozinho_no_staging(s)
    if n:
        t2 = B.Tela(nav, B.BASES[base], f"hml21_{base}", "telas_sozinho", desktop=False)
        B.LegalDesligado().instalar(t2.ctx)
        try:
            t2.entrar(L, B.SOZINHO, "/perfil/meu-plano")
            ok = t2.esperar(lambda: t2.n("[data-pagina-meu-plano]") > 0 and not t2.n('[data-estado="carregando"]'), 60)
            estado_pg = (t2.attr("[data-pagina-meu-plano]", "data-pagina-meu-plano") or ["?"])[0]
            o.ok(ok and estado_pg in ("app", "sem-plano"), f"[{base}] a_meu_plano: o Meu plano do aluno SEM profissional (w7b-sozinho: {estado_pg})")
            pr("a_meu_plano", t2.pg)
        finally:
            B.sair_do_treino(o, t2.pg, f"[{base}] telas (w7b-sozinho)", t2, conta=B.SOZINHO)
            L.do_navegador(B.SOZINHO, t2.pg)
            t2.fim()
    else:
        o.linha("   PADRÃO: o w7b-sozinho não existe no staging (SQL só leitura, só contagem) — o a_meu_plano é a página da aluna "
                "(\"com-profissional\"); o Meu plano do aluno sem profissional fica no Vitest + api.py")
        r = abrir(t, pend, "/perfil/meu-plano", "[data-pagina-meu-plano]", "/perfil")
        o.ok(t.n("[data-pagina-meu-plano]") > 0, f"[{base}] a_meu_plano: o Meu plano da aluna ({(t.attr('[data-pagina-meu-plano]', 'data-pagina-meu-plano') or ['?'])[0]})")
        pr("a_meu_plano")


# ───────────────────────── o tempo ─────────────────────────
def caso_tempo(o, t, pend, area: str, base: str, commit: str, fase: str) -> None:
    for medida, rota, marca, valor in TEMPOS[area]:
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            if rota is None:  # o sino: do clique até a lista na tela
                if t.n("[data-sino]") == 0:
                    abrir(t, pend, "/", "[data-aba-inicio]", "/perfil")
                R.abrir_sino(t)
                r = B.esperar_pronto(t, pend, marca=marca)
                t.pg.keyboard.press("Escape")
            else:
                r = abrir(t, pend, rota, marca, "/perfil" if rota == "/" else "/")
            valores.append(r["t_marca_s"] if valor == "marca" else r["t_pronto_s"])
        med = B.mediana(valores)
        chave = f"tempo:{medida}"
        ref = referencia(chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        anotar(base, commit, fase, area, chave, valores, med, ref, ok)
        if fase == "antes":
            o.linha(f"   [antes] {medida}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {medida}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {medida} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(set(PRINTS["casca"]) | set(PRINTS["app"]) == {"a_inicio", "a_sino_aberto", "a_sino_vazio", "a_perfil", "a_conta", "a_conta_foto", "a_agenda",
                                                        "a_meu_plano", "a_erro"}, "os 9 prints a_* da spec §5 (contrato F6)")
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "a", f"a pasta dos prints: {B.PRINTS}")
    o.ok({m for m, *_ in TEMPOS["casca"]} | {m for m, *_ in TEMPOS["app"]} == {"inicio", "sino", "perfil", "conta", "agenda", "meu_plano"}
         and (FOLGA_S, ABERTURAS_TEMPO) == (0.3, 3), "o tempo das 6 telas da decisão K (o Início, o sino aberto, o Perfil, a Conta, a Agenda, o Meu plano): ≤ antes + 0,3 s, 3 aberturas")
    spec = B.antes_da_spec()
    o.ok(spec.get("/perfil") == 0.21 and spec.get("/perfil/conta") == 0.22 and spec.get("/perfil/agenda") == 0.43,
         f"o antes da spec (rede_por_tela.tsv): Perfil {spec.get('/perfil')} s, Conta {spec.get('/perfil/conta')} s, Agenda {spec.get('/perfil/agenda')} s")
    o.ok(B.mediana([1.0, None, 3.0, 2.0]) == 2.0 and B.mediana([None]) is None, "a mediana ignora a abertura que não ficou pronta")
    P = "https://api-principal.physiqcalc.com.br"
    o.ok(BARRA_DEPOIS.match(f"{P}/functions/v1/conta") and not BARRA_DEPOIS.match(f"{P}/functions/v1/contas")
         and not BARRA_DEPOIS.match(f"{P}/functions/v1/nutricao") and BARRA_ANTES.match(f"{P}/rest/v1/avisos?select=id")
         and BARRA_ANTES.match(f"{P}/rest/v1/rpc/minha_agenda") and not BARRA_ANTES.match(f"{P}/rest/v1/rpc/minha_dieta")
         and not BARRA_ANTES.match(f"{P}/functions/v1/conta"),
         "o a_erro barra SÓ a área: depois a função conta; antes as leituras diretas do Início (avisos, meu_perfil_aluno, minha_agenda, minha_situacao)")
    uid = "33333333-3333-4333-8333-333333333333"
    peds = [{"metodo": "PUT", "url": f"{P}/storage/v1/object/upload/sign/fotos-perfil-staging/{uid}/foto-1.png?token=x"},
            {"metodo": "POST", "url": f"{P}/storage/v1/object/fotos-perfil-staging/{uid}/foto-2.png"},
            {"metodo": "GET", "url": f"{P}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-3.png"},
            {"metodo": "POST", "url": f"{P}/storage/v1/object/sign/evolucao-staging/{uid}/x.png"}]
    o.ok(arquivos_de_teste(peds) == ([("fotos-perfil-staging", f"{uid}/foto-1.png"), ("fotos-perfil-staging", f"{uid}/foto-2.png")], 1),
         "a foto de teste: o arquivo que subiu pelo link assinado (depois) e o upload direto (antes) são achados e anotados para a limpeza")
    o.ok(R.NAO_LIDOS.search("Avisos (5 novos)").group(1) == "5", "os não lidos do sino pelo rótulo (o mesmo do rede.py)")


def rodar(o, area: str, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: w07/smoke_prod.py telas + rede.py --base prod)")
    s = B.usar_base(base)
    L = B.Sessoes(f"telas21 {area} {base}")
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    estado = None
    try:
        B.exigir_saude(o, f"o telas.py --area {area} da hml-21a")
        if "prints" in casos:
            if area == "casca":
                B.guardar_sino(o, s)  # os não lidos de ANTES da etapa 2: voltam no api.py --devolver-sino
            estado = B.abrir_rodada(o, s)
            if area == "casca":
                B.criar_massa_avisos(o, estado, L, s, L.uid(B.ALUNA), estado.d["rodada"])
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml21_{base}", f"telas_{area}", desktop=False)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase} · área {area}")
                t.entrar(L, B.ALUNA, "/")
                o.ok(t.esperar(lambda: t.n("[data-aba-inicio]") > 0, 60), f"[{base}] o app da aluna de teste abriu no Início", parar=True)
                if "prints" in casos:
                    if area == "casca":
                        prints_casca(o, t, pend, base, fase, prefixo)
                    else:
                        prints_app(o, t, pend, L, nav, base, fase, s, estado, prefixo)
                if "tempo" in casos:
                    caso_tempo(o, t, pend, area, base, commit, fase)
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] telas {area}", t)
                L.do_navegador(B.ALUNA, t.pg)
                t.fim()
                nav.close()
    finally:
        try:
            if estado is not None:
                B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


# ───────────────────────── hml-21b: as telas da Agenda e dos Alunos (--area agenda|alunos) ─────────────────────────
PLANILHA_21B = B.MEDICAO / "telas_hml21b.tsv"
CAB_21B = ["quando", "base", "commit", "fase", "area", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
CASOS_21B = ("prints", "tempo", "fluxo")
# os prints b_* (contrato da 21b, F5): a nutri — a Agenda semana/mês, os 3 diálogos, os Alunos, o Dashboard, a Busca e o erro; o dono — a
# Agenda (com a equipe) e o Dashboard; a aluna — a Agenda dela
PRINTS_21B = {
    "agenda": {P21.NUTRI: ("b_agenda_semana", "b_agenda_mes", "b_agenda_dialogos_novo", "b_agenda_dialogos_regras", "b_agenda_dialogos_travas", "b_erro"),
               P21.PERSONAL: ("b_agenda_semana_personal",), P21.ALUNA: ("b_agenda_aluno",)},
    "alunos": {P21.NUTRI: ("b_alunos", "b_dashboard", "b_busca"), P21.PERSONAL: ("b_alunos_personal", "b_dashboard_personal")},
}
CASO_DA_TELA = {"agenda_semana": "b_agenda_semana", "agenda_mes": "b_agenda_mes", "agenda_novo": "b_agenda_dialogos_novo",
                "agenda_regras": "b_agenda_dialogos_regras", "agenda_travas": "b_agenda_dialogos_travas", "agenda_aluno": "b_agenda_aluno",
                "alunos": "b_alunos", "dashboard": "b_dashboard", "busca": "b_busca"}
# b_erro: depois, a função conta barrada; antes (o código antigo), as leituras DIRETAS da Agenda (os calendários e as consultas)
BARRA_ANTES_21B = re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/(calendarios|agendamentos)(\?|$)")
ERRO_DA_AGENDA = '[data-pagina-agenda-painel] [data-estado="erro"]'
# o fluxo PELA TELA (spec §5: criar/editar/excluir a consulta e o calendário de teste pela função; e a tag, a trava e o bloqueio): cada
# gravação = 1 ação da conta e 0 escrita direta (depois); antes, a escrita direta (a referência)
ACOES_DO_FLUXO = ("calendario_criar", "agendamento_criar", "agendamento_editar", "trava_criar", "trava_excluir", "bloqueio_criar", "bloqueio_excluir",
                  "tag_criar", "tag_excluir", "agendamento_excluir", "calendario_excluir")


def referencia_21b(conta: str, medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha (a mesma conta); sem ela, o da spec."""
    if PLANILHA_21B.exists():
        linhas = PLANILHA_21B.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    return P21.antes_da_spec(conta).get(P21.ROTA_DA_SPEC.get(medida.split(":", 1)[-1], "?"))


def tempo_21b(o, t, pend, base: str, commit: str, fase: str, area: str, conta: str, telas: list[tuple]) -> None:
    """Decisão K: cada tela 3 vezes pela navegação do app (aquecido: a tela já foi aberta), a mediana do "pronto" ≤ o antes + 0,3 s."""
    for tela in telas:
        nome = tela[0]
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            if tela[1][0] == "rota":
                P21.fechar_janelas(t)
                B.navegar(t, P21.ENTRADA_APP if P21.eh_do_app(conta) else P21.ENTRADA_PAINEL)
                t.pg.wait_for_timeout(600)
            r = P21.abrir_tela(t, pend, tela)
            valores.append(r["t_pronto_s"])
        P21.fechar_janelas(t)
        med = B.mediana(valores)
        chave = f"tempo:{nome}"
        ref = referencia_21b(conta, chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        B.anotar_planilha(PLANILHA_21B, CAB_21B, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, conta, chave, len(valores),
                                                 ",".join(str(v) for v in valores), med, ref, ok])
        if fase == "antes":
            o.linha(f"   [antes] {conta} · {nome}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {conta} · {nome}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {nome} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def print_erro_21b(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    """b_erro: a Agenda RECARREGADA com a conta barrada (depois) / com as leituras diretas dos calendários e das consultas barradas (antes):
    o aviso de erro da Agenda ("Não deu para carregar a agenda"), nunca a agenda vazia."""
    barra = BARRA_DEPOIS if fase == "depois" else BARRA_ANTES_21B
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/painel/agenda?visao=semana")
        ok = t.esperar(lambda: t.n(ERRO_DA_AGENDA) > 0, 60)
        o.ok(ok and bool(barrados), f"[{base}] b_erro: {'a conta barrada' if fase == 'depois' else 'as leituras diretas da Agenda barradas'} "
             f"({len(barrados)} pedido(s)) → o aviso de erro da Agenda (\"{t.texto(ERRO_DA_AGENDA)[:60]}\")")
        B.print_reduzido(t.pg, prefixo or base, "b_erro", o)
    finally:
        t.ctx.unroute(barra)
    t.ir("/painel/agenda?visao=semana")
    t.esperar(lambda: t.n(P21.SEMANA[2]) > 0, 60)
    B.esperar_pronto(t, pend, max_s=40)


class Fluxo:
    """O fluxo PELA TELA na Agenda da nutri (a massa de TESTE com a marca; os ids no Estado na hora, achados por SQL só leitura): cada
    gravação conferida pela rede — depois, 1 ação da conta e 0 escrita direta; antes, a escrita direta (a referência)."""

    def __init__(self, o, t, pend, base: str, fase: str, s: str, estado, uid: str, rodada: str, prefixo: str | None) -> None:
        self.o, self.t, self.pend, self.base, self.fase, self.s, self.estado, self.uid = o, t, pend, base, fase, s, estado, uid
        self.marca, self.prefixo = P21.marca(rodada), prefixo

    def assentar(self, seletor: str, timeout: float = 15) -> bool:
        """Espera a janela aparecer E assentar: os diálogos zeram o formulário num useEffect ao abrir (depois da pintura — o
        AgendamentoDialog.tsx:124 faz o setConfirmarExclusao(false)); mexer antes disso corre contra o efeito (gente não clica tão rápido)."""
        ok = self.t.esperar(lambda: self.t.n(seletor) > 0, timeout)
        self.t.pg.wait_for_timeout(600)
        return ok

    def gravou(self, acao: str, fazer, pronto, timeout: float = 40) -> bool:
        t = self.t
        t.zerar_pedidos()
        fazer()
        ok = t.esperar(pronto, timeout)
        B.esperar_pronto(t, self.pend, min_s=2.0)
        cont = B.contar_area(t.pedidos, "agenda")
        escrita_direta = {k: v for k, v in cont["diretas"].items() if not k.endswith(":GET") and not k.startswith("rpc:agenda_horarios")}
        if self.fase == "depois":
            return self.o.ok(ok and cont["acoes"].get(acao) == 1 and set(cont["acoes"]) == {acao} and not cont["diretas"]
                             and cont["gravacoes"] == {f"fn:conta({acao})": 1},
                             f"[{self.base}] fluxo {acao} PELA TELA → 1 ação da conta, 0 chamada direta (ações {cont['acoes'] or '—'}; diretas "
                             f"{cont['diretas'] or '—'}; gravações {cont['gravacoes'] or '—'})")
        return self.o.ok(ok, f"[antes] fluxo {acao} PELA TELA → a escrita ia direto do navegador ({escrita_direta or cont['gravacoes'] or '—'})")

    def id_por_sql(self, tabela: str, coluna: str, valor: str, extra: str = "") -> str | None:
        dono = P21.COLUNA_DO_DONO[tabela]
        linhas = B.ler_principal(f"select id::text as id from {self.s}.{tabela} where {dono} = {C.txt(self.uid)} and {coluna} = {C.txt(valor)}{extra} "
                                 f"order by created_at desc limit 1")
        i = (linhas[0] if linhas else {}).get("id")
        if C.eh_uuid(i):
            P21.anotar_linha(self.estado, tabela, i, self.uid)
            return i
        return None

    def rodar(self) -> None:  # noqa: PLR0915
        t, mk = self.t, self.marca
        P21.anotar_dono(self.estado, self.uid)
        # 1. o calendário de teste (CalendarioDialog)
        def criar_cal() -> None:
            t.clicar("[data-btn-novo-calendario]")
            self.assentar('[data-modal-calendario="novo"]')
            t.pg.locator("[data-campo-nome-calendario]").fill(mk)
            t.clicar("[data-btn-salvar-calendario]")
        self.gravou("calendario_criar", criar_cal, lambda: t.n("[data-modal-calendario]") == 0)
        cal = self.id_por_sql("calendarios", "nome", mk, " and deleted_at is null")
        if not self.o.ok(bool(cal), f"[{self.base}] fluxo: o calendário de teste existe (SQL só leitura) — o resto do fluxo depende dele", parar=False):
            return
        t.esperar(lambda: t.n(f'[data-calendario="{cal}"]') > 0, 20)
        # 2. a consulta de teste sem aluno (AgendamentoDialog — "Sem aluno (compromisso avulso)"; o "avisar" só existe com aluno)
        dia = (time.time() + 30 * 86400)
        data = time.strftime("%Y-%m-%d", time.gmtime(dia - 3 * 3600))

        def criar_ag() -> None:
            t.clicar("[data-btn-novo-agendamento]")
            self.assentar('[data-modal-agendamento="novo"]')
            t.pg.locator("[data-campo-titulo]").fill(mk)
            t.pg.locator("[data-campo-data]").fill(data)
            t.pg.locator("[data-campo-calendario]").select_option(cal)
            t.pg.locator("[data-campo-hora]").fill("10:00")
            t.clicar("[data-btn-salvar-agendamento]")
        self.gravou("agendamento_criar", criar_ag, lambda: t.n("[data-modal-agendamento]") == 0)
        ag = self.id_por_sql("agendamentos", "titulo", mk, f" and calendario_id = {C.txt(cal)} and deleted_at is null")
        self.o.ok(bool(ag), f"[{self.base}] fluxo: a consulta de teste existe no calendário de teste (SQL só leitura)")
        if ag:
            B.navegar(t, f"/painel/agenda?visao=semana&data={data}")
            t.esperar(lambda: t.n(f'[data-evento="{ag}"]') > 0, 30)

            def editar_ag() -> None:
                t.clicar(f'[data-evento="{ag}"]')
                self.assentar('[data-modal-agendamento="editar"]')
                t.pg.locator("[data-campo-observacao]").fill(mk)
                t.clicar("[data-btn-salvar-agendamento]")
            self.gravou("agendamento_editar", editar_ag, lambda: t.n("[data-modal-agendamento]") == 0)
        # 3. a trava (recorrente, de madrugada) e o bloqueio (avulso, no dia da consulta de teste) — TravaDialog
        def criar_trava() -> None:
            t.clicar("[data-btn-travar]")
            self.assentar("[data-modal-trava]")
            t.clicar('[data-modo-trava="recorrente"]')
            t.pg.locator("[data-campo-trava-das]").fill("05:00")
            t.pg.locator("[data-campo-trava-as]").fill("05:30")
            t.pg.locator("[data-campo-trava-motivo]").fill(mk)
            t.clicar("[data-btn-salvar-trava]")
        self.gravou("trava_criar", criar_trava, lambda: t.n("[data-modal-trava]") == 0)
        trv = self.id_por_sql("agenda_travas", "motivo", mk)
        if trv:
            self.gravou("trava_excluir", lambda: t.clicar(f'[data-btn-liberar-trava="{trv}"]'), lambda: t.n(f'[data-trava-item="{trv}"]') == 0)

        def criar_bloqueio() -> None:
            t.clicar("[data-btn-travar]")
            self.assentar("[data-modal-trava]")
            t.clicar('[data-modo-trava="avulsa"]')
            t.pg.locator("[data-campo-trava-data]").fill(data)
            t.pg.locator("[data-campo-trava-das]").fill("05:00")
            t.pg.locator("[data-campo-trava-as]").fill("05:30")
            t.pg.locator("[data-campo-trava-motivo]").fill(mk)
            t.clicar("[data-btn-salvar-trava]")
        self.gravou("bloqueio_criar", criar_bloqueio, lambda: t.n("[data-modal-trava]") == 0)
        blq = self.id_por_sql("bloqueios_agenda", "motivo", mk)
        if blq:
            t.esperar(lambda: t.n(f'[data-bloqueio-item="{blq}"]') > 0, 20)
            self.gravou("bloqueio_excluir", lambda: t.clicar(f'[data-btn-excluir-bloqueio="{blq}"]'), lambda: t.n(f'[data-bloqueio-item="{blq}"]') == 0)
        # 4. a tag de teste (TagDialog) e a exclusão dela (a confirmação)
        def criar_tag() -> None:
            t.clicar("[data-btn-nova-tag]")
            self.assentar('[data-modal-tag="nova"]')
            t.pg.locator("[data-campo-nome-tag]").fill(mk[:40])
            t.clicar("[data-btn-salvar-tag]")
        self.gravou("tag_criar", criar_tag, lambda: t.n("[data-modal-tag]") == 0)
        tag = self.id_por_sql("agenda_tags", "nome", mk[:40], " and deleted_at is null")
        if tag:
            t.esperar(lambda: t.n(f'[data-tag-item="{tag}"]') > 0, 20)

            def excluir_tag() -> None:
                t.clicar(f'[data-btn-excluir-tag="{tag}"]')
                self.assentar("[data-btn-confirmar-excluir-tag]")
                t.clicar("[data-btn-confirmar-excluir-tag]")
            self.gravou("tag_excluir", excluir_tag, lambda: t.n(f'[data-tag-item="{tag}"]') == 0)
        # 5. a consulta à Lixeira (o diálogo dela) e o calendário (com a consulta de teste) pela RPC nova, atômica
        if ag:
            B.navegar(t, f"/painel/agenda?visao=semana&data={data}")
            t.esperar(lambda: t.n(f'[data-evento="{ag}"]') > 0, 30)

            def excluir_ag() -> None:
                t.clicar(f'[data-evento="{ag}"]')
                self.assentar("[data-btn-excluir-agendamento]")
                t.clicar("[data-btn-excluir-agendamento]")
                if not self.assentar("[data-btn-confirmar-excluir]", 5):
                    t.clicar("[data-btn-excluir-agendamento]")  # o efeito do diálogo zerou o confirmar: de novo, 1 vez
                    self.assentar("[data-btn-confirmar-excluir]")
                t.clicar("[data-btn-confirmar-excluir]")
            self.gravou("agendamento_excluir", excluir_ag, lambda: t.n(f'[data-evento="{ag}"]') == 0)

        def excluir_cal() -> None:
            t.clicar(f'[data-btn-editar-calendario="{cal}"]')
            self.assentar("[data-btn-excluir-calendario]")
            t.clicar("[data-btn-excluir-calendario]")
            if not self.assentar("[data-btn-confirmar-excluir-calendario]", 5):
                t.clicar("[data-btn-excluir-calendario]")  # idem: 1 vez
                self.assentar("[data-btn-confirmar-excluir-calendario]")
            t.clicar("[data-btn-confirmar-excluir-calendario]")
        self.gravou("calendario_excluir", excluir_cal, lambda: t.n(f'[data-calendario="{cal}"]') == 0)
        vivos = B.ler_principal(f"select (select count(*) from {self.s}.calendarios where id = {C.txt(cal)} and deleted_at is null)::int as cal, "
                                f"(select count(*) from {self.s}.agendamentos where calendario_id = {C.txt(cal)} and deleted_at is null)::int as ags")[0]
        self.o.ok(vivos == {"cal": 0, "ags": 0}, f"[{self.base}] fluxo: o calendário de teste e as consultas dele na Lixeira (SQL só leitura: {vivos}) — "
                  "saem de vez na limpeza")


def rodar_21b(o, area: str, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    """As telas da 21b, conta por conta: os prints b_* (conferir cada um: tela certa, sem login nem "carregando", nomes de teste), o tempo
    (decisão K) e — na nutri, --area agenda — o fluxo PELA TELA (a massa de TESTE, limpa no fim: o Estado + a marca)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: rede.py --base prod)")
    s = B.usar_base(base)
    B.usar_area(area)
    L = B.Sessoes(f"telas21 {area} {base}")
    commit = B.commit_medido(base)
    fase = P21.fase_do_codigo_21b(base, commit)
    estado = None
    try:
        B.exigir_saude(o, f"o telas.py --area {area} da hml-21b")
        o.linha(f"[{base}] {commit}: o {fase} · área {area}")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for conta in P21.contas_da_area(area, base):
                    telas = P21.telas_que_abrem(o, s, base, area, conta)
                    if not telas:
                        continue
                    t, pend = P21.abrir_conta(nav, base, conta, f"telas_{area}_{conta}")
                    try:
                        P21.entrar(o, t, pend, L, base, conta)
                        if "prints" in casos:
                            for tela in telas:
                                nome = tela[0]
                                caso = CASO_DA_TELA[nome] + ("_personal" if conta == P21.PERSONAL else "")
                                r = P21.abrir_tela(t, pend, tela)
                                o.ok(t.n(tela[2]) > 0 and r["t_pronto_s"] is not None,
                                     f"[{base}] {conta} · {caso}: a tela pronta em {r['t_pronto_s']} s ({tela[2]})")
                                B.print_reduzido(t.pg, prefixo or base, caso, o)
                            if area == "agenda" and conta == P21.NUTRI:
                                print_erro_21b(o, t, pend, base, fase, prefixo)
                        if "tempo" in casos:
                            tempo_21b(o, t, pend, base, commit, fase, area, conta, telas)
                        if "fluxo" in casos and area == "agenda" and conta == P21.NUTRI and any(x[0] == "agenda_semana" for x in telas):
                            if estado is None:
                                estado = P21.abrir_rodada_21b(o, s)
                            P21.fechar_janelas(t)
                            B.navegar(t, "/painel/agenda?visao=semana")
                            t.esperar(lambda: t.n(P21.SEMANA[2]) > 0, 60)
                            B.esperar_pronto(t, pend, max_s=40)
                            Fluxo(o, t, pend, base, fase, s, estado, L.uid(conta), estado.d["rodada"], prefixo).rodar()
                    finally:
                        P21.sair_da_conta(o, t, L, base, conta, f"telas {area}")
            finally:
                nav.close()
    finally:
        try:
            if estado is not None:
                P21.fechar_rodada_21b(o, estado, s)
        finally:
            L.fechar(o)


def seco_21b(o, area: str) -> None:
    """O --seco da 21b: os seletores das telas e do fluxo, os prints b_* (na pasta da 21b), as telas do tempo (decisão K), o antes da spec e
    a barra do b_erro."""
    B.usar_area(area)
    faltam = [f"{arq}: {sel}" for arq, sels in P21.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    fluxo = {
        "src/painel/agenda/PainelAgenda.tsx": ["data-btn-novo-calendario", "data-calendario={c.id}", "data-btn-editar-calendario={c.id}", "data-btn-nova-tag",
                                               "data-tag-item={t.id}", "data-btn-excluir-tag={t.id}", "data-trava-item={t.id}", "data-btn-liberar-trava={t.id}",
                                               "data-bloqueio-item={b.id}", "data-btn-excluir-bloqueio={b.id}"],
        "src/painel/agenda/CalendarioDialog.tsx": ['data-modal-calendario={editando ? "editar" : "novo"}', "data-campo-nome-calendario", "data-btn-salvar-calendario",
                                                   "data-btn-excluir-calendario", "data-btn-confirmar-excluir-calendario"],
        "src/painel/agenda/AgendamentoDialog.tsx": ['data-modal-agendamento={editando ? "editar" : "novo"}', "data-campo-titulo", "data-campo-data",
                                                    "data-campo-calendario", "data-campo-hora", "data-campo-observacao", "data-btn-excluir-agendamento",
                                                    "data-btn-confirmar-excluir", "Sem aluno (compromisso avulso)"],
        "src/painel/agenda/TravaDialog.tsx": ["data-modo-trava={m.valor}", "data-campo-trava-das", "data-campo-trava-as", "data-campo-trava-motivo", "data-campo-trava-data"],
        "src/painel/agenda/TagDialog.tsx": ['data-modal-tag={editando ? "editar" : "nova"}', "data-campo-nome-tag"],
        "src/painel/agenda/ChipEvento.tsx": ["data-evento={ev.id}"],
        "src/painel/paginas/Agenda.tsx": ["data-btn-confirmar-excluir-tag", 'titulo="Não deu para carregar a agenda"'],
        "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="erro"'],
    }
    faltam += [f"{arq}: {sel}" for arq, sels in fluxo.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os seletores das telas e do fluxo pela tela existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "b" and B.AREA_ESTADO == "hml21b",
         f"a 21b grava os prints em prints/hml21/b e a rodada na área hml21b ({B.PRINTS})")
    casos = {c for d in PRINTS_21B.values() for v in d.values() for c in v}
    o.ok({"b_agenda_semana", "b_agenda_mes", "b_agenda_dialogos_novo", "b_agenda_dialogos_regras", "b_agenda_dialogos_travas", "b_alunos", "b_dashboard",
          "b_busca", "b_agenda_aluno", "b_erro"} <= casos and set(CASO_DA_TELA) == {x[0] for x in P21.TELAS_DA_AGENDA + P21.TELAS_DOS_ALUNOS + (P21.AGENDA_ALUNO,)},
         "os prints b_* do contrato (a Agenda semana/mês, os 3 diálogos, os Alunos, o Dashboard, a Busca, a Agenda do aluno e o erro) + os do dono")
    spec_n, spec_p, spec_a = P21.antes_da_spec(P21.NUTRI), P21.antes_da_spec(P21.PERSONAL), P21.antes_da_spec(P21.ALUNA)
    o.ok(spec_n.get("/painel/agenda") == 0.48 and spec_p.get("/painel/agenda") == 0.38 and spec_n.get("/painel/alunos") == 0.16
         and spec_a.get("/perfil/agenda") == 0.43 and spec_n.get("/painel") == 0.76,
         f"o antes da spec (rede_por_tela.tsv, aquecido): a Agenda {spec_n.get('/painel/agenda')}/{spec_p.get('/painel/agenda')} s, os Alunos "
         f"{spec_n.get('/painel/alunos')} s, o Dashboard {spec_n.get('/painel')} s, a Agenda do aluno {spec_a.get('/perfil/agenda')} s")
    P = "https://api-principal.physiqcalc.com.br"
    o.ok(BARRA_ANTES_21B.match(f"{P}/rest/v1/calendarios?select=*") and BARRA_ANTES_21B.match(f"{P}/rest/v1/agendamentos?select=*")
         and not BARRA_ANTES_21B.match(f"{P}/rest/v1/calendarios_x") and not BARRA_ANTES_21B.match(f"{P}/functions/v1/conta")
         and BARRA_DEPOIS.match(f"{P}/functions/v1/conta"), "o b_erro barra SÓ a área: depois a função conta; antes as leituras diretas da Agenda")
    do_servidor = B.regras_conta()["agenda"]
    o.ok(set(ACOES_DO_FLUXO) <= set(do_servidor) and len(set(ACOES_DO_FLUXO)) == 11
         and B.B17.funcao_grava("conta", "ler", '{"acao": "ler", "itens": []}') is False,
         f"o fluxo pela tela cobre {len(ACOES_DO_FLUXO)} gravações da Agenda do painel (criar/editar/excluir a consulta e o calendário; a trava, o "
         "bloqueio e a tag) — todas ações da conta no servidor; cada uma = 1 ação e 0 escrita direta (depois)")
    o.ok(CASOS_21B == ("prints", "tempo", "fluxo") and (FOLGA_S, ABERTURAS_TEMPO) == (0.3, 3), "o tempo: 3 aberturas, ≤ antes + 0,3 s (decisão K)")


# ───────────────────────── hml-21d: as telas do Treino (--area treinos) ─────────────────────────
CASOS_21D = ("prints", "tempo")
CAB_21D = ["quando", "base", "commit", "fase", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
# os prints d_* (contrato da 21d, F5): o personal — Meus treinos, o Detalhe, a Biblioteca, a Folha, os Modelos › Treinos, a Busca, o editor e
# o erro (Meus treinos com a treinos barrada); o aluno sem profissional — os Treinos prontos
CASO_DA_TELA_21D = {"meus_treinos": "d_treinos", "detalhe": "d_detalhe", "biblioteca": "d_biblioteca", "folha": "d_folha", "modelos_treinos": "d_modelos_treinos",
                    "busca": "d_busca", "editor": "d_editor", "treinos_prontos_aluno": "d_treinos_prontos_aluno"}
PRINTS_21D = (*CASO_DA_TELA_21D.values(), "d_erro")
# d_erro: depois, a função treinos barrada; antes (o código antigo), as leituras DIRETAS de Meus treinos (a RPC da página e as pastas)
BARRA_DEPOIS_21D = re.compile(r"https://api\.physiqcalc\.com\.br/functions/v1/treinos(\?|$)")
BARRA_ANTES_21D = re.compile(r"https://api\.physiqcalc\.com\.br/rest/v1/(rpc/modelos_da_lista|tb_pastas_treino)(\?|$)")
ERRO_DOS_TREINOS = '[data-pagina-treinos-painel] [data-estado="erro"]'
# o "pai" de cada tela aberta pelo clique (o tempo: a tela de cima de novo, FORA da medida; o clique, DENTRO)
PAI_DO_CLIQUE = {"detalhe": "/painel/treinos?aba=treinos", "folha": "/painel/treinos?aba=biblioteca"}
# o GATE (decisão K): o Painel › Treinos e os Treinos prontos do aluno, 10 aberturas cada — 5 com a treinos OCIOSA (a 1ª depois de ≥ 10 min
# sem nenhum pedido a ela: o MESMO critério da medição hml21/medicao/logs_borda_* — "ociosa = a anterior da mesma função há ≥ 10 min") e 5
# QUENTE (seguidas); o antes = 5 aberturas da tela de hoje (o staging servindo a main), na mesma hora. Passa: o Painel p50 ≤ antes + 0,3 s; os
# Treinos prontos p50 ≤ 2,0 s
OCIOSA_S = 600
ABERTURAS_OCIOSA = 5
ABERTURAS_QUENTE = 5
ABERTURAS_ANTES_GATE = 5
GATE_FOLGA_S = 0.3
GATE_ALUNO_MAX_S = 2.0
TELAS_DO_GATE = ((T21.PERSONAL, T21.MEUS_TREINOS), (T21.SOZINHO, T21.PRONTOS))
FONTE_DO_CRITERIO = B.MEDICAO / "logs_borda_treino_72h.txt"


def referencia_21d(conta: str, medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha (a mesma conta); sem ela, o da spec."""
    if T21.PLANILHA_TELAS.exists():
        linhas = T21.PLANILHA_TELAS.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    return T21.antes_da_spec(conta).get(T21.ROTA_DA_SPEC.get(medida.split(":", 1)[-1], "?"))


def abrir_para_medir(t, pend, tela: tuple, conta: str, s: str) -> dict:
    """Uma abertura aquecida: a entrada (ou a tela de cima, no clique) FORA da medida e a tela pela navegação do app — a medida do "pronto"."""
    nome, (como, _alvo), _marca, _teto = tela
    T21.fechar_janelas(t)
    if como == "clique":
        B.navegar(t, PAI_DO_CLIQUE[nome])
        B.esperar_pronto(t, pend, max_s=40)
    elif como in ("rota", "editor"):
        B.navegar(t, T21.ENTRADA_APP if T21.eh_do_app(conta) else T21.ENTRADA_PAINEL)
        t.pg.wait_for_timeout(600)
    return T21.abrir_tela(t, pend, tela, s)


def tempo_21d(o, t, pend, base: str, commit: str, fase: str, conta: str, telas: list[tuple], s: str) -> None:
    """Decisão K: cada tela 3 vezes pela navegação do app (aquecido: a tela já foi aberta), a mediana do "pronto" ≤ o antes + 0,3 s."""
    for tela in telas:
        nome = tela[0]
        valores = [abrir_para_medir(t, pend, tela, conta, s)["t_pronto_s"] for _ in range(ABERTURAS_TEMPO)]
        T21.fechar_janelas(t)
        med = B.mediana(valores)
        chave = f"tempo:{nome}"
        ref = referencia_21d(conta, chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        B.anotar_planilha(T21.PLANILHA_TELAS, CAB_21D, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, chave, len(valores),
                                                        ",".join(str(v) for v in valores), med, ref, ok])
        if fase == "antes":
            o.linha(f"   [antes] {conta} · {nome}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {conta} · {nome}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {nome} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def print_erro_21d(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    """d_erro: Meus treinos RECARREGADO com a treinos barrada (depois) / com as leituras diretas da página e das pastas barradas (antes): o
    aviso de erro ("Não deu para abrir os treinos"), nunca a lista vazia."""
    barra = BARRA_DEPOIS_21D if fase == "depois" else BARRA_ANTES_21D
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/painel/treinos?aba=treinos")
        ok = t.esperar(lambda: t.n(ERRO_DOS_TREINOS) > 0, 90)
        o.ok(ok and bool(barrados), f"[{base}] d_erro: {'a treinos barrada' if fase == 'depois' else 'as leituras diretas de Meus treinos barradas'} "
             f"({len(barrados)} pedido(s)) → o aviso de erro (\"{t.texto(ERRO_DOS_TREINOS)[:60]}\")")
        B.print_reduzido(t.pg, prefixo or base, "d_erro", o)
    finally:
        t.ctx.unroute(barra)
    t.ir("/painel/treinos?aba=treinos")
    t.esperar(lambda: t.n(T21.MEUS_TREINOS[2]) > 0, 90)
    B.esperar_pronto(t, pend, max_s=40)


def p50(v: list) -> float | None:
    return B.mediana([x for x in v if x is not None])


def referencia_gate(tela: str) -> tuple[float | None, str | None]:
    """O ANTES do gate: o p50 das 5 aberturas da última rodada do staging com o código antigo (a planilha do gate) e QUANDO foi medido (o
    🟡2 da revisão: só vale até 30 min antes do depois)."""
    if not T21.PLANILHA_GATE.exists():
        return None, None
    linhas = T21.PLANILHA_GATE.read_text(encoding="utf-8").splitlines()
    cab = linhas[0].split("\t") if linhas else []
    antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
    antes = [x for x in antes if x.get("tipo") == "antes" and x.get("tela") == tela and x.get("p50_s") not in ("", "None")]
    return (float(antes[-1]["p50_s"]), antes[-1].get("quando")) if antes else (None, None)


def anotar_gate(base: str, commit: str, fase: str, conta: str, tela: str, tipo: str, valores: list, ref: float | None, ok: object) -> None:
    B.anotar_planilha(T21.PLANILHA_GATE, ["quando", "base", "commit", "fase", "conta", "tela", "tipo", "n", "valores_s", "p50_s", "referencia_s", "ok"],
                      [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, tela, tipo, len(valores), ",".join(str(v) for v in valores), p50(valores), ref, ok])


def criterio_ociosa() -> bool:
    """O critério de ociosa da medição (hml21/medicao/logs_borda_treino_72h.txt): a anterior da mesma função há ≥ 10 min."""
    return FONTE_DO_CRITERIO.exists() and "ociosa = a anterior da mesma função há ≥ 10 min" in FONTE_DO_CRITERIO.read_text(encoding="utf-8")


PESADO_LOCK = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml12" / "ferramentas" / "pesado.lock"


class LockPesado:
    """O pesado.lock SÓ nas aberturas (a medida): o gate NÃO roda dentro do flock — nas esperas da ociosa o lock fica livre para o trabalho
    pesado que preenche a espera (o Vitest, o lint, a regressão de tela); na hora de medir, o gate espera o lock (ninguém pesado rodando:
    a medida sem disputa de CPU) e solta logo depois."""

    def __init__(self) -> None:
        self.f = None

    def __enter__(self):
        import fcntl  # noqa: PLC0415
        self.f = PESADO_LOCK.open("a")
        fcntl.flock(self.f.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, *_exc) -> None:
        import fcntl  # noqa: PLC0415
        if self.f is not None:
            fcntl.flock(self.f.fileno(), fcntl.LOCK_UN)
            self.f.close()
            self.f = None


def esperar_prontos(itens: list[tuple], min_s: float = B.MIN_S, max_s: float = B.MAX_S, quieto_s: float = B.QUIETO_S) -> list[dict]:
    """O esperar_pronto da hml-20 (a MESMA regra: sem "carregando", sem pedido em voo, quieto 3 s) para VÁRIAS páginas no MESMO laço — as
    aberturas SIMULTÂNEAS do gate (as 2 telas logo depois da espera da ociosa: as 2 são "a 1ª abertura depois de ≥ 10 min"). itens =
    [(tela, pendentes, marca)] → [{t_pronto_s, t_marca_s, pedidos}] de cada uma, medidos do MESMO início."""
    inicio = time.time()
    est = [{"amostras": [], "quieto_desde": time.time(), "ultimo": len(t.pedidos), "t_marca": None, "pronta": False} for t, _p, _m in itens]
    while time.time() - inicio < max_s and not all(e["pronta"] for e in est):
        itens[0][0].pg.wait_for_timeout(100)
        for (t, pend, marca), e in zip(itens, est):
            if e["pronta"]:
                continue
            n = len(t.pedidos)
            if n != e["ultimo"]:
                e["ultimo"], e["quieto_desde"] = n, time.time()
            try:
                carregando = int(t.pg.evaluate(B.B20.JS_CARREGANDO))
            except Exception:  # noqa: BLE001 — a página trocou no meio
                carregando = 1
            agora_s = round(time.time() - inicio, 2)
            if marca and e["t_marca"] is None and t.n(marca) > 0:
                e["t_marca"] = agora_s
            e["amostras"].append((agora_s, carregando, pend.n))
            if carregando == 0 and pend.n == 0 and time.time() - e["quieto_desde"] >= quieto_s and time.time() - inicio >= min_s:
                e["pronta"] = True
    saida = []
    for (t, _pend, _marca), e in zip(itens, est):
        am = e["amostras"]
        sujos = [i for i, (_t, c, p) in enumerate(am) if c > 0 or p > 0]
        if not am:
            tp = None
        elif not sujos:
            tp = am[0][0]
        elif sujos[-1] + 1 < len(am):
            tp = am[sujos[-1] + 1][0]
        else:
            tp = None
        saida.append({"t_pronto_s": tp, "t_marca_s": e["t_marca"], "pedidos": list(t.pedidos)})
    return saida


# o staleTime das consultas de Meus treinos (src/painel/treinos/useTreinos.ts: 30 s) — uma abertura do gate depois dele busca DE VERDADE
VELHO_MEUS_TREINOS_S = 31
ultima_medida: dict[str, float] = {}


def preparar_medida(t, pend, conta: str, tela_nome: str) -> None:
    """Antes de cada abertura MEDIDA do gate, o dado da tela fica VELHO (a abertura busca de verdade, como a 1ª visita — nunca o cache do
    React Query): o painel (Meus treinos, staleTime 30 s) espera ≥ 31 s desde a medida anterior dele, na entrada (o pré-busca do painel
    só roda na carga e o recarregar o dispararia — por isso não recarrega); o app (Treinos prontos, staleTime 5 min) RECARREGA a entrada
    (o cliente do React Query nasce vazio; o app do aluno não tem pré-busca). Fora da medida."""
    T21.fechar_janelas(t)
    if T21.eh_do_app(conta):
        t.ir(T21.ENTRADA_APP)
        t.esperar(lambda: t.n("[data-aba-perfil]") > 0, 60)
        B.esperar_pronto(t, pend, max_s=40)
        return
    B.navegar(t, T21.ENTRADA_PAINEL)
    falta = VELHO_MEUS_TREINOS_S - (time.time() - ultima_medida.get(tela_nome, 0.0))
    if falta > 0:
        t.pg.wait_for_timeout(int(falta * 1000))


def medir_gate(t, pend, tela: tuple, conta: str, s: str) -> dict:
    """Uma abertura medida do gate (o antes e o quente): o dado velho (preparar_medida) e a tela pela navegação do app."""
    preparar_medida(t, pend, conta, tela[0])
    r = T21.abrir_tela(t, pend, tela, s)
    ultima_medida[tela[0]] = time.time()
    return r


def ociosa_agora(ultimo: dict) -> tuple[bool, int, str]:
    """A treinos está parada há ≥ OCIOSA_S? A escuta deste processo E a borda (os logs da função: QUALQUER quem chama — outro processo, outro
    E2E). → (ociosa?, há quantos s, a nota). Os logs da borda fora do ar → só a escuta deste processo (anotado)."""
    if time.time() - ultimo["t"] < OCIOSA_S:
        return False, round(time.time() - ultimo["t"]), ""
    t_borda, erro = T21.ultimo_pedido_na_borda()
    if erro:
        return True, round(time.time() - ultimo["t"]), f"os logs da borda não responderam ({erro}): só a escuta deste processo"
    if t_borda and time.time() - t_borda < OCIOSA_S:
        ultimo["t"] = max(ultimo["t"], t_borda)
        return False, round(time.time() - ultimo["t"]), "a borda viu um pedido de outro processo: a espera recomeça"
    return True, round(time.time() - ultimo["t"]), ("a borda também parada" if t_borda else "nenhum pedido na borda nos últimos 40 min")


def gate_21d(o, nav, L, base: str, commit: str, fase: str, s: str, ate: float | None = None) -> None:  # noqa: PLR0915
    """O GATE (decisão K), no FIM da etapa 2: o personal (Meus treinos) e o aluno sem profissional (os Treinos prontos), cada um no seu
    contexto. Antes (o staging com o código antigo): 5 aberturas de cada (e 0 pedido à treinos — o antes não acorda a função). Depois: 5
    rodadas com a treinos OCIOSA — a espera de ≥ 10 min sem NENHUM pedido a ela (a escuta dos 2 contextos E a borda: qualquer quem chama;
    chamou → a espera recomeça) com as 2 telas paradas na entrada e, ao fim, as 2 aberturas SIMULTÂNEAS (as 2 são "a 1ª depois de ≥ 10 min":
    5 esperas em vez de 10) — e 5 QUENTE de cada (seguidas). O pesado.lock só nas medidas (as esperas ficam livres para o trabalho que as
    preenche). Registradas à parte (hml21/medicao/gate_hml21d.tsv); o antes só vale até 30 min antes do depois (🟡2 da revisão)."""
    ultimo = {"t": 0.0}
    inicio = time.time()

    def ouvir(req) -> None:
        if "/functions/v1/treinos" in req.url and req.method == "POST":
            ultimo["t"] = time.time()

    abertos = []
    try:
        with LockPesado():
            for conta, tela in TELAS_DO_GATE:
                T21.exige_identidade(o, s, conta)  # ⚪10: a troca que o app faz no navegador não cria conta nova no Treino
                t, pend = T21.abrir_conta(nav, base, conta, f"gate_{conta}")
                t.ctx.on("request", ouvir)
                abertos.append((conta, tela, t, pend))
                T21.entrar(o, t, pend, L, base, conta)
                T21.abrir_tela(t, pend, tela, s)  # a 1ª (a sessão do Treino, a troca): fora da medida
                B.navegar(t, T21.ENTRADA_APP if T21.eh_do_app(conta) else T21.ENTRADA_PAINEL)
        medidas: dict[str, dict[str, list]] = {tela[0]: {"antes": [], "ociosa": [], "quente": []} for _c, tela in TELAS_DO_GATE}
        if fase == "antes":
            with LockPesado():
                for conta, tela, t, pend in abertos:
                    pedidos_treinos = 0
                    for _ in range(ABERTURAS_ANTES_GATE):
                        r = medir_gate(t, pend, tela, conta, s)
                        medidas[tela[0]]["antes"].append(r["t_pronto_s"])
                        pedidos_treinos += sum(1 for x in r["pedidos"] if x.get("tipo") == "fn" and x.get("nome") == "treinos")
                    anotar_gate(base, commit, fase, conta, tela[0], "antes", medidas[tela[0]]["antes"], None, None)
                    o.ok(pedidos_treinos == 0, f"[antes] gate {conta} · {tela[0]}: {medidas[tela[0]]['antes']} → p50 {p50(medidas[tela[0]]['antes'])} s "
                         f"(a referência do depois; vale por 30 min) — {pedidos_treinos} pedido(s) à treinos (o antes não a chama: não acorda a função)")
            return
        # o QUENTE primeiro (a treinos acabou de ser chamada na preparação: < 120 s entre as aberturas) e as ociosas depois, até o prazo
        with LockPesado():
            for conta, tela, t, pend in abertos:
                for _ in range(ABERTURAS_QUENTE):
                    medidas[tela[0]]["quente"].append(medir_gate(t, pend, tela, conta, s)["t_pronto_s"])
        o.linha("   gate quente: " + "; ".join(f"{tela[0]} {medidas[tela[0]]['quente']}" for _c, tela, _t, _p in abertos))
        feitas, tentativas = 0, 0
        while feitas < ABERTURAS_OCIOSA and tentativas < ABERTURAS_OCIOSA + 3:
            if ate is not None and time.time() + OCIOSA_S + 90 > ate:
                o.linha(f"   gate: o prazo ({time.strftime('%H:%M', time.localtime(ate))}) não cabe outra espera de {OCIOSA_S // 60} min — as ociosas "
                        f"que faltam ({ABERTURAS_OCIOSA - feitas}) ficam para depois (o F7)")
                break
            tentativas += 1
            for conta, tl, t, pnd in abertos:  # as 2 telas paradas na entrada, o dado velho (nada chama a treinos enquanto espera)
                if T21.eh_do_app(conta):
                    preparar_medida(t, pnd, conta, tl[0])
                else:
                    T21.fechar_janelas(t)
                    B.navegar(t, T21.ENTRADA_PAINEL)
            teto = time.time() + 3 * OCIOSA_S  # algo chamando a treinos sem parar (a espera não acaba): a rodada não conta como ociosa
            while True:
                ociosa, desde, nota = ociosa_agora(ultimo)
                if ociosa or time.time() > teto or (ate is not None and time.time() > ate):
                    break
                abertos[0][2].pg.wait_for_timeout(5000)
            if not ociosa:
                o.ok(False, f"gate ociosa (tentativa {tentativas}): a treinos não ficou {OCIOSA_S} s parada em {3 * OCIOSA_S} s (o último pedido há "
                            f"{desde} s; {nota}) — a rodada não conta", parar=False)
                continue
            with LockPesado():
                ociosa, desde, nota = ociosa_agora(ultimo)  # de novo, já com o lock (a espera pelo lock pode ter visto um pedido)
                if ociosa:
                    for conta, tela, t, _p in abertos:
                        T21.fechar_janelas(t)
                        B.navegar(t, tela[1][1])
                    rs = esperar_prontos([(t, p, tela[2]) for _c, tela, t, p in abertos])
                    for _c, tela, _t, _p in abertos:
                        ultima_medida[tela[0]] = time.time()
            if not ociosa:
                o.linha(f"   gate ociosa (tentativa {tentativas}): um pedido à treinos durante a espera do lock ({nota}) — a rodada recomeça")
                continue
            feitas += 1
            for (conta, tela, _t, _p), r in zip(abertos, rs):
                medidas[tela[0]]["ociosa"].append(r["t_pronto_s"])
            o.linha(f"   gate ociosa {feitas}/{ABERTURAS_OCIOSA} (as 2 juntas, a treinos parada há {desde} s; {nota}): "
                    + ", ".join(f"{tela[0]} {r['t_pronto_s']} s" for (_c, tela, _t, _p), r in zip(abertos, rs)))
        parcial = len(next(iter(medidas.values()))["ociosa"]) < ABERTURAS_OCIOSA
        for conta, tela, _t, _pend in abertos:
            m = medidas[tela[0]]
            todas = m["ociosa"] + m["quente"]
            if tela[0] == "meus_treinos":
                ref, quando = referencia_gate(tela[0])
                vale, intervalo = T21.antes_do_gate_vale(quando, inicio)
                ok = None if ref is None or p50(todas) is None else (p50(todas) <= ref + GATE_FOLGA_S if vale else False)
                regra = (f"≤ antes {ref} + {GATE_FOLGA_S} s (o antes medido {intervalo} min antes do depois)" if vale else
                         f"— o antes ({ref} s) medido {intervalo if intervalo is not None else '?'} min antes do depois: só vale até 30 min — "
                         "meça o antes de novo")
            else:
                ref = GATE_ALUNO_MAX_S
                ok = None if p50(todas) is None else p50(todas) <= GATE_ALUNO_MAX_S
                regra = f"≤ {GATE_ALUNO_MAX_S} s"
            for tipo in ("ociosa", "quente"):
                anotar_gate(base, commit, fase, conta, tela[0], tipo, m[tipo], ref, None)
            if parcial:
                anotar_gate(base, commit, fase, conta, tela[0], "parcial", todas, ref, None)
                o.ok(True, f"GATE {tela[0]} PARCIAL (o prazo do BANCO): {len(m['ociosa'])} de {ABERTURAS_OCIOSA} ociosas {m['ociosa']} (p50 "
                           f"{p50(m['ociosa'])}) e {len(m['quente'])} quentes {m['quente']} (p50 {p50(m['quente'])}); p50 de todas = {p50(todas)} s {regra} "
                           f"— o veredito fica para o F7 (faltam {ABERTURAS_OCIOSA - len(m['ociosa'])} ociosas)")
                continue
            anotar_gate(base, commit, fase, conta, tela[0], "todas", todas, ref, ok)
            if not o.ok(ok is True, f"GATE {tela[0]}: p50 das {len(todas)} = {p50(todas)} s {regra} (ociosa {m['ociosa']} p50 {p50(m['ociosa'])}; "
                                    f"quente {m['quente']} p50 {p50(m['quente'])})" + (" — sem o antes medido" if ref is None else ""), parar=False):
                o.linha(f"TEMPO gate {tela[0]} {ref} × {p50(todas)} (ociosa {m['ociosa']}, quente {m['quente']}) — o ## TEMPO no progresso; "
                        "reverter o F3b é decisão da sessão principal")
    finally:
        for conta, _tela, t, _pend in abertos:
            T21.sair_da_conta(o, t, L, base, conta, "gate treinos")


def rodar_21d(o, base: str, canal: str | None, casos: list[str], prefixo: str | None = None, gate: bool = False, ate: float | None = None) -> None:
    """As telas da 21d, conta por conta: os prints d_* (conferir cada um: tela certa, sem login nem "carregando", nomes de teste), o tempo
    (decisão K) — ou, com --gate, SÓ o gate (decisão K: no fim da etapa 2, um por vez)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: rede.py --base prod)")
    s = B.usar_base(base)
    B.usar_area("treinos")
    L = B.Sessoes(f"telas21 treinos{' gate' if gate else ''} {base}")
    commit = B.commit_medido(base)
    fase = T21.fase_do_codigo_21d(base, commit)
    try:
        B.exigir_saude(o, f"o telas.py --area treinos{' --gate' if gate else ''} da hml-21d")
        o.linha(f"[{base}] {commit}: o {fase} · área treinos" + (" · o GATE" if gate else ""))
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                if gate:
                    gate_21d(o, nav, L, base, commit, fase, s, ate)
                    return
                for conta in T21.contas_da_area(base):
                    telas = T21.telas_que_abrem(o, s, base, conta)
                    if not telas:
                        continue
                    t, pend = T21.abrir_conta(nav, base, conta, f"telas_treinos_{conta}")
                    try:
                        T21.entrar(o, t, pend, L, base, conta)
                        if "prints" in casos:
                            for tela in telas:
                                nome, (como, alvo), marca, _teto = tela
                                if como == "clique" and not t.esperar(lambda: t.n(alvo) > 0, 20):
                                    o.ok(True, f"[{base}] {conta} · {CASO_DA_TELA_21D[nome]}: PULADO — a tela de cima sem item para abrir")
                                    continue
                                r = T21.abrir_tela(t, pend, tela, s)
                                o.ok(t.n(marca) > 0 and r["t_pronto_s"] is not None,
                                     f"[{base}] {conta} · {CASO_DA_TELA_21D[nome]}: a tela pronta em {r['t_pronto_s']} s ({marca[:60]})")
                                B.print_reduzido(t.pg, prefixo or base, CASO_DA_TELA_21D[nome], o)
                            if not T21.eh_do_app(conta):
                                print_erro_21d(o, t, pend, base, fase, prefixo)
                        if "tempo" in casos:
                            tempo_21d(o, t, pend, base, commit, fase, conta, telas, s)
                    finally:
                        T21.sair_da_conta(o, t, L, base, conta, "telas treinos")
            finally:
                nav.close()
    finally:
        L.fechar(o)


def seco_21d(o) -> None:
    """O --seco da 21d: os seletores das telas e do erro, os prints d_* (na pasta da 21d), as telas do tempo (decisão K), o antes da spec, a
    barra do d_erro e o GATE (o critério de ociosa da medição, as aberturas e as regras de passar)."""
    B.usar_area("treinos")
    sel = {"src/painel/treinos/MeusTreinos.tsx": ['titulo="Não deu para abrir os treinos"', "<EstadoErro"],
           "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="erro"']}
    faltam = [f"{arq}: {x}" for arq, xs in {**T21.SELETORES, **sel}.items() for x in xs if x not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, "os seletores das telas e do erro existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "d" and B.AREA_ESTADO == "hml21d",
         f"a 21d grava os prints em prints/hml21/d e a rodada na área hml21d ({B.PRINTS})")
    o.ok(set(PRINTS_21D) == {"d_treinos", "d_detalhe", "d_biblioteca", "d_folha", "d_busca", "d_modelos_treinos", "d_treinos_prontos_aluno", "d_editor", "d_erro"}
         and set(CASO_DA_TELA_21D) == {x[0] for x in T21.TELAS_DO_PAINEL + (T21.PRONTOS,)},
         "os prints d_* do contrato (Meus treinos, o Detalhe, a Biblioteca, a Folha, a Busca, os Modelos › Treinos, os Treinos prontos do aluno, "
         "o editor e o erro) — cada tela da área com o seu")
    spec = T21.antes_da_spec(T21.PERSONAL)
    o.ok(spec.get("/painel/treinos") == 2.06 and spec.get("/painel/alunos/:id/treino") == 5.06 and spec.get("/painel/modelos") == 0.82
         and set(T21.ROTA_DA_SPEC) == {"meus_treinos", "editor", "modelos_treinos"},
         f"o antes da spec (rede_por_tela.tsv, o personal, aquecido): Meus treinos {spec.get('/painel/treinos')} s, o editor "
         f"{spec.get('/painel/alunos/:id/treino')} s, os Modelos {spec.get('/painel/modelos')} s (as outras: a rodada antes do staging, nesta W)")
    T = "https://api.physiqcalc.com.br"
    o.ok(BARRA_DEPOIS_21D.match(f"{T}/functions/v1/treinos") and not BARRA_DEPOIS_21D.match(f"{T}/functions/v1/treinos-x")
         and BARRA_ANTES_21D.match(f"{T}/rest/v1/rpc/modelos_da_lista") and BARRA_ANTES_21D.match(f"{T}/rest/v1/tb_pastas_treino?select=id")
         and not BARRA_ANTES_21D.match(f"{T}/rest/v1/tb_pastas_treino_grupos?select=id") and not BARRA_ANTES_21D.match(f"{T}/functions/v1/treinos"),
         "o d_erro barra SÓ a área: depois a função treinos; antes as leituras diretas de Meus treinos (a RPC da página e as pastas)")
    o.ok(criterio_ociosa() and OCIOSA_S == 600 and (ABERTURAS_OCIOSA, ABERTURAS_QUENTE, ABERTURAS_ANTES_GATE) == (5, 5, 5)
         and (GATE_FOLGA_S, GATE_ALUNO_MAX_S) == (0.3, 2.0) and [tl[0] for _c, tl in TELAS_DO_GATE] == ["meus_treinos", "treinos_prontos_aluno"],
         "o GATE: Meus treinos e os Treinos prontos do aluno, 10 aberturas cada (5 com a treinos OCIOSA — ≥ 10 min sem pedido, o critério da "
         "medição logs_borda_treino_72h — e 5 QUENTE), o antes = 5 aberturas; passa com o Painel p50 ≤ antes + 0,3 s e o aluno p50 ≤ 2,0 s")
    o.ok(set(PAI_DO_CLIQUE) == {x[0] for x in T21.TELAS_DO_PAINEL if x[1][0] == "clique"} and CASOS_21D == ("prints", "tempo")
         and (FOLGA_S, ABERTURAS_TEMPO) == (0.3, 3), "o tempo: 3 aberturas aquecidas, ≤ antes + 0,3 s (decisão K); o Detalhe e a Folha medidos do clique")
    # 🟡2 da revisão: o antes do gate só vale até 30 min antes do depois (com o intervalo na linha do GATE)
    agora = time.time()
    q = lambda min_atras: time.strftime("%Y-%m-%d %H:%M", time.localtime(agora - min_atras * 60))  # noqa: E731
    casos_antes = [T21.antes_do_gate_vale(q(20), agora), T21.antes_do_gate_vale(q(31), agora), T21.antes_do_gate_vale(None, agora),
                   T21.antes_do_gate_vale(q(-5), agora), T21.antes_do_gate_vale("ontem", agora)]
    o.ok(casos_antes[0][0] is True and casos_antes[0][1] in (20, 21) and casos_antes[1][0] is False and casos_antes[1][1] in (31, 32)
         and casos_antes[2] == (False, None) and casos_antes[3][0] is False and casos_antes[4] == (False, None),  # (o "quando" é em minutos)
         f"🟡2: o antes do gate vale só até 30 min antes do depois (20 min → vale; 31 → \"meça o antes de novo\"; sem antes ou depois do depois → não) {casos_antes}")
    # a ociosa: a escuta deste processo E a borda (qualquer quem chama) — com a borda FALSA (nada vai à rede)
    original = T21.ultimo_pedido_na_borda
    try:
        res = []
        for borda, ultimo in (((None, None), time.time() - 30), ((None, None), time.time() - 700), ((time.time() - 60, None), time.time() - 700),
                              ((time.time() - 900, None), time.time() - 700), ((None, "HTTP 500"), time.time() - 700)):
            T21.ultimo_pedido_na_borda = lambda _b=borda: _b  # type: ignore[assignment]
            u = {"t": ultimo}
            res.append((ociosa_agora(u)[0], round(time.time() - u["t"]) < 120))
    finally:
        T21.ultimo_pedido_na_borda = original
    import calendar  # noqa: PLC0415
    utc_ok = (T21.instante_da_borda("2026-10-13T17:24:03")[0] == calendar.timegm((2026, 10, 13, 17, 24, 3, 0, 0, 0))
              and T21.instante_da_borda(1760376243000000)[0] == 1760376243.0 and T21.instante_da_borda("x")[1] == "instante ilegível")
    o.ok(utc_ok, "o instante dos logs da borda: o texto ISO SEM fuso é UTC (tomá-lo como hora local o punha 3 h no futuro e a espera da "
                 "ociosa nunca acabava — o defeito das 14:48); os microssegundos; o ilegível")
    o.ok(res == [(False, True), (True, False), (False, True), (True, False), (True, False)],
         f"a ociosa: parada há < 10 min aqui → espera; parada aqui e na borda → mede; a borda viu um pedido de OUTRO processo → a espera recomeça; "
         f"os logs da borda fora → só a escuta deste processo (anotado) {res}")
    fonte = Path(__file__).read_text(encoding="utf-8").split("def seco_21d", 1)[0]
    gate = fonte[fonte.index("def gate_21d"):fonte.index("def rodar_21d")]
    o.ok(gate.count("with LockPesado():") == 4 and "esperar_prontos([(t, p, tela[2])" in gate and "T21.exige_identidade(o, s, conta)" in gate
         and "fcntl.flock(self.f.fileno(), fcntl.LOCK_EX)" in fonte,
         "o gate: o pesado.lock SÓ nas medidas (as esperas livres para o trabalho que as preenche), as 2 aberturas da ociosa juntas (5 esperas em vez "
         "de 10) e a identidade no Treino conferida antes de cada conta abrir (⚪10)")


# ───────────────────────── hml-21c: os prints c_*, o tempo e a OCIOSA (--area aluno|configuracoes|mensagens|lixeira|modelos) ─────────────────────────
CASOS_21C = ("prints", "tempo")
PLANILHA_21C = B.MEDICAO / "telas_hml21c.tsv"
CAB_21C = ["quando", "base", "commit", "fase", "area", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
# os prints c_* (contrato da 21c, §1 item 5): o card de login (na aba Acessos), as Mensagens automáticas (o Resumo), as 5 abas das
# Configurações, a Mensagens, a Lixeira, os Modelos (nutri e personal) e o erro (a Lixeira com a conta barrada)
CASO_DA_TELA_21C = {"aluno_acessos": "c_resumo_login", "aluno_resumo": "c_mensagens_automaticas", "config_perfil": "c_config_perfil",
                    "config_conta": "c_config_conta", "config_equipe": "c_config_equipe", "config_convite": "c_config_convite",
                    "config_excluir": "c_config_excluir", "mensagens": "c_mensagens", "lixeira": "c_lixeira", "modelos": "c_modelos"}
PRINTS_21C = (*CASO_DA_TELA_21C.values(), "c_modelos_personal", "c_erro")
# c_erro: depois, a função conta barrada; antes (o código antigo), a lixeira_da_conta DIRETA barrada — a Lixeira mostra o erro (nunca a vazia)
BARRA_ANTES_21C = re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/rpc/lixeira_da_conta(\?|$)")
ERRO_DA_LIXEIRA = '[data-pagina-lixeira] [data-estado="erro"]'
OCIOSA_FOLGA_S = 0.3
# F7 da 21c: as telas PARADAS na entrada não podem acordar as funções na espera da ociosa — os números do menu do painel
# (src/painel/PainelLayout.tsx monta os contadores: useContadorMensagens → conta/whatsapp_resumo e useContadorPreConsulta →
# nutricao/preconsulta_novas, refetchInterval 5 min) pediriam às funções a cada 5 min por contexto e a espera de ≥ 10 min nunca fecharia.
# Na espera, os POST às 3 funções saem barrados NO NAVEGADOR (não chegam à função; a escuta não os conta) e a barra sai antes da medida.
BARRA_OCIOSA = re.compile(r"https://api-principal\.physiqcalc\.com\.br/functions/v1/(conta|nutricao|financeiro)(\?|$)")
TELAS_HML20 = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml20" / "medicao"


def referencia_21c(conta: str, medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha (a mesma conta); sem ela, o da spec."""
    if PLANILHA_21C.exists():
        linhas = PLANILHA_21C.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    return P21C.antes_da_spec(conta).get(P21C.ROTA_DA_SPEC.get(medida.split(":", 1)[-1], "?"))


def ultima_mediana(arq: Path, medida: str, conta: str | None = None) -> float | None:
    """A mediana mais recente de uma medida numa planilha de tempo (a da hml-20 para o Dieta do app e o Financeiro — a régua do JWKS)."""
    if not arq.exists():
        return None
    linhas = arq.read_text(encoding="utf-8").splitlines()
    cab = linhas[0].split("\t") if linhas else []
    achadas = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
    achadas = [x for x in achadas if x.get("medida") == medida and (conta is None or x.get("conta") == conta) and x.get("mediana_s") not in ("", "None", None)]
    return float(achadas[-1]["mediana_s"]) if achadas else None


def referencia_ociosa(tela: str) -> float | None:
    """O antes de cada tela da ociosa (decisão K): a Lixeira e os Modelos — o antes da 21c; o Dieta do app e o Painel › Financeiro — a medida
    mais recente da hml-20 (a régua do JWKS, D1)."""
    if tela in ("lixeira", "modelos"):
        return referencia_21c(P21C.NUTRI, f"tempo:{tela}")
    if tela == "dieta_app":
        return ultima_mediana(TELAS_HML20 / "telas_hml20a.tsv", "tempo:dieta")
    return ultima_mediana(TELAS_HML20 / "telas_hml20d.tsv", "tempo:financeiro_resumo", P21C.PERSONAL)


def tempo_21c(o, t, pend, base: str, commit: str, fase: str, area: str, conta: str, telas: list[tuple]) -> None:
    """Decisão K: cada tela 3 vezes pela navegação do app (aquecido: a tela já foi aberta; a entrada FORA da medida), a mediana do "pronto"
    ≤ o antes + 0,3 s; pior → a linha TEMPO (o ## TEMPO no progresso; a decisão é da sessão principal)."""
    for tela in telas:
        nome = tela[0]
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            P21.fechar_janelas(t)
            B.navegar(t, P21C.ENTRADA_PAINEL)
            t.pg.wait_for_timeout(600)
            valores.append(P21C.abrir_tela(t, pend, tela)["t_pronto_s"])
        med = B.mediana(valores)
        chave = f"tempo:{nome}"
        ref = referencia_21c(conta, chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        B.anotar_planilha(PLANILHA_21C, CAB_21C, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, conta, chave, len(valores),
                                                 ",".join(str(v) for v in valores), med, ref, ok])
        if fase == "antes":
            o.linha(f"   [antes] {conta} · {nome}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {conta} · {nome}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {nome} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def print_erro_21c(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    """c_erro: a Lixeira RECARREGADA com a conta barrada (depois) / com a lixeira_da_conta direta barrada (antes): o aviso de erro da Lixeira
    ("Não foi possível abrir a lixeira…"), nunca a lista vazia."""
    barra = BARRA_DEPOIS if fase == "depois" else BARRA_ANTES_21C
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/painel/lixeira")
        ok = t.esperar(lambda: t.n(ERRO_DA_LIXEIRA) > 0, 60)
        o.ok(ok and bool(barrados), f"[{base}] c_erro: {'a conta barrada' if fase == 'depois' else 'a lixeira_da_conta direta barrada'} ({len(barrados)} "
             f"pedido(s)) → o aviso de erro da Lixeira (\"{t.texto(ERRO_DA_LIXEIRA)[:60]}\")")
        B.print_reduzido(t.pg, prefixo or base, "c_erro", o)
    finally:
        t.ctx.unroute(barra)
    t.ir("/painel/lixeira")
    t.esperar(lambda: t.n(P21C.LIXEIRA[2]) > 0, 60)
    B.esperar_pronto(t, pend, max_s=40)


def aluno_da_tela(s: str) -> str | None:
    """O aluno de TESTE das telas do Resumo/da aba Acessos (SQL só leitura, como o api.py: a conta ativa da nutri, o e-mail de teste)."""
    uid_n = B.uid_da_conta(P21C.NUTRI)
    c = P21.conta_ativa(P21.situacao_como(s, uid_n, P21C.NUTRI)) if uid_n else None
    al = P21C.alunos_de_teste(s, c["id"], uid_n, B.uid_da_conta(P21C.ALUNA)) if c else {"tela": None}
    return (al.get("tela") or {}).get("id")


def rodar_21c(o, area: str, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    """As telas da 21c, conta por conta: os prints c_* (conferir cada um: tela certa, sem login nem "carregando", nomes de teste) e o tempo
    (decisão K). Nada grava: as telas só abrem (as pré-condições do painel21c — PULA com o motivo)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: rede.py --base prod)")
    s = B.usar_base(base)
    B.usar_area(area)
    L = B.Sessoes(f"telas21 {area} {base}")
    commit = B.commit_medido(base)
    fase = P21C.fase_do_codigo_21c(base, commit)
    try:
        B.exigir_saude(o, f"o telas.py --area {area} da hml-21c")
        o.linha(f"[{base}] {commit}: o {fase} · área {area}")
        aluno = aluno_da_tela(s) if area == "aluno" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for conta in P21C.contas_da_area(area, base):
                    telas = P21C.telas_que_abrem(o, s, base, area, conta, aluno=aluno)
                    if not telas:
                        continue
                    # DECISÃO 23:26: a Mensagens pelo dono — a instância dele antes × depois (SQL só leitura; mudou → ## ACHADO e volta)
                    uid_c = B.uid_da_conta(conta) if any(x[0] == "mensagens" for x in telas) else None
                    inst0 = P21C.estado_da_instancia(s, uid_c) if uid_c else None
                    t, pend = P21C.abrir_conta(nav, base, conta, f"telas_{area}_{conta}")
                    try:
                        P21C.entrar(o, t, pend, L, base, conta)
                        if "prints" in casos:
                            for tela in telas:
                                # o sufixo do dono só onde a nutri também abre (a Mensagens, a Conta e a Equipe só o dono abre: o nome do contrato)
                                caso = CASO_DA_TELA_21C[tela[0]] + ("_personal" if conta == P21C.PERSONAL and tela[0] in P21C.TELAS_DOS_DOIS else "")
                                r = P21C.abrir_tela(t, pend, tela)
                                o.ok(t.n(tela[2]) > 0 and r["t_pronto_s"] is not None, f"[{base}] {conta} · {caso}: a tela pronta em {r['t_pronto_s']} s ({tela[2][:60]})")
                                B.print_reduzido(t.pg, prefixo or base, caso, o)
                            if area == "lixeira" and conta == P21C.NUTRI:
                                print_erro_21c(o, t, pend, base, fase, prefixo)
                        if "tempo" in casos:
                            tempo_21c(o, t, pend, base, commit, fase, area, conta, telas)
                    finally:
                        P21C.sair_da_conta(o, t, L, base, conta, f"telas {area}")
                        if inst0 is not None:
                            P21C.conferir_instancia(o, s, uid_c, inst0, f"[{base}] {conta} · telas mensagens")
            finally:
                nav.close()
    finally:
        L.fechar(o)


def ociosa_21c(o, base: str, canal: str | None) -> None:  # noqa: PLR0915
    """A OCIOSA (decisão K — roda SÓ no F7, pela sessão principal, um por vez, com o /health): as 4 telas críticas (a Lixeira — a conta; os
    Modelos — a nutricao e a financeiro; o Dieta do app do aluno — a nutricao; o Painel › Financeiro — a financeiro), cada uma no seu
    contexto, paradas na entrada; a espera de ≥ 10 min sem NENHUM pedido às funções (a escuta deste processo E os logs de FUNÇÃO da Management
    API — qualquer quem chama; NUNCA a borda: H-135), com o teto de 30 min (quente pelo tráfego da produção → "não ficou ociosa", com a
    contagem dos logs — não é falha); então as 4 RECARREGADAS juntas (o cliente do React Query nasce vazio: a busca é de verdade) — "a 1ª
    abertura depois de ≥ 10 min" — e a análise pelos logs de FUNÇÃO (o instante em UTC; o booted = a função fria; o ms de cada `ler`).
    Ociosa > antes + 0,3 s → a linha TEMPO ociosa (o ## TEMPO no progresso; a decisão é da sessão principal)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("a ociosa é do staging (o F7)")
    s = B.usar_base(base)
    B.usar_area("lixeira")
    L = B.Sessoes(f"telas21 ociosa {base}")
    commit = B.commit_medido(base)
    ultimo = {"t": 0.0}
    barrando = {"v": False, "n": 0}

    def ouvir(req) -> None:
        if "/functions/v1/" in req.url and req.method == "POST":
            if barrando["v"] and BARRA_OCIOSA.match(req.url):
                return  # o número do menu barrado no navegador na espera: não chega à função
            ultimo["t"] = time.time()

    def barrar(route, _req) -> None:
        barrando["n"] += 1
        route.abort()

    abertos: list[tuple] = []
    try:
        B.exigir_saude(o, f"o telas.py --ociosa da hml-21c ({base})")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for nome, funcoes, conta, rota, sel in P21C.TELAS_OCIOSA:
                    app = conta == P21C.ALUNA
                    t = B.Tela(nav, B.BASES[base], f"hml21c_{base}", f"ociosa_{nome}", desktop=not app)
                    B.LegalDesligado().instalar(t.ctx)
                    pend = B.Pendentes(t.pg)
                    t.ctx.on("request", ouvir)
                    abertos.append((nome, funcoes, conta, rota, sel, t, pend))
                    t.entrar(L, conta, "/perfil" if app else P21C.ENTRADA_PAINEL)
                    t.esperar(lambda: t.n("[data-aba-perfil]" if app else "[data-casca]") > 0, 60)
                    B.esperar_pronto(t, pend, max_s=40)
                todas = tuple(sorted({f for _n, fs, *_r in P21C.TELAS_OCIOSA for f in fs}))
                for _n, _f, _c, _r, _s, t, _p in abertos:  # a espera: os números do menu barrados no navegador (BARRA_OCIOSA)
                    t.ctx.route(BARRA_OCIOSA, barrar)
                barrando["v"] = True
                inicio = time.time()
                while True:
                    ociosa, parada, nota = P21C.ociosa_agora(todas, ultimo["t"])
                    if ociosa or time.time() - inicio > P21C.TETO_OCIOSA_S:
                        break
                    abertos[0][5].pg.wait_for_timeout(15000)
                if not ociosa:
                    agora = time.time()
                    contagem = {f: sum(1 for x in P21C.logs_da_funcao(f, agora - P21C.TETO_OCIOSA_S, agora)[0] if "runtime" not in x) for f in todas}
                    o.ok(True, f"ociosa: as funções não ficaram {P21C.OCIOSA_S} s paradas em {P21C.TETO_OCIOSA_S // 60} min ({nota}) — quentes pelo tráfego: "
                               f"NÃO é falha; os pedidos nos logs de função na janela (UTC até {time.strftime('%H:%M:%S', time.gmtime(agora))}): {contagem}; "
                               f"os números do menu barrados no navegador na espera: {barrando['n']}")
                    return
                for _n, _f, _c, _r, _s, t, _p in abertos:  # sai da entrada AINDA com a barra (nenhum número do menu escapa entre a barra e a medida)
                    t.pg.goto("about:blank")
                    t.ctx.unroute(BARRA_OCIOSA, barrar)
                barrando["v"] = False
                o.linha(f"   ociosa — os números do menu barrados no navegador na espera (não chegaram às funções): {barrando['n']}")
                with LockPesado():
                    t0 = time.time()
                    for _n, _f, _c, rota, _s, t, _p in abertos:
                        t.ir(rota)  # a página RECARREGADA: o React Query nasce vazio (a lição 14:18 da 21d — o cache mede 0,11 s)
                    rs = esperar_prontos([(t, p, sel) for _n, _f, _c, _r, sel, t, p in abertos])
                    t1 = time.time()
                analise = P21C.analisar_ociosa(todas, t0, t1)
                o.linha(f"   ociosa — a abertura às {time.strftime('%H:%M:%S', time.gmtime(t0))} UTC (as funções paradas há {parada} s; {nota}); os logs de "
                        f"FUNÇÃO na janela: {analise}")
                for (nome, funcoes, conta, _r, _s, _t, _p), r in zip(abertos, rs):
                    ref = referencia_ociosa(nome)
                    v = r["t_pronto_s"]
                    ok = None if ref is None or v is None else v <= ref + OCIOSA_FOLGA_S
                    B.anotar_planilha(PLANILHA_21C, CAB_21C, [time.strftime("%Y-%m-%d %H:%M"), base, commit, "ociosa", "ociosa", conta, f"ociosa:{nome}", 1,
                                                             str(v), v, ref, ok])
                    if not o.ok(ok is not False, f"ociosa {nome} ({'/'.join(funcoes)}): {v} s ≤ antes {ref} + {OCIOSA_FOLGA_S} s"
                                + (" — sem o antes medido" if ref is None else "")):
                        o.linha(f"TEMPO ociosa {nome} {ref} × {v} — o ms do servidor de cada `ler` (os logs de função): "
                                f"{ {f: analise.get(f, {}).get('ler_ms') for f in funcoes} }; o runtime: { {f: analise.get(f, {}).get('runtime') for f in funcoes} }")
            finally:
                nav.close()
    finally:
        for _n, _f, conta, _r, _s, t, _p in abertos:
            try:
                P21C.sair_da_conta(o, t, L, base, conta, "ociosa")
            except Exception:  # noqa: BLE001
                pass
        L.fechar(o)


def seco_21c(o, area: str) -> None:
    """O --seco da 21c: os seletores das telas e do erro, os prints c_* (na pasta da 21c), as telas do tempo (decisão K), o antes da spec, a
    barra do c_erro e a OCIOSA (decisão K: o critério, os logs de FUNÇÃO — nunca a borda —, o instante em UTC, o teto de 30 min, a página
    recarregada) — sem rede (os logs FALSOS)."""
    B.usar_area(area)
    sel = {"src/painel/paginas/Lixeira.tsx": ["Não foi possível abrir a lixeira", "<EstadoErro"], "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="erro"'],
           "src/app-aluno/abas/Dieta.tsx": ["data-aba-dieta"], "src/painel/financeiro/Resumo.tsx": ['data-aba-financeiro-conteudo="resumo"', "data-kpis-financeiro"]}
    faltam = [f"{arq}: {x}" for arq, xs in {**P21C.SELETORES, **sel}.items() for x in xs if x not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, "os seletores das telas, do erro e das telas da ociosa existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "c" and B.AREA_ESTADO == "hml21c",
         f"a 21c grava os prints em prints/hml21/c e a rodada na área hml21c ({B.PRINTS})")
    o.ok(set(PRINTS_21C) == {"c_resumo_login", "c_mensagens_automaticas", "c_config_perfil", "c_config_conta", "c_config_equipe", "c_config_convite",
                             "c_config_excluir", "c_mensagens", "c_lixeira", "c_modelos", "c_modelos_personal", "c_erro"}
         and set(CASO_DA_TELA_21C) == {x[0] for x in P21C.TODAS_AS_TELAS},
         "os prints c_* do contrato (o card de login na aba Acessos, as Mensagens automáticas, as 5 abas das Configurações, a Mensagens, a Lixeira, os "
         "Modelos — nutri e personal — e o erro) — cada tela da área com o seu")
    spec_n, spec_p = P21C.antes_da_spec(P21C.NUTRI), P21C.antes_da_spec(P21C.PERSONAL)
    o.ok(spec_n.get("/painel/lixeira") == 0.22 and spec_n.get("/painel/modelos") == 0.5 and spec_p.get("/painel/modelos") == 0.82
         and spec_n.get("/painel/mensagens") == 0.31 and spec_n.get("/painel/alunos/:id") == 3.45 and spec_n.get("/painel/configuracoes/perfil") == 0.28,
         f"o antes da spec (rede_por_tela.tsv, aquecido): a Lixeira {spec_n.get('/painel/lixeira')} s, os Modelos {spec_n.get('/painel/modelos')}/"
         f"{spec_p.get('/painel/modelos')} s, a Mensagens {spec_n.get('/painel/mensagens')} s, o Resumo {spec_n.get('/painel/alunos/:id')} s (de ANTES da P4: o card de "
         f"login estava nele — o antes de verdade é o staging desta W), o Perfil {spec_n.get('/painel/configuracoes/perfil')} s")
    Pu = "https://api-principal.physiqcalc.com.br"
    o.ok(BARRA_ANTES_21C.match(f"{Pu}/rest/v1/rpc/lixeira_da_conta") and not BARRA_ANTES_21C.match(f"{Pu}/rest/v1/rpc/lixeira_apagar")
         and not BARRA_ANTES_21C.match(f"{Pu}/functions/v1/conta") and BARRA_DEPOIS.match(f"{Pu}/functions/v1/conta"),
         "o c_erro barra SÓ a área: depois a função conta; antes a lixeira_da_conta direta")
    o.ok(CASOS_21C == ("prints", "tempo") and (FOLGA_S, ABERTURAS_TEMPO, OCIOSA_FOLGA_S) == (0.3, 3, 0.3),
         "o tempo: 3 aberturas aquecidas (a entrada fora da medida), ≤ antes + 0,3 s (decisão K); a ociosa: ≤ antes + 0,3 s")
    # a OCIOSA: o critério (≥ 10 min, o mesmo da medição), o teto (30 min), as 4 telas, os logs de FUNÇÃO (nunca a borda) e o UTC — sem rede
    fonte = Path(__file__).read_text(encoding="utf-8")
    oc = fonte[fonte.index("def ociosa_21c"):fonte.index("def seco_21c")]
    fonte_p = (B.REPO / "e2e" / "hml21" / "painel21c.py").read_text(encoding="utf-8")
    o.ok(P21C.OCIOSA_S == 600 and P21C.TETO_OCIOSA_S == 1800 and criterio_ociosa()
         and [x[0] for x in P21C.TELAS_OCIOSA] == ["lixeira", "modelos", "dieta_app", "financeiro_painel"]
         and [x[1] for x in P21C.TELAS_OCIOSA] == [("conta",), ("nutricao", "financeiro"), ("nutricao",), ("financeiro",)]
         and "source = 'function_logs'" in fonte_p and "function_edge_logs" not in fonte_p and "t.ir(rota)" in oc and "with LockPesado():" in oc
         and "t.ctx.route(BARRA_OCIOSA, barrar)" in oc and "t.ctx.unroute(BARRA_OCIOSA, barrar)" in oc
         and oc.index("t.ctx.unroute(BARRA_OCIOSA, barrar)") < oc.index("with LockPesado():") < oc.index("t.ir(rota)")
         and all(BARRA_OCIOSA.match(f"{Pu}/functions/v1/{f}") for f in ("conta", "nutricao", "financeiro"))
         and not any(BARRA_OCIOSA.match(f"{Pu}/functions/v1/{f}") for f in ("whatsapp-conectar", "aluno-dia", "contas", "conta-x"))
         and not BARRA_OCIOSA.match(f"{Pu}/rest/v1/rpc/conta"),
         "a ociosa (decisão K): ≥ 10 min sem pedido (o critério da medição logs_borda_*), teto de 30 min, as 4 telas críticas (a Lixeira, os Modelos, o Dieta "
         "do app, o Financeiro), pelos logs de FUNÇÃO (function_logs — nunca a borda), a página RECARREGADA, o pesado.lock só na medida; na espera, os "
         "números do menu (5 min) barrados no navegador SÓ nas 3 funções — a barra sai antes da medida (o F7)")
    import calendar  # noqa: PLC0415
    o.ok(P21C.instante_utc("2026-10-13T17:24:03") == calendar.timegm((2026, 10, 13, 17, 24, 3, 0, 0, 0))
         and P21C.instante_utc("2026-10-13 17:24:03.250") == calendar.timegm((2026, 10, 13, 17, 24, 3, 0, 0, 0)) + 0.25
         and P21C.instante_utc(1760376243000000) == 1760376243.0 and P21C.instante_utc("x") is None,
         "o instante dos logs de função: o ISO SEM fuso é UTC (a lição 14:23 da 21d), os microssegundos, o ilegível → None")
    original = P21C.ultimo_pedido
    res = []
    try:
        for logs, ultimo_local in ((((None, None), (None, None)), time.time() - 30), (((None, None), (None, None)), time.time() - 700),
                                   (((time.time() - 60, None), (None, None)), time.time() - 700), (((time.time() - 900, None), (time.time() - 800, None)), time.time() - 700),
                                   (((None, "HTTP 500"), (None, None)), time.time() - 700)):
            fila = list(logs)
            P21C.ultimo_pedido = lambda _f, _a=None, _q=fila: _q.pop(0) if _q else (None, None)  # type: ignore[assignment]
            res.append(P21C.ociosa_agora(("nutricao", "financeiro"), ultimo_local)[0])
    finally:
        P21C.ultimo_pedido = original
    o.ok(res == [False, True, False, True, False],
         f"a ociosa: parada há < 10 min aqui → espera; parada aqui e nos logs de função → mede; um pedido de OUTRO processo nos logs → a espera segue; "
         f"os logs fora do ar → NÃO mede (sem a conferência pelos logs de função, não vale) {res}")
    o.ok(referencia_ociosa("dieta_app") is not None or not (TELAS_HML20 / "telas_hml20a.tsv").exists(),
         f"o antes da ociosa do Dieta do app e do Financeiro: a medida mais recente da hml-20 (a régua do JWKS, D1) — hoje {referencia_ociosa('dieta_app')} s / "
         f"{referencia_ociosa('financeiro_painel')} s")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a/21b/21d/21c — as telas: os prints a_*/b_*/d_*/c_* e o tempo antes × depois (a casca e o app do aluno; a "
                                             "Agenda e os Alunos; o Treino e o gate; o Resumo, as Configurações, a Mensagens, a Lixeira, os Modelos e a ociosa)")
    ap.add_argument("--area", required=True, choices=("casca", "app", "agenda", "alunos", "treinos", "aluno", "configuracoes", "mensagens", "lixeira", "modelos"))
    ap.add_argument("--base", default="local", choices=("local", "staging"))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--casos", default=None, help="prints,tempo (21a) · prints,tempo,fluxo (21b)")
    # o nome dos prints (<prefixo>_a_*.png; padrão = a base): o antes no staging usa antes_staging (decisão H)
    ap.add_argument("--prefixo", default=None)
    ap.add_argument("--seco", action="store_true")
    ap.add_argument("--gate", action="store_true", help="hml-21d: SÓ o gate de latência (decisão K) — no fim da etapa 2, um por vez")
    ap.add_argument("--gate-ate", default=None, help="hml-21d: HH:MM — o prazo do gate (a janela do BANCO): nenhuma espera nova que não acabe até lá")
    ap.add_argument("--ociosa", action="store_true", help="hml-21c: SÓ a abertura OCIOSA das 4 telas críticas (decisão K) — no F7, pela sessão principal")
    a = ap.parse_args()
    B.corte_vira_saida()
    B.usar_area(a.area)
    da_21b = a.area in B.AREAS_DA_21B
    da_21d = a.area in B.AREAS_DA_21D
    da_21c = a.area in B.AREAS_DA_21C  # hml-21c
    if a.gate and not da_21d:
        raise SystemExit("o --gate é da 21d (--area treinos)")
    if a.ociosa and not da_21c:
        raise SystemExit("o --ociosa é da 21c (--area aluno|configuracoes|mensagens|lixeira|modelos)")
    validos = CASOS_21C if da_21c else CASOS_21D if da_21d else CASOS_21B if da_21b else CASOS
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        raise SystemExit(f"caso desconhecido (os casos: {', '.join(validos)})")
    if a.seco:
        o = C.Saida(f"telas21_{a.area}_seco")
        if da_21c:
            seco_21c(o, a.area)
        elif da_21d:
            seco_21d(o)
        elif da_21b:
            seco_21b(o, a.area)
        else:
            seco(o)
        return o.fim()
    o = C.Saida(f"telas21_{a.area}_{a.base}" + ("_gate" if a.gate else "") + ("_ociosa" if a.ociosa else ""))
    try:
        if da_21c:
            if a.ociosa:
                ociosa_21c(o, a.base, a.canal)
            else:
                rodar_21c(o, a.area, a.base, a.canal, casos, a.prefixo)
        elif da_21d:
            ate = None
            if a.gate_ate:
                hh, mm = (int(x) for x in a.gate_ate.split(":"))
                ate = time.mktime(time.localtime()[:3] + (hh, mm, 0) + time.localtime()[6:])
            rodar_21d(o, a.base, a.canal, casos, a.prefixo, gate=a.gate, ate=ate)
        elif da_21b:
            rodar_21b(o, a.area, a.base, a.canal, casos, a.prefixo)
        else:
            rodar(o, a.area, a.base, a.canal, casos, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
