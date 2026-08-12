import { NextResponse } from 'next/server';

/**
 * `GET /api/fleet-version` — the build stamp of all four services at once.
 *
 * The reason this exists rather than four client fetches: the browser would
 * cross three origins and be blocked by CORS, and opening CORS on the portals
 * to serve an internal dashboard is the wrong trade. Doing it server-side also
 * means `/api/version` can later be closed to the public without breaking this
 * page (backlog: it is anonymous today).
 *
 * Admin's own stamp is read from `process.env` directly — fetching ourselves
 * over the tunnel to learn something already in this process would be silly,
 * and would fail whenever the public hostname is down but the container is up.
 *
 * The four services are addressed by their PUBLIC urls (the same
 * NEXT_PUBLIC_* values every portal is built with) rather than compose service
 * names, so this file does not need to know whether it is running in the prod
 * or uat stack.
 */
export const dynamic = 'force-dynamic';

const CONSUMER = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';
const AUTHENTICATOR = process.env.NEXT_PUBLIC_AUTHENTICATOR_URL ?? 'http://localhost:3001';
/** ends in /api — the API mounts version at `${base}/version`, not `${base}/api/version`. */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export interface FleetEntry {
  service: 'consumer' | 'authenticator' | 'admin' | 'api';
  commit: string | null;
  builtAt: string | null;
  /** Set when the service could not be reached or answered badly. */
  error?: string;
}

async function probe(service: FleetEntry['service'], url: string): Promise<FleetEntry> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { service, commit: null, builtAt: null, error: `HTTP ${res.status}` };
    const body = await res.json();
    // An older image predating /api/version answers 404, which lands above. A
    // 200 with no commit means something else is serving this path.
    if (!body?.commit) return { service, commit: null, builtAt: null, error: 'no commit in response' };
    return { service, commit: body.commit, builtAt: body.builtAt ?? null };
  } catch (e: any) {
    return { service, commit: null, builtAt: null, error: e?.message ?? 'unreachable' };
  }
}

export async function GET() {
  const [consumer, authenticator, api] = await Promise.all([
    probe('consumer', `${CONSUMER}/api/version`),
    probe('authenticator', `${AUTHENTICATOR}/api/version`),
    probe('api', `${API.replace(/\/$/, '')}/version`),
  ]);

  const admin: FleetEntry = {
    service: 'admin',
    commit: process.env.GIT_COMMIT || 'dev',
    builtAt: process.env.BUILT_AT || null,
  };

  return NextResponse.json({ services: [consumer, authenticator, admin, api] });
}
