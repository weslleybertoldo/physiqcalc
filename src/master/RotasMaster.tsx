import { Route, Routes } from "react-router-dom";
import { NaoEncontrada } from "@/ui/casca/NaoEncontrada";
import MasterLayout, { PaginaMaster } from "./MasterLayout";
import { MENU_MASTER } from "./menu";

/** Rotas do painel master (/master/*, spec 4.7/4.8) — carregadas só por quem abre o master. */
export default function RotasMaster() {
  return (
    <Routes>
      <Route element={<MasterLayout />}>
        <Route index element={<PaginaMaster id="visao-geral" />} />
        {MENU_MASTER.filter((i) => i.id !== "visao-geral").map((i) => (
          <Route key={i.id} path={i.rota.replace(/^\/master\//, "")} element={<PaginaMaster id={i.id} />} />
        ))}
        <Route path="*" element={<NaoEncontrada voltarPara="/master" rotuloVoltar="Voltar ao master" />} />
      </Route>
    </Routes>
  );
}
