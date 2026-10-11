#!/usr/bin/env python3
"""Physiq hml-19a (H-41 · jeito 2, 11/10/2026) — a REDE de cada ação típica do Prontuário, no navegador (Edge), antes × depois.

Com a nutri de TESTE (w5p-nutri) no Prontuário da w5p-aluna, cada caso faz a ação de verdade na tela e a guarda que CONTA
(_base.classificar) separa os pedidos da ação: rest de gravação nas 18 tabelas do Prontuário, rest nas outras, RPC que grava, cada ação
da função nutricao, Storage (o PUT no link assinado à parte) — e o tempo da ação (do clique até a tela mostrar o resultado).
  anamnese  Nova anamnese em branco → Salvar (a linha aparece na lista)
  pedido    Novo pedido de exames (1 exame do catálogo) → Salvar (o pedido aparece)
  anexo     Enviar 1 arquivo de texto (a fila diz "ok" e o anexo aparece)
  modelos   Anamnese › Modelos: o diálogo abre com 1 só "Anamnese geral (padrão)" (o print a_anamnese) — nada grava
Depois da hml-19a (--base local): 0 linha rest de gravação nas tabelas do Prontuário, 0 Storage fora do link assinado e só as ações
esperadas da nutricao (anamnese_criar · pedido_exame_criar · anexo_preparar + o PUT + anexo_registrar). Antes (--base staging com o
código antigo): a gravação ia direto (rest ≥ 1) — a linha de base da mesma planilha (medicao/rede_hml19a.tsv: base, caso, contagens, ms).
Produção (--base prod): SÓ abre as telas com a Guarda (nada grava; a nutricao é barrada) e confere 0 gravação ao abrir além do
padroes_garantir das seções que semeiam (≤ 1 por seção, barrado).
Massa: "hml19 e2e <rodada>" (título da anamnese, observação do pedido, nome do arquivo) só no staging e só da nutri de TESTE; sai no fim
(o --limpar desfaz uma rodada que caiu: as linhas pela marca, o arquivo pelo Storage como a dona).
Antes ou depois vem do CÓDIGO medido, não da base: depois = o commit medido tem o src/nutricao/servidor.ts (o local sempre; o staging
depois do push da hml-19a); antes = o código antigo (o staging até o push).
Prints: ~/projetos/physiqcalc-scratch/prints/hml19/a/<prefixo>_a_anamnese.png e <prefixo>_a_anexo.png (+ a cópia de 900 px para conferir);
o prefixo é a base, ou o --prefixo (o depois no staging: staging2, para não cobrir os staging_* do antes).
hml-19b: --area dieta — as ações típicas da Dieta, das Dietas e do app (prescricao, item, duplicar, receita, alimento, app_marcar) em
rede_dieta.py, na planilha medicao/rede_hml19b.tsv e nos prints prints/hml19/b/<prefixo>_b_*.png.
Uso: python3 e2e/hml19/rede.py [--area prontuario|dieta] --base staging|local|prod --canal msedge [--prefixo staging2] [--casos …] [--seco | --limpar]
  --seco  sem rede e sem navegador: confere que os seletores existem no código das telas e que a classificação acerta pedidos de
          exemplo (antes e depois)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
# os modelos logo depois da anamnese: a Anamnese do código antigo (o staging, o ANTES) fica em laço de leitura enquanto aberta —
# sair cedo dela poupa o banco (o staging divide a máquina com a produção, H-80)
CASOS = ("anamnese", "modelos", "pedido", "anexo")
PLANILHA = B.MEDICAO / "rede_hml19a.tsv"
ESPERADO_DEPOIS = {
    "anamnese": {"fn:nutricao(anamnese_criar)": 1},
    "pedido": {"fn:nutricao(pedido_exame_criar)": 1},
    "anexo": {"fn:nutricao(anexo_preparar)": 1, "storage_link_assinado": 1, "fn:nutricao(anexo_registrar)": 1},
    "modelos": {},
}
# os seletores que este E2E usa (o --seco confere que cada um existe no código das telas)
SELETORES = {
    "src/painel/aluno/abas/Prontuario.tsx": ["data-aba-prontuario-aluno", "data-secao-prontuario-botao", "data-prontuario-editar"],
    "src/nutricao/prontuario/secoes/Anamnese.tsx": ["data-secao-anamnese", "data-btn-nova-anamnese", "data-btn-modelos", "data-anamnese-titulo",
                                                    "data-aviso-modelos", "data-btn-tentar-modelos"],
    "src/nutricao/prontuario/ui/AnamneseDialog.tsx": ["data-modal-anamnese", "data-escolher-modelo", "data-campo-titulo-anamnese",
                                                      "data-campo-texto-livre", "data-btn-salvar-anamnese"],
    "src/nutricao/prontuario/ui/ModelosAnamneseDialog.tsx": ["data-lista-modelos", "data-modelo-titulo", "data-modelo-origem"],
    "src/nutricao/prontuario/secoes/Exames.tsx": ["data-secao-exames", "data-btn-novo-pedido", "data-lista-pedidos", "data-pedido"],
    "src/nutricao/prontuario/ui/PedidoExameDialog.tsx": ["data-modal-pedido", "data-exame-toggle", "data-campo-outro-exame",
                                                         "data-btn-adicionar-outro", "data-campo-observacao-pedido", "data-btn-salvar-pedido"],
    "src/nutricao/prontuario/secoes/Anexos.tsx": ["data-secao-anexos", "data-input-anexos", "data-fila-item", "data-anexo-nome", "data-contagem-anexos"],
}


def commit_medido(base: str) -> str:
    """O código que está sendo medido: o HEAD da worktree no local; o commit do /health.json do site no staging e na produção."""
    if base == "local":
        r = subprocess.run(["git", "-C", str(B.REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() or "?"
    st, r, _h = B.B5.http("GET", f"{B.BASES[base]}/health.json", None, {}, timeout=30)
    return str(r.get("commit")) if st == 200 and isinstance(r, dict) else "?"


def fase_do_codigo(base: str, commit: str) -> str:
    """antes = o código antigo (a gravação direta do navegador); depois = o jeito 2 do Prontuário (o commit medido tem o
    src/nutricao/servidor.ts). Commit desconhecido aqui → antes (as conferências do antes acusam se não for)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "cat-file", "-e", f"{commit}:src/nutricao/servidor.ts"], capture_output=True, timeout=10)
    return "depois" if r.returncode == 0 else "antes"


GRAVACOES = ("rest_prontuario", "rest_dieta", "rest_outras", "rpc_grava", "storage_grava")  # hml-19b: o rest nas 19 tabelas da Dieta


def so_gravacoes(cont) -> dict:
    """Do que a guarda contou, só o que GRAVA: rest, RPC que grava, Storage (o link assinado à parte) e a nutricao (todas as ações dela
    gravam). As funções de leitura (treino-leitura, pos-login…) e os GET não entram."""
    return {k: v for k, v in cont.items() if k in GRAVACOES or k == "storage_link_assinado" or k.startswith("fn:nutricao")}


def rota(pac: str, secao: str = "anotacoes") -> str:
    return f"/painel/alunos/{pac}/prontuario?secao={secao}"


def abrir_secao(t, secao: str, timeout: float = 45) -> bool:
    """Troca de seção pelo botão do Prontuário (sem recarregar o app) e espera a seção carregar."""
    t.pg.locator(f'[data-secao-prontuario-botao="{secao}"]').first.click()
    raiz = {"anamnese": "[data-secao-anamnese]", "exames": "[data-secao-exames]", "anexos": "[data-secao-anexos]"}[secao]
    return t.esperar(lambda: t.tem(raiz) and t.n(f'{raiz}[data-atualizando="1"]') == 0 and "Carregando" not in t.texto(raiz), timeout)


def esperar_quieto(t, segundos: float = 1.5, teto: float = 15) -> None:
    """Espera a rede da ação acalmar (nenhum pedido novo por `segundos`)."""
    t0 = time.time()
    visto = len(t.pedidos)
    quieto_desde = time.time()
    while time.time() - t0 < teto:
        t.pg.wait_for_timeout(250)
        if len(t.pedidos) != visto:
            visto, quieto_desde = len(t.pedidos), time.time()
        elif time.time() - quieto_desde >= segundos:
            return


def acao_anamnese(t, marca: str) -> bool:
    t.clicar("[data-btn-nova-anamnese]")
    if not t.esperar(lambda: t.tem('[data-modal-anamnese="nova"]'), 15):
        return False
    t.clicar('[data-escolher-modelo="branco"]')
    t.pg.locator("[data-campo-titulo-anamnese]").first.fill(marca)
    t.pg.locator("[data-campo-texto-livre]").first.fill(f"{marca} — texto de teste")
    t.clicar("[data-btn-salvar-anamnese]")
    return t.esperar(lambda: t.n("[data-modal-anamnese]") == 0 and marca in t.texto("[data-secao-anamnese]"), 30)


def acao_pedido(t, marca: str) -> bool:
    t.clicar("[data-btn-novo-pedido]")
    if not t.esperar(lambda: t.tem('[data-modal-pedido="novo"]'), 15):
        return False
    if t.n("[data-exame-toggle]"):
        t.clicar("[data-exame-toggle]")
    else:
        t.pg.locator("[data-campo-outro-exame]").first.fill("TSH")
        t.clicar("[data-btn-adicionar-outro]")
    t.pg.locator("[data-campo-observacao-pedido]").first.fill(marca)
    antes = t.n("[data-lista-pedidos] [data-pedido]")
    t.clicar("[data-btn-salvar-pedido]")
    return t.esperar(lambda: t.n("[data-modal-pedido]") == 0 and t.n("[data-lista-pedidos] [data-pedido]") >= max(1, antes), 30)


def acao_anexo(t, marca_arquivo: str) -> bool:
    conteudo = f"{marca_arquivo} — arquivo de teste".encode()
    t.pg.locator("[data-input-anexos]").first.set_input_files({"name": marca_arquivo, "mimeType": "text/plain", "buffer": conteudo})
    return t.esperar(lambda: t.n(f'[data-fila-item="{marca_arquivo}"][data-estado="ok"]') > 0
                     and marca_arquivo in t.texto("[data-lista-anexos]"), 40)


def padroes_proprios(s: str, dono: str) -> int:
    """Quantos "Anamnese geral (padrão)" PRÓPRIOS e vivos a pessoa tem (SQL só leitura)."""
    return B.B17.ler(f"select count(*)::int as n from {s}.modelos_anamnese where nutricionista_id = {C.txt(C.uuid_ok(dono))} "
                     "and titulo = 'Anamnese geral (padrão)' and deleted_at is null")[0]["n"]


def caso_modelos(t, o, base: str, s: str, dono: str, antes: int, rotulo: str) -> None:
    """a_anamnese: o diálogo Modelos com os modelos da pessoa; abrir a Anamnese NÃO cria outro "Anamnese geral (padrão)" (o H-81). A
    nutri de teste tem duplicatas que o laço antigo deixou no staging: a conferência é "não aumenta", não "1 só"."""
    t.clicar("[data-btn-modelos]")
    ok = t.esperar(lambda: t.n("[data-lista-modelos] [data-modelo]") > 0, 20)
    na_tela = t.pg.evaluate("""() => [...document.querySelectorAll('[data-lista-modelos] [data-modelo][data-modelo-origem="proprio"] [data-modelo-titulo]')]
                                 .map((e) => e.textContent.trim()).filter((x) => x === 'Anamnese geral (padrão)').length""")
    depois = padroes_proprios(s, dono)
    o.ok(ok and depois == antes and na_tela == depois,
         f"[{base}] modelos: abrir a Anamnese não criou outro 'Anamnese geral (padrão)' (próprios vivos {antes} → {depois}; na tela {na_tela})")
    print_reduzido(t, rotulo, "a_anamnese", o)
    t.pg.keyboard.press("Escape")


def print_reduzido(t, base: str, caso: str, o) -> None:
    """O print <base>_<caso>.png e a cópia de 900 px para conferir (tela certa, sem login nem "carregando")."""
    B.PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = B.PRINTS / f"{base}_{caso}.png"
    t.pg.wait_for_timeout(700)
    t.pg.screenshot(path=str(caminho))
    try:
        from PIL import Image  # noqa: PLC0415
        im = Image.open(caminho)
        im.thumbnail((900, 900))
        im.save(caminho.with_name(f"{caminho.stem}_900.png"))
    except Exception as e:  # noqa: BLE001
        o.linha(f"   (cópia de 900 px não saiu: {type(e).__name__})")
    o.linha(f"   print: {caminho}")


def linha_planilha(base: str, caso: str, cont, ms: int, commit: str) -> None:
    B.MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not PLANILHA.exists()
    with PLANILHA.open("a", encoding="utf-8") as f:
        if novo:
            f.write("quando\tbase\tcommit\tcaso\trest_prontuario\trest_outras\trpc_grava\tstorage_grava\tstorage_link_assinado\tfuncoes\tms\n")
        funcoes = ",".join(f"{k}×{v}" for k, v in sorted(cont.items()) if k.startswith("fn:"))
        f.write("\t".join(str(x) for x in (time.strftime("%Y-%m-%d %H:%M"), base, commit, caso, cont.get("rest_prontuario", 0), cont.get("rest_outras", 0),
                                          cont.get("rpc_grava", 0), cont.get("storage_grava", 0), cont.get("storage_link_assinado", 0), funcoes, ms)) + "\n")


def conferir(o, base: str, caso: str, cont, ok_tela: bool, ms: int, fase: str) -> None:
    o.ok(ok_tela, f"[{base}] {caso}: a ação terminou na tela ({ms} ms)")
    gravacoes = so_gravacoes(cont)
    if fase == "antes":
        o.ok(cont.get("rest_prontuario", 0) + cont.get("storage_grava", 0) >= 1 or caso == "modelos",
             f"[antes] {caso}: a gravação ia direto do navegador ({gravacoes})")
        return
    fn = {k: v for k, v in gravacoes.items() if k.startswith("fn:nutricao") or k == "storage_link_assinado"}
    o.ok(cont.get("rest_prontuario", 0) == 0 and cont.get("storage_grava", 0) == 0 and cont.get("rpc_grava", 0) == 0,
         f"[depois] {caso}: 0 rest de gravação no Prontuário, 0 Storage fora do link assinado, 0 RPC que grava ({gravacoes})")
    o.ok(fn == ESPERADO_DEPOIS[caso], f"[depois] {caso}: só as chamadas esperadas da nutricao ({fn} × {ESPERADO_DEPOIS[caso]})")


def limpar_massa(o, s: str, dono: str, token: str, rodada: str | None = None) -> None:
    """As linhas da marca (staging, dono de teste) e o arquivo do anexo (pelo Storage, como a dona)."""
    if s != "staging":
        return
    marca = f"%{B.MARCA}%{rodada}%" if rodada else f"%{B.MARCA}%"
    arquivo = f"%hml19-e2e-{rodada}%" if rodada else "%hml19-e2e-%"
    caminhos = [x["path"] for x in B.B17.ler(f"select path from {s}.anexos where nutricionista_id = {C.txt(dono)} and nome like {C.txt(arquivo)}")]
    if caminhos:
        st, n = B.remover_do_storage(B.bucket_dos_anexos(s), caminhos, token)
        o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) do anexo tirados do bucket como a dona ({st}, {n})")
    for tabela, col in (("anamneses", "titulo"), ("pedidos_exame", "observacao"), ("anexos", "nome")):
        padrao = arquivo if tabela == "anexos" else marca
        C.C2.sql_principal(f"delete from {s}.{tabela} where nutricionista_id = {C.txt(C.uuid_ok(dono))} and {col} like {C.txt(padrao)}")
    sobra = B.B17.ler(f"select (select count(*) from {s}.anamneses where titulo like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.pedidos_exame where observacao like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.anexos where nome like {C.txt(arquivo)})::int as n")[0]["n"]
    objs = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_dos_anexos(s))} "
                     f"and name like {C.txt(dono + '/' + arquivo.lstrip('%'))}")[0]["n"]
    o.ok(sobra == 0 and objs == 0, f"limpeza conferida (SQL só leitura): 0 linha com a marca e 0 arquivo ({sobra}, {objs})")


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    exemplo_antes = [
        {"metodo": "POST", "tipo": "tab", "nome": "anamneses", "url": f"{B.API_P}/rest/v1/anamneses"},
        {"metodo": "POST", "tipo": "storage", "nome": "objeto", "url": f"{B.API_P}/storage/v1/object/anexos-staging/u/p/x.txt"},
        {"metodo": "POST", "tipo": "tab", "nome": "anexos", "url": f"{B.API_P}/rest/v1/anexos"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_perfil", "url": f"{B.API_P}/rest/v1/rpc/aluno_perfil"},
        {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{B.API_P}/rest/v1/profiles?select=nome"},
    ]
    c = B.contar(exemplo_antes)
    o.ok(c == {"rest_prontuario": 2, "storage_grava": 1, "get_profiles": 1}, f"a classificação do ANTES (rest e Storage direto): {dict(c)}")
    exemplo_depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "anexo_preparar", "url": f"{B.API_P}/functions/v1/nutricao"},
        {"metodo": "PUT", "tipo": "storage", "nome": "objeto", "url": f"{B.API_P}/storage/v1/object/upload/sign/anexos-staging/u/p/x.txt?token=t"},
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "anexo_registrar", "url": f"{B.API_P}/functions/v1/nutricao"},
        {"metodo": "OPTIONS", "tipo": "fn", "nome": "nutricao", "acao": None, "url": f"{B.API_P}/functions/v1/nutricao"},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{B.API_P}/storage/v1/object/sign/anexos-staging/u/p/x.txt"},
    ]
    c = B.contar(exemplo_depois)
    o.ok({k: v for k, v in c.items()} == ESPERADO_DEPOIS["anexo"], f"a classificação do DEPOIS (a nutricao e o PUT no link assinado): {dict(c)}")
    o.ok(B.TABELAS == set(B.regras()["tabelas"]) and len(B.TABELAS) == 18, "as 18 tabelas do Prontuário (as mesmas do servidor)")


def rodar(o, base: str, casos: list[str], canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    L = B.Sessoes(f"rede {base}")
    rodada = B.nova_rodada()
    commit = commit_medido(base)
    fase = fase_do_codigo(base, commit)
    rotulo = prefixo or base
    if base == "prod":  # produção: só abre cada seção 1 vez (nada grava)
        casos = [c for c in ("anamnese", "pedido", "anexo") if c in casos] or ["anamnese"]
    try:
        B.exigir_saude(o, "o rede.py")
        pac = B.B17.matricula_da_aluna()
        dono = L.uid(B.P_CONTA)
        padroes_antes = padroes_proprios(s, dono) if base != "prod" else 0
        guarda = B.B17.Guarda() if base == "prod" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.B17.Tela(nav, B.BASES[base], f"hml19_{base}", "rede", guarda=guarda)
            B.LegalDesligado().instalar(t.ctx)
            try:
                t.entrar(L, B.P_CONTA, rota(pac))
                ok = t.esperar(lambda: t.tem("[data-aba-prontuario-aluno]"), 60)
                o.ok(ok and t.n('[data-prontuario-editar="1"]') == 1, f"[{base}] o Prontuário da aluna abre e a nutri de teste muda o clínico ({commit}: o {fase})",
                     parar=True)
                for caso in casos:
                    secao = {"anamnese": "anamnese", "modelos": "anamnese", "pedido": "exames", "anexo": "anexos"}[caso]
                    t.zerar_pedidos()
                    aberta = abrir_secao(t, secao)
                    abrir = so_gravacoes(B.contar(t.pedidos))
                    gravou_ao_abrir = {k: v for k, v in abrir.items() if k != "fn:nutricao(padroes_garantir)"}
                    o.ok(aberta and not gravou_ao_abrir and abrir.get("fn:nutricao(padroes_garantir)", 0) <= 1,
                         f"[{base}] {secao} abre: 0 gravação ao abrir além de ≤ 1 padroes_garantir ({abrir})")
                    if base == "prod" or caso == "modelos":
                        if caso == "modelos" and base != "prod":
                            caso_modelos(t, o, base, s, dono, padroes_antes, rotulo)
                        continue
                    t.zerar_pedidos()
                    marca = f"{B.MARCA} {rodada} rede {caso}"
                    t0 = time.time()
                    ok_tela = {"anamnese": acao_anamnese, "pedido": acao_pedido}[caso](t, marca) if caso != "anexo" else acao_anexo(t, f"hml19-e2e-{rodada}.txt")
                    ms = round((time.time() - t0) * 1000)
                    esperar_quieto(t, teto=4 if fase == "antes" else 15)  # o código antigo nunca fica quieto (o laço de leitura)
                    cont = B.contar(t.pedidos)
                    conferir(o, base, caso, cont, ok_tela, ms, fase)
                    linha_planilha(base, caso, cont, ms, commit)
                    if caso == "anexo":
                        print_reduzido(t, rotulo, "a_anexo", o)
                if guarda:
                    o.ok(all("nutricao" in b or "padroes" in b for b in guarda.bloqueadas) and len(guarda.bloqueadas) <= 2,
                         f"[prod] a Guarda barrou só o padroes_garantir das seções que semeiam ({guarda.bloqueadas})")
            finally:
                L.do_navegador(B.P_CONTA, t.pg)
                t.fim()
                nav.close()
        if s == "staging":
            limpar_massa(o, s, dono, L.token(B.P_CONTA), rodada)
    finally:
        L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-19a/19b — a rede das ações típicas do Prontuário e da Dieta (antes × depois)")
    ap.add_argument("--area", default="prontuario", choices=("prontuario", "dieta"))
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--casos", default=None, help="padrão: todos os da área")
    ap.add_argument("--prefixo", default=None, help="o prefixo dos prints (padrão: a base; o depois no staging: staging2)")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    dieta = a.area == "dieta"
    if dieta:
        import rede_dieta as RD  # noqa: PLC0415 — a área da hml-19b (importa este módulo; aqui, só quando pedida)
    validos = RD.CASOS if dieta else CASOS
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        raise SystemExit(f"caso desconhecido na área {a.area} (os casos: {', '.join(validos)})")
    if a.seco:
        o = C.Saida(f"rede_{a.area}_seco" if dieta else "rede_seco")
        (RD.seco if dieta else seco)(o)
        return o.fim()
    o = C.Saida(f"rede_{a.area}_{a.base}" if dieta else f"rede_{a.base}" + ("_limpar" if a.limpar else ""))
    try:
        if a.limpar:
            s = B.usar_base("staging")
            L = B.Sessoes("rede --limpar")
            try:
                if dieta:
                    RD.limpar_massa(o, s, L.uid(B.P_CONTA))
                else:
                    limpar_massa(o, s, L.uid(B.P_CONTA), L.token(B.P_CONTA))
            finally:
                L.fechar(o)
        elif dieta:
            RD.rodar(o, a.base, casos, a.canal, a.prefixo)
        else:
            rodar(o, a.base, casos, a.canal, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    if not a.limpar:
        C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
