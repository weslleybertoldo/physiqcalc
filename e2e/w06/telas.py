#!/usr/bin/env python3
"""Physiq W6 — E2E de TELA da cobrança aluno → profissional (Playwright, contexto limpo por caso, em série — o Banco do Treino
é uma VM Nano), com os prints nos tamanhos das telas aprovadas (app 390 × 844 × 3,4; painel 1280 × 883 × 2).

Casos, na ordem (cada um usa o que o anterior deixou; staging, só contas de TESTE):
  aluno        aluno do Calc (aluno2): a faixa do topo "vence em 3 dias" (tela 1) → Pagar abre o Pix da chave com o QR; sem
               comprovante o "Já paguei" fica travado (negativo); Perfil › Pagamentos (tela 5); anexa → aguardando
  recusa       professor (prof2): Resumo do aluno com o card Financeiro e o KPI (tela 7); aba Financeiro com o comprovante;
               recusa com o motivo
  reenvio      o aluno vê a recusa com o motivo e manda outro comprovante
  confirma     professor: Configurações › Recebimento (Mercado Pago travado para o dono comum — negativo; chave ligada; bloqueio
               do inadimplente liga e desliga) → confirma o comprovante → a aba Financeiro mostra em dia (+1 mês no banco)
  nutri        paciente do Nutri (R16): a trava "use o PhysiqNutri" mostra "Pagar" com a cobrança vencida → paga por Pix com
               comprovante → a nutri confirma em Configurações › Recebimento → paga
Uso: python3 e2e/w06/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
"""
from __future__ import annotations

import argparse
import struct
import sys
import time
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S
EST: dict = {}
PASTA_TMP = Path.home() / "projetos" / "physiqcalc-scratch" / "w06"


def png_comprovante(caminho: Path, largura: int = 360, altura: int = 640) -> Path:
    """Um "print de comprovante" de teste (PNG sem PIL): fundo claro com faixas, pra o comprimirImagem do app ter o que fazer."""
    linhas = []
    for y in range(altura):
        cor = (22, 163, 74) if 60 <= y < 110 else (230, 230, 235) if (y // 40) % 2 else (250, 250, 252)
        linhas.append(b"\x00" + bytes(cor) * largura)
    bruto = zlib.compress(b"".join(linhas), 9)

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0)) + bloco(b"IDAT", bruto) + bloco(b"IEND", b""))
    return caminho


def limpar_testes(pac_id: str) -> None:
    B.sql_principal(f"""update {S}.cobrancas set deleted_at = now() where paciente_id = '{pac_id}' and deleted_at is null
                          and origem in ('app', 'assinatura', 'assinatura_calc', 'webhook_calc')""")


def garantir_chave(conta: str, conta_id: str, chave: str) -> None:
    if B.sql_principal(f"select 1 from {S}.recebimento_chaves where conta_id = '{conta_id}' and ativa"):
        return
    membro = B.sql_principal(f"""select m.id::text as id from {S}.conta_membros m join auth.users u on u.id = m.user_id
                                   where m.conta_id = '{conta_id}' and lower(u.email) = '{B.CONTAS[conta][0]}'""")
    st, r = B.rest(conta, "POST", "recebimento_chaves", {"conta_id": conta_id, "membro_id": membro[0]["id"] if membro else None, "tipo": "email",
                                                         "chave": chave, "favorecido": "Teste Claude W6", "banco": "Banco Teste", "ativa": True})
    assert st in (200, 201), (st, r)


def cobranca_pendente(pac_id: str) -> dict | None:
    r = B.sql_principal(f"""select id::text as id, status, forma, comprovante_path, recusado_motivo, enviado_em::text as enviado_em from {S}.cobrancas
                             where paciente_id = '{pac_id}' and deleted_at is null and status = 'aguardando_confirmacao' order by created_at desc limit 1""")
    return r[0] if r else None


def pausa(s: float = 4) -> None:
    """Entre as trocas de token (o Banco do Treino é uma VM Nano)."""
    time.sleep(s)


def preparar_aluno() -> dict:
    """aluno2 com a mensalidade do prof2 (Plano W6 Teste, R$ 99,90), 2 meses pagos por Pix e o atual vencendo em 3 dias."""
    m = B.matricula("aluno2")
    limpar_testes(m["id"])
    B.sql_principal(f"update {S}.pacientes set cobranca_pausada = false where id = '{m['id']}'")
    garantir_chave("prof2", m["conta_id"], "prof2.teste.claude@physiqcalc.app")
    st, r = B.pag("prof2", "prof_definir", {"aluno": m["treino_user_id"], "plano_novo": "Plano W6 Teste", "valor": "99,90"})
    assert st == 200, (st, r)
    dono = B.uid("prof2")
    meses_pt = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    for meses in (2, 1):
        quando = B.sql_principal(f"select (now() - interval '{meses} months' + interval '3 days')::text as t, "
                                 f"to_char(now() - interval '{meses} months' + interval '3 days', 'YYYY-MM') as ym")[0]
        ano, mes = quando["ym"].split("-")
        desc = f"Mensalidade · Plano W6 Teste · {meses_pt[int(mes) - 1]}/{ano}"
        B.sql_principal(f"""insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, tipo, descricao, valor, vencimento, mes_ref,
                              status, forma, pago_em, enviado_em, confirmado_por, confirmado_em, plano_aluno_id, origem)
                            select p.id, p.conta_id, '{dono}', '{dono}', 'mensalidade', '{desc}', 99.90, '{quando["t"]}'::timestamptz::date,
                                   '{quando["ym"]}-01', 'paga', 'pix_manual', '{quando["t"]}', '{quando["t"]}', '{dono}', '{quando["t"]}', p.plano_aluno_id, 'app'
                              from {S}.pacientes p where p.id = '{m['id']}'""")
    ate = B.sql_principal(f"select mensalidade_pago_ate::text as ate, (mensalidade_pago_ate::date - (now() at time zone 'America/Sao_Paulo')::date) as dias from {S}.pacientes where id = '{m['id']}'")[0]
    p.check(ate["dias"] in (2, 3), f"preparo: a mensalidade do aluno2 vence em 3 dias ({ate})")
    return m


def caso_aluno(nav, a) -> None:
    m = preparar_aluno()
    EST["aluno2"] = m
    c = B.Caso(nav, a.base, a.prefixo, "aluno", desktop=False)
    c.entrar("aluno2", "/")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-faixa-mensalidade='vencendo']"), 90), "faixa do topo âmbar na abertura (tela 1)")
    faixa = c.pg.locator("[data-faixa-mensalidade]").inner_text()
    p.check("vence em 3 dias" in faixa or "vence em 2 dias" in faixa, f"'Sua mensalidade vence em 3 dias' ({faixa!r})")
    p.check("R$ 99,90 · Pix" in faixa, "valor e forma (Pix na chave)")
    c.print("app_faixa")
    c.pg.locator("[data-faixa-pagar]").click()
    p.check(c.esperar(lambda: c.tem("[data-pagar-pix-manual]") and c.tem("[data-pix-qr]"), 30), "Pagar → o Pix da chave com o QR (gerado no aparelho)")
    p.check(c.pg.locator("[data-pix-chave]").inner_text().strip() == "prof2.teste.claude@physiqcalc.app", "a chave ativa da conta")
    p.check(c.pg.locator("[data-pix-avisar]").is_disabled(), "negativo: sem comprovante, o 'Já paguei' fica travado")
    c.print("app_pix")
    c.pg.keyboard.press("Escape")
    p.check(c.esperar(lambda: c.tem("[data-mensalidade-aluno='vence_em_breve']") and not c.tem("[data-pagar-pix-manual]"), 20), "Perfil › Pagamentos com a mensalidade vencendo")
    chip = c.pg.locator("[data-chip-mensalidade]").first.inner_text()
    p.check(chip.lower().startswith("vence em"), f"chip âmbar 'Vence em 3 dias' (tela 5: {chip!r})")
    p.check(c.pg.locator("[data-historico-pagamentos] [data-cobranca-situacao='paga']").count() >= 2, "histórico com os meses pagos (✓)")
    c.print("app_pagamentos")
    c.pg.locator("[data-pagar-mensalidade]").click()
    c.esperar(lambda: c.tem("[data-pagar-pix-manual]"), 20)
    arq = png_comprovante(PASTA_TMP / "comprovante-teste-w06.png")
    c.pg.locator("[data-pix-input-arquivo]").set_input_files(str(arq))
    p.check(c.esperar(lambda: c.tem("[data-pix-anexo]"), 60), "comprovante anexado (sobe pelo link assinado)")
    c.pg.locator("[data-pix-avisar]").click()
    p.check(c.esperar(lambda: c.tem("[data-pagamento-aguardando]"), 60), "'Já paguei' → aguardando o professor confirmar")
    pend = cobranca_pendente(m["id"])
    p.check(bool(pend) and pend["forma"] == "pix_manual" and pend["comprovante_path"].startswith(f"conta/{m['conta_id']}/{m['id']}/"),
            f"no banco: aguardando, Pix na chave, comprovante na pasta da matrícula ({pend})")
    EST["pendente"] = pend
    c.print("app_aguardando")
    c.fim()


def caso_recusa(nav, a) -> None:
    m = EST.get("aluno2") or B.matricula("aluno2")
    EST["pendente"] = EST.get("pendente") or cobranca_pendente(m["id"])
    c = B.Caso(nav, a.base, a.prefixo, "recusa")
    c.entrar("prof2", f"/painel/alunos/{m['treino_user_id']}")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-card-financeiro] [data-cobranca]") and c.tem("[data-kpi-mensalidade]"), 120),
            "Resumo do aluno: card Financeiro e o KPI Mensalidade (tela 7)")
    p.check(c.esperar(lambda: c.tem("[data-cabecalho-aluno] h2"), 90), "cabeçalho do aluno carregado")
    c.esperar(lambda: c.tem("[data-fallback-aluno] [data-config-aluno]") or c.tem("[data-fallback-aluno] h1, [data-fallback-aluno] h2, [data-fallback-aluno] h3"), 60)
    card = c.pg.locator("[data-card-financeiro]").inner_text()
    p.check("R$ 99,90/MÊS" in card and "Emitir recibo" in card, f"card: 'R$ 99,90/MÊS' e 'Emitir recibo' ({card[:80]!r})")
    p.check("AGUARDANDO" in card, "a mensalidade aguardando aparece no card")
    kpi = c.pg.locator("[data-kpi-mensalidade]").inner_text()
    p.check("R$ 99,90" in kpi and "comprovante" in kpi, f"KPI: 'R$ 99,90 · comprovante p/ conferir' ({kpi!r})")
    c.print("painel_resumo")
    c.pg.locator("[data-aba-aluno='financeiro']").click()
    p.check(c.esperar(lambda: c.tem("[data-financeiro-aluno] [data-comprovante-pendente]"), 60), "aba Financeiro com o comprovante para conferir")
    c.print("painel_financeiro")
    c.pg.locator("[data-btn-recusar-pix]").first.click()
    c.esperar(lambda: c.tem("[data-recusar-motivo]"), 20)
    p.check(c.pg.locator("[data-recusar-confirmar]").is_disabled(), "negativo: recusar sem motivo não vai")
    c.pg.locator("[data-recusar-motivo]").fill("Valor diferente da mensalidade (teste W6)")
    c.pg.locator("[data-recusar-confirmar]").click()
    p.check(c.esperar(lambda: not c.tem("[data-comprovante-pendente]") and c.tem("[data-lista-cobrancas] [data-cobranca-situacao='recusada']"), 60),
            "recusado: sai dos aguardando e a linha fica RECUSADO")
    r = B.sql_principal(f"select status, recusado_motivo from {S}.cobrancas where id = '{EST['pendente']['id']}'")[0] if EST.get("pendente") else {}
    EST["pendente"] = None
    p.check(r.get("status") == "cancelada" and "Valor diferente" in (r.get("recusado_motivo") or ""), f"no banco: recusada com o motivo ({r})")
    c.fim()


def caso_reenvio(nav, a) -> None:
    m = EST.get("aluno2") or B.matricula("aluno2")
    c = B.Caso(nav, a.base, a.prefixo, "reenvio", desktop=False)
    c.entrar("aluno2", "/perfil/pagamentos")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-comprovante-recusado]"), 90), "o aluno vê o comprovante recusado")
    p.check("Valor diferente da mensalidade (teste W6)" in c.pg.locator("[data-comprovante-recusado]").inner_text(), "com o motivo do professor")
    c.print("app_recusado")
    c.pg.locator("[data-pagar-mensalidade]").click()
    c.esperar(lambda: c.tem("[data-pagar-pix-manual]"), 20)
    c.pg.locator("[data-pix-input-arquivo]").set_input_files(str(png_comprovante(PASTA_TMP / "comprovante-teste-w06-2.png", 300, 520)))
    c.esperar(lambda: c.tem("[data-pix-anexo]"), 60)
    c.pg.locator("[data-pix-avisar]").click()
    p.check(c.esperar(lambda: c.tem("[data-pagamento-aguardando]") and not c.tem("[data-comprovante-recusado]"), 60), "outro comprovante enviado → aguardando de novo")
    EST["pendente"] = cobranca_pendente(m["id"])
    p.check(bool(EST["pendente"]), f"no banco: um novo aguardando ({EST['pendente']})")
    c.fim()


def caso_confirma(nav, a) -> None:
    m = EST.get("aluno2") or B.matricula("aluno2")
    EST["pendente"] = EST.get("pendente") or cobranca_pendente(m["id"])
    antes = B.sql_principal(f"select mensalidade_pago_ate as ate from {S}.pacientes where id = '{m['id']}'")[0]["ate"]
    c = B.Caso(nav, a.base, a.prefixo, "confirma")
    c.entrar("prof2", "/painel/configuracoes/recebimento")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-config-aba='recebimento'] [data-recebimento-item]") and c.tem("[data-comprovante-pendente]"), 120),
            "Configurações › Recebimento: a chave e o comprovante aguardando")
    mp = c.pg.locator("[data-opcoes='recebimento-modo'] [data-opcao='mercadopago']")
    p.check(mp.is_disabled(), "negativo: o dono comum não liga o Mercado Pago (só o master libera)")
    p.check(c.pg.locator("[data-opcoes='recebimento-modo'] [data-opcao='pix_manual']").get_attribute("aria-checked") == "true", "forma: Pix na chave")
    p.check(c.tem("[data-recebimento-ativo]"), "uma chave ligada (a que o aluno vê)")
    c.print("painel_recebimento")
    c.pg.locator("[data-opcoes='recebimento-bloqueio'] [data-opcao='sim']").click()
    ok = c.esperar(lambda: B.sql_principal(f"select bloquear_app_inadimplente as b from {S}.contas where id = '{m['conta_id']}'")[0]["b"] is True, 20, 1)
    p.check(ok, "bloquear o app do inadimplente: liga (no banco)")
    c.pg.locator("[data-opcoes='recebimento-bloqueio'] [data-opcao='nao']").click()
    ok = c.esperar(lambda: B.sql_principal(f"select bloquear_app_inadimplente as b from {S}.contas where id = '{m['conta_id']}'")[0]["b"] is False, 20, 1)
    p.check(ok, "e desliga de novo (a conta do Calc fica como estava: desligado)")
    c.pg.locator("[data-comprovante-pendente] [data-btn-confirmar-pix]").first.click()
    p.check(c.confirmar_no_app(), "a confirmação do app (hml-18a) → Confirmar recebimento")
    p.check(c.esperar(lambda: c.tem("[data-recebimento-sem-pendentes]"), 60), "confirmado: nenhum comprovante aguardando")
    r = B.sql_principal(f"""select c.status, c.transacao_id is not null as lancou, p.mensalidade_pago_ate as ate, (p.mensalidade_pago_ate > '{antes}'::timestamptz) as andou
                             from {S}.cobrancas c join {S}.pacientes p on p.id = c.paciente_id where c.id = '{EST['pendente']['id']}'""")[0]
    p.check(r["status"] == "paga" and r["andou"], f"no banco: paga e a cobertura anda 1 mês ({antes} → {r['ate']})")
    p.check(r["lancou"], "lança a entrada no financeiro (o 'lançar' vem marcado)")
    c.ir(f"/painel/alunos/{m['treino_user_id']}/financeiro")
    p.check(c.esperar(lambda: c.tem("[data-cartao-mensalidade] [data-chip-mensalidade]") and "Em dia" in c.pg.locator("[data-cartao-mensalidade] [data-chip-mensalidade]").inner_text(), 90),
            "aba Financeiro: mensalidade em dia")
    c.print("painel_financeiro_pago")
    c.fim()


def caso_nutri(nav, a) -> None:
    m = B.matricula("paciente")
    limpar_testes(m["id"])
    garantir_chave("nutri-legado", m["conta_id"], "nutri.teste.claude@physiqnutri.app")
    st, r = B.pag("nutri-legado", "prof_cobranca_criar", {"aluno": m["id"], "descricao": "Consulta W6 (teste)", "valor": "150", "vencimento": B.dias(-1)})
    assert st == 200, (st, r)
    cob = r["cobranca"]
    c = B.Caso(nav, a.base, a.prefixo, "nutri-paciente", desktop=False)
    c.entrar("paciente", "/")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-trava-app='use-o-nutri'] [data-trava-pagar]"), 90), "paciente do Nutri: a trava 'use o PhysiqNutri' mostra o Pagar (R16)")
    p.check("Consulta W6 (teste) venceu" in c.pg.locator("[data-trava-cobranca]").inner_text(), "com a cobrança vencida")
    c.print("app_nutri_trava")
    c.pg.locator("[data-trava-pagar]").click()
    p.check(c.esperar(lambda: c.tem("[data-pagar-pix-manual]"), 60), "Pagar → o Pix da chave da nutri")
    c.pg.locator("[data-pix-input-arquivo]").set_input_files(str(png_comprovante(PASTA_TMP / "comprovante-teste-w06-3.png", 320, 560)))
    c.esperar(lambda: c.tem("[data-pix-anexo]"), 60)
    c.pg.locator("[data-pix-avisar]").click()
    p.check(c.esperar(lambda: c.tem(f"[data-cobrancas-abertas] [data-cobranca='{cob['id']}'][data-cobranca-situacao='aguardando']"), 60),
            "a cobrança fica aguardando a nutri confirmar")
    c.print("app_nutri_pagamentos")
    c.fim()
    n = B.Caso(nav, a.base, a.prefixo, "nutri-confirma")
    n.entrar("nutri-legado", "/painel/configuracoes/recebimento", zerar=False)
    n.fechar_avisos()
    p.check(n.esperar(lambda: n.tem("[data-comprovante-pendente]"), 120), "a nutri vê o comprovante em Configurações › Recebimento (conta do Nutri, sem Treino)")
    p.check(len(n.trocas) == 0, f"sem troca de token do Treino ({len(n.trocas)})")
    n.print("painel_nutri_recebimento")
    n.pg.locator("[data-comprovante-pendente] [data-btn-confirmar-pix]").first.click()
    p.check(n.confirmar_no_app(), "a confirmação do app (hml-18a) → Confirmar recebimento")
    p.check(n.esperar(lambda: n.tem("[data-recebimento-sem-pendentes]"), 60), "a nutri confirma")
    r = B.sql_principal(f"select status, pago_em is not null as pago from {S}.cobrancas where id = '{cob['id']}'")[0]
    p.check(r["status"] == "paga" and r["pago"], f"no banco: paga ({r})")
    n.fim()


CASOS = {"aluno": caso_aluno, "recusa": caso_recusa, "reenvio": caso_reenvio, "confirma": caso_confirma, "nutri": caso_nutri}
PRECISA_TREINO = {"aluno", "recusa", "reenvio", "confirma"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            if nome in PRECISA_TREINO and not B.saude_treino():
                p.check(False, f"[{nome}] Banco do Treino fora do normal — parei (não reinicio nada)")
                break
            t0 = time.time()
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = B.ESTADO.get("caso")
                if caso is not None:
                    caso.diagnostico()
            print(f"   ({time.time() - t0:.0f} s)", flush=True)
            pausa()
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
