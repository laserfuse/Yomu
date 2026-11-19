# ![Yomu](src/assets/yomu-sidebar-logo.png)

**Ta bibliothèque de mangas et de manhwas, directement sur ton PC.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Windows-application%20locale-0078D4)](https://www.microsoft.com/windows)

Yomu est une application Windows qui permet de ranger et de lire tes mangas et manhwas depuis un dossier local. Tes fichiers restent sur ton ordinateur : aucune synchronisation entre appareils n’est proposée.

## Licence

Le contenu original de ce dépôt est sous licence [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Cette licence n’inclut pas les dépendances tierces ni les fichiers personnels importés dans Yomu. Avant de réutiliser le code dans un autre projet ou de le distribuer, vérifie que les conditions de cette licence, notamment la restriction non commerciale, conviennent à ton usage. Vérifie aussi les licences propres aux dépendances.

## Utilisation de l’IA

De l’intelligence artificielle a été utilisée lors du développement de ce projet. Si cela vous dérange ou vous empêche d’utiliser cet outil, j’en suis désolé.

## Fonctionnalités

- **Bibliothèque personnelle** : crée des collections avec un titre, une couverture, un type et un statut de lecture.
- **Formats pris en charge** : lis tes chapitres PDF, CBZ et EPUB dans l’application.
- **Organisation** : recherche et filtre tes collections, trie tes chapitres et choisis dans les paramètres d’afficher les catégories françaises et anglaises ou une seule. Masquer une catégorie ne supprime aucun chapitre. Dans les collections Manga, la liste affiche le nombre de pages de chaque chapitre PDF/CBZ et le total ; les EPUB ne sont pas comptés car leur pagination varie selon l’affichage.
- **Langue de l’interface** : choisis le français ou l’anglais dans les paramètres. Le choix est mémorisé et indépendant des catégories de langue des chapitres.
- **Import, export et sauvegarde** : ajoute des fichiers de chapitres, importe récursivement un dossier ou dépose des fichiers PDF, CBZ et EPUB sur une collection. Les doublons exacts sont ignorés. Tu peux transférer une collection avec une archive ZIP Yomu ou sauvegarder/restaurer toute la bibliothèque.
- **Lecture personnalisée** : passe au chapitre précédent ou suivant, active la double page gauche-à-droite pour les mangas, profite du plein écran et, pour les PDF, ajuste le zoom ou verrouille-le pour toute une collection.
- **Mises à jour** : consulte la disponibilité d’une nouvelle version depuis les paramètres et choisis quand la télécharger et l’installer.

## Prise en main

1. Lance Yomu : une bibliothèque est créée automatiquement dans les données de l’application.
2. Crée une collection et choisis son type : **Manga** ou **Manhwa**.
3. Ouvre la collection, clique sur **Ajouter des chapitres** ou **Importer un dossier**, puis choisis leur langue. Tu peux aussi déposer des fichiers PDF, CBZ ou EPUB sur la page de la collection.
4. Sélectionne un chapitre pour commencer la lecture.

Les fichiers importés sont copiés dans ta bibliothèque : les originaux ne sont pas modifiés. L’import d’un dossier parcourt aussi ses sous-dossiers et ne retient que les fichiers PDF, CBZ et EPUB. Lors de l’ajout de chapitres à une collection, les fichiers au contenu identique à un chapitre déjà présent ou à un autre fichier de la sélection sont ignorés, même si leurs noms diffèrent ; le résumé indique le nombre de doublons ignorés. Cette détection s’applique à l’ajout de fichiers, de dossiers et au glisser-déposer, pas à l’import ZIP complet, qui crée une nouvelle collection avec de nouveaux identifiants. Dans les paramètres, changer de dossier permet de copier la bibliothèque, de la déplacer après vérification, ou de changer le chemin sans transfert. Un transfert exige une destination vide ; les fichiers existants ne sont jamais fusionnés ni écrasés.

Dans **Paramètres > Sauvegarde complète**, **Sauvegarder la bibliothèque** crée une archive ZIP de toutes les données du dossier de bibliothèque, avec validation SHA-256. Pour restaurer, choisis cette archive puis un nouveau dossier vide. Yomu vérifie chaque fichier avant d’activer ce dossier ; les collections, identifiants et positions de lecture sont conservés, et la bibliothèque actuelle reste intacte.

Par défaut, la bibliothèque de l’application installée se trouve dans `%APPDATA%\yomu-installed\Bibliotheque` sur Windows. Le chemin exact est affiché dans les paramètres, avec un bouton pour ouvrir le dossier. Si tu utilisais déjà une bibliothèque avec ce profil, Yomu conserve son emplacement. Si ce dossier devient introuvable, reconnecte-le ou sélectionne un autre dossier.

> **Attention :** supprimer une collection supprime définitivement son dossier et tous les fichiers qu’il contient. Les fichiers d’origine situés ailleurs ne sont pas touchés.

## Lecture et raccourcis

| Type de collection | Format | Navigation |
| --- | --- | --- |
| Manga | PDF, CBZ, EPUB | Page par page ou double page avec les boutons ou **← / →** |
| Manhwa | PDF | Défilement vertical, notamment **↑ / ↓** |
| Manhwa | CBZ, EPUB | Page par page avec **↑ / ↓** |

Les raccourcis de navigation et de retour à la bibliothèque sont affichés et configurables dans **Paramètres > Raccourcis clavier**. Les réglages sont mémorisés dans le profil Yomu ; **Rétablir les raccourcis par défaut** restaure les touches ci-dessus et **Échap**.

Pour une collection **Manga**, le bouton **Double page** du lecteur active la lecture gauche-à-droite ; le réglage est désactivé par défaut et n’est pas mémorisé. En PDF et CBZ, la première page reste seule, puis les pages sont affichées par paires. Pour les EPUB, Yomu utilise la pagination double et force la direction gauche-à-droite pendant l’activation du mode.

Dans un PDF, utilise les commandes du lecteur ou **Ctrl + molette** pour régler le zoom. Le cadenas permet de mémoriser le zoom pour les PDF de la collection ; il reste enregistré après un redémarrage.

Yomu reprend à la dernière page enregistrée (ou à la position de lecture pour un EPUB). Pour un EPUB, le CFI enregistré est vérifié dans le contenu du chapitre ; s’il ne se résout plus exactement, la reprise retombe sur le pourcentage de progression. Pour les chapitres lus avant cette fonctionnalité, la reprise est approximée à partir du pourcentage existant lorsque le format le permet. Modifier manuellement la progression réinitialise la position enregistrée et utilise ce pourcentage pour la prochaine ouverture.

## Mises à jour

Dans **Paramètres > Mises à jour**, tu peux vérifier manuellement si Yomu est à jour. La vérification automatique au démarrage est désactivée par défaut ; tu peux l’activer ou la désactiver à tout moment. Une vérification contacte GitHub et nécessite une connexion Internet. Une version disponible est signalée dans l’application.

Le téléchargement ne commence que lorsque tu cliques sur **Télécharger la mise à jour**. Une fois terminé, clique sur **Installer et redémarrer** pour fermer Yomu et lancer l’installation. Fermer simplement Yomu n’installe pas la mise à jour. Ces fonctions sont disponibles dans l’application Windows installée, pas en mode développement. Une version de Yomu antérieure à cette fonctionnalité doit d’abord être mise à jour manuellement.

## Feuille de route

### Terminé

#### v0.0.0 - Base du projet
- [x] Projet Electron, React, TypeScript et Vite
- [x] Interface en français, simple et inspirée de Modrinth
- [x] Bibliothèque personnelle de collections (titre, couverture, type, statut de lecture)
- [x] Lecture des chapitres PDF, CBZ et EPUB dans l'application
- [x] Recherche et filtres des collections
- [x] Tri des chapitres et indication de leur langue (français ou anglais)
- [x] Ajout de chapitres depuis le PC (fichiers copiés, originaux non modifiés)
- [x] Import et export d'une collection complète en archive ZIP Yomu
- [x] Chapitre précédent/suivant, plein écran
- [x] Zoom PDF réglable et verrouillable pour toute une collection
- [x] Licence CC BY-NC 4.0 et README

#### Entre v0.0.0 et v0.0.1
- [x] Séparation des profils de développement et de l'application installée
- [x] Premier lancement de l'application installée fiabilisé

#### v0.0.1
- [x] Mises à jour GitHub avec electron-updater (vérification manuelle ou automatique au démarrage, désactivée par défaut)
- [x] Téléchargement et installation uniquement après clic de l'utilisateur
- [x] Enregistrement et reprise de la position de lecture (page PDF/CBZ, CFI EPUB)
- [x] Modification manuelle de la progression
- [x] Progression PDF Manhwa basée sur la page au centre de la fenêtre
- [x] Conservation de la position dans les métadonnées et les imports/exports ZIP
- [x] Affichage des erreurs d'enregistrement dans le lecteur
- [x] Protection contre les retours asynchrones périmés lors des changements rapides de chapitre
- [x] Sérialisation des écritures par collection
- [x] Dossier de bibliothèque introuvable : pas de remplacement silencieux
- [x] Génération de l'installateur Windows

#### v0.0.2
- [x] Version actuelle affichée dans la carte Mises à jour (et retirée de la carte Informations)
- [x] Carte Mises à jour réorganisée
- [x] Version lue depuis l'état Electron (plus de valeur codée en dur)
- [x] Test réel de mise à jour v0.0.1 vers v0.0.2

#### v0.0.3
- [x] Version du projet portée à 0.0.3
- [x] Nom d'installateur Windows sans espaces, vérifié par un test
- [x] Logo latéral et icône de l'application intégrés
- [x] Reconnexion guidée d'une bibliothèque introuvable, avec option de choisir un autre dossier
- [x] Sérialisation des écritures de collection entre plusieurs processus
- [x] Confirmation explicite avant la suppression définitive d'une collection
- [x] Reprise PDF Manhwa à la position relative exacte dans la page
- [x] Mises à jour : notes de version, progression visuelle et messages utiles en cas d'erreur réseau ou de limite GitHub
- [x] Erreurs du lecteur clarifiées, avec détails techniques et retour à la bibliothèque
- [x] Import ZIP : résumé des éléments ajoutés, ignorés et en erreur
- [x] Tri des collections par date, titre, nombre de chapitres ou progression moyenne
- [x] Réglage global des catégories Français/Anglais, masquées sans suppression des chapitres
- [x] Interface en français ou en anglais, avec un choix mémorisé indépendamment des catégories de langue des chapitres
- [x] Configuration TypeScript Electron détectée par VS Code pour les types Node
- [x] Test E2E avec profil temporaire : lecture PDF, erreurs du lecteur, import ZIP, visibilité des catégories et changement de langue de l’interface

#### v0.0.4 - Terminée

- [x] Version du projet portée à 0.0.4.
- [x] Reprise EPUB renforcée : vérification du CFI enregistré et repli sur le pourcentage si la position ne se résout pas exactement.
- [x] Lecture Manga en double page gauche-à-droite, désactivée par défaut et non mémorisée : couverture seule puis paires en PDF/CBZ ; pagination native et direction gauche-à-droite forcée en EPUB.
- [x] Nombre exact de pages PDF/CBZ par chapitre Manga et total de la collection ; les EPUB sont exclus car leur pagination dépend de l’affichage.
- [x] Copie ou déplacement sécurisé de la bibliothèque, avec vérification de la copie et refus des destinations non vides ou imbriquées.
- [x] Raccourcis de lecture affichés et configurables dans les paramètres, avec valeurs par défaut et restauration.
- [x] Doublons détectés par SHA-256 lors de l’ajout de chapitres, avec résumé du nombre ignoré.
- [x] Import récursif de dossiers et glisser-déposer de fichiers PDF, CBZ et EPUB. La détection des doublons s’applique à ces ajouts, pas à l’import ZIP complet qui crée une nouvelle collection.
- [x] Sauvegarde complète de la bibliothèque en ZIP avec manifeste SHA-256 et restauration vérifiée dans un nouveau dossier vide, sans supprimer la bibliothèque actuelle.
- [x] Parcours E2E des principales nouveautés avec profils temporaires et fichiers fictifs.
- [x] Validation : build desktop, lint et 15 scripts de test réussis (52 tests).

Limite connue, non reproduite et non corrigée dans cette version :
- [ ] Certains EPUB peuvent reprendre à une position approximative malgré un CFI apparemment valide. Le test E2E vérifie le même paragraphe visible avant et après réouverture d’un EPUB fictif à trois sections, mais ne reproduit pas le cas signalé.

### À faire

#### Options à finir ou à peaufiner
- [ ] Les versions de Yomu antérieures au système de mise à jour doivent être mises à jour manuellement (à documenter dans les notes de release)
- [ ] Signature Windows reportée : elle nécessite un certificat ou service payant et est exclue du périmètre prévu

### Futures options

#### Lecture
- [ ] Marque-pages et notes sur une page
- [ ] Réglages de lecture EPUB (police, taille, interligne, thème)
- [ ] Ajustement de l'image des CBZ : largeur, hauteur, taille d'origine (le zoom existe déjà pour les PDF)
- [ ] Préchargement des pages suivantes pour une lecture plus fluide
- [ ] Mode lecture continue d'un chapitre à l'autre
- [ ] Historique de lecture plus complet (une carte « Continuer la lecture » existe déjà sur l'accueil)

#### Bibliothèque
- [ ] Étiquettes et genres personnalisés
- [ ] Favoris et listes personnalisées
- [ ] Statistiques de lecture (chapitres lus, temps passé)
- [ ] Prise en charge d'autres formats (CBR, dossiers d'images) ; aujourd'hui : PDF, CBZ, EPUB
- [ ] Manhwa : navigation continue aussi pour CBZ et EPUB (aujourd'hui page par page, le défilement vertical est réservé aux PDF)
- [ ] Renommage automatique des chapitres (le tri numérique est déjà pris en charge)

#### Interface et application
- [ ] Thème clair et choix de la couleur d'accent
- [ ] Synchronisation optionnelle entre appareils (aujourd'hui : bibliothèque 100 % locale, transfert par ZIP uniquement)
- [ ] Choix du canal de mise à jour (stable ou préversion)
- [ ] Notification de mise à jour au démarrage sans vérification automatique forcée

## Développement

### Prérequis

- Windows (Yomu est une application de bureau Windows)
- Git pour récupérer le dépôt
- Node.js et npm
- Une connexion Internet pour installer les dépendances

Le dépôt ne déclare pas de version minimale Node.js/npm dans `package.json`. Versions présentes dans l’environnement de développement utilisé pour cette documentation : Node.js 24.19.0 et npm 12.0.2 ; elles ne constituent pas une garantie de compatibilité minimale.

### Installer et lancer en développement

Dans PowerShell, récupère le projet puis installe ses dépendances :

```powershell
git clone https://github.com/laserfuse/Yomu.git
cd Yomu
npm.cmd install
```

Pour lancer l’application :

```powershell
npm.cmd run desktop:dev
```

Cette commande compile le processus Electron, démarre le serveur Vite sur `127.0.0.1:5175`, puis ouvre Yomu. Le processus renderer affiche l’interface React ; le processus principal Electron gère notamment les fichiers, les fenêtres de dialogue et les mises à jour. Le preload (`electron/preload.cjs`) expose au renderer une API limitée, qui communique avec Electron par IPC.

### Architecture

Yomu est une application Electron à deux processus. Le renderer est l’interface React exécutée dans Chromium ; le processus principal Electron s’occupe des accès au système et des fonctions propres à l’application. Le renderer n’accède pas directement aux API Node.js :

```text
Interface React (src/)
        ↓ window.yomu
Preload (electron/preload.cjs) — API exposée et appels IPC
        ↓
Processus principal (electron/main.ts) — validation et orchestration
        ↓
Modules métier (electron/) — bibliothèque, imports, sauvegardes, réglages…
        ↓
Fichiers locaux — bibliothèque et préférences
```

Le parcours d’une action suit ce chemin dans les deux sens : l’interface appelle une méthode de `window.yomu`, le preload transmet la demande par IPC, puis le processus principal la traite et renvoie le résultat. `src/electron.d.ts` décrit les types de cette API côté interface.

- **Interface (`src/`)** : `App.tsx` gère les écrans de la bibliothèque et les paramètres ; `Reader.tsx` affiche les chapitres PDF, CBZ et EPUB. La logique de présentation et les types des collections sont séparés dans les modules voisins.
- **Processus principal (`electron/`)** : `main.ts` crée la fenêtre, reçoit les appels IPC et coordonne les opérations. Les modules spécialisés gèrent notamment l’import, les archives ZIP, la sauvegarde/restauration, les transferts de bibliothèque, les verrous d’écriture et les préférences.
- **Données** : la bibliothèque est stockée sous forme de fichiers et de métadonnées dans le dossier choisi par l’utilisateur, sans serveur ni base de données distante. Les préférences de l’application sont enregistrées séparément dans le profil Electron.
- **Tests (`tests/`)** : tests Node.js des modules métier et test E2E de l’application avec des données et un profil temporaires.

`npm.cmd run build:desktop` compile l’interface vers `dist/` et le processus principal vers `dist-electron/`. En développement, Electron charge le serveur Vite ; une application compilée charge les fichiers générés dans `dist/`.

En développement, Yomu utilise le profil `%APPDATA%\yomu`. L’application installée utilise un profil distinct, `%APPDATA%\yomu-installed`, et sa bibliothèque par défaut se trouve dans `%APPDATA%\yomu-installed\Bibliotheque`. Le lancement en développement peut donc accéder à la bibliothèque configurée dans le profil de développement.

Le test E2E crée lui-même un profil et des fichiers temporaires, puis les nettoie. N’utilise pas ta bibliothèque personnelle pour les essais manuels destructifs. Le serveur de développement réserve le port `5175` ; si ce port est déjà utilisé, arrête l’instance de développement précédente avant de relancer la commande.

### Vérifications

Pour compiler et vérifier le style :

```powershell
npm.cmd run build:desktop
npm.cmd run lint
```

Les scripts de tests ciblés sont :

```powershell
npm.cmd run test:build-assets
npm.cmd run test:updates
npm.cmd run test:library-root
npm.cmd run test:library-transfer
npm.cmd run test:library-backup
npm.cmd run test:reading-settings
npm.cmd run test:reader-shortcuts
npm.cmd run test:language-settings
npm.cmd run test:ui-language
npm.cmd run test:reading-position
npm.cmd run test:collection-lock
npm.cmd run test:collection-export
npm.cmd run test:collection-import
npm.cmd run test:chapter-import
npm.cmd run test:e2e
```

Le test de bout en bout démarre Yomu avec un profil temporaire et des fichiers fictifs. Il vérifie notamment la reprise EPUB, le comptage des pages PDF/CBZ, la double page, les raccourcis, les préférences et le transfert de bibliothèque. Les tests ne doivent pas être exécutés avec la bibliothèque personnelle.

Pour contribuer, lance au minimum `npm.cmd run lint` et le test ciblé correspondant aux fichiers modifiés. Avant une modification qui touche plusieurs modules ou le parcours de l’application, lance aussi `npm.cmd run build:desktop` et, si l’interface ou les échanges Electron sont concernés, `npm.cmd run test:e2e`. Les changements de comportement doivent inclure ou mettre à jour des tests et la documentation directement concernée.

### Adapter le projet ou créer un fork

Avant de distribuer une variante, vérifie les paramètres propres à Yomu et remplace ceux qui ne correspondent pas à ton application :

- Dans `package.json` : `name`, `version`, `license`, `build.appId`, `build.productName`, `build.win.icon`, `build.win.artifactName` et `build.publish` (notamment le propriétaire et le nom du dépôt GitHub pour les mises à jour).
- Vérifie le nom et l’emplacement du profil utilisateur dans `electron/main.ts` : l’application installée construit son chemin de données à partir du nom de l’application.
- Remplace les logos et icônes référencés par le projet, notamment dans `src/assets/`, `public/`, `index.html` et la configuration electron-builder.
- Si tu ajoutes ou retires une dépendance, mets à jour `package-lock.json` avec npm et vérifie la licence de la dépendance.
- Choisis et documente une licence adaptée à ton projet ; la licence actuelle de Yomu ne s’applique pas automatiquement aux dépendances.

Pour une nouvelle fonctionnalité, l’interface se modifie généralement dans `src/`. Si elle doit accéder au système de fichiers ou à une API Electron, ajoute une méthode ciblée au preload, son type dans `src/electron.d.ts` et son gestionnaire IPC dans `electron/main.ts` ; conserve la logique métier dans un module dédié sous `electron/` lorsqu’elle peut être séparée de l’interface.

### Générer un installateur Windows

```powershell
npm.cmd run package:win
```

Cette commande génère localement un installateur non signé dans `release/`. Windows peut afficher un avertissement lors de son lancement.

## Stockage

Chaque collection possède son propre dossier dans la bibliothèque :

```text
Bibliothèque\
  Collection-identifiant\
    collection.json
    lecture.json          # si un réglage de lecture a été enregistré
    couverture.png        # facultative, extension variable
    Chapitres\
      identifiant.pdf
      identifiant.cbz
      identifiant.epub
```

Une archive ZIP exportée depuis Yomu comprend la collection et ses fichiers. Elle peut ensuite être importée dans une bibliothèque Yomu ; l’import crée de nouveaux identifiants pour permettre l’ajout d’une copie.
