import { useSessao } from "@/nucleo/sessao";
import { ehAlunoDasRotinas } from "@/rotinas/regras";
import { RotinasDeHoje } from "@/rotinas/ui/RotinasDeHoje";

/**
 * Início › "Rotinas de hoje" (W-A P3 — spec §4.3; P9: todo aluno, inclusive o do app sem profissional): logo depois da linha Dieta/Metas
 * (src/app-aluno/abas/Inicio.tsx, LINHAS). A lista é a MESMA da página /perfil/rotinas e da seção da Dieta (P5) — src/rotinas/ui/RotinasDeHoje.
 * Quem não tem matrícula (o profissional que abriu o app) não vê o card.
 */
export default function CardRotinasHoje() {
  const { situacao } = useSessao();
  if (!ehAlunoDasRotinas(situacao)) return null;
  return <RotinasDeHoje origem="inicio" />;
}
