/**
 * AIProvider interface — the abstraction layer for AI backends.
 *
 * In Phase 1 the "provider" is Make.com (the frontend writes settings to
 * Supabase and Make handles Gemini). This interface is a placeholder that
 * documents the contract so that adding a local provider (e.g. direct
 * OpenAI/Gemini calls for power users who supply their own key) is a
 * one-file change without touching UI components.
 */

import type { MarketingStudioRequest } from "@/ai/types";

export interface AIProviderResponse {
  ok: boolean;
  error?: string;
}

export interface AIProvider {
  /**
   * Trigger AI generation for a post.
   * In the Make.com provider this means updating the DB to start the webhook.
   */
  triggerGeneration(
    postId: string,
    settings: MarketingStudioRequest
  ): Promise<AIProviderResponse>;

  /** Human-readable name shown in the UI */
  readonly name: string;
  /** Whether this provider makes direct API calls (vs. server-side via Make) */
  readonly isClientSide: boolean;
}
