package com.bertoldo.physiqcalc;

import com.getcapacitor.BridgeActivity;

/**
 * play-W6 — o que só a versão da Google Play (build type playRelease) registra: a cobrança da Play (PlayBillingPlugin).
 * Há uma PlataformaLoja por build type (src/release/ e src/debug/ ficam vazias), escolhida pelo Gradle — sem reflexão: o APK
 * do site nem compila a cobrança. O MainActivity chama o registrar antes do super.onCreate (como os outros plugins).
 */
final class PlataformaLoja {

    private PlataformaLoja() {
    }

    static void registrar(BridgeActivity atividade) {
        atividade.registerPlugin(PlayBillingPlugin.class);
    }
}
