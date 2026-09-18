#!/usr/bin/env bash
# Relance un Grist auto-hébergé (image officielle gristlabs/grist) avec un
# document de test prêt pour FormPlus : 5 tables, formulaires natifs publiés,
# une page dédiée au widget. Idempotent : peut être relancé tel quel dans une
# nouvelle session.
#
# Usage : ./start-grist-test.sh [port_grist] [port_widget]
# Défauts : 8484 (Grist), 8010 (widget servi depuis la racine du dépôt).
#
# Si le pull de gristlabs/grist échoue avec un 403 sur Docker Hub (proxy de
# sortie de certains environnements), le script bascule sur le miroir public
# mirror.gcr.io.

set -euo pipefail

GRIST_PORT="${1:-8484}"
WIDGET_PORT="${2:-8010}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="${GRIST_TEST_STATE_DIR:-$HOME/.formplus-grist-test}"
DATA_DIR="$STATE_DIR/grist-data"
INFO_FILE="$STATE_DIR/grist-test-doc.json"
CONTAINER=grist-formplus-test
IMAGE=gristlabs/grist:latest
EMAIL=test@formplus.local
NAME="Test FormPlus"

mkdir -p "$DATA_DIR"

echo "== Docker =="
if ! docker info >/dev/null 2>&1; then
  echo "Le démon Docker n'est pas joignable. Sur une session Claude Code, il faut" \
       "généralement le démarrer explicitement, par exemple : sudo dockerd &" >&2
  exit 1
fi

echo "== Image Grist =="
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if ! docker pull "$IMAGE"; then
    echo "Pull direct échoué (probablement bloqué par la politique réseau)," \
         "on passe par le miroir mirror.gcr.io." >&2
    if ! grep -q '"registry-mirrors"' /etc/docker/daemon.json 2>/dev/null; then
      echo '{"registry-mirrors":["https://mirror.gcr.io"]}' | sudo tee /etc/docker/daemon.json >/dev/null
      sudo pkill -f '^dockerd' || true
      sleep 3
      (sudo dockerd >/tmp/dockerd.log 2>&1 &)
      sleep 8
    fi
    docker pull "$IMAGE"
  fi
fi

echo "== Conteneur Grist (port $GRIST_PORT) =="
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p "$GRIST_PORT:8484" \
  -e GRIST_SESSION_SECRET=formplus-test-secret-not-a-real-credential \
  -e GRIST_DEFAULT_EMAIL="$EMAIL" \
  -e GRIST_IN_SERVICE=true \
  -e GRIST_TEST_LOGIN=1 \
  -e GRIST_ORG_IN_PATH=true \
  -e APP_HOME_URL="http://localhost:$GRIST_PORT" \
  -v "$DATA_DIR:/persist" \
  "$IMAGE" >/dev/null

echo "Attente du démarrage..."
COOKIE_JAR="$STATE_DIR/cookies.txt"
API_KEY=""
for i in $(seq 1 40); do
  rm -f "$COOKIE_JAR"
  curl -sS --max-time 5 -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    "http://localhost:$GRIST_PORT/test/login?username=$EMAIL&name=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$NAME")&next=http://localhost:$GRIST_PORT/" \
    -o /dev/null 2>/dev/null || { sleep 2; continue; }
  CANDIDATE=$(curl -sS --max-time 5 -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST \
    -H "X-Requested-With: XMLHttpRequest" -H "Content-Type: application/json" \
    "http://localhost:$GRIST_PORT/api/profile/apiKey" 2>/dev/null || true)
  # Une vraie clé d'API Grist est une chaîne hexadécimale nue, jamais du JSON :
  # tant que le serveur redémarre en interne ("restarting") ou n'est pas encore
  # prêt, la réponse est un objet {"error": ...}.
  if [ -n "$CANDIDATE" ] && ! printf '%s' "$CANDIDATE" | grep -q '"error"'; then
    API_KEY="$CANDIDATE"
    break
  fi
  sleep 2
done
if [ -z "$API_KEY" ]; then
  echo "Grist n'a pas répondu correctement après 80s (dernière réponse : $CANDIDATE)." >&2
  exit 1
fi
echo "$API_KEY" > "$STATE_DIR/apikey.txt"

# Le conteneur redémarre son processus interne une fois de plus après avoir
# répondu à /api/profile/apiKey ; attendre une réponse stable de l'API avant
# de continuer (même symptôme que ci-dessus : {"error":"restarting"}).
ORGS_JSON=""
for i in $(seq 1 40); do
  CANDIDATE=$(curl -sS --max-time 5 -H "Authorization: Bearer $API_KEY" \
    "http://localhost:$GRIST_PORT/api/orgs" 2>/dev/null || true)
  if [ -n "$CANDIDATE" ] && printf '%s' "$CANDIDATE" | python3 -c "import json,sys; json.load(sys.stdin)" >/dev/null 2>&1 \
     && ! printf '%s' "$CANDIDATE" | grep -q '"error"'; then
    ORGS_JSON="$CANDIDATE"
    break
  fi
  sleep 2
done
if [ -z "$ORGS_JSON" ]; then
  echo "L'API Grist n'est pas stabilisée après 80s (dernière réponse : $CANDIDATE)." >&2
  exit 1
fi

echo "== Site d'équipe de test =="
# Un site d'équipe (org), pas le site personnel : seul un site d'équipe
# autorise l'accès anonyme aux liens de partage (formulaires publiés, /s/...).
ORG_DOMAIN=formplus-test
EXISTING_ORG=$(printf '%s' "$ORGS_JSON" | \
  python3 -c "import json,sys; [print(o['id']) for o in json.load(sys.stdin) if o['domain']=='$ORG_DOMAIN']" || true)
if [ -z "$EXISTING_ORG" ]; then
  ORG_ID=$(curl -sS --max-time 15 -X POST -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    "http://localhost:$GRIST_PORT/api/orgs" -d '{"name":"FormPlus Test"}')
  # Un domaine personnalisé (sans préfixe "o-") évite le détour par l'écran de
  # facturation que Grist impose aux sites d'équipe non nommés.
  curl -sS --max-time 15 -X PATCH -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    "http://localhost:$GRIST_PORT/api/orgs/$ORG_ID" -d "{\"domain\":\"$ORG_DOMAIN\"}" >/dev/null
fi

echo "== Widget servi en local (port $WIDGET_PORT) =="
if ! curl -sS -o /dev/null --max-time 2 "http://localhost:$WIDGET_PORT/poc/widget.html" 2>/dev/null; then
  (cd "$REPO_ROOT" && nohup python3 -m http.server "$WIDGET_PORT" >/tmp/formplus-widget-http.log 2>&1 &)
  sleep 1
fi

echo "== Document de test =="
GRIST_URL="http://localhost:$GRIST_PORT" \
GRIST_API_KEY="$API_KEY" \
GRIST_ORG_DOMAIN="$ORG_DOMAIN" \
FORMPLUS_URL="http://localhost:$WIDGET_PORT/poc/widget.html" \
DOC_INFO_PATH="$INFO_FILE" \
python3 "$SCRIPT_DIR/grist_test_doc.py"

echo
echo "Document et adresses écrits dans : $INFO_FILE"
echo "Interface Grist (connecté)       : http://localhost:$GRIST_PORT/o/$ORG_DOMAIN"
echo
echo "IMPORTANT : l'adresse « /s/<clé>/p/<page> » que le widget génère lui-même"
echo "utilise le linkId du document (_grist_Shares.linkId), mais cette image"
echo "Grist exige la clé aléatoire assignée par le serveur au moment de la"
echo "synchronisation (table 'shares' de home.sqlite3, colonne 'key' — distincte"
echo "du linkId). Voir README.md de ce dossier, section « Écart constaté »."
