import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ClipboardCheck, Package, Repeat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { aguardandoAluno, hojeSP, infoTipo, periodoDoPacote, quandoConsulta, textoPacote } from "@/agenda/regras";
import { compromissosDoAluno } from "@/painel/agenda/dados";
import PacoteDialog, { type ResponsavelPacote } from "@/painel/agenda/PacoteDialog";
import { CHAVES_AGENDA } from "@/painel/agenda/useAgenda";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { CartaoCarregando, Esqueleto } from "@/ui/premium/Estados";
import { useAvaliacaoDoAluno } from "../avaliacao/useAvaliacaoDoAluno";
import { usePerfilAluno } from "../dados/usePerfilAluno";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "2026-07-22" → "qua, 22/07" */
function diaCurto(dia: string): string {
  const d = new Date(`${dia.slice(0, 10)}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return dia;
  return `${DIAS[d.getUTCDay()]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

interface Linha {
  chave: string;
  icone: LucideIcon;
  titulo: string;
  sub: string;
  quando: string;
  tom: "t" | "n" | "g";
  chip: string;
  estado?: "a_confirmar" | "confirmada" | null;
}

/**
 * Card "Próximos compromissos" do Resumo do aluno (tela 7 — W20): as próximas consultas de TODOS os profissionais do aluno (com o
 * tipo NUTRI/TREINO e se o aluno já confirmou), a próxima avaliação (NF7) e a troca do treino; o pacote de consultas (quantas
 * restam, 1 por mês) e "Agendar" (abre a Agenda nova já com o aluno — o atalho da W14).
 */
export default function CardProximosCompromissos({ alunoId }: { alunoId: string }) {
  const perfil = usePerfilAluno(alunoId);
  const p = perfil.data;
  const qc = useQueryClient();
  const [pacoteAberto, setPacoteAberto] = useState(false);
  const comp = useQuery({ queryKey: CHAVES_AGENDA.compromissos(alunoId), queryFn: () => compromissosDoAluno(alunoId), enabled: !!p, staleTime: 30_000, retry: 1 });
  const ev = useAvaliacaoDoAluno(alunoId);
  const hoje = hojeSP();

  const linhas = useMemo<Linha[]>(() => {
    const out: (Linha & { ordem: string })[] = [];
    for (const c of comp.data?.consultas ?? []) {
      const tipo = infoTipo(c.modulo);
      const titulo = c.titulo?.trim() || (c.modulo === "treino" ? "Consulta de treino" : c.modulo === "nutricao" ? "Consulta de nutrição" : "Consulta");
      out.push({
        chave: c.id, ordem: c.inicio, icone: CalendarDays, titulo,
        quando: c.dia_inteiro ? quandoConsulta(c.inicio).split(" às ")[0] : quandoConsulta(c.inicio).replace(" às ", " · "),
        sub: (c.profissional ?? "").split(" ")[0] || "", tom: tipo.tom, chip: c.modulo === "geral" ? "GERAL" : tipo.chip,
        estado: aguardandoAluno(c.status) ? "a_confirmar" : c.status === "paciente_confirmou" ? "confirmada" : null,
      });
    }
    const perfilTreino = (ev.dados?.treino?.parte.perfil ?? null) as Record<string, unknown> | null;
    const proxima = ev.dados?.treino?.proxima ?? null;
    if (proxima && proxima >= hoje) {
      out.push({ chave: "avaliacao", ordem: `${proxima}T23:58`, icone: ClipboardCheck, titulo: "Avaliação física", quando: diaCurto(proxima), sub: p?.personal?.nome?.split(" ")[0] ?? "", tom: "t", chip: "TREINO" });
    }
    const troca = typeof perfilTreino?.proxima_troca_treino === "string" ? String(perfilTreino.proxima_troca_treino).slice(0, 10) : null;
    if (troca && troca >= hoje) {
      out.push({ chave: "troca", ordem: `${troca}T23:59`, icone: Repeat, titulo: "Troca do treino", quando: diaCurto(troca), sub: "novo ciclo", tom: "t", chip: "TREINO" });
    }
    return out.sort((a, b) => a.ordem.localeCompare(b.ordem)).slice(0, 4);
  }, [comp.data, ev.dados, hoje, p?.personal?.nome]);

  // hml-18a (H-40, E): enquanto o perfil chega, o cartão-esqueleto do mesmo tamanho (antes: nada, e o card aparecia do nada)
  if (!p) return perfil.isLoading ? <CartaoCarregando className="min-h-[240px]" rotulo="Carregando os próximos compromissos" /> : null;

  const eu = p.eu;
  const responsaveis: ResponsavelPacote[] = [];
  if (p.personal) responsaveis.push({ id: p.personal.id, nome: p.personal.nome ?? "Personal", papel: "personal" });
  if (p.nutricionista && p.nutricionista.id !== p.personal?.id) responsaveis.push({ id: p.nutricionista.id, nome: p.nutricionista.nome ?? "Nutricionista", papel: "nutricionista" });
  const podeDefinir = responsaveis.filter((r) => eu.master || eu.dono || r.id === eu.id);
  const pacotes = comp.data?.pacotes ?? [];
  const carregando = comp.isLoading;
  const agendar = `/painel/agenda?aluno=${encodeURIComponent(p.paciente_id)}&novo=1`;

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-proximos-compromissos={linhas.length}>
      <CabecalhoCartao titulo="Próximos compromissos"
        acao={<Link to={agendar} className="whitespace-nowrap text-[12.5px] font-semibold text-violeta-3" data-card-compromissos-agendar>Agendar</Link>} />
      {carregando ? (
        <Esqueleto className="h-[150px] w-full" />
      ) : comp.isError ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : linhas.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-texto-3" data-card-compromissos-vazio>
          Nenhum compromisso marcado. Agende a próxima consulta: o aluno é avisado no app e confirma por lá.
        </p>
      ) : (
        <div className="divide-y divide-linha-3" data-compromissos-linhas>
          {linhas.map((l) => {
            const Icone = l.icone;
            return (
              <div key={l.chave} className="flex min-h-[60px] items-center gap-3 py-2" data-compromisso={l.chave} data-compromisso-estado={l.estado ?? ""}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha-2 bg-superficie-2 text-texto-2">
                  <Icone aria-hidden className="h-[17px] w-[17px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold tracking-[-0.01em] text-texto">{l.titulo}</b>
                  <span className="block truncate text-[12px] text-texto-3">
                    {[l.quando, l.sub].filter(Boolean).join(" · ")}
                    {l.estado === "a_confirmar" && <span className="text-ambar-3"> · a confirmar</span>}
                    {l.estado === "confirmada" && <span className="text-verde-3"> · confirmada</span>}
                  </span>
                </span>
                <Chip tom={l.tom} className="h-[24px] flex-none text-[11px]">{l.chip}</Chip>
              </div>
            );
          })}
        </div>
      )}
      {(pacotes.length > 0 || podeDefinir.length > 0) && (
        <div className="mt-auto flex items-center gap-2 border-t border-linha-3 pt-3" data-card-pacote={pacotes.map((x) => `${x.restam}/${x.total}`).join(",")}>
          <Package aria-hidden className="h-4 w-4 flex-none text-texto-3" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-texto-2">
            {pacotes.length === 0
              ? "Sem pacote de consultas"
              : pacotes.map((x) => `${textoPacote(x)}${pacotes.length > 1 && x.profissional ? ` (${x.profissional.split(" ")[0]})` : ""}`).join(" · ")}
            {pacotes.length === 1 && <span className="text-texto-4"> · {periodoDoPacote(pacotes[0])}</span>}
          </span>
          {podeDefinir.length > 0 && (
            <button type="button" onClick={() => setPacoteAberto(true)} className="flex-none text-[12px] font-semibold text-violeta-3" data-btn-pacote>
              {pacotes.length ? "Pacote" : "Definir pacote"}
            </button>
          )}
        </div>
      )}
      {podeDefinir.length > 0 && (
        <PacoteDialog open={pacoteAberto} onOpenChange={setPacoteAberto} alunoId={alunoId} aluno={p.nome} responsaveis={podeDefinir}
          inicial={eu.id} pacotes={pacotes} onSalvo={() => void qc.invalidateQueries({ queryKey: CHAVES_AGENDA.compromissos(alunoId) })} />
      )}
    </Cartao>
  );
}
