# Checklist concrète : inscription de FormPlus au catalogue `gristgouv/widgets-config`

**Abandonné le 21 octobre 2026, quelques heures après la rédaction de ce document.** Le README de
`gristgouv/widgets-config` dit explicitement : « Configuration for the list of custom widgets
offered on the LaSuite and ANCT Grist instances. » — ce catalogue sert les instances **LaSuite et
ANCT**, pas l'instance **DINUM** qu'Antoine utilise réellement. Y inscrire FormPlus ne l'aurait
donc pas rendu visible là où ça compte. Document gardé tel quel ci-dessous à titre de référence
(le travail de recherche sur le format réel du dépôt reste valable si la question se repose pour
une autre instance), mais **ne pas relancer cette PR sans vérifier d'abord si DINUM a son propre
catalogue équivalent.**

Date : 21 octobre 2026. Objectif mentionné depuis le POC (`03-roadmap-priorites.md`, section « Qualité, à ne pas laisser de côté ») et jamais détaillé jusqu'ici. Ce document comble ce manque : il décrit ce que le dépôt **exige réellement** (vérifié en lisant son contenu en direct, pas supposé), prépare les pièces à copier-coller le jour venu, et liste les captures d'écran déjà prises.

**Aucune pull request n'a été ouverte vers `gristgouv/widgets-config`.** C'est un dépôt externe, l'action est publique et visible par l'équipe qui l'audite (DINUM/ANCT) : elle attend le feu vert explicite d'Antoine. Tout ce qui suit est un brouillon prêt à l'emploi dans **notre** dépôt.

---

## 1. Ce que le dépôt exige réellement (vérifié le 21 octobre 2026)

L'accès GitHub MCP de cette session ne couvre que `lombre33/FormPlus` ; tout ce qui suit vient de lectures publiques (`raw.githubusercontent.com`, API GitHub en anonyme) de `gristgouv/widgets-config` et de `gristgouv/grist-cw-intra-form` (le dépôt du widget « Intra Form » cité comme référence dans `01-etude-comparative.md`).

**Contenu intégral de `gristgouv/widgets-config` à la racine : seulement 3 fichiers.**

| Fichier | Rôle |
|---|---|
| `LICENSE` | Licence **du dépôt widgets-config lui-même** (MIT, « Les dépôts de la communauté Grist Gouv »), sans rapport avec la licence du widget soumis |
| `README.md` | Une seule ligne : « Configuration for the list of custom widgets offered on the LaSuite and ANCT Grist instances. » Aucun gabarit, aucune section attendue |
| `widget-list.json` | **Le vrai manifeste** : un tableau JSON, chaque widget du catalogue est un objet de ce tableau |

Pas de dossier par widget, pas de `CONTRIBUTING.md` (404 vérifié), pas de `PULL_REQUEST_TEMPLATE.md`, pas de workflow CI de validation du JSON à la racine du `.github/`. **La checklist mentionnée dans `03-roadmap-priorites.md` (« README au format attendu par ce dépôt ») visait le README de `widgets-config` : il n'y en a pas, le formalisme attendu est bien plus léger que supposé.**

### Champs réellement utilisés dans `widget-list.json`

Relevé exhaustif sur l'ensemble des entrées actuelles (une trentaine) :

| Champ | Obligatoire en pratique ? | Exemple réel |
|---|---|---|
| `name` | oui (présent partout) | `"Formulaire interne"` |
| `url` | oui | `"https://gristgouv.github.io/grist-cw-intra-form/"` |
| `widgetId` | oui, unique | `"@gristgouv/grist-cw-intra-form"` |
| `description` | oui | `"Créez des formulaires privés dans Grist !"` |
| `authors` | oui, tableau de `{name, url?}` | `[{"name":"maluhialoha","url":"https://github.com/maluhialoha"}]` |
| `accessLevel` | presque toujours (`full`, ou le texte lu pour la lecture seule d'une table) | `"full"` |
| `renderAfterReady` | presque toujours, `true` | `true` |
| `published` | vu sur plusieurs entrées | `true` |
| `isGristLabsMaintained` | optionnel, absent de la plupart des entrées récentes | `false` |
| `lastUpdatedAt` | optionnel (absent de « Formulaire interne » elle-même) | ISO 8601 |
| `archive` | rarissime (1 seule entrée, « Calendrier », pour une liste blanche de CDN) | sans objet pour FormPlus |

**Aucune entrée, sur la trentaine passées en revue, ne porte de champ `icon`, `screenshot(s)`, `license`, `category` ou `keywords`.** Le manifeste du catalogue ne demande ni icône ni capture d'écran : c'est strictement les champs ci-dessus.

### Le précédent concret : « Intra Form » (PR #5, fusionnée le 8 avril 2026)

- **Titre de la PR** : « Add infra form » (coquille pour « intra »), auteur `fflorent`.
- **Corps de la PR**, in extenso (3 lignes) : lien vers le widget hébergé, mention d'une correction d'indentation JSON, et une dépendance vers la PR #1 du dépôt du widget lui-même. Rien d'autre : pas de capture d'écran décrite, pas de section imposée.
- **1 seul fichier changé** : `widget-list.json`, avec l'ajout de l'entrée ci-dessus en fin de tableau.
- **Le dépôt du widget lui-même** (`gristgouv/grist-cw-intra-form`) : licence GitHub `null` — **aucun fichier `LICENSE`** n'y existe. Son `README.md` ne contient qu'un lien vers le fil du forum Grist (`forum.grist.libre.sh/t/custom-widget-intra-form-formulaire-interne/2444`), rien de plus.

**Conclusion factuelle :** le formalisme réel de `gristgouv/widgets-config` est minimal — une entrée JSON et une PR courte. Ni licence ni README étoffé ni capture d'écran n'ont été exigés du widget déjà accepté qui sert de référence. La notion d'« audit » DINUM/ANCT évoquée dans `01-etude-comparative.md` semble passer par la visibilité communautaire (fil de forum) plutôt que par une checklist formalisée dans le dépôt GitHub — aucune trace d'un processus de revue documenté n'a été trouvée (recherches sur le forum Grist, la doc `grist-docs.beta.numerique.gouv.fr`, et le fil « Idea: provide a more centralised widget repository » de `community.getgrist.com`, qui confirme qu'aucun processus formel n'a jamais été figé côté Grist Labs).

### Ce qu'on fait quand même, au-delà du strict minimum, et pourquoi

Rien n'oblige à aller plus loin, mais FormPlus est déjà mieux équipé que le précédent accepté :

- **Licence GPL 3.0** (`LICENSE` ; Apache-2.0 depuis le 18 septembre 2026, passée à GPL 3.0 le 21 octobre, décision du porteur de Grist Factory Suite pour tous ses dépôts) : pas exigée (Intra Form n'en a aucune), mais un vrai plus de sérieux pour une revue DINUM/ANCT. À garder telle quelle.
- **README du dépôt FormPlus** (`README.md`) : déjà largement plus complet que celui d'Intra Form. Aucune refonte nécessaire pour la soumission.
- **Captures d'écran** (section 3 ci-dessous) : pas demandées par le manifeste, mais utiles pour rassurer les relecteurs dans le corps de la PR et pour une éventuelle annonce sur le forum Grist, à la manière d'Intra Form.

---

## 2. Brouillons prêts à copier-coller

### 2.1 Entrée à ajouter dans `widget-list.json` (fin du tableau, après la dernière entrée existante)

```json
{
  "name": "FormPlus",
  "url": "https://lombre33.github.io/FormPlus/poc/widget.html",
  "widgetId": "@lombre33/formplus",
  "published": true,
  "accessLevel": "full",
  "renderAfterReady": true,
  "description": "Formulaires avancés dans Grist : questions conditionnelles, plusieurs tables, thème clair/sombre, lien public sans clé API.",
  "authors": [
    {
      "name": "lombre33",
      "url": "https://github.com/lombre33"
    }
  ],
  "lastUpdatedAt": "AAAA-MM-JJ"
}
```

Notes sur les champs :
- `widgetId` suit la convention `@<identifiant>/<slug>` observée partout (`@gristgouv/...`, `@dinum/...`, `@anct/...`) ; `@lombre33/formplus` est libre et unique, à vérifier au moment de la PR qu'aucune entrée ne le porte déjà.
- `accessLevel: "full"` correspond à ce que `poc/js/main.js` demande réellement (`grist.ready({ requiredAccess: 'full', ... })`) et à ce que le README du dépôt annonce déjà (« Niveau d'accès : accès complet »).
- `renderAfterReady: true` suit la convention de toutes les entrées existantes ; FormPlus appelle bien `grist.ready()` au démarrage, donc compatible.
- `lastUpdatedAt` est optionnel (l'entrée d'Intra Form ne le porte pas) : à remplir avec la date réelle de la PR si on le garde, ou à retirer sans conséquence.
- Pas de champ `icon` ni `screenshots` à ajouter : ils n'existent dans aucune entrée du fichier.

### 2.2 Corps de la pull request vers `gristgouv/widgets-config`

```
Titre : Add FormPlus widget

Add FormPlus, a form builder widget for Grist: conditional questions,
multi-table read/write, light/dark theme, public link with no API key
(reuses the native published-form share key).

Widget: https://lombre33.github.io/FormPlus/poc/widget.html
Source: https://github.com/lombre33/FormPlus (GPL-3.0)

Screenshots: see attached / linked below.
```

À adapter en anglais correct au moment venu (le dépôt `widgets-config` et ses PR existantes sont en anglais) ; garder le corps court, dans l'esprit de la PR #5 qui a servi de référence.

### 2.3 Annonce optionnelle sur le forum Grist (`forum.grist.libre.sh`, catégorie Développement)

Facultatif, mais c'est le mécanisme qui semble avoir donné sa visibilité à Intra Form avant/pendant sa revue (voir le fil cité dans `01-etude-comparative.md`). Brouillon court, sur le modèle du fil « Form Builder » déjà étudié dans ce même document :

```
Titre : Custom widget FormPlus — formulaires avancés pour Grist

FormPlus est un widget personnalisé pour Grist : questions
conditionnelles (ET/OU), lecture et écriture dans plusieurs tables,
thème clair/sombre, personnalisation (logo, couleur d'accent), lien
public sans compte ni clé API (réutilise la clé de partage d'un
formulaire natif publié). Licence GPL 3.0, code public.

Dépôt : https://github.com/lombre33/FormPlus
Widget : https://lombre33.github.io/FormPlus/poc/widget.html

[captures d'écran]

Retours bienvenus avant la demande d'ajout à gristgouv/widgets-config.
```

---

## 3. Captures d'écran

**Pas exigées par le manifeste** (section 1), mais prises quand même pour le corps de la PR et l'annonce forum. Prises le 21 octobre 2026 avec Playwright (Chromium headless) contre un vrai environnement Grist auto-hébergé local (`tests/grist-env/start-grist-test.sh`), donc avec du vrai rendu, de vraies données de test (tables `Departements`/`Villes`), pas des maquettes. **Reprises le même jour** après la fusion des commits de deux autres sessions qui ont ajouté de nouveaux types de question (date et heure, liste de références, échelle, classement, signature/dessin, lieu sur carte) et le saut d'étape conditionnel entre pages :

| Fichier | Contenu |
|---|---|
| `docs/images/editeur-questions.png` | Écran concepteur, onglet **Questions** : une carte « Nouvelle page » (étapes) et une carte « Échelle » (« Niveau de satisfaction », valeurs 1 à 5) déjà posées dans la liste |
| `docs/images/editeur-nouvelle-question.png` | Sélecteur de type grand ouvert : les 20 types actuels (texte, paragraphe, nombre, date, date et heure, oui/non, choix, choix multiples, choix depuis une table, liste de références, échelle, classement, signature/dessin, lieu sur carte — visiblement grisé, dépendance externe non chargée par défaut —, pièces jointes, titre de section, bloc d'info, nouvelle page) |
| `docs/images/editeur-parametres.png` | Onglet **Paramètres** : adresse à diffuser, QR code, apparence (titre, description, logo, couleur d'accent, forme des coins) |
| `docs/images/repondant-bureau-clair.png` | Vue répondant (`public-form.html`), bureau (1280×900), thème clair, avec les vraies valeurs de référence (départements, villes) |
| `docs/images/repondant-bureau-sombre.png` | Même vue, thème sombre (`prefers-color-scheme: dark`) |
| `docs/images/repondant-mobile-clair.png` | Même vue, mobile (390×844), thème clair |
| `docs/images/repondant-mobile-sombre.png` | Même vue, mobile, thème sombre |

Détail technique pour qui reproduirait ces captures : `public-form.html#form=<lien du formulaire natif publié>` lit la définition via `GET /api/s/<clé>/forms/<section>` en anonyme, donc aucune donnée du document outre ce que le formulaire natif expose déjà. L'écran éditeur a demandé de contourner localement un point de sécurité volontaire du widget — `poc/js/plugin-loader.js` ne charge `grist-plugin-api.js` que depuis `https://docs.getgrist.com` (liste blanche anti-usurpation, voir le commentaire du fichier), un hôte hors de la politique réseau de cet environnement d'agent. Contournement fait uniquement **côté navigateur, pour la capture**, en servant le même fichier que le conteneur Grist de test héberge lui-même (`http://localhost:8484/grist-plugin-api.js`) : aucune modification du code du widget.

**Remarque sur la fraîcheur des captures** : reprises après `git fetch origin main` + fusion des derniers commits des deux autres sessions actives sur `poc/js/`, donc à jour de la grille de 20 types au 21 octobre 2026. Ces deux autres sessions continuent de travailler en parallèle (nouveaux types de question, audit UI/UX) : si l'écran a encore changé notablement d'ici l'ouverture réelle de la PR, reprendre ces captures une dernière fois avant de les joindre — le script Playwright n'est pas versionné dans le dépôt (fichiers temporaires du scratchpad de la session), mais sa méthode est documentée ci-dessus et tient en quelques lignes : `test/login`, naviguer sur la page du widget avec `?style=singlePage`, intercepter la requête vers `docs.getgrist.com/grist-plugin-api.js` pour la servir depuis le conteneur Grist local, puis cliquer dans l'iframe (`.qtype-pill`, `.qtype-opt[data-kind="..."]`, onglets `Questions`/`Paramètres`).

**Captures qui restent à prendre manuellement si on veut aller plus loin** (non bloquant, le manifeste n'en demande aucune) :
- Une question conditionnelle visiblement masquée/affichée (« Afficher si »), pour illustrer le vrai différenciateur du widget.
- Le champ Pièces jointes en cours d'envoi.
- Un test réel avec un lecteur d'écran (demandé par ailleurs dans la même section qualité de `03-roadmap-priorites.md`, hors périmètre de cette tâche).

---

## 4. Licence

**GPL 3.0, déjà présente (`LICENSE`)** — Apache-2.0 jusqu'au 21 octobre 2026, passée à GPL 3.0 ce jour-là (décision du porteur de Grist Factory Suite pour tous ses dépôts) — convient très largement. Preuve concrète qu'aucune licence précise n'est imposée par le catalogue : le widget déjà accepté (Intra Form / `gristgouv/grist-cw-intra-form`) n'a **aucune licence** dans son propre dépôt (`license` vaut `null` côté API GitHub). Rien à changer ici — c'est même un point où FormPlus se présente mieux que le précédent de référence.

---

## 5. Déroulé concret de la pull request, le jour du feu vert

1. Vérifier que `https://lombre33.github.io/FormPlus/poc/widget.html` répond bien en production (GitHub Pages) — toutes les entrées existantes du catalogue pointent vers des pages déjà en ligne.
2. Forker `gristgouv/widgets-config` sur le compte `lombre33`.
3. Dans le fork, ajouter l'entrée JSON de la section 2.1 à la fin du tableau de `widget-list.json`, en conservant l'indentation à 2 espaces déjà en place dans le fichier (la PR #5 de référence a dû corriger une indentation à 4 espaces pour cette raison : rester cohérent avec l'existant dès le départ évite ce détour).
4. Vérifier que le fichier reste un JSON valide (`python3 -m json.tool widget-list.json` ou équivalent) avant de committer.
5. Ouvrir la pull request vers `gristgouv/widgets-config:main`, avec le titre et le corps de la section 2.2, en pièces jointes les captures de la section 3.
6. Poster éventuellement l'annonce de la section 2.3 sur le forum Grist, en lien croisé avec la PR.
7. Suivre la PR : le seul précédent observé (PR #5) a attendu la fusion préalable d'une PR dans le dépôt du widget lui-même avant d'être elle-même fusionnée — à surveiller si un besoin similaire apparaît, mais rien de tel n'est identifié aujourd'hui côté FormPlus.

**Rappel : aucune de ces étapes n'est à exécuter sans le feu vert explicite d'Antoine.** Ce document prépare uniquement le terrain dans notre propre dépôt.
