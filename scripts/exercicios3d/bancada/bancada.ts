// Bancada da fábrica 3D: o MESMO motor do app numa página só, pra foto parada e prints de checagem (foto.py).
// Abrir pelo dev server do app: /scripts/exercicios3d/bancada/index.html?boneco=…&mapa=…&m=…&alvos=15,8&aux=2
// Outros parâmetros: t=0..1 (quadro fixo), az/el/dist/alvo=x,y,z (câmera, coordenadas do Blender), fundo=claro|escuro, w/h (px), cheia=1.
import { criarMotor } from "../../../src/lib/visualizador3d/motor";

const q = new URLSearchParams(location.search);
const num = (k: string, padrao: number) => (q.has(k) ? Number(q.get(k)) : padrao);
const ids = (k: string) => (q.get(k) ?? "").split(",").filter(Boolean).map(Number);

document.documentElement.style.setProperty("--w", `${num("w", 600)}px`);
document.documentElement.style.setProperty("--h", `${num("h", 400)}px`);
if (q.get("cheia") === "1") document.body.classList.add("cheia");

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const fixo = q.has("t");
const motor = criarMotor(canvas, { fundo: q.get("fundo") === "claro" ? "claro" : "escuro", fixo });
const alvo = q.get("alvo")?.split(",").map(Number) as [number, number, number] | undefined;
const camera = { az: num("az", 54), el: num("el", 8), dist: q.has("dist") ? num("dist", 0) : undefined, alvo };

motor
  .carregar(
    { v: "", glb: q.get("boneco") ?? "", mapa: q.get("mapa") ?? "" },
    { v: "", movimento: q.get("m") ?? "", foto: "", bytes: 0, alvos: ids("alvos"), auxiliares: ids("aux"), camera, ida_s: 1.5 },
  )
  .then(() => {
    if (fixo) motor.quadroFixo(num("t", 0));
    document.body.dataset["3d"] = "pronto";
  })
  .catch((e) => {
    document.body.dataset["3d"] = "erro";
    (document.getElementById("erro") as HTMLElement).textContent = String(e);
  });
