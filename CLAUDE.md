# Proje: AWP HANGAR 🎯

Three.js ile tarayıcıda çalışan, CS tarzı AWP deathmatch (botlara karşı). Masaüstü + mobil (dokunmatik).

> 🚨 BRANCH: Geliştirme `claude/counter-strike-game-plan-llpgd8` üzerinde; deploy `main`e merge ile.
> Force-push/history-rewrite YOK. Tek anlamlı değişiklik/tur.

## 📖 Bu dosya nasıl kullanılır (token verimliliği)
Yalnız **kalıcı kural + sabit mimari + dosya haritası + DOKUNMA listesi**. Changelog `CHANGELOG.md`'de
(otomatik yüklenmez). Aktif plan `PLAN.md`. Yeni sürüm notu buraya DEĞİL, CHANGELOG.md **başına**.
Derin dersler: `docs/CLAUDE_THREEJS_MOBIL_OYUN_REHBERI.md` (gerekince aç).

## 🎯 Güncel durum
v1.0.0 — Oynanır. AWP + scope, 5 bot (LOS AI), hangar harita, HUD, ses, deathmatch. Mobil dokunmatik + tam ekran.
iOS-güvenli klasik-script/IIFE build (esbuild) + GitHub Pages (Actions) deploy.

## 🏗️ Mimari (BUNU BOZMA — iOS Safari beyaz-ekran riski)
- **Build:** `src/main.js` (+ three) → esbuild **IIFE / klasik script** → `dist/game-[hash].js`.
- `index.html` bir **şablon**: `__GAME_JS__` (hash'li script yolu) + `__BUILD__` (sürüm) placeholder'ları
  `build.mjs` tarafından doldurulur, çıktı `dist/index.html`.
- **ASLA:** importmap, `<script type="module">`, ya da sayfa sonuna büyük inline script. (Bkz. rehber §3.)
- index.html'de: no-cache meta + `#boot` yükleme katmanı + `#fatal` hata katmanı + `window.__step`/`__ready`
  + `build vNN` rozeti. Oyun `window.__ready=true` + `__bootDone()` ile açılışı bitirir.

## 🚚 Sevkiyat hattı
`npm run build` → `npm run bootgate` (headless: `__ready` + hata yok + canvas var) → yeşilse commit+push.
Tek komut: `bash ship.sh <sürüm> "mesaj"`. Boot-gate KIRMIZIYSA PUSH YOK.
CI (`.github/workflows/pages.yml`): `main`e push → build + bootgate + Pages deploy.

## 🗺️ Dosya haritası (+ ana fonksiyon kancaları — grep hedefi)
- `index.html` — CSS + body HUD/menu/mobileUI + tiny bootstrap. Placeholder: `__GAME_JS__`, `__BUILD__`.
- `src/main.js` — TÜM oyun. Kancalar:
  - kurulum: `renderer`/`scene`/`camera`, `canvasTex`, ışıklar, `addBox` (harita+collider)
  - oyuncu: `respawnPlayer`, `update` (ana döngü: hareket/fizik/bot AI/efekt)
  - fizik: `collideAxis`, `groundHeight`, `botCollide` (AABB slide + step + yerçekimi)
  - silah: `shoot`, `startReload`/`finishReload`, `setScope`, viewGroup/muzzle flash
  - botlar: `makeBot`, `spawnBot`, `botCanSee` (LOS raycast), `botShoot`, `damageBot`/`killBot`
  - hasar/HUD: `damagePlayer`, `playerDie`, `updateHealth/Ammo/Score`, `addKillFeed`
  - mobil: `applyLook`, joystick `joyStart/joyMove/joyEnd`, `bindBtn`, `startGame` (touch: fullscreen)
  - efekt: `spawnTracer`, `spawnImpact`, `spawnBlood`
  - teşhis (zararsız): `window.__diag/__forceStep/__yawProbe/__moveProbe`
- `build.mjs` — esbuild IIFE + hash + HTML enjeksiyonu → `dist/`.
- `boot-gate.mjs` — build çıktısını başsız aç, BOOT_OK/FAIL.
- `.github/workflows/pages.yml` — CI build+bootgate+deploy.

## ⛔ DOKUNMA listesi (çekirdek)
- Build formatı (IIFE/klasik-script) — importmap/module/inline'a GERİ DÖNME.
- Çarpışma/fizik (`collideAxis`/`groundHeight`) ve `update` entegrasyon sırası.
- Deploy hattı (pages.yml, dist placeholder mekaniği).
- Emin değilsen değiştirme; `PLAN.md`/HANDOFF'a yaz, turu atla.

## 🔧 Sık komutlar
`npm install` · `npm run build` · `npm run bootgate` · `npm run serve` (dist'i 8080'de sun)
