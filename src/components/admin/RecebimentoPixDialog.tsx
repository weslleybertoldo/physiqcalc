import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { ErroFinanceiro, salvarChavePix } from "@/financeiro/api";
import { mensagemDoRecebimento } from "@/financeiro/regras";
import type { ChaveRecebimento } from "@/financeiro/tipos";
import { PIX_TIPOS, normalizarChavePix, validarChavePix, type PixTipo } from "@/lib/pixChave";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

/** Chave Pix de recebimento da conta (recebimento_chaves no banco principal — W6; vinha do physiq_recebimentos do Calc). W1: o tipo mora
 *  em @/financeiro/tipos (a resposta do prof_recebimento) e as colunas no servidor (_shared/pix-chave-regras.ts › COLUNAS_CHAVE). */
export type { ChaveRecebimento } from "@/financeiro/tipos";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  contaId: string;
  /** null = chave nova; com item = editar. */
  item: ChaveRecebimento | null;
  onSalvo: (salva: ChaveRecebimento) => void;
}

/**
 * Popup "Adicionar" / "Editar" chave Pix (pedido 13/09/2026): tipo, chave, favorecido e banco. W1 (jeito 2): grava pela pagamentos-aluno
 * (prof_chave_salvar), como a pessoa — o servidor decide quem cadastrou e se a nova nasce ligada (sem nenhuma ligada, nasce ligada). A tela
 * valida e normaliza na hora (a resposta rápida); o servidor valida de novo.
 */
export default function RecebimentoPixDialog({ aberto, onFechar, contaId, item, onSalvo }: Props) {
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
    try {
      const r = await salvarChavePix(contaId, { ...(item ? { id: item.id } : {}), ...dados });
      toast.success(item ? "Chave atualizada." : r.chave.ativa ? "Chave salva e ligada." : "Chave salva.");
      onSalvo(r.chave);
      onFechar();
    } catch (e) {
      const erro = e instanceof ErroFinanceiro ? e : null;
      setErro(erro?.codigo === "chave_invalida" && typeof erro.extra.mensagem === "string" ? erro.extra.mensagem
        : mensagemDoRecebimento(erro?.codigo ?? null, "Não deu para salvar a chave agora. Tente de novo."));
    } finally {
      setSalvando(false);
    }
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
