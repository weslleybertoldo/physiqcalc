package com.bertoldo.physiqcalc;

import com.getcapacitor.BridgeActivity;

/**
 * play-W6 — o APK do site (build type release): nada da Google Play. A cobrança da Play só existe no playRelease
 * (src/playRelease/…/PlataformaLoja.java registra o PlayBillingPlugin); aqui o registrar fica vazio de propósito.
 */
final class PlataformaLoja {

    private PlataformaLoja() {
    }

    static void registrar(BridgeActivity atividade) {
        // o APK do site não vende pela Play
    }
}
