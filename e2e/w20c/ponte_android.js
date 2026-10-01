// Physiq W20c (E2E) — um "Android" de mentira para o Playwright: o @capacitor/core decide a plataforma por window.androidBridge
// e manda cada chamada de plugin para Capacitor.nativePromise / Capacitor.nativeCallback conforme Capacitor.PluginHeaders (o que
// o APK de verdade injeta). Aqui as chamadas respondem como o APK com o Firebase responderia — ou como o cenário pedir
// (window.__PONTE_CFG) — e ficam gravadas em window.__ponte.chamadas. Os eventos (token, push recebido, toque) saem por
// window.__ponte.emitir(plugin, evento, dados). Nada disto vai para o app: é só do teste.
(() => {
  const cfg = Object.assign(
    { permissao: "prompt", pedido: "granted", firebase: true, token: "e2e-w20c-falso:APA91bTokenFalsoDoTeste", toqueGuardado: null },
    window.__PONTE_CFG || {},
  );
  const CHAVE = "__ponte_permissao";
  let permissao = cfg.permissao;
  try {
    permissao = sessionStorage.getItem(CHAVE) || cfg.permissao;
  } catch (e) {
    /* sem sessionStorage */
  }
  const chamadas = [];
  const ouvintes = {}; // "Plugin:evento" → [{ id, cb }]
  const retidos = {}; // eventos guardados até o 1º ouvinte (o Android guarda o toque com o app fechado)
  if (cfg.toqueGuardado) retidos["PushNotifications:pushNotificationActionPerformed"] = [cfg.toqueGuardado];
  let seq = 0;

  function emitir(plugin, evento, dados) {
    const lista = ouvintes[`${plugin}:${evento}`] || [];
    if (!lista.length) {
      (retidos[`${plugin}:${evento}`] = retidos[`${plugin}:${evento}`] || []).push(dados);
      return 0;
    }
    for (const o of lista) {
      try {
        o.cb(dados);
      } catch (e) {
        console.error("ponte: ouvinte", e);
      }
    }
    return lista.length;
  }

  function guardarPermissao(v) {
    permissao = v;
    try {
      sessionStorage.setItem(CHAVE, v);
    } catch (e) {
      /* sem sessionStorage */
    }
  }

  const R = {
    PushFirebase: { disponivel: () => ({ disponivel: !!cfg.firebase }) },
    PushNotifications: {
      checkPermissions: () => ({ receive: permissao }),
      requestPermissions: () => {
        guardarPermissao(cfg.pedido);
        return { receive: permissao };
      },
      register: () => {
        setTimeout(() => emitir("PushNotifications", "registration", { value: cfg.token }), 300);
        return undefined;
      },
      unregister: () => undefined,
      createChannel: () => undefined,
      deleteChannel: () => undefined,
      listChannels: () => ({ channels: [] }),
      getDeliveredNotifications: () => ({ notifications: [] }),
      removeDeliveredNotifications: () => undefined,
      removeAllDeliveredNotifications: () => undefined,
    },
    LocalNotifications: {
      checkPermissions: () => ({ display: "granted" }),
      requestPermissions: () => ({ display: "granted" }),
      schedule: (o) => ({ notifications: ((o && o.notifications) || []).map((n) => ({ id: n.id })) }),
      getPending: () => ({ notifications: [] }),
      areEnabled: () => ({ value: true }),
      listChannels: () => ({ channels: [] }),
      checkExactNotificationSetting: () => ({ exact_alarm: "granted" }),
      getDeliveredNotifications: () => ({ notifications: [] }),
    },
    App: {
      getInfo: () => ({ name: "Physiq", id: "com.bertoldo.physiqcalc", build: "302700", version: "3.27" }),
      getState: () => ({ isActive: true }),
      getLaunchUrl: () => ({ url: "" }),
    },
    ApkInstaller: { canInstall: () => ({ granted: true }) },
    ForegroundService: { checkPermissions: () => ({ display: "granted" }), checkManageOverlayPermission: () => ({ granted: true }) },
    Share: { canShare: () => ({ value: false }) },
  };

  const METODOS = {
    App: ["exitApp", "getInfo", "getLaunchUrl", "getState", "minimizeApp", "toggleBackButtonHandler"],
    Browser: ["open", "close"],
    Filesystem: ["appendFile", "checkPermissions", "copy", "deleteFile", "downloadFile", "getUri", "mkdir", "readdir", "readFile", "rename", "requestPermissions", "rmdir", "stat", "writeFile"],
    LocalNotifications: ["areEnabled", "cancel", "changeExactNotificationSetting", "checkExactNotificationSetting", "checkPermissions", "createChannel", "deleteChannel", "getDeliveredNotifications", "getPending", "listChannels", "registerActionTypes", "removeAllDeliveredNotifications", "removeDeliveredNotifications", "requestPermissions", "schedule"],
    PushNotifications: ["checkPermissions", "createChannel", "deleteChannel", "getDeliveredNotifications", "listChannels", "register", "removeAllDeliveredNotifications", "removeDeliveredNotifications", "requestPermissions", "unregister"],
    PushFirebase: ["disponivel"],
    Share: ["canShare", "share"],
    ForegroundService: ["checkManageOverlayPermission", "checkPermissions", "createNotificationChannel", "deleteNotificationChannel", "moveToForeground", "requestManageOverlayPermission", "requestPermissions", "startForegroundService", "stopForegroundService", "updateForegroundService"],
    ApkInstaller: ["download", "install", "canInstall", "openInstallSettings"],
    GalleryImage: ["saveImage"],
    CountdownNotification: ["startCountdown", "stopCountdown", "updateCountdown"],
  };
  // sem Firebase (cfg.firebase = false): o plugin nativo existe e responde { disponivel: false } — o APK sem google-services.json
  const headers = Object.entries(METODOS).map(([name, ms]) => ({
    name,
    methods: [
      ...ms.map((m) => ({ name: m, rtype: "promise" })),
      { name: "addListener", rtype: "callback" },
      { name: "removeListener", rtype: "promise" },
      { name: "removeAllListeners", rtype: "promise" },
    ],
  }));

  window.androidBridge = { postMessage: () => undefined };
  window.Capacitor = {
    PluginHeaders: headers,
    nativePromise(plugin, metodo, opcoes) {
      chamadas.push({ plugin, metodo, opcoes: opcoes || null, em: Date.now() });
      if (metodo === "removeListener") {
        const k = `${plugin}:${opcoes && opcoes.eventName}`;
        ouvintes[k] = (ouvintes[k] || []).filter((o) => o.id !== (opcoes && opcoes.callbackId));
        return Promise.resolve();
      }
      if (metodo === "removeAllListeners") {
        for (const k of Object.keys(ouvintes)) if (k.startsWith(`${plugin}:`)) ouvintes[k] = [];
        return Promise.resolve();
      }
      const fn = R[plugin] && R[plugin][metodo];
      try {
        return Promise.resolve(fn ? fn(opcoes) : {});
      } catch (e) {
        return Promise.reject(e);
      }
    },
    nativeCallback(plugin, metodo, opcoes, cb) {
      const id = `cb-${++seq}`;
      chamadas.push({ plugin, metodo, opcoes: opcoes || null, em: Date.now() });
      if (metodo === "addListener" && opcoes && opcoes.eventName) {
        const k = `${plugin}:${opcoes.eventName}`;
        (ouvintes[k] = ouvintes[k] || []).push({ id, cb });
        const guardados = retidos[k];
        if (guardados && guardados.length) {
          delete retidos[k];
          setTimeout(() => guardados.forEach((d) => cb(d)), 50);
        }
      }
      return id;
    },
  };
  window.__ponte = {
    chamadas,
    emitir,
    permissao: () => permissao,
    ouvintes: () => Object.fromEntries(Object.entries(ouvintes).map(([k, v]) => [k, v.length])),
    cfg,
  };
})();
