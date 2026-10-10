package com.plucky775.routenote;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Copy an already-generated result to the location chosen in Android's Files UI. */
@CapacitorPlugin(name = "DocumentSaver")
public class DocumentSaverPlugin extends Plugin {
    private final AtomicBoolean saving = new AtomicBoolean(false);

    private File source(PluginCall call) throws Exception {
        Uri uri = Uri.parse(call.getString("uri", ""));
        if (!"file".equals(uri.getScheme()) || uri.getPath() == null) throw new Exception("파일 경로가 올바르지 않습니다.");
        File root = new File(getContext().getCacheDir(), "route-note-exports").getCanonicalFile();
        File file = new File(uri.getPath()).getCanonicalFile();
        if (!root.equals(file.getParentFile()) || !file.isFile()) throw new Exception("저장할 결과 파일을 찾을 수 없습니다.");
        return file;
    }

    @PluginMethod public void save(PluginCall call) {
        if (!saving.compareAndSet(false, true)) { call.reject("파일 저장이 진행 중입니다."); return; }
        try {
            source(call);
            String name = call.getString("name", "경로노트_결과").replaceAll("[\\\\/\\p{Cntrl}]", "_");
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(call.getString("mime", "application/octet-stream"));
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception e) { saving.set(false); call.reject("저장 창을 열지 못했습니다: " + e.getMessage()); }
    }

    @ActivityCallback private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) { saving.set(false); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            saving.set(false); JSObject reply = new JSObject(); reply.put("cancelled", true); call.resolve(reply); return;
        }
        Uri destination = result.getData().getData();
        new Thread(() -> {
            try (FileInputStream input = new FileInputStream(source(call));
                 OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new Exception("선택한 위치에 쓸 수 없습니다.");
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.flush();
            } catch (Exception e) {
                // Remove an incomplete newly-created document; the source remains in cache.
                try { android.provider.DocumentsContract.deleteDocument(getContext().getContentResolver(), destination); } catch (Exception ignored) {}
                saving.set(false); call.reject("파일 저장에 실패했습니다: " + e.getMessage()); return;
            }
            saving.set(false); JSObject reply = new JSObject(); reply.put("cancelled", false); call.resolve(reply);
        }, "route-note-save").start();
    }
}
