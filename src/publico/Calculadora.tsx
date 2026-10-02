import { CalculadoraFerramenta } from "@/ferramentas/calculadora/Calculadora";

/**
 * /calculator (W26 — C13 e C63): a calculadora pública do Physiq, sem login — composição corporal e comparativo, com os PDFs (a mesma de
 * Ferramentas › Calculadora, no visual premium). Fica FORA das App Links do APK (como as outras páginas públicas — H2): abre no
 * navegador. Substitui a src/pages/Index.tsx antiga.
 */
export default function Calculadora() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-5 sm:px-8" data-pagina-calculadora-publica>
      <header className="mb-4">
        <h1 className="font-body text-[24px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[30px]">Calculadora de composição corporal</h1>
        <p className="mt-1 text-[13.5px] text-texto-2">TMB, % de gordura por dobras, gasto por nível de atividade e o comparativo antes × depois — com PDF. Os dados ficam só neste aparelho.</p>
      </header>
      <CalculadoraFerramenta />
    </div>
  );
}
