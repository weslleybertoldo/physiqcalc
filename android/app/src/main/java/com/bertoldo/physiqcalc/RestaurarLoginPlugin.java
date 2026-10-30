package com.bertoldo.physiqcalc;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreateRestoreCredentialRequest;
import androidx.credentials.CreateRestoreCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetRestoreCredentialOption;
import androidx.credentials.RestoreCredential;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.ClearCredentialProviderConfigurationException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.NoCredentialException;
import androidx.credentials.exceptions.restorecredential.E2eeUnavailableException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.concurrent.Executor;
import java.util.regex.Pattern;

/**
 * Physiq restaurar-login (30/10/2026) — a "chave de volta" do Android (API Restore Credentials, androidx.credentials 1.6.0; a regra
 * "Zero-Tap Sign-In" da Google Play de abr/2027): o app guarda em silêncio uma chave no Android depois do login e, no celular novo
 * (cópia direta ou backup do Google), entra sozinho com ela. Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.3–4.5);
 * medidas no aparelho: fase0.md. O JS (src/nucleo/restaurarLogin.ts) conversa com o servidor; aqui só o Credential Manager.
 *
 *   disponivel()            → { disponivel, motivo?, modelo, android } — Android 9+ (API 28) E Google Play services instalado, LIGADO e
 *                             ≥ 242200000 (24.22). Motivos: android_antigo, sem_play_services, play_services_desligado, play_services_antigo.
 *   criar({ requestJson })  → { responseJson, nuvem } — 1º com o backup na nuvem (isCloudBackupEnabled = true); sem bloqueio de tela, sem
 *                             conta Google ou sem backup vem o E2eeUnavailableException → de novo SÓ NO APARELHO (false: passa na cópia
 *                             direta, não pela nuvem — a receita oficial, D6). Indisponível → { indisponivel: true, motivo }.
 *   obter({ requestJson })  → { responseJson } (a chave assinou o desafio) · { semChave: true } (NoCredentialException) ·
 *                             { indisponivel: true, motivo }.
 *   apagar()                → { ok } (TYPE_CLEAR_RESTORE_CREDENTIAL: do aparelho e do backup). Nunca rejeita: o Sair não espera por ele.
 *   log({ codigo })         → escreve o código no logcat (tag RestaurarLogin) — o JS marca o resultado (ex.: "restaurado").
 *
 * Os 3 "indisponível" do Android viram resposta CALMA (nunca exceção para o JS): *ProviderConfigurationException (sem Play services ou
 * desligado), TYPE_UNKNOWN com "17: API … not available" (a flag do Google desligada no aparelho) e o E2EE (que cai para "só no
 * aparelho"). Os erros são reconhecidos por instanceof / getType() — NUNCA pelo nome da classe: o R8 renomeia (fase 0: o
 * E2eeUnavailableException vira "m0.b"). Log só com CÓDIGOS (criada_nuvem, criada_local, chave_obtida, sem_chave, apagada,
 * indisponivel_17…): nunca o JSON, a chave, o token ou o e-mail. Nos 2 builds (D2: o APK do site e o da loja); a trava do servidor
 * (app_config.restaurar_login) desliga tudo. Sem regra nova no R8: o AAR credentials-play-services-auth já traz a dele (fase 0).
 */
@CapacitorPlugin(name = "RestaurarLogin")
public class RestaurarLoginPlugin extends Plugin {

    private static final String TAG = "RestaurarLogin";
    private static final String PACOTE_GMS = "com.google.android.gms";
    /** Google Play services 24.22 — a régua da API (a página de implementação, o blog de 2024 e o código da biblioteca). */
    static final long GMS_MINIMO = 242200000L;
    /** O tipo do "sem chave" (o NoCredentialException), para quando a classe vier embrulhada. */
    private static final String TIPO_SEM_CHAVE = "android.credentials.GetCredentialException.TYPE_NO_CREDENTIAL";
    /** Só códigos no log: letras minúsculas, números e "_" (nada de JSON, e-mail ou token). */
    private static final Pattern CODIGO = Pattern.compile("^[a-z0-9_]{1,40}$");

    private static boolean motivoLogado = false;

    private CredentialManager gerente() {
        return CredentialManager.create(getContext());
    }

    private Executor executor() {
        return ContextCompat.getMainExecutor(getContext());
    }

    // ───────────────────────── disponível? ─────────────────────────

    @PluginMethod
    public void disponivel(PluginCall call) {
        String motivo = motivoIndisponivel(getContext());
        JSObject r = new JSObject();
        r.put("disponivel", motivo == null);
        if (motivo != null) {
            r.put("motivo", motivo);
            if (!motivoLogado) {
                motivoLogado = true;
                Log.i(TAG, "indisponivel_" + motivo);
            }
        }
        r.put("modelo", modelo());
        r.put("android", Build.VERSION.RELEASE);
        call.resolve(r);
    }

    /** null = a API pode rodar aqui; senão o motivo (código). */
    static String motivoIndisponivel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "android_antigo";
        PackageInfo gms;
        try {
            PackageManager pm = ctx.getPackageManager();
            gms = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? pm.getPackageInfo(PACOTE_GMS, PackageManager.PackageInfoFlags.of(0))
                : pm.getPackageInfo(PACOTE_GMS, 0);
        } catch (PackageManager.NameNotFoundException e) {
            return "sem_play_services";
        }
        // o pacote pode existir DESLIGADO (pm disable-user): a API dá ProviderConfigurationException — a fase 0 mediu
        ApplicationInfo info = gms.applicationInfo;
        if (info == null || !info.enabled) return "play_services_desligado";
        if (gms.getLongVersionCode() < GMS_MINIMO) return "play_services_antigo";
        return null;
    }

    private static String modelo() {
        String marca = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        String modelo = Build.MODEL == null ? "" : Build.MODEL.trim();
        if (!marca.isEmpty() && modelo.toLowerCase().startsWith(marca.toLowerCase())) return modelo;
        return (marca + " " + modelo).trim();
    }

    // ───────────────────────── criar ─────────────────────────

    @PluginMethod
    public void criar(PluginCall call) {
        String json = call.getString("requestJson");
        if (json == null || json.isEmpty()) {
            call.reject("sem requestJson", "pedido_invalido");
            return;
        }
        String motivo = motivoIndisponivel(getContext());
        if (motivo != null) {
            calmo(call, motivo);
            return;
        }
        criarUma(call, json, true);
    }

    private void criarUma(PluginCall call, String json, boolean nuvem) {
        Activity atividade = getActivity();
        if (atividade == null) {
            call.reject("sem tela", "sem_tela");
            return;
        }
        CreateRestoreCredentialRequest pedido;
        try {
            pedido = new CreateRestoreCredentialRequest(json, nuvem);
        } catch (RuntimeException e) {
            // JSON fora do padrão WebAuthn ou user.id inválido (IllegalArgumentException)
            Log.w(TAG, "pedido_invalido_criar");
            call.reject("pedido inválido", "pedido_invalido");
            return;
        }
        gerente().createCredentialAsync(atividade, pedido, null, executor(),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse resposta) {
                    if (!(resposta instanceof CreateRestoreCredentialResponse)) {
                        Log.w(TAG, "resposta_inesperada_criar");
                        call.reject("resposta inesperada", "erro_criar");
                        return;
                    }
                    JSObject r = new JSObject();
                    r.put("responseJson", ((CreateRestoreCredentialResponse) resposta).getResponseJson());
                    r.put("nuvem", nuvem);
                    Log.i(TAG, nuvem ? "criada_nuvem" : "criada_local");
                    call.resolve(r);
                }

                @Override
                public void onError(CreateCredentialException e) {
                    if (nuvem && e instanceof E2eeUnavailableException) {
                        // sem bloqueio de tela, sem conta Google ou sem backup: a chave fica só no aparelho (D6)
                        Log.i(TAG, "e2ee_indisponivel");
                        criarUma(call, json, false);
                        return;
                    }
                    String motivo = motivoDoErro(e, e.getType(), e instanceof CreateCredentialProviderConfigurationException);
                    if (motivo != null) {
                        calmo(call, motivo);
                        return;
                    }
                    Log.w(TAG, "erro_criar");
                    call.reject("não criou a chave", "erro_criar");
                }
            });
    }

    // ───────────────────────── obter ─────────────────────────

    @PluginMethod
    public void obter(PluginCall call) {
        String json = call.getString("requestJson");
        if (json == null || json.isEmpty()) {
            call.reject("sem requestJson", "pedido_invalido");
            return;
        }
        String motivo = motivoIndisponivel(getContext());
        if (motivo != null) {
            calmo(call, motivo);
            return;
        }
        Activity atividade = getActivity();
        if (atividade == null) {
            call.reject("sem tela", "sem_tela");
            return;
        }
        GetCredentialRequest pedido;
        try {
            // a opção da chave de volta não se mistura com outra no mesmo pedido (referência do GetRestoreCredentialOption)
            pedido = new GetCredentialRequest(Collections.singletonList(new GetRestoreCredentialOption(json)));
        } catch (RuntimeException e) {
            Log.w(TAG, "pedido_invalido_obter");
            call.reject("pedido inválido", "pedido_invalido");
            return;
        }
        gerente().getCredentialAsync(atividade, pedido, null, executor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse resposta) {
                    Credential c = resposta.getCredential();
                    String j = null;
                    if (c instanceof RestoreCredential) {
                        j = ((RestoreCredential) c).getAuthenticationResponseJson();
                    } else if (RestoreCredential.TYPE_RESTORE_CREDENTIAL.equals(c.getType())) {
                        // por garantia (o exemplo Shrine): a resposta pelo Bundle
                        j = c.getData().getString("androidx.credentials.BUNDLE_KEY_GET_RESTORE_CREDENTIAL_RESPONSE");
                    }
                    if (j == null || j.isEmpty()) {
                        Log.w(TAG, "resposta_inesperada_obter");
                        call.reject("resposta inesperada", "erro_obter");
                        return;
                    }
                    JSObject r = new JSObject();
                    r.put("responseJson", j);
                    Log.i(TAG, "chave_obtida");
                    call.resolve(r);
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof NoCredentialException || TIPO_SEM_CHAVE.equals(e.getType())) {
                        Log.i(TAG, "sem_chave");
                        JSObject r = new JSObject();
                        r.put("semChave", true);
                        call.resolve(r);
                        return;
                    }
                    String motivo = motivoDoErro(e, e.getType(), e instanceof GetCredentialProviderConfigurationException);
                    if (motivo != null) {
                        calmo(call, motivo);
                        return;
                    }
                    Log.w(TAG, "erro_obter");
                    call.reject("não obteve a chave", "erro_obter");
                }
            });
    }

    // ───────────────────────── apagar ─────────────────────────

    @PluginMethod
    public void apagar(PluginCall call) {
        String motivo = motivoIndisponivel(getContext());
        if (motivo != null) {
            calmo(call, motivo);
            return;
        }
        ClearCredentialStateRequest pedido = new ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL);
        gerente().clearCredentialStateAsync(pedido, null, executor(),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void v) {
                    Log.i(TAG, "apagada");
                    JSObject r = new JSObject();
                    r.put("ok", true);
                    call.resolve(r);
                }

                @Override
                public void onError(ClearCredentialException e) {
                    // nunca exceção: quem chama (o Sair, a sessão derrubada) segue de qualquer jeito
                    boolean semProvedor = e instanceof ClearCredentialProviderConfigurationException;
                    Log.i(TAG, semProvedor ? "indisponivel_sem_provedor" : "apagar_falhou");
                    JSObject r = new JSObject();
                    r.put("ok", false);
                    if (semProvedor) {
                        r.put("indisponivel", true);
                        r.put("motivo", "sem_provedor");
                    }
                    call.resolve(r);
                }
            });
    }

    // ───────────────────────── log (o JS marca o resultado) ─────────────────────────

    @PluginMethod
    public void log(PluginCall call) {
        String codigo = call.getString("codigo");
        if (codigo != null && CODIGO.matcher(codigo).matches()) Log.i(TAG, codigo);
        call.resolve();
    }

    // ───────────────────────── auxiliares ─────────────────────────

    /**
     * O erro é um "indisponível" do Android? null = não (é erro de verdade). semProvedor = o instanceof do *ProviderConfigurationException
     * de cada tipo (sem o Play services, ou desligado). TYPE_UNKNOWN com o status 17 / API_UNAVAILABLE = a flag do Google desligada.
     */
    static String motivoDoErro(Exception e, String tipo, boolean semProvedor) {
        if (semProvedor) return "sem_provedor";
        String msg = e.getMessage() == null ? "" : e.getMessage();
        boolean desconhecido = tipo != null && tipo.endsWith("TYPE_UNKNOWN");
        if (desconhecido && (msg.contains("API_UNAVAILABLE") || msg.contains("status code: 17") || msg.contains("is not available on this device"))) {
            return "17";
        }
        return null;
    }

    private static void calmo(PluginCall call, String motivo) {
        Log.i(TAG, "indisponivel_" + motivo);
        JSObject r = new JSObject();
        r.put("indisponivel", true);
        r.put("motivo", motivo);
        call.resolve(r);
    }
}
