import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fmtBRL, listarAlunos, type AlunoRow } from "@/lib/saasApi";
import { invokeMp } from "@/lib/mpClient";
import { ITENS_PAGINA, ListaPaginada } from "@/components/ListaPaginada";
import ComprovantePixCard, { BadgePagamento, type PixPendente } from "@/components/admin/ComprovantePixCard";
import CobrancaAlunoDialog from "@/components/admin/CobrancaAlunoDialog";

interface BadgeInfo { s: string; ate: string | null }
interface BadgesResp { badges?: Record<string, string>; badgesData?: Record<string, BadgeInfo>; aguardando?: Record<string, string> }

/**
 * Todos os alunos do escopo (páginas de 100 = máximo do servidor). O `admin-list-users` não filtra por
 * mensalidade, então a separação com/sem mensalidade é aqui; a paginação de 20 é local.
 */
async function carregarTodosAlunos(professorId?: string): Promise<AlunoRow[]> {
  const todos: AlunoRow[] = [];
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const r = await listarAlunos({ limit: 100, offset, professorId });
    todos.push(...r.users);
    offset += r.users.length;
    if (r.users.length === 0 || offset >= r.total) break;
  }
  return todos;
}

const temMensalidade = (a: AlunoRow) => Number(a.mensalidade_valor) > 0;
const porNome = (a: AlunoRow, b: AlunoRow) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "");

const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-3 py-1.5 hover:bg-primary/10 rounded-lg transition-colors";
// cabeçalho recolhível (setinha): "Alunos sem mensalidade" e "Comprovantes aguardando confirmação"
const BTN_TOGGLE = "inline-flex items-center gap-2 font-heading text-sm uppercase tracking-wider transition-colors text-left";

// Cobrança do PROFESSOR (SaaS 12/09/2026): KPIs do admin-badges, alunos com mensalidade e comprovantes Pix pra conferir.
// 13/09/2026: o botão "Cobrança" abre um POPUP (plano, mensalidade, tags, pagamentos) — antes era um atalho pro Configurar aluno.
const CobrancaPage = () => {
  const { user, papel } = useAuth();
  // mesmo escopo da lista de Alunos: no Admin o master vê SÓ os alunos dele
  const escopo = papel === "master" ? user?.id ?? undefined : undefined;

  const [badges, setBadges] = useState<BadgesResp | null>(null);
  const [alunos, setAlunos] = useState<AlunoRow[]>([]);
  const [pendentes, setPendentes] = useState<PixPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(ITENS_PAGINA);
  // popup "Cobrança" do aluno
  const [alunoCobranca, setAlunoCobranca] = useState<AlunoRow | null>(null);
  // blocos recolhidos (setinha): alunos ainda sem mensalidade (define plano e valor no mesmo popup) e comprovantes Pix
  const [semAberto, setSemAberto] = useState(false);
  const [mostrarSem, setMostrarSem] = useState(ITENS_PAGINA);
  const [comprovantesAberto, setComprovantesAberto] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErro(null);
    try {
      const [b, p, a] = await Promise.all([
        invokeMp<BadgesResp>("admin-badges"),
        invokeMp<{ pendentes: PixPendente[] }>("admin-pix-pendentes"),
        carregarTodosAlunos(escopo),
      ]);
      setBadges(b);
      setPendentes(p.pendentes || []);
      setAlunos(a);
    } catch (e) {
      const msg = (e as { message?: string } | null)?.message;
      setErro(msg === "plano_vencido" ? "Seu plano está vencido — regularize em Planos." : "Erro ao carregar a cobrança. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const comMensalidade = useMemo(() => alunos.filter(temMensalidade), [alunos]);
  const semMensalidade = useMemo(() => alunos.filter((a) => !temMensalidade(a)).sort(porNome), [alunos]);

  const badgesData = useMemo(() => badges?.badgesData || {}, [badges]);
  const aguardando = useMemo(() => badges?.aguardando || {}, [badges]);
  const kpis = useMemo(() => {
    const valores = Object.values(badgesData);
    return {
      comMensalidade: valores.length,
      emDia: valores.filter((b) => b.s === "pago").length,
      pendentes: valores.filter((b) => b.s === "pendente").length,
      comprovantes: pendentes.length || Object.keys(aguardando).length,
    };
  }, [badgesData, aguardando, pendentes.length]);

  // comprovante pra conferir primeiro, depois pendentes, em dia e cobrança parada; dentro, por nome
  const ordenados = useMemo(() => {
    const peso = (a: AlunoRow) => aguardando[a.id] ? 0 : badgesData[a.id]?.s === "pendente" ? 1 : badgesData[a.id]?.s === "pago" ? 2 : 3;
    return [...comMensalidade].sort((a, b) => peso(a) - peso(b) || porNome(a, b));
  }, [comMensalidade, badgesData, aguardando]);

  // KPI e "comprovante para conferir": abre o bloco (se estiver recolhido) e rola até ele
  const irParaComprovantes = () => {
    setComprovantesAberto(true);
    window.setTimeout(() => document.getElementById("comprovantes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const KPI = ({ rotulo, valor, cor = "text-foreground", onClick, dataKey }: { rotulo: string; valor: number; cor?: string; onClick?: () => void; dataKey: string }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`result-card p-4 text-left ${onClick ? "hover:border-primary transition-colors cursor-pointer" : "cursor-default"}`}
      data-kpi={dataKey} data-kpi-valor={valor}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body mb-1">{rotulo}</p>
      <p className={`font-heading text-2xl ${cor}`}>{loading ? "—" : valor}</p>
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8" data-pagina-cobranca>
      <header>
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Cobrança</h1>
        <p className="text-xs text-muted-foreground font-body mt-1">Mensalidades dos seus alunos e comprovantes Pix pra conferir.</p>
      </header>

      {erro && <p className="text-sm text-destructive font-body">{erro}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI rotulo="Com mensalidade" valor={kpis.comMensalidade} dataKey="com-mensalidade" />
        <KPI rotulo="Em dia" valor={kpis.emDia} cor="text-primary" dataKey="em-dia" />
        <KPI rotulo="Pendentes" valor={kpis.pendentes} cor={kpis.pendentes > 0 ? "text-destructive" : "text-foreground"} dataKey="pendentes" />
        <KPI rotulo="Comprovantes aguardando" valor={kpis.comprovantes} cor={kpis.comprovantes > 0 ? "text-primary" : "text-foreground"} onClick={irParaComprovantes} dataKey="comprovantes" />
      </div>

      {/* Alunos com mensalidade */}
      <section className="space-y-2">
        <h2 className="font-heading text-sm text-foreground uppercase tracking-wider">Alunos com mensalidade</h2>
        {loading ? (
          <p className="text-muted-foreground font-body text-sm">Carregando...</p>
        ) : ordenados.length === 0 ? (
          <p className="text-muted-foreground font-body text-sm" data-cobranca-vazio>
            {alunos.length === 0
              ? "Nenhum aluno na sua lista ainda."
              : "Nenhum aluno com mensalidade. Use o botão Cobrança de um aluno abaixo pra definir o plano e o valor."}
          </p>
        ) : (
          <>
            <div className="space-y-0">
              {ordenados.slice(0, mostrar).map((a) => {
                const badge = badgesData[a.id];
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-3 border-b border-muted-foreground/30" data-cobranca-aluno={a.id}>
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-sm text-foreground truncate">{a.nome || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground font-body truncate">{a.email}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {a.user_code && <span className="text-xs text-muted-foreground font-body">ID: {a.user_code}</span>}
                        <span className="text-xs text-foreground font-body">{fmtBRL(a.mensalidade_valor)}/mês</span>
                        {a.plano_nome && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 font-body">{a.plano_nome}</span>}
                        {badge ? (
                          <BadgePagamento badge={badge} />
                        ) : (
                          <span className="text-xs font-heading uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">cobrança parada</span>
                        )}
                        {aguardando[a.id] && (
                          <button type="button" onClick={irParaComprovantes}
                            className="inline-flex items-center gap-1 text-xs font-heading uppercase px-2 py-0.5 rounded-full border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
                            data-badge-comprovante={a.id}>
                            <Receipt size={11} /> comprovante para conferir
                          </button>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => setAlunoCobranca(a)} className={`${BTN_SEC} shrink-0`} data-btn-cobranca={a.id}>
                      Cobrança
                    </button>
                  </div>
                );
              })}
            </div>
            <ListaPaginada total={ordenados.length} mostrando={mostrar} onVerMais={() => setMostrar((m) => m + ITENS_PAGINA)} rotulo="alunos" />
          </>
        )}
      </section>

      {/* Alunos sem mensalidade: recolhido; o mesmo popup define plano e valor */}
      {!loading && semMensalidade.length > 0 && (
        <section className="space-y-2" data-secao-sem-mensalidade>
          <button type="button" onClick={() => setSemAberto((v) => !v)} aria-expanded={semAberto}
            className={`${BTN_TOGGLE} text-muted-foreground hover:text-foreground`}
            data-btn-sem-mensalidade>
            {semAberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Alunos sem mensalidade ({semMensalidade.length}) — definir cobrança
          </button>
          {semAberto && (
            <>
              <div className="space-y-0" data-lista-sem-mensalidade>
                {semMensalidade.slice(0, mostrarSem).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-3 border-b border-muted-foreground/30" data-cobranca-aluno-sem={a.id}>
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-sm text-foreground truncate">{a.nome || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground font-body truncate">{a.email}</p>
                      {a.user_code && <span className="text-xs text-muted-foreground font-body">ID: {a.user_code}</span>}
                    </div>
                    <button type="button" onClick={() => setAlunoCobranca(a)} className={`${BTN_SEC} shrink-0`} data-btn-cobranca={a.id}>
                      Cobrança
                    </button>
                  </div>
                ))}
              </div>
              <ListaPaginada total={semMensalidade.length} mostrando={mostrarSem} onVerMais={() => setMostrarSem((m) => m + ITENS_PAGINA)} rotulo="alunos" />
            </>
          )}
        </section>
      )}

      {/* Comprovantes Pix aguardando confirmação — recolhido (setinha), igual ao bloco "sem mensalidade"; pedido 13/09/2026 */}
      <section id="comprovantes" className="space-y-3 scroll-mt-4" data-secao-comprovantes>
        <button type="button" onClick={() => setComprovantesAberto((v) => !v)} aria-expanded={comprovantesAberto}
          className={`${BTN_TOGGLE} ${pendentes.length > 0 ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"}`}
          data-btn-comprovantes>
          {comprovantesAberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Comprovantes aguardando confirmação {!loading && `(${pendentes.length})`}
        </button>
        {comprovantesAberto && (
          <>
            <p className="text-xs text-muted-foreground font-body">
              O aluno pagou o Pix na sua chave e anexou o comprovante. Confira o valor e o mês antes de confirmar — ao confirmar, ele fica em dia.
            </p>
            {loading ? (
              <p className="text-muted-foreground font-body text-sm">Carregando...</p>
            ) : pendentes.length === 0 ? (
              <p className="text-muted-foreground font-body text-sm" data-comprovantes-vazio>Nenhum comprovante aguardando.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {pendentes.map((p) => (
                  <ComprovantePixCard key={p.id} item={p} onResolvido={() => { void carregar(true); }} />
                ))}
              </div>
            )}
            {papel === "master" && (
              <p className="text-[11px] text-muted-foreground font-body">
                Seus alunos pagam pelo Mercado Pago (integração) — comprovantes Pix só aparecem aqui se algum aluno seu estiver em modo Pix manual.
              </p>
            )}
          </>
        )}
      </section>

      {/* popup Cobrança do aluno (plano, mensalidade, tags, pagamentos) — recarrega a tela ao salvar */}
      <CobrancaAlunoDialog aluno={alunoCobranca} onFechar={() => setAlunoCobranca(null)} onSalvo={() => { void carregar(true); }} />
    </div>
  );
};

export default CobrancaPage;
