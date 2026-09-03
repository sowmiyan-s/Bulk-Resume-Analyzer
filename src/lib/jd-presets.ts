export interface JdPreset {
  id: string;
  roleTitle: string;
  category: "Frontend" | "Backend" | "FullStack" | "AI/ML" | "DevOps" | "Data" | "Mobile";
  description: string;
  coreSkills: string[];
}

export const JD_PRESETS: JdPreset[] = [
  {
    id: "frontend-react",
    roleTitle: "Frontend Developer (React / TypeScript)",
    category: "Frontend",
    coreSkills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Next.js", "Redux", "REST API", "Git"],
    description: `We are looking for a skilled Frontend Developer proficient in React, TypeScript, modern CSS (Tailwind), and Next.js.
Key Responsibilities:
- Build responsive, accessible, and high-performance user interfaces.
- Integrate RESTful and GraphQL APIs with state management (Redux, React Query, or Zustand).
- Implement client-side optimizations, component testing (Jest, React Testing Library), and clean UI architecture.
- Collaborate with backend engineers, designers, and product managers.`,
  },
  {
    id: "backend-node-python",
    roleTitle: "Backend Software Engineer (Node.js / Python)",
    category: "Backend",
    coreSkills: ["Node.js", "Python", "TypeScript", "PostgreSQL", "MongoDB", "Redis", "Docker", "REST API", "Microservices", "Git"],
    description: `Seeking a Backend Software Engineer with solid foundations in Node.js or Python, relational/NoSQL databases, and API development.
Key Responsibilities:
- Design, develop, and maintain high-throughput backend services and microservices.
- Design database schemas, optimize SQL queries, and implement Redis caching.
- Build secure authentication (JWT, OAuth), rate limiting, and event-driven architectures.
- Containerize services with Docker and participate in code reviews.`,
  },
  {
    id: "fullstack-mern",
    roleTitle: "Full Stack Engineer (MERN / Next.js)",
    category: "FullStack",
    coreSkills: ["React", "Node.js", "TypeScript", "Express", "MongoDB", "PostgreSQL", "Next.js", "Tailwind CSS", "Docker", "Git"],
    description: `Looking for a versatile Full Stack Developer comfortable with end-to-end web engineering.
Key Responsibilities:
- Develop modern full-stack web applications using React, Next.js, Node.js, and PostgreSQL/MongoDB.
- Implement server-side rendering, database migrations, and REST/GraphQL APIs.
- Ensure test coverage, CI/CD deployment automation, and responsive UI design.`,
  },
  {
    id: "ai-ml-rag",
    roleTitle: "AI / ML Engineer (Python / LLM / RAG)",
    category: "AI/ML",
    coreSkills: ["Python", "PyTorch", "LangChain", "LlamaIndex", "Vector Search", "Transformers", "FastAPI", "Docker", "Git"],
    description: `Seeking an AI / ML Engineer specializing in Generative AI, Retrieval-Augmented Generation (RAG), and model deployment.
Key Responsibilities:
- Build and evaluate RAG pipelines using vector databases (Pinecone, Chroma, Qdrant, FAISS) and embedding models.
- Fine-tune or prompt-engineer open-source and frontier LLMs (Llama, Mistral, Qwen, Gemini).
- Build fast microservice APIs with FastAPI and containerize AI workflows with Docker.`,
  },
  {
    id: "devops-cloud",
    roleTitle: "DevOps & Cloud Engineer (AWS / Kubernetes)",
    category: "DevOps",
    coreSkills: ["Kubernetes", "Docker", "AWS", "Terraform", "CI/CD", "GitHub Actions", "Linux", "Prometheus", "Git"],
    description: `Looking for a DevOps & Infrastructure Engineer to scale cloud architectures and delivery pipelines.
Key Responsibilities:
- Maintain Kubernetes clusters, Docker container orchestration, and Infrastructure as Code (Terraform).
- Build robust CI/CD deployment pipelines using GitHub Actions or GitLab CI.
- Implement cloud security, observability, logging, and metrics (Prometheus, Grafana).`,
  },
  {
    id: "data-analyst",
    roleTitle: "Data Analyst / Analytics Engineer",
    category: "Data",
    coreSkills: ["SQL", "Python", "Pandas", "Power BI", "Tableau", "Data Modeling", "Excel", "Statistics", "Git"],
    description: `We are hiring a Data Analyst to translate raw metrics into actionable business intelligence.
Key Responsibilities:
- Write complex SQL queries, extract datasets, and perform exploratory data analysis using Python (Pandas, NumPy).
- Design and maintain interactive dashboards in Power BI or Tableau.
- Perform statistical analysis, cohort segmentation, and metric KPI tracking.`,
  },
];
