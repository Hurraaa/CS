# Changelog

> Yeni sürüm notu bu dosyanın **başına** eklenir. (CLAUDE.md'yi şişirme — bu dosya otomatik yüklenmez.)

## v1.1.1
- **Mobilde ateş + nişan senkron:** ateş butonu artık bir "ateş + aim" bölgesi. Basılı tut → ateş eder;
  aynı parmağı kaydır → nişanı (bakışı) döndürür. Dokunma olayı butonda yakalandığı için parmak butondan
  kaysa da devam eder. Böylece sol başparmak yürür, sağ başparmak aynı anda ateş edip nişan alır.
  (Masaüstünde sol tık ateş + sağ tık aim zaten senkrondu.)

## v1.1.0
- **İkinci silah + çok-silah sistemi:** AK-47 (tam otomatik, 30/90, sprey recoil) eklendi ve **ana silah**
  yapıldı; AWP yedeğe alındı. Silah değiştirme: `1`=AK, `2`=AWP, `Q`=toggle; mobilde AK/AWP butonu.
  Her silahın şarjörü bağımsız korunur.
- **Ateş modları:** otomatik silahlar tetik basılıyken update döngüsünden sürekli ateş eder; AWP bolt-action
  (basış başına tek atış). Silaha göre hasar (AK gövde 33 / kafa 130; AWP 115 / 450), atış hızı, mermi
  yayılımı (hip/ads), ses ve namlu alevi.
- **Sprey recoil:** her atışta nişan yukarı+yana tırmanır, tetik bırakınca yumuşakça geri gelir (bakışa
  katmanlı, fare/dokunmatikle uyumlu). AWP tek sert tepme.
- **Nişan (ADS):** AWP scope overlay + güçlü zoom; AK hafif zoom + daralan yayılım (overlay yok, viewmodel açık).
- İki box-model viewmodel (ahşap AK / yeşil AWP), aktif olana göre geçiş.
- HUD silah adını + aktif şarjörü gösterir; menü tuş açıklamaları güncellendi.

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
