import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET_REGISTROS,
  TIPOS_FOTO,
  type TipoFoto,
  type RegistroFoto,
  carregarRegistros,
  comprimirImagem,
  formatarMesRef,
  inputParaMesRef,
  mesRefParaInput,
  urlAssinada,
} from "@/lib/registrosFotos";
import CompararRegistros from "@/components/CompararRegistros";

interface Props {
  userId: string;
}

const mesAtualInput = () => new Date().toISOString().slice(0, 7);

// Aba "Registros" do admin — sobe/substitui/exclui as 4 fotos mensais do aluno.
// Salva na hora (sem botão Salvar) e reflete direto no app do aluno.
const AdminRegistrosFotos = ({ userId }: Props) => {
  const [registros, setRegistros] = useState<RegistroFoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesInput, setMesInput] = useState(mesAtualInput());
  const [ocupado, setOcupado] = useState<TipoFoto | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const inputRefs = useRef<Partial<Record<TipoFoto, HTMLInputElement | null>>>({});

  const mesRef = inputParaMesRef(mesInput);

  const recarregar = async () => {
    const rows = await carregarRegistros(userId);
    setRegistros(rows);
    return rows;
  };

  useEffect(() => {
    setLoading(true);
    setUrls({});
    carregarRegistros(userId)
      .then(setRegistros)
      .catch((e) => {
        console.error("[AdminRegistros] Erro ao carregar:", e);
        toast.error("Erro ao carregar registros.");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  // assina as URLs do mês selecionado
  useEffect(() => {
    const pendentes = registros.filter((r) => r.mes_ref === mesRef && !urls[r.storage_path]);
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
  }, [registros, mesRef, urls]);

  const handleUpload = async (tipo: TipoFoto, file: File) => {
    setOcupado(tipo);
    try {
      const blob = await comprimirImagem(file);
      const path = `${userId}/${mesInput}/${tipo}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET_REGISTROS)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("physiq_registros_fotos").upsert(
        {
          user_id: userId,
          mes_ref: mesRef,
          tipo,
          storage_path: path,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mes_ref,tipo" },
      );
      if (dbErr) throw dbErr;

      // força URL nova (a foto mudou por baixo do mesmo path)
      const url = await urlAssinada(path);
      setUrls((prev) => ({ ...prev, [path]: url ? `${url}&t=${Date.now()}` : "" }));
      await recarregar();
      toast.success("Foto salva.");
    } catch (e) {
      console.error("[AdminRegistros] Erro no upload:", e);
      toast.error(`Erro ao salvar foto: ${e instanceof Error ? e.message : "desconhecido"}`);
    } finally {
      setOcupado(null);
    }
  };

  const handleExcluir = async (reg: RegistroFoto) => {
    if (!window.confirm(`Excluir a foto "${TIPOS_FOTO.find((t) => t.key === reg.tipo)?.label}" de ${formatarMesRef(reg.mes_ref)}?`)) {
      return;
    }
    setOcupado(reg.tipo);
    try {
      const { error: stErr } = await supabase.storage.from(BUCKET_REGISTROS).remove([reg.storage_path]);
      if (stErr) throw stErr;
      const { error: dbErr } = await supabase.from("physiq_registros_fotos").delete().eq("id", reg.id);
      if (dbErr) throw dbErr;
      await recarregar();
      toast.success("Foto excluída.");
    } catch (e) {
      console.error("[AdminRegistros] Erro ao excluir:", e);
      toast.error(`Erro ao excluir: ${e instanceof Error ? e.message : "desconhecido"}`);
    } finally {
      setOcupado(null);
    }
  };

  const mesesComFoto = [...new Set(registros.map((r) => r.mes_ref))];

  if (loading) {
    return <p className="text-sm text-muted-foreground font-body">Carregando registros...</p>;
  }

  return (
    <div className="space-y-12">
      <section>
        <h2 className="font-heading text-lg text-foreground mb-2">Registros Fotográficos</h2>
        <p className="text-sm text-muted-foreground font-body mb-6">
          4 fotos por mês (frente, costas e laterais). Salva na hora e aparece na aba Registros do aluno.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <label className="text-sm text-muted-foreground font-body uppercase tracking-wider">Mês</label>
          <input
            type="month"
            value={mesInput}
            onChange={(e) => e.target.value && setMesInput(e.target.value)}
            className="bg-background border border-border text-foreground text-sm font-body px-3 py-2 focus:outline-none focus:border-primary"
          />
          {mesesComFoto.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mesesComFoto.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMesInput(mesRefParaInput(m))}
                  className={`px-3 py-1.5 text-xs font-heading uppercase tracking-wider border transition-colors ${
                    m === mesRef ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {formatarMesRef(m)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {TIPOS_FOTO.map((t) => {
            const reg = registros.find((r) => r.mes_ref === mesRef && r.tipo === t.key);
            const url = reg ? urls[reg.storage_path] : undefined;
            const busy = ocupado === t.key;
            return (
              <div key={t.key} className="border border-border bg-card">
                <div className="px-3 py-2 text-xs font-heading uppercase tracking-wider text-primary border-b border-border">
                  {t.label}
                </div>
                {reg ? (
                  url ? (
                    <img src={url} alt={`${t.label} ${mesRef}`} className="w-full object-contain max-h-96" />
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
                <div className="flex border-t border-border">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRefs.current[t.key]?.click()}
                    className="flex-1 py-2.5 text-xs font-heading uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {busy ? "Salvando..." : reg ? "Substituir" : "Adicionar"}
                  </button>
                  {reg && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleExcluir(reg)}
                      className="flex-1 py-2.5 text-xs font-heading uppercase tracking-wider text-destructive hover:bg-destructive/10 transition-colors border-l border-border disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => (inputRefs.current[t.key] = el)}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(t.key, file);
                    e.target.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      <CompararRegistros registros={registros} />
    </div>
  );
};

export default AdminRegistrosFotos;
