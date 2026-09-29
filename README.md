# Suivis chantier

PWA personnelle et indépendante, sans dépendance de production. Interface en français, adaptée à un usage sur PC et mobile.

## Démarrer

Node.js 22 ou ultérieur : `npm run dev`, puis http://localhost:4178. `npm test` vérifie le déroulé métier.

## Utilisation

Créer un chantier depuis « À faire » ou « Mes chantiers ». Le déroulé du marché à BDC est prérempli. Un site occupé ajoute la vérification des disponibilités avant le rendez-vous. Confirmer un RDV nécessite une date. La réservation du véhicule reste indépendante de la réception du devis et ne disparaît pas quand le chantier avance.

Ouvrir une action pour ajouter des notes, fixer une échéance, joindre des fichiers ou mettre l’action en attente avec un retour attendu et une date de relance. Les relances apparaissent quand l’application est ouverte : aucune notification système ou envoi automatique de mail.

Les fichiers Zimbra peuvent être joints en .eml, .msg ou .txt ; on peut aussi copier le contenu du mail dans les notes. Les fichiers se téléchargent dans leur format original. Pas de connexion automatique à Zimbra et pas d’analyse automatique du BPU : la vérification reste humaine.

## Données et sauvegardes

IndexedDB conserve les chantiers et pièces jointes sur l’appareil et dans le profil de navigateur utilisé. Aucune donnée de chantier n’est envoyée à GitHub. Pas de compte, serveur de données, ni synchronisation entre PC et téléphone. Toute personne utilisant le même profil du navigateur peut accéder aux données.

« Sauvegarde & installation » exporte un JSON contenant les chantiers et tous les fichiers. Conserver régulièrement une copie dans un emplacement professionnel approprié. Effacer les données du navigateur, changer de profil ou d’adresse de l’application crée un espace vide ; restaurer alors une sauvegarde. La restauration est validée et transactionnelle, puis remplace les données après confirmation. Fichiers limités à 20 Mo chacun ; l’espace total dépend du navigateur.

## Installation et publication

Héberger ce dossier sur GitHub Pages via la branche main, dossier racine. GitHub Pages fournit l’adresse HTTPS. Ouvrir cette adresse dans Edge ou Chrome, puis utiliser « Installer Suivis chantier » dans le menu du navigateur (sous réserve des règles du PC professionnel).

Le service worker met en cache l’application pour un usage hors connexion après la première ouverture. Pour une mise à jour, incrémenter le nom CACHE dans sw.js ; la nouvelle version devient active après fermeture de toutes les fenêtres de l’application et réouverture. Les données IndexedDB restent conservées.

Seul ce dossier doit être publié. Ne pas publier le dossier ERP parent ni ses fichiers de configuration.
