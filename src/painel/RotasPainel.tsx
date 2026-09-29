import { Route, Routes } from "react-router-dom";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import PainelLayout from "./PainelLayout";
import { PaginaPainel } from "./PaginaPainel";
import { MENU_PAINEL } from "./menu";
import AlunoLayout, { AbaDoAluno, AbaResumo, RotaEditores } from "./aluno/AlunoLayout";
import ConfiguracoesLayout, { AbaConfiguracoes, PrimeiraAbaConfig } from "./configuracoes/ConfiguracoesLayout";

/** Rotas do site do profissional (/painel/*, spec 4.8) — carregadas só por quem abre o painel. */
export default function RotasPainel() {
  return (
    <Routes>
      <Route element={<PainelLayout />}>
        <Route index element={<PaginaPainel id="dashboard" />} />
        {MENU_PAINEL.filter((i) => i.id !== "dashboard" && i.id !== "configuracoes").map((i) => (
          <Route key={i.id} path={i.rota.replace(/^\/painel\//, "")} element={<PaginaPainel id={i.id} />} />
        ))}
        <Route path="alunos/:id/editar" element={<RotaEditores />} />
        <Route path="alunos/:id" element={<AlunoLayout />}>
          <Route index element={<AbaResumo />} />
          <Route path=":aba" element={<AbaDoAluno />} />
        </Route>
        <Route path="configuracoes" element={<ConfiguracoesLayout />}>
          <Route index element={<PrimeiraAbaConfig />} />
          <Route path=":aba" element={<AbaConfiguracoes />} />
        </Route>
        <Route path="*" element={<NaoEncontrada voltarPara="/painel" rotuloVoltar="Voltar ao painel" />} />
      </Route>
    </Routes>
  );
}
