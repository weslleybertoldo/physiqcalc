package com.bertoldo.physiqcalc;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.UnfetchedProduct;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * play-W6 — a assinatura do aluno sem profissional pela Google Play (Play Billing Library 9.1.0). Só existe no build type
 * playRelease (src/playRelease/, com o playReleaseImplementation do android/app/build.gradle): o APK do site nem compila a
 * cobrança, a biblioteca nem a permissão com.android.vending.BILLING (scripts/ci/aab-loja.sh confere as 2 saídas).
 *
 * O que o plugin faz: diz se a Play cobra neste aparelho, lê os produtos (o preço é o da Play), abre a compra (com a matrícula
 * opaca no obfuscatedAccountId e, na troca de plano, o token antigo + o modo), lista as compras do aparelho e abre a Central de
 * assinaturas. O que ele NUNCA faz: reconhecer (acknowledge) ou consumir a compra — quem reconhece é o servidor (função
 * play-compras), depois de conferir no Google o pacote, o produto e o dono. Sem o servidor, o Google devolve sozinho em 3 dias.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String CENTRAL_DE_ASSINATURAS = "https://play.google.com/store/account/subscriptions";
    /** Os 2 modos de troca que o app usa (decisão de 16/10/2026): para o completo na hora; para o Treino na renovação. */
    private static final String TROCA_NA_HORA = "na_hora";
    private static final String TROCA_NA_RENOVACAO = "na_renovacao";

    private interface Conexao {
        void pronta();

        void falhou(int codigo);
    }

    private final Object trava = new Object();
    private final List<Conexao> esperando = new ArrayList<>();
    private final Map<String, ProductDetails> detalhes = new HashMap<>();
    private BillingClient cliente;
    private boolean conectando = false;
    private PluginCall compraEmAndamento;

    @Override
    public void load() {
        cliente = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (cliente != null) {
            cliente.endConnection();
        }
    }

    /** A Play cobra assinatura neste aparelho? Nunca rejeita: sem a Play (ou sem conta nela) = { disponivel: false }. */
    @PluginMethod
    public void disponivel(final PluginCall call) {
        conectar(new Conexao() {
            @Override
            public void pronta() {
                BillingResult r = cliente.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS);
                JSObject o = new JSObject();
                o.put("disponivel", r.getResponseCode() == BillingClient.BillingResponseCode.OK);
                o.put("codigo", r.getResponseCode());
                call.resolve(o);
            }

            @Override
            public void falhou(int codigo) {
                JSObject o = new JSObject();
                o.put("disponivel", false);
                o.put("codigo", codigo);
                call.resolve(o);
            }
        });
    }

    /** Os produtos de assinatura pedidos ({ ids }); os que a Play não achou voltam em naoAchados. */
    @PluginMethod
    public void produtos(final PluginCall call) {
        final List<String> ids = textos(call.getArray("ids"));
        if (ids.isEmpty()) {
            call.reject("sem_produtos");
            return;
        }
        conectar(new Conexao() {
            @Override
            public void pronta() {
                List<QueryProductDetailsParams.Product> lista = new ArrayList<>();
                for (String id : ids) {
                    lista.add(QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(id)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build());
                }
                QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(lista).build();
                cliente.queryProductDetailsAsync(params, (r, resultado) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || resultado == null) {
                        call.resolve(produtosVazios(ids, r.getResponseCode()));
                        return;
                    }
                    JSArray produtos = new JSArray();
                    for (ProductDetails pd : resultado.getProductDetailsList()) {
                        synchronized (trava) {
                            detalhes.put(pd.getProductId(), pd);
                        }
                        produtos.put(produtoJs(pd));
                    }
                    JSArray naoAchados = new JSArray();
                    for (UnfetchedProduct u : resultado.getUnfetchedProductList()) {
                        naoAchados.put(u.getProductId());
                    }
                    JSObject o = new JSObject();
                    o.put("codigo", r.getResponseCode());
                    o.put("produtos", produtos);
                    o.put("naoAchados", naoAchados);
                    call.resolve(o);
                });
            }

            @Override
            public void falhou(int codigo) {
                call.resolve(produtosVazios(ids, codigo));
            }
        });
    }

    /**
     * Abre a compra: { produto, oferta (o offerToken lido em produtos), conta (a matrícula opaca) } e, na troca de plano,
     * { tokenAntigo, produtoAntigo, modo: "na_hora" | "na_renovacao" }. Responde quando a Play devolve: comprado (com as
     * compras, ainda NÃO reconhecidas), cancelado, ja_tem, indisponivel ou erro (com o código da Play).
     */
    @PluginMethod
    public void comprar(final PluginCall call) {
        final String produto = call.getString("produto");
        final String oferta = call.getString("oferta");
        final String conta = call.getString("conta");
        final String tokenAntigo = call.getString("tokenAntigo");
        final String produtoAntigo = call.getString("produtoAntigo");
        final int modo = modoDaTroca(call.getString("modo"));
        if (vazio(produto) || vazio(oferta) || vazio(conta)) {
            call.reject("parametros_invalidos");
            return;
        }
        final boolean troca = !vazio(tokenAntigo);
        if (troca && (vazio(produtoAntigo) || modo == 0)) {
            call.reject("troca_invalida");
            return;
        }
        final ProductDetails pd;
        synchronized (trava) {
            pd = detalhes.get(produto);
        }
        if (pd == null) {
            call.reject("produto_nao_carregado");
            return;
        }
        conectar(new Conexao() {
            @Override
            public void pronta() {
                BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(pd)
                        .setOfferToken(oferta);
                BillingFlowParams.Builder fluxo = BillingFlowParams.newBuilder().setObfuscatedAccountId(conta);
                if (troca) {
                    item.setSubscriptionProductReplacementParams(
                            BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.newBuilder()
                                    .setOldProductId(produtoAntigo)
                                    .setReplacementMode(modo)
                                    .build());
                    fluxo.setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                            .setOldPurchaseToken(tokenAntigo)
                            .build());
                }
                fluxo.setProductDetailsParamsList(Collections.singletonList(item.build()));
                final BillingFlowParams params = fluxo.build();
                synchronized (trava) {
                    if (compraEmAndamento != null) {
                        call.reject("compra_em_andamento");
                        return;
                    }
                    compraEmAndamento = call;
                }
                final Activity atividade = getActivity();
                if (atividade == null) {
                    PluginCall c = tirarCompra();
                    if (c != null) {
                        c.resolve(resultado(BillingClient.BillingResponseCode.ERROR, null));
                    }
                    return;
                }
                atividade.runOnUiThread(() -> {
                    BillingResult r = cliente.launchBillingFlow(atividade, params);
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        PluginCall c = tirarCompra();
                        if (c != null) {
                            c.resolve(resultado(r.getResponseCode(), null));
                        }
                    }
                });
            }

            @Override
            public void falhou(int codigo) {
                call.resolve(resultado(codigo, null));
            }
        });
    }

    /** O que a Play devolve depois da folha de compra (e as compras que chegam por fora dela, pelo evento "compras"). */
    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, @Nullable List<Purchase> compras) {
        JSObject o = resultado(r.getResponseCode(), compras);
        PluginCall c = tirarCompra();
        if (c != null) {
            c.resolve(o);
        } else if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && compras != null && !compras.isEmpty()) {
            notifyListeners("compras", o, true);
        }
    }

    /** As assinaturas deste aparelho na Play (as não reconhecidas voltam ao servidor: a compra que ficou no meio). */
    @PluginMethod
    public void compras(final PluginCall call) {
        conectar(new Conexao() {
            @Override
            public void pronta() {
                QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build();
                cliente.queryPurchasesAsync(params, (r, lista) -> {
                    JSObject o = new JSObject();
                    o.put("codigo", r.getResponseCode());
                    o.put("compras", r.getResponseCode() == BillingClient.BillingResponseCode.OK ? comprasJs(lista) : new JSArray());
                    call.resolve(o);
                });
            }

            @Override
            public void falhou(int codigo) {
                JSObject o = new JSObject();
                o.put("codigo", codigo);
                o.put("compras", new JSArray());
                call.resolve(o);
            }
        });
    }

    /** Abre a Central de assinaturas da Play (na do produto, quando vem { produto }): cancelar, trocar o cartão. */
    @PluginMethod
    public void gerenciar(final PluginCall call) {
        String produto = call.getString("produto");
        Uri.Builder url = Uri.parse(CENTRAL_DE_ASSINATURAS).buildUpon();
        if (!vazio(produto)) {
            url.appendQueryParameter("sku", produto).appendQueryParameter("package", getContext().getPackageName());
        }
        Intent abrir = new Intent(Intent.ACTION_VIEW, url.build());
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(abrir);
            call.resolve();
        } catch (Exception e) {
            call.reject("sem_play");
        }
    }

    private void conectar(Conexao conexao) {
        if (cliente.isReady()) {
            conexao.pronta();
            return;
        }
        synchronized (trava) {
            esperando.add(conexao);
            if (conectando) {
                return;
            }
            conectando = true;
        }
        cliente.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult r) {
                soltar(r.getResponseCode());
            }

            @Override
            public void onBillingServiceDisconnected() {
                soltar(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED);
            }
        });
    }

    private void soltar(int codigo) {
        List<Conexao> fila;
        synchronized (trava) {
            fila = new ArrayList<>(esperando);
            esperando.clear();
            conectando = false;
        }
        for (Conexao c : fila) {
            if (codigo == BillingClient.BillingResponseCode.OK) {
                c.pronta();
            } else {
                c.falhou(codigo);
            }
        }
    }

    private PluginCall tirarCompra() {
        synchronized (trava) {
            PluginCall c = compraEmAndamento;
            compraEmAndamento = null;
            return c;
        }
    }

    private static int modoDaTroca(String modo) {
        if (TROCA_NA_HORA.equals(modo)) {
            return BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.CHARGE_PRORATED_PRICE;
        }
        if (TROCA_NA_RENOVACAO.equals(modo)) {
            return BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.DEFERRED;
        }
        return 0;
    }

    private static JSObject resultado(int codigo, @Nullable List<Purchase> compras) {
        JSObject o = new JSObject();
        o.put("codigo", codigo);
        if (codigo == BillingClient.BillingResponseCode.OK) {
            o.put("resultado", "comprado");
            o.put("compras", comprasJs(compras));
        } else if (codigo == BillingClient.BillingResponseCode.USER_CANCELED) {
            o.put("resultado", "cancelado");
        } else if (codigo == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            o.put("resultado", "ja_tem");
        } else if (codigo == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE
                || codigo == BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED) {
            o.put("resultado", "indisponivel");
        } else {
            o.put("resultado", "erro");
        }
        return o;
    }

    private static JSObject produtosVazios(List<String> ids, int codigo) {
        JSObject o = new JSObject();
        o.put("codigo", codigo);
        o.put("produtos", new JSArray());
        o.put("naoAchados", new JSArray(ids));
        return o;
    }

    private static JSObject produtoJs(ProductDetails pd) {
        JSObject o = new JSObject();
        o.put("id", pd.getProductId());
        o.put("nome", pd.getName());
        o.put("titulo", pd.getTitle());
        JSArray ofertas = new JSArray();
        List<ProductDetails.SubscriptionOfferDetails> lista = pd.getSubscriptionOfferDetails();
        if (lista != null) {
            for (ProductDetails.SubscriptionOfferDetails of : lista) {
                JSObject j = new JSObject();
                j.put("planoBase", of.getBasePlanId());
                j.put("oferta", of.getOfferId() != null ? of.getOfferId() : JSONObject.NULL);
                j.put("token", of.getOfferToken());
                j.put("tags", new JSArray(of.getOfferTags()));
                JSArray fases = new JSArray();
                for (ProductDetails.PricingPhase f : of.getPricingPhases().getPricingPhaseList()) {
                    JSObject x = new JSObject();
                    x.put("precoFormatado", f.getFormattedPrice());
                    x.put("precoMicros", f.getPriceAmountMicros());
                    x.put("moeda", f.getPriceCurrencyCode());
                    x.put("periodo", f.getBillingPeriod());
                    x.put("ciclos", f.getBillingCycleCount());
                    x.put("recorrencia", f.getRecurrenceMode());
                    fases.put(x);
                }
                j.put("fases", fases);
                ofertas.put(j);
            }
        }
        o.put("ofertas", ofertas);
        return o;
    }

    private static JSArray comprasJs(@Nullable List<Purchase> compras) {
        JSArray a = new JSArray();
        if (compras == null) {
            return a;
        }
        for (Purchase p : compras) {
            JSObject o = new JSObject();
            o.put("token", p.getPurchaseToken());
            o.put("produtos", new JSArray(p.getProducts()));
            int estado = p.getPurchaseState();
            o.put("estado", estado == Purchase.PurchaseState.PURCHASED ? "comprada"
                    : estado == Purchase.PurchaseState.PENDING ? "pendente" : "desconhecido");
            o.put("reconhecida", p.isAcknowledged());
            o.put("renova", p.isAutoRenewing());
            AccountIdentifiers contas = p.getAccountIdentifiers();
            String conta = contas != null ? contas.getObfuscatedAccountId() : null;
            o.put("conta", conta != null ? conta : JSONObject.NULL);
            a.put(o);
        }
        return a;
    }

    private static List<String> textos(@Nullable JSArray a) {
        List<String> r = new ArrayList<>();
        if (a == null) {
            return r;
        }
        for (int i = 0; i < a.length(); i++) {
            String s = a.optString(i, "");
            if (!s.isEmpty() && !r.contains(s)) {
                r.add(s);
            }
        }
        return r;
    }

    private static boolean vazio(@Nullable String s) {
        return s == null || s.trim().isEmpty();
    }
}
