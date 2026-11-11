# Yomu

Une bibliothèque personnelle Windows pour lire et organiser des mangas et manhwa depuis un dossier de ton PC.

## Lancer en développement

```sh
npm.cmd install
npm.cmd run desktop:dev
```

Pour créer l’installateur Windows :

```sh
npm.cmd run package:win
```

L’installateur se trouve dans `release`.

## Utilisation

- Au premier lancement, choisis le dossier où Yomu enregistrera ta bibliothèque.
- Ouvre les paramètres pour afficher le chemin actuel, ouvrir le dossier dans l’Explorateur de fichiers ou en choisir un autre.
- Crée une collection avec un titre, une couverture, un type (manga ou manhwa) et un statut.
- Ouvre une collection pour y ajouter ses chapitres en `.pdf`, `.cbz` ou `.epub`.
- Exporte une collection entière en archive ZIP, avec ses chapitres, sa couverture et ses fichiers de données.
- Importe une collection exportée par Yomu en choisissant son archive `.zip` depuis le bouton en bas du menu latéral.
- Choisis français ou anglais avant chaque import, puis filtre les chapitres par langue dans la collection. La langue d’un chapitre peut être corrigée dans ses détails.
- Les anciens chapitres dont la langue n’est pas renseignée restent visibles dans « À définir » jusqu’à leur modification.
- Chaque collection affiche son nombre de chapitres. Les chapitres sont triés par numéro, y compris les numéros décimaux comme `0.5`.
- Modifie l’ordre, le nom et la progression depuis la liste des chapitres.
- Recherche et filtre les collections par statut, puis trie-les par titre, date ou nombre de chapitres.
- Les fichiers sont copiés dans un dossier par collection, avec `collection.json`, sa couverture éventuelle et un sous-dossier `Chapitres`. Yomu mémorise le dossier choisi pour les prochains lancements.
- Dans un chapitre PDF, utilise le cadenas à côté du zoom pour mémoriser le niveau choisi pour tous les PDF de cette collection. Déverrouille-le pour modifier le zoom ; les autres collections gardent leurs propres réglages.
- Dans une collection de type Manga, utilise les flèches discrètes à gauche et à droite pour passer d’une page à l’autre (PDF, CBZ et EPUB). Les manhwas conservent leur mode de lecture habituel.
- Le zoom verrouillé est enregistré dans `lecture.json` dans le dossier de la collection et reste disponible après redémarrage.
- La progression est mise à jour pendant la lecture des PDF, CBZ et EPUB ; elle peut aussi être modifiée depuis les détails du chapitre.

Changer le dossier de bibliothèque ne déplace pas les collections déjà enregistrées. Les fichiers d’origine ne sont pas modifiés et cette version ne synchronise pas les appareils.
