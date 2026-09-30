export type LangCode = "en-IN" | "hi-IN" | "te-IN";

export const LANGUAGES: { code: LangCode; native: string; english: string; tag: string }[] = [
  { code: "hi-IN", native: "हिन्दी", english: "Hindi", tag: "hi" },
  { code: "te-IN", native: "తెలుగు", english: "Telugu", tag: "te" },
  { code: "en-IN", native: "English", english: "English", tag: "en" },
];

export const langOf = (c: string) => LANGUAGES.find((l) => l.code === c) ?? LANGUAGES[2];
