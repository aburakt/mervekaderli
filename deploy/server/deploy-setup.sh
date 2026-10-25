#!/usr/bin/env bash
# ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
# GitHub Actions deploy'unu kurar; ajansın makinesinde bir kez çalışır (sunucuya root ssh ve `gh auth login` gerekir).
#
#   bash deploy/server/deploy-setup.sh jci=aburakt/jciankara-site expertup=aburakt/expertup-site
#
# Her <id>=<repo> için:
# 1. Sunucuya pb-deploy'u (/usr/local/bin) ve pbdeploy kullanıcısını kurar; sudo yalnız pb-deploy için.
# 2. Yeni bir ed25519 anahtarı üretir; sunucuda `command="sudo -n /usr/local/bin/pb-deploy <id>"` ile kısıtlar
#    (aynı <id>'nin eski anahtarı silinir).
# 3. Özel anahtarı repo sırrı DEPLOY_SSH_KEY, sunucu parmak izini repo değişkeni DEPLOY_KNOWN_HOSTS olarak yazar.
#    Özel anahtar yalnız geçici klasörde durur, ekrana yazılmaz, sonunda silinir.
# Yeniden çalıştırmak güvenlidir: anahtarı yeniler.
set -euo pipefail
HOST="${HOST:-root@178.105.148.70}"
IP="${HOST#*@}"
[ $# -gt 0 ] || { sed -n '2,13p' "$0"; exit 2; }
command -v gh >/dev/null || { echo "gh gerekli (brew install gh && gh auth login)"; exit 2; }

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

scp -q "$here/pb-deploy.sh" "$HOST:/usr/local/bin/pb-deploy"
ssh "$HOST" 'set -e
  chown root:root /usr/local/bin/pb-deploy && chmod 755 /usr/local/bin/pb-deploy
  id pbdeploy >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash pbdeploy
  install -d -m 700 -o pbdeploy -g pbdeploy ~pbdeploy/.ssh
  touch ~pbdeploy/.ssh/authorized_keys
  echo "pbdeploy ALL=(root) NOPASSWD: /usr/local/bin/pb-deploy" > /etc/sudoers.d/pbdeploy
  chmod 440 /etc/sudoers.d/pbdeploy && visudo -cf /etc/sudoers.d/pbdeploy >/dev/null'

known=$(ssh-keyscan -t ed25519 "$IP" 2>/dev/null)
[ -n "$known" ] || { echo "ssh-keyscan $IP boş döndü"; exit 1; }

for pair in "$@"; do
  id="${pair%%=*}"; repo="${pair#*=}"
  [[ "$id" =~ ^[a-z0-9][a-z0-9-]*$ ]] && [[ "$repo" == */* ]] || { echo "geçersiz: $pair (<id>=<sahip>/<repo>)"; exit 2; }
  ssh "$HOST" "systemctl cat pb-$id >/dev/null" || { echo "sunucuda pb-$id.service yok, atlandı"; continue; }
  ssh-keygen -q -t ed25519 -N "" -C "deploy-$id" -f "$tmp/$id"
  line="restrict,command=\"sudo -n /usr/local/bin/pb-deploy $id\" $(cat "$tmp/$id.pub")"
  ssh "$HOST" "f=~pbdeploy/.ssh/authorized_keys; { grep -v ' deploy-$id\$' \$f || true; echo '$line'; } > \$f.new && install -m 600 -o pbdeploy -g pbdeploy \$f.new \$f && rm \$f.new"
  gh secret set DEPLOY_SSH_KEY -R "$repo" < "$tmp/$id"
  gh variable set DEPLOY_KNOWN_HOSTS -R "$repo" --body "$known"
  gh variable set DEPLOY_HOST -R "$repo" --body "$IP"
  rm -f "$tmp/$id"
  echo "$id → $repo: hazır (Actions > deploy > Run workflow ile denenebilir)"
done
