export type SkillType =
  | "packing"
  | "checklist"
  | "household_procedure"
  | "browser_workflow";

export type SkillSource =
  | "voice"
  | "text"
  | "photo"
  | "camera_demo"
  | "screen_demo";

export type Engine = {
  provider: string;
  model: string | null;
  duration_ms: number | null;
  request_id: string | null;
};

export type SkillItem = {
  name: string;
  required: boolean;
  aliases: string[];
  verification?: "confirmed_packed" | "visible_packed" | "explicitly_missing" | "not_verified";
  evidence_s3_key?: string | null;
};

export type SkillStep = {
  order: number;
  instruction: string;
  target_element_id: string | null;
  screen: string | null;
  expected_event: string | null;
};

export type Draft = {
  title: string;
  summary: string | null;
  items: SkillItem[];
  steps: SkillStep[];
  ambiguities: string[];
  engine: Engine;
};

export type Skill = {
  skill_id: string;
  owner_id: string;
  title: string;
  type: SkillType;
  version: number;
  source: SkillSource;
  items: SkillItem[];
  steps: SkillStep[];
  visibility: "private" | "shared";
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type RecallResponse = {
  skill: Skill;
  query: string;
  matched_terms: string[];
  have: string[];
  not_confirmed: { name: string; aliases: string[] }[];
  explanation: string;
};

export type NextStep = {
  session_id: string;
  done: boolean;
  step_order: number | null;
  instruction: string | null;
  screen: string | null;
  target_element_id: string | null;
};

export type VerifyResult = {
  verdict: "verified" | "mismatch" | "uncertain";
  reason: string;
  advanced: boolean;
};
