import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, TriangleAlert, UserCheck } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { buscarResponsavel } from "./api";
import { chaveResponsavel, textoDoRegistro, type ResponsavelAluno } from "./regras";
import { SheetResponsavel, type ModoFolha } from "./SheetResponsavel";

const AVISO = "mt-3 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-relaxed text-texto";
const LINHA = "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3";

/** As recusas que não mudam tentando de novo: a consulta não repete e a seção fica de fora (sem acesso não há o que mostrar). */
const ERRO_PERMANENTE = /sem_acesso|aluno_inexistente|sem_login/;
const permanente = (e: unknown) => ERRO_PERMANENTE.test(e instanceof Error ? e.message : "");

/**
 * hml-12 (H-30, §4.3 T9; D8, P6, P7) — "Consentimento do responsável" na ficha do aluno (Resumo › Dados do aluno, logo depois da
 * grade). O Physiq atende a partir dos 16 anos; de 16 a 17, só com o consentimento de um dos pais ou do responsável legal, que o
 * profissional registra aqui. Sem o registro, o app do aluno fica fechado (a trava de idade da porta do aceite).
 * - 16 ou 17 sem registro: o aviso âmbar e "Registrar consentimento" (só quem edita o aluno);
 * - registrado: quem, o vínculo, como foi dado, a data e quem registrou, com "Retirar" (só quem edita);
 * - menor de 16: o aviso (o app do aluno fica fechado e não há o que registrar);
 * - adulto: nada (só a marca escondida, para o E2E saber que a seção leu a faixa); sem data de nascimento ou com a versão dos textos
 *   desligada no banco (`ligado` falso): nada;
 * - a leitura falhou (rede, erro do banco): a linha "Não deu para carregar…" com "Tentar de novo" — a seção não some calada (o aluno
 *   pode ter 16 ou 17 anos sem o registro). Sem data de nascimento ou sem acesso: nada.
 * A faixa, quem edita e o registro vêm do banco (aluno_responsavel). SÓ no build de staging até a virada: o CardDadosAluno carrega
 * esta seção por import() atrás da condição do Vite (na produção o Rollup corta).
 */
export default function SecaoResponsavel({ alunoId, nascimento }: { alunoId: string; nascimento?: string | null }) {
  const qc = useQueryClient();
  const chave = chaveResponsavel(alunoId, nascimento);
  const q = useQuery({
    queryKey: chave,
    queryFn: () => buscarResponsavel(alunoId),
    enabled: !!alunoId,
    staleTime: 30_000,
    retry: (n, e) => !permanente(e) && n < 1,
    networkMode: "online",
  });
  const [folha, setFolha] = useState<{ modo: ModoFolha; aberta: boolean }>({ modo: "registrar", aberta: false });

  const r = q.data;
  if (!r) {
    // hml-12 (H-30): a leitura falhou — a linha do erro com "Tentar de novo" (o mesmo da consulta); sem data ou sem acesso, nada
    if (!q.isError || !nascimento || permanente(q.error)) return null;
    return (
      <section aria-label="Consentimento do responsável" className={LINHA} data-responsavel-erro-carregar>
        <TriangleAlert aria-hidden className="h-4 w-4 flex-none text-ambar-3" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-texto-2">Não deu para carregar o consentimento do responsável.</p>
        <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} className="text-[12.5px] font-semibold text-violeta-3">
          {q.isFetching ? "Tentando…" : "Tentar de novo"}
        </button>
      </section>
    );
  }
  if (!r.ligado || !r.faixa) return null;
  if (r.faixa === "adulto") return <div hidden data-secao-responsavel="adulto" />;

  const abrir = (modo: ModoFolha) => setFolha({ modo, aberta: true });
  const fechar = () => setFolha((x) => ({ ...x, aberta: false }));
  const feito = (novo: ResponsavelAluno) => {
    qc.setQueryData(chave, novo);
    fechar();
  };

  if (r.faixa === "menor_16") {
    return (
      <section aria-label="Consentimento do responsável" data-secao-responsavel="menor_16" className={`${AVISO} border-[var(--p-chip-r-borda)]`}
        style={{ background: "linear-gradient(90deg, var(--p-chip-r-fundo), transparent)" }}>
        <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-rosa-3" />
        <span data-responsavel-menor-16>
          Pela data de nascimento, o aluno tem menos de 16 anos. O Physiq é para quem tem 16 anos ou mais: o app do aluno fica fechado.
          {r.pode_editar && " Se a data estiver errada, corrija em Editar."}
        </span>
      </section>
    );
  }

  return (
    <>
      {r.atual ? (
        <section aria-label="Consentimento do responsável" data-secao-responsavel="16_17" className={LINHA}>
          <ShieldCheck aria-hidden className="h-4 w-4 flex-none text-verde-3" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-texto-2" data-responsavel-registrado>
            <b className="font-semibold text-texto">Consentimento do responsável:</b> {textoDoRegistro(r.atual)}
          </p>
          {r.pode_editar && (
            <button type="button" onClick={() => abrir("retirar")} className="text-[12.5px] font-semibold text-rosa-3" data-responsavel-retirar>
              Retirar
            </button>
          )}
        </section>
      ) : (
        <section aria-label="Consentimento do responsável" data-secao-responsavel="16_17" className={`${AVISO} flex-col border-ambar/30`}
          style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
          <span className="flex items-start gap-2.5">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
            <span data-responsavel-falta>
              Aluno de 16 ou 17 anos: falta o consentimento do responsável. Sem ele, o app do aluno fica fechado.
            </span>
          </span>
          {r.pode_editar && (
            <Botao tamanho="sm" icone={UserCheck} onClick={() => abrir("registrar")} className="self-start" data-responsavel-registrar>
              Registrar consentimento
            </Botao>
          )}
        </section>
      )}
      {r.pode_editar && <SheetResponsavel aberto={folha.aberta} modo={folha.modo} alunoId={alunoId} aoFechar={fechar} aoFeito={feito} />}
    </>
  );
}
