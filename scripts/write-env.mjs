// Gera src/environments/environment.production.ts a partir de variáveis de
// ambiente (SUPABASE_URL, SUPABASE_ANON_KEY). Sem as variáveis definidas,
// grava placeholders para que `npm run build` continue funcionando localmente.
// O arquivo gerado não é versionado (.gitignore) e entra no build de produção
// via fileReplacements (angular.json). Roda automaticamente antes de `npm run
// build` (script "prebuild").
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Aceita URL https, publishable key "sb_publishable_..." e JWT legado
// (base64url com pontos) — sem espaços nem caracteres que quebrariam o TS.
const VALIDO = /^[A-Za-z0-9_.:@/-]+$/;

function valor(nome, padrao) {
  const bruto = process.env[nome];
  if (!bruto) return padrao;
  if (!VALIDO.test(bruto)) {
    throw new Error(`${nome} contém caracteres inesperados: ${JSON.stringify(bruto)}`);
  }
  return bruto;
}

const url = valor('SUPABASE_URL', 'https://PROJECT-REF.supabase.co');
const anonKey = valor('SUPABASE_ANON_KEY', 'PUBLISHABLE_KEY');

const conteudo = `// Gerado por scripts/write-env.mjs — NÃO versionar.
export const environment = {
  production: true,
  supabase: {
    url: '${url}',
    anonKey: '${anonKey}',
  },
};
`;

const destino = resolve(raiz, 'src/environments/environment.production.ts');
await mkdir(dirname(destino), { recursive: true });
await writeFile(destino, conteudo, 'utf8');
console.log(`environment de produção escrito em ${destino}`);
