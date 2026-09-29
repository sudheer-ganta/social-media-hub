import { describe, it, expect, vi } from 'vitest';
import { sanitizeAndFilterCopy, isInternalMetadata, sanitizeCopyText } from '../intent/copy-sanitizer';
import { classifyCriticFailure } from './critic-recovery';
import { isTransientDbError, withDbRetry } from '../../utils/db-resilience';
import { normaliseIntent } from '../generators/creative-intent.generator';
import type { RenderCriticEvaluation } from '../generators/design-critic.generator';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';

describe('Creative Generation Stability & Pipeline Resilience', () => {
  describe('1. Copy Classification & Sanitization Gate', () => {
    it('1. internal draft label like "diwali post" is identified as internal metadata', () => {
      expect(isInternalMetadata('diwali post')).toBe(true);
      expect(isInternalMetadata('Diwali Post')).toBe(true);
      expect(isInternalMetadata('instagram post')).toBe(true);
      expect(isInternalMetadata('draft label')).toBe(true);
      expect(isInternalMetadata('what is Villy')).toBe(true);
      expect(isInternalMetadata('creator-ugc')).toBe(true);
    });

    it('2. genuine user-facing claims are preserved during sanitization', () => {
      expect(isInternalMetadata('Diwali Celebration')).toBe(false);
      expect(isInternalMetadata('50% Off Everything')).toBe(false);
      expect(isInternalMetadata('Try AI 2D Wardrobe')).toBe(false);
      expect(sanitizeCopyText('Diwali Celebration')).toBe('Diwali Celebration');
      expect(sanitizeCopyText('Diwali Post')).toBe('Diwali');
    });

    it('3. filters internal metadata and formats copy with priority hierarchy', () => {
      const copy: CampaignCopyLine[] = [
        { role: 'HEADLINE', text: 'Light Up Your Look' },
        { role: 'OFFER', text: 'diwali post' }, // Internal metadata
        { role: 'SUPPORT', text: 'India\'s First AI 2D Virtual Try-On' },
        { role: 'DETAIL', text: 'What is Villy and how it works' }, // Prompt inquiry
        { role: 'CTA', text: 'Try Now' },
      ];

      const sanitized = sanitizeAndFilterCopy(copy, ['Diwali'], 3);

      expect(sanitized.some((c) => c.text.toLowerCase() === 'diwali post')).toBe(false);
      expect(sanitized.some((c) => c.text.toLowerCase().includes('what is'))).toBe(false);
      expect(sanitized.length).toBeLessThanOrEqual(3);
      expect(sanitized[0].role).toBe('HEADLINE');
      expect(sanitized[0].text).toBe('Light Up Your Look');
    });

    it('4. normaliseIntent strips format words from requiredClaims', () => {
      const rawPayload = {
        event: 'Diwali',
        requiredClaims: ['diwali post', '50% off', 'post', 'Villy App'],
      };

      const intent = normaliseIntent(rawPayload);
      expect(intent.requiredClaims).not.toContain('diwali post');
      expect(intent.requiredClaims).not.toContain('post');
      expect(intent.requiredClaims).toContain('Diwali');
      expect(intent.requiredClaims).toContain('50% off');
    });
  });

  describe('2. Critic Failure Classification & Recovery Routing', () => {
    it('5. classifies occlusion failures and routes to PLACEMENT layer with image reuse', () => {
      const criticOcclusion: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: true,
        interchangeableWithAnotherEvent: false,
        problems: [
          'Text severely occludes primary product shot (phone screen)',
          'Headline sits directly over the hero subject face',
        ],
        reasonsToReject: ['Text covers product screen'],
      };

      const analysis = classifyCriticFailure(criticOcclusion);
      expect(analysis.failures).toContain('OCCLUSION_FAILURE');
      expect(analysis.failureClass).toBe('OCCLUSION_FAILURE');
      expect(analysis.responsibleLayer).toBe('PLACEMENT');
      expect(analysis.shouldReuseImage).toBe(true);
      expect(analysis.action).toBe('CLEAR_SUBJECT');
    });

    it('6. classifies copy failures and routes to COPY layer with image reuse', () => {
      const criticCopy: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: true,
        interchangeableWithAnotherEvent: false,
        problems: [
          'Internal draft label "diwali post" left visible in final artwork.',
          'There are text blocks carrying nothing the idea needed. Cut the copy to the minimum.',
        ],
        reasonsToReject: ['Draft labels in final piece'],
      };

      const analysis = classifyCriticFailure(criticCopy);
      expect(analysis.failures).toContain('COPY_INTEGRITY_FAILURE');
      expect(analysis.failures).toContain('COPY_VOLUME_FAILURE');
      expect(analysis.failureClass).toBe('COPY_INTEGRITY_FAILURE');
      expect(analysis.responsibleLayer).toBe('COPY');
      expect(analysis.shouldReuseImage).toBe(true);
      expect(analysis.action).toBe('REBUILD_COPY');
    });

    it('7. classifies legibility failures and routes to TYPOGRAPHY layer with image reuse', () => {
      const criticLegibility: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: true,
        interchangeableWithAnotherEvent: false,
        problems: [
          'Unreadable dark blue/purple body text directly overlaid across background',
          'Low contrast makes typography hard to read',
        ],
        reasonsToReject: ['Low contrast'],
      };

      const analysis = classifyCriticFailure(criticLegibility);
      expect(analysis.failureClass).toBe('LEGIBILITY_FAILURE');
      expect(analysis.responsibleLayer).toBe('TYPOGRAPHY');
      expect(analysis.shouldReuseImage).toBe(true);
      expect(analysis.action).toBe('RECALIBRATE_CONTRAST');
    });

    it('8. classifies concept/image failures and triggers image regeneration', () => {
      const criticConcept: RenderCriticEvaluation = {
        passed: false,
        templateLook: true,
        humanCraft: false,
        singleClearIdea: false,
        layoutExpressesIdea: false,
        interchangeableWithAnotherEvent: true,
        problems: [
          'This creative would work unchanged with a completely different occasion and a swapped picture.',
        ],
        reasonsToReject: ['Interchangeable image'],
      };

      const analysis = classifyCriticFailure(criticConcept);
      expect(analysis.shouldReuseImage).toBe(false);
      expect(analysis.action).toBe('REDESIGN_CONCEPT');
    });
  });

  describe('3. Database Resilience & Degraded Context Handling', () => {
    it('9. identifies transient Prisma and network timeouts', () => {
      expect(isTransientDbError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isTransientDbError({ code: 'P1001' })).toBe(true);
      expect(isTransientDbError({ code: 'P1008' })).toBe(true);
      expect(isTransientDbError({ code: 'P2024' })).toBe(true);
      expect(isTransientDbError({ code: 'P2002' })).toBe(false); // Unique constraint violation is NOT transient
    });

    it('10. withDbRetry retries transient errors up to maxRetries then succeeds', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const err: any = new Error('Connection timed out');
          err.code = 'ETIMEDOUT';
          throw err;
        }
        return [{ id: 'brand-1', name: 'Test Brand' }];
      });

      const result = await withDbRetry(operation, { maxRetries: 3, initialBackoffMs: 10 });
      expect(result).toEqual([{ id: 'brand-1', name: 'Test Brand' }]);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('11. withDbRetry does not retry non-transient errors', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      });

      await expect(withDbRetry(operation, { maxRetries: 3, initialBackoffMs: 10 })).rejects.toThrow(
        'Unique constraint failed',
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
