import type { PipelineConfig } from "./config.js";
import type { InferenceResult } from "./types.js";

export const SYSTEM_PROMPT = [
  "Convert this reverse-engineered logic into standalone production-ready Expo React Native Web components.",
  "",
  "Output contract:",
  "- Reply with exactly ONE fenced TypeScript code block containing App.tsx.",
  "- The component must be self-contained: no imports from local files, no network calls.",
  "- Use only react, react-native, and expo-compatible APIs; render the recovered screens, navigation, state, and styling.",
  "- Target both iOS and web (react-native-web): safe-area padding, no native-only modules.",
  "- Include a small in-memory mock of any data the original app fetched.",
].join("\n");

const FENCE_RE = /```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)```/i;

export function extractCode(raw: string): string {
  const fenced = [...raw.matchAll(FENCE_RE)]
    .map((m) => (m[1] ?? "").trim())
    .filter((block) => block.length > 0);
  if (fenced.length > 0) {
    const best =
      fenced.find((b) => /export\s+default/.test(b)) ??
      fenced.find((b) => /import\s+.*from\s+['"]react-native['"]/.test(b)) ??
      fenced[0]!;
    return best;
  }
  return raw.trim();
}

export function truncatePayload(
  payload: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (payload.length <= maxChars) return { text: payload, truncated: false };
  const head = Math.ceil(maxChars * 0.7);
  const tail = maxChars - head;
  return {
    text:
      payload.slice(0, head) +
      `\n\n/* … [appbeam] ${payload.length - maxChars} chars elided by GEMINI_MAX_PAYLOAD_CHARS] … */\n\n` +
      payload.slice(payload.length - tail),
    truncated: true,
  };
}

const MOCK_CODE = `import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Item = { id: string; title: string; body: string };

const SEED: Item[] = [
  { id: "1", title: "Recovered feed card", body: "Pulled from the binary's render tree." },
  { id: "2", title: "Search surface", body: "Debounced query against a local index." },
  { id: "3", title: "Settings rows", body: "Optimistic toggles with rollback on failure." },
];

export default function App() {
  const [tab, setTab] = useState<"home" | "search" | "settings">("home");
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);

  const data = SEED.filter((i) =>
    (i.title + i.body).toLowerCase().includes(query.toLowerCase()),
  );
  const theme = dark ? styles.dark : styles.light;

  return (
    <SafeAreaView style={[styles.screen, theme]}>
      <View style={styles.header}>
        <Text style={[styles.title, styles.onSurface]}>Appbeam Preview</Text>
        <Text style={styles.badge}>mock inference</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {tab === "home" &&
          data.map((item) => (
            <View key={item.id} style={[styles.card, styles.onSurface]}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
            </View>
          ))}

        {tab === "search" && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the recovered app…"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.onSurface]}
            autoCapitalize="none"
          />
        )}

        {tab === "settings" && (
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: dark }}
            onPress={() => setDark((d) => !d)}
            style={[styles.row, styles.onSurface]}
          >
            <Text style={styles.cardTitle}>Dark appearance</Text>
            <Text style={styles.cardBody}>{dark ? "on" : "off"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        {(["home", "search", "settings"] as const).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  light: { backgroundColor: "#f8fafc" },
  dark: { backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "700" },
  badge: { color: "#64748b", fontSize: 12 },
  body: { padding: 16, gap: 12 },
  onSurface: { backgroundColor: "#ffffff" },
  card: { borderRadius: 16, padding: 16, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  cardBody: { fontSize: 14, color: "#475569" },
  input: { borderRadius: 12, padding: 14, fontSize: 15, color: "#0f172a" },
  row: {
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#cbd5f1",
    paddingBottom: 12,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabActive: { borderTopWidth: 2, borderTopColor: "#6366f1" },
  tabLabel: { fontSize: 13, color: "#94a3b8", textTransform: "capitalize" },
  tabLabelActive: { color: "#6366f1", fontWeight: "600" },
});
`;

const MOCK_RAW = "```tsx\n" + MOCK_CODE + "\n```";

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function callGemini(
  config: PipelineConfig,
  contents: string,
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey ?? "" });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2,
        },
      });
      const text = response.text;
      if (!text || text.trim() === "") {
        throw new Error("Gemini returned an empty response");
      }
      return text;
    } catch (err) {
      lastError = err;
      const retriable =
        attempt === 1 &&
        (err instanceof Error) &&
        /429|500|503|overloaded|timeout|ECONNRESET/i.test(err.message);
      if (!retriable) break;
      await sleep(4_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Stage 2 — Inference. Ship the REA payload to the Gemini Pro API with a
 * system prompt that converts reverse-engineered logic into Expo components.
 */
export async function runInference(
  payload: string,
  config: PipelineConfig,
): Promise<InferenceResult> {
  const startedAt = Date.now();

  if (config.mode === "mock" || !config.geminiApiKey) {
    if (config.mode === "real" && !config.geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Create one at https://aistudio.google.com/apikey",
      );
    }
    return {
      code: MOCK_CODE,
      raw: MOCK_RAW,
      model: "mock",
      durationMs: Date.now() - startedAt,
    };
  }

  const { text: bounded } = truncatePayload(
    payload,
    config.geminiMaxPayloadChars,
  );
  const raw = await callGemini(
    config,
    `Reverse-engineered evidence (markdown):\n\n${bounded}`,
  );

  return {
    code: extractCode(raw),
    raw,
    model: config.geminiModel,
    durationMs: Date.now() - startedAt,
  };
}
