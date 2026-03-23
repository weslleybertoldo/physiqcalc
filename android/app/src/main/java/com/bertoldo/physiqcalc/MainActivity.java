package com.bertoldo.physiqcalc;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CountdownNotificationPlugin.class);
        super.onCreate(savedInstanceState);

        WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
    }
}
