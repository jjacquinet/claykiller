import { NextRequest, NextResponse } from 'next/server';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not configured');
  return key;
}

// GET /api/apollo?action=lists  — returns saved people lists (contacts modality)
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'lists') {
    try {
      const apiKey = getApiKey();
      const res = await fetch(`${APOLLO_BASE}/labels`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': apiKey,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `Apollo API error (${res.status}): ${errText}` },
          { status: res.status },
        );
      }

      const lists = await res.json();

      // Filter to contacts lists only and sort alphabetically
      const contactLists = (Array.isArray(lists) ? lists : [])
        .filter((l: { modality?: string }) => l.modality === 'contacts')
        .sort((a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
        .map((l: { id: string; name: string; cached_count: number }) => ({
          id: l.id,
          name: l.name,
          count: l.cached_count,
        }));

      return NextResponse.json({ lists: contactLists });
    } catch (err) {
      console.error('Apollo lists error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Internal server error' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST /api/apollo  — fetch contacts from a saved list (paginated)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, listId } = body;

    if (action !== 'contacts' || !listId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const apiKey = getApiKey();
    const allContacts: ApolloContact[] = [];
    let page = 1;
    const perPage = 100;
    let totalPages = 1;

    // Paginate through all contacts in the list
    while (page <= totalPages && page <= 500) {
      const res = await fetch(`${APOLLO_BASE}/contacts/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          contact_label_ids: [listId],
          per_page: perPage,
          page,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `Apollo API error (${res.status}): ${errText}` },
          { status: res.status },
        );
      }

      const data = await res.json();
      const contacts: ApolloContact[] = (data.contacts || []).map(mapContact);
      allContacts.push(...contacts);

      totalPages = data.pagination?.total_pages ?? 1;
      page++;
    }

    return NextResponse.json({ contacts: allContacts, total: allContacts.length });
  } catch (err) {
    console.error('Apollo contacts error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── Types & helpers ──

interface ApolloRawContact {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  organization_name?: string | null;
  account?: {
    website_url?: string | null;
    name?: string | null;
  } | null;
  phone_numbers?: Array<{ raw_number?: string }>;
  present_raw_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface ApolloContact {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  linkedin_url: string;
  company_name: string;
  company_website: string;
  phone: string;
  location: string;
}

function mapContact(raw: ApolloRawContact): ApolloContact {
  const phone = raw.phone_numbers?.[0]?.raw_number ?? '';
  const location =
    raw.present_raw_address ??
    [raw.city, raw.state, raw.country].filter(Boolean).join(', ');

  return {
    first_name: raw.first_name ?? '',
    last_name: raw.last_name ?? '',
    email: raw.email ?? '',
    title: raw.title ?? '',
    linkedin_url: raw.linkedin_url ?? '',
    company_name: raw.organization_name ?? raw.account?.name ?? '',
    company_website: raw.account?.website_url ?? '',
    phone: phone,
    location: location ?? '',
  };
}
