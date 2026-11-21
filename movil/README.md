# App nativa · Control Sal (Android / iPhone)

Proyecto [Capacitor](https://capacitorjs.com) que empaqueta como app nativa la versión publicada de la aplicación
(`https://sinoheugarte.github.io/control-unidades-sal-chancay/`). Por eso **no hace falta reinstalar** para recibir
cambios: la app abre siempre la versión más reciente. Dentro de la app nativa, las descargas (Excel, PDF, HTML,
video) se guardan en el teléfono y se abre el menú para abrirlas o compartirlas.

## Android
- Cada cambio en `movil/` (o *Actions → App Android (APK) → Run workflow*) compila la app en GitHub.
- Instalador para el teléfono: **Releases → "App Android · Control Sal" → `ControlSal.apk`**
  (en el teléfono, permitir "Instalar apps de origen desconocido" la primera vez).
- Con los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`
  la app sale **firmada** y también se genera `ControlSal-GooglePlay.aab` para publicarla en Google Play
  (cuenta de desarrollador de Google: pago único).

## iPhone / iPad
Apple sólo permite compilar en una **Mac con Xcode** y con una **cuenta de Apple Developer** (anual):
```bash
cd movil
npm ci
npx cap sync ios
npx cap open ios      # abre Xcode: elija su equipo (Team), conecte el iPhone y pulse ▶ / Archive para App Store o TestFlight
```

## Cambiar ícono, nombre o la dirección de la app
- `capacitor.config.json` (`appName`, `server.url`), íconos en `android/app/src/main/res/mipmap-*` y `ios/App/App/Assets.xcassets`.
- Después de cambiarlo: `npx cap sync`.
