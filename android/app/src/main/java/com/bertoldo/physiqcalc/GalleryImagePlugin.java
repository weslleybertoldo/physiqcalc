package com.bertoldo.physiqcalc;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Salva uma imagem (base64 PNG) na GALERIA do dispositivo.
 * - Android 10+ (API 29+): grava via MediaStore com RELATIVE_PATH (scoped
 *   storage) — NÃO precisa de permissão.
 * - Android 7-9 (API 24-28): grava em Pictures/PhysiqCalc e avisa o media
 *   scanner; requer WRITE_EXTERNAL_STORAGE (maxSdkVersion=28 no manifest). Se a
 *   permissão não estiver concedida, rejeita → o JS cai no fallback (share).
 */
@CapacitorPlugin(name = "GalleryImage")
public class GalleryImagePlugin extends Plugin {

    private static final String SUBPASTA = "PhysiqCalc";

    @PluginMethod()
    public void saveImage(final PluginCall call) {
        final String base64 = call.getString("base64");
        String nome = call.getString("filename", "physiqcalc.png");
        if (base64 == null || base64.isEmpty()) {
            call.reject("missing_base64");
            return;
        }
        if (!nome.toLowerCase().endsWith(".png")) nome = nome + ".png";

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                salvarMediaStore(bytes, nome, call);
            } else {
                salvarLegado(bytes, nome, call);
            }
        } catch (Exception e) {
            call.reject("save_failed", e);
        }
    }

    /** Android 10+ — MediaStore, sem permissão. */
    private void salvarMediaStore(byte[] bytes, String nome, PluginCall call) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, nome);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + File.separator + SUBPASTA);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = resolver.insert(collection, values);
        if (item == null) {
            call.reject("insert_failed");
            return;
        }
        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) {
                call.reject("open_stream_failed");
                return;
            }
            out.write(bytes);
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(item, values, null, null);

        JSObject ret = new JSObject();
        ret.put("uri", item.toString());
        call.resolve(ret);
    }

    /** Android 7-9 — arquivo em Pictures/PhysiqCalc + media scan (precisa permissão). */
    private void salvarLegado(byte[] bytes, String nome, PluginCall call) throws Exception {
        boolean concedida = ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        if (!concedida) {
            call.reject("no_permission");
            return;
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_PICTURES), SUBPASTA);
        if (!dir.exists()) dir.mkdirs();
        File file = new File(dir, nome);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        // decodifica só p/ validar e disparar o scan
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        android.media.MediaScannerConnection.scanFile(
                getContext(), new String[]{file.getAbsolutePath()}, new String[]{"image/png"}, null);

        JSObject ret = new JSObject();
        ret.put("uri", Uri.fromFile(file).toString());
        call.resolve(ret);
    }
}
