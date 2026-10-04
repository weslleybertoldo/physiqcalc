import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Moon, Pause, Play, Sun } from "lucide-react";
import { boneco3d, fundoGuardado, guardarFundo } from "@/lib/exercicios3d";
import type { Motor } from "@/lib/visualizador3d/motor";
import type { Entrada3D, Fundo } from "@/lib/visualizador3d/tipos";

type Estado = "carregando" | "pronto" | "indisponivel";

const VISTAS = [
  { nome: "Frente", az: 0 },
  { nome: "Lado", az: 90 },
  { nome: "Costas", az: 180 },
] as const;

/** Boneco 3D do exercício (girar, zoom, ida e volta) no lugar do GIF. A foto parada fica até o 3D ficar pronto;
 * aparelho sem 3D fica na foto com um aviso. O three.js só é baixado quando uma ficha com 3D abre. */
export function Visualizador3D({ entrada, nome }: { entrada: Entrada3D; nome: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [tocando, setTocando] = useState(true);
  const [fundo, setFundo] = useState<Fundo>(fundoGuardado);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const abort = new AbortController();
    let motor: Motor | null = null;
    setEstado("carregando");
    setTocando(true);
    import("@/lib/visualizador3d/motor")
      .then(({ criarMotor }) => {
        if (abort.signal.aborted) return;
        motor = criarMotor(canvas, { fundo: fundoGuardado(), aoPerderContexto: () => setEstado("indisponivel") });
        motorRef.current = motor;
        return motor.carregar(boneco3d(), entrada, abort.signal).then(() => {
          if (!abort.signal.aborted) setEstado("pronto");
        });
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        console.error("visualizador 3D:", e instanceof Error ? e.message : e);
        setEstado("indisponivel");
      });
    const observador = new ResizeObserver(() => motorRef.current?.encaixar());
    observador.observe(canvas);
    return () => {
      abort.abort();
      observador.disconnect();
      motor?.destruir();
      motorRef.current = null;
    };
  }, [entrada]);

  useEffect(() => {
    motorRef.current?.encaixar();
  }, [cheia]);

  const trocarFundo = () => {
    const novo: Fundo = fundo === "escuro" ? "claro" : "escuro";
    setFundo(novo);
    guardarFundo(novo);
    motorRef.current?.fundo(novo);
  };
  const alternarTocar = () => {
    motorRef.current?.tocar(!tocando);
    setTocando(!tocando);
  };
  const pronto = estado === "pronto";
  const botao =
    "flex h-9 items-center justify-center rounded-xl border border-linha bg-superficie text-[12.5px] font-medium text-texto disabled:opacity-40";
  const comTexto = `${botao} px-2.5`;
  const soIcone = `${botao} w-9`;

  return (
    <div
      className={cheia ? "fixed inset-0 z-[100] flex flex-col gap-3 bg-fundo p-3" : "flex flex-col gap-2.5"}
      data-ficha-3d
      data-3d={estado}
    >
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-linha ${cheia ? "min-h-0 flex-1" : "aspect-[3/2]"}`}
        style={{ background: fundo === "escuro" ? "#0f0f12" : "#ffffff" }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${nome} em 3D: arraste pra girar, use dois dedos pra aproximar`}
          className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${pronto ? "opacity-100" : "opacity-0"}`}
          style={{ touchAction: "none" }}
        />
        {!pronto && (
          <img src={entrada.foto} alt={nome} decoding="async" className="absolute inset-0 h-full w-full object-contain" />
        )}
        {estado === "indisponivel" && (
          <p className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[11.5px] text-white">
            3D indisponível neste aparelho
          </p>
        )}
      </div>
      {/* uma fileira só até em celular de 360 px: tocar + vistas à esquerda, tela cheia + fundo à direita */}
      <div className="flex flex-wrap items-center justify-between gap-1" data-controles-3d>
        <div className="flex items-center gap-1">
          <button type="button" className={soIcone} onClick={alternarTocar} disabled={!pronto}
            aria-label={tocando ? "Pausar" : "Tocar"} title={tocando ? "Pausar" : "Tocar"}>
            {tocando ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
          </button>
          {VISTAS.map((v) => (
            <button key={v.nome} type="button" className={comTexto} onClick={() => motorRef.current?.vista(v.az)} disabled={!pronto}>
              {v.nome}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={soIcone} onClick={() => setCheia(!cheia)} disabled={!pronto}
            aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}>
            {cheia ? <Minimize2 aria-hidden className="h-4 w-4" /> : <Maximize2 aria-hidden className="h-4 w-4" />}
          </button>
          <button type="button" className={soIcone} onClick={trocarFundo} disabled={!pronto}
            aria-label={fundo === "escuro" ? "Fundo claro" : "Fundo escuro"}>
            {fundo === "escuro" ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[12px] text-texto-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: "#de2b26" }} />
          músculo alvo
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: "#f7ada6" }} />
          músculos auxiliares
        </span>
      </div>
    </div>
  );
}
