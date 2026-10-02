import { CalculadoraFerramenta } from "@/ferramentas/calculadora/Calculadora";
import { TopoPagina } from "@/ui/casca/topo";

/**
 * Ferramentas › Calculadora (W26 — spec 4.6, C52 e C63; padrão da tela 8): o "Cálculo manual" do Calc — composição corporal (TMB, dobras,
 * gasto por nível de atividade, tabela de referência, PDF) e comparativo antes × depois (PDF) —, nos dois módulos. A mesma calculadora do
 * /calculator (sem login); substitui a CalculadoraPage antiga (/admin/calculadora leva para cá).
 */
export default function Calculadora() {
  return (
    <div data-pagina-calculadora>
      <CalculadoraFerramenta
        cabecalho={(acoes) => (
          <TopoPagina titulo="Calculadora" subtitulo="Composição corporal e comparativo" acoes={<div className="flex gap-2">{acoes}</div>} />
        )}
      />
    </div>
  );
}
