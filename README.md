# Suivis chantier

PWA personnelle et indépendante, sans dépendance de production. Interface en français, adaptée à un usage sur PC et mobile.

## Démarrer

Node.js 22 ou ultérieur : `npm run dev`, puis http://localhost:4178. `npm test` vérifie le déroulé métier.

## Version Windows portable

La version Windows 64 bits est distribuée dans une archive ZIP, avec son moteur Electron intégré. Décompresser **tout** le ZIP et ouvrir `Suivis chantier.exe` : aucune installation et aucun Node.js requis sur le poste utilisateur. Au premier lancement, une boîte Windows demande le dossier des données. Le choix est mémorisé dans `suivis-chantier-dossier.json`, à côté de l’exécutable ; garder l’ensemble du dossier portable dans un emplacement accessible en écriture.

Les modifications validées et les coches du Post-it sont écrites directement dans `suivis-chantier.json` du dossier choisi, pièces jointes incluses. Une écriture utilise un fichier temporaire synchronisé sur disque puis un renommage ; `suivis-chantier.precedent.json` conserve l’état précédent. Les erreurs d’écriture sont affichées et ne remplacent pas l’état en mémoire par une modification non enregistrée. Un fichier corrompu est conservé à part avant récupération depuis une copie précédente valide. Un dossier configuré absent produit une erreur, sans créer silencieusement un espace vide. Un verrou de dossier empêche deux copies indépendantes de modifier simultanément les fichiers.

Dans **Sauvegarde & données → Importer ma sauvegarde JSON**, sélectionner un export de la PWA et confirmer son remplacement des données présentes. Le JSON est validé avant toute écriture. Les chantiers, étapes, notes, historique et fichiers sont ensuite enregistrés automatiquement dans le dossier. Le dernier chantier consulté est également mémorisé sur disque et rouvert au lancement. L’export supplémentaire reste disponible.

Le Post-it est une fenêtre native au premier plan et peut rester ouvert après fermeture de la fenêtre principale. Il utilise le même stockage ; toutes les fonctions métier et les liens GIMA/véhicule sont conservés. Les fenêtres ne disposent pas d’accès Node.js direct : un pont limité transmet les commandes de stockage au processus principal. Les ressources sont locales, avec isolation et sandbox ; les liens externes autorisés s’ouvrent dans le navigateur habituel. Aucune donnée de chantier n’est envoyée sur Internet.

Construction : `npm ci`, installer le moteur officiel avec `node node_modules/electron/install.js` si nécessaire, puis `npm run build:portable`. Le dossier produit est indiqué dans `portable-builds/latest-build.json`. `desktop/build.js` reprend l’interface existante et remplace les adaptateurs IndexedDB par les adaptateurs disque, sans changer la PWA publiée. Les répertoires de distribution, configuration et données de test ne sont pas versionnés.

## Utilisation

Créer un chantier depuis « À faire » ou « Mes chantiers ». Le déroulé du marché à BDC est prérempli. Un site occupé ajoute la vérification des disponibilités avant le rendez-vous. Confirmer un RDV nécessite une date. La réservation du véhicule reste indépendante de la réception du devis et ne disparaît pas quand le chantier avance.

Ouvrir une action pour ajouter des notes, fixer une échéance, joindre des fichiers ou mettre l’action en attente avec un retour attendu et une date de relance. Les relances apparaissent quand l’application est ouverte : aucune notification système ou envoi automatique de mail.

« + Une action » propose les étapes BDC, des rendez-vous supplémentaires, des recherches et une action personnalisée. Le nom reste modifiable, et une même action peut être ajoutée plusieurs fois. Choisir « Avant : … » pour l’insérer à la bonne position. Dans le déroulé, utiliser les flèches ↑ / ↓ pour déplacer toute action existante. Le déplacement change l’ordre d’affichage, sans changer les dépendances du modèle BDC ; les actions ajoutées sont indépendantes et disponibles immédiatement. Les rendez-vous ajoutés exigent une date avant validation, dans l’application comme dans le Post-it.

Les étapes véhicule donnent accès à https://apv.grandlyon.fr/ et les étapes GIMA à https://gima.grandlyon.fr/gimaweb/. Ces raccourcis ouvrent un nouvel onglet et ne marquent pas l’action comme terminée. L’accès aux portails reste soumis à la connexion et aux droits du poste professionnel.

Les fichiers Zimbra peuvent être joints en .eml, .msg ou .txt ; on peut aussi copier le contenu du mail dans les notes. Les fichiers se téléchargent dans leur format original. Pas de connexion automatique à Zimbra et pas d’analyse automatique du BPU : la vérification reste humaine.

## Post-it de bureau

Cliquer sur « Post-it de bureau » dans le menu. Sur un navigateur compatible avec Document Picture-in-Picture, une petite fenêtre reste au-dessus des autres applications. Déplacer et redimensionner cette fenêtre avec sa barre de titre. Garder l’application principale ouverte, éventuellement réduite : fermer ou recharger celle-ci ferme le Post-it épinglé. L’ouverture nécessite un clic et ne se lance pas automatiquement au démarrage de Windows.

Le Post-it regroupe les actions disponibles de tous les chantiers en cours, avec les attentes et les dates de relance. Cocher termine l’action et débloque la suite. Le véhicule reste visible indépendamment du devis. Un RDV sans date demande cette date avant validation. « Annuler la dernière coche » rouvre l’action, sauf si une étape dépendante a été terminée entre-temps.

Les changements sont enregistrés dans le même stockage local et transmis entre les fenêtres. Si le navigateur ne permet pas la fenêtre épinglée, une fenêtre classique est proposée ; elle n’est pas toujours au premier plan. Les deux modes fonctionnent hors connexion une fois leurs fichiers mis en cache.

## Données et sauvegardes

IndexedDB conserve les chantiers et pièces jointes sur l’appareil et dans le profil de navigateur utilisé. Aucune donnée de chantier n’est envoyée à GitHub. Pas de compte, serveur de données, ni synchronisation entre PC et téléphone. Toute personne utilisant le même profil du navigateur peut accéder aux données.

Chaque modification validée est immédiatement enregistrée, y compris les coches du Post-it. Une copie interne complète conserve aussi les pièces jointes ; une seconde copie des chantiers dans localStorage permet de récupérer le suivi si IndexedDB devient vide. Les pièces manquantes sont signalées avec leur nom dans les notes et à la récupération. À l’ouverture, les données reviennent automatiquement et le dernier chantier consulté est rouvert. La mise à jour conserve la base existante et demande au navigateur le stockage persistant, sans contourner ses règles.

Dans « Sauvegarde & installation », choisir une fois un fichier JSON pour activer la **sauvegarde automatique sur disque** (Edge ou Chrome compatible, HTTPS ou localhost). Ce fichier contient les chantiers et toutes les pièces jointes ; il est actualisé après chaque modification, depuis l’application comme depuis le Post-it. Les écritures des fenêtres sont coordonnées avec Web Locks et les changements ne sont annoncés sauvegardés sur disque qu’après fermeture réussie du flux. Un échec ou une autorisation à renouveler apparaît dans l’application. Garder le fichier dans un emplacement professionnel approprié, réservé à l’application.

Le navigateur peut redemander l’autorisation d’accès au fichier : cliquer sur « Reprendre la sauvegarde ». Si le stockage principal est vide et le fichier accessible, l’application récupère son contenu automatiquement avant toute écriture ; une copie complète n’est pas remplacée par des données vides ou privées de pièces jointes en attente de récupération. **Si toutes les données du navigateur sont supprimées, l’autorisation et le chemin du fichier disparaissent aussi** : utiliser « Reconnecter une sauvegarde », sélectionner le fichier existant et autoriser son accès. Le fichier physique reste présent sur le PC. Sans fichier configuré, les copies internes ne protègent pas contre l’effacement de tout le profil. Aucune garantie contre une politique d’entreprise qui purge le navigateur : la cause doit alors être corrigée dans le profil autorisé.

L’export et la restauration JSON manuels restent disponibles et compatibles avec les sauvegardes précédentes. La restauration est validée et transactionnelle, puis remplace les données après confirmation. Fichiers limités à 20 Mo chacun ; l’espace total dépend du navigateur. Les copies internes nécessitent davantage d’espace ; leur échec est affiché, sans prétendre qu’une modification enregistrée dans la base a été perdue.

## Installation et publication

Héberger ce dossier sur GitHub Pages via la branche main, dossier racine. GitHub Pages fournit l’adresse HTTPS. Ouvrir cette adresse dans Edge ou Chrome, puis utiliser « Installer Suivis chantier » dans le menu du navigateur (sous réserve des règles du PC professionnel).

Le service worker met en cache l’application pour un usage hors connexion après la première ouverture. Pour une mise à jour, incrémenter le nom CACHE dans sw.js ; la nouvelle version devient active après fermeture de toutes les fenêtres de l’application et réouverture. Les données IndexedDB restent conservées.

Seul ce dossier doit être publié. Ne pas publier le dossier ERP parent ni ses fichiers de configuration.
