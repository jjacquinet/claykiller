import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface VerifyRequest {
  email: string;
  rowId: string;
  columnId: string;
}

interface VerifyResponse {
  status: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: VerifyRequest = await req.json();
    const { email, rowId, columnId } = body;

    if (!email || !rowId || !columnId) {
      return NextResponse.json(
        { status: '', error: 'Missing required fields' } satisfies VerifyResponse,
        { status: 400 },
      );
    }

    const apiKey = process.env.ZEROBOUNCE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { status: '', error: 'ZeroBounce API key not configured' } satisfies VerifyResponse,
        { status: 500 },
      );
    }

    // Call ZeroBounce single email validation API
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&ip_address=`;
    const res = await fetch(url);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ZeroBounce API error (${res.status}): ${errText}`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(`ZeroBounce error: ${data.error}`);
    }

    // Build a concise status string: "valid", "invalid", "catch-all", etc.
    // Include sub_status if present for more detail
    let value = data.status || 'unknown';
    if (data.sub_status) {
      value = `${value} (${data.sub_status})`;
    }

    // Save to Supabase
    const supabase = createServiceClient();
    const { error: dbError } = await supabase.from('cell_values').upsert(
      {
        row_id: rowId,
        column_id: columnId,
        value,
      },
      { onConflict: 'row_id,column_id' },
    );

    if (dbError) {
      console.error('DB upsert error:', dbError);
      return NextResponse.json(
        { status: '', error: 'Failed to save result' } satisfies VerifyResponse,
        { status: 500 },
      );
    }

    return NextResponse.json({ status: value } satisfies VerifyResponse);
  } catch (err) {
    console.error('Verify email error:', err);
    return NextResponse.json(
      { status: '', error: 'Internal server error' } satisfies VerifyResponse,
      { status: 500 },
    );
  }
}
