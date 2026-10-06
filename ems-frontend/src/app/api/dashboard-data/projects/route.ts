import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { fetchUpstreamJson } from '../_shared';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const result = await fetchUpstreamJson(request, '/projects');
  if (result.response) {
    return result.response;
  }

  const projects = Array.isArray(result.data)
    ? result.data.map((project) =>
        project && typeof project === 'object'
          ? { ...project, tasks: [] }
          : project,
      )
    : result.data;

  return NextResponse.json(projects);
}
