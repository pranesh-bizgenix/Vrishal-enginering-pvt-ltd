import type { NextRequest } from 'next/server';

const UPSTREAM_API_URL = 'https://tms.sjsangath.com/api';

export async function fetchUpstreamJson(
  request: NextRequest,
  path: string,
) {
  const headers = new Headers({ accept: 'application/json' });
  const authorization = request.headers.get('authorization');

  if (authorization) {
    headers.set('authorization', authorization);
  }

  const response = await fetch(`${UPSTREAM_API_URL}${path}`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    return {
      response: new Response(await response.arrayBuffer(), {
        status: response.status,
        headers: {
          'content-type':
            response.headers.get('content-type') || 'application/json',
        },
      }),
    };
  }

  return { data: await response.json() };
}

export function compactTask<T>(task: T): T {
  if (!task || typeof task !== 'object') {
    return task;
  }

  const record = task as Record<string, unknown>;
  const media = Array.isArray(record.media)
    ? record.media.map((item) => {
        if (!item || typeof item !== 'object') {
          return item;
        }

        return { ...item, url: '' };
      })
    : record.media;

  return { ...record, media } as T;
}
