# File Map

> Complete directory structure with file descriptions. Referenced from CLAUDE.md.

```
CRO AI Agent/
├── api/
│   ├── _utils.js           # Shared security utilities (validateUrl, rateLimit)
│   ├── analyze.js          # Main audit pipeline (scrape + PageSpeed + 3-5 AI calls)
│   ├── chat.js             # Interactive chat endpoint (message + report updates + learning)
│   ├── learnings.js        # Server-side learning persistence (Upstash Redis GET/POST)
│   ├── generateCode.js     # Code patch generator (Tailwind CSS)
│   └── generateABTests.js  # A/B copy variation generator
├── src/
│   ├── constants/
│   │   ├── brand.js        # BRAND color palette object
│   │   ├── checklistLabels.js # CHECKLIST_LABELS mapping
│   │   └── loadingData.js  # Fun facts, step headers, loading phrases
│   ├── utils/
│   │   ├── clipboard.js    # Modern clipboard API with fallback
│   │   ├── json.js         # safeParseJSON helper
│   │   ├── learning.js     # Full learning system (local + server)
│   │   ├── localStorage.js # getSafe/setSafeLocalStorage
│   │   └── export/
│   │       ├── docx.js     # Word document export
│   │       ├── jpeg.js     # JPEG screenshot export
│   │       ├── txt.js      # Plain text export
│   │       └── xlsx.js     # Excel workbook export
│   ├── App.jsx             # Main frontend (~1800 lines, imports from modules)
│   └── main.jsx            # React entry point
├── docs/
│   ├── ARCHITECTURE.md     # Full architecture details
│   ├── SCHEMAS.md          # Report + Chat response schemas with JSON examples
│   ├── FILE-MAP.md         # THIS FILE — complete directory listing
│   └── KNOWN-ISSUES.md     # Known issues, what worked, what didn't
├── public/                 # Static assets
├── CLAUDE.md               # AI session guide — read first
├── VISION.md               # Product vision, purpose, and roadmap
├── TODO.md                 # Action plan — read second
├── CHANGELOG.md            # Version history
├── DEVELOPER.md            # Technical deep-dive (pipeline, learning, chat protocol)
├── IMPLEMENTATION_RECAP.md # Session recaps
├── README.md               # User-facing docs
├── vercel.json             # Vercel config (300s timeout)
├── vite.config.js          # Vite 5 config (@ alias, es2020 target)
├── tailwind.config.js      # Tailwind config
├── .env.example            # Env template
└── package.json            # Dependencies (React 18, Vite 5, Tailwind, Lucide, xlsx, docx)
```
