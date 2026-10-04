/** Lit toutes les lignes d'une requête ordonnée, sans dépendre du plafond API. */
export async function readAll<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}): Promise<{ data: T[]; error: null }> {
  const rows: T[] = [];
  const size = 500;
  while (true) {
    const { data, error } = await query.range(rows.length, rows.length + size - 1);
    if (error) throw new Error(`Lecture des données impossible : ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    // Une page courte peut provenir du plafond serveur : continuer jusqu'à une page vide.
  }
  return { data: rows, error: null };
}
