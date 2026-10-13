import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, KeyRound, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { acaoConta } from "@/conta/gravar";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { useSessao } from "@/nucleo/sessao";
import { salvarMinhaSenha } from "@/nucleo/senha";
import { subirFotoPerfil, validarFoto } from "@/painel/configuracoes/perfil/foto";
import { formasDeEntrar, validarNovaSenha } from "@/painel/configuracoes/perfil/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { meuPerfilAluno } from "./pecas/api";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";

const NOME_MAX = 80;

function Secao({ titulo, children, marca, descricao }: { titulo: string; children: React.ReactNode; marca: string; descricao?: string }) {
  return (
    <Cartao className="flex flex-col gap-3 px-4 py-4" data-secao={marca}>
      <div>
        <h2 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-[12.5px] leading-relaxed text-texto-2">{descricao}</p>}
      </div>
      {children}
    </Cartao>
  );
}

/**
 * Perfil › Conta (a engrenagem da tela 5): foto, nome, e-mail, como a pessoa entra e a senha — trocar para quem entra com senha
 * (P22) ou criar uma para quem entra com o Google (o aviso da P25 promete: "Pode criar uma senha no Perfil"). "Esqueci a senha"
 * continua com o profissional. Tudo no banco principal (profiles da própria pessoa; a foto no bucket fotos-perfil, pasta dela).
 * hml-21a (H-43 · jeito 2): o nome e a foto gravam pela função conta, com a sessão da pessoa — perfil_nome; a foto sobe pelo link que o
 * servidor assina e perfil_foto_salvar grava a URL (e tira do bucket a foto de antes); "Tirar" = perfil_foto_tirar. O servidor lê o
 * dados_profissionais e grava só a foto (o resto do JSON fica, como o comFoto de antes). A senha (o login) segue no navegador.
 */
export default function Conta() {
  const { usuario, recarregarSituacao } = useSessao();
  const qc = useQueryClient();
  const uid = usuario?.id ?? "";
  const perfil = useQuery({ queryKey: ["perfil-aluno", uid], queryFn: meuPerfilAluno, enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
  const [nome, setNome] = useState<string | null>(null);
  const [erroNome, setErroNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (perfil.data && nome === null) setNome(perfil.data.nome ?? "");
  }, [perfil.data, nome]);

  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ["perfil-aluno", uid] });
    await recarregarSituacao();
  };

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    const n = (nome ?? "").trim();
    if (n.length < 2) return setErroNome("Informe o seu nome (pelo menos 2 letras).");
    if (n.length > NOME_MAX) return setErroNome(`O nome pode ter até ${NOME_MAX} caracteres.`);
    setSalvandoNome(true);
    try {
      await acaoConta("perfil_nome", { nome: n });
      await recarregar();
      toast.success("Nome salvo.");
    } catch {
      setErroNome("Não foi possível salvar agora. Confira a internet e tente de novo.");
    } finally {
      setSalvandoNome(false);
    }
  };

  /** a foto nova (o caminho que subiu pelo link assinado) ou null = tirar */
  const gravarFoto = async (caminho: string | null) => {
    if (caminho) await acaoConta("perfil_foto_salvar", { caminho });
    else await acaoConta("perfil_foto_tirar");
    await recarregar();
  };

  const escolherFoto = async (ev: ChangeEvent<HTMLInputElement>) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    const problema = validarFoto(arquivo);
    if (problema) return void toast.error(problema);
    setEnviandoFoto(true);
    try {
      await gravarFoto((await subirFotoPerfil(arquivo)).caminho);
      toast.success("Foto trocada.");
    } catch {
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const tirarFoto = async () => {
    setEnviandoFoto(true);
    try {
      await gravarFoto(null);
      toast.success("Foto removida.");
    } catch {
      toast.error("Não foi possível tirar a foto agora.");
    } finally {
      setEnviandoFoto(false);
    }
  };

  if (!uid) return null;
  return (
    <div data-pagina-conta className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Conta" />
      {perfil.isLoading ? (
        <EstadoCarregando linhas={2} rotulo="Carregando a conta" />
      ) : perfil.isError ? (
        <EstadoErro aoTentar={() => void perfil.refetch()} />
      ) : (
        <>
          <Secao titulo="Seus dados" marca="conta-dados">
            <div className="flex items-center gap-3.5">
              <Avatar src={perfil.data?.foto_url} nome={nome || perfil.data?.nome} tamanho={64} />
              <div className="flex min-w-0 flex-col gap-2">
                <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={escolherFoto} data-conta-foto-arquivo />
                <div className="flex flex-wrap gap-2">
                  <Botao tamanho="sm" icone={Camera} onClick={() => inputFoto.current?.click()} disabled={enviandoFoto} data-conta-trocar-foto>
                    {enviandoFoto ? "Enviando…" : "Trocar foto"}
                  </Botao>
                  {perfil.data?.foto_propria && (
                    <Botao tamanho="sm" icone={Trash2} onClick={() => void tirarFoto()} disabled={enviandoFoto} data-conta-tirar-foto>Tirar</Botao>
                  )}
                </div>
                <span className="text-[11.5px] text-texto-3">JPG, PNG ou WebP até 5 MB.</span>
              </div>
            </div>
            <form onSubmit={salvarNome} className="flex flex-col gap-3" data-form-nome>
              <Campo rotulo="Nome" value={nome ?? ""} onChange={(e) => { setNome(e.target.value); setErroNome(""); }} maxLength={NOME_MAX} autoComplete="name" data-conta-nome />
              {erroNome && <MensagemForm>{erroNome}</MensagemForm>}
              <Botao type="submit" disabled={salvandoNome || (nome ?? "").trim() === (perfil.data?.nome ?? "").trim()} data-conta-salvar-nome>
                {salvandoNome ? "Salvando…" : "Salvar nome"}
              </Botao>
            </form>
          </Secao>
          <Acesso />
        </>
      )}
    </div>
  );
}

/** E-mail, como entra e a senha (trocar ou criar). */
function Acesso() {
  const { usuario } = useSessao();
  const formas = formasDeEntrar(usuario as never);
  // P25: na 1ª entrada com o Google a senha antiga virou uma aleatória — para a pessoa, é "criar" uma senha
  const trocadaPeloGoogle = Boolean((usuario?.app_metadata as Record<string, unknown> | undefined)?.senha_trocada_google_em);
  const [temSenha, setTemSenha] = useState(formas.senha && !trocadaPeloGoogle);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarNovaSenha({ senha, confirmacao });
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro("");
    try {
      // W8b: grava e tira a marca de senha provisória (a que o profissional criou)
      const r = await salvarMinhaSenha(senha);
      if (!r.ok) return setErro((r as { erro: string }).erro);
      setSenha("");
      setConfirmacao("");
      toast.success(temSenha ? "Senha trocada." : "Senha criada. Agora você também entra com e-mail e senha.");
      setTemSenha(true);
    } catch {
      setErro("Não foi possível salvar a senha agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Secao titulo="Acesso" marca="conta-acesso">
      <div className="flex items-center gap-3 text-[13px]">
        <Mail aria-hidden className="h-4 w-4 flex-none text-texto-3" />
        <span className="text-texto-2">E-mail</span>
        <span className="ml-auto min-w-0 truncate text-right font-medium text-texto" data-conta-email>{usuario?.email}</span>
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <KeyRound aria-hidden className="h-4 w-4 flex-none text-texto-3" />
        <span className="text-texto-2">Entra com</span>
        <span className="ml-auto flex flex-wrap justify-end gap-1.5" data-conta-formas>
          {formas.google && <Chip tom="g">GOOGLE</Chip>}
          {temSenha && <Chip tom="g">E-MAIL E SENHA</Chip>}
        </span>
      </div>
      <form onSubmit={salvar} className="mt-1 flex flex-col gap-3 border-t border-linha pt-4" data-form-senha={temSenha ? "trocar" : "criar"}>
        <p className="text-[12.5px] leading-relaxed text-texto-2">
          {temSenha ? "Troque a senha que você usa para entrar." : "Crie uma senha para entrar também com e-mail e senha (o Google continua valendo)."}
        </p>
        <Campo rotulo={temSenha ? "Nova senha" : "Senha"} type="password" autoComplete="new-password" value={senha}
          onChange={(e) => { setSenha(e.target.value); setErro(""); }} data-senha-nova />
        <Campo rotulo="Repita a senha" type="password" autoComplete="new-password" value={confirmacao}
          onChange={(e) => { setConfirmacao(e.target.value); setErro(""); }} data-senha-confirmacao />
        {erro && <MensagemForm data-senha-erro>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" disabled={salvando || !senha} data-senha-salvar>
          {salvando ? "Salvando…" : temSenha ? "Trocar senha" : "Criar senha"}
        </Botao>
        <p className="text-[12px] text-texto-3">Esqueceu a senha? Fale com o seu profissional.</p>
      </form>
    </Secao>
  );
}
