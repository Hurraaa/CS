# PLAN / BACKLOG

> Sıralı, TEK-turluk, küçük maddeler. Her tur bir sonraki açık maddeyi al. Biten madde: `~~çiz~~ ✅ vNN`.
> Büyük işi alt-adımlara böl. Emin değilsen değiştirme, HANDOFF'a yaz, atla.

## Aktif
- [ ] Mobil buton konumları/boyutları küçük ekranda (SE gibi) taşma taraması + gerekiyorsa ayar.

## Oyun hissi backlog'u (benzer FPS'lerden araştırma — game feel/juice)
> Kaynaklar: game-feel/juice tasarım yazıları + CS/Valorant hit-feedback analizleri. Sıra ≈ etki/maliyet.
- [ ] **Ölüm ragdoll'u**: devrilme yerine uzuvların gevşeyip savrulması (yarı-ragdoll: uzuv rotasyonlarına rastgele açısal hız).
- [ ] **Mermi kovanı fırlatma**: her atışta sağa küçük parlak kovan parçacığı + yere 'tink' sesi.
- [ ] **Duvar izleri (decal)**: mermi deliği izi 5-10 sn kalsın (şu an sadece anlık parçacık var).
- [ ] **Kill anında mikro slow-mo / hit-stop** (~40ms) — FPS'te riskli, önce tek başına A/B dene.
- [ ] **Öldürme serisi**: double kill / triple kill duyurusu + artan perde jingle.
- [ ] **Round sonu MVP**: en çok kill alan oyuncunun adı banner altında.
- [ ] **Ayak sesi varyasyonu**: bot ayak sesleri (yakın düşman adımları duyulsun — taktik derinlik).
- [ ] **Silah sesi katmanlama**: mesafeye göre yakın 'crack' + uzak 'echo' katmanı.
- [ ] **Vinyet + hafif chromatic aberration** hasar anında (CSS ile ucuz).
- [ ] **Titreşim (mobil)**: isabette navigator.vibrate(20), kill'de 40ms.
- [ ] **Dinamik müzik/ambiyans**: çatışma yoğunluğuna göre alçak dron katmanı.
- [ ] **Isınma atış poligonu**: menüden 'antrenman' — hareketsiz hedefler, çıkış yok.

## Sonra (fikirler)
- [ ] Üçüncü silah (tabanca/bıçak) — silah sistemi hazır, WEAPONS'a ekle.
- [ ] Basit pathfinding (botlar köşelerden gelsin).
- [ ] Skor kaydı (localStorage high-score).
- [ ] Toon/cel-shaded görsel kimlik (rehber §2) — opsiyonel stil yükseltmesi.

## Biten
- ~~Vuruş hissi paketi (et sesi, flinch, hasar sayıları, kan) + silah/kamera hissi (FOV punch, sarsıntı, reload animasyonu, tracer)~~ ✅ v1.4.0–1
- ~~Round sistemi (20 kill), skor tablosu, radar, hasar yönü, headshot FX, dinamik nişangah+reload barı~~ ✅ v1.3.0–5
- ~~Ayarlar (hassasiyet/ses), bot zorluğu, müttefik takip (F), ayak/vız sesleri, ölüm ekranı+spawn koruması, mobil perf~~ ✅ v1.3.6–11
- ~~5v5 takım deathmatch: müttefik/düşman botlar, bot-vs-bot AI, rig + animasyonlar, takım HUD~~ ✅ v1.2.0
- ~~AK-47 + çok-silah sistemi (auto ateş, sprey recoil, 1/2/Q + mobil buton)~~ ✅ v1.1.0
- ~~iOS-güvenli klasik-script/IIFE build + boot-gate + CI deploy~~ ✅ v1.0.0
- ~~Mobil dokunmatik kontroller~~ ✅ v1.0.0
- ~~İlk oynanır sürüm (AWP + botlar + hangar)~~ ✅ v1.0.0
