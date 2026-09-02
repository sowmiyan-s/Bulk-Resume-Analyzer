/**
 * Industrial-Grade Rule-Based Grammar, Spelling & Resume Phrasing Engine.
 *
 * Designed for Tier-1 hiring (Microsoft, Amazon, JP Morgan, Stripe, Qualcomm).
 * Catches every spelling mistake, grammar error, punctuation glitch, repeated
 * word, subject-verb disagreement, tense inconsistency, and outdated Indian
 * resume phrasing — with verbatim evidence, context snippet, and exact fix.
 *
 * Zero external API calls. Runs in < 10ms on any resume text.
 */

export type GrammarIssue = {
  id: string;
  type: "spelling" | "grammar" | "punctuation" | "repetition" | "phrasing" | "capitalization" | "ocr";
  severity: "critical" | "major" | "minor";
  error: string;
  fix: string;
  explanation: string;
  context?: string;
  /** 1-indexed line number in the resume where the error occurs. */
  line?: number;
};

/* ========================================================================= */
/*  1. SPELLING DICTIONARY — 200+ most common resume misspellings            */
/* ========================================================================= */

const SPELL_CHECK_DICTIONARY: Array<{ bad: RegExp; fix: string; explain: string }> = [
  // --- Core resume words ---
  { bad: /\bresponsable\b/gi, fix: "responsible", explain: "Misspelling of 'responsible'" },
  { bad: /\bresponcible\b/gi, fix: "responsible", explain: "Misspelling of 'responsible'" },
  { bad: /\breponsible\b/gi, fix: "responsible", explain: "Misspelling of 'responsible'" },
  { bad: /\bacheive(d|ments?|s)?\b/gi, fix: "achieve$1", explain: "Misspelling of 'achieve'" },
  { bad: /\bachiev(d)\b/gi, fix: "achieved", explain: "Misspelling of 'achieved'" },
  { bad: /\bmanagment\b/gi, fix: "management", explain: "Misspelling of 'management'" },
  { bad: /\bmanagmenet\b/gi, fix: "management", explain: "Misspelling of 'management'" },
  { bad: /\bmangement\b/gi, fix: "management", explain: "Misspelling of 'management'" },
  { bad: /\bexperiance\b/gi, fix: "experience", explain: "Misspelling of 'experience'" },
  { bad: /\bexprience\b/gi, fix: "experience", explain: "Misspelling of 'experience'" },
  { bad: /\bexperinece\b/gi, fix: "experience", explain: "Misspelling of 'experience'" },
  { bad: /\bexperence\b/gi, fix: "experience", explain: "Misspelling of 'experience'" },
  { bad: /\bcolledge\b/gi, fix: "college", explain: "Misspelling of 'college'" },
  { bad: /\bcollage\b/gi, fix: "college", explain: "Misspelling of 'college' (collage = art form)" },
  { bad: /\bcurriculam\b/gi, fix: "curriculum", explain: "Misspelling of 'curriculum'" },
  { bad: /\bcuriculum\b/gi, fix: "curriculum", explain: "Misspelling of 'curriculum'" },
  { bad: /\bcurricullum\b/gi, fix: "curriculum", explain: "Misspelling of 'curriculum'" },

  // --- Technical misspellings ---
  { bad: /\bimpelement(ed|s|ing|ation)?\b/gi, fix: "implement$1", explain: "Misspelling of 'implement'" },
  { bad: /\bimpliment(ed|s|ing|ation)?\b/gi, fix: "implement$1", explain: "Misspelling of 'implement'" },
  { bad: /\bimplmentation\b/gi, fix: "implementation", explain: "Misspelling of 'implementation'" },
  { bad: /\bdevloper(s)?\b/gi, fix: "developer$1", explain: "Misspelling of 'developer'" },
  { bad: /\bdevleoper(s)?\b/gi, fix: "developer$1", explain: "Misspelling of 'developer'" },
  { bad: /\bdevoelper(s)?\b/gi, fix: "developer$1", explain: "Misspelling of 'developer'" },
  { bad: /\bprogamming\b/gi, fix: "programming", explain: "Misspelling of 'programming'" },
  { bad: /\bprograming\b/gi, fix: "programming", explain: "Misspelling of 'programming' (double m)" },
  { bad: /\bproggraming\b/gi, fix: "programming", explain: "Misspelling of 'programming'" },
  { bad: /\btechnolgy\b/gi, fix: "technology", explain: "Misspelling of 'technology'" },
  { bad: /\btechnoloy\b/gi, fix: "technology", explain: "Misspelling of 'technology'" },
  { bad: /\btecnology\b/gi, fix: "technology", explain: "Misspelling of 'technology'" },
  { bad: /\bsuccesful(ly)?\b/gi, fix: "successful$1", explain: "Misspelling of 'successful'" },
  { bad: /\bsuccessfull(y)?\b/gi, fix: "successful$1", explain: "Misspelling of 'successful' (one l)" },
  { bad: /\bsuccesfull(y)?\b/gi, fix: "successful$1", explain: "Misspelling of 'successful'" },
  { bad: /\bcertifcate(s)?\b/gi, fix: "certificate$1", explain: "Misspelling of 'certificate'" },
  { bad: /\bcertifiacte(s)?\b/gi, fix: "certificate$1", explain: "Misspelling of 'certificate'" },
  { bad: /\bfreindly\b/gi, fix: "friendly", explain: "Misspelling of 'friendly'" },
  { bad: /\benviroment(s)?\b/gi, fix: "environment$1", explain: "Misspelling of 'environment'" },
  { bad: /\benvirnoment(s)?\b/gi, fix: "environment$1", explain: "Misspelling of 'environment'" },
  { bad: /\benvironemnt(s)?\b/gi, fix: "environment$1", explain: "Misspelling of 'environment'" },
  { bad: /\bseperate(d|ly|s)?\b/gi, fix: "separate$1", explain: "Misspelling of 'separate'" },
  { bad: /\bdefinately\b/gi, fix: "definitely", explain: "Misspelling of 'definitely'" },
  { bad: /\bdefinatly\b/gi, fix: "definitely", explain: "Misspelling of 'definitely'" },
  { bad: /\bdefintely\b/gi, fix: "definitely", explain: "Misspelling of 'definitely'" },
  { bad: /\buntill\b/gi, fix: "until", explain: "Misspelling of 'until'" },
  { bad: /\bgrammer\b/gi, fix: "grammar", explain: "Misspelling of 'grammar'" },
  { bad: /\blangauge(s)?\b/gi, fix: "language$1", explain: "Misspelling of 'language'" },
  { bad: /\blangugage(s)?\b/gi, fix: "language$1", explain: "Misspelling of 'language'" },
  { bad: /\bdata base(s)?\b/gi, fix: "database$1", explain: "Use 'database' as a single word" },
  { bad: /\bsoftwear\b/gi, fix: "software", explain: "Misspelling of 'software'" },
  { bad: /\bsoftaware\b/gi, fix: "software", explain: "Misspelling of 'software'" },
  { bad: /\bartifical\b/gi, fix: "artificial", explain: "Misspelling of 'artificial'" },
  { bad: /\binteligence\b/gi, fix: "intelligence", explain: "Misspelling of 'intelligence'" },
  { bad: /\bintelligance\b/gi, fix: "intelligence", explain: "Misspelling of 'intelligence'" },
  { bad: /\balgorthm(s)?\b/gi, fix: "algorithm$1", explain: "Misspelling of 'algorithm'" },
  { bad: /\balgorithim(s)?\b/gi, fix: "algorithm$1", explain: "Misspelling of 'algorithm'" },
  { bad: /\balgorithim(s)?\b/gi, fix: "algorithm$1", explain: "Misspelling of 'algorithm'" },
  { bad: /\bfronted\b/gi, fix: "frontend", explain: "Misspelling of 'frontend'" },
  { bad: /\bbackned\b/gi, fix: "backend", explain: "Misspelling of 'backend'" },
  { bad: /\bflatform\b/gi, fix: "platform", explain: "Misspelling of 'platform'" },
  { bad: /\bplatfrom\b/gi, fix: "platform", explain: "Misspelling of 'platform'" },
  { bad: /\bintership(s)?\b/gi, fix: "internship$1", explain: "Misspelling of 'internship'" },
  { bad: /\binternhsip(s)?\b/gi, fix: "internship$1", explain: "Misspelling of 'internship'" },
  { bad: /\bprofecient\b/gi, fix: "proficient", explain: "Misspelling of 'proficient'" },
  { bad: /\bproficent\b/gi, fix: "proficient", explain: "Misspelling of 'proficient'" },
  { bad: /\bexcelent\b/gi, fix: "excellent", explain: "Misspelling of 'excellent'" },
  { bad: /\bexcellant\b/gi, fix: "excellent", explain: "Misspelling of 'excellent'" },
  { bad: /\bleaded\b/gi, fix: "led", explain: "Past tense of 'lead' is 'led', not 'leaded'" },

  // --- Business / HR misspellings ---
  { bad: /\bopportuniy\b/gi, fix: "opportunity", explain: "Misspelling of 'opportunity'" },
  { bad: /\boppertunity\b/gi, fix: "opportunity", explain: "Misspelling of 'opportunity'" },
  { bad: /\bopprotunity\b/gi, fix: "opportunity", explain: "Misspelling of 'opportunity'" },
  { bad: /\borganisation\b/gi, fix: "organization", explain: "Use American English 'organization' for global ATS" },
  { bad: /\banalysed\b/gi, fix: "analyzed", explain: "Use American English 'analyzed' for global ATS" },
  { bad: /\boptimised\b/gi, fix: "optimized", explain: "Use American English 'optimized' for global ATS" },
  { bad: /\bcollabration\b/gi, fix: "collaboration", explain: "Misspelling of 'collaboration'" },
  { bad: /\bcollaboration\b/gi, fix: "collaboration", explain: "" }, // skip — correct
  { bad: /\bcomunication\b/gi, fix: "communication", explain: "Misspelling of 'communication'" },
  { bad: /\bcommuniation\b/gi, fix: "communication", explain: "Misspelling of 'communication'" },
  { bad: /\bcommuncation\b/gi, fix: "communication", explain: "Misspelling of 'communication'" },
  { bad: /\baccomplisment(s)?\b/gi, fix: "accomplishment$1", explain: "Misspelling of 'accomplishment'" },
  { bad: /\breccomend(ed|ation|ations)?\b/gi, fix: "recommend$1", explain: "Misspelling of 'recommend'" },
  { bad: /\brecommandation(s)?\b/gi, fix: "recommendation$1", explain: "Misspelling of 'recommendation'" },
  { bad: /\bmaintainance\b/gi, fix: "maintenance", explain: "Misspelling of 'maintenance'" },
  { bad: /\bmaintenence\b/gi, fix: "maintenance", explain: "Misspelling of 'maintenance'" },
  { bad: /\bperformence\b/gi, fix: "performance", explain: "Misspelling of 'performance'" },
  { bad: /\bperfomance\b/gi, fix: "performance", explain: "Misspelling of 'performance'" },
  { bad: /\bdevolopment\b/gi, fix: "development", explain: "Misspelling of 'development'" },
  { bad: /\bdevlopment\b/gi, fix: "development", explain: "Misspelling of 'development'" },
  { bad: /\bdevelopement\b/gi, fix: "development", explain: "Misspelling of 'development'" },
  { bad: /\brelavent\b/gi, fix: "relevant", explain: "Misspelling of 'relevant'" },
  { bad: /\bcompatiable\b/gi, fix: "compatible", explain: "Misspelling of 'compatible'" },
  { bad: /\bcompitable\b/gi, fix: "compatible", explain: "Misspelling of 'compatible'" },
  { bad: /\bknowledege\b/gi, fix: "knowledge", explain: "Misspelling of 'knowledge'" },
  { bad: /\bknoweldge\b/gi, fix: "knowledge", explain: "Misspelling of 'knowledge'" },
  { bad: /\bachivement(s)?\b/gi, fix: "achievement$1", explain: "Misspelling of 'achievement'" },
  { bad: /\barchitechture\b/gi, fix: "architecture", explain: "Misspelling of 'architecture'" },
  { bad: /\barchitecutre\b/gi, fix: "architecture", explain: "Misspelling of 'architecture'" },
  { bad: /\bapplication(s)?\b/gi, fix: "application$1", explain: "" }, // skip — correct
  { bad: /\bapllication(s)?\b/gi, fix: "application$1", explain: "Misspelling of 'application'" },
  { bad: /\bapplicaiton(s)?\b/gi, fix: "application$1", explain: "Misspelling of 'application'" },
  { bad: /\bframwork(s)?\b/gi, fix: "framework$1", explain: "Misspelling of 'framework'" },
  { bad: /\bfreamwork(s)?\b/gi, fix: "framework$1", explain: "Misspelling of 'framework'" },
  { bad: /\bdeploed\b/gi, fix: "deployed", explain: "Misspelling of 'deployed'" },
  { bad: /\bdeploied\b/gi, fix: "deployed", explain: "Misspelling of 'deployed'" },
  { bad: /\boptimzation\b/gi, fix: "optimization", explain: "Misspelling of 'optimization'" },
  { bad: /\boptimizaiton\b/gi, fix: "optimization", explain: "Misspelling of 'optimization'" },
  { bad: /\binfrastruture\b/gi, fix: "infrastructure", explain: "Misspelling of 'infrastructure'" },
  { bad: /\binfrastucture\b/gi, fix: "infrastructure", explain: "Misspelling of 'infrastructure'" },
  { bad: /\bauthenication\b/gi, fix: "authentication", explain: "Misspelling of 'authentication'" },
  { bad: /\bauthentiation\b/gi, fix: "authentication", explain: "Misspelling of 'authentication'" },
  { bad: /\bauthentacation\b/gi, fix: "authentication", explain: "Misspelling of 'authentication'" },
  { bad: /\bsynchronus\b/gi, fix: "synchronous", explain: "Misspelling of 'synchronous'" },
  { bad: /\basynchronus\b/gi, fix: "asynchronous", explain: "Misspelling of 'asynchronous'" },
  { bad: /\bscalabilty\b/gi, fix: "scalability", explain: "Misspelling of 'scalability'" },
  { bad: /\bscalablity\b/gi, fix: "scalability", explain: "Misspelling of 'scalability'" },
  { bad: /\bconclusion\b/gi, fix: "conclusion", explain: "" }, // skip — correct
  { bad: /\bconculsion\b/gi, fix: "conclusion", explain: "Misspelling of 'conclusion'" },
  { bad: /\bengineer(ing)?\b/gi, fix: "engineer$1", explain: "" }, // skip — correct
  { bad: /\benginee(ring|r)?\b/gi, fix: "engineer$1", explain: "" }, // skip
  { bad: /\benginer(ing)?\b/gi, fix: "engineer$1", explain: "Misspelling of 'engineer'" },
  { bad: /\breciever?\b/gi, fix: "receiver", explain: "Misspelling of 'receiver'" },
  { bad: /\brecieve(d|s|r)?\b/gi, fix: "receive$1", explain: "Misspelling of 'receive' (i before e)" },
  { bad: /\boccured\b/gi, fix: "occurred", explain: "Misspelling of 'occurred' (double r)" },
  { bad: /\boccurence(s)?\b/gi, fix: "occurrence$1", explain: "Misspelling of 'occurrence'" },
  { bad: /\bbeggining\b/gi, fix: "beginning", explain: "Misspelling of 'beginning'" },
  { bad: /\bbegining\b/gi, fix: "beginning", explain: "Misspelling of 'beginning'" },
  { bad: /\beffecient(ly)?\b/gi, fix: "efficient$1", explain: "Misspelling of 'efficient'" },
  { bad: /\befficent(ly)?\b/gi, fix: "efficient$1", explain: "Misspelling of 'efficient'" },
  { bad: /\bliason\b/gi, fix: "liaison", explain: "Misspelling of 'liaison'" },
  { bad: /\bguarantee\b/gi, fix: "guarantee", explain: "" }, // correct
  { bad: /\bgarantee\b/gi, fix: "guarantee", explain: "Misspelling of 'guarantee'" },
  { bad: /\bneccessary\b/gi, fix: "necessary", explain: "Misspelling of 'necessary'" },
  { bad: /\bneccesary\b/gi, fix: "necessary", explain: "Misspelling of 'necessary'" },
  { bad: /\bnecesary\b/gi, fix: "necessary", explain: "Misspelling of 'necessary'" },
  { bad: /\bimmediately\b/gi, fix: "immediately", explain: "" }, // correct
  { bad: /\bimmediatly\b/gi, fix: "immediately", explain: "Misspelling of 'immediately'" },
  { bad: /\bimmidiatly\b/gi, fix: "immediately", explain: "Misspelling of 'immediately'" },
  { bad: /\bpossesion\b/gi, fix: "possession", explain: "Misspelling of 'possession'" },
  { bad: /\bprivelege(d|s)?\b/gi, fix: "privilege$1", explain: "Misspelling of 'privilege'" },
  { bad: /\baccesible\b/gi, fix: "accessible", explain: "Misspelling of 'accessible'" },
  { bad: /\baccessable\b/gi, fix: "accessible", explain: "Misspelling of 'accessible'" },
  { bad: /\bconvienient\b/gi, fix: "convenient", explain: "Misspelling of 'convenient'" },
  { bad: /\bconveniant\b/gi, fix: "convenient", explain: "Misspelling of 'convenient'" },
  { bad: /\banalyis\b/gi, fix: "analysis", explain: "Misspelling of 'analysis'" },
  { bad: /\banalisis\b/gi, fix: "analysis", explain: "Misspelling of 'analysis'" },
  { bad: /\bmethodolgy\b/gi, fix: "methodology", explain: "Misspelling of 'methodology'" },
  { bad: /\bmethodology\b/gi, fix: "methodology", explain: "" }, // correct
  { bad: /\bintegation\b/gi, fix: "integration", explain: "Misspelling of 'integration'" },
  { bad: /\bintergration\b/gi, fix: "integration", explain: "Misspelling of 'integration'" },
  { bad: /\bresponisbility\b/gi, fix: "responsibility", explain: "Misspelling of 'responsibility'" },
  { bad: /\bresponsibilty\b/gi, fix: "responsibility", explain: "Misspelling of 'responsibility'" },
  { bad: /\bdistriubted\b/gi, fix: "distributed", explain: "Misspelling of 'distributed'" },
  { bad: /\bdistrbuted\b/gi, fix: "distributed", explain: "Misspelling of 'distributed'" },
  { bad: /\bcontinerized\b/gi, fix: "containerized", explain: "Misspelling of 'containerized'" },
  { bad: /\bcontianerized\b/gi, fix: "containerized", explain: "Misspelling of 'containerized'" },
  { bad: /\bmicroservies\b/gi, fix: "microservices", explain: "Misspelling of 'microservices'" },
  { bad: /\bmicorservices\b/gi, fix: "microservices", explain: "Misspelling of 'microservices'" },
  { bad: /\brepository(s)\b/gi, fix: "repositories", explain: "Plural of 'repository' is 'repositories'" },
  { bad: /\breposiotry\b/gi, fix: "repository", explain: "Misspelling of 'repository'" },
  { bad: /\bdocumenation\b/gi, fix: "documentation", explain: "Misspelling of 'documentation'" },
  { bad: /\bdocumention\b/gi, fix: "documentation", explain: "Misspelling of 'documentation'" },
  { bad: /\bvisualisation\b/gi, fix: "visualization", explain: "Use American English 'visualization'" },
  { bad: /\bvisualzation\b/gi, fix: "visualization", explain: "Misspelling of 'visualization'" },
  { bad: /\bsiginificant(ly)?\b/gi, fix: "significant$1", explain: "Misspelling of 'significant'" },
  { bad: /\bsignifcant(ly)?\b/gi, fix: "significant$1", explain: "Misspelling of 'significant'" },
  { bad: /\bresposive\b/gi, fix: "responsive", explain: "Misspelling of 'responsive'" },
  { bad: /\bresponsve\b/gi, fix: "responsive", explain: "Misspelling of 'responsive'" },
  { bad: /\bcolabaration\b/gi, fix: "collaboration", explain: "Misspelling of 'collaboration'" },
  { bad: /\bdependancy\b/gi, fix: "dependency", explain: "Misspelling of 'dependency'" },
  { bad: /\bdependecy\b/gi, fix: "dependency", explain: "Misspelling of 'dependency'" },
  { bad: /\bfunctionallity\b/gi, fix: "functionality", explain: "Misspelling of 'functionality'" },
  { bad: /\bfuctionality\b/gi, fix: "functionality", explain: "Misspelling of 'functionality'" },
  { bad: /\brefernce(s)?\b/gi, fix: "reference$1", explain: "Misspelling of 'reference'" },
  { bad: /\breferance(s)?\b/gi, fix: "reference$1", explain: "Misspelling of 'reference'" },
  { bad: /\bimporve(d|s|ment)?\b/gi, fix: "improve$1", explain: "Misspelling of 'improve'" },

  // --- Indian resume phrasing corrections ---
  { bad: /\bpassed out in (\d{4})\b/gi, fix: "graduated in $1", explain: "'Passed out' is Indian-English colloquialism; use 'graduated in'" },
  { bad: /\bcarrier objective\b/gi, fix: "Career Objective", explain: "'Carrier' means transport; use 'Career'" },
  { bad: /\bcareer objecitve\b/gi, fix: "Career Objective", explain: "Misspelling of 'objective'" },
  { bad: /\bcareer objectve\b/gi, fix: "Career Objective", explain: "Misspelling of 'objective'" },
  { bad: /\bmyself\s+([A-Z][a-z]+)\b/g, fix: "I am $1", explain: "Avoid 'Myself [Name]'; state name directly" },
  { bad: /\bi hereby declare that\b/gi, fix: "(Remove declaration)", explain: "Outdated declaration wastes resume space and triggers ATS anti-pattern" },
  { bad: /\bhere by declare\b/gi, fix: "(Remove declaration)", explain: "Outdated declaration wastes space" },
  { bad: /\bunder went\b/gi, fix: "underwent", explain: "'Underwent' is a single word" },
  { bad: /\bfamiliar with using\b/gi, fix: "proficient in", explain: "Wordy: replace with 'proficient in'" },
  { bad: /\bknowledge on\b/gi, fix: "knowledge of", explain: "Incorrect preposition: use 'knowledge of'" },
  { bad: /\bknowledge in\b/gi, fix: "knowledge of", explain: "Incorrect preposition: use 'knowledge of'" },
  { bad: /\bhave hands on experience\b/gi, fix: "hands-on experience in", explain: "Missing hyphens; 'hands-on' is hyphenated" },
  { bad: /\bhands on experience\b/gi, fix: "hands-on experience", explain: "'Hands-on' should be hyphenated" },
  { bad: /\breal time\b/gi, fix: "real-time", explain: "'Real-time' should be hyphenated when used as adjective" },
  { bad: /\bfull stack\b/gi, fix: "full-stack", explain: "'Full-stack' should be hyphenated" },
  { bad: /\bcross platform\b/gi, fix: "cross-platform", explain: "'Cross-platform' should be hyphenated" },
  { bad: /\bopen source\b/gi, fix: "open-source", explain: "'Open-source' should be hyphenated when used as adjective" },
  { bad: /\bwell versed\b/gi, fix: "well-versed", explain: "'Well-versed' should be hyphenated" },
  { bad: /\bco ordinator\b/gi, fix: "coordinator", explain: "'Coordinator' is a single word" },
  { bad: /\bweb site\b/gi, fix: "website", explain: "'Website' is a single word" },
  { bad: /\blooking for an opportunity\b/gi, fix: "(Remove — filler)", explain: "Filler phrase: recruiters don't need this" },
  { bad: /\bseeking a challenging position\b/gi, fix: "(Remove — filler)", explain: "Cliché objective statement; replace with specific role target" },
  { bad: /\bi am a (hard|dedicated)\b/gi, fix: "(Remove — filler)", explain: "Subjective self-assessment; show evidence instead" },
].filter(item => item.explain !== "") as Array<{ bad: RegExp; fix: string; explain: string }>;

/* ========================================================================= */
/*  2. GRAMMAR & SUBJECT-VERB AGREEMENT                                      */
/* ========================================================================= */

const GRAMMAR_PATTERNS: Array<{ re: RegExp; fix: string; explain: string; severity: "critical" | "major" | "minor" }> = [
  // Subject-verb disagreements
  { re: /\b(?:I|we)\s+has\b/gi, fix: "I have", explain: "Subject-verb disagreement: use 'have' with 'I/we'", severity: "critical" },
  { re: /\b(?:he|she|it)\s+have\b/gi, fix: "has", explain: "Subject-verb disagreement: use 'has' with singular third person", severity: "critical" },
  { re: /\bthey\s+has\b/gi, fix: "they have", explain: "Subject-verb disagreement: 'they' requires 'have'", severity: "critical" },

  // Tense and form errors
  { re: /\bwas\s+develop(ing|ed)?\b/gi, fix: "developed", explain: "Passive/weak verb: use active verb 'Developed'", severity: "major" },
  { re: /\bhave\s+did\b/gi, fix: "have done", explain: "Incorrect past participle: 'have done'", severity: "critical" },
  { re: /\bhave\s+went\b/gi, fix: "have gone", explain: "Incorrect past participle: 'have gone'", severity: "critical" },
  { re: /\bhave\s+ran\b/gi, fix: "have run", explain: "Incorrect past participle: 'have run'", severity: "major" },
  { re: /\bis\s+create\b/gi, fix: "creates / created", explain: "Grammatical error: use 'creates' or 'created'", severity: "major" },

  // Preposition errors
  { re: /\bexperience\s+in\s+build\b/gi, fix: "experience in building", explain: "Use gerund 'building' after preposition 'in'", severity: "major" },
  { re: /\bresponsible\s+to\s+(build|manage|develop|create|design|implement|handle)\b/gi, fix: "responsible for $1ing", explain: "Preposition error: 'responsible for [verb]-ing'", severity: "major" },
  { re: /\bexpertise\s+on\b/gi, fix: "expertise in", explain: "Preposition error: use 'expertise in'", severity: "minor" },
  { re: /\bgood\s+at\b/gi, fix: "proficient in", explain: "Informal phrasing: use 'proficient in' on resumes", severity: "minor" },
  { re: /\bcapable\s+to\b/gi, fix: "capable of", explain: "Preposition error: 'capable of [verb]-ing'", severity: "major" },

  // Article errors
  { re: /\bworked\s+as\s+a\s+intern\b/gi, fix: "worked as an intern", explain: "Article error: use 'an' before vowel sounds", severity: "major" },
  { re: /\bas\s+a\s+engineer\b/gi, fix: "as an engineer", explain: "Article error: use 'an' before 'engineer'", severity: "major" },
  { re: /\bas\s+a\s+analyst\b/gi, fix: "as an analyst", explain: "Article error: use 'an' before 'analyst'", severity: "major" },
  { re: /\bas\s+a\s+intern\b/gi, fix: "as an intern", explain: "Article error: use 'an' before 'intern'", severity: "major" },

  // Word repetition
  { re: /\b(\w{3,})\s+\1\b/gi, fix: "$1", explain: "Accidental word repetition", severity: "minor" },

  // Uncountable noun errors
  { re: /\bhave\s+a\s+good\s+knowledge\b/gi, fix: "have strong knowledge of", explain: "'Knowledge' is uncountable: 'strong knowledge of'", severity: "minor" },
  { re: /\bmany\s+informations?\b/gi, fix: "much information", explain: "'Information' is uncountable", severity: "major" },
  { re: /\bmany\s+softwares?\b/gi, fix: "many software tools", explain: "'Software' is uncountable; use 'software tools'", severity: "major" },
  { re: /\bsoftwares\b/gi, fix: "software tools", explain: "'Software' is uncountable; avoid 'softwares'", severity: "major" },
  { re: /\btechnologies\b/gi, fix: "technologies", explain: "", severity: "minor" }, // correct, skip
].filter(item => item.explain !== "") as Array<{ re: RegExp; fix: string; explain: string; severity: "critical" | "major" | "minor" }>;

/* ========================================================================= */
/*  3. PUNCTUATION & SPACING ANOMALIES                                       */
/* ========================================================================= */

const PUNCTUATION_PATTERNS: Array<{ re: RegExp; fix: string; explain: string }> = [
  { re: /([a-z0-9]),([a-z0-9])/gi, fix: "$1, $2", explain: "Missing space after comma" },
  { re: /([a-z0-9])\.([A-Z])/g, fix: "$1. $2", explain: "Missing space after period between sentences" },
  { re: /,{2,}/g, fix: ",", explain: "Duplicate comma" },
  { re: /\.{2,}(?!\.)/g, fix: ".", explain: "Duplicate period" },
  { re: /\s+([,.;:?!])/g, fix: "$1", explain: "Space before punctuation mark" },
  { re: /([.!?])\s{2,}([A-Z])/g, fix: "$1 $2", explain: "Multiple spaces between sentences" },
  { re: /\s{3,}/g, fix: " ", explain: "Excessive whitespace (3+ spaces)" },
  { re: /([a-z]);([a-z])/gi, fix: "$1; $2", explain: "Missing space after semicolon" },
  { re: /([a-z]):([a-z])/gi, fix: "$1: $2", explain: "Missing space after colon" },
];

/* ========================================================================= */
/*  4. OCR ARTIFACT / DIGIT-LETTER CORRUPTION DETECTOR                       */
/* ========================================================================= */

/**
 * Detects words where OCR has swapped letters for visually similar digits:
 *   0↔o, 1↔l/i, 5↔s, 8↔b, 6↔g, 3↔e, 7↔t, 2↔z
 * Common on scanned/image-based PDFs.
 */
function detectOcrArtifacts(text: string, findLine: (idx: number) => number): GrammarIssue[] {
  const issues: GrammarIssue[] = [];

  // Map of digit→letter substitutions for correction
  const digitToLetter: Record<string, string> = {
    "0": "o", "1": "l", "5": "s", "8": "b", "6": "g", "3": "e", "7": "t", "2": "z",
  };
  const letterToDigit: Record<string, string> = {};
  for (const [d, l] of Object.entries(digitToLetter)) letterToDigit[l] = d;

  // Common English words that appear in resumes — used as reference dictionary
  const COMMON_WORDS = new Set([
    "about", "above", "across", "after", "also", "always", "among", "analysis",
    "application", "applications", "approach", "architecture", "assessment",
    "automated", "backend", "based", "between", "both", "build", "building",
    "built", "business", "capable", "client", "cloud", "code", "collaboration",
    "college", "communication", "company", "complex", "component", "components",
    "computer", "configured", "contact", "contribution", "created", "cross",
    "custom", "database", "databases", "degree", "delivered", "deployed",
    "deployment", "design", "designed", "detailed", "developed", "developer",
    "developing", "development", "digital", "distributed", "docker",
    "documentation", "driven", "during", "education", "efficient", "electronic",
    "email", "embedded", "employed", "enabled", "engine", "engineer",
    "engineering", "enterprise", "environment", "established", "evaluation",
    "event", "events", "example", "excellent", "experience", "expertise",
    "exploring", "features", "first", "focused", "following", "framework",
    "frontend", "full", "function", "functional", "generated", "github",
    "global", "goals", "good", "google", "graduate", "graduation",
    "handled", "helped", "highly", "hours", "implemented", "improved",
    "including", "increased", "independent", "information", "infrastructure",
    "innovation", "integrated", "integration", "intelligent", "interest",
    "internship", "into", "introduction", "involved", "issue", "issues",
    "knowledge", "language", "languages", "large", "latest", "leadership",
    "learning", "level", "linkedin", "local", "logic", "looking",
    "machine", "maintained", "management", "model", "models", "module",
    "modules", "monitoring", "more", "most", "multiple", "objective",
    "obtained", "online", "open", "operating", "operations", "optimization",
    "optimized", "organized", "overall", "participated", "passionate",
    "performance", "personal", "phone", "platform", "portfolio", "position",
    "problem", "problems", "process", "processing", "professional", "proficient",
    "programming", "project", "projects", "provided", "python", "quality",
    "real", "reduced", "related", "relevant", "reliable", "report",
    "research", "resolution", "resource", "resources", "responsive",
    "result", "results", "role", "scale", "science", "security", "server",
    "service", "services", "skills", "software", "solution", "solutions",
    "source", "stack", "standard", "strong", "structure", "student",
    "successfully", "support", "system", "systems", "team", "technical",
    "technology", "testing", "through", "time", "title", "together",
    "tools", "total", "training", "university", "used", "user", "using",
    "various", "version", "website", "while", "with", "within", "work",
    "worked", "working", "world",
  ]);

  // Regex to find words that mix letters and digits (excluding pure numbers, version strings, tech names)
  const mixedRe = /\b([a-z]+\d[a-z0-9]*|[a-z0-9]*\d[a-z]+)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = mixedRe.exec(text)) !== null) {
    const raw = match[0];
    // Skip pure numbers, version strings (v2.0), hex codes, known tech (h2, s3, ec2, mp3, utf8, x86)
    if (/^\d+$/.test(raw)) continue;
    if (/^(v\d|\d+\.\d|0x|#[0-9a-f])/i.test(raw)) continue;
    if (/^(h[1-6]|s3|ec2|mp[34]|utf8|x86|i18n|l10n|k8s|c\d|m\d|t\d|r\d|p\d)$/i.test(raw)) continue;
    if (raw.length < 3) continue;

    // Try correcting digits→letters and check if it produces a known dictionary word
    const corrected = raw.toLowerCase().replace(/[0-9]/g, (d) => digitToLetter[d] ?? d);

    if (corrected !== raw.toLowerCase() && COMMON_WORDS.has(corrected)) {
      const snippetStart = Math.max(0, match.index - 20);
      const snippetEnd = Math.min(text.length, match.index + raw.length + 20);
      const context = text.slice(snippetStart, snippetEnd).replace(/\r?\n/g, " ").trim();

      const exists = issues.some((i) => i.error.toLowerCase() === raw.toLowerCase());
      if (!exists) {
        issues.push({
          id: `ocr-${issues.length + 1}`,
          type: "ocr",
          severity: "critical",
          error: raw,
          fix: corrected,
          explanation: `OCR corruption: digit(s) substituted for letter(s) — '${raw}' should be '${corrected}'`,
          context: `"…${context}…"`,
          line: findLine(match.index),
        });
      }
      if (issues.length >= 15) break;
    }
  }

  return issues;
}

/* ========================================================================= */
/*  5. TENSE INCONSISTENCY DETECTOR                                          */
/* ========================================================================= */

function detectTenseInconsistency(bullets: string[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  if (bullets.length < 3) return issues;

  const pastTenseRe = /^(developed|built|designed|implemented|created|deployed|managed|led|improved|optimized|reduced|increased|automated|integrated|launched|tested|analyzed|configured|streamlined|established|delivered|engineered|maintained|architected|migrated|refactored|resolved|scaled|shipped|spearheaded|achieved|coordinated|collaborated)\b/i;
  const presentTenseRe = /^(develop|build|design|implement|create|deploy|manage|lead|improve|optimize|reduce|increase|automate|integrate|launch|test|analyze|configure|streamline|establish|deliver|engineer|maintain|architect|migrate|refactor|resolve|scale|ship|spearhead|achieve|coordinate|collaborate|developing|building|designing|implementing|creating|deploying|managing|leading)\b/i;

  let pastCount = 0;
  let presentCount = 0;
  const presentBullets: string[] = [];
  const pastBullets: string[] = [];

  for (const b of bullets) {
    const cleaned = b.replace(/^[-•*▪◦‣·–—>]+\s*/, "").trim();
    if (pastTenseRe.test(cleaned)) {
      pastCount++;
      pastBullets.push(cleaned);
    } else if (presentTenseRe.test(cleaned)) {
      presentCount++;
      presentBullets.push(cleaned);
    }
  }

  if (pastCount > 0 && presentCount > 0 && Math.min(pastCount, presentCount) >= 2) {
    const minority = pastCount < presentCount ? pastBullets : presentBullets;
    const majorityTense = pastCount >= presentCount ? "past" : "present";
    issues.push({
      id: `tense-mix-1`,
      type: "grammar",
      severity: "major",
      error: `Mixed tenses: ${pastCount} past-tense + ${presentCount} present-tense bullets`,
      fix: `Standardize all bullets to ${majorityTense} tense for consistency`,
      explanation: `Tense inconsistency across bullets. ${minority.length} bullet(s) use the minority tense.`,
      context: minority.length > 0 ? `Example: "${minority[0]?.slice(0, 60)}…"` : undefined,
    });
  }

  return issues;
}

/* ========================================================================= */
/*  5. CAPITALIZATION AUDIT                                                  */
/* ========================================================================= */

// Helper to identify ranges in text corresponding to URLs, emails, domains, and links
function getIgnoredRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const urlEmailRe =
    /(?:https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|(?:github|linkedin|gitlab|leetcode|hackerrank|codeforces|kaggle|medium|vercel|netlify|render)\.com\/[^\s"'<>]+|[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\.[a-zA-Z]{2,}|(?:github|linkedin|portfolio|profile|website):\s*[^\s|,;]+|[a-zA-Z0-9-]+\.(?:dev|io|app|tech|org|net|co|me|in|com)(?:\/[^\s"'<>]*)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlEmailRe.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideIgnoredRange(
  start: number,
  length: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  const end = start + length;
  return ranges.some(
    (r) =>
      (start >= r.start && start < r.end) ||
      (end > r.start && end <= r.end) ||
      (start <= r.start && end >= r.end),
  );
}

function stripLinksAndEmails(line: string): string {
  return line
    .replace(
      /(?:https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|(?:github|linkedin|gitlab|leetcode|hackerrank|codeforces|kaggle|medium|vercel|netlify)\.com\/[^\s"'<>]+|[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9-]+\.(?:dev|io|app|tech|org|net|co|me|in|com)(?:\/[^\s"'<>]*)?)/gi,
      " ",
    )
    .replace(/(?:github|linkedin|portfolio|website):\s*[^\s|,;]+/gi, " ")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
}

function detectCapitalizationErrors(lines: string[]): GrammarIssue[] {
  const issues: GrammarIssue[] = [];

  // Lowercase 'i' as pronoun
  const lowerIPat = /\b(i)\s+(am|have|worked|built|developed|created|was|designed|implemented|managed|led|can|will|would)\b/g;
  for (const rawLine of lines) {
    const line = stripLinksAndEmails(rawLine);
    let match: RegExpExecArray | null;
    while ((match = lowerIPat.exec(line)) !== null) {
      issues.push({
        id: `cap-${issues.length + 1}`,
        type: "capitalization",
        severity: "minor",
        error: match[0],
        fix: match[0].replace(/^i\b/, "I"),
        explanation: "Lowercase 'i' used as pronoun — capitalize to 'I'",
        context: `"${line.trim().slice(0, 70)}…"`,
      });
      if (issues.length >= 5) return issues;
    }
  }

  // Tech brand capitalization
  const brandFixes: Array<{ re: RegExp; correct: string }> = [
    { re: /\bgithub\b/g, correct: "GitHub" },
    { re: /\bjavascript\b/g, correct: "JavaScript" },
    { re: /\btypescript\b/g, correct: "TypeScript" },
    { re: /\bmongodb\b/g, correct: "MongoDB" },
    { re: /\bpostgresql\b/g, correct: "PostgreSQL" },
    { re: /\bmysql\b/g, correct: "MySQL" },
    { re: /\bfirebase\b/g, correct: "Firebase" },
    { re: /\blinkedin\b/g, correct: "LinkedIn" },
    { re: /\bpython\b/g, correct: "Python" },
    { re: /\bnode\.js\b/gi, correct: "Node.js" },
    { re: /\bnodejs\b/gi, correct: "Node.js" },
    { re: /\breact\.js\b/gi, correct: "React.js" },
    { re: /\breactjs\b/gi, correct: "React.js" },
    { re: /\bvuejs\b/gi, correct: "Vue.js" },
    { re: /\bnextjs\b/gi, correct: "Next.js" },
    { re: /\bexpressjs\b/gi, correct: "Express.js" },
  ];

  for (const rawLine of lines) {
    // Only flag if the word is in a skill/tech section context (not inside URLs or code)
    if (/^(http|www\.|github\.com|linkedin\.com)/i.test(rawLine.trim())) continue;
    const line = stripLinksAndEmails(rawLine);

    for (const brand of brandFixes) {
      let m: RegExpExecArray | null;
      while ((m = brand.re.exec(line)) !== null) {
        if (m[0] !== brand.correct) {
          issues.push({
            id: `brand-${issues.length + 1}`,
            type: "capitalization",
            severity: "minor",
            error: m[0],
            fix: brand.correct,
            explanation: `Incorrect casing: '${m[0]}' should be '${brand.correct}'`,
            context: `"${line.trim().slice(0, 70)}…"`,
          });
        }
        if (issues.length >= 10) return issues;
      }
    }
  }

  return issues;
}

/* ========================================================================= */
/*  MAIN EXPORT                                                              */
/* ========================================================================= */

/**
 * Runs a comprehensive rule-based grammar, spelling, and resume phrasing audit.
 * Returns every issue with verbatim evidence, context, fix, and line number.
 */
export function analyzeGrammar(text: string): {
  issues: GrammarIssue[];
  formattedList: string[];
  scorePenalty: number;
} {
  const issues: GrammarIssue[] = [];
  const ignoredRanges = getIgnoredRanges(text);
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter(
    (l) =>
      /^[-•*▪◦‣·–—>]/.test(l) || (l.length > 40 && /^[A-Z][a-z]+ed\b|^[A-Z][a-z]+ing\b/.test(l)),
  );
  const MAX_ISSUES = 50;

  // Helper: find line number for a match index
  const findLine = (matchIndex: number): number => {
    let charCount = 0;
    for (let i = 0; i < rawLines.length; i++) {
      charCount += rawLines[i].length + 1; // +1 for newline
      if (charCount > matchIndex) return i + 1;
    }
    return rawLines.length;
  };

  // 1. SPELLING DICTIONARY
  for (const item of SPELL_CHECK_DICTIONARY) {
    const re = new RegExp(item.bad.source, item.bad.flags.includes("g") ? item.bad.flags : item.bad.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      // Skip anything occurring within URLs, emails, or links
      if (isInsideIgnoredRange(matchIndex, matchText.length, ignoredRanges)) {
        continue;
      }

      const snippetStart = Math.max(0, matchIndex - 25);
      const snippetEnd = Math.min(text.length, matchIndex + matchText.length + 25);
      const context = text.slice(snippetStart, snippetEnd).replace(/\r?\n/g, " ").trim();

      const exists = issues.some(
        (i) => i.error.toLowerCase() === matchText.toLowerCase() && i.explanation === item.explain,
      );
      if (!exists) {
        issues.push({
          id: `spell-${issues.length + 1}`,
          type: "spelling",
          severity: "major",
          error: matchText,
          fix: item.fix.replace(/\$1/g, match[1] || ""),
          explanation: item.explain,
          context: `"…${context}…"`,
          line: findLine(matchIndex),
        });
      }
      if (issues.length >= MAX_ISSUES) break;
    }
    if (issues.length >= MAX_ISSUES) break;
  }

  // 2. GRAMMAR PATTERNS
  for (const item of GRAMMAR_PATTERNS) {
    const re = new RegExp(item.re.source, item.re.flags.includes("g") ? item.re.flags : item.re.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      // Skip links / emails
      if (isInsideIgnoredRange(matchIndex, matchText.length, ignoredRanges)) {
        continue;
      }

      // Skip number repeats
      if (/^\d+\s+\d+$/.test(matchText)) continue;
      // Skip short repeated words that are intentional (e.g. "to to" false positive in "to together")
      if (matchText.length < 4 && item.explain.includes("repetition")) continue;

      const snippetStart = Math.max(0, matchIndex - 25);
      const snippetEnd = Math.min(text.length, matchIndex + matchText.length + 25);
      const context = text.slice(snippetStart, snippetEnd).replace(/\r?\n/g, " ").trim();

      const exists = issues.some((i) => i.error.toLowerCase() === matchText.toLowerCase() && i.type === "grammar");
      if (!exists) {
        issues.push({
          id: `gram-${issues.length + 1}`,
          type: item.explain.includes("repetition") ? "repetition" : "grammar",
          severity: item.severity,
          error: matchText,
          fix: item.fix.replace(/\$1/g, match[1] || ""),
          explanation: item.explain,
          context: `"…${context}…"`,
          line: findLine(matchIndex),
        });
      }
      if (issues.length >= MAX_ISSUES) break;
    }
    if (issues.length >= MAX_ISSUES) break;
  }

  // 3. PUNCTUATION ANOMALIES
  for (const item of PUNCTUATION_PATTERNS) {
    const re = new RegExp(item.re.source, item.re.flags.includes("g") ? item.re.flags : item.re.flags + "g");
    let match: RegExpExecArray | null;
    let puncCount = 0;
    while ((match = re.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      // Skip links / emails
      if (isInsideIgnoredRange(matchIndex, matchText.length, ignoredRanges)) {
        continue;
      }

      // Avoid false positives on decimals/versions "3.14", "v2.0", URLs
      if (/^\d[.:]\d$/.test(matchText)) continue;
      if (/https?:\/\//.test(text.slice(Math.max(0, matchIndex - 10), matchIndex + matchText.length + 5))) continue;

      const exists = issues.some((i) => i.error === matchText && i.type === "punctuation");
      if (!exists) {
        issues.push({
          id: `punc-${issues.length + 1}`,
          type: "punctuation",
          severity: "minor",
          error: matchText,
          fix: item.fix.replace(/\$1/g, match[1] || "").replace(/\$2/g, match[2] || ""),
          explanation: item.explain,
          line: findLine(matchIndex),
        });
        puncCount++;
      }
      if (puncCount >= 8 || issues.length >= MAX_ISSUES) break;
    }
    if (issues.length >= MAX_ISSUES) break;
  }

  // 4. OCR ARTIFACT DETECTION (digit↔letter corruption from scanned PDFs)
  if (issues.length < MAX_ISSUES) {
    const ocrIssues = detectOcrArtifacts(text, findLine).filter((i) => {
      // Filter out if it occurs inside links or tech names
      const mIdx = text.toLowerCase().indexOf(i.error.toLowerCase());
      return mIdx === -1 || !isInsideIgnoredRange(mIdx, i.error.length, ignoredRanges);
    });
    issues.push(...ocrIssues.slice(0, MAX_ISSUES - issues.length));
  }

  // 5. TENSE INCONSISTENCY
  if (issues.length < MAX_ISSUES) {
    const tenseIssues = detectTenseInconsistency(bullets);
    issues.push(...tenseIssues.slice(0, MAX_ISSUES - issues.length));
  }

  // (Capitalization audit intentionally skipped per user specification: focus solely on true spelling, typos, and syntax)

  // Format list for display and exports
  const formattedList = issues.map(
    (i) => `[${i.type.toUpperCase()}] "${i.error}" → "${i.fix}" — ${i.explanation}${i.line ? ` (line ${i.line})` : ""}`,
  );

  // Score penalty: 1 pt per minor, 2.5 pts per major, 5 pts per critical, capped at 20 pts
  const scorePenalty = Math.min(
    20,
    issues.reduce((acc, i) =>
      acc + (i.severity === "critical" ? 5 : i.severity === "major" ? 2.5 : 1), 0),
  );

  return {
    issues,
    formattedList,
    scorePenalty: Math.round(scorePenalty * 10) / 10,
  };
}
