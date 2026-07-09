# Three.js Mobil Oyun + Claude — Optimum Çalışma Rehberi

> **Amaç:** Bu dosya, bir Three.js tabanlı mobil web oyununu Claude (Claude Code) ile
> geliştirirken **token'ı en verimli kullanmak**, **mobil performansı korumak**,
> **iOS/dağıtımı bozmamak** ve **gözetimsiz/otonom koşuyu güvenli tutmak** için
> gerçek bir projede (KCK2D / "Mahalle Maçı") ödenen bedellerden damıtılmış derslerdir.
>
> **Nasıl kullanılır:** Bu dosyayı yeni oyun repona koy. İçinden **kalıcı kuralları** kendi
> `CLAUDE.md`'ne taşı (aşağıdaki §1 şablonu); geri kalanını referans olarak repoda tut.
> Her bölüm bağımsız — projene uymayanı sil, uyanı uyarla.

---

## 0. Altın kural: küçük + doğrulanabilir + geri alınabilir
Claude ile verimli çalışmanın özü üç kelime:
- **KÜÇÜK:** Her tur TEK, sınırlı, tek amaçlı bir değişiklik. "Şunu da şunu da" = bağlam şişer, hata artar.
- **DOĞRULANABİLİR:** Her değişiklik derlensin + otomatik test geçsin + (mümkünse) başsız tarayıcıda açılsın.
- **GERİ ALINABİLİR:** Her şey git'te; kritik sürümlerde `backup/` branch'i; canlı hep "son doğrulanmış iyi hal".

Bu üçünü koruduğun sürece Claude'a çok iş devredebilirsin (otonom koşu dahil) ve oyun bozulmaz.

---

## 1. TOKEN VERİMLİLİĞİ / BAĞLAM YÖNETİMİ (en büyük kazanç burada)

### 1.1 CLAUDE.md'yi YAĞSIZ tut — otomatik yüklenen her byte token
Claude her oturumda `CLAUDE.md`'yi otomatik yükler. Buraya ne koyarsan **her turda** parasını ödersin.
- **CLAUDE.md'ye SADECE:** kalıcı kurallar + sabit mimari referansı + "sakın dokunma" listesi + dosya haritası.
- **CLAUDE.md'ye ASLA:** sürüm sürüm changelog, "vNN'de şunu yaptık" günlüğü, uzun anlatılar, çözülmüş bug hikâyeleri.
- Changelog'u ayrı `CHANGELOG.md`'ye taşı → **otomatik YÜKLENMEZ**, yalnız gerektiğinde Claude açar.
- **Gerçek etki (KCK2D):** 2827 satır / ~69k token CLAUDE.md → ~320 satıra indirildi = **oturum başına ~%85 token tasarrufu.**

**Kural:** Yeni sürüm/iş bitince notu CLAUDE.md'ye DEĞİL, CHANGELOG.md'nin BAŞINA ekle. CLAUDE.md'yi şişirme.

### 1.2 "Load-on-demand" felsefesi (steipete/agent-scripts esini)
Bağlamı önden doldurma; **yer imi bırak, gerekince aç.**
- CLAUDE.md'de "detay için `CHANGELOG.md`'de vNN ara" / "kod örneği `X.md`'de" gibi **işaretçiler** ver.
- Uzun tasarım/danışma dokümanlarını ayrı `.md`'lerde tut, CLAUDE.md'den sadece adıyla işaret et.
- Aktif iş planını ayrı bir dosyada tut (`PLAN.md` / `BACKLOG.md`), CLAUDE.md'de tek satırla "aktif plan: X".

### 1.3 Dosya/fonksiyon kancalarını path ile ver → Claude grep'ler, tüm dosyayı okumaz
CLAUDE.md'de "kanca" listesi tut: `rig.js charMat/enhanceToonMaterial`, `game.js _ensureStudio` gibi.
Claude bunları **hedefli** okur; 7000 satırlık dosyayı baştan sona okumaz → token + hız kazancı.

### 1.4 CLAUDE.md şablonu (yeni oyun için kopyala-doldur)
```markdown
# Proje: <AD>
> 🚨 KESİN KURAL — BRANCH: Tüm push'lar `<branch>` üzerinde. Neden: <deploy nedeni>.
> Yedek branch'ler: `backup/...`.

## 📖 Bu dosya nasıl kullanılır (token verimliliği)
Yalnız kalıcı kural + sabit mimari. Changelog `CHANGELOG.md`'de (otomatik yüklenmez).
Aktif plan: `PLAN.md`. Yeni sürüm notu CLAUDE.md'ye DEĞİL CHANGELOG.md başına.

## 🎯 Güncel durum (2-4 satır özet + sürüm no)

## 🚚 SEVKİYAT HATTI (her yeni oturumda yeniden kur — §4)

## KRİTİK: dağıtım/build mimarisi (bunları BOZMA — §3)

## Dosya haritası (src/) — her dosya 1 satır + ana fonksiyon kancaları

## DOKUNMA listesi (çekirdek: fizik/çarpışma/skor/dağıtım)
```

---

## 2. THREE.JS MOBİL PERFORMANS REÇETELERİ (ucuz görsel kalite)

> Felsefe: **"Post-process ve pahalı teknik YOK; ucuz, sahte, mobil-dostu numaralarla AAA hissi."**
> Toon/cel-shaded bir kimlik seç ve tutarlı kal — mobilde PBR peşinde koşmaktan çok daha iyi görünür.

### 2.1 Malzeme: MeshToonMaterial + gradientMap (cel ramp)
- `MeshToonMaterial` + `gradientMap` (NearestFilter'lı küçük ramp texture) = net cel bantları.
- Ramp'ı **RGBA DataTexture** olarak yap (soğuk gölge → sıcak ışık bantları anime hissi verir).
- **r137+ TUZAK:** `THREE.RGBFormat` KALDIRILDI → **`THREE.RGBAFormat`** kullan (alpha=255).
- `colorSpace = NoColorSpace`, `magFilter=minFilter=NearestFilter`, `needsUpdate=true`.

### 2.2 Shader yaması: onBeforeCompile (yeni materyal yazmadan zenginleştir)
Rim light (fresnel) + fake SSS + shadow tint eklemek için var olan toon shader'ı yamala:
```js
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uRim = { value: 0.5 };
  // uniform + varying'leri #include <common>'a enjekte et
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n  uniform float uRim; ...')
    // outgoingLight'ı gl_FragColor'a atanmadan ÖNCE değiştir:
    .replace('#include <opaque_fragment>', 'işlenmiş <opaque_fragment>');
};
// AYNI shader'ı paylaşan materyaller yanlış program paylaşmasın:
mat.customProgramCacheKey = () => 'proj-toon-v1';
```
**TUZAK'lar:**
- Işığı **`gl_FragColor`'a yazılmadan ÖNCE** (`outgoingLight` aşamasında) değiştir — sonra yazarsan tonemap/fog bozulur.
- Farklı fragment string + AYNI cache-key = three.js yanlış program paylaşır → **her varyanta ayrı cache-key** ver (`...-mc` gibi).
- Yamasız çağrılar (uniform verilmeyen) birebir eski shader + eski cache-key alsın → **geriye dönük uyumlu**, görünüm değişmez.

### 2.3 Ucuz kalite numaraları (post-process yerine)
| İstenen | Pahalı yol (KULLANMA) | Ucuz yol (KULLAN) |
|---|---|---|
| Kontak gölge | SSAO / shadow map | Ayak altına yarı-saydam **radyal blob** plane (CanvasTexture) |
| Parlaklık/specular | Env map, PBR | **Matcap örneklemesi** (64px prosedürel), sadece saç/ayakkabı/top — additif |
| Sinematik çerçeve | Post-process vignette | **CSS radyal gradyan** overlay div (`pointer-events:none`, `#game` içi) = 0 GPU |
| Outline | Kenar-algılama pass | **Ters-yüz (inverted-hull)** veya normal-şişirme mesh |
| Gökyüzü/sis | HDRI | Shader gradient sky + `scene.fog` renk tonlaması |

### 2.4 Texture'ları PROSEDÜREL üret (asset fetch = mobilde gecikme)
- Doku indirmek yerine `CanvasTexture` / `DataTexture` ile runtime üret (asfalt, toprak, kalabalık, cephe, matcap).
- Avantaj: sıfır ağ isteği, küçük bundle, dinamik renk (takım rengi vb.).

### 2.5 Görünmeyene ödeme yapma
- Uzak/koşula bağlı grupları `visible=false` ile gizle (gizliyken maliyetsiz) — LOD'u basamağa/mesafeye bağla.
- Seyirci/kalabalık gibi çok sayıda nesnede detayı yalnız yakın/ana aktörde aç.
- Materyalleri **paylaş/tekrar kullan** (her mesh'e yeni materyal = yeni program derleme + GPU yükü).

### 2.6 Işık/exposure dengesi
- `ACESFilmicToneMapping` + `toneMappingExposure` ile patlama (blowout) kontrolü — ekranı test edip kıs.
- Rim/SSS eklerken ışık şiddetini ölç; stüdyo/preview ışığını maç ışığından ayrı ayarla (biri patlarsa diğeri bozulmasın).

---

## 3. DAĞITIM / BUILD MİMARİSİ — iOS SAFARI DERSLERİ (bunları bozmak = beyaz ekran)

> Bu bölüm en pahalı öğrenilen kısım. Bir mobil web oyununda **build çıktısının biçimi** oyunun
> açılıp açılmamasını belirler. Aşağıdakiler KCK2D'de günlerce beyaz-ekran hatası olarak yaşandı.

- **Vite "lib modu" (IIFE) çıktısı üret** → `dist/game.[hash].js` + `.css`. `index.html`'e bunları
  **klasik `<script src>`** (ES module DEĞİL) ve `<link>` olarak enjekte et (küçük bir Vite eklentisiyle).
- **ES `module` script KULLANMA:** bazı iOS cihazlarda çalışmadı → klasik script çalışıyor.
- **Tek-dosya (inline) YAPMA:** iOS Safari sayfa sonundaki büyük gömülü script'i çalıştırmıyor.
- **Content-hash** dosya adında olsun → CDN eski dosyayı veremez (stale cache yok).
- HTML enjeksiyonunda **`String.replace`'e JS içeriğini replacement STRING olarak verme** — minified kodda
  `$&`/`$$` desenleri bozulur. **Fonksiyon replacement** kullan.
- `index.html`: no-cache meta'ları + saf-CSS açılış çubuğu (JS'siz döner) + `<noscript>` uyarısı +
  hata olursa ekrana yazan `fatal-error` katmanı + adım-adım teşhis (`window.__step`).
- **Hosting:** GitHub Pages kullanıyorsan kaynak = **"GitHub Actions"** (ham branch DEĞİL — ham branch dev
  `main.js`'i servis eder, oyun açılmaz). Private repoda Pages ücretsiz açılmıyorsa **Vercel** (push=otomatik deploy).
- **Sürüm rozeti:** `index.html`'e sağ-alt küçük `build vNN` rozeti koy → kullanıcı hangi sürümü gördüğünü söyleyebilir,
  cache sorununu anında ayırt edersin.

---

## 4. CLAUDE İLE ÇALIŞMA AKIŞI — SEVKİYAT HATTI (her değişikliğin geçmesi gereken kapı)

> Amaç: Claude'un yaptığı hiçbir değişiklik **derlenmeden + test geçmeden + açıldığı doğrulanmadan** canlıya gitmesin.

### 4.1 Başsız (headless) doğrulama — scratchpad ölür, her oturumda yeniden kur
1. Geçici tarayıcı: `npm i -D playwright-core` (işi bitince **kaldır**, bağımlılıkta bırakma; test `.mjs`'leri `.gitignore`'da).
2. **Boot-gate:** dist'i bir klasöre kopyala, Chromium'la aç, `window.__game`/state hazır mı bekle, `pageerror` yakala →
   BOOT_OK / BOOT_FAIL. (Sandbox'ta yerel http.server bağlanmıyorsa `file://` protokolü + `--allow-file-access-from-files`.)
3. **Sayısal/mantık testi:** kritik mekaniği başsız doğrula (ör. simülasyonu elle `_update(1/60)` adımla, eklem açısı /
   skor snapshot'ı al). Görseli headless'ta birebir göremezsin → **mantık/koordinat/derleme ile** doğrula.
4. **Regresyon testi:** çekirdek kurallar için küçük bir test (`npm run test:...`) — KCK2D'de "gol algılama 13/13".

### 4.2 Ship script'i (tek komut: derle → boot-gate → test → rozet artır → commit → push)
```bash
# kullanım: bash ship.sh <yeni_sürüm> "commit mesajı"
set -e
sed -i "s/build v[0-9]*/build v$NEW/" index.html   # rozet artır
npm run build            # IIFE/klasik-script üretir
# ... dist'i kopyala, boot-gate .mjs çalıştır (BOOT_OK değilse çık) ...
npm run test:goals       # veya projenin çekirdek testi
git add index.html src ... && git commit -m "$MSG" && git push
```
- **KURAL:** boot-gate FAIL ya da test kırmızıysa **PUSH YOK** → canlı son iyi halde kalır.
- İş bitince temizlik: geçici `.mjs` sil, `npm uninstall playwright-core`, `git checkout package*.json`.

### 4.3 Değişiklik disiplini
- Her anlamlı değişiklikte **`build vNN` artır** (kullanıcı ne gördüğünü bilsin, cache teşhisi).
- Tek branch'te kal (deploy tetikleyen branch); force-push/history-rewrite yapma.
- Görselini cihazda göremeyeceğin kararları `HANDOFF.md`'ye "cihaz onayı bekliyor" diye not düş.

---

## 5. GÜVENLİ OTONOM / GÖZETİMSİZ KOŞU (Claude'u tek başına saatlerce çalıştırmak)

> KCK2D'de Claude, kullanıcı tatildeyken saatlerce tek başına çalıştı (turlu döngü). Bunu güvenli kılan şey
> aşağıdaki "korkuluklar"dı. Onlarsız otonom koşu = drift + bozuk canlı riski.

### 5.1 VERIFY-GATE (en kritik korkuluk)
Döngü her turda: `git pull` → değişiklik → **`build` + çekirdek test** → SADECE ikisi de geçerse `git push`.
Böylece bozuk bir tur canlıya gidemez; canlı hep son doğrulanmış iyi halde kalır.

### 5.2 Önceliklendirilmiş, çentiklenebilir PLAN dosyası
- `PLAN.md`: **sıralı, TEK-turluk, küçük** maddeler (checkbox'lı). Claude her tur bir sonraki açık maddeyi alır.
- Madde bitince `~~üstünü çiz~~ ✅ vNN — kısa not` → sonraki tur atlar.
- Büyük işi **alt-adımlara böl** (tek-turluk agent büyük refactoru güvenli yapamaz).
- **"DOKUNMA" bloğu:** çekirdek (fizik/çarpışma/skor/kayıt/dağıtım) korumalı; her tur bu satırı görür.

### 5.3 "Plan biterse" korkuluğu (drift önleme)
Plan tükenince taze-bağlamlı agent **yeni büyük özellik uydurmasın**. Kural koy:
> "Tüm maddeler bittiyse: yeni mekanik/özellik UYDURMA; yalnız düşük-riskli cila (taşma taraması, kontrast,
> ölü kod temizliği); emin değilsen HİÇBİR ŞEY değiştirme, HANDOFF'a yaz, turu atla."

### 5.4 Git eşzamanlılık — "güvenli pencere"
Otomasyon `commit→push` döngüsüyle çalışırken sen de repoya dokunacaksan:
- Değişikliğini **tur ARASINDA** (otomasyonun elinde push edilmemiş commit yokken) yap.
- Sadece **fast-forward** (üstüne ekle); **force-push YASAK** (otomasyonu takar).
- Push'tan hemen önce remote tepesinin ilerlemediğini doğrula (`merge-base --is-ancestor`); ilerlediyse abort/rebase.
- Otomasyonun aktif düzenlediği dosyada büyük değişiklik yapma (çakışma).

### 5.5 Her şey geri alınabilir olsun
Kritik sürümlerde `backup/vNN-stabil` branch'i; git geçmişi temiz; kullanıcı dönünce beğenmediğini tek tek geri alabilir.

---

## 6. YENİ REPO İÇİN HIZLI BAŞLANGIÇ CHECKLIST
- [ ] `CLAUDE.md` (yağsız; §1.4 şablonu) + `CHANGELOG.md` (boş, otomatik yüklenmez) + `PLAN.md` (backlog).
- [ ] Vite **lib/IIFE + klasik-script** build kurulumu (§3) — ES module/inline DEĞİL.
- [ ] `index.html`: no-cache meta + CSS açılış + `fatal-error` katmanı + `build v1` rozeti.
- [ ] Çekirdek mekanik için **1 regresyon testi** (`npm run test:...`).
- [ ] **Ship script'i** + headless **boot-gate** .mjs deseni (§4.2) — `.gitignore`'a `*.mjs`.
- [ ] Toon kimliği + cel ramp (RGBAFormat!) + `onBeforeCompile` kancası + `customProgramCacheKey` (§2).
- [ ] "DOKUNMA" listesi (çekirdek fizik/çarpışma/skor/dağıtım) CLAUDE.md'de net.
- [ ] Otonom koşacaksan: verify-gate + plan disiplini + "plan biterse" kuralı + backup branch (§5).

---

### Tek cümlelik özet
**Bağlamı yağsız tut (CLAUDE.md ince + load-on-demand), görseli ucuz numaralarla yap (toon + shader yama + CSS/prosedürel),
iOS için klasik-script/IIFE'yi bozma, ve her değişikliği build+test+boot kapısından geçirmeden canlıya gönderme —
bunları korkuluk yaparsan Claude'a saatlerce güvenle iş devredebilirsin.**
