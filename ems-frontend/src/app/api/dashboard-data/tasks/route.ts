import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { compactTask, fetchUpstreamJson } from '../_shared';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const result = await fetchUpstreamJson(request, '/tasks');
  if (result.response) {
    return result.response;
  }

  const tasks = Array.isArray(result.data)
    ? result.data.map(compactTask)
    : result.data;

  return NextResponse.json(tasks);
}
