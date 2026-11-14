import type {
  EphemerisService,
  I18nApi,
  LunarSite,
  ReportData,
  SceneApi,
  SiteMetrics,
  SolarPanelViewApi,
  TerrainService,
  TimeController,
  Vec3,
} from '@lunar/contracts';

export interface WebServices {
  sites?: { list(): LunarSite[]; add(site: LunarSite): void };
  ephemeris?: EphemerisService;
  ephemerisMeta?: { source: string; approximate: boolean; note: string };
  terrain?: TerrainService;
  /** Sol unitario en el marco Moon-fixed ME (+X Tierra, +Y este, +Z norte). */
  sunDirection?: (utc: string) => Vec3;
  scene?: SceneApi;
  i18n?: I18nApi & { addResources(ns: string, dict: Record<string, Record<string, string>>): void };
  time?: TimeController;
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
