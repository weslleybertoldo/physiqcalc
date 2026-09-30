/**
 * Captcha invisível do "Entrar com e-mail e senha" (W8b): Cloudflare Turnstile. O widget roda sozinho quando a tela abre (sem
 * nada na tela para quase todo mundo) e só mostra a caixinha "Confirme que é humano" se o Cloudflare desconfiar. O token vai
 * junto da tentativa para a função entrar-senha, que confere no servidor — sem ele a tentativa nem é contada.
 * Cada token vale UMA tentativa (e ~5 min): depois de usar, o widget gera outro.
 * Sem o script do Cloudflare (sem internet, bloqueado) a tentativa vai sem token e o servidor decide (o master pode desligar o
 * captcha em app_config 'login_limite' sem deploy).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Chave pública do widget "Physiq - entrar com senha (W8b)" (domínios physiqcalc.com.br, o staging e localhost — o APK). */
export const TURNSTILE_SITE_KEY =
  String((import.meta.env as Record<string, string | undefined>).VITE_TURNSTILE_SITE_KEY ?? "").trim() || "0x4AAAAAAFJzUMo7DzTQWuLP";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface OpcoesTurnstile {
  sitekey: string;
  action?: string;
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  "refresh-expired"?: "auto" | "manual" | "never";
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  language?: string;
  callback?: (token: string) => void;
  "error-callback"?: (codigo: string) => boolean | void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
}
export interface TurnstileApi {
  render(el: HTMLElement | string, opcoes: OpcoesTurnstile): string | undefined;
  reset(id?: string): void;
  remove(id?: string): void;
  execute(el: HTMLElement | string, opcoes?: Partial<OpcoesTurnstile>): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let carregando: Promise<TurnstileApi> | null = null;

/** Carrega o script do Turnstile uma vez (15 s de limite; se falhar, a próxima tela tenta de novo). */
export function carregarTurnstile(limiteMs = 15_000): Promise<TurnstileApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem_janela"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (carregando) return carregando;
  carregando = new Promise<TurnstileApi>((resolve, reject) => {
    const falhar = (motivo: string) => {
      carregando = null;
      reject(new Error(motivo));
    };
    const timer = window.setTimeout(() => falhar("captcha_tempo"), limiteMs);
    const pronto = () => {
      const t0 = Date.now();
      const olhar = () => {
        if (window.turnstile) {
          window.clearTimeout(timer);
          resolve(window.turnstile);
        } else if (Date.now() - t0 > 5000) {
          window.clearTimeout(timer);
          falhar("captcha_sem_api");
        } else window.setTimeout(olhar, 50);
      };
      olhar();
    };
    let s = document.querySelector<HTMLScriptElement>("script[data-physiq-turnstile]");
    if (!s) {
      s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.defer = true;
      s.dataset.physiqTurnstile = "1";
      document.head.appendChild(s);
    }
    s.addEventListener("load", pronto, { once: true });
    s.addEventListener("error", () => {
      window.clearTimeout(timer);
      s?.remove();
      falhar("captcha_indisponivel");
    }, { once: true });
    if (window.turnstile) pronto();
  });
  return carregando;
}

export type EstadoCaptcha = "carregando" | "pronto" | "interacao" | "erro";

export interface Captcha {
  /** onde o widget mora (fica vazio/invisível, a não ser que o Cloudflare peça o clique) */
  refCaixa: RefObject<HTMLDivElement | null>;
  estado: EstadoCaptcha;
  /** token para UMA tentativa ("" se o captcha não carregou — o servidor decide) */
  obterToken: () => Promise<string>;
  /** a tentativa usou o token: gera outro para a próxima */
  usado: () => void;
}

type Espera = { resolver: (t: string) => void; timer: number };

/** O widget do Turnstile da tela (invisível; a caixinha só aparece se o Cloudflare pedir). */
export function useCaptcha(acao = "entrar"): Captcha {
  const refCaixa = useRef<HTMLDivElement | null>(null);
  const id = useRef<string | undefined>(undefined);
  const api = useRef<TurnstileApi | null>(null);
  const token = useRef<string>("");
  const esperas = useRef<Espera[]>([]);
  const [estado, setEstado] = useState<EstadoCaptcha>("carregando");
  const estadoRef = useRef<EstadoCaptcha>("carregando");
  estadoRef.current = estado;

  const entregar = useCallback((t: string) => {
    const lista = esperas.current;
    esperas.current = [];
    for (const e of lista) {
      window.clearTimeout(e.timer);
      e.resolver(t);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const tema = typeof document !== "undefined" && document.documentElement.getAttribute("data-tema") === "claro" ? "light" : "dark";
    carregarTurnstile()
      .then((t) => {
        if (!vivo || !refCaixa.current) return;
        api.current = t;
        id.current = t.render(refCaixa.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: acao,
          appearance: "interaction-only",
          execution: "render",
          "refresh-expired": "auto",
          theme: tema,
          size: "flexible",
          language: "pt-br",
          callback: (tok) => {
            token.current = tok;
            setEstado("pronto");
            entregar(tok);
          },
          "error-callback": () => {
            token.current = "";
            setEstado("erro");
            entregar("");
            return true;
          },
          "expired-callback": () => {
            token.current = "";
          },
          "timeout-callback": () => {
            token.current = "";
            setEstado("erro");
            entregar("");
          },
          "before-interactive-callback": () => setEstado("interacao"),
          "after-interactive-callback": () => setEstado("pronto"),
        });
        if (estadoRef.current === "carregando") setEstado("pronto");
      })
      .catch(() => {
        if (!vivo) return;
        setEstado("erro");
        entregar("");
      });
    return () => {
      vivo = false;
      entregar("");
      try {
        if (id.current) api.current?.remove(id.current);
      } catch {
        /* widget já saiu */
      }
      id.current = undefined;
    };
  }, [acao, entregar]);

  const obterToken = useCallback(async (): Promise<string> => {
    if (token.current) return token.current;
    if (estadoRef.current === "erro") {
      // tenta de novo uma vez (erro de rede do widget, token vencido): se não vier, segue sem token
      try {
        if (id.current) api.current?.reset(id.current);
        else return "";
      } catch {
        return "";
      }
    }
    return await new Promise<string>((resolver) => {
      // a pessoa pode precisar clicar na caixinha: espera mais quando o Cloudflare pediu a interação
      const limite = estadoRef.current === "interacao" ? 120_000 : 25_000;
      const timer = window.setTimeout(() => {
        esperas.current = esperas.current.filter((e) => e.timer !== timer);
        resolver(token.current || "");
      }, limite);
      esperas.current.push({ resolver, timer });
    });
  }, []);

  const usado = useCallback(() => {
    token.current = "";
    try {
      if (id.current) api.current?.reset(id.current);
    } catch {
      /* noop */
    }
  }, []);

  return { refCaixa, estado, obterToken, usado };
}
