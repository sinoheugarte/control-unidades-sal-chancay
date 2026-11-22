package pe.pacificodespachos.controlsal;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null && bridge.getWebView() != null) {
            WebView web = bridge.getWebView();
            // Permite que la música de la presentación suene sin esperar un toque
            web.getSettings().setMediaPlaybackRequiresUserGesture(false);
            // Impresión: el visor de Android no tiene window.print(); la app la pide con AndroidImpresion.imprimir()
            web.addJavascriptInterface(new Impresion(web), "AndroidImpresion");
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
}
