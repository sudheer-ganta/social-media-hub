import { describe, expect, it } from 'vitest';
import { collectCampaignCopy } from './campaign-creative.prompt';

const direction = (over: Record<string, unknown>) =>
  ({ copyTreatment: 'headline_support', headline: 'Beat the finish line.', supportingLine: '', ...over }) as never;

describe('image-direction wording never reaches the visible copy', () => {
  it('drops a line that is really an instruction about framing the picture', () => {
    const lines = collectCampaignCopy(direction({
      supportingLine: 'Lavish grazing table with artisan cheeses, figs and sourdough filling the frame',
    }));
    expect(lines.map((l) => l.text)).toEqual(['Beat the finish line.']);
  });

  it.each([
    'A macro field of cheese, edge to edge',
    'Full-bleed photograph of the rooftop',
    'Fruit covering the entire canvas',
  ])('drops "%s"', (support) => {
    const lines = collectCampaignCopy(direction({ supportingLine: support }));
    expect(lines.some((l) => l.text === support)).toBe(false);
  });

  it('keeps ordinary copy that happens to use similar words', () => {
    const lines = collectCampaignCopy(direction({ supportingLine: 'Fill your frame with colour this weekend' }));
    expect(lines.map((l) => l.text)).toContain('Fill your frame with colour this weekend');
    const edge = collectCampaignCopy(direction({ supportingLine: 'From the edge of the city to the edge of the sea' }));
    expect(edge.map((l) => l.text)).toContain('From the edge of the city to the edge of the sea');
  });
});
