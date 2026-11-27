package pe.pacificodespachos.controlsal;

import android.content.ActivityNotFoundException;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String OUTLOOK = "com.microsoft.office.outlook";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null && bridge.getWebView() != null) {
            WebView web = bridge.getWebView();
            // Permite que la música de la presentación suene sin esperar un toque
            web.getSettings().setMediaPlaybackRequiresUserGesture(false);
            // Impresión: el visor de Android no tiene window.print(); la app la pide con AndroidImpresion.imprimir()
            web.addJavascriptInterface(new Impresion(web), "AndroidImpresion");
            // Correo: abre la redacción de Outlook (o del correo predeterminado) con destinatarios, asunto y mensaje
            web.addJavascriptInterface(new Correo(), "AndroidCorreo");
        }
    }

    private class Impresion {
        private final WebView web;
        Impresion(WebView web) { this.web = web; }

        @JavascriptInterface
        public void imprimir(String titulo) {
            final String nombre = (titulo == null || titulo.isEmpty()) ? "Control de Unidades" : titulo;
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm != null) pm.print(nombre, web.createPrintDocumentAdapter(nombre), null);
            });
        }
    }

    private class Correo {
        /** para: correos separados por coma. Devuelve true si se abrió alguna app de correo. */
        @JavascriptInterface
        public boolean redactar(String para, String asunto, String mensaje) {
            String[] dest = (para == null || para.trim().isEmpty()) ? new String[0] : para.trim().split("\\s*[,;]\\s*");
            // Outlook toma los destinatarios, el asunto y el mensaje del propio enlace mailto: (no de los extras);
            // otras apps usan los extras. Se envían de las dos formas.
            StringBuilder m = new StringBuilder("mailto:").append(Uri.encode(String.join(",", dest), "@,+"));
            String sep = "?";
            if (asunto != null && !asunto.isEmpty()) { m.append(sep).append("subject=").append(Uri.encode(asunto)); sep = "&"; }
            if (mensaje != null && !mensaje.isEmpty()) { m.append(sep).append("body=").append(Uri.encode(mensaje)); }
            Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse(m.toString()));
            i.putExtra(Intent.EXTRA_EMAIL, dest);
            if (asunto != null) i.putExtra(Intent.EXTRA_SUBJECT, asunto);
            if (mensaje != null) i.putExtra(Intent.EXTRA_TEXT, mensaje);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                Intent o = new Intent(i);
                o.setPackage(OUTLOOK);
                startActivity(o);
                return true;
            } catch (ActivityNotFoundException e) {
                // Outlook no está instalado: el correo predeterminado
                try { startActivity(Intent.createChooser(i, "Enviar correo").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true; }
                catch (ActivityNotFoundException e2) { return false; }
            }
        }

        /** Correo con un archivo adjunto (base64): Outlook con destinatarios, asunto, mensaje y el archivo. */
        @JavascriptInterface
        public boolean adjuntar(String base64, String nombre, String tipo, String para, String asunto, String mensaje) {
            try {
                File dir = new File(getCacheDir(), "correo");
                if (!dir.exists()) dir.mkdirs();
                String seguro = (nombre == null || nombre.isEmpty() ? "reporte.html" : nombre).replaceAll("[\\\\/:*?\"<>|]+", "-");
                File f = new File(dir, seguro);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(Base64.decode(base64, Base64.DEFAULT)); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                String[] dest = (para == null || para.trim().isEmpty()) ? new String[0] : para.trim().split("\\s*[,;]\\s*");
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(tipo == null || tipo.isEmpty() ? "application/octet-stream" : tipo);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.putExtra(Intent.EXTRA_EMAIL, dest);
                if (asunto != null) i.putExtra(Intent.EXTRA_SUBJECT, asunto);
                if (mensaje != null) i.putExtra(Intent.EXTRA_TEXT, mensaje);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    Intent o = new Intent(i);
                    o.setPackage(OUTLOOK);
                    startActivity(o);
                } catch (ActivityNotFoundException e) {
                    startActivity(Intent.createChooser(i, "Enviar reporte").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION));
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
