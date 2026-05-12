// ─── CXL CRO KNOWLEDGE BASE ──────────────────────────────────
// Distilled from the GrowMe CRO training docs (CRO Training.docx,
// CRO Training Overview.docx, CRO Training Notes_.docx) which
// reference CXL Institute courses on persuasive design, landing
// page optimization, and heuristic evaluation.
//
// Injected into the analyze, recommendations, per-page, chat, and
// form-friction prompts alongside CRO_CHECKLIST. The agent uses
// these heuristics to ground its reasoning in research-backed CRO
// principles instead of generic advice.
//
// Underscore prefix prevents Vercel from treating this file as an
// API endpoint.

export const CXL_PRINCIPLES = `
## CXL CRO PRINCIPLES — research-backed framework

Use these alongside the checklist above. The checklist is WHAT to score;
these are WHY each item matters. Reference these principles by name in
recommendations so the operator can trace the reasoning back to the
training material.

### Persuasive Design (5 principles)
- Clarity: brains process visuals faster than words. Make it easy for
  people to find what they want and what you do. For physical products,
  show the product in use — don't describe it.
- Visual Appeal: 94% of website first impressions are about design, not
  content. Users prefer low visual complexity and high prototypicality
  (familiar layouts). Visual appeal beats usability for perception.
- Visual Hierarchy: biggest = most important. Color-contrast the primary
  action against the rest of the layout. Use whitespace to direct
  attention. Rank elements by business objective.
- Conserve Attention: 80% of viewing time is above the fold. 69% of
  attention is on the left half. Walls of text kill attention — cap
  paragraphs at 3-4 lines and break with subheads. Patterns get ignored
  after they're recognized, so break them.
- One Action Per Screen, When Ready: people don't act until they know
  what the thing is and why it's useful. A test removed the buy button
  from above the fold and sales went UP — premature CTAs kill motivation.

### Home Page
- Two goals: (1) communicate the value proposition, (2) move users off
  the home page into the funnel toward the Most Wanted Action.
- Value prop must answer: What can I do here? Why should I do it? How is
  this better/different than other offers?
- Short, scannable home pages that drive to the funnel can yield 300%
  more sign-ups vs information-dense home pages.

### Web Forms — Friction Reduction
- Set clear expectations: tell users what happens after submit (call
  timing, what they'll receive, "takes 30 seconds", "30-min consult").
  Hidden steps cause drop-off.
- Minimize fields. Avoid optional fields. Less fields → more conversions.
- Sometimes longer forms outperform — they qualify leads (e.g., a budget
  selector weeds out unqualified). A/B test both.
- Split long forms into short sections. Capture the lead in step 1 so
  drop-offs are still recoverable for follow-up.
- Inline labels (label INSIDE the field, replacing placeholder) are BAD.
- Inline validation (real-time green checkmark/red error per field) is
  GOOD and raises completions.

### CTAs / Buttons
- "I want to ___" formula: finish the sentence with the CTA copy. If it
  doesn't fit, the copy is wrong.
- One primary CTA per page, repeated. All instances should lead to the
  same action.
- Different color from the rest of the layout. A/B testing the color
  itself is mostly waste — what matters is CONTRAST against the layout.
- The button outcome must match the label: "Call Us" must dial, not open
  a contact form. Mismatch is one of the highest-impact errors.
- CTA copy should show what happens, convey benefit, or contain a
  trigger word. Avoid Submit / Click Here / Buy Now / Send.

### FAQs
- The goal is to ELIMINATE the need for FAQs by answering the questions
  in the body copy.
- When FAQs are needed, treat the questions as direct evidence of real
  objections — mine them for headline, hero, and section copy.

### Landing Page Structure
- Information hierarchy: most important info closer to the top.
- First 2 mobile screenfuls are the page — treat them as a separate
  section. Most users will only see this.
- Awareness level dictates content density: less-aware users need more
  education before they'll act.

### Awareness Levels (Schwartz, 5 levels)
1. Unaware — no problem awareness. Educate about the problem; don't sell
   the solution yet. Rare for paid traffic.
2. Problem aware — empathize with the pain, introduce a solution
   category.
3. Solution aware — focus on differentiation and benefits vs other
   solutions.
4. Product aware — they know you exist but aren't convinced. Address
   barriers, raise motivation, prove value.
5. Most aware — final push: special offers, urgency, scarcity.

The single biggest landing-page mistake is content/awareness MISMATCH.
Higher-risk / higher-price conversion goals need more reassurance and
information than low-risk/cheap ones.

### User Friction (3 types)
- Interaction friction: practical UX issues — broken elements, confusing
  navigation, unclear flow.
- Cognitive friction: layout/contrast issues, walls of text, jargon,
  icons that don't make sense, small fonts. Increases mental effort.
- Emotional friction: page doesn't match the ad, sneaky pricing, vague
  messaging, doesn't address main questions, asks for too much info too
  soon, wrong awareness level.

### Heuristic Evaluation (3 lenses)
- Relevance: does this page feel like a follow-up to the ad / search /
  source that brought the user here? Users fill in missing info with
  their own beliefs — your page has a "body language" they read in
  seconds. Message match between ad and landing page is essential.
- Trust: design quality + social proof + brand cues. Authority badges,
  recognizable logos, credentials, specific (not generic) testimonials.
- Stimulance: positive motivation to cross from pre-action to action.
  Value proposition is the reason for action. Cost-vs-benefit ratio must
  favor benefit. Scarcity and urgency stimulate action when honest.

### Fast vs Slow Thinking (Kahneman)
- System 1 (fast / intuitive / default): runs the show on landing pages.
  Mental shortcuts, cognitive biases, framing-sensitive.
- System 2 (slow / deliberate): users rarely engage it on landing pages.
- Cognitive load: simplify pages. Reduce decisions per screen. The page
  should be understandable in one glance.
- Framing example: "90% survival rate" vs "10% mortality rate" — same
  fact, different decisions. Word choice matters.
- "What you see is all there is": user intent doesn't matter. What's
  literally on screen drives the decision.

### Copywriting Principles
- Clear beats clever. Users shouldn't admire the copy; they should
  understand the offer.
- "Get" framing: what does the user GET from this product / service /
  click? Lead with the outcome.
- Avoid generic CTAs (Submit, Buy Now, Click Here, Send). Focus on the
  user's outcome.
- Headlines should summarize meaning, not be vague labels ("Our
  Services" — bad). Bullet points beat paragraphs for scannability.

### Research Methods (when recommending fixes)
- Quantitative: GA4 device performance, conversion rates by source,
  funnel exploration to find drop-off, PageSpeed Insights.
- Qualitative: heuristic walkthrough, sales/AM interviews (concerns,
  objections, aha-moments), heat maps (scroll/click/attention), feedback
  polls (1-question sniper surveys after the action), review mining
  (Trustpilot, Google, G2, Capterra) for pain points and customer
  language.
- Use customer language back to the customer — pull verbs and phrases
  from reviews and into headlines/CTAs.
`;
