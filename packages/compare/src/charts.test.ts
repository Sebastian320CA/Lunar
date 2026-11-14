import { describe, expect, it } from 'vitest';
import type { LunarSite, SiteMetrics } from '@lunar/contracts';
import { barChartSvg, escapeSvg, sensitivityLineSvg } from './charts.js';
import { compareMetrics, sensitivity, type Scenario } from './core.js';

const m = (o: Partial<SiteMetrics> = {}): SiteMetrics => ({
  maxSunElevationDeg: 10,
  sunlitFraction: 0.5,
  longestLightHours: 100,
  longestDarkHours: 100,
  earthVisibleFraction: 0.5,
  longestCommsWindowHours: 100,
  longestCommsGapHours: 100,
  demResolutionM: 20,
  ...o,
});
const sc = (id: string): Scenario => ({ siteId: id, utcStart: '2030-01-01T00:00:00Z', utcEnd: '2030-02-01T00:00:00Z' });
const site: LunarSite = { id: 's', name: 'S', program: 'custom', latDeg: 10, lonDeg: 0, source: 't', verified: true };

describe('barChartSvg', () => {
  it.each([1, 2, 3])('draws %i bars for %i scenarios', async (n) => {
    const scenarios = ['a', 'b', 'c'].slice(0, n).map(sc);
    const cmp = await compareMetrics(scenarios, async (s) => m({ sunlitFraction: s.siteId === 'a' ? 0.2 : 0.8 }));
    const svg = barChartSvg(cmp.sideBySide, 'sunlitFraction');
    expect(svg.match(/class="bar"/g)?.length).toBe(n);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('escapes labels and title', async () => {
    const cmp = await compareMetrics([sc('a')], async () => m());
    const svg = barChartSvg(cmp.sideBySide, 'sunlitFraction', ['<script>"x"&</script>'], '<b>t</b>');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;script&gt;');
    expect(escapeSvg(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('sensitivityLineSvg', () => {
  it('draws a km and a days line with finite coordinates', async () => {
    const entries = await sensitivity(
      site,
      [-5, 5],
      [-1, 1],
      async (s) => m({ sunlitFraction: 0.5 + s.latDeg / 1000 }),
      { utcStart: '2030-01-01T00:00:00Z', utcEnd: '2030-02-01T00:00:00Z' },
    );
    const svg = sensitivityLineSvg(entries, 'sunlitFraction');
    expect(svg.match(/class="line"/g)?.length).toBe(2);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('handles base only', async () => {
    const entries = await sensitivity(site, [], [], async () => m(), { utcStart: 'a', utcEnd: 'b' });
    expect(sensitivityLineSvg(entries, 'sunlitFraction')).not.toMatch(/NaN/);
  });
});
