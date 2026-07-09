# Changelog

> Yeni sürüm notu bu dosyanın **başına** eklenir. (CLAUDE.md'yi şişirme — bu dosya otomatik yüklenmez.)

## v1.3.1
- **Skor tablosu:** Tab basılı tut (mobilde skorbara dokun) → tüm 10 oyuncunun K/D tablosu, takım
  renkleriyle, kill sayısına göre sıralı; sen yeşil vurgulu. Botlar artık kendi K/D'sini takip ediyor.

## v1.3.0
- **Round sistemi:** 20 kill'e ulaşan takım round'u kazanır — ekran ortasında takım renkli banner,
  3.5 sn sonra skorlar sıfırlanır, herkes yeniden doğar. Skorbarda round sayacı (🏆 1 - 0). Round
  bittiğinde ateş kilitlenir (oyuncu + botlar).

## v1.2.0
- **5v5 takım deathmatch:** Sen + 4 müttefik bot (CT, mavi) vs 5 düşman bot (T, kırmızı). Takımlar kendi
  yarı sahasında doğar (CT güney / T kuzey); botlar **birbiriyle de çatışır** (hedef seçimi ~5Hz: en yakın
  LOS'lu düşman — T botları için oyuncu da hedef). Dost ateşi kapalı (müttefik mermiyi bloklar, hasar almaz).
- **Eklemli bot rig'i:** kalça/omuz pivotlu uzuvlar (`limb` — pivot üstte), gövde grubu hedefe göre yukarı/
  aşağı nişan eğilir (`aimPitch`), kollar önde **elde tüfek** (gövde+dipçik+namlu+şarjör), kask + yelek.
  Yürüyüşte bacak salınımı hıza göre ölçülenir (`moveAmt`), kollarda karşı-salınım.
- **Ölüm animasyonu:** bot ayak pivotundan devrilir (rastgele yön + hafif dönüş), ~1.1 sn sonra kaybolur,
  3.2 sn'de kendi bölgesinde yeniden doğar.
- **İsim + takım rengi:** her botun tepesinde renkli isim etiketi (mavi/turuncu) + can barı (96px canvas).
  İsimler: CT Şahin/Kartal/Doğan/Atmaca · T Kobra/Çakal/Akrep/Engerek/Pars.
- **Takım HUD'u:** skor çubuğu artık TAKIM (mavi) | 5v5 | DÜŞMAN (turuncu) | SEN K/D. Kill feed satırı
  öldürenin rengiyle kenarlanır (sen=yeşil, müttefik=mavi, düşman=turuncu) ve gerçek isimler yazar.
- Bot sesleri artık oyuncuya uzaklığa göre kısılır (uzak çatışmalar hafif duyulur); botlar birbirine
  girmesin diye yumuşak ayrışma kuvveti eklendi.

## v1.1.2
- **Sınırsız yedek cephane:** sonsuz deathmatch'e uygun olarak yedek cephane tükenmez (HUD'da `∞`).
  Reload her zaman şarjörü doldurur; respawn'da tüm silahların şarjörü + yedeği dolar (`refillAmmo`).
- **Namlu alevi kaldırıldı:** ateşte çıkan soluk/çirkin alev sprite'ı tamamen silindi (tracer/iz çizgisi kalır).

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
