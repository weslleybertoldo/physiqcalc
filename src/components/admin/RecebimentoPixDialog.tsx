import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { principal } from "@/integrations/principal/client";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { PIX_TIPOS, normalizarChavePix, validarChavePix, type PixTipo } from "@/lib/pixChave";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

/** Chave Pix de recebimento da conta (recebimento_chaves no banco principal — W6; vinha do physiq_recebimentos do Calc). */
export interface ChaveRecebimento {
  id: string;
  conta_id: string;
  membro_id: string | null;
  tipo: PixTipo;
  chave: string;
  favorecido: string | null;
  banco: string | null;
  ativa: boolean;
  criado_em: string;
}

export const COLUNAS_CHAVE = "id, conta_id, membro_id, tipo, chave, favorecido, banco, ativa, criado_em";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  contaId: string;
  membroId: string | null;
  /** null = chave nova; com item = editar. */
  item: ChaveRecebimento | null;
  /** Sem nenhuma chave ligada, a nova já nasce ligada. */
  ativarAoCriar: boolean;
  onSalvo: (salva: ChaveRecebimento) => void;
}

/** Popup "Adicionar" / "Editar" chave Pix (pedido 13/09/2026): tipo, chave, favorecido e banco. */
export default function RecebimentoPixDialog({ aberto, onFechar, contaId, membroId, item, ativarAoCriar, onSalvo }: Props) {
  const celular = useIsMobile();
  const [tipo, setTipo] = useState<PixTipo | "">("");
  const [chave, setChave] = useState("");
  const [favorecido, setFavorecido] = useState("");
  const [banco, setBanco] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setTipo(item?.tipo ?? "");
    setChave(item?.chave ?? "");
    setFavorecido(item?.favorecido ?? "");
    setBanco(item?.banco ?? "");
    setErro("");
  }, [aberto, item]);

  const tipoSel = PIX_TIPOS.find((t) => t.value === tipo);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarChavePix(tipo, chave);
    if (problema) return setErro(problema);
    const dados = { tipo: tipo as PixTipo, chave: normalizarChavePix(tipo as PixTipo, chave), favorecido: favorecido.trim() || null, banco: banco.trim() || null };
    setSalvando(true);
    const { data, error } = item
      ? await principal.from("recebimento_chaves").update(dados).eq("id", item.id).select(COLUNAS_CHAVE).single()
      : await principal.from("recebimento_chaves").insert({ conta_id: contaId, membro_id: membroId, ...dados, ativa: ativarAoCriar }).select(COLUNAS_CHAVE).single();
    setSalvando(false);
    if (error || !data) {
      console.error("[Recebimento] salvar chave:", error);
      return setErro("Não deu para salvar a chave agora. Tente de novo.");
    }
    toast.success(item ? "Chave atualizada." : ativarAoCriar ? "Chave salva e ligada." : "Chave salva.");
    onSalvo(data as unknown as ChaveRecebimento);
    onFechar();
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && onFechar()} lado={celular ? "baixo" : "direita"} titulo={item ? "Editar chave Pix" : "Nova chave Pix"}
      descricao="O aluno vê esta chave em Perfil › Pagamentos, faz o Pix pelo banco dele e anexa o comprovante. Você confere e confirma.">
      <form onSubmit={salvar} className="flex flex-col gap-4 pt-2" data-dialog-recebimento>
        <CampoSelect rotulo="Tipo da chave" value={tipo} onChange={(e) => { setTipo(e.target.value as PixTipo | ""); setErro(""); }} data-pix-tipo>
          <option value="">Selecionar…</option>
          {PIX_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </CampoSelect>
        <Campo rotulo="Chave Pix" type={tipo === "email" ? "email" : "text"} inputMode={tipo === "cpf" || tipo === "cnpj" || tipo === "telefone" ? "numeric" : undefined}
          value={chave} onChange={(e) => { setChave(e.target.value); setErro(""); }} placeholder={tipoSel?.placeholder || "Escolha o tipo primeiro"} data-pix-chave />
        <Campo rotulo="Favorecido (nome que aparece)" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} placeholder="Nome completo ou razão social" data-pix-favorecido />
        <Campo rotulo="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ex.: Nubank, Inter, Itaú" data-pix-banco />
        {erro && <MensagemForm data-pix-erro>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-btn-salvar-pix>{salvando ? "Salvando…" : "Salvar a chave"}</Botao>
      </form>
    </PainelDeslizante>
  );
}
