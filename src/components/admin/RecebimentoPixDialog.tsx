import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { PIX_TIPOS, normalizarChavePix, validarChavePix, type PixTipo } from "@/lib/pixChave";
import type { Recebimento } from "@/lib/recebimentos";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  professorId: string;
  /** null = novo recebimento; com item = editar a chave existente. */
  item: Recebimento | null;
  /** Sem nenhum recebimento ligado, o novo já nasce ligado. */
  ativarAoCriar: boolean;
  /** Recebe a linha gravada (a lista atualiza sem ir de novo ao banco). */
  onSalvo: (salva: Recebimento) => void;
}

const LABEL = "text-sm text-muted-foreground font-body uppercase tracking-wider";
const SELECT = "bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2 outline-none focus:border-primary";
const BTN_PRI = "inline-flex w-full items-center justify-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-3 hover:bg-primary/90 transition-colors disabled:opacity-50";

/** Popup "Adicionar" / "Editar" recebimento Pix (pedido 13/09/2026): tipo, chave, favorecido, banco → linha em physiq_recebimentos. */
export default function RecebimentoPixDialog({ aberto, onFechar, professorId, item, ativarAoCriar, onSalvo }: Props) {
  const [pixTipo, setPixTipo] = useState<PixTipo | "">("");
  const [pixChave, setPixChave] = useState("");
  const [pixFavorecido, setPixFavorecido] = useState("");
  const [pixBanco, setPixBanco] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setPixTipo(item?.pix_tipo ?? "");
    setPixChave(item?.pix_chave ?? "");
    setPixFavorecido(item?.pix_favorecido ?? "");
    setPixBanco(item?.pix_banco ?? "");
  }, [aberto, item]);

  const tipoSel = PIX_TIPOS.find((t) => t.value === pixTipo);
  const erroChave = pixTipo && pixChave.trim() ? validarChavePix(pixTipo, pixChave) : null;

  const salvar = async () => {
    const erro = validarChavePix(pixTipo, pixChave);
    if (erro) { toast.error(erro); return; }
    const dados = {
      pix_tipo: pixTipo,
      pix_chave: normalizarChavePix(pixTipo as PixTipo, pixChave),
      pix_favorecido: pixFavorecido.trim() || null,
      pix_banco: pixBanco.trim() || null,
    };
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- physiq_recebimentos fora dos tipos gerados
    const tabela = (supabase.from as any)("physiq_recebimentos");
    const { data, error } = item
      ? await tabela.update(dados).eq("id", item.id).select("*").single()
      : await tabela.insert({ professor_id: professorId, tipo: "pix", ...dados, ativo: ativarAoCriar }).select("*").single();
    setSalvando(false);
    if (error || !data) { console.error("[Recebimentos] salvar:", error); toast.error("Erro ao salvar o recebimento."); return; }
    toast.success(item ? "Recebimento atualizado." : ativarAoCriar ? "Recebimento salvo e ligado." : "Recebimento salvo.");
    onSalvo(data as Recebimento);
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md" data-dialog-recebimento>
        <DialogHeader>
          <DialogTitle className="font-heading text-sm uppercase tracking-wider">{item ? "Editar recebimento" : "Novo recebimento (Pix)"}</DialogTitle>
          <DialogDescription className="font-body text-xs">
            O aluno vê esta chave na tela Pagamentos, faz o Pix pelo banco dele e anexa o comprovante. Você confere e confirma em Cobrança.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-5">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Tipo da chave</label>
            <select value={pixTipo} onChange={(e) => setPixTipo(e.target.value as PixTipo | "")} className={SELECT} data-pix-tipo>
              <option value="" className="bg-background text-foreground">Selecionar...</option>
              {PIX_TIPOS.map((t) => (
                <option key={t.value} value={t.value} className="bg-background text-foreground">{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Chave Pix</label>
            <input
              type={pixTipo === "email" ? "email" : "text"}
              inputMode={pixTipo === "cpf" || pixTipo === "cnpj" || pixTipo === "telefone" ? "numeric" : undefined}
              value={pixChave}
              onChange={(e) => setPixChave(e.target.value)}
              placeholder={tipoSel?.placeholder || "Escolha o tipo primeiro"}
              className="input-underline text-sm"
              data-pix-chave
            />
            {erroChave && <p className="text-[11px] text-destructive font-body" data-pix-erro>{erroChave}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Favorecido (nome que aparece)</label>
            <input type="text" value={pixFavorecido} onChange={(e) => setPixFavorecido(e.target.value)} className="input-underline text-sm" placeholder="Nome completo ou razão social" data-pix-favorecido />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Banco</label>
            <input type="text" value={pixBanco} onChange={(e) => setPixBanco(e.target.value)} className="input-underline text-sm" placeholder="Ex.: Nubank, Inter, Itaú" data-pix-banco />
          </div>
        </div>
        <button type="button" onClick={salvar} disabled={salvando} className={BTN_PRI} data-btn-salvar-pix>
          {salvando ? "Salvando..." : "Salvar recebimento"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
