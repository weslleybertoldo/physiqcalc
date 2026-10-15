import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { limparCodigo } from "@/nucleo/doisFatoresRegras";

/**
 * hml-22 (H-22) — os 6 números do app autenticador (o InputOTP do repo no visual premium): só números, colar funciona, o teclado
 * numérico abre no celular e o navegador oferece o código ("one-time-code"). Completou os 6 → `aoCompletar`.
 */
export function CampoCodigo({
  valor,
  aoMudar,
  aoCompletar,
  desligado,
  invalido,
  autoFocus,
  rotulo = "Código de 6 números",
}: {
  valor: string;
  aoMudar: (codigo: string) => void;
  aoCompletar?: (codigo: string) => void;
  desligado?: boolean;
  invalido?: boolean;
  autoFocus?: boolean;
  rotulo?: string;
}) {
  return (
    <InputOTP
      maxLength={6}
      value={valor}
      onChange={(v) => aoMudar(limparCodigo(v))}
      onComplete={(v: string) => aoCompletar?.(limparCodigo(v))}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      disabled={desligado}
      aria-label={rotulo}
      data-2fa-codigo
      containerClassName="justify-center"
    >
      <InputOTPGroup className="gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot
            key={i}
            index={i}
            aria-invalid={invalido || undefined}
            className="h-12 w-11 rounded-[14px] border border-linha-2 bg-superficie text-[20px] font-semibold tabular-nums text-texto shadow-none first:rounded-l-[14px] first:border-l last:rounded-r-[14px] data-[active=true]:border-violeta/60 data-[active=true]:ring-2 data-[active=true]:ring-violeta/30 aria-invalid:border-rosa sm:w-12"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
