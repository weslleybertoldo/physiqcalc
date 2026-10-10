import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lerProfPendente, limparProfPendente } from "@/lib/profPendente";
import { useSessao } from "@/nucleo/sessao";
import { EVENTO_PROF_PENDENTE } from "@/nucleo/vinculo";
import { ConfirmarVinculo } from "@/ui/vinculo/ConfirmarVinculo";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";

/**
 * Link do profissional (?prof=PROF-NOME-SOBRENOME) — W7, palavra dele (29/09 ~18:05): "quando o app abrir aparece o popup e
 * ele clica em confirmar ou cancelar". Já logado: o popup abre na hora; deslogado: o código fica guardado (profPendente) e o
 * popup abre ao entrar; no APK, o link com.bertoldo.physiqcalc://…?prof= guarda o código do mesmo jeito. Cancelar descarta o
 * código guardado; Confirmar vincula (antes da W7 o app vinculava sozinho, sem perguntar).
 */
export default function AvisoVinculoPendente() {
  const { usuario, situacao } = useSessao();
  const [codigo, setCodigo] = useState<string | null>(() => lerProfPendente());

  useEffect(() => {
    const reler = () => setCodigo(lerProfPendente());
    window.addEventListener(EVENTO_PROF_PENDENTE, reler);
    window.addEventListener("storage", reler);
    return () => {
      window.removeEventListener(EVENTO_PROF_PENDENTE, reler);
      window.removeEventListener("storage", reler);
    };
  }, []);

  const mostrar = !!usuario && !!situacao && !!codigo;
  // hml-18a (H-40, D): o popup fica montado e fecha pelo `aberto` (antes sumia seco no Confirmar/Cancelar); enquanto sai, o código
  // continua o mesmo
  const visto = useUltimoValor(mostrar ? codigo : null);
  if (!visto) return null;
  return (
    <ConfirmarVinculo
      codigo={visto}
      aberto={mostrar}
      aoFechar={(fim, r) => {
        limparProfPendente();
        setCodigo(null);
        if (fim === "vinculou") toast.success(r?.profissional ? `Você entrou na lista de ${r.profissional}.` : "Você foi ligado ao seu profissional.");
      }}
    />
  );
}
