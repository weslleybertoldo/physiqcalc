import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abasVisiveis, abaDeAbertura } from "@/app-aluno/catalogoAbas";
import { existe } from "@/rotas/registro";

const raiz = resolve(__dirname, "../../..");

describe("W8 — a aba Treino nova entra pelo registro no lugar da TreinosPage", () => {
  it("src/app-aluno/abas/Treino.tsx está registrada (desde a W12 o app abre no Início; o Treino é a 2ª aba)", () => {
    expect(existe("abasApp", "Treino")).toBe(true);
    expect(abasVisiveis(["treino"]).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
    expect(abaDeAbertura(["treino"])?.id).toBe("inicio");
    expect(abasVisiveis(["nutricao"]).map((a) => a.rotulo)).toEqual(["Início", "Dieta", "Evolução", "Perfil"]); // W11
  });

  it("o aviso de atualização do APK virou janela global da casca (morava na TreinosPage)", () => {
    expect(existe("avisosGlobais", "AvisoAtualizacao")).toBe(true);
  });

  it("o legado do app do aluno saiu; o que o painel ainda usa ficou (W9 e as telas do profissional)", () => {
    for (const saiu of [
      "src/pages/TreinosPage.tsx",
      "src/components/BloqueioMasterGate.tsx",
      "src/components/treinos/TreinoDoDia.tsx",
      "src/components/treinos/TimerDescanso.tsx",
      "src/components/treinos/WorkoutTimer.tsx",
      "src/components/treinos/WorkoutReminder.tsx",
      "src/components/treinos/TabelaSemanal.tsx",
      "src/components/treinos/SyncStatusIndicator.tsx",
      "src/components/treinos/SomDescansoDialog.tsx",
      "src/components/treinos/ModalAlterarGrupo.tsx",
      "src/components/treinos/ModalCriarGrupoPessoal.tsx",
      "src/components/treinos/ModalComentario.tsx",
      "src/components/treinos/ModalExercicio.tsx",
      "src/components/treinos/ModalHistorico.tsx",
      "src/components/treinos/ModalRemoverExercicio.tsx",
      "src/components/treinos/ModalTrocarExercicio.tsx", // W9: virou src/treino/ui/TrocarExercicio.tsx (equivalentes primeiro)
      // W28: o que só o painel antigo usava (Configurar aluno e o ModalExerciciosGrupoAdmin) saiu com o legado
      "src/components/treinos/SeletorExerciciosPorGrupo.tsx",
      "src/components/treinos/HistoricoTreinos.tsx",
      "src/components/treinos/DetalheTreino.tsx",
      "src/components/treinos/CompartilharTreinoModal.tsx",
    ]) expect(existsSync(resolve(raiz, saiu)), saiu).toBe(false);
    for (const ficou of [
      "src/components/treinos/SeletorAcademia.tsx", // W9: + equipamentos da academia (NF11)
    ]) expect(existsSync(resolve(raiz, ficou)), ficou).toBe(true);
  });
});
