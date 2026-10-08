#!/usr/bin/env python3
"""Physiq H5 — prova de PRODUÇÃO (schema public), só com a conta de TESTE nutri.teste.claude@physiqnutri.app ("Nutri Teste Claude",
sem alunos): nada de conta real, nenhuma mensagem, nada no Mercado Pago.

  banco     as 3 funções novas no ar (w20_janela 'livre' sem fim e as outras janelas iguais; whatsapp_enfileirar sem o bloco antigo
            do aviso de Pix; cadastro_link_enviar com a trava do CPF) — leitura das definições + chamadas que NÃO gravam
            (cpf_invalido, nome_invalido) e 1 pendente de teste criado e apagado (contagem igual antes/depois);
  telas     o /c/ da conta de teste com Apelido e CPF (sem enviar) → print prod_cadastro_c.

Uso: python3 e2e/h5/prod.py
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
SITE = "https://physiqcalc.com.br"
EMAIL_TESTE = "nutri.teste.claude@physiqnutri.app"


def codigo_teste() -> tuple[str, str]:
    r = q(f"""select m.codigo_convite c, m.conta_id::text conta from {S}.conta_membros m join auth.users u on u.id = m.user_id
              where u.email = '{EMAIL_TESTE}' and m.status = 'ativo' limit 1""")
    assert r, "conta de teste nutri.teste.claude não achada no public"
    return r[0]["c"], r[0]["conta"]


def banco() -> None:
    d = q(f"""select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{S}' and p.proname in ('w20_janela', 'whatsapp_enfileirar', 'cadastro_link_enviar')""")
    defs = {x["proname"]: x["def"] for x in d}
    p.check("null::date" in defs.get("w20_janela", ""), "[prod] w20_janela: 'livre' sem fim")
    p.check("assinatura_vencendo" not in defs.get("whatsapp_enfileirar", "") and "pago_ate" not in defs.get("whatsapp_enfileirar", "").replace("mensalidade_pago_ate", ""),
            "[prod] whatsapp_enfileirar sem o bloco antigo do aviso de Pix (nem profiles.pago_ate)")
    c = defs.get("cadastro_link_enviar", "")
    p.check("cadastro_repetido" in c and "cadastro_cpf_existe" not in c, "[prod] cadastro_link_enviar sem dizer que o CPF já é de um aluno (hml-05b, H-18)")
    j = q(f"""select (select j_ate is null from {S}.w20_janela('livre', date '2026-10-01')) livre,
                     (select j_ate::text from {S}.w20_janela('mes', date '2026-10-01')) mes,
                     (select j_ate::text from {S}.w20_janela('mes_seguinte', date '2026-10-01')) seg""")[0]
    p.check(j == {"livre": True, "mes": "2026-10-31", "seg": "2026-11-30"}, f"[prod] as janelas: {j}")
    cod, conta = codigo_teste()
    antes = q(f"select count(*)::int n from {S}.cadastros_pendentes")[0]["n"]
    st, r = B.rpc_servico("cadastro_link_enviar", {"p_codigo": cod, "p_dados": {"nome": "Teste H5", "cpf": "1234"}})
    p.check(isinstance(r, dict) and r.get("erro") == "cpf_invalido", f"[prod] (negativo) CPF curto → cpf_invalido, nada gravado ({r})")
    st, r = B.rpc_servico("cadastro_link_enviar", {"p_codigo": cod, "p_dados": {"nome": "X"}})
    p.check(isinstance(r, dict) and r.get("erro") == "nome_invalido", f"[prod] (negativo) sem nome → nome_invalido ({r})")
    st, r = B.rpc_servico("cadastro_link_enviar", {"p_codigo": cod, "p_dados": {"nome": "Teste Prod H5", "apelido": "Prod", "cpf": "529.982.247-25"}})
    ok = isinstance(r, dict) and r.get("ok") is True
    linha = q(f"select apelido, cpf, conta_id::text c from {S}.cadastros_pendentes where id = '{r.get('id')}'") if ok else []
    p.check(ok and linha and linha[0] == {"apelido": "Prod", "cpf": "52998224725", "c": conta}, f"[prod] só com o nome (+ apelido e CPF) entra pendente na conta de teste ({linha})")
    if ok:
        q(f"delete from {S}.cadastros_pendentes where id = '{r['id']}' and conta_id = '{conta}'")
    depois = q(f"select count(*)::int n from {S}.cadastros_pendentes")[0]["n"]
    p.check(depois == antes, f"[prod] pendentes do public iguais antes/depois ({antes} → {depois})")


def telas() -> None:
    html = urllib.request.urlopen(urllib.request.Request(SITE + "/", headers={"User-Agent": "physiq-e2e-h5"}), timeout=60).read().decode()
    js = re.findall(r'assets/[A-Za-z0-9_-]+\.js', html)
    p.check(bool(js), f"[prod] o site responde ({js[:1]})")
    cod, _ = codigo_teste()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.Caso(nav, SITE, "prod", "prod_cadastro", desktop=False)
        try:
            c.ir(f"/c/{cod}")
            ok = c.esperar(lambda: c.tem("[data-form-cadastro-publico]"), 60)
            p.check(ok and c.tem("[data-cad-apelido]") and c.tem("[data-cad-cpf]") and "só o nome é obrigatório" in c.texto(),
                    "[prod] o /c/ da conta de teste com Apelido e CPF e 'só o nome é obrigatório' (sem enviar)")
            c.print("cadastro_c")
        finally:
            c.fim()
        nav.close()


def main() -> int:
    for nome, fn in (("banco", banco), ("telas", telas)):
        print(f"\n── {nome} ──", flush=True)
        B.saude_ok(nome)
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
        time.sleep(2)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
