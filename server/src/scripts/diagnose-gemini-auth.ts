import axios, { AxiosError } from 'axios';
import { env } from '../config/env';

interface GoogleErrorDetail {
  reason?: string;
  metadata?: {
    service?: string;
    methodName?: string;
    method?: string;
  };
}

interface GoogleErrorBody {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: GoogleErrorDetail[];
  };
}

/**
 * Minimal, server-only Gemini authentication probe.
 *
 * It intentionally uses the same endpoint, environment variable, and
 * x-goog-api-key mechanism as the production providers. The credential is
 * never included in output, even on failure.
 */
async function main(): Promise<void> {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;

  if (!apiKey) {
    console.error(JSON.stringify({
      ok: false,
      message: 'GEMINI_API_KEY is empty',
    }));
    process.exitCode = 1;
    return;
  }

  try {
    const { data, status } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: 'Respond with OK.' }] }],
        generationConfig: { maxOutputTokens: 32 },
      },
      {
        timeout: 45_000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
      },
    );

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('')
      .trim();

    console.log(JSON.stringify({ ok: true, httpStatus: status, model, text }));
  } catch (error) {
    const response = (error as AxiosError<GoogleErrorBody>).response;
    const googleError = response?.data?.error;
    const details = googleError?.details?.map((detail) => ({
      reason: detail.reason,
      service: detail.metadata?.service,
      methodName: detail.metadata?.methodName ?? detail.metadata?.method,
    }));

    console.error(JSON.stringify({
      ok: false,
      httpStatus: response?.status,
      code: googleError?.code,
      status: googleError?.status,
      message: googleError?.message ?? (error as Error).message,
      details,
    }));
    process.exitCode = 1;
  }
}

void main();
