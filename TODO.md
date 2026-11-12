# Feuille de route - Yomu

## Terminé

### v0.0.0 - Base du projet
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

### Entre v0.0.0 et v0.0.1
- [x] Séparation des profils de développement et de l'application installée
- [x] Premier lancement de l'application installée fiabilisé

### v0.0.1
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

### v0.0.2
- [x] Version actuelle affichée dans la carte Mises à jour (et retirée de la carte Informations)
- [x] Carte Mises à jour réorganisée
- [x] Version lue depuis l'état Electron (plus de valeur codée en dur)
- [x] Test réel de mise à jour v0.0.1 vers v0.0.2

## À faire

### Bugs et limites connus
- [ ] Le nom de l'installateur contient des espaces : `latest.yml` pointe vers `Yomu-Setup-x.x.x.exe` et GitHub renomme le fichier, ce qui donne une erreur 404 à la mise à jour (fixer `artifactName`)
- [ ] PDF Manhwa : la reprise se fait à la page, pas à la position exacte dans la page
- [ ] Les écritures concurrentes sont protégées seulement dans une instance de Yomu (pas contre un autre processus)
- [ ] Certains EPUB n'ont pas de positions textuelles : la progression se base alors sur les sections et reste approximative
- [ ] Un dossier de bibliothèque introuvable n'est pas remplacé (reconnexion ou choix manuel possible) : simplifier le parcours de réparation
- [ ] Changer de dossier de bibliothèque ne déplace pas les collections existantes (proposer un déplacement ou une copie)

### Options à finir ou à peaufiner
- [ ] Les versions de Yomu antérieures au système de mise à jour doivent être mises à jour manuellement (à documenter dans les notes de release)
- [ ] Installateur non signé : ajouter une signature de code (avertissement Windows)
- [ ] Mises à jour : afficher les notes de version et une progression du téléchargement plus claire
- [ ] Mises à jour : gérer proprement l'absence d'Internet et les limites de l'API GitHub
- [ ] Suppression d'une collection : confirmation plus explicite (suppression définitive du dossier)
- [ ] Messages d'erreur du lecteur : les rendre plus clairs et proposer une action
- [ ] Import ZIP : afficher un résumé (éléments ajoutés, ignorés, en erreur)
- [ ] Raccourcis clavier : les lister dans l'application et les rendre configurables
- [ ] Test de bout en bout avec un profil et des fichiers temporaires

### Futures options

Lecture
- [ ] Marque-pages et notes sur une page
- [ ] Mode de lecture double page (manga) et sens de lecture de droite à gauche
- [ ] Réglages de lecture EPUB (police, taille, interligne, thème)
- [ ] Ajustement de l'image des CBZ : largeur, hauteur, taille d'origine (le zoom existe déjà pour les PDF)
- [ ] Préchargement des pages suivantes pour une lecture plus fluide
- [ ] Mode lecture continue d'un chapitre à l'autre
- [ ] Historique de lecture et section « Continuer la lecture » sur l'accueil

Bibliothèque
- [ ] Tri des collections (récent, titre, progression)
- [ ] Étiquettes et genres personnalisés
- [ ] Favoris et listes personnalisées
- [ ] Statistiques de lecture (chapitres lus, temps passé)
- [ ] Détection des doublons à l'import
- [ ] Import d'un dossier entier ou glisser-déposer de fichiers
- [ ] Prise en charge d'autres formats (CBR, dossiers d'images) ; aujourd'hui : PDF, CBZ, EPUB
- [ ] Manhwa : navigation continue aussi pour CBZ et EPUB (aujourd'hui page par page, le défilement vertical est réservé aux PDF)
- [ ] Renommage automatique et tri naturel des chapitres (1, 2, 10)

Interface et application
- [ ] Thème clair et choix de la couleur d'accent
- [ ] Interface disponible en anglais
- [ ] Sauvegarde et restauration de toute la bibliothèque en une fois (aujourd'hui : export ZIP collection par collection)
- [ ] Synchronisation optionnelle entre appareils (aujourd'hui : bibliothèque 100 % locale, transfert par ZIP uniquement)
- [ ] Choix du canal de mise à jour (stable ou préversion)
- [ ] Notification de mise à jour au démarrage sans vérification automatique forcée
