#!/usr/bin/env python3
"""
Réparation des options de widgets personnalisés d'un document Grist.

Symptôme : à l'ouverture d'une page, Grist affiche « Veuillez recharger le document …
[JSON.parse: unexpected character at line 1 column 2 …] ». Cause : dans
_grist_Views_section.options, la clé customView doit être une chaîne JSON ; une version
du widget FormPlus l'avait écrite en objet.

Usage :
  python repair_section_options.py DOC_URL --api-key CLE [--dry-run]

DOC_URL : n'importe quelle adresse du document, par ex.
  https://grist.numerique.gouv.fr/o/mon-equipe/abc123XYZ/POC-Form-Builder/p/3
La clé API se crée dans Grist : Profil, Paramètres du compte, Clé API. Ne la partagez pas.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def parse_doc_url(url):
    m = re.match(r"^(https?://[^/]+)(?:/o/([^/]+))?/(?:doc/)?([A-Za-z0-9_~.-]+)", url.strip())
    if not m:
        sys.exit(f"Adresse de document non reconnue : {url}")
    host, org, doc_id = m.groups()
    base = f"{host}/o/{org}" if org else host
    return f"{base}/api/docs/{doc_id}"


def http(method, url, key, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def rebuild_custom_view(cv):
    """Reconstruit l'objet customView à partir d'une valeur corrompue."""
    if isinstance(cv, str):
        try:
            return json.loads(cv) or {}
        except Exception:
            return {}
    if isinstance(cv, dict):
        char_keys = sorted((k for k in cv if k.isdigit()), key=int)
        if char_keys:
            try:
                rebuilt = json.loads("".join(cv[k] for k in char_keys)) or {}
                if cv.get("widgetOptions"):
                    rebuilt["widgetOptions"] = cv["widgetOptions"]
                return rebuilt
            except Exception:
                pass
        return {k: v for k, v in cv.items() if not k.isdigit()}
    return {}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("doc_url")
    ap.add_argument("--api-key", required=True)
    ap.add_argument("--dry-run", action="store_true", help="montre les réparations sans les appliquer")
    a = ap.parse_args()

    api = parse_doc_url(a.doc_url)
    st, data = http("GET", f"{api}/tables/_grist_Views_section/records", a.api_key)
    if st != 200:
        sys.exit(f"Lecture impossible (HTTP {st}) : {str(data)[:300]}")

    actions = []
    for rec in data.get("records", []):
        f = rec.get("fields", {})
        if f.get("parentKey") != "custom":
            continue
        try:
            o = json.loads(f.get("options") or "{}") or {}
        except Exception:
            print(f"Section {rec['id']} : options illisibles, ignorée.")
            continue
        cv = o.get("customView")
        if cv is None or isinstance(cv, str):
            continue
        fixed = rebuild_custom_view(cv)
        o["customView"] = json.dumps(fixed, ensure_ascii=False)
        actions.append(["UpdateRecord", "_grist_Views_section", rec["id"], {"options": json.dumps(o, ensure_ascii=False)}])
        print(f"Section {rec['id']} (page {f.get('parentId')}) : customView à rétablir, widget {fixed.get('url') or 'sans URL'}.")

    if not actions:
        print("Aucune section corrompue trouvée.")
        return
    if a.dry_run:
        print(f"{len(actions)} réparation(s) à faire (mode --dry-run, rien n'a été modifié).")
        return
    st, res = http("POST", f"{api}/apply", a.api_key, actions)
    if st == 200:
        print(f"{len(actions)} section(s) réparée(s). Rechargez le document.")
    else:
        sys.exit(f"Échec de l'écriture (HTTP {st}) : {str(res)[:300]}")


if __name__ == "__main__":
    main()
