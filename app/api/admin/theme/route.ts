import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const DEFAULT_THEME = {
  preset: "default",
  primary: "#11263f",
  secondary: "#193957",
  accent: "#ff6b57",
  background: "#f6f2e9",
  surface: "#ffffff",
  text: "#17202b",
  muted: "#68717c",
  line: "#dedbd3",
  typography: "classic",
  density: "comfortable",
  radius: "17",
  shadow: "soft",
} as const;

const settingKeys: Record<keyof typeof DEFAULT_THEME,string> = {
  preset: "ui_theme_preset",
  primary: "ui_primary",
  secondary: "ui_secondary",
  accent: "ui_accent",
  background: "ui_background",
  surface: "ui_surface",
  text: "ui_text",
  muted: "ui_muted",
  line: "ui_line",
  typography: "ui_typography",
  density: "ui_density",
  radius: "ui_radius",
  shadow: "ui_shadow",
};

const text = (value: unknown) => String(value ?? "").trim();
const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value).toLowerCase() : fallback;

export async function POST(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request,["admin"]))) return json({error:"Non autorizzato"},403);
  const payload = await request.json() as {action?:string;theme?:Record<string,unknown>};
  const values = payload.action === "reset" ? DEFAULT_THEME : {
    preset: text(payload.theme?.preset) || "custom",
    primary: color(payload.theme?.primary,DEFAULT_THEME.primary),
    secondary: color(payload.theme?.secondary,DEFAULT_THEME.secondary),
    accent: color(payload.theme?.accent,DEFAULT_THEME.accent),
    background: color(payload.theme?.background,DEFAULT_THEME.background),
    surface: color(payload.theme?.surface,DEFAULT_THEME.surface),
    text: color(payload.theme?.text,DEFAULT_THEME.text),
    muted: color(payload.theme?.muted,DEFAULT_THEME.muted),
    line: color(payload.theme?.line,DEFAULT_THEME.line),
    typography: ["classic","modern","rounded"].includes(text(payload.theme?.typography)) ? text(payload.theme?.typography) : DEFAULT_THEME.typography,
    density: ["compact","comfortable","spacious"].includes(text(payload.theme?.density)) ? text(payload.theme?.density) : DEFAULT_THEME.density,
    radius: String(Math.min(28,Math.max(6,Number(payload.theme?.radius)||Number(DEFAULT_THEME.radius)))),
    shadow: ["none","soft","strong"].includes(text(payload.theme?.shadow)) ? text(payload.theme?.shadow) : DEFAULT_THEME.shadow,
  };
  await db().batch(Object.entries(values).map(([key,value])=>db().prepare("INSERT INTO tournament_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(settingKeys[key as keyof typeof DEFAULT_THEME],String(value))));
  return json({ok:true,theme:values,message:payload.action==="reset"?"Stile predefinito ripristinato.":"Stile salvato e pubblicato per tutti."});
}
