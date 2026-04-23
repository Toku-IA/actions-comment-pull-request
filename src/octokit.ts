import * as core from '@actions/core';
import * as github from '@actions/github';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';

const MAX_RETRIES = 3;

const RATE_LIMIT_HEADERS = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-resource',
  'x-ratelimit-used',
] as const;

function formatRateLimitHeaders(headers: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const name of RATE_LIMIT_HEADERS) {
    const value = headers[name];
    if (value !== undefined) parts.push(`${name}=${value}`);
  }
  const reset = headers['x-ratelimit-reset'];
  if (reset !== undefined) {
    const iso = new Date(Number(reset) * 1000).toISOString();
    parts.push(`reset-at=${iso}`);
  }
  return parts.join(' ');
}

export function getOctokit(token: string) {
  const octokit = github.getOctokit(
    token,
    {
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          core.warning(
            `Primary rate limit hit for ${options.method} ${options.url}. ` +
              `Retry ${retryCount + 1}/${MAX_RETRIES} after ${retryAfter}s.`,
          );
          return retryCount < MAX_RETRIES;
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          core.warning(
            `Secondary rate limit hit for ${options.method} ${options.url}. ` +
              `Retry ${retryCount + 1}/${MAX_RETRIES} after ${retryAfter}s.`,
          );
          return retryCount < MAX_RETRIES;
        },
      },
      retry: {
        retries: MAX_RETRIES,
      },
    },
    throttling,
    retry,
  );

  octokit.hook.after('request', (response, options) => {
    const summary = formatRateLimitHeaders(
      response.headers as Record<string, string | number | undefined>,
    );
    if (summary) {
      core.info(`[rate-limit] ${options.method} ${options.url} -> ${summary}`);
    }
  });

  return octokit;
}
