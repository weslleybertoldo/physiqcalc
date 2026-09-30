import { ArrowDownUp, CalendarMinus2, CheckCircle2, CircleSlash, ListRestart, MapPin, Plus, Repeat } from "lucide-react";
import { GrupoLista, ItemLista } from "@/ui/premium/Lista";
import { PainelDeslizante } from "@/ui/premium/Sheet";

/** Opções do card do treino (⋯): trocar/adicionar o treino do dia, marcar como concluído, reordenar, academia, tirar do dia. */
export function SheetOpcoesTreino({
  aberto,
  aoMudar,
  nome,
  concluido,
  aoTrocar,
  aoAdicionar,
  aoAlternarConcluido,
  aoReordenar,
  aoOrdemPadrao,
  aoAcademia,
  aoTirarDoDia,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  nome: string;
  concluido: boolean;
  aoTrocar: () => void;
  aoAdicionar: () => void;
  aoAlternarConcluido: () => void;
  aoReordenar: () => void;
  aoOrdemPadrao: () => void;
  aoAcademia: () => void;
  aoTirarDoDia: () => void;
}) {
  const e = (fn: () => void) => () => {
    aoMudar(false);
    fn();
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo={nome} descricao="Opções deste treino">
      <div className="flex flex-col gap-2.5 pt-1" data-opcoes-treino>
        <GrupoLista>
          <ItemLista icone={Repeat} rotulo="Trocar o treino do dia" aoTocar={e(aoTrocar)} />
          <ItemLista icone={Plus} rotulo="Adicionar outro treino neste dia" aoTocar={e(aoAdicionar)} />
          <ItemLista icone={concluido ? CircleSlash : CheckCircle2} rotulo={concluido ? "Desmarcar concluído" : "Marcar como concluído"} aoTocar={e(aoAlternarConcluido)} />
        </GrupoLista>
        <GrupoLista>
          <ItemLista icone={ArrowDownUp} rotulo="Reordenar exercícios" aoTocar={e(aoReordenar)} />
          <ItemLista icone={ListRestart} rotulo="Voltar a ordem do profissional" aoTocar={e(aoOrdemPadrao)} semSeta />
          <ItemLista icone={MapPin} rotulo="Academia" aoTocar={e(aoAcademia)} />
        </GrupoLista>
        <GrupoLista>
          <ItemLista icone={CalendarMinus2} rotulo="Tirar este treino do dia" aoTocar={e(aoTirarDoDia)} perigo semSeta />
        </GrupoLista>
      </div>
    </PainelDeslizante>
  );
}
