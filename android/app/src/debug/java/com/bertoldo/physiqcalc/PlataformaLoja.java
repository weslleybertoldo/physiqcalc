package com.bertoldo.physiqcalc;

import com.getcapacitor.BridgeActivity;

/**
 * play-W6 — o build de debug: nada da Google Play (igual ao APK do site). A cobrança da Play só existe no playRelease
 * (src/playRelease/…/PlataformaLoja.java registra o PlayBillingPlugin); aqui o registrar fica vazio de propósito.
 */
final class PlataformaLoja {

    private PlataformaLoja() {
    }

    static void registrar(BridgeActivity atividade) {
        // o debug não vende pela Play
    }
}
