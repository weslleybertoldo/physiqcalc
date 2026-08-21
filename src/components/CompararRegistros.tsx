import { useEffect, useMemo, useState } from "react";
import {
  TIPOS_FOTO,
  type TipoFoto,
  type RegistroFoto,
  formatarMesRef,
  urlAssinada,
} from "@/lib/registrosFotos";

interface Props {
  registros: RegistroFoto[];
}

// Comparação lado a lado entre meses — sempre do MESMO tipo de foto
// (lateral com lateral, frente com frente, costas com costas)
const CompararRegistros = ({ registros }: Props) => {
  const [tipo, setTipo] = useState<TipoFoto>("frente");
  const [mesA, setMesA] = useState("");
  const [mesB, setMesB] = useState("");
  const [urls, setUrls] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const [carregando, setCarregando] = useState(false);

  // meses (desc) que têm foto do tipo selecionado
  const mesesDoTipo = useMemo(() => {
    const meses = registros.filter((r) => r.tipo === tipo).map((r) => r.mes_ref);
    return [...new Set(meses)].sort().reverse();
  }, [registros, tipo]);

  // defaults: A = mês anterior, B = mês mais recente
  useEffect(() => {
    setMesA(mesesDoTipo[1] ?? mesesDoTipo[0] ?? "");
    setMesB(mesesDoTipo[0] ?? "");
  }, [mesesDoTipo]);

  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      if (!mesA || !mesB) {
        setUrls({ a: null, b: null });
        return;
      }
      setCarregando(true);
      const regA = registros.find((r) => r.tipo === tipo && r.mes_ref === mesA);
      const regB = registros.find((r) => r.tipo === tipo && r.mes_ref === mesB);
      const [a, b] = await Promise.all([
        regA ? urlAssinada(regA.storage_path) : Promise.resolve(null),
        regB ? urlAssinada(regB.storage_path) : Promise.resolve(null),
      ]);
      if (ativo) {
        setUrls({ a, b });
        setCarregando(false);
      }
    };
    buscar();
    return () => {
      ativo = false;
    };
  }, [registros, tipo, mesA, mesB]);

  if (registros.length === 0) return null;

  const selectClass =
    "bg-background border border-border text-foreground text-sm font-body px-3 py-2 rounded-none focus:outline-none focus:border-primary";

  return (
    <section>
      <h2 className="font-heading text-lg text-foreground mb-4">Comparar Meses</h2>
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFoto)} className={selectClass}>
          {TIPOS_FOTO.map((t) => (
            <option key={t.key} value={t.key} className="bg-background text-foreground">
              {t.label}
            </option>
          ))}
        </select>
        <select value={mesA} onChange={(e) => setMesA(e.target.value)} className={selectClass}>
          {mesesDoTipo.map((m) => (
            <option key={m} value={m} className="bg-background text-foreground">
              {formatarMesRef(m)}
            </option>
          ))}
        </select>
        <span className="self-center text-muted-foreground font-heading text-xs uppercase">vs</span>
        <select value={mesB} onChange={(e) => setMesB(e.target.value)} className={selectClass}>
          {mesesDoTipo.map((m) => (
            <option key={m} value={m} className="bg-background text-foreground">
              {formatarMesRef(m)}
            </option>
          ))}
        </select>
      </div>

      {mesesDoTipo.length < 2 ? (
        <p className="text-sm text-muted-foreground font-body">
          É preciso ter fotos de "{TIPOS_FOTO.find((t) => t.key === tipo)?.label}" em pelo menos 2 meses para comparar.
        </p>
      ) : carregando ? (
        <p className="text-sm text-muted-foreground font-body">Carregando fotos...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {[
            { mes: mesA, url: urls.a },
            { mes: mesB, url: urls.b },
          ].map((item, i) => (
            <figure key={i} className="border border-border bg-card">
              <figcaption className="px-3 py-2 text-xs font-heading uppercase tracking-wider text-primary border-b border-border">
                {item.mes ? formatarMesRef(item.mes) : "—"}
              </figcaption>
              {item.url ? (
                <img src={item.url} alt={`${tipo} ${item.mes}`} className="w-full object-contain max-h-[70vh]" />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-xs text-muted-foreground font-body">
                  Sem foto neste mês
                </div>
              )}
            </figure>
          ))}
        </div>
      )}
    </section>
  );
};

export default CompararRegistros;
