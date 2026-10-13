// Physiq W-A P5 — "Adicionar alimento" (spec §4.4): a busca (TACO, os dele, os do plano, as receitas dele) → a quantidade (o alimento em gramas
// ou em porções da porção de referência; a receita em porções), com as kcal e os macros antes de pôr → "Pôr no dia" (dia_adicionar, na
// refeição do plano ou na extra). O lugar vem de quem abriu; a matrícula do dia o servidor decide.
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { DadosDoItemDoDia } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { fmtQtd } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { dadosDaEscolha, escolhaInicial, macrosDaEscolha, textoDosMacros, unidadesDe, type Escolha, type Lugar, type Unidade } from "../regras";
import { ROTULO_DA_BUSCA, TEXTOS } from "../textos";
import { BuscaDeAlimentos } from "./BuscaDeAlimentos";

export function FolhaAdicionar({
  aberta,
  aoMudar,
  lugar,
  ocupado,
  desligado,
  aoPor,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  lugar: Lugar | null;
  ocupado: boolean;
  desligado: boolean;
  /** grava (dia_adicionar) e devolve se deu certo — quem chama volta para a refeição */
  aoPor: (dados: DadosDoItemDoDia) => Promise<boolean>;
}) {
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setEscolha(null);
    setErro(null);
  }, [aberta, lugar?.id]);

  const por = async () => {
    if (!escolha || !lugar) return;
    const d = dadosDaEscolha(lugar, escolha);
    if (d.ok === false) {
      setErro(d.erro);
      return;
    }
    await aoPor(d.dados);
  };

  const unidades = escolha ? unidadesDe(escolha.item) : [];
  const macros = escolha ? macrosDaEscolha(escolha) : null;
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={TEXTOS.adicionar} descricao={lugar ? `Em ${lugar.nome} · só no seu dia` : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-adicionar={lugar?.tipo ?? ""} data-folha-adicionar-passo={escolha ? "quantidade" : "busca"}>
        {!escolha ? (
          <BuscaDeAlimentos ativo={aberta} aoEscolher={(i) => { setEscolha(escolhaInicial(i)); setErro(null); }} />
        ) : (
          <>
            <div className="rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-escolha={escolha.item.id} data-escolha-tipo={escolha.item.tipo}>
              <span className="block text-[11.5px] text-texto-3">{ROTULO_DA_BUSCA[escolha.item.tipo]}</span>
              <b className="block text-[14px] font-semibold text-texto">{escolha.item.nome}</b>
            </div>
            {unidades.length > 1 && (
              <Segmentado<Unidade> rotulo="Unidade" className="self-start" valor={escolha.unidade}
                opcoes={[{ valor: "g", rotulo: TEXTOS.gramas }, { valor: "porcao", rotulo: `${TEXTOS.porcoes} (${fmtQtd(Number(escolha.item.porcao_g))} g)` }]}
                aoMudar={(u) => { setEscolha({ ...escolha, unidade: u, quantidade: u === "porcao" ? "1" : fmtQtd(Number(escolha.item.porcao_g) || 100) }); setErro(null); }} />
            )}
            <Campo rotulo={escolha.unidade === "porcao" ? TEXTOS.porcoes : `${TEXTOS.quantidade} (g)`} inputMode="decimal" autoComplete="off"
              value={escolha.quantidade} onChange={(e) => { setEscolha({ ...escolha, quantidade: e.target.value }); setErro(null); }}
              erro={erro ?? undefined} data-quantidade />
            <p className="text-[12.5px] text-texto-2" data-quantidade-macros={macros ? Math.round(macros.energia_kcal) : ""}>≈ {textoDosMacros(macros)}</p>
            {erro === null && desligado && <MensagemForm tom="aviso">{TEXTOS.semInternet}</MensagemForm>}
            <div className="flex gap-2.5">
              <Botao variante="g" icone={ArrowLeft} onClick={() => { setEscolha(null); setErro(null); }} disabled={ocupado} data-escolha-trocar>{TEXTOS.trocar}</Botao>
              <Botao variante="w" icone={Check} className="flex-1" onClick={() => void por()} disabled={ocupado || desligado || !lugar} data-escolha-por>
                {ocupado ? TEXTOS.salvando : TEXTOS.porNoDia}
              </Botao>
            </div>
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
