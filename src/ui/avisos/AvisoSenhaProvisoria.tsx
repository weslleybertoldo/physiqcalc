import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { TituloEntrada } from "@/entrada/pecas/Moldura";
import { useSessao } from "@/nucleo/sessao";
import { adiarNestaSessao, idDaSessao, precisaCriarSenha, salvarMinhaSenha } from "@/nucleo/senha";
import { validarNovaSenha } from "@/painel/configuracoes/perfil/regras";
import { Cartao } from "@/ui/premium/Cartao";
import { Marca } from "@/ui/premium/Marca";
import { useSaidaAnimada } from "@/ui/premium/useSaidaAnimada";

/**
 * "Crie a sua senha" (W8b — regra dele: "quando ele logar aparece a opção de atualizar, primeira página assim que ele loga depois
 * de um reset de senha"). Aparece por cima de tudo (app, painel ou master) logo depois de entrar com a senha PROVISÓRIA que o
 * profissional criou. É uma opção: "Agora não" entra no app e a tela volta no próximo login, até a pessoa gravar a senha dela
 * (aqui ou em Perfil › Conta). No padrão da tela 1 (halo, marca, coluna de celular). A casca monta sozinha (src/ui/avisos).
 */
export default function AvisoSenhaProvisoria() {
  const { usuario, sessao } = useSessao();
  const [fechado, setFechado] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const idSessao = idDaSessao(sessao);
  const visivel = !!usuario && fechado !== idSessao && precisaCriarSenha({ usuario, sessao });
  // hml-18a (H-40, D): a tela entra e SAI esmaecendo (200 ms) — antes sumia seca no "Agora não" e depois de salvar
  const saida = useSaidaAnimada<HTMLDivElement>(visivel);
  if (!usuario || !saida.montado) return null;
  const nome = String((usuario.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "").trim().split(/\s+/)[0];

  const depois = () => {
    adiarNestaSessao(usuario.id, idSessao);
    setFechado(idSessao);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarNovaSenha({ senha, confirmacao });
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro("");
    const r = await salvarMinhaSenha(senha);
    setSalvando(false);
    if (!r.ok) return setErro((r as { erro: string }).erro);
    setFechado(idSessao);
    toast.success("Senha criada. Da próxima vez, entre com ela.");
  };

  // camada fixa por cima do app (z 48: acima da barra e do cabeçalho; abaixo das janelas z 50 — se outra janela global estiver
  // aberta, ela fica por cima e a pessoa resolve primeiro; sem disputar o foco com o Radix delas)
  return (
    <div ref={saida.ref} role="dialog" aria-modal="true" aria-labelledby="titulo-senha-provisoria" data-aviso-senha-provisoria data-state={saida.estado}
      className="fixed inset-0 z-[48] overflow-y-auto bg-tela text-texto outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[440px] flex-col px-5 pb-8 pt-[max(22px,env(safe-area-inset-top,0px))]">
        <header className="flex h-11 items-center">
          <Marca tamanho={34} />
        </header>
        <main className="flex flex-1 flex-col justify-center gap-5 py-8">
          <div id="titulo-senha-provisoria">
            <TituloEntrada
              sobre={nome ? `Olá, ${nome}` : "Olá"}
              titulo="Crie a sua senha"
              texto="Você entrou com a senha que o seu profissional criou. Troque agora por uma senha só sua — ou deixe para depois."
            />
          </div>
          <Cartao brilho className="p-4">
            <form onSubmit={salvar} className="flex flex-col gap-4" data-form-senha-provisoria>
              <div className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
                  <ShieldCheck aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <span className="pt-0.5 text-[13px] leading-relaxed text-texto-2">
                  Pelo menos 8 caracteres, com letras e números. Depois disso, a senha provisória deixa de valer.
                </span>
              </div>
              <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={senha}
                onChange={(e) => { setSenha(e.target.value); setErro(""); }} data-senha-provisoria-nova />
              <Campo rotulo="Repita a senha" type="password" autoComplete="new-password" value={confirmacao}
                onChange={(e) => { setConfirmacao(e.target.value); setErro(""); }} data-senha-provisoria-confirmacao />
              {erro && <MensagemForm data-senha-provisoria-erro>{erro}</MensagemForm>}
              <button type="submit" disabled={salvando || !senha} data-senha-provisoria-salvar
                className="pq-botao pq-botao-w h-[52px] w-full rounded-2xl text-[15.5px]">
                <KeyRound aria-hidden />
                {salvando ? "Salvando…" : "Salvar minha senha"}
              </button>
              <button type="button" onClick={depois} disabled={salvando} data-senha-provisoria-depois
                className="pq-botao pq-botao-g h-[48px] w-full rounded-2xl text-[14.5px]">
                Agora não
              </button>
            </form>
          </Cartao>
          <p className="px-1 text-center text-[12.5px] leading-relaxed text-texto-3">
            Se deixar para depois, esta tela aparece de novo no próximo login. Você também troca a senha em Perfil › Conta.
          </p>
        </main>
      </div>
    </div>
  );
}
