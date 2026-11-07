# GFS-ETAT : Form+

Mis à jour le 2026-11-07, au commit `886c550` (dernier commit de code que cette page décrit).

## Consignes
- 027 · lue · aucun code à changer. Form+ n'écrit, ne lit et n'a jamais écrit aucune colonne
  `Auteur`, `Visibilite`, `Personnes` ni `Espace` (vérifié : aucune occurrence dans `poc/js/`) -
  `GFS_Auteur` et les autres colonnes `GFS_…` restent tolérées sans y toucher. Pour le refus
  d'écriture annoncé (« Blocked by row update access rules ») une fois le partage activé : les deux
  nouveaux appels qui ÉCRIVENT dans un fichier `FormPlus_Formulaires` au nom de la personne
  (`GfsLink.onDelete`/`onDuplicate`, consignes 020/021) attrapent déjà toute erreur et répondent
  `{fait:false}`/`{dit:…}` à GFS plutôt que de planter ou de réessayer (`try`/`catch`, main.js) ;
  `saveConfig` (l'enregistrement normal d'un formulaire dans l'éditeur) fait de même depuis
  longtemps, affiche « non enregistré » plutôt que de planter. Pas encore vérifié un par un : les
  autres écritures de l'éditeur (nouvelle question, nouvelle colonne…) suivent le même chemin
  (`saveConfig`), jamais essayées précisément sous un partage actif en lecture seule - à affiner si
  GFS le rejoue et trouve un plantage.
- 026 · lue · faite · `886c550` · point 3 pris : pas de fenêtre d'accord pour la table de la copie,
  mais `dit` le dit. L'hypothèse de GFS est le choix de Form+ : une fenêtre à l'appel `dupliquer`
  attendrait un clic sur un écran pas forcément affiché (l'appel vient de l'explorateur, pas
  forcément de Form+ au premier plan) - elle resterait invisible, et GFS abandonnerait l'appel au
  bout de 20 s en disant à la personne que Form+ ne répond pas, pire que l'absence de fenêtre. Le
  geste « Dupliquer » lui-même, déjà demandé explicitement sur un formulaire dont la personne sait
  qu'il a sa table de réponses, en tient lieu. `duplicateManagedForm` rend maintenant aussi le nom
  de la nouvelle table ; `dit` le dit (« Elle n'est pas publiée. Ses réponses iront dans une
  nouvelle table, « … », vide. »), pour que la personne le sache sans avoir à cliquer. Rejeu
  mesuré par GFS (25 vérifications, FR/EN, aucune en échec) pris en compte, rien à corriger côté
  Form+ au-delà du point 3.
- 024 · faite · lue · `a8307be` · le kit répond à « supprimer » et « dupliquer » (0.10.0).
  `kit/` relevé à `cb1f8cd` (0.10.0) : `GfsLink.onDelete`/`onDuplicate` existent, exactement le
  crochet par geste que la carte du 06/11 avait choisi (même mécanisme que `onClose`, 0.9.0).
  020 et 021 ci-dessous, faites dans le même lot.
- 021 · faite · `7057309` · copie un formulaire en entier, sans le publier. `GfsLink.onDuplicate`
  (main.js) appelle `duplicateManagedForm` (grist-meta.js) : copie la section native (une page
  TOUTE NEUVE, donc sans aucune clé de partage - jamais publiée), la Définition (sous le nom déjà
  calculé par GFS) et les questions, avec sa PROPRE table de réponses, VIDE (jamais celle de
  l'original, pour ne jamais y mélanger une réponse déjà reçue avec une réponse à venir de la
  copie). La copie reprend : ses questions, les colonnes de sa table principale (texte, nombre,
  case, pièce jointe, et la colonne Référence cachée d'une question « Choix depuis une table »,
  type compris) ; elle NE reprend PAS : les réponses déjà reçues par l'original (table neuve),
  et - limite connue - une question qui écrit dans une AUTRE table que la table principale (combo
  « Écrire dans » de l'éditeur) continue de viser cette même autre table, partagée avec
  l'original. La personne republie la copie elle-même, comme tout formulaire parti de zéro
  (Publier dans Grist, puis coller son lien dans Form+). Vérifié en conditions réelles (Grist
  Docker, `tests/grist-env/`) : `AddTable` accepte bien un type `Ref:<table>` dans sa liste de
  colonnes (jamais exercé ailleurs dans ce dépôt - `ensureChoiceField` ne crée les siennes que par
  `AddColumn`), la nouvelle table reste à 0 ligne après la copie, et l'original ne reçoit aucune
  écriture.
- 020 · faite · `7057309` · ferme le lien public avant la corbeille. `GfsLink.onDelete` (main.js)
  appelle `closeManagedFormPublicLink` (grist-meta.js) : dépublie la section native du formulaire
  (`shareOptions` remis à `{}`, même mécanisme que la dépublication existante) - rien d'autre :
  jamais la ligne de `FormPlus_Formulaires` (GFS la garde, pour la restaurer), jamais
  `FormPlus_Pub_<vsId>` et ses réponses, jamais la définition. Idempotent (rappelable sans rien
  écrire de plus si déjà fermé) ; répond vrai aussi si la ligne ou sa section n'existent déjà
  plus (rien à bloquer). Vérifié en conditions réelles (même essai que la 021) : la section
  redevient bien privée, la ligne reste présente.
- 023 · faite · lue · `bf0ddce` · l'attente d'ambiance arrive après la première image. Mesuré par
  GFS : `[data-gfs-pending]`, posé par `poc/js/main.js` (un `<script type="module">`), arrivait à
  76 ms - après la première image à 16 ms, laissant l'éclair des couleurs d'origine (017) entier.
  `poc/js/gfs-pending.js`, un script CLASSIQUE (pas `type="module"`) chargé en `<head>` **avant les
  feuilles**, pose maintenant l'attribut avant que le navigateur ne dessine quoi que ce soit (même
  mécanisme que `js/theme.js` chez Automation+) ; il teste `location.search` par une expression
  volontairement simple (`/[?&]gfs=\d/`), ne pouvant pas importer `hostContract` du kit (un module
  ES). `main.js` garde le seul rôle de retirer l'attribut (`ambiance.ready`, ou 2 s de repli),
  **sans condition** cette fois : retirer un attribut absent ne fait rien, ce qui évite tout écart
  entre les deux tests. Vérifié en conditions réelles (Playwright, observateur posé avant la
  navigation) : l'attribut est posé à 7 ms, avant la première image mesurée à 26 ms dans ce même
  essai.
- 022 · faite · lue · (déjà `1d71b1d`, la 019) · le kit répond à « fermer » (0.9.0). `kit/` est à
  `eaa2ae2` (0.9.0) depuis la 019, et `GfsLink.onClose`/`onOpen` (main.js) portent déjà la règle
  de la 019 (rien en attente sur `#config` : vrai aussitôt ; une réponse en cours sur `#fill` :
  la question Quitter sans envoyer/Annuler). Rien de plus à faire.
- 019 · faite · lue · `1d71b1d` · réponds à « fermer » : enregistre avant de laisser la place à
  une autre app. Ce que Form+ a « en attente » : sur `#config` (le concepteur), rien - chaque
  champ s'écrit tout de suite dans la section widget, pas de bouton « Enregistrer » (déjà vrai
  depuis la 012, GfsLink.onOpen le disait déjà). Sur `#fill` (le répondant, mode interne dans
  GFS), en revanche : une réponse commencée ne s'écrit qu'à l'envoi (`onSubmit`), donc tant que
  la personne n'a pas cliqué sur le bouton d'envoi, rien n'est encore enregistré. Sous-module
  `kit` relevé à `0.9.0` (`eaa2ae2`, GfsLink.onClose). `GfsLink.onClose`/`onOpen` (main.js)
  répondent `{ferme:true}` aussitôt sur `#config` ; sur `#fill` avec une réponse en cours
  (`hasPendingFillAnswers`, respond.js), une question (Quitter sans envoyer / Annuler - pas
  d'« Enregistrer » : Form+ n'a aucun brouillon à garder) avant de répondre, `{ferme:false}` si
  la personne annule, réponse intacte. Même règle pour `ouvrir` un autre fichier de Form+ pendant
  qu'une réponse est en cours. 847 vérifications hors ligne (FR+EN, aucun avertissement) :
  `hasPendingFillAnswers` distingue `#fill` masqué/sans réponse/avec une réponse commencée.
  Vérifié aussi en conditions réelles (Playwright, le protocole `fermer` de GFS rejoué dans une
  iframe contre le vrai widget) : `{ferme:true}` immédiat sur `#config`, une vraie fenêtre de
  confirmation qui bloque la réponse à GFS tant que `#fill` a une réponse en cours, `{ferme:false}`
  sur Annuler avec la réponse intacte, `{ferme:true}` sur « Quitter sans envoyer ».
- 018 · faite · `6c79698` · ta politique de sécurité bloque l'eval du script de Grist. Le fichier
  que sert `docs.getgrist.com` s'évalue par `eval()` ; `poc/widget.html` ne l'autorisait pas
  (`EvalError: call to eval() blocked by CSP`, vu par le porteur le 04/11 dans le Grist de la
  DINUM - Form+ restait bloqué sur « Connexion à Grist… », jamais « prête »). `script-src` ajoute
  `'unsafe-eval'` (raison dans le commentaire au-dessus de la politique) et nomme l'adresse
  entière du script (`https://docs.getgrist.com/grist-plugin-api.js`), pas seulement son origine,
  comme GFS/Publipostage+/Automation+ (guide des apps, règle 11). Point 3 (en option) fait : 
  `isPluginApiReady()` (`plugin-loader.js`) vérifie `window.grist && typeof window.grist.ready
  === 'function'` avant de résoudre - `loadPluginApi()` résout maintenant `null` (chargé mais
  planté à l'exécution) plutôt que `true` à l'aveugle, et `main.js` l'affiche dans le diagnostic
  de l'écran « standalone » (nouveau `#diag-standalone`, `event: "pluginApiBroken"`) au lieu de
  planter en silence sur `grist.ready()`. `tests/grist-env/README.md` fait maintenant servir
  `grist-plugin-api.js` enveloppé dans `eval(...)`, pour que ce banc voie la même panne qu'un
  vrai `docs.getgrist.com` (le script d'un Grist Docker n'évalue rien). 844 vérifications hors
  ligne (FR+EN, aucun avertissement) : la CSP garde les deux éléments exigés, `isPluginApiReady`/
  `loadPluginApi` distinguent bien « planté » de « prêt ». Vérifié aussi en conditions réelles
  (Playwright, le script réellement enveloppé dans `eval(...)`, dans une iframe) : `grist.ready()`
  est bien appelé avec la CSP corrigée ; et, à l'inverse, un script qui plante vraiment à
  l'exécution fait maintenant afficher `#standalone` avec la cause visible dans son diagnostic,
  au lieu de rester bloqué sur « Connexion à Grist… ».
- 017 · faite · lue · `6c79b62` · le rejeu de l'ambiance avec ta vraie app. Rejeu confirmé (015 à
  `01ddd10`, 016 à `954483a`) : contraste 4,5:1 au moins tenu sur les 56 mesures de chaque passe
  (FR/EN × clair/sombre), aucune en échec ; aucune autre table/colonne/clé/bibliothèque/permission/
  adresse CSP de l'app n'a changé pour GFS. L'éclair des couleurs d'origine mesuré (66 à 100 ms
  avant l'ambiance, dans le labo de GFS) n'était pas une obligation du guide ("à toi d'en faire ce
  que tu veux") - retenu quand même, repris du mécanisme d'Automation+ : `main.js` pose
  `[data-gfs-pending]` sur `<html>` SEULEMENT dans GFS (`hostContract(location.search)` non nul,
  mesuré tout de suite, avant `Ambiance.start()`), `widget.css` cache le corps tant que l'attribut
  est là, et `main.js` le retire dès que `Ambiance.start().ready` se règle, ou après 2 s si GFS
  tarde ou que `kit/` manque ; jamais posé hors GFS, où rien n'attend. 836 vérifications hors
  ligne (FR+EN, aucun avertissement console) : `hostContract` ne déclenche le cache que sur une
  adresse GFS valide, la règle CSS cache bien le corps puis le relâche. Vérifié aussi en conditions
  réelles (Playwright, `?gfs=1` hors iframe) : l'attribut est bien posé puis retiré dès que
  l'ambiance se règle, jamais laissé en place.
- 016 · faite · `954483a` · suivre l'ambiance de GFS. Sous-module `kit` de `c0c8660` à `8afa569`
  (0.3.0 liens entre apps, 0.4.0 identité, 0.5.0 sélecteur de couleur, 0.6.0 l'ambiance).
  `Ambiance.start()` posé une fois dans `main.js`, à côté de `Theme.init`. Les feuilles de
  l'éditeur (`poc/css/widget.css`) lisent les jetons de forme (guide des apps, règle 15) avec leur
  valeur d'origine en repli (`var(--radius-md, 10px)`) : rayons (`--radius-md/-sm/-btn/-input/-pill`),
  trait des contrôles et cartes (`--bw`), ombre des panneaux et menus flottants (`--shadow-panel`,
  `--shadow-float`), bouton plein (`--fill`, un dégradé chez Pop), police/casse des titres et
  étiquettes (`--font-head`/`-label` et leurs compagnons, hors `--fs-head` qui écraserait la
  hiérarchie h1>h2>h3). **Jamais dans `#fill` ni `.pv-*`** : l'aperçu et l'écran du répondant
  gardent l'aspect dessiné par la personne, jamais celui de GFS (même principe que `--accent*` via
  `applyBranding`). Pas d'équivalent retenu ici : `--avatar-*`, `--bar-w`, `--stripe*` (aucun
  élément correspondant dans l'éditeur) ; 2 catégories de l'exception couleur (état, type) n'ont
  aucune occurrence en dur dans `widget.css` (déjà des jetons `--good`/`--danger-ink`), seule
  reste celle « ce que tu produis » (`#qrCanvas`, le QR code lui-même, doit rester blanc pur).
  829 vérifications hors ligne (FR+EN, aucun avertissement console) : le message d'exemple du kit
  (`kit/test/ambiance-exemple.json`) change bien le fond, une carte et le bouton plein, et les
  rend avec `null` ; un essai refuse toute couleur écrite en dur hors de cette unique exception.
  Vérifié aussi visuellement (Playwright, ambiance Pop, avant/après).
- 015 · faite · `01ddd10` · un lien public ne lit que les petites tables `FormPlus_Pub_*`. Depuis
  le 03/11, GFS refuse sans fenêtre toute autre table de l'app lue par un lien public -
  `FormPlus_Formulaires` en tête (elle garde `shareKey`/`formLink`/`publicUrl` de tous les
  formulaires). `isFormPlusOwnTable` (`grist-meta.js`) écarte les tables `FormPlus_…` des trois
  listes de `config-editor.js` qui offraient `listTables()` en entier : « Partir de zéro » > une
  table existante (`scratchExistingCombo`), la source d'une question « Choix depuis une table »
  et sa table de réception (`srcTable`/`writeTable`). Le préfixe `FormPlus_Pub_` reste intouché
  (contrat avec GFS). 820 vérifications hors ligne (FR+EN) : un essai par liste, qui échoue sur
  l'ancien code.
- 014 · faite · `f9dcb81` · ton site en ligne reste publié : `.nojekyll` à la racine, vérification
  à chaque lot. `.nojekyll` ajouté à la racine de `main` (sinon GitHub Pages passe tous les `.md`
  du dépôt par Jekyll avant publication, et une seule accolade double non fermée dans l'un d'eux
  ferait échouer la publication en silence). Les deux vérifications demandées ajoutées au
  protocole de test manuel (`tests/README.md`). Vérifié pour ce lot le 2026-11-02 : le run « pages
  build and deployment » du commit `f9dcb81` est vert (`run #90`,
  https://github.com/lombre33/FormPlus/actions/runs/41519501616) ; un détail de ce lot est bien en
  ligne (la nouvelle section de `tests/README.md` est servie telle quelle à
  `https://lombre33.github.io/FormPlus/tests/README.md`, et les clés `form.editor.sourceOnWidgetPage`
  / `form.editor.staleGateTitle` du lot précédent sont dans `poc/js/strings.js` en ligne). Form+
  n'affiche pas de numéro de version dans l'app ; faute de ce repère, cette vérification se fait en
  cherchant un détail du lot (texte, clé) directement dans un fichier servi par Pages.
- 013 · faite, avec une limite connue (point 2) · `df2dc1e` · les liens publics : un lien ne montre
  et n'ouvre que son formulaire.
  1. **Un lien ne montre que son formulaire.** Mesuré sur un vrai Grist (`tests/grist-env/`, une
     clé de partage réelle) : le lien d'un formulaire A rendait, via `refValues`, la `Definition`
     de **tous** les formulaires de `FormPlus_Formulaires` - `shareKey`, `formLink` et `publicUrl`
     compris, pour qui avait un seul lien. Cause : une colonne cachée `FormPlusDef` unique,
     partagée par tous les formulaires, vers la table partagée. Corrigé : chaque formulaire publié
     a maintenant sa propre table d'une seule ligne (`FormPlus_Pub_<vsId>`) et sa propre colonne
     cachée (`FormPlusDef_<vsId>`), jamais partagées - `refValues` ne peut plus contenir que la
     ligne de CE formulaire (`ensureRespondentDefinitionField`, `grist-meta.js`). Retire aussi tout
     autre champ-définition de Form+ hérité sur la section (un formulaire natif posé après coup sur
     une colonne héritée d'un autre formulaire, voir aussi 012 point 5 ci-dessous).
  2. **Une porte, sa table de réception.** Mesuré : une clé de partage ouvre l'écriture dans
     TOUTES les tables visées par une section de formulaire publiée sur SA page, pas seulement
     celle visée par le lien précis utilisé pour y entrer - jamais deux formulaires sur le même
     partage. Fait : « Partir de zéro » pose sa section sur une page TOUTE NEUVE
     (`createFormSectionOnNewPage`, jamais la page du widget ni celle d'un autre formulaire) ;
     coller un lien vers une page déjà gérée par un AUTRE formulaire FormPlus est refusé avant
     toute duplication (`otherManagedFormOnPage`). **Limite connue, pas encore corrigée** : coller
     le lien d'un formulaire natif déjà publié (`duplicateFormSection`) pose la copie sur la MÊME
     page que ce formulaire natif, en réutilisant sa clé déjà en place - le formulaire natif
     d'origine reste lui-même publié sur cette page, donc cette même clé ouvre aussi l'écriture
     dans sa table. Le corriger reviendrait à fermer le lien natif de la personne (son `UpdateRecord`
     sur `shareOptions` est le seul moyen disponible, `RemoveViewSection` n'étant pas un verbe que
     GFS laisse passer, voir point 7 de la 012) : question posée à la personne (carte de décision),
     réponse en attente à la date de cette page. Aucune table ne porte de colonne de gestion que le
     lien pourrait remplir sans la montrer (vrai par construction, rien à corriger).
  3. et 4. **Dire ce que le lien ouvre, refus = rien à moitié fait.** `generate()` est le seul
     endroit de l'app qui rend quelque chose de nouveau public (`duplicateFormSection` publie la
     copie tout de suite, sous la clé déjà en place) : une fenêtre y dit maintenant, avant de
     publier, la table qui reçoit des lignes (colonnes montrées et cachées) ; elle est posée AVANT
     toute duplication, donc un refus ne crée ni ne publie rien (rien à retirer). Pas encore fait
     pour la question « Choix depuis une table » qui écrit dans une AUTRE table
     (`ensureTableGate`, déjà appelée en cours d'édition d'un formulaire déjà publié) : cette
     fenêtre-là n'existe pas encore, seulement un comportement inchangé. Hors GFS (app seule,
     comme ici), cette fenêtre est la seule confirmation - pas facultative.
  5. **Une ligne reçue par un lien est un texte non fiable** : déjà le cas partout où une réponse
     est affichée (`esc()`, `config-editor.js`, testé - voir `formatResponseValue`) ; rien de
     nouveau à faire ici.
  6. **Documents déjà publiés** : rien n'est refermé sans la personne. Signalés au prochain
     enregistrement par le point 7 de la 012 ci-dessous (l'ancien portillon, pas ce point-ci) ;
     aucun autre mécanisme de signalement propre à la 013 pour l'instant.
  812 vérifications hors ligne, toujours vertes (FR+EN, aucun avertissement console), chacune
  échouant sur le code d'avant son correctif.
- 012 · faite (points 2, 3, 4, 5, 6, 7 ; 1 et 8 informationnels) · `16cf6b1` · ta page du 22/10,
  `c249c4a` mesuré dans GFS, six points à reprendre :
  1. Informationnel, rien à faire.
  2. **Le formulaire natif posé sur la page de TON widget : la ligne n'était jamais écrite**
     (« Partir de zéro », ou toute personne qui pose son widget à côté de son formulaire) - ajouter
     une section à une page recharge tous ses cadres de widgets personnalisés (comportement natif
     de Grist), avant que `saveConfig` n'ait écrit la ligne : chaque essai laissait une copie
     orpheline de plus, sans jamais rien enregistrer. Corrigé en détectant ce cas (`samePage`, déjà
     calculé par `findViewRefForSection`) et en refusant clairement AVANT toute duplication, plutôt
     que de laisser cet échec silencieux se reproduire (le même risque, pour « Partir de zéro »,
     est déjà fermé par la 013 point 2 : sa section part sur une page neuve, jamais celle du
     widget).
  3. **« Changer de formulaire source » disparaissait** : le bouton vivait dans le
     `<p data-i18n="form.settings.urlDesc">` de `widget.html`, vidé de tout contenu par
     `translateDom` (kit) une seconde après l'ouverture. Sorti dans son propre paragraphe, à côté.
  4. **« Nouveau »** : au tout premier chargement du cadre, `onOptions` (`main.js`) ne lisait pas
     `raison: 'nouveau'` de la porte "ouvrir" de GFS (`GfsLink.opening()`) et retombait sur le
     formulaire gardé ouvert (`GFS_OPEN_ROW_KEY`) ou `resolveMyDefinition()`, ambiguë dans GFS -
     corrigé, `raison: 'nouveau'` décide avant les deux. Cadre déjà ouvert : l'écran de départ
     s'affichait bien, mais l'éditeur du formulaire précédent restait affiché dessous
     (`showConfig()` ne cachait `#editor` que par le bouton du point 3) - `showConfig()` le cache
     maintenant lui-même par défaut, montré seulement si la section liée existe réellement.
  5. **Le champ caché du second formulaire restait visible** : déjà réglé par l'architecture de la
     013 point 1 (une colonne `FormPlusDef_<vsId>` propre à chaque formulaire ne peut plus être
     héritée d'un autre formulaire du même type sur la même table) ; la 013 point 1 retire en plus
     explicitement tout autre champ-définition hérité trouvé sur la section.
  6. **Le mode interne créait `FormPlus_Repondants` sans fenêtre d'accord**, contrairement à
     `FormPlus_Formulaires` - même fenêtre du kit ajoutée (`ensureRespondentProbeTable`,
     `grist-meta.js`).
  7. **Un document déjà touché par `038dd1b` peut garder le portillon que la 008 a retiré du
     code.** `ensureFormulairesTable` détecte maintenant une section Formulaire encore publiée
     visant `FormPlus_Formulaires` et, avec l'accord de la personne, la DÉPUBLIE (jamais ne la
     supprime : `RemoveViewSection` n'est pas un verbe que le courtier de GFS laisse passer,
     `contrats.md` 3.3 point 2 - le même `UpdateRecord` sur `shareOptions` qui publie une section
     ailleurs dans ce module suffit à faire disparaître le même risque). Un refus laisse la porte
     comme avant, sans bloquer le reste de `generate()`.
  8. Informationnel, rien à faire.
  812 vérifications hors ligne (même suite que la 013 ci-dessus), toujours vertes (FR+EN, aucun
  avertissement console), chacune échouant sur le code d'avant son correctif. Les points 2 à 6 se
  voyaient aussi dans l'app seule (hors GFS) : testés sans dépendre de GFS.
- 008 · faite · `c249c4a` · ta page du 21/10 (soir) répondue point par point :
  1. **L'enregistrement qui ne passait pas.** `ensureFormulairesTable`/`ensureTableGate` posait sa
     section de garde pour `FormPlus_Formulaires` sur la page du WIDGET (`widgetPage`), qui recharge
     ce cadre dès que la section est créée - exactement le fait que ta page donnait. Corrigé : la
     section de garde se pose maintenant sur la page du FORMULAIRE NATIF
     (`state.currentFormSection.viewRef`, le même repère déjà utilisé pour les tables secondaires
     d'une question "Choix depuis une table") - elle ne recharge jamais le cadre du widget, et
     réutilise la clé de partage déjà posée par le bouton natif "Publier" sur cette page (jamais
     republiée à la main). Un second "Générer" retrouve la section déjà publiée, n'en pose jamais
     une de plus.
  2. **Une ligne par formulaire.** `saveFormDefinition` retrouvait sa ligne par `IdSectionWidget`
     (la section qui héberge CE widget) : dans GFS, toutes les instances de Form+ partagent la
     MÊME section hôte, donc un second formulaire réécrivait la ligne du premier. Corrigé : la
     ligne se retrouve maintenant par `Definition.vsId` (propre à chaque formulaire, dans GFS comme
     hors GFS), mis en cache (`state.formRowVsId`/`formRowTitle`) pour ne rescanner la table qu'au
     changement de formulaire. `IdSectionWidget` reste écrit (diagnostic, repli hors GFS) mais ne
     sert plus à choisir la ligne. 2 formulaires faits dans GFS ont maintenant 2 lignes
     indépendantes, testé hors ligne (`tests.js`, groupe "une section hôte partagée (GFS) donne
     quand même une ligne par formulaire").
  3. **Les répondants, mesuré sur un vrai Grist** (Docker `gristlabs/grist:latest`, site d'équipe,
     document réel, formulaire publié, lien de partage réel - jamais grist-static) : ta lecture du
     code de Grist est confirmée à la lettre. Une session de partage anonyme qui lit
     `FormPlus_Formulaires` (table ou REST `/api/s/<clé>/tables/.../records`) reçoit `{"records":
     []}` quelle que soit la ligne existante (restreint à `rec.id==0`) ; la même session PEUT y
     ajouter une ligne quelconque, toutes colonnes, par un simple `POST .../records` - vérifié en
     injectant une ligne factice, relue ensuite côté concepteur. `ensureTableGate` sur cette table
     n'apportait donc aucun bénéfice (ni le 007 ni le 008 n'en ont profité), seulement ce risque :
     **retirée** (plus de portillon posé pour `FormPlus_Formulaires`). À la place,
     `ensureRespondentDefinitionField` (`grist-meta.js`) pose une colonne Référence CACHÉE
     (`FormPlusDef`) sur la table cible du formulaire natif, vers `FormPlus_Formulaires`, affichant
     sa colonne `Definition`, ajoutée comme champ masqué (`formIsHidden`) sur la section publiée -
     exactement le mécanisme déjà utilisé pour "Choix depuis une table" (`ensureChoiceField`), déjà
     éprouvé : Grist expose alors son `refValues` (les lignes de la table visée, avec leur colonne
     affichée) dans la réponse PUBLIQUE de `/forms/<clé>/<section>`, jamais par une lecture de table.
     Vérifié en conditions réelles sur le Grist Docker : un champ caché `FormPlusDef` posé à la main
     sur le formulaire natif `Reponses`, pointant vers `FormPlus_Formulaires` (affichage `Definition`)
     rend bien la Définition complète de la ligne existante, en anonyme, via ce `refValues` - la
     même chose que fait désormais `respond.js` (`renderFill`) pour construire l'écran répondant.
     La ligne qu'un visiteur ajouterait toujours (point 2 ci-dessus, `+C`) n'apparaît elle jamais
     dans l'explorateur de GFS pour autant qu'il liste par la Définition qu'il lit, pas par une
     simple présence de ligne - à confirmer de ton côté si l'explorateur affiche autre chose qu'une
     ligne avec Definition correctement formée.
  4. **Une ligne par formulaire, reste de ton point 4** : la porte "ouvrir" (consigne 010,
     `GfsLink.opening()`/`fichier.id`) donne maintenant l'identifiant de ligne à ouvrir - voir 010.
  8. **Rangement/renommage par les fichiers de GFS** : voir 009.
- 009 · faite · `c249c4a` · `saveFormDefinition` ne met `Nom` dans son lot que pour une ligne tout
  juste créée (`AddRecord`), ou quand le titre (`formTitle`) a changé dans Form+ depuis la dernière
  lecture ou écriture (`state.formRowTitle`, comparé à la ligne existante au premier enregistrement
  d'une session) ; sinon `Nom` reste hors du lot. Le choix pris en attendant (le plus prudent, comme
  ta page le proposait) : le nom donné dans GFS reste celui du fichier, distinct du titre affiché
  aux répondants - renommer dans GFS ne change donc rien à ce qu'ils voient.
- 010 · faite · `c249c4a` · sous-module `kit/` à `c0c8660`. `GfsLink` (`poc/js/main.js`,
  `poc/js/links.js`) :
  - **Ouverture au démarrage** : `GfsLink.opening()?.fichier.id` (l'identifiant d'une ligne de
    `FormPlus_Formulaires`) charge directement cette Définition (`loadDefinitionByRowId`,
    `grist-meta.js`) et ouvre l'éditeur sur ce formulaire, à la place de l'écran de départ habituel.
  - **Double-clic pendant que Form+ tourne déjà** : `GfsLink.onOpen`. Form+ enregistre à chaque
    champ (pas de bouton "Enregistrer") : jamais de question "modifications en attente", on ouvre
    directement le nouveau formulaire (ou l'écran de départ pour "Nouveau").
  - **La langue** : choix pris, `GfsLink.onLanguage(() => location.reload())` - un rechargement
    plutôt qu'une retraduction en direct, trop de texte de Form+ passant par `I18n.t()` en dehors
    de `translateDom()` (messages, fenêtres du kit) pour garantir une reprise fidèle sans revue
    exhaustive de tout le code. Le formulaire ouvert avant le rechargement se retrouve lui-même
    (`GfsLink.storageGet('formplus_open_row')`, posé à chaque ouverture/enregistrement), puisqu'un
    cadre rechargé n'a plus d'ouverture à donner.
  - **Le thème** : la bascule envoie aussi `GfsLink.storageSet('formplus_theme', Theme.choice ===
    'system' ? null : Theme.choice)` ; au démarrage, `GfsLink.storageGet('formplus_theme')` est
    appliqué par `Theme.set` avant tout le reste.
  - **La page** : `myPageFromReferrer()` (`links.js`) retombe sur `GfsLink.context()?.page` quand
    le référent ne la donne pas - un seul point de repli, utilisé par les trois fonctions qui en
    dépendaient déjà (`findMyWidgetPage`, `findViewRefForSection`, `findMySection`).
  - Non mesuré de notre côté (pas d'accès à un vrai GFS) : à toi de rejouer `run-form`/tes propres
    essais avec ce commit.
- 011 · faite · `c249c4a` · `GfsLink.onBar` (appelé aussi une fois au démarrage avec `GfsLink.bar()`)
  pose quatre variables CSS (`--gfs-bar-top/bottom/left/right`, `0px` par défaut) sur `<html>`, lues
  par `.wrap` (`widget.css`) - le conteneur commun aux trois écrans (concepteur, répondant, départ),
  pour un seul point d'ajustement. Barre en haut : `zone.y + zone.hauteur` de marge en plus en haut
  (pousse tout sous la barre, onglets compris). Barre en bas : `epaisseur` en plus en bas (le
  rembourrage existant, 60px, garde déjà de la marge au défilement, l'addition la préserve). Barre à
  gauche/droite : `epaisseur + 8px` de ce côté. `bar === null` (explorateur ouvert, ou l'app seule)
  remet les quatre à 0. Non mesuré de notre côté (pas d'accès à un vrai GFS pour rejouer
  `run-barre-apps`) : à vérifier aux quatre bords avec ce commit.

## Consignes (001-007)
- 001 · faite · `8a0bf20` · écarts à la 1.1 dès maintenant : règle 2 (config dans les réglages de
  la vue), règle 5 (`document.referrer`), règle 11 (aucune CSP) ; une ligne du guide corrigée
  (attribution `config-editor.js`/`grist-meta.js`) — reprise et complétée par la 003.
- 002 · faite · lue
- 003 · faite · lue
- 004 · faite · `196734d` · licence passée à la GPL 3.0 (empreinte `LICENSE` vérifiée)
- 005 · faite · `90958ac`…`952fe4c` · kit référencé et pleinement intégré : jetons de charte et
  fenêtres du kit sur tout le widget, thème délégué à `Theme`, traduction FR/EN complète de
  l'interface (designer et répondant) via `I18n`, `Dialogs` du kit à la place de `prompt()`/
  `confirm()`. Tests : 542/542 verts, rejoués en entier en `fr-FR` et en `en-US`
  (`.github/scripts/run-widget-tests.js`), et désormais mis en échec par tout `console.warn` (pas
  seulement `console.error`) pour attraper un double chargement du kit, une clé i18n inconnue,
  redéfinie ou manquante — exactement les risques listés par la 005. Vérification manuelle sur un
  vrai Grist local (écran répondant, thème clair/sombre, FR/EN, fenêtre 700×400) : rendu et bascule
  de thème corrects, zéro erreur/avertissement console, contre un vrai formulaire natif publié.
  L'écran concepteur (`#config`/`#editor`) reste hors de portée de cette vérification précise :
  ce bac à sable cloud bloque `docs.getgrist.com`, d'où `grist-plugin-api.js` est chargé — mais il
  est déjà couvert par les 542 tests automatisés (API Grist simulée, mêmes deux langues).
- 006 · faite · lue · GFS a relu et mesuré la 005 dans un vrai Grist (grist-static, écran
  concepteur inclus, 25 vérifications × 4 combinaisons thème/langue, aucun échec) : merci. Erreur
  de la 005 sur l'étiquette `v0.1.0` du kit corrigée par GFS (le dépôt n'en a pas, la référence
  reste le commit `54c48f3`, rien à bouger chez nous) — question retirée ci-dessous. Les deux
  dernières couleurs en dur de `widget.css` (`.toggle-thumb`, `.pv-q`) remplacées par
  `--shadow-card`/`--shadow-float` du kit, commit `39e0740`.
- 007 · faite · `038dd1b` · la définition de chaque formulaire vit maintenant dans une table
  du document, **`FormPlus_Formulaires`**, une ligne par formulaire, colonnes :
  - `Nom` (Text) — le titre du formulaire.
  - `TypeFormulaire` (Text) — toujours `formulaire` (le manifeste).
  - `DateModif` (DateTime) — horodatage de la dernière sauvegarde, en secondes.
  - `ModifiePar` (Text) — toujours `Form+` aujourd'hui : aucune méthode de l'API plugin ne rend
    l'identité de la personne connectée (vérifié dans `prototype/js/demo.js`,
    `prototype/labo/run-form.mjs` : même GFS n'a qu'un nom statique). Dès qu'un client du courtier
    l'expose (point 4 de la 007), cette colonne prendra la vraie identité.
  - `Definition` (Text) — la définition entière en JSON, ce que `persistOptions` mettait avant dans
    `customView.widgetOptions`. GFS ne lit que les quatre colonnes ci-dessus, celle-ci reste
    opaque pour lui. Exemple (formulaire d'inscription à 2 questions supplémentaires) :
    ```json
    {
      "formLink": "https://grist.exemple.org/o/equipe/forms/AbCdEf123456/18",
      "vsId": 42, "sourceVsId": 18, "viewRef": 9,
      "publicUrl": "https://grist.exemple.org/o/equipe/s/AbCdEf123456/p/9?style=singlePage",
      "formTitle": "Inscription à la formation", "formDescription": "",
      "questions": [
        { "id": "q1", "kind": "text", "label": "Allergie alimentaire", "writeTable": "Reponses", "writeCol": "Allergie" },
        { "id": "q2", "kind": "choice", "label": "Repas", "sourceTable": "Menus", "sourceCol": "Nom" }
      ]
    }
    ```
    `vsId` est l'id de la section de formulaire natif que FormPlus a dupliquée pour ce formulaire
    (déjà présent avant la 007) : c'est la clé de jointure réutilisée par les répondants (ci-dessous).
  - `IdSectionWidget` (Numeric) — colonne propre à Form+, au-delà des quatre que lit le manifeste
    (« si tu veux d'autres colonnes, dis-le dans ta page ») : l'id de la section PERSONNALISÉE qui
    héberge ce widget-ci (`parentKey='custom'`, jamais le formulaire natif). Sert uniquement à
    cette instance du widget pour retrouver sa propre ligne à la réouverture
    (`resolveMyDefinition`/`findMySection`, `grist-meta.js`), sans dépendre de
    `grist.onOptions()`/`getOptions()` (confirmés inopérants dans GFS par la mesure de la 007).
  - **Comment les répondants la lisent** : l'adresse publique donnée au répondant
    (`buildPublicUrl`) est une page Grist en session de partage (`/s/<clé>/p/<page>`) qui héberge CE
    MÊME widget — le répondant est donc, de son point de vue, "dans" le widget comme le
    concepteur, et `resolveMyDefinition()` (même mécanisme, même `IdSectionWidget`) lui sert
    directement sa Definition ; `ensureTableGate` (déjà utilisé pour toute autre table lue par une
    question "Choix depuis une table") ouvre la lecture de `FormPlus_Formulaires` à cette session
    de partage de la même façon. Pour le secours hors Grist (`#form=<lien>`,
    `poc/public-form.html`, pas de session Grist du tout) : `renderFill()` (`respond.js`) fait un
    `fetch` direct de l'API REST du partage (`<api>/tables/FormPlus_Formulaires/records`, la même
    déjà utilisée pour l'envoi des réponses) et retient la ligne dont `Definition.vsId` correspond
    au `vsId` du lien ouvert — avant la 007, ce secours n'affichait jamais les questions
    supplémentaires (écart connu de l'audit du 21 oct), c'est désormais corrigé.
    **Corrigé par la 008** : mesuré sur un vrai Grist, ni l'un ni l'autre de ces deux mécanismes ne
    fonctionnait (`ensureTableGate` n'ouvre pas la lecture d'une session de partage, seulement
    l'ajout) — voir la 008 ci-dessus pour ce qui les remplace.
  - **Aucune clé de réglage de vue** n'a été nécessaire (point 4 de la 007) : `IdSectionWidget`
    suffit, rien à déclarer côté GFS pour ce pas-ci.
  - Plus écrit : `persistOptions`, le marqueur de copie (`formplusDuplicate`/`formplusSource`,
    remplacé par une comparaison aux `Definition.vsId` déjà enregistrés, `fetchManagedVsIds`), la
    réparation (`#repair`, retirée du widget — `poc/repair_section_options.py` reste disponible en
    dehors de Grist pour un formulaire pas encore migré). Plus lu : `_grist_Shares`
    (`findExistingShareKey` retirée ; choisir un formulaire natif publié dans la liste affiche
    maintenant une consigne de copier son lien, au lieu d'une adresse reconstruite). Les
    formulaires faits avant la 007 restent lisibles (`options` toujours lu en repli,
    `resolveMyDefinition`) et migrent vers la table à leur prochain enregistrement, avec le même
    consentement que pour un document qui n'a encore aucun formulaire FormPlus.

## Changements qui touchent GFS
- 2026-11-02 · `df2dc1e`…`16cf6b1` (consignes 013 et 012, cette page) · la colonne Référence cachée
  `FormPlusDef` (apparue à la 008) n'existe plus : chaque formulaire publié a maintenant sa PROPRE
  table d'une seule ligne (`FormPlus_Pub_<vsId>`, type `Ref:FormPlus_Pub_<vsId>` affichant
  `Definition`) et sa PROPRE colonne cachée (`FormPlusDef_<vsId>`) sur sa table cible - jamais
  partagées entre formulaires (013, point 1). « Partir de zéro » pose désormais sa section de
  formulaire natif sur une page TOUTE NEUVE, plus jamais la page du widget (012, point 2 ; 013,
  point 2). Une nouvelle fenêtre d'accord apparaît quand `generate()` publie une copie d'un
  formulaire natif collé (013, points 3/4) et quand le mode interne s'active pour la première fois
  (`FormPlus_Repondants`, 012, point 6). Un document déjà touché par l'ancien portillon de
  `FormPlus_Formulaires` (`038dd1b`, retiré par la 008) se voit maintenant proposer de le
  dépublier, jamais de le supprimer (012, point 7).
- 2026-10-22 · `c249c4a` (consignes 008-011, cette page) · sous-module `kit/` à `c0c8660` (010) ;
  plus de section de garde (`ensureTableGate`) pour `FormPlus_Formulaires` (008) ; une colonne
  Référence cachée `FormPlusDef` apparaît désormais sur la table cible de CHAQUE formulaire natif
  géré par Form+ (type `Ref:FormPlus_Formulaires`, affichage `Definition`, champ masqué sur la
  section publiée) — purement un détail d'implémentation côté répondant (008, point 3), jamais lue
  ni écrite par Form+ lui-même en dehors de ce mécanisme, sans lien avec les colonnes que lit le
  manifeste.
- 2026-10-21 · `02be13c` (fusion `652b156`) · mode interne : réglage par formulaire + réservation
  par question, table `FormPlus_Repondants` (identité du répondant via `user.Email`, colonne à
  formule — capacité `formules` du contrat GFS, accord de la personne à la création), jamais
  utilisée pour le lien public anonyme.
- 2026-10-21 · `aa13d26` puis `85ac56d` · CSP de `widget.html` : `script-src` autorise à nouveau
  `https://docs.getgrist.com`, d'où `plugin-loader.js` fait venir le script d'API de Grist en repli
  dès que l'origine qui héberge le widget n'est pas dans sa liste blanche — régression qui bloquait
  Form+ sur toute instance auto-hébergée, GFS compris, corrigée le jour même.
- 2026-10-21 · `00ad9d5` · le lien public ne montre plus jamais l'écran de configuration à un
  visiteur externe réel (`main.js`).
- 2026-10-21 · `90958ac` · référence le kit commun `grist-factory-kit` en sous-module `kit/`, au
  commit `54c48f3` (pas d'étiquette `v0.1.0` réelle sur leur dépôt malgré la consigne 005, voir
  « Questions » ci-dessous) ; rien d'autre ne change, aucun fichier du kit copié dans `poc/`
- 2026-10-21 · `196734d` · licence du dépôt passée d'Apache-2.0 à GPL 3.0 (consigne 004)
- 2026-10-21 · `7f75d83`…`952fe4c` (consigne 005) · `kit/css/tokens.css` et `kit/css/windows.css`
  chargés dans `widget.html`, remplacent la palette propre de FormPlus ; `poc/js/theme.js` délègue
  l'état clair/sombre à `Theme` du kit (la couleur d'accent personnalisée reste posée sur `#fill`
  uniquement, jamais sur `<html>` — testé) ; tout le texte d'interface (designer et répondant) passe
  par `I18n` du kit (`poc/js/strings.js`, ~150 clés `form.*`) ; `window.prompt()`/`confirm()`
  remplacés par `Dialogs.prompt()`/`Dialogs.confirm()` du kit.
- 2026-10-21 · `39e0740` (consigne 006) · `.toggle-thumb` et `.pv-q` (`poc/css/widget.css`)
  passent de couleurs en dur à `--shadow-card`/`--shadow-float` du kit ; plus aucune couleur en dur
  dans `widget.css` hors `#qrCanvas`
- 2026-10-21 · `96cf415` · « Liste de références » ajoute une colonne RefList cachée
  (`ensureRefListField`, `FormPlus_srcL_<table>_<colonne>`) et y écrit
  `_grist_Tables_column.visibleCol`, comme pour un choix simple : sans cela la session de partage
  anonyme affiche l'identifiant numérique au lieu du libellé choisi.
- 2026-10-21 · `038dd1b` (consigne 007) · plus aucune écriture dans
  `_grist_Views_section.options` ni lecture de `_grist_Shares` : la définition de chaque
  formulaire vit dans la table du document `FormPlus_Formulaires` (une ligne par formulaire,
  colonnes et détail dans « Consignes » ci-dessus), créée avec l'accord de la personne (fenêtre du
  kit) et ouverte en lecture aux sessions de partage par `ensureTableGate`, déjà utilisé pour toute
  autre table lue par une question "Choix depuis une table".

## Questions pour GFS
(aucune en attente)

## Demandes à GFS
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  en attente de l'entrée de Form+ dans GFS (décision du porteur, consigne 006) ; d'ici là, le
  chargement autonome (`window.FORMPLUS_ENABLE_MAP`, unpkg) reste le mécanisme hors GFS
