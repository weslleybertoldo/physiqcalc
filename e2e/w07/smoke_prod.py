#!/usr/bin/env python3
"""Physiq W7 — smoke de PRODUÇÃO do Perfil do aluno e da F4.

  telas     SÓ LEITURA (nenhum clique em salvar, exportar, excluir ou vincular): teste@teste.com (aluno do master de teste) —
            a aba Perfil (tela 5) com a versão no rodapé, a Agenda e a Conta; admin.teste (master de teste) — Configurações ›
            Aplicativo com a versão do site. Prints prod_* (390 × 844 × 3,4 e 1280 × 883 × 2).
  descartavel  uma conta criada SÓ para isto (excluir.prod.teste.claude@physiqnutri.app, "aluno sem professor" do Calc, sem
            matrícula em conta nenhuma — nenhum dado de cliente perto): troca de token (nasce o usuário do Treino), prévia de
            código errado, Exportar (os 2 bancos), Excluir com a conferência e as contagens antes/depois; no fim, a âncora de
            teste do Treino é apagada (é resto do teste, não de cliente)
Uso: python3 smoke_prod.py [telas|descartavel|tudo] [--base https://physiqcalc.com.br] [--versao 3.6]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

# o api.py desta pasta (o que aceita o schema public) vem antes; a base (_base.py) é a do repo
_REPO = Path.home() / "projetos" / "physiqcalc" / "e2e" / "w07"
sys.path.insert(1, str(_REPO if (_REPO / "_base.py").exists() else Path.home() / "projetos" / "physiqcalc-w07-perfil" / "e2e" / "w07"))
import _base as B  # noqa: E402

p = B.p
S = "public"
B.ESTADO["schema"] = S
DESC = "excluir-prod"
B.CONTAS[DESC] = ("excluir.prod.teste.claude@physiqnutri.app", B.senha_de(DESC))
B.NOMES[DESC] = "Excluir Prod W7"
B.EMAIL[DESC] = B.CONTAS[DESC][0]


def telas(a) -> None:
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            c = B.Caso(nav, a.base, "prod", "perfil", desktop=False)
            c.entrar("aluno-calc", "/perfil", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-aba-perfil]") and c.tem("[data-perfil-linha], [data-perfil-cartao]") and c.tem("[data-perfil-rodape]"), 40)
            rod = c.pg.locator("[data-perfil-rodape]").inner_text() if ok else ""
            p.check(ok and f"Physiq {a.versao}" in rod, f"prod: aba Perfil abriu; rodapé com a versão {a.versao} ({rod!r})")
            abas = [x.strip() for x in c.pg.locator("[data-tabbar] [data-aba]").all_inner_texts()]
            p.check("Perfil" in abas, f"prod: a aba Perfil está na barra ({abas})")
            t = c.texto()
            for l in ("Agenda", "Pagamentos", "Exportar meus dados", "Excluir minha conta", "Sair"):
                p.check(l in t, f"prod: '{l}' no Perfil")
            c.print("perfil")
            c.ir("/perfil/agenda")
            p.check(c.esperar(lambda: c.tem("[data-pagina-agenda]") and not c.tem("[data-estado='carregando']"), 30), "prod: Agenda abre")
            c.print("agenda")
            c.ir("/perfil/conta")
            p.check(c.esperar(lambda: c.tem("[data-form-senha]"), 30), "prod: Conta abre (sem salvar nada)")
            c.print("conta")
            c.fim()
            time.sleep(2)
            c = B.Caso(nav, a.base, "prod", "aplicativo", desktop=True)
            c.entrar("master", "/painel/configuracoes/aplicativo", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-config-aba='aplicativo']") and f"v{a.versao}" in c.texto(), 45)
            p.check(ok, f"prod: Configurações › Aplicativo mostra a versão do site v{a.versao}")
            p.check(f"v{int(a.versao.split('.')[0])}.{int(a.versao.split('.')[1]) + 1}" not in c.pg.locator("[data-config-aba='aplicativo']").inner_text(),
                    "prod: o site NÃO mostra a versão seguinte (o bump do CI foi pulado)")
            c.print("aplicativo")
            c.fim()
        finally:
            nav.close()


def descartavel(a) -> None:
    import api as API  # noqa: PLC0415
    email, senha = B.CONTAS[DESC]
    uid = B.garantir_usuario(email, senha, B.NOMES[DESC])
    sp = B.service(B.PRINCIPAL_REF)
    st, r, _ = B.http("PUT", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{uid}", {"app_metadata": {"calc": True}}, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    p.check(st == 200, f"descartável criada no principal ({uid})")
    if not B.saude_treino():
        raise SystemExit("Treino lento/instável — parei")
    st, r = B.trocar_token(DESC)
    tid = B.treino_id(DESC)
    p.check(st == 200 and bool(tid), f"troca de token: usuário do Treino criado ({tid})")
    st, r = B.funcao(B.token(DESC), "vincular-aluno", {"codigo": "PROF-NAO-EXISTE-W7-PROD", "previa": True}, origem="https://physiqcalc.com.br")
    p.check(st == 404 and (r or {}).get("erro") == "codigo_invalido", f"prod: prévia de código errado → 404 ({st} {r})")
    st, r = B.funcao(B.token(DESC), "exportar-meus-dados", {}, origem="https://physiqcalc.com.br")
    bp = (r or {}).get("banco_principal") or {}
    bt = (r or {}).get("banco_do_treino") or {}
    p.check(st == 200 and r.get("formato") == "physiq-exportacao/1" and r.get("ambiente") == "public" and bp.get("login", {}).get("email") == email
            and (bt.get("perfil") or {}).get("id") == tid, f"prod: Exportar com os 2 bancos ({st})")
    B.json_arquivo(Path.home() / "projetos" / "physiqcalc-scratch" / "w07" / "exportacao-prod-descartavel.json", r)
    st, r = B.funcao(B.token(DESC), "excluir-minha-conta", {"confirmacao": "EXCLUI"}, origem="https://physiqcalc.com.br")
    p.check(st == 400 and r.get("erro") == "confirmacao_invalida", f"prod: confirmação errada → 400 ({st})")
    st, r = B.funcao(B.token(DESC), "excluir-minha-conta", {"simular": True}, origem="https://physiqcalc.com.br")
    p.check(st == 200 and r.get("simulacao") is True, f"prod: conferência ({st} {str(r)[:160]})")
    antes = API.foto(DESC, "antes")
    st, r = B.funcao(B.token(DESC), "excluir-minha-conta", {"confirmacao": "EXCLUIR"}, origem="https://physiqcalc.com.br")
    p.check(st == 200 and r.get("ok") is True, f"prod: excluída ({st} {str(r)[:200]})")
    API.conferir(DESC)
    st2, _, _ = B.http("POST", f"{B.API_P}/auth/v1/token?grant_type=password", {"email": email, "password": senha}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st2 == 400, f"prod: a descartável não entra mais ({st2})")
    # a âncora do Treino é resto do TESTE (não de cliente): sai de vez, para não aparecer na lista antiga de "sem professor"
    if antes.get("treino_user_id"):
        st3, _, _ = B.http("DELETE", f"{B.TREINO_URL}/auth/v1/admin/users/{antes['treino_user_id']}", None,
                           {"apikey": B.service(B.TREINO_REF), "Authorization": f"Bearer {B.service(B.TREINO_REF)}"})
        resto = B.sql_treino(f"select count(*)::int n from public.physiq_profiles where id = '{antes['treino_user_id']}'")[0]["n"]
        p.check(st3 == 200 and resto == 0, f"prod: âncora do teste no Treino removida ({st3}, perfil {resto})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("modo", nargs="?", default="tudo")
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--versao", default="3.6")
    a = ap.parse_args()
    if a.modo in ("telas", "tudo"):
        telas(a)
    if a.modo in ("descartavel", "tudo"):
        descartavel(a)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
