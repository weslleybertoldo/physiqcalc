import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { faixaDeIdade, idadeDe } from "@/painel/aluno/dados/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { decidirPendente, ErroAlunos, listarPendentes, type CadastroPendente } from "./api";
import { formatarTelefone, mensagemErroAlunos, type ListaAlunos } from "./regras";

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.length === 10 ? `${iso}T12:00:00` : iso}`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Pendentes (N-57, spec 4.4): quem se cadastrou pelo link /c/ do profissional espera aqui. Aprovar cria o aluno na conta (com o
 * dono do link como responsável) e respeita o limite da faixa; recusar só tira da fila.
 * hml-12 (H-30): a regra dos menores pela data de nascimento do cadastro — 16 ou 17 anos: a dica de registrar o consentimento do
 * responsável na ficha depois de aprovar; menor de 16: não dá para aprovar (o gatilho do banco recusaria, e a função alunos devolveria
 * 500). SÓ no build de staging até a virada (a condição do Vite direto aqui).
 */
export function Pendentes({ aberto, aoMudar, lista, aoMudou }: { aberto: boolean; aoMudar: (a: boolean) => void; lista: ListaAlunos; aoMudou: () => void }) {
  const celular = useIsMobile();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["alunos-pendentes", lista.conta.id], queryFn: () => listarPendentes(lista.conta.id), enabled: aberto, staleTime: 10_000 });
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [indo, setIndo] = useState<string | null>(null);

  const decidir = async (p: CadastroPendente, aprovar: boolean) => {
    setIndo(p.id);
    setErro(null);
    try {
      await decidirPendente(lista.conta.id, p.id, aprovar);
      toast.success(aprovar ? `${p.nome} entrou na lista.` : `Cadastro de ${p.nome} recusado.`);
      void qc.invalidateQueries({ queryKey: ["alunos-pendentes", lista.conta.id] });
      aoMudou();
    } catch (e) {
      setErro({ id: p.id, texto: mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null, e instanceof ErroAlunos ? e.extra : {}) });
    } finally {
      setIndo(null);
    }
  };

  const itens = q.data ?? [];
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo="Cadastros pendentes"
      descricao="Quem se cadastrou pelo seu link de cadastro. Aprovar põe a pessoa na lista de alunos (dentro do limite do plano).">
      <div className="flex flex-col pt-1" data-pendentes={itens.length}>
        {q.isLoading ? (
          <p className="text-[13px] text-texto-3">Carregando…</p>
        ) : itens.length === 0 ? (
          <EstadoVazio icone={Inbox} titulo="Nada esperando" texto="Os cadastros feitos pelo seu link aparecem aqui para você aprovar." />
        ) : (
          itens.map((p) => {
            const faixa = faixaDeIdade(p.nascimento);
            return (
              <div key={p.id} className="flex flex-col gap-2 border-t border-linha-3 py-3.5 first:border-t-0" data-pendente={p.id} data-pendente-nome={p.nome}>
                <div className="flex items-center gap-3">
                  <Avatar nome={p.nome} tamanho={40} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-semibold text-texto">{p.nome}</b>
                    <span className="block truncate text-[12px] text-texto-3">
                      {[p.email, formatarTelefone(p.telefone), p.nascimento ? `nasc. ${dataCurta(p.nascimento)}` : ""].filter(Boolean).join(" · ")}
                    </span>
                    <span className="block truncate text-[12px] text-texto-3">
                      pelo link de {p.profissional?.nome ?? "um profissional"} · {dataCurta(p.criado_em)}
                    </span>
                  </div>
                </div>
                {p.observacoes && <p className="rounded-xl bg-superficie px-3 py-2 text-[12.5px] text-texto-2">{p.observacoes}</p>}
                {import.meta.env.VITE_DB_SCHEMA === "staging" && (faixa === "16_17" || faixa === "menor_16") && (
                  <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ambar-3" data-pendente-idade={faixa}>
                    <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" />
                    <span>
                      {faixa === "menor_16"
                        ? "Menor de 16 anos: não dá para aprovar."
                        : `${idadeDe(p.nascimento)} anos: depois de aprovar, registre o consentimento do responsável na ficha.`}
                    </span>
                  </p>
                )}
                {erro?.id === p.id && <MensagemForm data-pendente-erro>{erro.texto}</MensagemForm>}
                <div className="flex gap-2">
                  <Botao variante="w" tamanho="sm" icone={Check} disabled={indo === p.id || (import.meta.env.VITE_DB_SCHEMA === "staging" && faixa === "menor_16")}
                    onClick={() => void decidir(p, true)} data-pendente-aprovar={p.id}>Aprovar</Botao>
                  <Botao tamanho="sm" icone={X} disabled={indo === p.id} onClick={() => void decidir(p, false)} data-pendente-recusar={p.id}>Recusar</Botao>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PainelDeslizante>
  );
}
