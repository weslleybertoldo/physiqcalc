import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { MASTER_ITEMS } from "@/components/AppSidebar";
import { listarAlunos, masterFinanceiro, masterProfessores, planoComValor, type FinanceiroLinha } from "@/lib/saasApi";
import {
  BTN_MINI_NEUTRO, Carregando, ErroCarregar, Etiqueta, KpiCard, Secao, TituloPagina, Vazio, fmtDiaMes, mensagemErro, situacaoInfo,
} from "@/components/master/masterUi";

interface Resumo { total: number; travados: number; emTolerancia: number; emDia: number; trial: number }
interface FinList { professores: FinanceiroLinha[]; total: number; resumo: Resumo; tolerancia: number; hoje: string }
interface Numeros {
  profAtivos: number; profSuspensos: number; alunos: number; semProfessor: number;
  resumo: Resumo; atencao: FinanceiroLinha[]; tolerancia: number;
}

// Visão geral do MASTER: KPIs (professores, alunos, cobrança) + quem precisa de atenção + atalhos.
const VisaoGeralPage = () => {
  const [dados, setDados] = useState<Numeros | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [ativos, suspensos, alunos, semProf, fin, atrasados] = await Promise.all([
        masterProfessores<{ total: number }>("list", { status: "ativo", limit: 1 }),
        masterProfessores<{ total: number }>("list", { status: "suspenso", limit: 1 }),
        listarAlunos({ limit: 1 }),
        listarAlunos({ limit: 1, semProfessor: true }),
        // resumo é calculado DEPOIS do filtro na edge → pega com "todos"
        masterFinanceiro<FinList>("list", { filtro: "todos", limit: 1 }),
        // travados primeiro, depois em tolerância (ordem da edge)
        masterFinanceiro<FinList>("list", { filtro: "atrasados", limit: 5 }),
      ]);
      setDados({
        profAtivos: ativos.total, profSuspensos: suspensos.total, alunos: alunos.total, semProfessor: semProf.total,
        resumo: fin.resumo, atencao: atrasados.professores, tolerancia: fin.tolerancia,
      });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const atalhos = MASTER_ITEMS.filter((i) => i.url !== "/master");

  return (
    <div data-pagina="master-visao-geral">
      <TituloPagina
        titulo="Visão geral"
        sub="Professores, alunos e cobrança num só lugar."
        acao={(
          <button type="button" onClick={() => void carregar()} disabled={loading} className={BTN_MINI_NEUTRO} data-btn-atualizar>
            <RefreshCw size={11} className={`inline mr-1 ${loading ? "animate-spin" : ""}`} />Atualizar
          </button>
        )}
      />

      {erro && <ErroCarregar texto={erro} onRetry={() => void carregar()} />}
      {loading && !dados ? <Carregando /> : dados && (
        <>
          <Secao titulo="Pessoas">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <KpiCard rotulo="Professores ativos" valor={dados.profAtivos} to="/master/professores?status=ativo" tom="ok" data-kpi="prof-ativos" />
              <KpiCard rotulo="Professores suspensos" valor={dados.profSuspensos} to="/master/professores?status=suspenso" tom={dados.profSuspensos > 0 ? "ruim" : "neutro"} data-kpi="prof-suspensos" />
              <KpiCard rotulo="Alunos (total)" valor={dados.alunos} to="/master/alunos" data-kpi="alunos" />
              <KpiCard rotulo="Alunos sem professor" valor={dados.semProfessor} to="/master/alunos?semProfessor=1" tom={dados.semProfessor > 0 ? "aviso" : "neutro"} data-kpi="alunos-sem-professor" />
            </div>
          </Secao>

          <Secao titulo="Cobrança dos professores" acao={<span className="text-[10px] text-muted-foreground font-body">tolerância {dados.tolerancia} dias</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <KpiCard rotulo="Travados" valor={dados.resumo.travados} to="/master/financeiro?filtro=travados" tom={dados.resumo.travados > 0 ? "ruim" : "neutro"} data-kpi="travados" />
              <KpiCard rotulo="Em tolerância" valor={dados.resumo.emTolerancia} to="/master/financeiro?filtro=atrasados" tom={dados.resumo.emTolerancia > 0 ? "aviso" : "neutro"} data-kpi="em-tolerancia" />
              <KpiCard rotulo="Em dia" valor={dados.resumo.emDia} to="/master/financeiro?filtro=em_dia" tom="ok" data-kpi="em-dia" />
              <KpiCard rotulo="Teste grátis / sem adesão" valor={dados.resumo.trial} to="/master/financeiro?filtro=trial" data-kpi="trial" />
            </div>
          </Secao>

          <Secao
            titulo="Precisam de atenção"
            acao={(
              <Link to="/master/financeiro?filtro=atrasados" className="text-[10px] font-heading uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1">
                Ver no Financeiro <ArrowRight size={11} />
              </Link>
            )}
          >
            {dados.atencao.length === 0 ? (
              <Vazio texto="Ninguém travado ou em tolerância. Tudo em dia." />
            ) : (
              <div className="border border-muted-foreground/30 divide-y divide-muted-foreground/30" data-lista-atencao>
                {dados.atencao.map((l) => (
                  <Link
                    key={l.id}
                    to={`/master/financeiro?filtro=atrasados&professorId=${l.id}`}
                    className="flex items-start gap-3 p-3 hover:bg-primary/5 transition-colors"
                    data-atencao-linha={l.id}
                  >
                    <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${l.situacao === "travado" ? "text-destructive" : "text-classify-yellow"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-heading text-sm text-foreground truncate">{l.nome}</span>
                        <span className="text-xs text-primary font-body">{planoComValor(l.plano)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-muted-foreground font-body">
                        <span>venceu {fmtDiaMes(l.cicloVenceEm)}</span>
                        {l.diasAtraso !== null && l.diasAtraso > 0 && <span className="text-destructive">{l.diasAtraso} d de atraso</span>}
                        <span>{l.alunos} aluno(s)</span>
                        <Etiqueta cls={situacaoInfo(l.situacao).cls} className="!text-[10px]">{situacaoInfo(l.situacao).label}</Etiqueta>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Secao>

          <Secao titulo="Atalhos">
            <div className="flex flex-wrap gap-2">
              {atalhos.map((i) => (
                <Link
                  key={i.url}
                  to={i.url}
                  className="inline-flex items-center gap-2 border border-muted-foreground/30 px-3 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors"
                  data-atalho={i.url}
                >
                  <i.icon className="h-3.5 w-3.5" />{i.title}
                </Link>
              ))}
              <Link
                to="/admin/alunos"
                className="inline-flex items-center gap-2 border border-primary/40 px-3 py-2 text-xs font-heading uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
                data-atalho="/admin/alunos"
              >
                Admin · meus alunos
              </Link>
            </div>
          </Secao>
        </>
      )}
    </div>
  );
};

export default VisaoGeralPage;
