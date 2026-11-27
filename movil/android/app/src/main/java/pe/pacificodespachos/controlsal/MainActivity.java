package pe.pacificodespachos.controlsal;

import android.content.ActivityNotFoundException;
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
            String[] dest = (para == null || para.trim().isEmpty()) ? new String[0] : para.split("\\s*[,;]\\s*");
            Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
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
    }
}
