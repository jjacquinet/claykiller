import { NextRequest, NextResponse } from 'next/server';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not configured');
  return key;
}

// GET /api/apollo?action=lists&modality=contacts|accounts
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  const modality = req.nextUrl.searchParams.get('modality') ?? 'contacts';

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

      // Filter by modality (contacts for people, accounts for companies) and sort alphabetically
      const filtered = (Array.isArray(lists) ? lists : [])
        .filter((l: { modality?: string }) => l.modality === modality)
        .sort((a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
        .map((l: { id: string; name: string; cached_count: number }) => ({
          id: l.id,
          name: l.name,
          count: l.cached_count,
        }));

      return NextResponse.json({ lists: filtered });
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

// POST /api/apollo  — fetch contacts or accounts from a saved list (paginated)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, listId } = body;

    if (!listId || (action !== 'contacts' && action !== 'accounts')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const apiKey = getApiKey();

    if (action === 'contacts') {
      const allContacts: ApolloContact[] = [];
      let page = 1;
      const perPage = 100;
      let totalPages = 1;

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
        allContacts.push(...(data.contacts || []).map(mapContact));
        totalPages = data.pagination?.total_pages ?? 1;
        page++;
      }

      return NextResponse.json({ contacts: allContacts, total: allContacts.length });
    }

    // action === 'accounts'
    const allAccounts: ApolloAccount[] = [];
    let page = 1;
    const perPage = 100;
    let totalPages = 1;

    while (page <= totalPages && page <= 500) {
      const res = await fetch(`${APOLLO_BASE}/accounts/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          account_label_ids: [listId],
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
      allAccounts.push(...(data.accounts || []).map(mapAccount));
      totalPages = data.pagination?.total_pages ?? 1;
      page++;
    }

    return NextResponse.json({ accounts: allAccounts, total: allAccounts.length });
  } catch (err) {
    console.error('Apollo error:', err);
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

// ── Account types & mapper ──

interface ApolloRawAccount {
  name?: string | null;
  website_url?: string | null;
  domain?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  industry?: string | null;
  founded_year?: number | null;
  estimated_num_employees?: number | null;
  short_description?: string | null;
  seo_description?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface ApolloAccount {
  company_name: string;
  website: string;
  location: string;
  headcount: string;
  description: string;
  phone: string;
  linkedin_url: string;
  domain: string;
  industry: string;
  founded_year: string;
}

function mapAccount(raw: ApolloRawAccount): ApolloAccount {
  return {
    company_name: raw.name ?? '',
    website: raw.website_url ?? raw.domain ?? '',
    location: [raw.city, raw.state, raw.country].filter(Boolean).join(', '),
    headcount: raw.estimated_num_employees ? String(raw.estimated_num_employees) : '',
    description: raw.short_description ?? raw.seo_description ?? '',
    phone: raw.phone ?? '',
    linkedin_url: raw.linkedin_url ?? '',
    domain: raw.domain ?? '',
    industry: raw.industry ?? '',
    founded_year: raw.founded_year ? String(raw.founded_year) : '',
  };
}
