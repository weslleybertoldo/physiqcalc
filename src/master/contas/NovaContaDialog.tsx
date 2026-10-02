import { useEffect, useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { gerarSenhaProvisoria } from "@/painel/aluno/resumo/acesso/regras";
import { Botao } from "@/ui/premium/Botao";
import { criarConta, ErroMaster, type NovaConta } from "../api";
import { Campo, INPUT, Janela, SELECT } from "../pecas/ui";
import { FAIXAS, PLANOS, ROTULO_FAIXA, ROTULO_PLANO, dataCurta, textoErro } from "../regras";

const TIPOS: Array<{ valor: NovaConta["tipo"]; rotulo: string }> = [
  { valor: "outra_area", rotulo: "Personal + nutricionista (outra área)" },
  { valor: "personal", rotulo: "Personal trainer (Ed. Física)" },
  { valor: "nutricionista", rotulo: "Nutricionista" },
  { valor: "academico", rotulo: "Acadêmico de Nutrição" },
];

/**
 * "Nova conta" do master (N-8, N-22, R5/P12): o profissional entra com e-mail e senha (o master cria o login — "entrar com senha"
 * vale para qualquer conta com senha) ou com o Google nesse e-mail. A conta nasce com a regra do "Sou profissional" (14 dias grátis
 * no Treino + Nutrição, papéis pelo tipo, código PROF-…) e o master já escolhe o plano, a faixa e, se quiser, a isenção.
 */
export function NovaContaDialog({ aberta, aoMudar, aoCriada }: { aberta: boolean; aoMudar: (a: boolean) => void; aoCriada: (contaId: string) => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [nomeConta, setNomeConta] = useState("");
  const [tipo, setTipo] = useState<NovaConta["tipo"]>("outra_area");
  const [registro, setRegistro] = useState("");
  const [plano, setPlano] = useState("treino_nutricao");
  const [faixa, setFaixa] = useState("f10");
  const [modo, setModo] = useState<NovaConta["modo"]>("senha");
  const [senha, setSenha] = useState("");
  const [isentar, setIsentar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState<{ email: string; senha: string | null; codigo: string | null; teste: string | null; contaId: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    setEmail(""); setNome(""); setNomeConta(""); setTipo("outra_area"); setRegistro(""); setPlano("treino_nutricao"); setFaixa("f10");
    setModo("senha"); setSenha(gerarSenhaProvisoria()); setIsentar(false); setMotivo(""); setErro(null); setPronto(null); setCopiado(false);
  }, [aberta]);

  async function criar() {
    setErro(null);
    setOcupado(true);
    try {
      const r = await criarConta({
        email: email.trim().toLowerCase(), nome: nome.trim(), nome_conta: nomeConta.trim() || nome.trim(), tipo, registro: registro.trim() || undefined,
        plano, faixa, isentar, motivo: isentar ? motivo.trim() : undefined, modo, senha: modo === "senha" ? senha : undefined,
      });
      setPronto({ email: email.trim().toLowerCase(), senha: modo === "senha" && r.login_criado ? senha : null, codigo: r.codigo_convite, teste: r.conta?.teste_ate ?? null, contaId: r.conta_id });
      toast.success("Conta criada.");
    } catch (e) {
      setErro(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!pronto) return;
    const t = `Physiq — sua conta de profissional\nEntre em https://physiqcalc.com.br/entrar\nE-mail: ${pronto.email}${pronto.senha ? `\nSenha provisória: ${pronto.senha}` : "\nEntre com o Google neste e-mail."}`;
    try {
      await navigator.clipboard.writeText(t);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const valido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && nome.trim().length >= 2 && (modo === "google" || senha.length >= 8)
    && (!isentar || motivo.trim().length >= 3);

  if (pronto) {
    return (
      <Janela aberta={aberta} aoMudar={aoMudar} titulo="Conta criada" descricao="Passe estes dados ao profissional (a senha não fica guardada em lugar nenhum)." data-janela-nova-conta="pronta"
        rodape={(
          <>
            <Botao tamanho="sm" icone={copiado ? Check : Copy} onClick={() => void copiar()} data-nova-conta-copiar>{copiado ? "Copiado" : "Copiar"}</Botao>
            <Botao tamanho="sm" variante="w" onClick={() => { aoCriada(pronto.contaId); aoMudar(false); }} data-nova-conta-abrir>Abrir a conta</Botao>
          </>
        )}>
        <div className="grid gap-2 text-[13.5px]" data-nova-conta-resumo>
          <p><span className="text-texto-3">E-mail:</span> <b>{pronto.email}</b></p>
          {pronto.senha ? <p><span className="text-texto-3">Senha provisória:</span> <b className="font-mono">{pronto.senha}</b></p>
            : <p className="text-texto-2">Entra com o Google neste e-mail (ou com a senha que já tinha).</p>}
          {pronto.codigo && <p><span className="text-texto-3">Código do profissional:</span> <b>{pronto.codigo}</b></p>}
          {pronto.teste && !isentar && <p><span className="text-texto-3">Teste grátis até:</span> <b>{dataCurta(pronto.teste)}</b></p>}
          {isentar && <p className="text-verde-3">Conta isenta: {motivo}</p>}
        </div>
      </Janela>
    );
  }

  return (
    <Janela aberta={aberta} aoMudar={aoMudar} titulo="Nova conta" largura="sm:max-w-2xl" data-janela-nova-conta="form"
      descricao="Cria o profissional e a conta dele. Sem isenção, a conta começa com 14 dias grátis."
      rodape={(
        <>
          <Botao tamanho="sm" onClick={() => aoMudar(false)}>Cancelar</Botao>
          <Botao tamanho="sm" variante="w" onClick={() => void criar()} disabled={!valido || ocupado} data-nova-conta-criar>{ocupado ? "Criando…" : "Criar conta"}</Botao>
        </>
      )}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do profissional"><input className={INPUT} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} data-campo-nome /></Campo>
        <Campo rotulo="E-mail"><input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-campo-email /></Campo>
        <Campo rotulo="Nome da conta" dica="Vazio = o nome do profissional."><input className={INPUT} value={nomeConta} onChange={(e) => setNomeConta(e.target.value)} maxLength={80} data-campo-nome-conta /></Campo>
        <Campo rotulo="Tipo de profissional">
          <select className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as NovaConta["tipo"])} data-campo-tipo>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Plano">
          <select className={SELECT} value={plano} onChange={(e) => setPlano(e.target.value)} data-campo-plano>
            {PLANOS.map((p) => <option key={p} value={p}>{ROTULO_PLANO[p]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Faixa de alunos">
          <select className={SELECT} value={faixa} onChange={(e) => setFaixa(e.target.value)} data-campo-faixa>
            {FAIXAS.map((f) => <option key={f} value={f}>{ROTULO_FAIXA[f as keyof typeof ROTULO_FAIXA]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Registro (CREF/CRN, opcional)"><input className={INPUT} value={registro} onChange={(e) => setRegistro(e.target.value)} maxLength={30} data-campo-registro /></Campo>
        <Campo rotulo="Como vai entrar">
          <select className={SELECT} value={modo} onChange={(e) => setModo(e.target.value as NovaConta["modo"])} data-campo-modo>
            <option value="senha">E-mail e senha (o master cria)</option>
            <option value="google">Com o Google neste e-mail</option>
          </select>
        </Campo>
        {modo === "senha" && (
          <div className="sm:col-span-2">
            <Campo rotulo="Senha provisória" dica="No 1º login a pessoa pode criar a dela em Configurações › Perfil.">
              <span className="flex gap-2">
                <input className={INPUT} value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={72} data-campo-senha />
                <Botao tamanho="sm" icone={Wand2} onClick={() => setSenha(gerarSenhaProvisoria())}>Gerar</Botao>
              </span>
            </Campo>
          </div>
        )}
        <label className="flex items-center gap-2.5 text-[13px] text-texto-2 sm:col-span-2">
          <input type="checkbox" checked={isentar} onChange={(e) => setIsentar(e.target.checked)} className="h-4 w-4 accent-violeta" data-campo-isentar />
          Conta isenta (não é cobrada)
        </label>
        {isentar && (
          <div className="sm:col-span-2">
            <Campo rotulo="Motivo da isenção"><input className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} data-campo-motivo /></Campo>
          </div>
        )}
      </div>
      {erro && <p role="alert" className="text-[13px] font-medium text-rosa-3" data-erro-nova-conta>{erro}</p>}
    </Janela>
  );
}
