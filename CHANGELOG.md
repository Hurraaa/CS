# Changelog

> Yeni sürüm notu bu dosyanın **başına** eklenir. (CLAUDE.md'yi şişirme — bu dosya otomatik yüklenmez.)

## v1.4.6
- **Öldürme serisi:** 4 sn içinde üst üste kill → ekranda DOUBLE/TRIPLE/QUAD KILL / RAMPAGE! duyurusu
  (pop animasyonlu) + seri uzunluğuna göre yükselen perdeli jingle.

## v1.4.5
- **Yarı-ragdoll ölüm:** botlar devrilirken kollar/bacaklar/gövde rastgele açısal hızla savrulur ve
  yere inerken yatışır; respawn'da uzuv duruşları sıfırlanır.

## v1.4.4
- **Mobil titreşim:** telefonda isabet 15ms, kill 45ms, hasar alma 25ms haptik geri bildirim
  (navigator.vibrate destekleyen cihazlarda; iOS Safari desteklemez, Android'de çalışır).

## v1.4.3
- **Mermi izleri (decal):** duvara/kasaya isabet eden mermiler 10 sn kalan koyu delik izi bırakır
  (8. sn'den itibaren solar; en fazla 40 iz — eskisi silinir; z-fight yok: polygonOffset).

## v1.4.2
- **Kovan fırlatma:** her atışta sağa pirinç kovan fırlar, yerde bir kez sekip 'tink' sesi çıkarır
  (paylaşımlı geometri/materyal — maliyetsiz). Tam scope'tayken (AWP) kovan yok.

## v1.4.1
- **Silah & kamera hissi:** her atışta kısa FOV punch (AWP'de sert, AK'da hafif — scope'tayken kapalı);
  hasar alınca kamera kısa süre sarsılır (roll — nişanı bozmaz, hızla söner); reload sırasında silah
  aşağı iner ve öne eğilir (dolum animasyonu); AWP tracer'ı kalın-parlak mavi ve uzun ömürlü, AK kısa.

## v1.4.0
- **Vuruş hissi paketi:** gövde isabetinde etli 'thwack' sesi (headshot 'tink' zaten vardı); vurulan
  bot ~0.2 sn irkiliyor (gövde sarsılması); isabet noktasında yukarı süzülüp kaybolan **hasar sayıları**
  (gövde beyaz / kafa sarı / öldürücü kırmızı-büyük); kan efekti yoğunlaştı (22 parçacık, iki ton).

## v1.3.11
- **Mobil performans:** telefonda pixelRatio 1.5 ile sınırlandı, gölge haritası 2048→1024
  (dolgu maliyeti ciddi düşer, görsel fark minimal). README/CLAUDE.md/PLAN.md güncellendi.

## v1.3.10
- **Ölüm ekranı:** ölünce kırmızı vinyetli 'ÖLDÜN' + seni öldüren botun adı; respawn'da kaybolur.
- **Spawn koruması:** yeniden doğduktan sonra 2 sn hasar alınmaz (toast ile bildirilir).

## v1.3.9
- **Ses cilası:** koşarken/yürürken tempolu ayak sesleri (hıza göre kadans, değişen perde);
  seni ıskalayan yakın mermilerde kulak dibinden 'vızz' geçiş sesi. CHANGELOG sıralaması düzeltildi.

## v1.3.8
- **Müttefik komutu:** F (mobilde TAKİP butonu) ile 'takip et / serbest dolaş' arasında geçiş.
  Takipte müttefikler etrafında formasyon tutar ve yakın koruma yapar (25m içindeki düşmanla savaşır,
  uzaktakini bırakıp sana döner). Ekranda kısa bilgi toast'u.

## v1.3.7
- **Bot zorluğu:** menüde Kolay/Orta/Zor seçimi (localStorage kalıcı). Yalnız sana karşı isabet,
  hasar ve atış temposunu ölçekler — bot-vs-bot dengesi bozulmaz.

## v1.3.6
- **Ayarlar menüsü:** hassasiyet slider'ı (0.3–2.0, fare + dokunmatik bakışa uygulanır) ve ses aç/kapa.
  İkisi de localStorage'da kalıcı — sayfa yenilense de korunur.

## v1.3.5
- **Dinamik nişangah:** sprey recoil'i ve hareket hâlinde nişangah açılır, durunca toparlanır
  (isabetsizlik hissi CS gibi). **Reload barı:** cephane göstergesinin altında dolum ilerleme çubuğu.

## v1.3.4
- **Headshot geri bildirimi:** kafadan vuruşta sarı hitmarker + metalik 'tink' sesi; kill feed'de 💀
  ikonu. **Kill onay sesi:** sen öldürünce iki tonlu kısa jingle (headshot'ta daha tiz).

## v1.3.3
- **Hasar yön göstergesi:** vurulunca ekran ortasında, saldırganın yönünü gösteren kırmızı kavis belirir
  (bakışa göre döner, 0.9 sn'de solar). **Düşük can vinyeti:** can ≤30 iken kalp atışı gibi nabızlanan
  kırmızı kenar karartması.

## v1.3.2
- **Radar:** sol üstte bakış yönüne dönen CS tarzı radar. Müttefikler hep görünür (mavi); düşmanlar
  yalnız görüş hattına girince ~1.6 sn 'spotted' kalır (kırmızı). Ortada yeşil oyuncu oku.

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
