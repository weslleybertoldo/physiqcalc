// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/antropometria/GraficoEvolucao.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum, type PontoEvolucao } from "@/nutricao/editor/lib/antropometriaUtil";

// Evolução do paciente: peso (eixo da esquerda) e % de gordura (eixo da direita) por data da avaliação.
// Sem animação — o print do E2E e o olho dela veem o gráfico pronto na hora.
const EIXO = { fontSize: 11, fill: "#71717A" };

export default function GraficoEvolucao({ serie }: { serie: PontoEvolucao[] }) {
  const temGordura = serie.some((p) => p.gordura !== null);
  return (
    <div className="h-60 w-full" data-grafico data-pontos={serie.length}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" />
          <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,.12)" }} padding={{ left: 24, right: 24 }} />
          <YAxis yAxisId="peso" tick={EIXO} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} unit=" kg" />
          <YAxis yAxisId="gordura" orientation="right" tick={EIXO} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} unit="%" hide={!temGordura} />
          <Tooltip
            contentStyle={{ background: "#09090B", border: "1px solid rgba(255,255,255,.12)", fontSize: 12 }}
            formatter={(v, nome) => [typeof v === "number" ? fmtNum(v, 1) : String(v), String(nome)]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="peso" type="monotone" dataKey="peso" name="Peso (kg)" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          {temGordura && (
            <Line yAxisId="gordura" type="monotone" dataKey="gordura" name="% gordura" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
