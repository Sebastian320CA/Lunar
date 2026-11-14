import { describe, expect, it } from 'vitest';
import { cumulativeEnergySvg, methodComparisonSvg, powerChartSvg, siteComparisonSvg } from './charts.js';

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('energy charts', () => {
  const series = [
    { label: 'A', values: [1, 2, 3] },
    { label: 'B', values: [3, 2, 1] },
  ];
  it('line charts have one polyline per series', () => {
    for (const svg of [powerChartSvg(series), cumulativeEnergySvg(series)]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(count(svg, /<polyline /g)).toBe(2);
      expect(svg).not.toContain('http://www.w3.org/2000/svg" xlink');
    }
  });
  it('bar charts have one bar per datum', () => {
    const data = [
      { label: 'x', value: 5 },
      { label: 'y', value: 0 },
      { label: 'z', value: 2 },
    ];
    expect(count(methodComparisonSvg(data), /class="bar"/g)).toBe(3);
    expect(count(siteComparisonSvg(data), /class="bar"/g)).toBe(3);
  });
  it('escapes labels and handles empty input', () => {
    const svg = powerChartSvg([{ label: '<script>alert(1)</script>', values: [NaN, 1] }], { title: 'a"b' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('NaN');
    expect(siteComparisonSvg([])).toContain('</svg>');
  });
});
