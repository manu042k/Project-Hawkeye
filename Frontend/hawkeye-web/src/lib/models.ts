export const MODEL_GROUPS = [
  {
    label: "Anthropic (via OpenRouter)",
    models: [
      { value: "openrouter:anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 ✦ vision" },
      { value: "openrouter:anthropic/claude-opus-4",     label: "Claude Opus 4 ✦ vision" },
      { value: "openrouter:anthropic/claude-haiku-4-5",  label: "Claude Haiku 4.5 ✦ vision" },
    ],
  },
  {
    label: "OpenAI (via OpenRouter)",
    models: [
      { value: "openrouter:openai/gpt-4o",             label: "GPT-4o ✦ vision" },
      { value: "openrouter:openai/gpt-4.1",            label: "GPT-4.1 ✦ vision" },
      { value: "openrouter:openai/gpt-oss-120b:free",  label: "GPT-OSS 120B (free tier)" },
    ],
  },
  {
    label: "Groq",
    models: [
      { value: "groq:llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { value: "groq:llama-3.1-8b-instant",    label: "Llama 3.1 8B Instant" },
    ],
  },
  {
    label: "NVIDIA NIM",
    models: [
      { value: "nvidia:nvidia/llama-3.2-90b-vision-instruct",  label: "Llama 3.2 90B Vision ✦ vision" },
      { value: "nvidia:nvidia/llama-3.2-11b-vision-instruct",  label: "Llama 3.2 11B Vision ✦ vision" },
      { value: "nvidia:meta/llama-3.3-70b-instruct",           label: "Llama 3.3 70B Instruct" },
      { value: "nvidia:nvidia/nemotron-4-340b-instruct",        label: "Nemotron 4 340B ✦ vision" },
      { value: "nvidia:moonshotai/kimi-k2.6",                  label: "Kimi K2.6 (default)" },
    ],
  },
];

export const DEFAULT_MODEL = "nvidia:moonshotai/kimi-k2.6";
export const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models);
