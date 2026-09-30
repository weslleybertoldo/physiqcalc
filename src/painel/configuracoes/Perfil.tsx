import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Dumbbell, GraduationCap, KeyRound, Mail, Moon, Salad, Sparkles, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { principal } from "@/integrations/principal/client";
import { salvarMinhaSenha } from "@/nucleo/senha";
import type { Json } from "@/integrations/principal/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { TopoPagina } from "@/ui/casca/topo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { useTema, type Tema } from "@/ui/tema/useTema";
import { CampoSelect, LinhaInfo, OpcoesPilula, SecaoForm, type OpcaoPilula } from "./pecas/Form";
import { enviarFotoPerfil, validarFoto } from "./perfil/foto";
import {
  TIPOS_PERFIL,
  UFS,
  comFoto,
  dadosParaGravar,
  formDoPerfil,
  formasDeEntrar,
  fotoDoPerfil,
  mascararTelefoneBR,
  paraE164,
  rotuloRegistro,
  validarNovaSenha,
  validarPerfil,
  type FormPerfil,
  type TipoPerfil,
} from "./perfil/regras";

interface LinhaPerfil {
  nome: string | null;
  email: string | null;
  tipo_perfil: string | null;
  dados_profissionais: unknown;
}

const ICONE_TIPO: Record<TipoPerfil, typeof Dumbbell> = { personal: Dumbbell, nutricionista: Salad, academico: GraduationCap, outra_area: Sparkles };

async function buscarPerfil(uid: string): Promise<LinhaPerfil | null> {
  const { data, error } = await principal.from("profiles").select("nome, email, tipo_perfil, dados_profissionais").eq("id", uid).maybeSingle();
  if (error) throw error;
  return (data as LinhaPerfil | null) ?? null;
}

/**
 * O nome e a foto que os alunos já veem nas telas antigas do Calc (Pagamentos, lista do professor) moram no Banco do Treino:
 * quando a sessão dele existe, o Perfil manda o mesmo nome/foto para lá também (como a Configurações antiga fazia). Sem ela,
 * vale o do banco principal — as telas novas leem de lá.
 */
async function espelharNoTreino(treinoUserId: string, campos: { nome?: string; foto_url?: string | null }): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- physiq_professores fica fora dos tipos gerados (padrão das telas antigas)
    await (supabase.from as any)("physiq_professores").update(campos).eq("id", treinoUserId);
  } catch (e) {
    console.warn("[Perfil] espelho do nome no Treino:", e);
  }
}

/**
 * Configurações › Perfil (W5, spec 4.6 — cada membro): nome, foto, tipo de perfil, registro (CRN/CREF), WhatsApp, endereço,
 * cidade/UF, senha (quem entra com senha, ou criar uma) e Aparência. Formulário no padrão da tela 8; tudo no banco principal.
 */
export default function Perfil() {
  const { usuario, recarregarSituacao } = useSessao();
  const { user: usuarioTreino, isStaff } = useAuth();
  const qc = useQueryClient();
  const uid = usuario?.id ?? "";
  const chave = ["perfil-profissional", uid];
  const q = useQuery({ queryKey: chave, queryFn: () => buscarPerfil(uid), enabled: Boolean(uid), staleTime: 30_000, retry: 1 });
  const [form, setForm] = useState<FormPerfil | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  const meta = (usuario?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const fotoGoogle = meta.avatar_url || meta.picture || null;
  const foto = fotoDoPerfil(q.data?.dados_profissionais) ?? fotoGoogle;

  useEffect(() => {
    if (q.data !== undefined && form === null) setForm(formDoPerfil(q.data, meta.full_name || meta.name || ""));
  }, [q.data, form, meta.full_name, meta.name]);

  if (!uid) return null;
  if (q.isLoading || (q.isSuccess && form === null)) {
    return <div data-config-aba="perfil" data-estado-aba="carregando"><EstadoCarregando linhas={3} rotulo="Carregando o perfil" /></div>;
  }
  if (q.isError || !form) {
    return (
      <div data-config-aba="perfil" data-estado-aba="erro">
        <EstadoErro titulo="Não deu para carregar o perfil" texto="Confira a internet e tente de novo." aoTentar={() => void q.refetch()} />
      </div>
    );
  }

  const mudar = (parcial: Partial<FormPerfil>) => {
    setErro("");
    setForm((f) => (f ? { ...f, ...parcial } : f));
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarPerfil(form);
    if (problema) return setErro(problema);
    setSalvando(true);
    try {
      const atual = await buscarPerfil(uid); // o jsonb mais novo (a foto pode ter mudado agora há pouco)
      const nome = form.nome.trim();
      const { error } = await principal
        .from("profiles")
        .update({ nome, tipo_perfil: form.tipo || null, dados_profissionais: dadosParaGravar(form, atual?.dados_profissionais) as Json })
        .eq("id", uid);
      if (error) throw error;
      if (usuarioTreino && isStaff) await espelharNoTreino(usuarioTreino.id, { nome });
      await qc.invalidateQueries({ queryKey: chave });
      await recarregarSituacao();
      toast.success("Perfil salvo.");
    } catch (err) {
      console.error("[Perfil] salvar:", err);
      setErro("Não foi possível salvar agora. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const gravarFoto = async (url: string | null) => {
    const atual = await buscarPerfil(uid);
    const { error } = await principal.from("profiles").update({ dados_profissionais: comFoto(atual?.dados_profissionais, url) as Json }).eq("id", uid);
    if (error) throw error;
    if (usuarioTreino && isStaff) await espelharNoTreino(usuarioTreino.id, { foto_url: url ?? fotoGoogle });
    await qc.invalidateQueries({ queryKey: chave });
    await recarregarSituacao();
  };

  const escolherFoto = async (ev: ChangeEvent<HTMLInputElement>) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    const problema = validarFoto(arquivo);
    if (problema) return void toast.error(problema);
    setEnviandoFoto(true);
    try {
      await gravarFoto(await enviarFotoPerfil(uid, arquivo));
      toast.success("Foto trocada.");
    } catch (err) {
      console.error("[Perfil] foto:", err);
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const tirarFoto = async () => {
    setEnviandoFoto(true);
    try {
      await gravarFoto(null);
      toast.success(fotoGoogle ? "Voltou a foto do Google." : "Foto removida.");
    } catch {
      toast.error("Não foi possível tirar a foto agora.");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const opcoesTipo: OpcaoPilula<TipoPerfil>[] = TIPOS_PERFIL.map((t) => ({ valor: t.id, rotulo: t.rotulo, icone: ICONE_TIPO[t.id] }));
  const e164 = paraE164(form.whatsapp);
  const temFotoPropria = Boolean(fotoDoPerfil(q.data?.dados_profissionais));

  return (
    <div data-config-aba="perfil" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Perfil" subtitulo="Como os seus alunos e a equipe te veem" />
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <SecaoForm brilho titulo="Seus dados" extra={form.tipo ? <Chip tom={form.tipo === "personal" ? "t" : form.tipo === "outra_area" ? "g" : "n"}>{TIPOS_PERFIL.find((t) => t.id === form.tipo)?.rotulo.toUpperCase()}</Chip> : undefined} marca="perfil-dados">
          <form onSubmit={salvar} className="flex flex-col gap-4" data-form-perfil>
            <div className="flex items-center gap-4">
              <Avatar src={foto} nome={form.nome} tamanho={72} />
              <div className="flex min-w-0 flex-col gap-2">
                <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={escolherFoto} data-perfil-foto-arquivo />
                <div className="flex flex-wrap gap-2">
                  <Botao tamanho="sm" icone={Camera} onClick={() => inputFoto.current?.click()} disabled={enviandoFoto} data-perfil-trocar-foto>
                    {enviandoFoto ? "Enviando…" : "Trocar foto"}
                  </Botao>
                  {temFotoPropria && (
                    <Botao tamanho="sm" icone={Trash2} onClick={() => void tirarFoto()} disabled={enviandoFoto} data-perfil-tirar-foto>
                      {fotoGoogle ? "Usar a do Google" : "Tirar a foto"}
                    </Botao>
                  )}
                </div>
                <span className="text-[12px] text-texto-3">JPG, PNG ou WebP até 5 MB. Aparece no menu, na equipe e para os alunos.</span>
              </div>
            </div>
            <Campo rotulo="Nome" value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Como os seus alunos te veem" maxLength={80} data-perfil-nome />
            <OpcoesPilula nome="tipo-perfil" rotulo="Tipo de perfil" opcoes={opcoesTipo} valores={form.tipo ? [form.tipo] : []} aoMudar={(v) => mudar({ tipo: v[0] ?? "" })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo={`${rotuloRegistro(form.tipo)} (opcional)`} value={form.registro} onChange={(e) => mudar({ registro: e.target.value })}
                placeholder={form.tipo === "personal" ? "CREF 000000-G/UF" : form.tipo === "outra_area" ? "Número do conselho" : "CRN 0000/UF"} maxLength={30} data-perfil-registro />
              <Campo rotulo="WhatsApp" inputMode="tel" value={form.whatsapp} onChange={(e) => mudar({ whatsapp: mascararTelefoneBR(e.target.value) })}
                placeholder="(11) 99999-8888" dica={e164 ? `Será salvo como ${e164}` : undefined} data-perfil-whatsapp />
            </div>
            <Campo rotulo="Endereço" value={form.endereco} onChange={(e) => mudar({ endereco: e.target.value })} placeholder="Rua, número, bairro" maxLength={160} data-perfil-endereco />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Campo rotulo="Cidade" value={form.cidade} onChange={(e) => mudar({ cidade: e.target.value })} maxLength={80} data-perfil-cidade />
              <CampoSelect rotulo="UF" value={form.uf} onChange={(e) => mudar({ uf: e.target.value })} data-perfil-uf>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </CampoSelect>
            </div>
            {erro && <MensagemForm data-perfil-erro>{erro}</MensagemForm>}
            <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
              <Botao type="submit" variante="w" disabled={salvando} data-perfil-salvar>{salvando ? "Salvando…" : "Salvar perfil"}</Botao>
              <span className="text-[12px] text-texto-3">O nome e o WhatsApp também saem nos documentos e mensagens da conta.</span>
            </div>
          </form>
        </SecaoForm>
        <div className="flex flex-col gap-3.5">
          <AcessoPerfil email={usuario?.email ?? q.data?.email ?? ""} />
          <AparenciaPerfil />
        </div>
      </div>
    </div>
  );
}

function AcessoPerfil({ email }: { email: string }) {
  const { usuario } = useSessao();
  const formas = formasDeEntrar(usuario as never);
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
      // W8b: grava e tira a marca de senha provisória (se o master/profissional tinha criado uma)
      const r = await salvarMinhaSenha(senha);
      if (!r.ok) return setErro((r as { erro: string }).erro);
      setSenha("");
      setConfirmacao("");
      toast.success(formas.senha ? "Senha trocada." : "Senha criada. Agora você também entra com e-mail e senha.");
    } catch {
      setErro("Não foi possível salvar a senha agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <SecaoForm titulo="Acesso" marca="perfil-acesso">
      <LinhaInfo icone={Mail} rotulo="E-mail" valor={<span className="break-all" data-perfil-email>{email}</span>} />
      <LinhaInfo
        icone={KeyRound}
        rotulo="Entra com"
        valor={
          <span className="flex flex-wrap justify-end gap-1.5">
            {formas.google && <Chip tom="g">GOOGLE</Chip>}
            {formas.senha && <Chip tom="g">E-MAIL E SENHA</Chip>}
            {!formas.google && !formas.senha && <Chip tom="g">—</Chip>}
          </span>
        }
      />
      <form onSubmit={salvar} className="mt-3 flex flex-col gap-3 border-t border-linha pt-4" data-form-senha>
        <p className="text-[12.5px] leading-relaxed text-texto-2">
          {formas.senha ? "Trocar a senha de entrada." : "Crie uma senha para entrar também com e-mail e senha (o Google continua valendo)."}
        </p>
        <Campo rotulo={formas.senha ? "Nova senha" : "Senha"} type="password" autoComplete="new-password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(""); }} data-senha-nova />
        <Campo rotulo="Repita a senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => { setConfirmacao(e.target.value); setErro(""); }} data-senha-confirmacao />
        {erro && <MensagemForm data-senha-erro>{erro}</MensagemForm>}
        <div>
          <Botao type="submit" disabled={salvando || !senha} data-senha-salvar>{salvando ? "Salvando…" : formas.senha ? "Trocar senha" : "Criar senha"}</Botao>
        </div>
      </form>
    </SecaoForm>
  );
}

function AparenciaPerfil() {
  const { tema, definirTema } = useTema();
  return (
    <SecaoForm titulo="Aparência" descricao="O escuro é o padrão do Physiq. A escolha vale neste aparelho." marca="perfil-aparencia">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
          {tema === "claro" ? <Sun aria-hidden className="h-[18px] w-[18px]" /> : <Moon aria-hidden className="h-[18px] w-[18px]" />}
        </span>
        <Segmentado<Tema>
          rotulo="Tema"
          opcoes={[{ valor: "escuro", rotulo: "Escuro" }, { valor: "claro", rotulo: "Claro" }]}
          valor={tema}
          aoMudar={(t) => definirTema(t)}
        />
      </div>
    </SecaoForm>
  );
}
