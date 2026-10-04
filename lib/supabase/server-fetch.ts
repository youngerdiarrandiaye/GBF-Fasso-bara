/** Keep public URLs/cookie names stable while using Docker's internal network. */
export const supabaseServerFetch: typeof fetch = (input, init) => {
  const internal = process.env.SUPABASE_INTERNAL_URL;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!internal || !publicUrl) return fetch(input, init);

  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== new URL(publicUrl).origin) return fetch(input, init);

  const target = new URL(url.pathname + url.search, internal);
  return fetch(input instanceof Request ? new Request(target, input) : target, init);
};
