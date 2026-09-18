#!/usr/bin/env python3
"""Crée le document de test « POC Form Builder » sur une instance Grist.

Reproduit la description de `poc/README-poc.md`, section 1 et 2 : les cinq
tables, leurs colonnes, quelques lignes de données, la page qui porte les
formulaires natifs de `Reponses` et `Enfants`, une seconde page pour le
formulaire de `Formulaires` (test d'isolation des clés), et la publication de
ces formulaires. Ajoute aussi une page qui ne contient que le widget FormPlus,
conformément à la section 7.

Variables d'environnement :
  GRIST_URL      adresse de l'instance (défaut http://localhost:8484)
  GRIST_API_KEY  clé d'API de l'utilisateur propriétaire (obligatoire)
  FORMPLUS_URL   adresse du widget à installer dans la page dédiée
                 (défaut http://localhost:8010/poc/widget.html)
  DOC_NAME       nom du document (défaut « POC Form Builder »)
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("GRIST_URL", "http://localhost:8484").rstrip("/")
API_KEY = os.environ.get("GRIST_API_KEY", "")
WIDGET_URL = os.environ.get("FORMPLUS_URL", "http://localhost:8010/poc/widget.html")
DOC_NAME = os.environ.get("DOC_NAME", "POC Form Builder")


def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + API_KEY)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit("%s %s -> %s %s" % (method, path, exc.code, detail))
    return json.loads(raw) if raw.strip() else None


def apply_actions(doc_id, actions):
    return api("POST", "/api/docs/%s/apply" % doc_id, actions)


def sql(doc_id, query):
    path = "/api/docs/%s/sql?q=%s" % (doc_id, urllib.parse.quote(query))
    return api("GET", path)["records"]


import urllib.parse  # noqa: E402  (après la définition de BASE, volontaire)


def main():
    if not API_KEY:
        raise SystemExit("GRIST_API_KEY manquante.")

    org_domain = os.environ.get("GRIST_ORG_DOMAIN")
    orgs = api("GET", "/api/orgs")
    if org_domain:
        org = next(o for o in orgs if o["domain"] == org_domain)
    else:
        # Un site d'équipe plutôt que le site personnel : seul un site
        # d'équipe autorise l'accès anonyme aux liens de partage.
        org = next((o for o in orgs if o["owner"] is None), orgs[0])
    workspaces = api("GET", "/api/orgs/%s/workspaces" % org["id"])
    ws = workspaces[0]

    # Idempotence : on supprime un document du même nom s'il existe déjà.
    for doc in ws.get("docs", []):
        if doc["name"] == DOC_NAME:
            api("DELETE", "/api/docs/%s" % doc["id"])

    doc_id = api("POST", "/api/workspaces/%s/docs" % ws["id"], {"name": DOC_NAME})
    print("document   : %s (%s)" % (DOC_NAME, doc_id))

    # --- 1. Tables et colonnes -------------------------------------------
    # Les colonnes de type Référence sont d'abord créées en Texte : leur table
    # cible doit exister avant de pouvoir les convertir.
    apply_actions(doc_id, [
        ["AddTable", "Departements", [
            {"id": "code", "type": "Text"},
            {"id": "nom", "type": "Text"},
        ]],
        ["AddTable", "Villes", [
            {"id": "nom", "type": "Text"},
            {"id": "Departement", "type": "Text"},
        ]],
        ["AddTable", "Formulaires", [
            {"id": "Nom", "type": "Text"},
            {"id": "Definition", "type": "Text"},
        ]],
        ["AddTable", "Reponses", [
            {"id": "Nom", "type": "Text"},
            {"id": "Email", "type": "Text"},
            {"id": "Departement", "type": "Text"},
            {"id": "Ville", "type": "Text"},
            {"id": "Age", "type": "Int"},
            {"id": "Commentaire", "type": "Text"},
            {"id": "PJ", "type": "Attachments"},
            {"id": "Interne", "type": "Text"},
            {"id": "Formulaire", "type": "Text"},
        ]],
        ["AddTable", "Enfants", [
            {"id": "Reponse", "type": "Text"},
            {"id": "Libelle", "type": "Text"},
            {"id": "Quantite", "type": "Numeric"},
        ]],
    ])

    cols = {}
    for rec in sql(doc_id, "select c.id as colRef, t.tableId, c.colId "
                           "from _grist_Tables_column c "
                           "join _grist_Tables t on t.id = c.parentId"):
        f = rec["fields"]
        cols[(f["tableId"], f["colId"])] = f["colRef"]

    refs = [
        ("Villes", "Departement", "Departements", "nom"),
        ("Reponses", "Departement", "Departements", "nom"),
        ("Reponses", "Ville", "Villes", "nom"),
        ("Reponses", "Formulaire", "Formulaires", "Definition"),
        ("Enfants", "Reponse", "Reponses", "Nom"),
    ]
    actions = []
    for table, col, target, shown in refs:
        actions.append(["ModifyColumn", table, col, {
            "type": "Ref:" + target,
            "visibleCol": cols[(target, shown)],
        }])
    apply_actions(doc_id, actions)
    apply_actions(doc_id, [
        ["SetDisplayFormula", table, None, cols[(table, col)], "$%s.%s" % (col, shown)]
        for table, col, target, shown in refs
    ])

    # --- 2. Quelques lignes de données -----------------------------------
    api("POST", "/api/docs/%s/tables/Departements/records" % doc_id, {"records": [
        {"fields": {"code": "69", "nom": "Rhône"}},
        {"fields": {"code": "75", "nom": "Paris"}},
        {"fields": {"code": "33", "nom": "Gironde"}},
    ]})
    api("POST", "/api/docs/%s/tables/Villes/records" % doc_id, {"records": [
        {"fields": {"nom": "Lyon", "Departement": 1}},
        {"fields": {"nom": "Villeurbanne", "Departement": 1}},
        {"fields": {"nom": "Paris 3e", "Departement": 2}},
        {"fields": {"nom": "Bordeaux", "Departement": 3}},
        {"fields": {"nom": "Mérignac", "Departement": 3}},
    ]})
    api("POST", "/api/docs/%s/tables/Formulaires/records" % doc_id, {"records": [
        {"fields": {"Nom": "Definition de test",
                    "Definition": json.dumps({"version": 1, "questions": []})}},
    ]})

    # --- 3. Pages et formulaires natifs ----------------------------------
    page_forms = apply_actions(doc_id, [
        ["CreateViewSection", table_ref(doc_id, "Reponses"), 0, "form", None, None],
    ])["retValues"][0]
    view_ref = page_forms["viewRef"]
    section_reponses = page_forms["sectionRef"]

    section_enfants = apply_actions(doc_id, [
        ["CreateViewSection", table_ref(doc_id, "Enfants"), view_ref, "form", None, None],
    ])["retValues"][0]["sectionRef"]

    apply_actions(doc_id, [
        ["UpdateRecord", "_grist_Views", view_ref, {"name": "Formulaire POC"}],
    ])

    # `Interne` hors du formulaire, `Formulaire` présent mais masqué.
    fields = {}
    for rec in sql(doc_id, "select f.id as fieldRef, f.parentId, c.colId "
                           "from _grist_Views_section_field f "
                           "join _grist_Tables_column c on c.id = f.colRef"):
        f = rec["fields"]
        fields[(f["parentId"], f["colId"])] = f["fieldRef"]
    apply_actions(doc_id, [
        ["RemoveRecord", "_grist_Views_section_field",
         fields[(section_reponses, "Interne")]],
        ["UpdateRecord", "_grist_Views_section_field",
         fields[(section_reponses, "Formulaire")],
         {"widgetOptions": json.dumps({"formIsHidden": True})}],
    ])

    # Seconde page : formulaire sur `Formulaires`, clé distincte.
    other = apply_actions(doc_id, [
        ["CreateViewSection", table_ref(doc_id, "Formulaires"), 0, "form", None, None],
    ])["retValues"][0]
    apply_actions(doc_id, [
        ["UpdateRecord", "_grist_Views", other["viewRef"], {"name": "Formulaire Formulaires"}],
    ])

    # --- 4. Publication ---------------------------------------------------
    key_main = publish(doc_id, view_ref, [section_reponses, section_enfants])
    key_other = publish(doc_id, other["viewRef"], [other["sectionRef"]])

    # --- 5. Page dédiée au widget FormPlus (README section 7) ------------
    widget = apply_actions(doc_id, [
        ["CreateViewSection", table_ref(doc_id, "Reponses"), 0, "record", None, None],
    ])["retValues"][0]
    apply_actions(doc_id, [
        ["UpdateRecord", "_grist_Views", widget["viewRef"], {"name": "FormPlus"}],
        ["UpdateRecord", "_grist_Views_section", widget["sectionRef"], {
            "parentKey": "custom",
            "options": json.dumps({"customView": json.dumps({
                "mode": "url",
                "url": WIDGET_URL,
                "access": "full",
                "renderAfterReady": False,
            })}),
        }],
    ])
    widget_page = page_of(doc_id, widget["viewRef"])

    base_org = "%s/o/%s" % (BASE, org["domain"])
    print("formulaire Reponses  : %s/forms/%s/%s" % (base_org, key_main, section_reponses))
    print("formulaire Enfants   : %s/forms/%s/%s" % (base_org, key_main, section_enfants))
    print("formulaire Formulaires (isolation) : %s/forms/%s/%s"
          % (base_org, key_other, other["sectionRef"]))
    print("page widget FormPlus : %s/s/%s/p/%s?style=singlePage"
          % (base_org, key_main, widget_page))
    print("document dans l'interface : %s/o/%s/%s" % (BASE, org["domain"], doc_id))

    json.dump({
        "docId": doc_id,
        "org": org["domain"],
        "shareKey": key_main,
        "shareKeyIsolation": key_other,
        "sectionReponses": section_reponses,
        "sectionEnfants": section_enfants,
        "sectionFormulaires": other["sectionRef"],
        "widgetPage": widget_page,
        "formUrlReponses": "%s/forms/%s/%s" % (base_org, key_main, section_reponses),
        "formUrlFormulaires": "%s/forms/%s/%s" % (base_org, key_other, other["sectionRef"]),
        "widgetPageUrl": "%s/s/%s/p/%s?style=singlePage" % (base_org, key_main, widget_page),
    }, open(os.environ.get("DOC_INFO_PATH", "grist-test-doc.json"), "w"),
        indent=2, ensure_ascii=False)


def table_ref(doc_id, table_id):
    rows = sql(doc_id, "select id from _grist_Tables where tableId = '%s'" % table_id)
    return rows[0]["fields"]["id"]


def page_of(doc_id, view_ref):
    rows = sql(doc_id, "select id from _grist_Pages where viewRef = %d" % view_ref)
    return rows[0]["fields"]["id"]


def publish(doc_id, view_ref, section_refs):
    """Reproduit le bouton « Publier » : une part sur la page, les sections en mode formulaire."""
    link_id = str(uuid.uuid4())
    share_ref = apply_actions(doc_id, [
        ["AddRecord", "_grist_Shares", None,
         {"linkId": link_id, "options": json.dumps({"publish": True})}],
    ])["retValues"][0]
    actions = [["UpdateRecord", "_grist_Pages", page_of(doc_id, view_ref), {"shareRef": share_ref}]]
    for ref in section_refs:
        actions.append(["UpdateRecord", "_grist_Views_section", ref,
                        {"shareOptions": json.dumps({"form": True, "publish": True})}])
    apply_actions(doc_id, actions)
    return link_id


if __name__ == "__main__":
    sys.exit(main())
