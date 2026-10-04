// Installation isolée : npm install --prefix .tmp/stock-tests --no-save --package-lock=false @electric-sql/pglite
// Exécution : node --test tests/stock-livraison.test.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { PGlite } from '../.tmp/stock-tests/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const agent = '10000000-0000-0000-0000-000000000001';
const client = '20000000-0000-0000-0000-000000000001';
const entrepot = '30000000-0000-0000-0000-000000000001';
const produit = '40000000-0000-0000-0000-000000000001';
const facture = '50000000-0000-0000-0000-000000000001';
const document = (overrides = {}) => ({ client_id: client, entrepot_id: entrepot, facture_id: facture,
  date_livraison: '2026-09-15', lignes: [{ produit_id: produit, quantite: 10 }], ...overrides });
const creer = (doc = document()) => db.query('SELECT * FROM creer_bon_livraison_atomique($1::jsonb)', [JSON.stringify(doc)]);
const stock = async () => Number((await db.query('SELECT quantite_stock FROM stock_entrepot')).rows[0].quantite_stock);
const compte = async (table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

before(async () => {
  // Schéma de test minimal ; les fonctions métier sont lues depuis les vraies migrations.
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${agent}'::uuid $$;
    CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION is_agent_actif() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TYPE statut_facture AS ENUM ('brouillon','proforma','validee','payee_partielle','payee','annulee');
    CREATE TYPE type_mouvement_stock AS ENUM ('entree','sortie','ajustement');
    CREATE TABLE entrepots (id uuid PRIMARY KEY, actif boolean);
    CREATE TABLE produits (id uuid PRIMARY KEY, nom text);
    CREATE TABLE factures (id uuid PRIMARY KEY, numero text, client_id uuid, entrepot_id uuid,
      agent_id uuid, statut statut_facture, bon_livraison_id uuid, date_validation timestamptz);
    CREATE TABLE lignes_facture (id uuid DEFAULT gen_random_uuid(), facture_id uuid REFERENCES factures,
      produit_id uuid REFERENCES produits, quantite numeric(12,2));
    CREATE TABLE bons_livraison (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text DEFAULT 'BL-TEST',
      client_id uuid NOT NULL, entrepot_id uuid NOT NULL REFERENCES entrepots, facture_id uuid REFERENCES factures,
      agent_id uuid, date_livraison date NOT NULL, notes text, statut text DEFAULT 'livre_non_paye');
    CREATE TABLE lignes_bon_livraison (id uuid DEFAULT gen_random_uuid(), bon_livraison_id uuid REFERENCES bons_livraison ON DELETE CASCADE,
      produit_id uuid REFERENCES produits, quantite numeric(12,2) CHECK (quantite > 0));
    CREATE TABLE stock_entrepot (produit_id uuid, entrepot_id uuid, quantite_stock numeric(12,2) CHECK (quantite_stock >= 0), updated_at timestamptz);
    CREATE TABLE mouvements_stock (produit_id uuid, entrepot_id uuid, type type_mouvement_stock, quantite numeric(12,2),
      motif text, reference_facture_id uuid, reference_bon_livraison_id uuid, utilisateur_id uuid);
    CREATE TABLE journal_activites (utilisateur_id uuid, action text, table_cible text, avant jsonb, apres jsonb);
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  const original = await readFile(new URL('../supabase/migrations/0013_avenant_credit_entrepots.sql', import.meta.url), 'utf8');
  const start = original.indexOf('CREATE OR REPLACE FUNCTION gerer_ligne_bon_livraison()');
  const end = original.indexOf('$$;', start) + 3;
  await db.exec(original.slice(start, end));
  await db.exec(await readFile(new URL('../supabase/migrations/0017_destockage_uniquement_livraison.sql', import.meta.url), 'utf8'));
  await db.exec(`
    CREATE TRIGGER trg_decrementer_stock_entrepot BEFORE UPDATE ON factures FOR EACH ROW
      WHEN (NEW.statut = 'validee' AND OLD.statut IS DISTINCT FROM 'validee') EXECUTE FUNCTION decrementer_stock_entrepot();
    CREATE TRIGGER trg_restaurer_stock_annulation_entrepot BEFORE UPDATE ON factures FOR EACH ROW
      WHEN (NEW.statut = 'annulee' AND OLD.statut IS DISTINCT FROM 'annulee') EXECUTE FUNCTION restaurer_stock_annulation_entrepot();
    CREATE TRIGGER trg_gerer_ligne_bon_livraison BEFORE INSERT OR DELETE ON lignes_bon_livraison
      FOR EACH ROW EXECUTE FUNCTION gerer_ligne_bon_livraison();
    INSERT INTO entrepots VALUES ('${entrepot}', true);
    INSERT INTO produits VALUES ('${produit}', 'Produit test');
    INSERT INTO stock_entrepot VALUES ('${produit}', '${entrepot}', 100, now());
    INSERT INTO factures VALUES ('${facture}', 'F-TEST', '${client}', '${entrepot}', '${agent}', 'brouillon', null, null);
    INSERT INTO lignes_facture (facture_id, produit_id, quantite) VALUES ('${facture}', '${produit}', 10);
  `);
});
after(() => db.close());
beforeEach(() => db.exec('BEGIN'));
afterEach(() => db.exec('ROLLBACK'));

test('facture validée avec stock nul, sans mouvement, puis annulation sans restitution', async () => {
  await db.exec(`UPDATE stock_entrepot SET quantite_stock = 0; UPDATE factures SET statut = 'validee';`);
  assert.equal(await stock(), 0);
  assert.equal(await compte('mouvements_stock'), 0);
  assert.ok((await db.query('SELECT date_validation FROM factures')).rows[0].date_validation);
  await db.exec(`UPDATE factures SET statut = 'annulee'`);
  assert.equal(await stock(), 0);
});
test('BL copie la facture et retire une seule fois ; annuler la facture ne restitue pas la livraison', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'`);
  const { rows } = await creer();
  assert.equal(rows[0].facture_id, facture);
  assert.equal(await stock(), 90);
  assert.equal(await compte('mouvements_stock'), 1);
  await db.exec(`UPDATE factures SET statut = 'annulee'`);
  assert.equal(await stock(), 90);
});
test('seconde création sur la même facture refusée', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'`);
  await creer();
  await assert.rejects(creer(), /BL_FACTURE_DEJA_LIVREE/);
});
test('client, entrepôt ou quantité altérés : refus', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'`);
  for (const change of [{ client_id: agent }, { entrepot_id: agent }, { lignes: [{ produit_id: produit, quantite: 9 }] }]) {
    await db.exec('SAVEPOINT tentative');
    await assert.rejects(creer(document(change)), /BL_FACTURE_DONNEES_MODIFIEES/);
    await db.exec('ROLLBACK TO SAVEPOINT tentative');
    assert.equal(await stock(), 100);
    assert.equal(await compte('bons_livraison'), 0);
  }
});
test('stock insuffisant : annulation atomique du BL et des mouvements', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'; UPDATE stock_entrepot SET quantite_stock = 5; SAVEPOINT tentative`);
  await assert.rejects(creer(), /Stock insuffisant/);
  await db.exec('ROLLBACK TO SAVEPOINT tentative');
  assert.equal(await stock(), 5);
  assert.equal(await compte('bons_livraison'), 0);
  assert.equal(await compte('lignes_bon_livraison'), 0);
  assert.equal(await compte('mouvements_stock'), 0);
});
test('échec de la deuxième ligne : première sortie également annulée', async () => {
  const autre = '40000000-0000-0000-0000-000000000002';
  await db.exec(`INSERT INTO produits VALUES ('${autre}', 'Sans stock'); SAVEPOINT tentative`);
  await assert.rejects(creer(document({ facture_id: null, lignes: [{ produit_id: produit, quantite: 10 }, { produit_id: autre, quantite: 1 }] })), /Stock insuffisant/);
  await db.exec('ROLLBACK TO SAVEPOINT tentative');
  assert.equal(await stock(), 100);
  assert.equal(await compte('bons_livraison'), 0);
  assert.equal(await compte('mouvements_stock'), 0);
});
test('facture brouillon et facture d’un autre agent refusées', async () => {
  await db.exec('SAVEPOINT tentative');
  await assert.rejects(creer(), /BL_FACTURE_NON_VALIDEE/);
  await db.exec(`ROLLBACK TO SAVEPOINT tentative; UPDATE factures SET statut = 'validee', agent_id = '${client}'`);
  await assert.rejects(creer(), /BL_FACTURE_INDISPONIBLE/);
});
test('ancienne facture déjà déstockée bloquée ; annulation restaure son mouvement historique', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'; UPDATE stock_entrepot SET quantite_stock = 90;
    INSERT INTO mouvements_stock (produit_id, entrepot_id, type, quantite, reference_facture_id)
    VALUES ('${produit}', '${entrepot}', 'sortie', 10, '${facture}'); SAVEPOINT tentative`);
  await assert.rejects(creer(), /BL_FACTURE_STOCK_HISTORIQUE/);
  await db.exec(`ROLLBACK TO SAVEPOINT tentative; UPDATE factures SET statut = 'annulee'`);
  assert.equal(await stock(), 100);
});
test('BL autonome déstocke, y compris produits regroupés', async () => {
  await creer(document({ facture_id: null, lignes: [{ produit_id: produit, quantite: 4 }, { produit_id: produit, quantite: 6 }] }));
  assert.equal(await stock(), 90);
  assert.equal(await compte('lignes_bon_livraison'), 1);
});
test('lignes et en-têtes livrés immuables', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'`);
  await creer();
  for (const sql of [`UPDATE lignes_bon_livraison SET quantite = 20`, `UPDATE bons_livraison SET client_id = '${agent}'`, `UPDATE factures SET entrepot_id = '${agent}'`]) {
    await db.exec('SAVEPOINT tentative');
    await assert.rejects(db.exec(sql), /BL_DOCUMENT_IMMUABLE/);
    await db.exec('ROLLBACK TO SAVEPOINT tentative');
  }
});
test('API authentifiée : INSERT direct interdit, RPC autorisée', async () => {
  await db.exec(`UPDATE factures SET statut = 'validee'; SET LOCAL ROLE authenticated; SAVEPOINT tentative`);
  await assert.rejects(db.exec('INSERT INTO bons_livraison DEFAULT VALUES'), /permission denied/);
  await db.exec('ROLLBACK TO SAVEPOINT tentative');
  await creer();
  assert.equal(await stock(), 90);
});
