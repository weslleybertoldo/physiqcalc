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
        super.onCreate(savedInstanceState);

        WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
    }
}
