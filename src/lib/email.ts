// O formato de e-mail que as telas aceitam antes de mandar ao servidor: algo@dominio.ext — o `type="email"` do navegador deixa passar
// "teste@sem-ponto" (homologação, H-47, 08/10/2026). Usado no cadastro pelo link (/c/) e no login por e-mail.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailValido = (v: string | null | undefined): boolean => EMAIL_RE.test(String(v ?? "").trim());
