import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Lock } from "lucide-react";
import { resumoRegistro } from "@/nutricao/editor/lib/prontuarioUtil";
import { textoAnotacoes } from "@/nutricao/prontuario/lib/acesso";
import { useAnotacoes } from "@/nutricao/prontuario/lib/anotacoes";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";

/**
 * Card "Prontuário" do Resumo do aluno (W18 — tela 7): as últimas anotações da equipe (foto, "dd/mm · autor" e o texto), as do
 * personal e as da nutricionista na mesma linha do tempo, e "Nova anotação". Mostra só o que quem abre pode ler: o personal não
 * recebe as "Só nutricionistas" (o banco filtra — aluno_anotacoes, W18).
 */
export default function CardProntuario({ alunoId }: { alunoId: string }) {
  const q = useAnotacoes(alunoId, 3);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}/prontuario`;
  const d = q.data;
  const lista = d?.anotacoes ?? [];
  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-prontuario={d?.paciente_id ?? ""} data-card-prontuario-total={d?.total ?? 0}>
      <CabecalhoCartao
        titulo="Prontuário"
        acao={
          <Link to={`${base}?nova=anotacao`} className="whitespace-nowrap text-[12.5px] font-semibold text-violeta-3" data-card-prontuario-nova>
            Nova anotação
          </Link>
        }
      />
      {q.isLoading ? (
        <Esqueleto className="h-[150px] w-full" />
      ) : q.error || !d ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : lista.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-texto-3" data-card-prontuario-vazio>
          Nenhuma anotação ainda. O que o personal e a nutricionista registrarem sobre o aluno aparece aqui.
        </p>
      ) : (
        <div data-card-prontuario-notas>
          {lista.map((a) => (
            <div key={a.id} className="flex gap-[11px] border-t border-[rgba(255,255,255,.06)] py-2.5 first:border-t-0 first:pt-0.5" data-nota={a.id} data-nota-visibilidade={a.visibilidade}>
              <Avatar src={a.autor_foto} nome={a.autor_nome} tamanho={30} className="flex-none" />
              <div className="min-w-0 flex-1 text-[13px] leading-[1.45] text-texto">
                <span className="mb-0.5 flex items-center gap-1 text-[11.5px] text-texto-3" data-nota-cabecalho>
                  {format(new Date(a.data), "dd/MM")} · {a.autor_nome ?? "Profissional"}
                  {a.visibilidade === "nutricionistas" && <Lock aria-label="Só nutricionistas" className="h-3 w-3 text-verde-3" />}
                </span>
                <span className="line-clamp-3" data-nota-texto>{resumoRegistro(a.texto, 160)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link to={base} className="mt-auto pt-3 text-[12px] font-semibold text-texto-3 hover:text-texto-2" data-card-prontuario-abrir>
        {d && d.total > 0 ? `Ver o prontuário (${textoAnotacoes(d.total)})` : "Abrir o prontuário"}
      </Link>
    </Cartao>
  );
}
