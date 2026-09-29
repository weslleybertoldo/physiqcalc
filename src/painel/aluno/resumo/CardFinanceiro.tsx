import { Link } from "react-router-dom";
import { ordenarCobrancas, reaisCurto } from "@/financeiro/regras";
import { LinhaCobranca } from "@/financeiro/ui/LinhaCobranca";
import { useFinanceiroDoAluno } from "@/financeiro/ui/useFinanceiroDoAluno";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";

/**
 * Card "Financeiro" do Resumo do aluno (tela 7): "R$ 249/MÊS", "Emitir recibo" e as últimas cobranças — a que está em aberto
 * (A VENCER, AGUARDANDO…) e as últimas pagas com o ✓.
 */
export default function CardFinanceiro({ alunoId }: { alunoId: string }) {
  const f = useFinanceiroDoAluno(alunoId);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}/financeiro`;
  const d = f.data;
  const lista = d ? ordenarCobrancas(d.cobrancas) : [];
  const abertas = lista.filter((c) => c.status === "aberta" || c.status === "aguardando_confirmacao");
  const pagas = lista.filter((c) => c.status === "paga");
  const linhas = [...abertas.slice(0, 1), ...pagas.slice(0, 3 - Math.min(1, abertas.length))];
  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-financeiro>
      <CabecalhoCartao
        titulo="Financeiro"
        extra={d?.mensalidade ? <Chip tom="g">{reaisCurto(d.mensalidade.valor)}/MÊS</Chip> : undefined}
        acao={<Link to={`${base}?recibo=novo`} className="whitespace-nowrap text-[12.5px] font-semibold text-violeta-3" data-card-financeiro-recibo>Emitir recibo</Link>}
      />
      {f.isLoading ? (
        <Esqueleto className="h-[132px] w-full" />
      ) : !d ? (
        <p className="text-[12.5px] text-texto-3">Não deu para carregar agora.</p>
      ) : linhas.length === 0 ? (
        <p className="text-[12.5px] text-texto-3" data-card-financeiro-vazio>
          {d.mensalidade ? "Nenhuma cobrança ainda." : "Sem mensalidade. Defina o plano e o valor na aba Financeiro."}
        </p>
      ) : (
        <div data-card-financeiro-linhas>
          {linhas.map((c) => (
            <LinhaCobranca key={c.id} cobranca={c} hoje={d.hoje} />
          ))}
        </div>
      )}
      <Link to={base} className="mt-auto pt-3 text-[12px] font-semibold text-texto-3 hover:text-texto-2" data-card-financeiro-abrir>
        {linhas.length ? `Ver o financeiro (${lista.length} ${lista.length === 1 ? "cobrança" : "cobranças"})` : "Abrir o financeiro"}
      </Link>
    </Cartao>
  );
}

