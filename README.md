# 🎯 AWP HANGAR — CS Tarzı Deathmatch

Three.js ile yazılmış, tarayıcıda çalışan Counter-Strike esintili bir **AWP deathmatch** oyunu.
Kapalı bir hangar arenasında botlara karşı savaşırsın. Kurulum yok — bir linke tıkla ve oyna.

![Önizleme](preview.png)

Sağ tık ile AWP scope:

![Scope](preview-scope.png)

## 🎮 Nasıl Oynanır

| Tuş | İşlev |
|-----|-------|
| **W A S D** | Hareket |
| **Fare** | Bak / nişan al |
| **Sol Tık** | Ateş (AWP — bolt-action) |
| **Sağ Tık** | Scope / zoom (basılı tut) |
| **R** | Şarjör değiştir |
| **Shift** | Yürü (yavaş) |
| **Space** | Zıpla (kasalara çık) |
| **Ctrl** | Çömel |
| **Esc** | Menü / duraklat |

Ekrandaki **OYNA** butonuna tıkla — fare kilidi devreye girer. Kafadan vuruş anında öldürür,
gövde vuruşu çok yüksek hasar verir. En yüksek K/D skorunu yakala.

## ⚙️ Özellikler

- **AWP mekaniği:** scope zoom, bolt-action atış gecikmesi, recoil, namlu alevi, hitmarker
- **5 bot:** görüş hattı (line-of-sight) kontrolü, seni görünce ateş açma, yaklaşma/strafe, can barı, respawn
- **Hangar harita:** konteynerler, kasa yığınları, rampalar, siperler — uzun snipe hatları + saklanma
- **CS hissi:** prosedürel dokular, gölgeli ışıklandırma, tavan kirişlerinden ışık huzmeleri
- **HUD:** nişangah, can, cephane, K/D skoru, kill feed
- **Ses:** WebAudio ile AWP çatlaması ve bot ateşi
- **Deathmatch:** sonsuz döngü, respawn

## 🚀 Çalıştırma

### Yerel
Herhangi bir statik sunucu yeterli (ES modülleri `file://` üzerinde bazı tarayıcılarda kısıtlı olabilir):

```bash
npx http-server -p 8080
# tarayıcıda: http://localhost:8080
```

### GitHub Pages (önerilen — linkten oyna)
Bu repoda hazır bir GitHub Actions workflow'u var (`.github/workflows/pages.yml`).
`main` dalına merge edildiğinde site otomatik yayınlanır. Tek seferlik kurulum:

1. Repo **Settings → Pages** bölümüne git.
2. **Build and deployment → Source** kısmını **GitHub Actions** olarak ayarla.
3. `main` dalına push/merge yap — birkaç dakika içinde
   `https://<kullanıcı-adın>.github.io/cs/` adresinde yayında olur.

## 🛠️ Teknik

- **Three.js 0.160** (repoya gömülü — `vendor/` altında, CDN'e bağımlılık yok)
- Tek dosya: `index.html` (importmap + ES modülleri)
- Fizik: AABB çarpışma + yerçekimi, adım (step) mantığıyla kasalara tırmanma
- Bot AI: durum makinesi (patrol / engage) + LOS raycast

## 📄 Lisans

MIT
