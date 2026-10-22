import logger from '../utils/logger';

export interface AiGoalReviewInput {
    title: string;
    description: string;
    metricType: string;
    unit?: string;
    baselineValue: number;
    targetValue: number;
    companyTargetTitle?: string;
    targetDate: Date | string;
    designation?: string;
    department?: string;
}

export interface AiGoalReviewResult {
    status: 'PASS' | 'FLAGGED' | 'NEEDS_REVISION';
    feasibility: 'REALISTIC' | 'UNREALISTIC' | 'NEEDS_REVISION';
    complianceScore: number; // 0 - 100
    feedback: string;
    suggestedAdjustments?: string;
    isUnrealistic: boolean;
    reviewedAt: Date;
}

/**
 * Heuristic fallback evaluation when Gemini API is unavailable or offline
 */
function heuristicGoalReview(input: AiGoalReviewInput): AiGoalReviewResult {
    const baseline = Number(input.baselineValue) || 0;
    const target = Number(input.targetValue) || 0;
    const title = (input.title || '').trim();
    const desc = (input.description || '').trim();

    let score = 70;
    let isUnrealistic = false;
    let feedback = '';
    let suggestions = '';

    // Sanity check: Extreme multi-fold increase (e.g. 50-fold jump)
    if (baseline > 0 && target >= baseline * 15) {
        isUnrealistic = true;
        score = 35;
        feedback = `Target value (${target}) represents a ${Math.round(target / baseline)}x jump from the baseline (${baseline}), which is statistically unrealistic for a single cycle.`;
        suggestions = `Scale target to a realistic 15% - 40% growth increment or split into phased multi-year milestones.`;
    } else if (baseline === 0 && target > 10000000 && !input.companyTargetTitle?.toLowerCase().includes('billion')) {
        isUnrealistic = true;
        score = 40;
        feedback = `Target of ${target} starting from zero baseline has a high risk of being unrealistic without historical proof.`;
        suggestions = `Provide a measurable pilot target first.`;
    } else {
        if (title.length >= 10 && desc.length >= 25) score += 15;
        if (input.companyTargetTitle) score += 15;
        score = Math.min(100, score);
        feedback = `Goal meets core SMART parameters with measurable metrics (${baseline} -> ${target} ${input.unit || ''}) aligned with ${input.companyTargetTitle || 'company objectives'}.`;
        suggestions = `Maintain documented weekly milestone logs.`;
    }

    return {
        status: isUnrealistic ? 'FLAGGED' : score >= 75 ? 'PASS' : 'NEEDS_REVISION',
        feasibility: isUnrealistic ? 'UNREALISTIC' : score >= 75 ? 'REALISTIC' : 'NEEDS_REVISION',
        complianceScore: score,
        feedback,
        suggestedAdjustments: suggestions,
        isUnrealistic,
        reviewedAt: new Date(),
    };
}

/**
 * Perform automated AI pre-review using Gemini AI Vision/Text endpoint
 */
export async function performAiGoalReview(input: AiGoalReviewInput): Promise<AiGoalReviewResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.info('[AiGoalReview] GEMINI_API_KEY not present; using heuristic review engine.');
        return heuristicGoalReview(input);
    }

    try {
        const prompt = `You are an expert HR Organizational Psychologist and Corporate Strategy Auditor.
Evaluate the following employee performance goal for strict SMART criteria compliance (Specific, Measurable, Attainable, Realistic, Time-bound) and company target alignment:

EMPLOYEE GOAL DETAILS:
- Title: "${input.title}"
- Description: "${input.description}"
- Department: "${input.department || 'General'}"
- Designation: "${input.designation || 'Staff'}"
- Metric Type: ${input.metricType}
- Unit: "${input.unit || ''}"
- Baseline Value: ${input.baselineValue}
- Target Value: ${input.targetValue}
- Company Target Aligned: "${input.companyTargetTitle || 'Not specified'}"
- Target Due Date: ${input.targetDate}

AUDIT RULES:
1. SPECIFIC & MEASURABLE: Is the metric clearly defined and trackable?
2. ATTAINABLE & REALISTIC SANITY CHECK: Flag and reject unrealistic goals (e.g. 50-fold / 5000% jump in revenue or targets that exceed human/operational capacity). Realistic growth in corporate KPIs is typically 10% - 60%.
3. COMPANY ALIGNMENT: Does it support the stated company target?

Respond with ONLY a valid raw JSON object strictly matching this schema (no markdown formatting, no code blocks):
{
  "complianceScore": <number 0 to 100>,
  "feasibility": <"REALISTIC" | "UNREALISTIC" | "NEEDS_REVISION">,
  "status": <"PASS" | "FLAGGED" | "NEEDS_REVISION">,
  "isUnrealistic": <boolean>,
  "feedback": "<2-3 sentence clear critique on SMART compliance and feasibility>",
  "suggestedAdjustments": "<specific concrete advice on how to adjust targets to be attainable>"
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.2,
                },
            }),
        });

        if (!response.ok) {
            logger.warn(`[AiGoalReview] Gemini API returned HTTP ${response.status}. Falling back to heuristic.`);
            return heuristicGoalReview(input);
        }

        const data = (await response.json()) as any;
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) return heuristicGoalReview(input);

        const cleanJson = rawText.replace(/^```json/m, '').replace(/```$/m, '').trim();
        const parsed = JSON.parse(cleanJson);

        return {
            status: parsed.status === 'PASS' ? 'PASS' : parsed.isUnrealistic ? 'FLAGGED' : 'NEEDS_REVISION',
            feasibility: parsed.feasibility || (parsed.isUnrealistic ? 'UNREALISTIC' : 'REALISTIC'),
            complianceScore: Math.max(0, Math.min(100, Number(parsed.complianceScore) || 70)),
            feedback: parsed.feedback || 'Goal evaluated against SMART criteria.',
            suggestedAdjustments: parsed.suggestedAdjustments || '',
            isUnrealistic: Boolean(parsed.isUnrealistic || parsed.feasibility === 'UNREALISTIC'),
            reviewedAt: new Date(),
        };
    } catch (err: any) {
        logger.error('[AiGoalReview] Error in Gemini AI pre-review:', err.message || err);
        return heuristicGoalReview(input);
    }
}
