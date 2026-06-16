const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();

console.log({
  cwd: process.cwd(),
  url,
  hasService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim()),
  hasAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()),
});

try {
  const response = await fetch(url);
  console.log('fetch status:', response.status);
} catch (error) {
  console.error('fetch error:', error.name, error.message);
  console.error('cause:', error.cause);
}
