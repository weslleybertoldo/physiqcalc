import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminTagSelector from "@/components/AdminTagSelector";
import AdminPagamentosStatus from "@/components/AdminPagamentosStatus";
import ComprovanteAguardandoAluno from "@/components/admin/ComprovanteAguardandoAluno";

export type ModoPlanoCobranca = "editar" | "espelho";
/** Plano/mensalidade que a lista já tem (AlunoRow): o popup abre na hora, sem esperar o admin-get-user. */
export interface PlanoCobrancaInicial { plano_nome?: string | null; mensalidade_valor?: number | string | null }
interface Props { userId: string; modo: ModoPlanoCobranca; onSalvo?: () => void; inicial?: PlanoCobrancaInicial }

const CAMPO = "bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1.5 outline-none focus:border-primary disabled:opacity-70";

/**
 * Plano, mensalidade, tags e pagamentos de UM aluno (pedido 13/09/2026).
 * "editar" = popup "Cobrança" da tela Cobrança (grava só plano_nome/mensalidade_valor via admin-update-user);
 * "espelho" = aba Plano & Cobrança do Configurar aluno (só leitura: sem Salvar, sem criar plano, sem ações de pagamento).
 */
export default function PlanoCobrancaAluno({ userId, modo, onSalvo, inicial }: Props) {
  const somenteLeitura = modo === "espelho";
  const { user, papel } = useAuth();
  const temInicial = !!inicial;
  const [loading, setLoading] = useState(!temInicial);
  const [planoNome, setPlanoNome] = useState(inicial?.plano_nome || "");
  // catálogo de planos (physiq_planos) — compartilhado entre os alunos
  const [planos, setPlanos] = useState<string[]>([]);
  const [criandoPlano, setCriandoPlano] = useState(false);
  const [novoPlano, setNovoPlano] = useState("");
  const [salvandoPlano, setSalvandoPlano] = useState(false);
  const [mensalidade, setMensalidade] = useState(inicial?.mensalidade_valor != null && inicial.mensalidade_valor !== "" ? String(inicial.mensalidade_valor) : "");
  const [saving, setSaving] = useState(false);
  // remonta o bloco de pagamentos depois de salvar ou de confirmar/recusar um comprovante Pix
  const [pagRefresh, setPagRefresh] = useState(0);

  useEffect(() => {
    if (temInicial) return; // a lista já trouxe plano/mensalidade (mesma fonte: physiq_profiles)
    let vivo = true;
    setLoading(true);
    supabase.functions.invoke("admin-get-user", { body: { userId } }).then(({ data }) => {
      if (!vivo) return;
      const p = data?.profile;
      if (p) {
        setPlanoNome(p.plano_nome || "");
        setMensalidade(p.mensalidade_valor?.toString() || "");
      }
      setLoading(false);
    });
    return () => { vivo = false; };
  }, [userId, temInicial]);

  useEffect(() => {
    supabase.from("physiq_planos").select("nome").order("nome").then(({ data, error }) => {
      if (error) { console.error("[PlanoCobrancaAluno] planos:", error); return; }
      setPlanos((data || []).map((p) => p.nome));
    });
  }, []);

  const handleCriarPlano = async () => {
    const nome = novoPlano.trim();
    if (!nome) { toast.error("Digite o nome do plano."); return; }
    if (planos.some((p) => p.toLowerCase() === nome.toLowerCase())) { toast.error("Já existe um plano com esse nome."); return; }
    setSalvandoPlano(true);
    // professor cria plano PRÓPRIO (professor_id = ele); master cria global (null) — exigido pela RLS do catálogo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)("physiq_planos").insert({ nome, professor_id: papel === "professor" ? user?.id ?? null : null });
    setSalvandoPlano(false);
    if (error) { console.error("[PlanoCobrancaAluno] criar plano:", error); toast.error("Erro ao criar o plano."); return; }
    setPlanos((prev) => [...prev, nome].sort((a, b) => a.localeCompare(b)));
    setPlanoNome(nome);
    setNovoPlano("");
    setCriandoPlano(false);
    toast.success(`Plano "${nome}" criado.`);
  };

  const salvar = async () => {
    setSaving(true);
    const { error } = await supabase.functions.invoke("admin-update-user", {
      body: { userId, data: { plano_nome: planoNome || null, mensalidade_valor: parseFloat(mensalidade.replace(",", ".")) || null } },
    });
    setSaving(false);
    if (error) { console.error("[PlanoCobrancaAluno] salvar:", error); toast.error("Erro ao salvar plano e mensalidade."); return; }
    toast.success("Plano e mensalidade salvos.");
    setPagRefresh((v) => v + 1);
    onSalvo?.();
  };

  if (loading) return <p className="text-muted-foreground font-body text-sm" data-plano-cobranca-carregando>Carregando...</p>;

  return (
    <div className="space-y-8" data-plano-cobranca-aluno={modo}>
      {somenteLeitura && (
        <p className="text-xs text-muted-foreground font-body border border-muted-foreground/30 rounded-lg px-3 py-2" data-aviso-espelho>
          Somente leitura — plano, mensalidade e pagamentos são editados pelo botão Cobrança da tela Cobrança.
        </p>
      )}

      <section>
        <h2 className="font-heading text-lg text-foreground mb-4">Tags</h2>
        <AdminTagSelector userId={userId} readOnly={somenteLeitura} />
      </section>

      <section className="section-divider pt-8">
        <h2 className="font-heading text-lg text-foreground mb-4">Plano</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Plano</label>
            <select
              value={planoNome}
              disabled={somenteLeitura}
              onChange={(e) => {
                if (e.target.value === "__novo__") { setCriandoPlano(true); return; }
                setPlanoNome(e.target.value);
              }}
              className={CAMPO}
              data-plano-select
            >
              <option value="" className="bg-background text-foreground">Sem plano</option>
              {/* plano legado do perfil que ainda não está no catálogo continua selecionável */}
              {planoNome && !planos.includes(planoNome) && (
                <option value={planoNome} className="bg-background text-foreground">{planoNome}</option>
              )}
              {planos.map((p) => (
                <option key={p} value={p} className="bg-background text-foreground">{p}</option>
              ))}
              {!somenteLeitura && <option value="__novo__" className="bg-background text-primary">+ Criar novo plano...</option>}
            </select>
            {criandoPlano && !somenteLeitura && (
              <div className="flex items-end gap-2 mt-2">
                <input
                  type="text"
                  value={novoPlano}
                  onChange={(e) => setNovoPlano(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCriarPlano(); } }}
                  className="input-underline flex-1"
                  placeholder="Nome do novo plano"
                  autoFocus
                  data-novo-plano-input
                />
                <button type="button" onClick={handleCriarPlano} disabled={salvandoPlano}
                  className="text-xs font-heading uppercase tracking-wider bg-primary text-primary-foreground rounded-lg px-3 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0">
                  {salvandoPlano ? "Criando..." : "Criar"}
                </button>
                <button type="button" onClick={() => { setCriandoPlano(false); setNovoPlano(""); }}
                  className="text-xs font-heading uppercase tracking-wider text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground transition-colors shrink-0">
                  Cancelar
                </button>
              </div>
            )}
            {!somenteLeitura && <p className="text-xs text-muted-foreground font-body mt-1">Planos são globais — o mesmo plano pode ser usado em vários alunos</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Mensalidade (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={mensalidade}
              readOnly={somenteLeitura}
              disabled={somenteLeitura}
              onChange={(e) => setMensalidade(e.target.value)}
              className={somenteLeitura ? CAMPO : "input-underline"}
              placeholder={somenteLeitura ? "Sem cobrança" : "Ex: 150,00"}
              data-mensalidade-input
            />
            {!somenteLeitura && <p className="text-xs text-muted-foreground font-body mt-1">Vazio = sem cobrança. Aparece na aba Pagamentos do aluno (Pix e assinatura no cartão)</p>}
          </div>
        </div>
      </section>

      {/* Pagamentos do aluno: situação, assinatura, histórico/comprovantes (+ ações só no modo editar) */}
      <AdminPagamentosStatus key={pagRefresh} userId={userId} somenteLeitura={somenteLeitura} />
      {/* Comprovante Pix manual aguardando confirmação — só onde dá pra agir */}
      {!somenteLeitura && <ComprovanteAguardandoAluno userId={userId} versao={pagRefresh} onResolvido={() => setPagRefresh((v) => v + 1)} />}

      {!somenteLeitura && (
        <button type="button" onClick={salvar} disabled={saving}
          className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50"
          data-btn-salvar-cobranca>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      )}
    </div>
  );
}
