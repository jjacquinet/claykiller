import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase/server';
import type { AiEnrichRequest, AiEnrichResponse } from '@/lib/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const body: AiEnrichRequest = await req.json();
    const { columnId, rowId, prompt, outputType, rowContext, tableType } = body;

    if (!columnId || !rowId || !prompt || !outputType || !rowContext) {
      return NextResponse.json(
        { value: '', error: 'Missing required fields' } satisfies AiEnrichResponse,
        { status: 400 },
      );
    }

    // Call Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You are a data enrichment assistant. You will be given context about a ${tableType} record and must answer the user's question about it.

Rules:
- Output type is: ${outputType}
- For "text": respond with a concise text value (1-3 words ideal, max 1 sentence)
- For "number": respond with ONLY a number, no units or text
- For "boolean": respond with ONLY "true" or "false"
- Respond with ONLY the value. No explanations, no prefixes, no quotes.
- If you cannot determine the answer, respond with "N/A"`,
      messages: [
        {
          role: 'user',
          content: `Here is the data for this record:\n${JSON.stringify(rowContext, null, 2)}\n\nQuestion: ${prompt}`,
        },
      ],
    });

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === 'text');
    const value = textBlock ? textBlock.text.trim() : 'N/A';

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
        { value: '', error: 'Failed to save result' } satisfies AiEnrichResponse,
        { status: 500 },
      );
    }

    return NextResponse.json({ value } satisfies AiEnrichResponse);
  } catch (err) {
    console.error('AI enrich error:', err);
    return NextResponse.json(
      { value: '', error: 'Internal server error' } satisfies AiEnrichResponse,
      { status: 500 },
    );
  }
}
