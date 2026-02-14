import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase/server';
import type { AiEnrichRequest, AiEnrichResponse, AiModel } from '@/lib/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ── Build system prompt shared by all models ──
function buildSystemPrompt(outputType: string, tableType: string): string {
  return `You are a data enrichment assistant. You will be given context about a ${tableType} record and must answer the user's question about it.

Rules:
- Output type is: ${outputType}
- For "text": respond with a concise text value (1-3 words ideal, max 1 sentence)
- For "number": respond with ONLY a number, no units or text
- For "boolean": respond with ONLY "true" or "false"
- Respond with ONLY the value. No explanations, no prefixes, no quotes.
- If you cannot determine the answer, respond with "N/A"`;
}

// ── Call Claude via Anthropic SDK ──
async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : 'N/A';
}

// ── Call Perplexity Sonar / Sonar Pro via OpenAI-compatible API ──
async function callPerplexity(
  model: 'sonar' | 'sonar-pro',
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Perplexity API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? 'N/A';
  return content.trim();
}

// ── Route a request to the appropriate model ──
async function callModel(
  model: AiModel,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  switch (model) {
    case 'sonar':
    case 'sonar-pro':
      return callPerplexity(model, systemPrompt, userMessage);
    case 'claude-sonnet':
    default:
      return callClaude(systemPrompt, userMessage);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: AiEnrichRequest = await req.json();
    const { columnId, rowId, prompt, outputType, rowContext, tableType, model = 'sonar' } = body;

    if (!columnId || !rowId || !prompt || !outputType || !rowContext) {
      return NextResponse.json(
        { value: '', error: 'Missing required fields' } satisfies AiEnrichResponse,
        { status: 400 },
      );
    }

    const systemPrompt = buildSystemPrompt(outputType, tableType);
    const userMessage = `Here is the data for this record:\n${JSON.stringify(rowContext, null, 2)}\n\nQuestion: ${prompt}`;

    const value = await callModel(model, systemPrompt, userMessage);

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
