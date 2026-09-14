import { useEffect, useState } from "react";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import ComprovantePixCard, { type PixPendente } from "@/components/admin/ComprovantePixCard";

/** Comprovante Pix (pix_manual) do aluno esperando confirmação — lido do `admin-status`; some ao confirmar/recusar. */
export default function ComprovanteAguardandoAluno({ userId, versao, onResolvido }: { userId: string; versao: number; onResolvido: () => void }) {
  const [item, setItem] = useState<PixPendente | null>(null);

  useEffect(() => {
    let vivo = true;
    invokeMp<{ pagamentos?: MpPagamento[] }>("admin-status", { userId })
      .then((s) => {
        if (!vivo) return;
        const p = (s.pagamentos || []).find((x) => x.tipo === "pix_manual" && x.status === "aguardando_confirmacao");
        setItem(p ? { id: p.id, valor: p.valor, mes_ref: p.mes_ref, comprovante_path: p.comprovante_path, created_at: p.created_at } : null);
      })
      .catch((e) => { console.error("[ComprovanteAguardandoAluno] admin-status", e); if (vivo) setItem(null); });
    return () => { vivo = false; };
  }, [userId, versao]);

  if (!item) return null;
  return (
    <section className="pt-6" data-comprovante-aluno>
      <h3 className="font-heading text-sm text-foreground uppercase tracking-wider mb-3">Comprovante Pix aguardando sua confirmação</h3>
      <ComprovantePixCard item={item} onResolvido={onResolvido} />
    </section>
  );
}
