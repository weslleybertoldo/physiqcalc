import { useEffect, useState } from "react";
import {
  TIPOS_FOTO,
  type RegistroFoto,
  carregarRegistros,
  formatarMesRef,
  urlAssinada,
} from "@/lib/registrosFotos";
import CompararRegistros from "@/components/CompararRegistros";

interface Props {
  userId: string;
}

// Aba "Registros" — fotos mensais do aluno (adicionadas pelo treinador no admin)
const RegistrosSection = ({ userId }: Props) => {
  const [registros, setRegistros] = useState<RegistroFoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesAberto, setMesAberto] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    carregarRegistros(userId)
      .then((rows) => {
        setRegistros(rows);
        if (rows.length > 0) setMesAberto(rows[0].mes_ref);
      })
      .catch((e) => console.error("[Registros] Erro ao carregar:", e))
      .finally(() => setLoading(false));
  }, [userId]);

  // assina as URLs do mês aberto (uma vez por foto)
  useEffect(() => {
    if (!mesAberto) return;
    const pendentes = registros.filter((r) => r.mes_ref === mesAberto && !urls[r.storage_path]);
    if (pendentes.length === 0) return;
    Promise.all(pendentes.map(async (r) => [r.storage_path, await urlAssinada(r.storage_path)] as const)).then(
      (pares) => {
        setUrls((prev) => {
          const next = { ...prev };
          for (const [path, url] of pares) if (url) next[path] = url;
          return next;
        });
      },
    );
  }, [mesAberto, registros, urls]);

  const meses = [...new Set(registros.map((r) => r.mes_ref))];

  if (loading) {
    return <p className="text-sm text-muted-foreground font-body py-16">Carregando registros...</p>;
  }

  if (registros.length === 0) {
    return (
      <div className="py-16">
        <div className="result-card border-muted-foreground/30">
          <p className="text-sm text-muted-foreground font-body">
            Nenhum registro fotográfico ainda. Seu treinador adiciona as fotos mensalmente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-16 space-y-12">
      <section>
        <h2 className="font-heading text-xl text-foreground mb-6">Registros Mensais</h2>
        <div className="flex flex-wrap gap-2 mb-6">
          {meses.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMesAberto(m)}
              className={`px-4 py-2 text-xs font-heading uppercase tracking-wider border transition-colors ${
                mesAberto === m
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {formatarMesRef(m)}
            </button>
          ))}
        </div>

        {mesAberto && (
          <div className="grid grid-cols-2 gap-4">
            {TIPOS_FOTO.map((t) => {
              const reg = registros.find((r) => r.mes_ref === mesAberto && r.tipo === t.key);
              const url = reg ? urls[reg.storage_path] : undefined;
              return (
                <figure key={t.key} className="border border-border bg-card">
                  <figcaption className="px-3 py-2 text-xs font-heading uppercase tracking-wider text-primary border-b border-border">
                    {t.label}
                  </figcaption>
                  {reg ? (
                    url ? (
                      <img src={url} alt={`${t.label} ${mesAberto}`} className="w-full object-contain max-h-[70vh]" />
                    ) : (
                      <div className="aspect-[3/4] flex items-center justify-center text-xs text-muted-foreground font-body">
                        Carregando...
                      </div>
                    )
                  ) : (
                    <div className="aspect-[3/4] flex items-center justify-center text-xs text-muted-foreground font-body">
                      Sem foto
                    </div>
                  )}
                </figure>
              );
            })}
          </div>
        )}
      </section>

      <CompararRegistros registros={registros} />
    </div>
  );
};

export default RegistrosSection;
