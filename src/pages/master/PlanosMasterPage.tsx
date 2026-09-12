import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ListaPaginada, usePaginado } from "@/components/ListaPaginada";
import { useAuth } from "@/hooks/useAuth";
import { fmtBRL, fmtDataHora, masterPlanos, masterProfessores, type PlanoProfessor, type ProfessorRow } from "@/lib/saasApi";
import PlanoEditModal from "@/components/master/PlanoEditModal";
import {
  BTN_PRIMARIO, BTN_SECUNDARIO, Campo, Carregando, ErroCarregar, Etiqueta, INPUT, LINHA, REGRA_LABEL, Secao, TituloPagina, Vazio,
  mensagemErro, numOuNull, resumoHistorico, usePlanosMaster, type RegrasGerais,
} from "@/components/master/masterUi";

interface HistRow {
  id: number | string; plano_id: string | null; plano_nome: string | null; professor_id: string | null; professor_nome: string | null;
  alterado_por: string | null; alterado_em: string; antes: unknown; depois: unknown;
}
type ChaveRegra = keyof RegrasGerais;
const REGRAS: { k: ChaveRegra; min: number; max: number; dica: string; prefixo?: string }[] = [
  { k: "adesao_professor", min: 0, max: 100000, dica: "Cobrada uma vez, antes do 1º ciclo.", prefixo: "R$" },
  { k: "tolerancia_dias", min: 0, max: 90, dica: "Dias após o vencimento antes de travar." },
  { k: "trial_dias", min: 0, max: 365, dica: "Teste grátis de quem vira professor." },
  { k: "itens_pagina", min: 5, max: 100, dica: "Tamanho das listas (padrão 20)." },
];
const faixaAlunos = (p: PlanoProfessor) => (p.max_alunos == null ? `${p.min_alunos}+ alunos · ilimitado` : `${p.min_alunos}–${p.max_alunos} alunos`);

// Planos (master): catálogo de planos dos professores, regras gerais e histórico de alterações.
const PlanosMasterPage = () => {
  const { user } = useAuth();
  const { hash } = useLocation();
  const { planos, regras, loading, erro, recarregar } = usePlanosMaster();
  const [editando, setEditando] = useState<PlanoProfessor | "novo" | null>(null);

  // vindo de Configurações ("Editar em Planos" → /master/planos#regras): o router não rola até a âncora sozinho
  useEffect(() => {
    if (hash === "#regras" && regras) document.getElementById("regras")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, regras]);

  const [regrasForm, setRegrasForm] = useState<Record<ChaveRegra, string>>({ adesao_professor: "", tolerancia_dias: "", trial_dias: "", itens_pagina: "" });
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  useEffect(() => {
    if (regras) {
      setRegrasForm({
        adesao_professor: String(regras.adesao_professor), tolerancia_dias: String(regras.tolerancia_dias),
        trial_dias: String(regras.trial_dias), itens_pagina: String(regras.itens_pagina),
      });
    }
  }, [regras]);

  const fetchHist = useCallback((offset: number, limit: number) =>
    masterPlanos<{ historico: HistRow[]; total: number }>("historico", { limit, offset }).then((r) => ({ itens: r.historico, total: r.total })), []);
  const hist = usePaginado<HistRow>(fetchHist, []);

  const [nomesProf, setNomesProf] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    masterProfessores<{ professores: ProfessorRow[] }>("list", { limit: 100 })
      .then((r) => setNomesProf(new Map(r.professores.map((p) => [p.id, p.nome]))))
      .catch(() => { /* só pra nomear "quem"; não bloqueia */ });
  }, []);

  const nomePlano = (id: string | null | undefined) => (id ? planos.find((p) => p.id === id)?.nome ?? "plano removido" : "sem plano");
  const quem = (id: string | null) => (!id ? "—" : id === user?.id ? "você (master)" : nomesProf.get(id) ?? "professor");
  const aposSalvar = () => { void recarregar(); void hist.recarregar(); };

  const salvarRegras = async () => {
    if (!regras) return;
    const payload: Record<string, number> = {};
    for (const r of REGRAS) {
      const n = numOuNull(regrasForm[r.k]);
      if (n == null || n < r.min || n > r.max) { toast.error(`${REGRA_LABEL[r.k]}: informe um valor entre ${r.min} e ${r.max}.`); return; }
      if (n !== regras[r.k]) payload[r.k] = n;
    }
    if (!Object.keys(payload).length) { toast.info("Nada mudou nas regras."); return; }
    setSalvandoRegras(true);
    try {
      await masterPlanos("set-regras", payload);
      toast.success("Regras salvas.");
      aposSalvar();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setSalvandoRegras(false);
    }
  };

  return (
    <div data-pagina="master-planos">
      <TituloPagina
        titulo="Planos"
        sub="Planos dos professores (pós-pago: adesão → 30 dias → mensalidade). Valor sempre ao lado do nome."
        acao={(
          <button type="button" onClick={() => setEditando("novo")} className={BTN_PRIMARIO} data-btn-novo-plano>
            <Plus size={12} className="inline mr-1 -mt-0.5" />Novo plano
          </button>
        )}
      />

      {erro && <ErroCarregar texto={erro} onRetry={() => void recarregar()} />}
      {loading && planos.length === 0 ? <Carregando /> : planos.length === 0 ? (
        <Vazio texto="Nenhum plano cadastrado ainda." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-lista-planos>
          {planos.map((p) => (
            <div key={p.id} className={`border p-4 flex flex-col gap-2 ${p.ativo ? "border-muted-foreground/30" : "border-muted-foreground/20 opacity-70"}`} data-plano-card={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading text-base text-foreground truncate">{p.nome}</p>
                  <p className="text-[11px] text-muted-foreground font-body">{faixaAlunos(p)}</p>
                </div>
                {p.ativo ? <Etiqueta tom="ok">Ativo</Etiqueta> : <Etiqueta>Desativado</Etiqueta>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-body">
                <span className="text-foreground">{fmtBRL(p.valor_mensal)}<span className="text-muted-foreground">/mês</span></span>
                <span className="text-foreground">
                  {fmtBRL(p.valor_anual_efetivo ?? Number(p.valor_mensal) * 10)}
                  <span className="text-muted-foreground">/ano{p.valor_anual == null ? " (10× auto)" : ""}</span>
                </span>
                <span className="text-muted-foreground">{p.professores ?? 0} professor(es)</span>
              </div>
              <button type="button" onClick={() => setEditando(p)} className={`${BTN_SECUNDARIO} self-start`} data-btn-editar-plano>Editar</button>
            </div>
          ))}
        </div>
      )}

      <Secao id="regras" titulo="Regras gerais">
        {regras ? (
          <div className="border border-muted-foreground/30 p-4 space-y-4" data-regras>
            <div className="grid grid-cols-2 gap-3">
              {REGRAS.map((r) => (
                <Campo key={r.k} rotulo={REGRA_LABEL[r.k]} dica={r.dica}>
                  <div className="flex items-center gap-1">
                    {r.prefixo && <span className="text-xs text-muted-foreground font-body">{r.prefixo}</span>}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={regrasForm[r.k]}
                      onChange={(e) => setRegrasForm((f) => ({ ...f, [r.k]: e.target.value }))}
                      className={INPUT}
                      data-input-regra={r.k}
                    />
                  </div>
                </Campo>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => void salvarRegras()} disabled={salvandoRegras} className={BTN_PRIMARIO} data-btn-salvar-regras>
                {salvandoRegras ? "Salvando..." : "Salvar regras"}
              </button>
            </div>
          </div>
        ) : <Carregando />}
      </Secao>

      <Secao titulo="Histórico de alterações">
        {hist.erro && <ErroCarregar texto={mensagemErro(hist.erro)} onRetry={() => void hist.recarregar()} />}
        {hist.loading ? <Carregando /> : hist.itens.length === 0 ? (
          <Vazio texto="Nenhuma alteração registrada." />
        ) : (
          <div data-lista-historico>
            {hist.itens.map((h) => (
              <div key={h.id} className={LINHA} data-hist-linha={h.id}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground font-body">
                  <span>{fmtDataHora(h.alterado_em)}</span>
                  <span>· por {quem(h.alterado_por)}</span>
                  {h.plano_nome && <span>· plano <span className="text-primary">{h.plano_nome}</span></span>}
                  {h.professor_nome && <span>· prof. <span className="text-foreground">{h.professor_nome}</span></span>}
                  {!h.plano_id && !h.professor_id && <span>· regras</span>}
                </div>
                <p className="text-sm text-foreground font-body mt-0.5 break-words">{resumoHistorico(h, nomePlano)}</p>
              </div>
            ))}
            <ListaPaginada total={hist.total} mostrando={hist.itens.length} carregandoMais={hist.carregandoMais} onVerMais={hist.verMais} rotulo="alterações" />
          </div>
        )}
      </Secao>

      <PlanoEditModal plano={editando} onClose={() => setEditando(null)} onSalvo={aposSalvar} />
    </div>
  );
};

export default PlanosMasterPage;
