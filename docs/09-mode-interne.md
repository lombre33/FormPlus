# Mode interne (réservation de questions par identité)

## Pourquoi ce mode existe

Le mode public habituel de FormPlus (lien avec clé de partage) est **anonyme par conception** : il
ne distingue jamais un répondant d'un autre, et ne peut donc pas réserver une question à quelqu'un
en particulier. Antoine a demandé de réexaminer ce point le 21 octobre 2026, en citant le widget
communautaire *Intra Form* (`gristgouv/grist-cw-intra-form`) comme exemple d'un formulaire qui
s'adapte à l'identité du répondant.

Recherche faite (code d'Intra Form, documentation officielle des règles d'accès Grist, plusieurs
fils du forum Grist Creators) : il n'existe **aucune API officielle** pour lire l'identité
courante depuis un widget. Un contournement documenté par la communauté existe (une colonne
« formule déclencheur » qui lit `user.Email`), mais il ne fonctionne **que pour une session
réellement authentifiée dans le document** — jamais pour une session de partage anonyme, qui reçoit
toujours `anon@getgrist.com`. D'où ce second mode, séparé du mode public : un formulaire ouvert
**directement sur une page de ce document Grist**, par des personnes qui ont déjà un compte et un
accès au document.

## Ce que ça fait, et ce que ça ne fait pas

- **Ça fait** : masquer une question supplémentaire à un répondant dont l'adresse n'est pas dans la
  liste autorisée de cette question (champ « Réserver à certaines personnes » dans l'éditeur,
  visible seulement quand le mode interne est activé). Vide = tout le monde.
- **Ça ne fait pas** : ce n'est **pas** un contrôle d'accès réel, seulement un affichage adapté —
  comme le dit l'auteur d'Intra Form lui-même à propos de son propre widget. N'importe qui avec un
  accès suffisant au document peut en principe lire les données brutes dans Grist. Seules les
  **règles d'accès du document** protègent vraiment une donnée sensible.
- Si l'identité ne peut pas être vérifiée (session anonyme malgré tout, droit d'écriture refusé...),
  le repli est **toujours** de masquer la question, jamais de la montrer par erreur.

## Mettre en place le mode interne

1. **Donner d'abord l'accès au document** aux personnes qui doivent répondre : au moins un droit
   d'écriture réel (rôle Éditeur, ou une règle d'accès dédiée). Sans ça, le mode interne ne peut
   fonctionner pour elles — c'est un choix Grist à faire par Antoine, FormPlus ne peut pas s'y
   substituer.
2. Dans l'éditeur FormPlus, onglet **Paramètres**, activer **Mode interne**. FormPlus crée alors une
   table technique partagée (`FormPlus_Repondants`, une seule par document, pas une par formulaire)
   avec une colonne « formule déclencheur » qui lit `user.Email`.
3. Ouvrir le widget **directement sur une page du document** (pas via le lien public) : c'est cette
   consultation-là qui résout l'identité réelle du répondant.
4. Sur chaque question à réserver, dans l'éditeur, le bouton **Réserver à certaines personnes**
   donne accès à une liste d'adresses (une par ligne).

## Vérifié en conditions réelles (21 octobre 2026)

Le mécanisme de la colonne « formule déclencheur » (`isFormula: false` + `formula` + `recalcWhen: 0`,
convention documentée par la communauté pour « Appliquer aux nouveaux enregistrements ») était
couvert par les tests automatisés hors ligne (`widget.html#test`, API Grist simulée) mais pas encore
confirmé contre un vrai serveur Grist. Antoine a explicitement demandé ce test en conditions
réelles : fait contre un Grist auto-hébergé (`tests/grist-env/`, même moteur Grist que l'instance
DINUM), avec deux vraies identités connectées (pas deux onglets de la même session) :

- Chaque identité, en posant une ligne jetable dans la table technique, obtient bien SA PROPRE
  adresse réelle en retour — jamais mélangées, jamais `anon@getgrist.com`.
- Une question réservée à l'identité B, configurée par l'identité A dans l'éditeur réel : A ne la
  voit pas en se mettant à la place du répondant, B la voit. Dans les deux sens, aucune fuite ni
  blocage à tort.

Détail de la méthode (deux sessions `/test/login`, contournement du chargement de
`grist-plugin-api.js` en environnement sans accès à `docs.getgrist.com`, écart clé réelle/`linkId`) :
[`tests/grist-env/README.md`](../tests/grist-env/README.md), sections « Vérifié » et « Tester avec
Playwright ». Cette même investigation a mis au jour une régression de CSP sans rapport avec le mode
interne lui-même (corrigée le même jour) : voir le commit qui suit l'audit GWaudit du 21 oct dans
`poc/widget.html`.

Reste non vérifié : le comportement précis sur l'instance DINUM elle-même (version de Grist,
éventuelles règles d'accès ou en-têtes spécifiques à cette instance) — le test ci-dessus couvre le
même moteur Grist mais pas cette instance précise.

## Où c'est implémenté

- `poc/js/grist-meta.js` : `ensureRespondentProbeTable` (table technique), `probeRespondentIdentity`
  (résolution de l'identité courante, ligne jetable posée puis retirée).
- `poc/js/respond.js` : `reservationOk` (masquage, réutilise le mécanisme de condition d'affichage
  existant), résolution de l'identité au chargement du formulaire (`renderFill`).
- `poc/js/config-editor.js` : réglage « Mode interne » (onglet Paramètres), champ « Réserver à... »
  par question (visible seulement quand le mode interne est activé).
