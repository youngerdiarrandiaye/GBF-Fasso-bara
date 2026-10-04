# Application et Supabase dans Docker

L'application web est gérée par `compose.yaml`. Elle rejoint le réseau existant
`supabase_network_Facture-Fasso`, sans recréer ni vider la base Supabase.

```powershell
docker compose up -d --build app
docker compose logs --tail 40 app
```

- Application : http://localhost:3000
- API Supabase pour le navigateur : http://127.0.0.1:55321
- API Supabase pour le serveur web : http://supabase_kong_Facture-Fasso:8000

Le fichier `.env.local` fournit les clés au conteneur au démarrage. Il est exclu
de l'image Docker. Ne pas publier ce fichier ni la clé `service_role`.

Le transport serveur utilise `SUPABASE_INTERNAL_URL` pour joindre Supabase dans
Docker. L'URL publique reste celle du client Supabase : les noms des cookies et
les liens Storage restent ainsi identiques côté navigateur et côté serveur.

Cette configuration lance Next.js en mode développement. Après modification du
code, reconstruire avec la commande ci-dessus. Pour un autre port web, définir
`FACTURE_APP_PORT` avant la commande Compose. Ne pas lancer simultanément
`npm run dev` sur Windows et le conteneur sur le même port 3000.

Les conteneurs Supabase doivent être démarrés au préalable. Le conteneur de
sauvegarde `supabase_kong_Facture-Fasso-port54321-backup` reste arrêté : son ancien
port 54321 est réservé par Windows sur cette machine.
