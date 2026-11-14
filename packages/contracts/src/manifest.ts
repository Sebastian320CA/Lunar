import { z } from 'zod';

// Esquema del Manifest de assets (Requirement 5).
// - El tipo de un asset lo determina la seccion que lo contiene; no hay campo `type`.
// - Las rutas son relativas a `public/assets/` (por ejemplo `models/apollo-lm.glb`).
// - Ningun paso transforma valores: un Manifest valido se devuelve igual que entra.

/** Secciones del Manifest; el "tipo" de un asset es la seccion que lo contiene. */
export const ASSET_KINDS = ['models', 'textures', 'audio'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

const MODEL_EXTENSIONS = ['.glb'] as const;
const TEXTURE_EXTENSIONS = ['.webp', '.png', '.jpg', '.ktx2'] as const;
const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav'] as const;

function rejectedPath(path: string, reason: string): string {
  return `ruta "${path}" rechazada: ${reason}`;
}

/** Motivo de rechazo de una ruta insegura, o `undefined` si la ruta es aceptable. */
function pathProblem(path: string): string | undefined {
  if (path.split(/[\\/]/).includes('..')) return 'contiene un segmento ".."';
  if (path.startsWith('/') || path.startsWith('\\')) return 'empieza por "/" o "\\"';
  if (/^[A-Za-z]:/.test(path)) return 'contiene una letra de unidad';
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return 'contiene un esquema de protocolo';
  if (path.startsWith('assets/') || path.startsWith('assets\\')) {
    return 'lleva el prefijo "assets/" (la ruta es relativa a public/assets/)';
  }
  return undefined;
}

/** Ruta de asset, relativa a `public/assets/`, de 1 a 260 caracteres y sin componentes inseguros. */
export const assetPathSchema = z
  .string()
  .min(1)
  .max(260)
  .superRefine((path, ctx) => {
    const problem = pathProblem(path);
    if (problem !== undefined) {
      ctx.addIssue({ code: 'custom', message: rejectedPath(path, problem) });
    }
  });

const idSchema = z.string().min(1).max(64);

/**
 * Un credito ausente o no textual se convierte en cadena vacia solo para que el
 * `superRefine` del asset informe `asset "<id>": campo credit vacio o ausente`.
 * La entrada valida se devuelve sin tocar.
 */
function normalizeMissingCredit(input: unknown): unknown {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if (typeof record['credit'] !== 'string') return { ...record, credit: '' };
  }
  return input;
}

interface AssetCore {
  id: string;
  path: string;
  credit: string;
}

function checkAsset(asset: AssetCore, ctx: z.RefinementCtx, extensions: readonly string[]): void {
  const credit = asset.credit.trim().length;
  if (credit < 1 || credit > 500) {
    ctx.addIssue({
      code: 'custom',
      path: ['credit'],
      message:
        credit < 1
          ? `asset "${asset.id}": campo credit vacío o ausente`
          : `asset "${asset.id}": campo credit supera 500 caracteres`,
    });
  }
  if (pathProblem(asset.path) === undefined && !extensions.some((e) => asset.path.endsWith(e))) {
    ctx.addIssue({
      code: 'custom',
      path: ['path'],
      message: rejectedPath(asset.path, `extensión no permitida (se espera ${extensions.join(', ')})`),
    });
  }
}

const core = { id: idSchema, path: assetPathSchema, credit: z.string() };

export const ModelAssetSchema = z.preprocess(
  normalizeMissingCredit,
  z
    .strictObject({
      ...core,
      unitsToMeters: z.number().optional(),
      upAxis: z.string().optional(),
      nodes: z.array(z.string()).optional(),
      polygons: z.number().optional(),
      license: z.string().optional(),
    })
    .superRefine((asset, ctx) => checkAsset(asset, ctx, MODEL_EXTENSIONS)),
);
export const TextureAssetSchema = z.preprocess(
  normalizeMissingCredit,
  z.strictObject({ ...core }).superRefine((asset, ctx) => checkAsset(asset, ctx, TEXTURE_EXTENSIONS)),
);
export const AudioAssetSchema = z.preprocess(
  normalizeMissingCredit,
  z.strictObject({ ...core }).superRefine((asset, ctx) => checkAsset(asset, ctx, AUDIO_EXTENSIONS)),
);
/** Manifest de `public/assets/manifest.json`. Las secciones son opcionales y no se rellenan por defecto. */
export const ManifestSchema = z
  .strictObject({
    version: z.literal(1),
    models: z.array(ModelAssetSchema).optional(),
    textures: z.array(TextureAssetSchema).optional(),
    audio: z.array(AudioAssetSchema).optional(),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const kind of ASSET_KINDS) {
      const assets = manifest[kind];
      if (assets === undefined) continue;
      assets.forEach((asset, index) => {
        if (seen.has(asset.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [kind, index, 'id'],
            message: `asset "${asset.id}": id duplicado`,
          });
        }
        seen.add(asset.id);
      });
    }
  });

export type Manifest = z.infer<typeof ManifestSchema>;
