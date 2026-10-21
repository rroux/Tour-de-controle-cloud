# Tour de contrôle CEP

Application web qui consolide les **comptes d'exploitation projet (modèle CEP V11-20, `.xlsm`)** déposés sur des partages de fichiers SMB : CA, marge et activité de tout le portefeuille, détail par projet, scan automatique planifié.

## Lancer l'application sur un PC Windows

1. Double-cliquer sur **`start.bat`**, à la racine du projet (`Tour de controle cloud\start.bat`, à côté du dossier `app`). Rien d'autre n'est à installer.
   - **Node.js** est recherché dans cet ordre :
     1. **Node.js déjà installé sur le PC**, en version 20 ou plus : dans le PATH ou dans `C:\Program Files\nodejs`.
     2. **Node.js portable** déjà téléchargé dans `runtime\node`.
     3. **Portail d'entreprise** : s'il est configuré dans `node-portail.cfg`, il s'ouvre sur la page Node.js. Cliquez sur **Installer** ; c'est le portail qui installe, sans droits administrateur. Le démarrage reprend tout seul dès que Node.js est installé, avec 15 minutes d'attente au plus. Appuyez sur **A** pour abandonner.
     4. **Téléchargement de Node.js 22.20.0 portable** dans `runtime\node`, en secours : aucun droit administrateur, empreinte SHA-256 officielle vérifiée, proxy de Windows utilisé.
   - Le script vérifie ensuite s'il existe une nouvelle version (voir **Mises à jour automatiques**), installe les dépendances (`npm install`) et compile l'interface.
   - Au premier lancement, il faut un accès à Internet ou au proxy de l'entreprise, une seule fois.
   - Le navigateur s'ouvre sur <http://localhost:3000>.
2. Laisser la fenêtre ouverte : la fermer arrête l'application et les scans planifiés.

Pour revenir à une installation propre de Node.js, supprimez le dossier `runtime\`. Il sera retéléchargé au lancement suivant.

Le fichier `node-portail.cfg` contient l'identifiant de l'application Node.js dans le Portail d'entreprise (`PORTAL_APP_ID`) et la durée maximale d'attente. Si `PORTAL_APP_ID` est vide, ce mode est ignoré.

Au premier lancement, une source **« Exemples (démo) »** pointe vers le dossier `demo/`. Ces 6 CEP contiennent des **données fictives** : leurs clients portent la mention « (exemple) ». Une fois vos sources configurées, désactivez ou supprimez cette source dans **Paramètres**, et retirez les codes `DEMO-…`.

### Mises à jour automatiques

À chaque lancement, avant de démarrer l'application, `start.bat` cherche une nouvelle version sur GitHub (étape [2/6]) :
- **Dossier installé depuis un ZIP** : le dernier commit de la branche `main` de [rroux/Tour-de-controle-cloud](https://github.com/rroux/Tour-de-controle-cloud) est comparé à la version installée (`app\.version`). Si elle est différente, l'archive de ce commit est téléchargée via le proxy de Windows, puis les fichiers de l'application sont remplacés. `start.bat` se relance alors tout seul avec la nouvelle version.
- **Dossier installé avec `git clone`** : `git pull --ff-only`, sauf si des fichiers suivis par git ont été modifiés sur le PC.
- **Dossier placé dans un autre dépôt git** (copie de développement) : rien n'est modifié, la mise à jour se fait avec `git pull`.

**Ce qui n'est jamais modifié** :
- `app\data` : sources, codes, projets déjà scannés, historique des scans, clé de chiffrement des mots de passe ;
- `app\logs`, `app\runtime` (Node.js portable), `app\node_modules`, `app\dist` ;
- les fichiers `.cfg` déjà présents (`update.cfg`, `node-portail.cfg`) : vos réglages sont conservés.

Les fichiers de code retirés de la nouvelle version (dans `client`, `server`, `scripts`, `vendor`, `demo`) sont supprimés.

Sans accès à GitHub, la version actuelle est lancée normalement : la mise à jour n'est jamais bloquante. Pour la désactiver, mettez `UPDATE_ENABLED=0` dans `app\update.cfg`. Ce fichier indique aussi le dépôt et la branche suivis.

**Après une mise à jour du code**, automatique ou par `git pull`, `start.bat` détecte ce qui a changé grâce à une empreinte des fichiers :
- s'il le faut, il réinstalle les dépendances (`package.json`, `package-lock.json`) ;
- s'il le faut, il recompile l'interface (dossier `client`).

Pour forcer les deux : `start.bat rebuild`.

## Paramétrer le scan

Onglet **Paramètres** :

1. **Où chercher** : ajouter une source avec son chemin.
   - Chemin UNC : `\\serveur\partage\dossier`. Un lecteur réseau (`Z:\CEP`) ou un dossier local fonctionnent aussi.
   - **Session Windows** (choix par défaut) : les CEP sont lus avec les droits de la session qui a lancé `start.bat`. Aucun domaine ni mot de passe n'est saisi ni enregistré.
   - **Compte de service** (domaine, compte, mot de passe) : seulement si la session n'a pas accès au partage. L'application ouvre alors la connexion avec `net use` le temps du scan.
   - Le bouton **Tester** indique le nombre de fichiers Excel visibles, le nombre de ceux qui portent un code et le compte Windows utilisé pour la lecture.
2. **Quels fichiers** : la liste des **codes d'identification**. Un fichier n'est lu que si **son nom contient l'un des codes** (majuscules et minuscules confondues). Seuls les `.xlsm` et `.xlsx` sont pris en compte ; les fichiers temporaires `~$…` sont exclus. Le champ « Tester un nom de fichier » montre si un nom serait retenu.
3. **Quand** : tous les jours, en jours ouvrés, toutes les heures ou manuellement. Par défaut, seuls les fichiers modifiés depuis le dernier scan sont relus.
4. **Objectifs de marge** (taux de marge sur CA net) :
   - **par projet** : le taux de la trajectoire initiale du CEP ; l'objectif **par défaut** (25 %) ne sert qu'aux CEP sans trajectoire enregistrée ;
   - **global**, pour la Synthèse et les portefeuilles : **automatique** (objectifs des projets pondérés par leur CA net de l'année) ou **fixé**.

Le bouton **Scanner maintenant** lance un scan immédiat. L'**historique des scans** détaille les fichiers retenus, ignorés et en erreur.

### Règles de consolidation

- **Identité d'un projet** : la cellule CODE PROJET du Sommaire (`Sommaire!C6`) si elle est renseignée, sinon le début du nom de fichier avant `_CEP`.
- **Plusieurs fichiers pour un même projet** (copies, anciennes versions) : le plus récemment modifié est utilisé, et un point d'attention « Doublon » est affiché.
- **Réalisé ou prévisionnel** : un mois est réalisé s'il est antérieur ou égal au **mois de référence** du CEP (`Sommaire!C21`), prévisionnel au-delà.
- **Périodes** :
  - **Réalisé** : de janvier de l'exercice jusqu'au mois de référence.
  - **Année complète** : les 12 mois de l'exercice, réalisé et prévisionnel.
  - Pas de vision « fin d'affaire » : les écrans restent sur le mois et l'année.
- **Taux de marge** : marge sur CA net, (CA net − coûts) / CA net, la base de la trajectoire initiale.
- **Objectif d'un projet** : taux de marge de la trajectoire initiale sur l'exercice (sur toute la trajectoire si l'exercice n'y figure pas) ; à défaut, l'objectif par défaut des Paramètres.
- **Objectif global** : fixé dans les Paramètres, ou moyenne des objectifs des projets pondérée par leur CA net de l'exercice.
  - **Marge critique** : sous la moitié de l'objectif du projet.
  - **À surveiller** : sous l'objectif du projet.
- **Reste à faire** : somme des jours prévus dans l'onglet Activité (zone prévisionnel) sur les mois après le mois de référence.
- **Gain IA** : ligne `ZZZ_GAIN_IA` de l'onglet Activité (profil de l'onglet Équipe) : saisie du réalisé jusqu'au mois de référence (ou du prévisionnel si le réalisé est vide), prévisionnel ensuite. Le signe saisi n'a pas d'importance.
- **Comparaison de deux années** (Synthèse) : « Comparer à » superpose une autre année sur le CA mensuel et le taux de marge.
- **Contrôle MAJ** : pour le mois contrôlé (par défaut le mois précédent), un CEP est **à jour** quand tous ces points sont conformes :
  - mois de référence au moins égal au mois contrôlé ;
  - date de MAJ du Sommaire au plus tôt 7 jours avant la fin du mois contrôlé ;
  - jours Pilot du mois saisis ;
  - CA net ou coûts du mois renseignés ;
  - facturation réelle saisie si une facturation était prévue ;
  - prévisionnel renseigné après le mois tant que le projet n'est pas terminé ;
  - trajectoire initiale enregistrée.

  Sinon il est **incomplet**, ou **non mis à jour** si son mois de référence est antérieur au mois contrôlé. Les deux cas apparaissent aussi dans les points d'attention.
- **Réel contre budget** (Portefeuille DP, en taux de marge ; fiche projet) : le budget est la **trajectoire initiale** de l'onglet Projection (« CA NET mois » et « Coûts mois »). La comparaison se fait sur la même base : CA net, et marge = CA net − coûts. Le réel est le réalisé jusqu'au mois de référence de chaque CEP, puis le prévisionnel du CEP. Un CEP sans trajectoire initiale enregistrée est affiché sans budget.
- **Portefeuille DP** : les projets sont regroupés selon le directeur de projet du Sommaire (`SOM_DP`). La liste des DP, dans le rail de gauche, filtre aussi la Synthèse, les Projets et l'Activité.

## Données lues dans chaque CEP

L'extraction s'appuie sur les **noms définis** du modèle V11-20. Elle résiste ainsi à l'ajout de lignes ou de colonnes dans le classeur.

| Écran | Source dans le CEP |
|---|---|
| Fiche projet, indicateurs | `SOM_*` (Sommaire) : client, projet, DP, CP, dates, TJM, PRJ, date de MAJ, mois de référence |
| CA, coûts, marge mensuels | `CEP_Zone_CEP` : salaires, achats, sous-traitance, total charges, CA brut, RFA, CA net, marges |
| Activité | `ACT_Zone_Equipe_Conso_Pilot` et `ACT_Zone_Equipe_Conso_Prev` : jours par collaborateur et par mois, reste à faire, ligne `ZZZ_GAIN_IA` (gain IA) |
| Bons de commande | `BON_Zone_BC_Presta` |
| Facturation | `FAC_Zone_Theorique_Instant`, `FAC_Zone_Reel_Instant` |
| Budget (trajectoire initiale) | `BUD_Zone_Trajectoire_Initiale` (onglet Projection) : conso, CA net et coûts par mois ; `BUD_Date_Enreg_Trajectoire_Initiale` |
| PAM | onglet PAM : seules les actions réellement saisies sont reprises |

L'application lit les **valeurs calculées enregistrées par Excel**. Un CEP doit donc avoir été enregistré dans Excel après sa dernière modification, ce qui est le fonctionnement normal.

## Où sont stockées les données

Tout est dans le dossier `data/`, créé au premier lancement :

| Fichier | Contenu |
|---|---|
| `config.json` | sources, codes, planification |
| `projects.json` | données extraites des CEP |
| `scans.json` | historique des 50 derniers scans |
| `secret.key` | clé de chiffrement des mots de passe SMB |

Pour repartir de zéro, arrêtez l'application et supprimez `data/`.

## Sécurité

- L'application n'écoute que sur **ce PC** (`127.0.0.1`). Pour l'ouvrir au réseau, lancez-la avec `set HOST=0.0.0.0` avant `start.bat`. Il n'y a **pas d'authentification** : à réserver à un réseau de confiance, en attendant la version Docker.
- Les mots de passe SMB sont chiffrés en AES-256-GCM avec une clé propre au poste (`data/secret.key`). Ils ne sont jamais renvoyés au navigateur. Protégez le dossier `data/`.
- Pendant un scan avec compte de service, le mot de passe est transmis à `net use` en ligne de commande, ce qui le rend brièvement visible dans la liste des processus du poste. Sur un poste partagé, préférez la session Windows (aucun compte saisi).

## Dépannage

### Savoir si le lancement fonctionne

`start.bat` affiche chaque étape suivie de **OK** ou **ECHEC** :

```
[1/5] Dossier de l'application ...... OK
[2/5] Node.js ....................... OK
        Version v22.20.0 : C:\...\runtime\node\node.exe
[3/5] Dependances npm ............... a jour
[4/5] Interface web ................. a jour
[5/5] Serveur ....................... demarrage, le navigateur s'ouvrira tout seul.

  OK  Application démarrée : http://localhost:3000
```

En cas d'échec, la fenêtre reste ouverte. Elle affiche le détail de l'erreur et les causes probables : proxy, PowerShell bloqué, AppLocker. Le navigateur ne s'ouvre qu'une fois le serveur réellement démarré.

Après un échec, **un diagnostic du poste est lancé automatiquement**. Il vérifie le poste sans rien modifier et affiche une ligne OK, ATTENTION ou ECHEC par point, puis un bilan :

- droits, dossier, Node.js (portable, ou installé sur le PC) ;
- AppLocker sur `node.exe` ;
- Portail d'entreprise ;
- scripts PowerShell autorisés ;
- accès à nodejs.org ;
- registre npm joignable (`npm ping`) ;
- port libre.

Pour lancer le diagnostic seul, sans démarrer l'application, ouvrez une invite de commandes à la racine du projet et tapez `start.bat diagnostic`.

| Fichier | Contenu |
|---|---|
| `app\logs\start.log` | Journal du dernier lancement : chaque étape et sa sortie complète. Le lancement précédent est dans `start.precedent.log`. |
| `app\logs\server.log` | Journal horodaté du serveur : démarrage, scans, erreurs. |
| `app\logs\diagnostic.txt` | Rapport du dernier diagnostic du poste. |

En cas de problème, transmettez `start.log` et `diagnostic.txt`. L'adresse du proxy npm n'est jamais recopiée dans le rapport, car elle peut contenir un mot de passe.

### Messages fréquents

| Message | Que faire |
|---|---|
| `Dossier inaccessible … EACCES` ou `EPERM` | Le compte n'a pas le droit de lecture sur le dossier. |
| `Dossier inaccessible … ENOENT` | Chemin incorrect, ou partage non joignable (VPN ?). |
| « Avertissement de sécurité… Voulez-vous exécuter …\update.ps1 ? » | Fichiers extraits d'un ZIP téléchargé, marqués « provenant d'Internet », et stratégie PowerShell imposée par l'entreprise. Répondez **O** une fois : à partir de cette version, `start.bat` retire cette marque des fichiers de l'application au démarrage. Vous pouvez aussi, avant d'extraire le ZIP, ouvrir ses Propriétés et cocher **Débloquer**. |
| Erreur 1219 lors de la connexion | Une connexion existe déjà vers ce serveur avec d'autres identifiants. L'application tente quand même la lecture. Sinon, laissez le compte vide pour utiliser la session Windows, ou fermez la connexion existante avec `net use \\serveur\partage /delete`. |
| « structure d'un CEP introuvable » | Le fichier porte un code mais n'est pas un CEP. Rendez le code plus précis. |
| Port 3000 déjà utilisé | `set PORT=3010` puis `start.bat`. |

## Développement

```
npm install
npm run dev          # API sur http://127.0.0.1:3000 (rechargement automatique)
npm run dev:client   # interface sur http://localhost:5173 (proxy vers l'API)
npm run build        # compile l'interface dans dist/
```

Organisation du code :

- `server/` : Express ; `cepParser.js` (extraction), `scanner.js` (scan et consolidation), `files.js` (accès SMB), `scheduler.js`.
- `client/` : React et Vite ; les vues sont dans `client/src/views/`, la logique de consolidation dans `client/src/model.js`.
- `vendor/xlsx-0.20.3.tgz` : SheetJS, la bibliothèque de lecture Excel, embarquée car cette version n'est pas publiée sur npm.
- `../start.bat` (racine du projet) : lancement avec suivi des étapes, réinstallation et recompilation automatiques, diagnostic du poste intégré.
- `scripts/build-state.mjs` : empreintes des dépendances et des sources, pour ne réinstaller ou recompiler que si nécessaire.
- `node-portail.cfg` : identifiant de Node.js dans le Portail d'entreprise.
- `server/log.js` : journal du serveur dans `logs/server.log`.
- `scripts/use-node.bat` et `scripts/install-node.ps1` : choisissent Node.js (PC, portable, Portail d'entreprise) et téléchargent la version portable si besoin.
- `scripts/make_demo.py` : régénère les CEP d'exemple à partir du modèle (`python scripts/make_demo.py <modele.xlsm> demo`).

### Passage à Docker, plus tard

Le code est prêt pour ce passage :

- les variables `PORT`, `HOST` et `CEP_DATA_DIR` (dossier des données) se configurent par l'environnement ;
- hors Windows, `net use` n'est pas appelé : les partages SMB seront montés dans le conteneur (volume CIFS), et chaque source pointera vers son point de montage.
