# GFB-STOCK — Équipe d'agents spécialisés (Claude Code)

Ce dossier contient une équipe de **8 sub-agents Claude Code**, chacun expert d'une partie du projet
**GFB-STOCK** (plateforme de gestion de stock et de facturation pour GIE FASSO BARA), plus un
**prompt d'orchestration** qui les fait travailler ensemble dans le bon ordre.

Chaque agent est un fichier Markdown avec un en-tête YAML (nom, description de déclenchement,
outils autorisés) suivi de ses instructions système. C'est le format natif des sub-agents
Claude Code : Claude délègue automatiquement une tâche à l'agent dont la `description` correspond,
ou vous pouvez l'appeler explicitement.

## 1. Installation

```bash
# À la racine de votre projet Next.js (créez-le d'abord si besoin) :
mkdir -p .claude/agents
cp agents/*.md .claude/agents/
```

Vérifiez dans Claude Code avec la commande `/agents` que les 8 agents apparaissent bien dans la liste.

## 2. Démarrage — coller le prompt d'orchestration

Ouvrez `orchestrateur-prompt.md` et collez tout son contenu comme **premier message** dans Claude Code
(dans le dossier de votre projet). Ce prompt donne le contexte complet du projet et explique à Claude
Code dans quel ordre déléguer aux agents.

## 3. Les 8 agents

| Agent | Spécialité | Intervient |
|---|---|---|
| `architecte-bdd` | Schéma Supabase, RLS, triggers SQL | Phase 1 — en premier, tout dépend de lui |
| `designer-ui-ux` | Design system, palette, composants, micro-interactions | Phase 2 — juste après le schéma |
| `dev-backend-edge` | Edge Functions (PDF, alertes, export) | Phase 3 — une fois le schéma stable |
| `dev-frontend-agent` | Espace Agent (facturation rapide) — priorité MVP | Phase 4a |
| `dev-frontend-admin` | Espace Admin (dashboard, stock, rapports...) | Phase 4b |
| `expert-securite` | Audit RLS, checklist sécurité, revue de code | Phase 5 — en continu à chaque livraison |
| `qa-testeur` | Scénarios de recette, tests des triggers, cas limites | Phase 6 |
| `redacteur-technique` | Documentation technique + guide utilisateur | Phase 7 — en dernier |

## 4. Invocation manuelle (si besoin)

```
Utilise le sub-agent architecte-bdd pour générer le schéma SQL complet de GFB-STOCK.
```

```
Utilise le sub-agent expert-securite pour auditer les policies RLS de la table factures.
```

## 5. Documents de référence liés

Ces agents s'appuient sur deux documents déjà produits pour ce projet :
- **Prompt de Référence** (GFB-STOCK-PROMPT-2026-V1) — structure technique complète
- **Cahier des Charges** (GFB-STOCK-CDC-2026-V1) — exigences fonctionnelles EF-XXX et critères de recette

Chaque agent y fait référence dans ses instructions ; donnez-les à Claude Code en pièce jointe ou
collez leur contenu au début de la conversation pour un contexte maximal.
