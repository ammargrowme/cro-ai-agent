# API Schemas Reference

> Full JSON schemas for the CRO AI Agent report and chat responses. Referenced from CLAUDE.md.

## Report Schema

The main audit report object returned by `api/analyze.js`:

```json
{
  "overall_score": 72,
  "summary": "...",
  "strengths": ["...", "..."],
  "quick_wins": ["...", "..."],
  "recommendations": [{
    "id": 1,
    "priority": "High",
    "category": "CTA",
    "issue": "...",
    "recommendation": "...",
    "expected_impact": "...",
    "implementation": "...",
    "checklist_ref": "CTA visible above the fold"
  }],
  "competitor_analysis": { "overview": "", "comparisons": [] },
  "checklist_scores": {
    "seo_alignment": 65,
    "above_the_fold": 80,
    "cta_focus": 45,
    "content_structure": 70,
    "visual_hierarchy": 55,
    "mobile_optimization": 60,
    "trust_proof": 40,
    "forms_interaction": 75,
    "performance_qa": 85,
    "content_standards": 50
  },
  "checklist_flags": ["No FAQ section present", "CTA text is vague 'Submit'"],
  "audit_metadata": {
    "url": "https://example.com",
    "timestamp": "2026-03-18T...",
    "had_screenshot": true,
    "had_learnings": true,
    "duration_ms": 15234
  }
}
```

### Report Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `overall_score` | number (0-100) | Aggregate CRO score |
| `summary` | string | Executive summary (max 60 words) |
| `strengths` | string[] | What the site does well |
| `quick_wins` | string[] | Easy improvements |
| `recommendations` | object[] | 3-10 prioritized recommendations |
| `recommendations[].id` | number | Sequential ID |
| `recommendations[].priority` | string | "High", "Medium", or "Low" |
| `recommendations[].category` | string | One of: CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms |
| `recommendations[].checklist_ref` | string | Which checklist item this addresses |
| `competitor_analysis` | object | Competitor comparison data (populated when competitor URLs provided) |
| `checklist_scores` | object | 10 category scores (0-100 each) |
| `checklist_flags` | string[] | Top 5 critical checklist failures |
| `audit_metadata` | object | Audit context (URL, timestamp, flags, duration) |

## Chat Response Schema

Returned by `api/chat.js`:

```json
{
  "message": "The AI's conversational response",
  "updated_report": null,
  "learning_insight": "Sites without sticky CTA lose 20-30% mobile conversions"
}
```

### Chat Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | The AI's conversational response text |
| `updated_report` | object or null | Full report object if changes were made, `null` otherwise |
| `learning_insight` | string or null | Reusable CRO insight if conversation reveals one, `null` otherwise |
