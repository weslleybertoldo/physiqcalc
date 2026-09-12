import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ITENS_PAGINA, ListaPaginada } from "@/components/ListaPaginada";
import { fmtDataHora, masterProfessores } from "@/lib/saasApi";
import {
  Carregando, ErroCarregar, Etiqueta, INPUT, INTEGRACAO_LABEL, LINHA, SELECT_CONTENT, SELECT_TRIGGER, TituloPagina, Vazio, mensagemErro, useDebounce,
} from "@/components/master/masterUi";

type TipoIntegracao = "mercadopago" | "pix_manual" | "none";
interface Integracao {
  professorId: string; nome: string; email: string | null; status: string; temPix: boolean; pixExibir: boolean | null;
  tipo: TipoIntegracao; config: Record<string, unknown> | null; atualizadoEm: string | null; ehMaster: boolean;
}

// Integrações (master): como cada professor recebe dos alunos (Pix manual | sem integração | Mercado Pago só no master).
const IntegracoesPage = () => {
  const [itens, setItens] = useState<Integracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const qDeb = useDebounce(q.trim().toLowerCase(), 300);
  const [mostrando, setMostrando] = useState(ITENS_PAGINA);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const r = await masterProfessores<{ integracoes: Integracao[] }>("integracoes-list");
      setItens(r.integracoes);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setMostrando(ITENS_PAGINA); }, [qDeb]);

  const filtrados = useMemo(
    () => itens.filter((i) => !qDeb || i.nome.toLowerCase().includes(qDeb) || (i.email ?? "").toLowerCase().includes(qDeb)),
    [itens, qDeb],
  );

  const setTipo = async (i: Integracao, tipo: TipoIntegracao) => {
    if (tipo === i.tipo) return;
    setBusyId(i.professorId);
    try {
      await masterProfessores("integracao-set", { professorId: i.professorId, tipo });
      setItens((prev) => prev.map((x) => (x.professorId === i.professorId ? { ...x, tipo, atualizadoEm: new Date().toISOString() } : x)));
      toast.success(`${i.nome}: ${INTEGRACAO_LABEL[tipo]}.`);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusyId(null);
    }
  };

  const resumo = useMemo(() => ({
    pix: itens.filter((i) => i.tipo === "pix_manual").length,
    none: itens.filter((i) => i.tipo === "none").length,
    mp: itens.filter((i) => i.tipo === "mercadopago").length,
    semChave: itens.filter((i) => i.tipo === "pix_manual" && !i.temPix).length,
  }), [itens]);

  return (
    <div data-pagina="master-integracoes">
      <TituloPagina titulo="Integrações" sub="Como cada professor recebe a mensalidade dos alunos dele." />

      <div className="border border-primary/30 bg-primary/5 p-3 mb-5 text-xs font-body text-muted-foreground space-y-1" data-explicacao>
        <p><span className="text-foreground">Pix manual</span> = o aluno vê a chave Pix do professor na tela Pagamentos, paga por fora e anexa o comprovante; o professor confirma no Admin › Cobrança.</p>
        <p><span className="text-foreground">Sem integração</span> = o aluno não vê opção de pagamento no app.</p>
        <p><span className="text-foreground">Mercado Pago</span> = só na conta do Weslley (por enquanto): Pix/cartão automáticos pelo app.</p>
        {!loading && (
          <p className="pt-1 text-[11px]">
            {resumo.pix} Pix manual · {resumo.none} sem integração · {resumo.mp} Mercado Pago
            {resumo.semChave > 0 && <span className="text-classify-yellow"> · {resumo.semChave} em Pix manual SEM chave cadastrada</span>}
          </p>
        )}
      </div>

      <div className="relative mb-5">
        <Search size={14} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar professor..." className={`${INPUT} pl-6`} data-input-busca-integracao />
      </div>

      {erro && <ErroCarregar texto={erro} onRetry={() => void carregar()} />}
      {loading ? <Carregando /> : filtrados.length === 0 ? (
        <Vazio texto="Nenhum professor encontrado." />
      ) : (
        <div data-lista-integracoes>
          {filtrados.slice(0, mostrando).map((i) => {
            const recriar = !!(i.config as { recriar_assinatura?: boolean } | null)?.recriar_assinatura;
            return (
              <div key={i.professorId} className={`${LINHA} flex flex-col sm:flex-row sm:items-center gap-2 ${busyId === i.professorId ? "opacity-60" : ""}`} data-integracao-linha={i.professorId}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-heading text-sm text-foreground truncate">{i.nome}</p>
                    {i.ehMaster && <Etiqueta tom="ok" className="!text-[10px]">Master</Etiqueta>}
                    {i.status === "suspenso" && <Etiqueta tom="ruim" className="!text-[10px]">Suspenso</Etiqueta>}
                  </div>
                  <p className="text-xs text-muted-foreground font-body truncate">{i.email || "—"}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    {i.temPix ? (
                      <Etiqueta tom="ok" className="!text-[10px]" data-pix="ok">Pix cadastrado · {i.pixExibir === false ? "oculto do aluno" : "exibido ao aluno"}</Etiqueta>
                    ) : (
                      <Etiqueta tom={i.tipo === "pix_manual" ? "aviso" : "neutro"} className="!text-[10px]" data-pix="sem">Sem chave Pix{i.tipo === "pix_manual" ? " — alunos não conseguem pagar" : ""}</Etiqueta>
                    )}
                    {recriar && <Etiqueta tom="aviso" className="!text-[10px]">assinatura MP precisa ser recriada</Etiqueta>}
                    {i.atualizadoEm && <span className="text-[10px] text-muted-foreground font-body">atualizado {fmtDataHora(i.atualizadoEm)}</span>}
                  </div>
                </div>
                <div className="sm:w-52 shrink-0">
                  <Select value={i.tipo} onValueChange={(v) => void setTipo(i, v as TipoIntegracao)} disabled={busyId === i.professorId}>
                    <SelectTrigger className={SELECT_TRIGGER} data-select-integracao><SelectValue /></SelectTrigger>
                    <SelectContent className={SELECT_CONTENT}>
                      <SelectItem value="pix_manual">Pix manual</SelectItem>
                      <SelectItem value="none">Sem integração</SelectItem>
                      <SelectItem value="mercadopago" disabled={!i.ehMaster}>Mercado Pago{i.ehMaster ? "" : " (só o master)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
          <ListaPaginada total={filtrados.length} mostrando={mostrando} onVerMais={() => setMostrando((m) => m + ITENS_PAGINA)} rotulo="professores" />
        </div>
      )}
    </div>
  );
};

export default IntegracoesPage;
