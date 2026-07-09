# Changelog

> Yeni sürüm notu bu dosyanın **başına** eklenir. (CLAUDE.md'yi şişirme — bu dosya otomatik yüklenmez.)

## v1.0.0
- **iOS-güvenli build'e geçiş:** tek-dosya inline ES-module + importmap kaldırıldı; oyun `src/main.js`'e
  taşındı, esbuild ile **klasik-script / IIFE** `dist/game-[hash].js` olarak bundle ediliyor (three gömülü).
  `index.html` artık şablon (`build.mjs` hash + sürüm enjekte eder). Sebep: iOS Safari sayfa-sonu inline
  module ve importmap'te beyaz-ekran veriyordu (rehber §3).
- index.html sağlamlığı: no-cache meta, `#boot` yükleme katmanı + `window.__step`, `#fatal` hata katmanı
  (12 sn timeout diagnostiği), `<noscript>`, `build vNN` rozeti.
- `build.mjs` + `boot-gate.mjs` (headless BOOT_OK/FAIL) + `ship.sh` sevkiyat hattı.
- CI: `pages.yml` artık build + boot-gate + Pages deploy (Actions).
- Scaffolding: yağsız CLAUDE.md, CHANGELOG.md, PLAN.md, rehber `docs/`'a eklendi.
- Mobil dokunmatik kontroller: sol analog joystick, sağ sürükle-bak, ateş/scope/reload/zıpla/çömel
  butonları, touch cihazda fullscreen + yatay mod + portre uyarısı, HUD mobil yerleşimi.
- İlk oyun: AWP (scope zoom, bolt-action, recoil, headshot instakill), 5 bot (LOS AI, engage/patrol,
  strafe, respawn), hangar arena (konteyner/kasa/rampa/siper, prosedürel doku, gölge), HUD + kill feed,
  WebAudio ses, deathmatch döngüsü. Düzeltilen buglar: `time` TDZ, spawn'da duvara bakma.
