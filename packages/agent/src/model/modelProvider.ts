/**
 * Picks the real ModelClient from settings: MODEL_PROVIDER says which, and each
 * provider's own settings are required. There is no default provider or model;
 * a missing setting throws before any model is called.
 *
 * Takes the settings as a plain record (never reads process.env itself), so the
 * caller owns where they come from.
 *
 * Call sites: apps/local-server (startup), scripts/live/env.ts (agent CLI and
 * scenario runner).
 */
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { ModelClient } from "@helper-assistant/domain";
import { AnthropicModel, anthropicMessagesApi } from "./anthropicModel";
import { BedrockModel, bedrockConverseApi } from "./bedrockModel";

export const ModelProvider = { ANTHROPIC: "anthropic", BEDROCK: "bedrock" } as const;
export type ModelProvider = (typeof ModelProvider)[keyof typeof ModelProvider];

export type ModelSettings = Readonly<Record<string, string | undefined>>;

function required(settings: ModelSettings, name: string, why: string): string {
  const value = settings[name]?.trim();
  if (value === undefined || value === "") throw new Error(`${name} is not set (${why}). See .env.example.`);
  return value;
}

export function modelFromSettings(settings: ModelSettings): { model: ModelClient; description: string } {
  const provider = required(settings, "MODEL_PROVIDER", `"${ModelProvider.ANTHROPIC}" or "${ModelProvider.BEDROCK}"`);
  switch (provider) {
    case ModelProvider.ANTHROPIC: {
      const apiKey = required(settings, "ANTHROPIC_API_KEY", "needed for MODEL_PROVIDER=anthropic");
      const modelId = required(settings, "ANTHROPIC_MODEL_ID", "needed for MODEL_PROVIDER=anthropic");
      return { model: new AnthropicModel(anthropicMessagesApi(new Anthropic({ apiKey })), modelId), description: `Claude API ${modelId}` };
    }
    case ModelProvider.BEDROCK: {
      const modelId = required(settings, "BEDROCK_MODEL_ID", "needed for MODEL_PROVIDER=bedrock");
      const region = required(settings, "AWS_REGION", "needed for MODEL_PROVIDER=bedrock");
      return { model: new BedrockModel(bedrockConverseApi(new BedrockRuntimeClient({ region })), modelId), description: `Bedrock ${modelId} in ${region}` };
    }
    default:
      throw new Error(`MODEL_PROVIDER "${provider}" isn't "${ModelProvider.ANTHROPIC}" or "${ModelProvider.BEDROCK}"`);
  }
}
