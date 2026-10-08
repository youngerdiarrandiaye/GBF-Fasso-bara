// Routeur principal edge-runtime (self-hosted) pour supabase/functions/*.
// Equivalent du "main service" que la CLI Supabase fournit en local.
//  - /<nom-fonction>[/...]  ou  /functions/v1/<nom-fonction> (appel direct pg_net)
//  - verify_jwt : actif par defaut (JWT HS256 signe avec JWT_SECRET) sauf pour les
//    fonctions listees dans VERIFY_JWT_DISABLED (protegees par x-cron-secret).
import * as jose from "npm:jose@5.9.6";

const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";
const NO_JWT = new Set(
  (Deno.env.get("VERIFY_JWT_DISABLED") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

// Roles acceptes : un JWT "anon" (cle publique, presente dans le bundle navigateur) ne
// doit PAS ouvrir les fonctions protegees.
const ROLES_AUTORISES = new Set(["authenticated", "service_role"]);

// Liste blanche de l'environnement transmis aux workers (les secrets non necessaires,
// p. ex. JWT_SECRET, SUPABASE_DB_URL, RESEND_API_KEY, ne sont pas propages aux workers).
// Aligne sur ce que lisent supabase/functions/* (grep Deno.env.get) : en ajouter ici si
// une nouvelle fonction lit une nouvelle variable.
const ENV_AUTORISEES = [
  "SUPABASE_URL",
  "PUBLIC_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "ALLOWED_ORIGINS",
  "FACTURE_PDF_SIGNED_URL_TTL_SECONDS",
  "BON_LIVRAISON_PDF_SIGNED_URL_TTL_SECONDS",
  "EXPORT_RAPPORT_SIGNED_URL_TTL_SECONDS",
  "TZ",
  "DENO_DIR",
];

function envWorker(): [string, string][] {
  const out: [string, string][] = [];
  for (const k of ENV_AUTORISEES) {
    const v = Deno.env.get(k);
    if (v !== undefined) out.push([k, v]);
  }
  return out;
}

async function jwtValide(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || !JWT_SECRET) return false;
  try {
    const { payload } = await jose.jwtVerify(m[1], new TextEncoder().encode(JWT_SECRET), {
      algorithms: ["HS256"],
    });
    return typeof payload.role === "string" && ROLES_AUTORISES.has(payload.role);
  } catch {
    return false;
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/functions\/v1/, "").split("/").filter(Boolean);
  const name = segments[0];

  if (!name || !/^[a-z0-9-]+$/.test(name) || name === "main" || name.startsWith("_")) {
    return json(404, { error: "Fonction introuvable" });
  }
  if (req.method !== "OPTIONS" && !NO_JWT.has(name) && !(await jwtValide(req))) {
    return json(401, { error: "JWT invalide ou absent" });
  }

  try {
    // @ts-ignore EdgeRuntime est fourni par l'environnement edge-runtime
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 256,
      workerTimeoutMs: 120_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: envWorker(),
      forceCreate: false,
      netAccessDisabled: false,
      cpuTimeSoftLimitMs: 10_000,
      cpuTimeHardLimitMs: 30_000,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`[main] ${name}:`, e);
    return json(500, { error: "Erreur d'execution de la fonction" });
  }
});
