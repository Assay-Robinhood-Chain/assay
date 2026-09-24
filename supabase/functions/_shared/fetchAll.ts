// supabase/functions/_shared/fetchAll.ts
//
// PostgREST (Supabase) returns AT MOST 1000 rows per request by default and
// truncates silently — no error, just the first 1000. Anything that needs
// "every launch" (rotation, scoring) must page through the table instead of
// trusting a bare .select(). Pages are ordered by a stable key so rows are
// neither skipped nor repeated between requests.

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetchAllRows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
