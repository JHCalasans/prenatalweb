// Fallback do environment de produção. Em builds via `npm run build` este
// arquivo é substituído por environment.production.ts, gerado a partir das
// variáveis SUPABASE_URL / SUPABASE_ANON_KEY (scripts/write-env.mjs).
export const environment = {
  production: true,
  supabase: {
    url: 'https://PROJECT-REF.supabase.co',
    anonKey: 'PUBLISHABLE_KEY',
  },
};
