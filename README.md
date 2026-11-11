# Yomu

**Ta bibliothèque de mangas et de manhwas, directement sur ton PC.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Windows-application%20locale-0078D4)](https://www.microsoft.com/windows)

Yomu est une application Windows qui permet de ranger et de lire tes mangas et manhwas depuis un dossier local. Tes fichiers restent sur ton ordinateur : aucune synchronisation entre appareils n’est proposée.

## Utilisation de l’IA

De l’intelligence artificielle a été utilisée lors du développement de ce projet. Si cela vous dérange ou vous empêche d’utiliser cet outil, j’en suis désolé.

## Fonctionnalités

- **Bibliothèque personnelle** : crée des collections avec un titre, une couverture, un type et un statut de lecture.
- **Formats pris en charge** : lis tes chapitres PDF, CBZ et EPUB dans l’application.
- **Organisation** : recherche et filtre tes collections, trie tes chapitres et indique leur langue (français ou anglais).
- **Import et export** : ajoute des chapitres depuis ton PC et transfère une collection complète avec une archive ZIP Yomu.
- **Lecture personnalisée** : profite du plein écran et, pour les PDF, ajuste le zoom ou verrouille-le pour toute une collection.

## Prise en main

1. Lance Yomu et choisis le dossier où stocker ta bibliothèque.
2. Crée une collection et choisis son type : **Manga** ou **Manhwa**.
3. Ouvre la collection, clique sur **Ajouter des chapitres**, puis choisis leur langue et les fichiers à importer.
4. Sélectionne un chapitre pour commencer la lecture.

Les fichiers importés sont copiés dans ta bibliothèque : les originaux ne sont pas modifiés. Tu peux consulter ou changer le dossier de bibliothèque dans les paramètres ; le changer ne déplace pas les collections existantes.

> **Attention :** supprimer une collection supprime définitivement son dossier et tous les fichiers qu’il contient. Les fichiers d’origine situés ailleurs ne sont pas touchés.

## Lecture et raccourcis

| Type de collection | Format | Navigation |
| --- | --- | --- |
| Manga | PDF, CBZ, EPUB | Page par page avec les boutons ou **← / →** |
| Manhwa | PDF | Défilement vertical, notamment **↑ / ↓** |
| Manhwa | CBZ, EPUB | Page par page avec **↑ / ↓** |

Dans un PDF, utilise les commandes du lecteur ou **Ctrl + molette** pour régler le zoom. Le cadenas permet de mémoriser le zoom pour les PDF de la collection ; il reste enregistré après un redémarrage.

### Limites connues

- La progression affichée ne permet pas encore de reprendre automatiquement à la dernière page. Son enregistrement et sa modification présentent actuellement des problèmes, notamment pour les EPUB et les PDF Manhwa.
- Les raccourcis EPUB, notamment après un changement de section, restent à vérifier avec de vrais fichiers dans Electron.
- Les mises à jour automatiques ne sont pas encore disponibles.

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

### Vérifications

```powershell
npm.cmd run build:desktop
npm.cmd run lint
npm.cmd run test:reading-settings
npm.cmd run test:collection-export
npm.cmd run test:collection-import
```

### Créer l’installateur Windows

```powershell
npm.cmd run package:win
```

L’installateur est généré dans le dossier `dist`. Il n’est actuellement pas signé : Windows peut afficher un avertissement lors de son lancement.

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
