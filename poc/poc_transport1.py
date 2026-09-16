#!/usr/bin/env python3
"""
POC transport 1 : réutiliser la clé de partage d'un formulaire Grist publié
pour appeler l'API REST en anonyme (sans clé API, sans règles d'accès).

Usage :
  python poc_transport1.py FORM_URL [options]

FORM_URL : lien du formulaire publié, par ex.
  https://grist.numerique.gouv.fr/o/mon-equipe/forms/AbCdEfGhIjKlMnOpQrStUv/12
  https://docs.getgrist.com/forms/AbCdEfGhIjKlMnOpQrStUv/4

Sans option, le script ne fait que des lectures (aucune donnée créée).

Options :
  --write                  crée un enregistrement de test dans la table du formulaire
  --field COL=VAL          force la valeur d'une colonne (répétable). Une colonne absente du
                           formulaire teste l'écriture des colonnes non affichées
  --attach FICHIER         envoie une pièce jointe (POST /attachments) puis la place dans --attach-col
  --attach-col COL         colonne de type Attachments cible
  --child TABLE:COLREF     après création du parent, crée une ligne dans TABLE avec COLREF = id parent
                           (multi-tables avec une seule clé : TABLE doit avoir son propre widget
                           Formulaire publié sur la même page)
  --child-field COL=VAL    valeur supplémentaire pour la ligne enfant (répétable)
  --read-table TABLE       tente GET /tables/TABLE/records (portée de lecture réelle)
  --other-url FORM_URL2    clé d'un autre formulaire : vérifie qu'elle ne peut pas écrire dans la
                           table du premier (isolation des clés)
  --origin URL             origine simulée pour le test CORS (défaut https://example.org)
"""
import argparse
import datetime as dt
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

RESULTS = []

# Console Windows : forcer l'UTF-8 pour éviter les caractères mal affichés.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def record(name, status, detail=""):
    RESULTS.append((name, status, detail))
    mark = {"PASS": "OK  ", "FAIL": "KO  ", "INFO": "info", "SKIP": "skip"}[status]
    print(f"[{mark}] {name}" + (f" : {detail}" if detail else ""))


def parse_form_url(url):
    m = re.match(r"^(https?://[^/]+)(?:/o/([^/]+))?/forms/([^/]+)/(\d+)", url.strip())
    if not m:
        sys.exit(f"URL de formulaire non reconnue : {url}")
    host, org, key, vs_id = m.groups()
    api = f"{host}/o/{org}/api/s/{key}" if org else f"{host}/api/s/{key}"
    return {"host": host, "org": org, "key": key, "vsId": int(vs_id), "api": api}


def http(method, url, body=None, headers=None, raw=None, content_type=None):
    headers = dict(headers or {})
    data = None
    if raw is not None:
        data = raw
        headers["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", "replace")
            return resp.status, dict(resp.headers), text
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        return e.code, dict(e.headers), text
    except urllib.error.URLError as e:
        return 0, {}, str(e)


def as_json(text):
    try:
        return json.loads(text)
    except Exception:
        return None


def dummy_value(field):
    t = field["type"]
    opts = field.get("options", {})
    choices = opts.get("choices") or []
    refs = field.get("refValues") or []
    if t in ("Int", "Numeric"):
        return 42
    if t == "Bool":
        return True
    if t == "Date":
        return dt.date.today().isoformat()
    if t == "DateTime":
        return dt.datetime.now().replace(microsecond=0).isoformat()
    if t == "Choice":
        return choices[0] if choices else "POC"
    if t == "ChoiceList":
        return ["L", choices[0]] if choices else ["L", "POC"]
    if t == "Ref":
        return refs[0][0] if refs else 0
    if t == "RefList":
        return ["L", refs[0][0]] if refs else ["L"]
    if t == "Attachments":
        return None
    return f"POC transport1 {dt.datetime.now():%Y-%m-%d %H:%M:%S}"


def multipart(files):
    boundary = "----poc" + uuid.uuid4().hex
    parts = []
    for path in files:
        name = os.path.basename(path)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        with open(path, "rb") as fh:
            content = fh.read()
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"upload\"; filename=\"{name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n"
        )
    body = b"".join(parts) + f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def kv_list(items):
    out = {}
    for item in items or []:
        if "=" not in item:
            sys.exit(f"Format attendu COL=VAL, reçu : {item}")
        k, v = item.split("=", 1)
        j = as_json(v)
        out[k] = j if j is not None and not isinstance(j, str) else v
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("form_url")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--field", action="append")
    ap.add_argument("--attach")
    ap.add_argument("--attach-col")
    ap.add_argument("--child")
    ap.add_argument("--child-field", action="append")
    ap.add_argument("--read-table")
    ap.add_argument("--other-url")
    ap.add_argument("--origin", default="https://example.org")
    a = ap.parse_args()

    f = parse_form_url(a.form_url)
    api = f["api"]
    print(f"Hôte : {f['host']}  org : {f['org'] or '-'}  clé : {f['key']}  section : {f['vsId']}")
    print(f"Base API : {api}\n")

    # 1. Définition du formulaire
    st, hd, tx = http("GET", f"{api}/forms/{f['vsId']}")
    form = as_json(tx) if st == 200 else None
    if not form:
        record("GET /forms/<vsId>", "FAIL", f"HTTP {st} {tx[:200]}")
        summary()
        return
    table = form["formTableId"]
    fields = form["formFieldsById"]
    record("GET /forms/<vsId>", "PASS", f"titre « {form['formTitle']} », table {table}, {len(fields)} champs")
    for fid, fl in fields.items():
        o = fl.get("options", {})
        flags = " ".join(x for x in [
            "obligatoire" if o.get("formRequired") else "",
            "masqué" if o.get("formIsHidden") else "",
            "prefill-URL" if o.get("formAcceptFromUrl") else "",
            f"{len(o.get('choices', []))} choix" if o.get("choices") else "",
            f"{len(fl['refValues'])} valeurs Ref" if fl.get("refValues") is not None else "",
        ] if x)
        print(f"        champ {fid} : {fl['colId']} ({fl['type']}) {flags}")

    # 2. Mauvaise clé
    st, _, _ = http("GET", f"{f['host']}/api/s/x{f['key']}/forms/{f['vsId']}")
    record("Mauvaise clé refusée", "PASS" if st in (401, 403, 404) else "FAIL", f"HTTP {st}")

    # 3. Portée de lecture
    st, _, tx = http("GET", f"{api}/tables")
    record("GET /tables (liste des tables)", "INFO", f"HTTP {st} {tx[:160]}")
    st, _, tx = http("GET", f"{api}/tables/{table}/records")
    rows = (as_json(tx) or {}).get("records") if st == 200 else None
    censored = st in (401, 403) or (st == 200 and rows == [])
    record(f"GET /tables/{table}/records (lecture des réponses)", "PASS" if censored else "FAIL",
           f"HTTP {st}, {len(rows) if rows is not None else 0} ligne(s) visible(s)" +
           ("" if censored else " : des réponses sont lisibles !"))
    if a.read_table:
        st, _, tx = http("GET", f"{api}/tables/{a.read_table}/records")
        rows = (as_json(tx) or {}).get("records") if st == 200 else None
        cols = sorted({k for r in (rows or []) for k in r.get("fields", {})})
        record(f"GET /tables/{a.read_table}/records", "INFO",
               f"HTTP {st}, {len(rows) if rows is not None else 0} ligne(s), colonnes visibles = {cols}")

    # 4. CORS
    st, hd, _ = http("OPTIONS", f"{api}/tables/{table}/records", headers={
        "Origin": a.origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    acao = hd.get("Access-Control-Allow-Origin") or hd.get("access-control-allow-origin")
    record("CORS preflight OPTIONS", "PASS" if st in (200, 204) and acao in ("*", a.origin) else "FAIL",
           f"HTTP {st}, Allow-Origin={acao}, Allow-Headers={hd.get('Access-Control-Allow-Headers')}")
    st, hd, _ = http("GET", f"{api}/forms/{f['vsId']}", headers={"Origin": a.origin})
    acao = hd.get("Access-Control-Allow-Origin") or hd.get("access-control-allow-origin")
    record("CORS sur requête réelle", "PASS" if acao in ("*", a.origin) else "FAIL", f"Allow-Origin={acao}")

    if not a.write:
        record("Écriture", "SKIP", "relancer avec --write pour créer un enregistrement de test")
        summary()
        return

    # 5. Pièces jointes
    values = {}
    if a.attach:
        body, ctype = multipart([a.attach])
        st, _, tx = http("POST", f"{api}/attachments", raw=body, content_type=ctype)
        ids = as_json(tx)
        ok = st == 200 and isinstance(ids, list) and ids
        record("POST /attachments", "PASS" if ok else "FAIL", f"HTTP {st} {tx[:160]}")
        if ok and a.attach_col:
            values[a.attach_col] = ["L", *ids]

    # 6. Création dans la table du formulaire
    for fid, fl in fields.items():
        if fl["type"] == "Attachments":
            continue
        v = dummy_value(fl)
        if v is not None:
            values[fl["colId"]] = v
    overrides = kv_list(a.field)
    values.update(overrides)
    st, _, tx = http("POST", f"{api}/tables/{table}/records", body={"records": [{"fields": values}]})
    j = as_json(tx) or {}
    parent_id = (j.get("records") or [{}])[0].get("id")
    record(f"POST /tables/{table}/records", "PASS" if st == 200 and parent_id else "FAIL",
           f"HTTP {st}, id créé = {parent_id}, colonnes envoyées = {list(values)}")
    extra_cols = [c for c in overrides if c not in {fl["colId"] for fl in fields.values()}]
    if extra_cols and parent_id:
        record("Écriture de colonnes absentes du formulaire", "INFO",
               f"acceptée pour {extra_cols} (règle +C sur toutes les colonnes)")

    # 7. Modification et lecture interdites
    if parent_id:
        st, _, tx = http("PATCH", f"{api}/tables/{table}/records",
                         body={"records": [{"id": parent_id, "fields": {list(values)[0]: "modif"}}]})
        record("PATCH (modification) refusé", "PASS" if st in (401, 403) else "FAIL", f"HTTP {st} {tx[:120]}")
        st, _, tx = http("GET", f"{api}/tables/{table}/records?filter=" + json.dumps({"id": [parent_id]}))
        rows = (as_json(tx) or {}).get("records") if st == 200 else None
        hidden = st in (401, 403) or (st == 200 and rows == [])
        record("Ligne créée non relisible avec la clé", "PASS" if hidden else "FAIL",
               f"HTTP {st}, {len(rows) if rows is not None else 0} ligne(s) visible(s)")

    # 8. Multi-tables : ligne enfant avec la même clé
    if a.child and parent_id:
        ctable, ccol = a.child.split(":", 1)
        cvals = {ccol: parent_id, **kv_list(a.child_field)}
        st, _, tx = http("POST", f"{api}/tables/{ctable}/records", body={"records": [{"fields": cvals}]})
        cid = ((as_json(tx) or {}).get("records") or [{}])[0].get("id")
        record(f"POST enfant /tables/{ctable}/records (même clé)", "PASS" if st == 200 and cid else "FAIL",
               f"HTTP {st}, id = {cid} {tx[:120] if st != 200 else ''}")

    # 9. Isolation : la clé d'un autre formulaire ne doit pas écrire ici
    if a.other_url:
        o = parse_form_url(a.other_url)
        st, _, tx = http("POST", f"{o['api']}/tables/{table}/records",
                         body={"records": [{"fields": {list(values)[0]: "intrusion"}}]})
        record("Isolation : autre clé refusée sur cette table", "PASS" if st in (401, 403, 404) else "FAIL",
               f"HTTP {st} {tx[:120]}")

    summary()


def summary():
    print("\n===== Résumé =====")
    width = max(len(n) for n, _, _ in RESULTS) if RESULTS else 10
    for name, status, detail in RESULTS:
        print(f"{status:<5} {name:<{width}}  {detail[:90]}")
    fails = [n for n, s, _ in RESULTS if s == "FAIL"]
    print("\nRésultat :", "aucun échec" if not fails else f"{len(fails)} échec(s) : {', '.join(fails)}")


if __name__ == "__main__":
    main()
