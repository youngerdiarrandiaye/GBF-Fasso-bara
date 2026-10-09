// Exécution : node --test tests/import-clients.test.mjs  (Node >= 22.18, TypeScript lu directement)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyserLignes, deduireTypeClient, extraireRegion, normaliserTelephone,
} from '../lib/import/clients.ts';

// Reproduit la structure du fichier « base clients par marché / région ».
const fichier = [
  ['BASE DE DONNEES CLIENTS PROJET'],
  ['REGION DE DAKAR ', 'DATE', 'NUMERO ', 'NOM CLIENT ', 'TYPE DE CLIENT / PARTENAIRE ', 'CONTACT / TEL ', 'ADRESSE DE MARCHE ', 'STATUT MARCHE ', 'CMDE  REALISE '],
  [null, null, 1, 'MOUSTAPHA THIAM', 'COMMERCANT DE GROS ', '77 362 93 04 ', 'Marche   THIAROYE ', null, 'OUI'],
  [null, null, 2, 'ABOU KANE ', 'IMPORTATEUR', null, 'Marche THIAROYE', null, 'PAS ENCORE'],
  [null, null, 3, 'M DIOUF', 'AMATEUR', 781532152, 'DAKAR'],
  [null, null, null, null, null, null, null],
  ['REGION DE SAINT LOUIS', null, 1, 'BOCAR FOUTA', 'PRODUCTEUR / COMMERCANT', '77 722 85 35', 'Zone Fouta'],
  [null, null, 2, 'ASSOC PRODUCTEURS', 'ASSOCIATION PRODUCTEUR', '77 722 85 35', 'Zone Fouta'],
  ['REGION LOUGUA'],
  [null, null, 1, 'SOULEYMANE KA', 'REVENDEUR BOUTIQUE', '00 33 684 02 46 61', 'Marche POTOU'],
  [null, null, 2, 'X', 'AMATEUR'],
  ['TOTAL CLIENTS', 0, 82],
];

test('repère les colonnes et ignore titres, vides, séparateurs et totaux', () => {
  const a = analyserLignes(fichier);
  assert.equal(a.colonnes.Nom, 'NOM CLIENT');
  assert.equal(a.colonnes['Téléphone'], 'CONTACT / TEL');
  assert.deepEqual(a.lignes.map((l) => l.nom), ['MOUSTAPHA THIAM', 'ABOU KANE', 'M DIOUF', 'BOCAR FOUTA', 'ASSOC PRODUCTEURS', 'SOULEYMANE KA', 'X']);
  assert.equal(a.ignorees, 2); // séparateur « REGION LOUGUA » + « TOTAL CLIENTS »
});

test('la région suit les blocs, sur la ligne du premier client ou sur une ligne de séparation', () => {
  const regions = analyserLignes(fichier).lignes.map((l) => l.region);
  assert.deepEqual(regions, ['Dakar', 'Dakar', 'Dakar', 'Saint-Louis', 'Saint-Louis', 'Louga', 'Louga']);
});

test('téléphones : format, nombre brut, absence, numéro étranger signalé', () => {
  assert.equal(normaliserTelephone('77 362 93 04 ').valeur, '77 362 93 04');
  assert.equal(normaliserTelephone('764931723').valeur, '76 493 17 23');
  assert.equal(normaliserTelephone('+221 77 362 93 04').valeur, '77 362 93 04');
  assert.equal(normaliserTelephone('770000000 / 780000000').valeur, '77 000 00 00 / 78 000 00 00');
  assert.equal(normaliserTelephone('').valeur, null);
  assert.ok(normaliserTelephone('00 33 684 02 46 61').avertissement);
});

test('adresse nettoyée, type déduit, ligne invalide signalée', () => {
  const [premier, , , , , , x] = analyserLignes(fichier).lignes;
  assert.equal(premier.adresse, 'Marché THIAROYE');
  assert.equal(premier.type_client, 'entreprise');
  assert.deepEqual(x.erreurs, ['Nom trop court (2 caractères minimum).']);
});

test('types : producteurs et amateurs particuliers, associations coopératives, revendeurs entreprises', () => {
  assert.equal(deduireTypeClient('AMATEUR'), 'particulier');
  assert.equal(deduireTypeClient('PRODUCTEURS'), 'particulier');
  assert.equal(deduireTypeClient('ASSOCIATION PRODUCTEUR'), 'cooperative');
  assert.equal(deduireTypeClient('COOPERATIVE PRODUCTEUR'), 'cooperative');
  assert.equal(deduireTypeClient('AGENT REVENDEUR'), 'entreprise');
  assert.equal(deduireTypeClient('GROS DISTRIBUTEUR'), 'entreprise');
  assert.equal(deduireTypeClient(null), 'particulier');
});

test('doublons repérés par le téléphone, sinon par le nom', () => {
  const l = analyserLignes(fichier).lignes;
  assert.equal(l[3].cle, l[4].cle); // même téléphone
  assert.notEqual(l[0].cle, l[1].cle);
  assert.equal(l[1].cle, 'nom:abou kane');
});

test('régions : graphies corrigées, texte quelconque refusé', () => {
  assert.equal(extraireRegion('REGION DE THIES'), 'Thiès');
  assert.equal(extraireRegion('REGION LOUGUA'), 'Louga');
  assert.equal(extraireRegion('Zone Fouta'), 'Fouta');
  assert.equal(extraireRegion('Marche MBORO'), null);
});

test('fichier sans colonne « nom » : erreur explicite', () => {
  assert.throws(() => analyserLignes([['a', 'b'], [1, 2]]), /Colonne « Nom » introuvable/);
});
