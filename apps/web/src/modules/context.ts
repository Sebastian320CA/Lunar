import type {
  EphemerisService,
  I18nApi,
  Language,
  LunarSite,
  ReportData,
  SceneApi,
  SceneMode,
  SiteMetrics,
  SolarPanelViewApi,
  TerrainService,
  TimeController,
  Unsubscribe,
  UtcString,
  Vec3,
} from '@lunar/contracts';

/** Escena con las funciones extra de `@lunar/scene3d` (SceneHandle) que usa el Shell. */
export interface WebScene extends SceneApi {
  focusSite?(siteId: string): void;
  landAt?(siteId: string): void;
  setSelectedSite?(siteId: string | null): void;
  getMode?(): SceneMode;
  onModeChange?(cb: (mode: SceneMode) => void): Unsubscribe;
  zoom?(delta: number): void;
  orbitBy?(dAzimuth: number, dPolar: number): void;
  viewEarth?(): void;
  viewMoon?(): void;
  getFocusBody?(): 'moon' | 'earth';
}

/** Control de tiempo de `@lunar/sites` (LunarTimeController) con saltos por dia lunar y eventos. */
export interface WebTime extends TimeController {
  stepLunarDays?(n: number): { ok: true; value: UtcString } | { ok: false; error: string };
  jumpToNext?(
    site: LunarSite,
    kind: 'sunrise' | 'sunset' | 'earthrise',
  ): Promise<{ ok: true; value: UtcString } | { ok: false; error: string }>;
}

/** i18n con las funciones extra de `@lunar/i18n`. */
export type WebI18n = I18nApi & {
  addResources(ns: string, dict: Record<string, Record<string, string>>): void;
  getLanguage?(): Language;
  tv?(key: string, vars?: Record<string, string | number>): string;
  dir?(): 'ltr' | 'rtl';
};

export interface WebServices {
  sites?: { list(): LunarSite[]; add(site: LunarSite): void };
  ephemeris?: EphemerisService;
  ephemerisMeta?: { source: string; approximate: boolean; note: string };
  terrain?: TerrainService;
  /** Sol unitario en el marco Moon-fixed ME (+X Tierra, +Y este, +Z norte). */
  sunDirection?: (utc: string) => Vec3;
  /** Tierra unitaria en el marco Moon-fixed ME. */
  earthDirection?: (utc: string) => Vec3;
  scene?: WebScene;
  i18n?: WebI18n;
  time?: WebTime;
  solarView?: () => SolarPanelViewApi;
  exportReport?: (data: ReportData) => Promise<Uint8Array>;
  metrics?: (site: LunarSite, startUtc: string, endUtc: string, stepMin: number) => Promise<SiteMetrics>;
}

export interface WebContext {
  readonly demo: boolean;
  readonly services: WebServices;
  /** Resolves under /assets. */
  readonly assetUrl: (relativePath: string) => string;
  /** Resolves files from /data via Vite glob; undefined if the file is absent. */
  readonly dataUrl: (relativePath: string) => string | undefined;
}

export interface WebModule {
  id: string;
  setup(ctx: WebContext): Promise<void> | void;
}

const dataFiles = import.meta.glob(
  [
    '../../../../data/ephemeris/ephemeris.{json,bin}',
    '../../../../data/sites/*.json',
    '../../../../data/terrain/*.json',
  ],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

const DATA_PREFIX = '../../../../data/';

export function createContext({ demo }: { demo: boolean }): WebContext {
  return {
    demo,
    services: {},
    assetUrl: (relativePath) => `/assets/${relativePath.replace(/^\/+/, '')}`,
    dataUrl: (relativePath) => dataFiles[DATA_PREFIX + relativePath.replace(/^\/+/, '')],
  };
}
