import { NextRequest, NextResponse } from 'next/server';
import { AI_AGENT_VERSION } from '@/lib/aiAgent';
import { AgentValidationError, previewItemForAction, validateAndExpandAgentActions } from '@/lib/aiAgentServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { actions, config } = await validateAndExpandAgentActions(body.actions);
    if (!actions.length) return NextResponse.json({ error: 'No applicable changes were found.' }, { status: 400 });
    return NextResponse.json({
      plan: {
        version: AI_AGENT_VERSION,
        summary: typeof body.summary === 'string' ? body.summary.trim().slice(0, 240) : 'Review the proposed app changes',
        actions,
        previewItems: actions.map(action => previewItemForAction(action, config)),
      },
    });
  } catch (error) {
    if (error instanceof AgentValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[ai-agent preview POST]', error);
    return NextResponse.json({ error: 'Could not preview these changes.' }, { status: 500 });
  }
}
