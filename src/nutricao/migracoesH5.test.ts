import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H5 — o que mudou no BANCO principal (supabase-principal/migrations/20261002090100_h5_agenda_cadastro_aviso_pix.sql), conferido nas
 * migrações (a prova de verdade é o E2E: e2e/h5/api.py no staging). A versão que vale de cada função é a da ÚLTIMA migração que a
 * define (as migrações rodam em ordem de nome).
 */
const pasta = resolve(__dirname, "../../supabase-principal/migrations");
const arquivos = readdirSync(pasta).filter((a) => a.endsWith(".sql")).sort();

function ultimaDefinicao(funcao: string): { arquivo: string; corpo: string } {
  const marca = `create or replace function {schema}.${funcao}(`;
  for (const a of [...arquivos].reverse()) {
    const t = readFileSync(resolve(pasta, a), "utf-8");
    const i = t.lastIndexOf(marca);
    if (i < 0) continue;
    // o corpo vai do 1º delimitador ($$, $function$…) até o mesmo delimitador de novo
    const m = /\$[a-z_]*\$/.exec(t.slice(i));
    if (!m) throw new Error(`${funcao}: corpo sem delimitador em ${a}`);
    const ini = i + m.index;
    const fim = t.indexOf(m[0], ini + m[0].length);
    return { arquivo: a, corpo: t.slice(i, fim + m[0].length) };
  }
  throw new Error(`${funcao} não definida`);
}

describe("H5 — achado 2 do FIM-1b: o aviso de Pix não sai em dobro", () => {
  it("o enfileirador do WhatsApp que vale não tem mais o aviso antigo do Nutri (profiles.pago_ate)", () => {
    const { arquivo, corpo } = ultimaDefinicao("whatsapp_enfileirar");
    expect(arquivo).toMatch(/_h5_/);
    expect(corpo).not.toContain("assinatura_vencendo");
    expect(corpo).not.toMatch(/\br\.pago_ate\b|\bp\.pago_ate\b/);
    // os outros momentos continuam (aniversário, véspera, no dia, cobranças da avulsa e da mensalidade)
    for (const m of ["'aniversario'", "'lembrete_consulta'", "'cobranca_vencendo'", "'cobranca_vencida'"]) expect(corpo).toContain(m);
  });
  it("o aviso do plano da conta (W28) segue na tarefa diária, 1 por dia", () => {
    const { corpo } = ultimaDefinicao("contas_tarefa_diaria");
    expect(corpo).toContain("'assinatura_vencendo'");
    expect(corpo).toContain("c.vence_em = v_hoje + 3");
    expect(corpo).toContain("on conflict do nothing");
  });
});

describe("H5 — N-11 e N-57 no banco", () => {
  it("'Sem trava' = a janela sem fim (null), as outras como na W20", () => {
    const { arquivo, corpo } = ultimaDefinicao("w20_janela");
    expect(arquivo).toMatch(/_h5_/);
    expect(corpo).toMatch(/when 'livre' then null::date/);
    expect(corpo).toContain("when 'mes_seguinte' then ((p_mes_ref + interval '2 months')::date - 1)");
  });
  it("/c/: só o nome obrigatório, CPF com 11 dígitos e a trava do CPF com os campos", () => {
    const { corpo } = ultimaDefinicao("cadastro_link_enviar");
    expect(corpo).not.toContain("contato_obrigatorio");
    expect(corpo).toContain("'cpf_invalido'");
    expect(corpo).toContain("paciente_conflitos(null, null, v_email, v_cpf)");
    expect(corpo).toContain("'cadastro_cpf_existe'");
    expect(corpo).toMatch(/insert into \{schema\}\.cadastros_pendentes \(nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf,/);
  });
});
