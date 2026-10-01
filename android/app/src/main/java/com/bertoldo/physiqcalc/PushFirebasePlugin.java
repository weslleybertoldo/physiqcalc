package com.bertoldo.physiqcalc;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Physiq W20c — diz ao JS se ESTE APK tem o Firebase (o google-services.json entrou no build do CI). Sem ele, o
 * PushNotifications.register() derruba o app (FirebaseMessaging.getInstance() sem o FirebaseApp e o Bridge do Capacitor
 * relança a exceção), então o JS só registra o push quando disponivel() = true; senão o app segue com o sino, o e-mail e a
 * notificação local. O plugin com.google.gms.google-services gera o recurso de texto "google_app_id" a partir do arquivo.
 */
@CapacitorPlugin(name = "PushFirebase")
public class PushFirebasePlugin extends Plugin {

    @PluginMethod
    public void disponivel(PluginCall call) {
        boolean tem = false;
        try {
            int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
            tem = id != 0 && !getContext().getString(id).trim().isEmpty();
        } catch (Exception e) {
            tem = false;
        }
        JSObject r = new JSObject();
        r.put("disponivel", tem);
        call.resolve(r);
    }
}
