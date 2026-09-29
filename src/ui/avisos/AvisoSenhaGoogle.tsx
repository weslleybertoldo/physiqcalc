import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSessao } from "@/nucleo/sessao";

/**
 * P25 (spec 9): na 1ª entrada com o Google numa conta que o profissional criou com senha, a senha antiga é trocada por
 * uma aleatória (pos-login) — a pessoa é avisada uma vez.
 */
export default function AvisoSenhaGoogle() {
  const { senhaTrocada } = useSessao();
  const avisou = useRef(false);
  useEffect(() => {
    if (!senhaTrocada || avisou.current) return;
    avisou.current = true;
    toast.info("Agora você entra com o Google. Pode criar uma senha no Perfil.", { duration: 8000 });
  }, [senhaTrocada]);
  return null;
}
