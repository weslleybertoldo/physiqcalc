package com.bertoldo.physiqcalc;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CountdownNotificationPlugin.class);
        // W1 da loja: a versão da Google Play (playRelease) não instala APK — a loja proíbe app que se atualiza por fora dela
        if (!BuildConfig.LOJA) {
            registerPlugin(ApkInstallerPlugin.class);
        }
        registerPlugin(GalleryImagePlugin.class);
        registerPlugin(PushFirebasePlugin.class);
        // restaurar-login: a chave de volta do Android (Restore Credentials) — nos 2 builds (D2); a trava do servidor desliga tudo
        registerPlugin(RestaurarLoginPlugin.class);
        // play-W6: a cobrança da Google Play só no playRelease (PlataformaLoja por build type; no APK do site, vazia)
        PlataformaLoja.registrar(this);
        super.onCreate(savedInstanceState);

        WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
    }
}
