# ![Yomu](src/assets/yomu-sidebar-logo.png)

**Ta bibliothèque de mangas et de manhwas, directement sur ton PC.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Windows-application%20locale-0078D4)](https://www.microsoft.com/windows)

Yomu est une application Windows qui permet de ranger et de lire tes mangas et manhwas depuis un dossier local. Tes fichiers restent sur ton ordinateur : aucune synchronisation entre appareils n’est proposée.

## Licence

Le contenu original de ce dépôt est sous licence [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Cette licence n’inclut pas les dépendances tierces ni les fichiers personnels importés dans Yomu.

## Utilisation de l’IA

De l’intelligence artificielle a été utilisée lors du développement de ce projet. Si cela vous dérange ou vous empêche d’utiliser cet outil, j’en suis désolé.

## Fonctionnalités

- **Bibliothèque personnelle** : crée des collections avec un titre, une couverture, un type et un statut de lecture.
- **Formats pris en charge** : lis tes chapitres PDF, CBZ et EPUB dans l’application.
- **Organisation** : recherche et filtre tes collections, trie tes chapitres et choisis dans les paramètres d’afficher les catégories françaises et anglaises ou une seule. Masquer une catégorie ne supprime aucun chapitre.
- **Langue de l’interface** : choisis le français ou l’anglais dans les paramètres. Le choix est mémorisé et indépendant des catégories de langue des chapitres.
- **Import et export** : ajoute des chapitres depuis ton PC et transfère une collection complète avec une archive ZIP Yomu.
- **Lecture personnalisée** : passe au chapitre précédent ou suivant, profite du plein écran et, pour les PDF, ajuste le zoom ou verrouille-le pour toute une collection.
- **Mises à jour** : consulte la disponibilité d’une nouvelle version depuis les paramètres et choisis quand la télécharger et l’installer.

## Prise en main

1. Lance Yomu : une bibliothèque est créée automatiquement dans les données de l’application.
2. Crée une collection et choisis son type : **Manga** ou **Manhwa**.
3. Ouvre la collection, clique sur **Ajouter des chapitres**, puis choisis leur langue et les fichiers à importer.
4. Sélectionne un chapitre pour commencer la lecture.

Les fichiers importés sont copiés dans ta bibliothèque : les originaux ne sont pas modifiés. Tu peux consulter ou changer le dossier de bibliothèque dans les paramètres ; le changer ne déplace pas les collections existantes.

Par défaut, la bibliothèque de l’application installée se trouve dans `%APPDATA%\yomu-installed\Bibliotheque` sur Windows. Le chemin exact est affiché dans les paramètres, avec un bouton pour ouvrir le dossier. Si tu utilisais déjà une bibliothèque avec ce profil, Yomu conserve son emplacement. Si ce dossier devient introuvable, reconnecte-le ou sélectionne un autre dossier.

> **Attention :** supprimer une collection supprime définitivement son dossier et tous les fichiers qu’il contient. Les fichiers d’origine situés ailleurs ne sont pas touchés.

## Lecture et raccourcis

| Type de collection | Format | Navigation |
| --- | --- | --- |
| Manga | PDF, CBZ, EPUB | Page par page avec les boutons ou **← / →** |
| Manhwa | PDF | Défilement vertical, notamment **↑ / ↓** |
| Manhwa | CBZ, EPUB | Page par page avec **↑ / ↓** |

Dans un PDF, utilise les commandes du lecteur ou **Ctrl + molette** pour régler le zoom. Le cadenas permet de mémoriser le zoom pour les PDF de la collection ; il reste enregistré après un redémarrage.

Yomu reprend à la dernière page enregistrée (ou à la position de lecture pour un EPUB). Pour les chapitres lus avant cette fonctionnalité, la reprise est approximée à partir du pourcentage existant lorsque le format le permet. Modifier manuellement la progression réinitialise la position enregistrée et utilise ce pourcentage pour la prochaine ouverture.

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

### À faire

#### Bugs et limites connus
- [ ] Certains EPUB n'ont pas de positions textuelles : la progression se base alors sur les sections et reste approximative
- [ ] Changer de dossier de bibliothèque ne déplace pas les collections existantes (proposer un déplacement ou une copie)

#### Options à finir ou à peaufiner
- [ ] Les versions de Yomu antérieures au système de mise à jour doivent être mises à jour manuellement (à documenter dans les notes de release)
- [ ] Installateur non signé : ajouter une signature de code (avertissement Windows)
- [ ] Raccourcis clavier : les lister dans l'application et les rendre configurables

### Futures options

#### Lecture
- [ ] Marque-pages et notes sur une page
- [ ] Mode de lecture double page (manga) et sens de lecture de droite à gauche
- [ ] Réglages de lecture EPUB (police, taille, interligne, thème)
- [ ] Ajustement de l'image des CBZ : largeur, hauteur, taille d'origine (le zoom existe déjà pour les PDF)
- [ ] Préchargement des pages suivantes pour une lecture plus fluide
- [ ] Mode lecture continue d'un chapitre à l'autre
- [ ] Historique de lecture et section « Continuer la lecture » sur l'accueil

#### Bibliothèque
- [ ] Étiquettes et genres personnalisés
- [ ] Favoris et listes personnalisées
- [ ] Statistiques de lecture (chapitres lus, temps passé)
- [ ] Détection des doublons à l'import
- [ ] Import d'un dossier entier ou glisser-déposer de fichiers
- [ ] Prise en charge d'autres formats (CBR, dossiers d'images) ; aujourd'hui : PDF, CBZ, EPUB
- [ ] Manhwa : navigation continue aussi pour CBZ et EPUB (aujourd'hui page par page, le défilement vertical est réservé aux PDF)
- [ ] Renommage automatique et tri naturel des chapitres (1, 2, 10)

#### Interface et application
- [ ] Thème clair et choix de la couleur d'accent
- [ ] Sauvegarde et restauration de toute la bibliothèque en une fois (aujourd'hui : export ZIP collection par collection)
- [ ] Synchronisation optionnelle entre appareils (aujourd'hui : bibliothèque 100 % locale, transfert par ZIP uniquement)
- [ ] Choix du canal de mise à jour (stable ou préversion)
- [ ] Notification de mise à jour au démarrage sans vérification automatique forcée

## Développement

### Prérequis

- Windows
- Node.js et npm

Dans PowerShell, depuis le dossier du projet :

```powershell
npm.cmd install
npm.cmd run desktop:dev
```

Cette commande compile la partie Electron, démarre le serveur de développement et ouvre Yomu.
La version de développement utilise son profil habituel (`%APPDATA%\yomu` sur Windows), où son dossier de bibliothèque personnalisé est enregistré. L’application installée utilise un profil distinct (`%APPDATA%\yomu-installed`) et crée sa propre bibliothèque par défaut.

### Vérifications

```powershell
npm.cmd run build:desktop
npm.cmd run lint
npm.cmd run test:build-assets
npm.cmd run test:updates
npm.cmd run test:library-root
npm.cmd run test:reading-settings
npm.cmd run test:language-settings
npm.cmd run test:ui-language
npm.cmd run test:reading-position
npm.cmd run test:collection-lock
npm.cmd run test:collection-export
npm.cmd run test:collection-import
npm.cmd run test:e2e
```

Le test de bout en bout démarre Yomu avec un profil temporaire, importe un PDF fictif et un ZIP, puis vérifie la lecture, les erreurs du lecteur, le changement de langue de l’interface (y compris dans le lecteur) et la visibilité des catégories. Il supprime ensuite la collection. Le test ne touche pas au profil ni à la bibliothèque habituels.

### Créer l’installateur Windows

```powershell
npm.cmd run package:win
```

L’installateur est généré dans le dossier `release`, distinct des fichiers de compilation de `dist` afin qu’un nouveau build ne l’efface pas. Il n’est actuellement pas signé : Windows peut afficher un avertissement lors de son lancement.

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
