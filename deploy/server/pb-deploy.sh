#!/usr/bin/env bash
# ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
# Sunucuda /usr/local/bin/pb-deploy olarak durur (root, 755); deploy-setup.sh kurar.
# Sitenin deploy iş akışı (.github/workflows/deploy.yml) pb_hooks ve pb_migrations'ı tar.gz olarak stdin'den yollar:
#   tar -C pb -cz pb_hooks pb_migrations | ssh pbdeploy@<sunucu>
# pbdeploy kullanıcısının anahtarı authorized_keys'te `command="sudo -n /usr/local/bin/pb-deploy <id>"` ile kısıtlıdır:
# her anahtar yalnız kendi sitesini yükler, shell açamaz.
#
# Ne yapar (pb-<id>.service'in --hooksDir/--migrationsDir/--dir yollarına):
# 1. Paketi açar; site.js ID'si <id> değilse, yayındaki bir migration değişmişse durur.
# 2. Değişiklik yoksa hiçbir şey yapmaz.
# 3. pb_hooks'u yedekler (<hooksDir>.bak-<zaman>); yeni migration varsa servisi durdurup data.db'yi yedekler.
# 4. pb_hooks'u değiştirir (fazlalık silinir), yeni migration'ları ekler (eskilere dokunmaz), sahipliği pb_data'nınkine eşitler.
# 5. Servisi yeniden başlatır, /api/health 200 dönmezse yedekleri geri koyar ve hata ile çıkar.
# 6. Son 5 hook yedeği kalır.
set -euo pipefail

ID="${1:-}"
[[ "$ID" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "kullanım: pb-deploy <id> < paket.tar.gz" >&2; exit 2; }
UNIT="pb-$ID"
unit=$(systemctl cat "$UNIT" 2>/dev/null) || { echo "$UNIT.service yok" >&2; exit 2; }
arg() { echo "$unit" | grep -oE -- "--$1[= ][^ ]+" | head -1 | sed -E "s/--$1[= ]//"; }
PORT=$(arg http | grep -oE '[0-9]+$')
DATA=$(arg dir); HOOKS=$(arg hooksDir); MIGR=$(arg migrationsDir)
[ -n "$PORT" ] && [ -d "$DATA" ] && [ -d "$HOOKS" ] && [ -d "$MIGR" ] || { echo "$UNIT: --http/--dir/--hooksDir/--migrationsDir okunamadı" >&2; exit 2; }
OWNER=$(stat -c %U:%G "$DATA")

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
head -c 20000000 | tar -xz -C "$TMP" --no-same-owner --no-same-permissions
NEW_HOOKS="$TMP/pb_hooks"; NEW_MIGR="$TMP/pb_migrations"
[ -f "$NEW_HOOKS/site.js" ] && [ -d "$NEW_MIGR" ] || { echo "paket eksik: pb_hooks/site.js ve pb_migrations/ gerekir" >&2; exit 2; }
grep -qE "^[[:space:]]*ID:[[:space:]]*\"$ID\"" "$NEW_HOOKS/site.js" || { echo "site.js ID'si \"$ID\" değil, başka sitenin paketi" >&2; exit 2; }

added=()
for f in "$NEW_MIGR"/*; do
  [ -f "$f" ] || continue
  n=$(basename "$f")
  if [ -f "$MIGR/$n" ]; then
    cmp -s "$f" "$MIGR/$n" || { echo "yayındaki migration değişmiş: $n (yeni dosya eklenir, eskisi düzenlenmez)" >&2; exit 3; }
  else
    added+=("$n")
  fi
done

if diff -rq "$NEW_HOOKS" "$HOOKS" >/dev/null && [ ${#added[@]} -eq 0 ]; then
  echo "$ID: değişiklik yok"
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)-$$
HBAK="$HOOKS.bak-$STAMP"
cp -a "$HOOKS" "$HBAK"
DBAK=""
if [ ${#added[@]} -gt 0 ]; then
  systemctl stop "$UNIT"
  DBAK="$DATA/data.db.bak-$STAMP"
  cp -a "$DATA/data.db" "$DBAK"
fi

diff -rq "$NEW_HOOKS" "$HOOKS" || true
for n in "${added[@]}"; do echo "yeni migration: $n"; done

replace_hooks() { # $1 kaynak klasör
  find "$HOOKS" -mindepth 1 -delete && cp -R "$1/." "$HOOKS/" && chown -R "$OWNER" "$HOOKS"
}
apply() {
  replace_hooks "$NEW_HOOKS" || return 1
  for n in "${added[@]}"; do cp "$NEW_MIGR/$n" "$MIGR/$n" && chown "$OWNER" "$MIGR/$n" || return 1; done
}
healthy() {
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if apply && systemctl restart "$UNIT" && healthy; then
  echo "$ID: yüklendi, hook yedeği $HBAK${DBAK:+, veritabanı yedeği $DBAK}"
  ls -1d "$HOOKS".bak-* 2>/dev/null | sort | head -n -5 | xargs -r rm -rf
  exit 0
fi

echo "$ID: yükleme ya da /api/health başarısız, geri alınıyor" >&2
journalctl -u "$UNIT" -n 30 --no-pager >&2 || true
systemctl stop "$UNIT" || true
replace_hooks "$HBAK" || true
for n in "${added[@]}"; do rm -f "$MIGR/$n"; done
if [ -n "$DBAK" ]; then rm -f "$DATA/data.db-wal" "$DATA/data.db-shm"; cp -a "$DBAK" "$DATA/data.db"; fi
systemctl start "$UNIT" || true
if healthy; then echo "$ID: eski hâline döndü" >&2; else echo "$ID: geri alma sonrası da sağlıksız, elle bakılmalı" >&2; fi
exit 1
