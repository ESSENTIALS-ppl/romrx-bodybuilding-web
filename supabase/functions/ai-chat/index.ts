// ROMRx AI Chat v32 — sport-aware (PR #6)
// - v31 base: resolves active_sport server-side, sport-filtered RAG,
//   coach roster mode + BJJ athlete mode.
// - v32 adds BODYBUILDING athlete mode: when sport === 'bodybuilding',
//   ROMBot is fed the athlete's generated training program (split + per-day
//   exercises), planned weekly volume vs MAV landmarks, last-7d logged
//   volume, active mesocycle week/RIR phase, and ROM readiness — instead of
//   the BJJ belt/technique/game-plan sections. BJJ + coach paths unchanged.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROMRX_OPENAI_KEY = Deno.env.get("romrx_openai_key") ?? "";
const ROMRX_ANTHROPIC_KEY = Deno.env.get("romrx_anthropic_key") ?? "";

function jwtRole(jwt: string): string {
  try { return JSON.parse(atob(jwt.split(".")[1]))?.role ?? "anon"; }
  catch { return "anon"; }
}

const JOINT_LABELS: Record<string, string> = {
  hip_er: "hip external rotation", hip_ir: "hip internal rotation",
  hip_abd: "hip abduction", hip_flex: "hip flexion",
  shoulder_er: "shoulder external rotation", shoulder_flex: "shoulder flexion",
  ankle_df: "ankle mobility", lumbar_flex: "lumbar flexion",
  lumbar_ext: "lumbar extension", thoracic_rot: "thoracic rotation",
  cervical_rot: "neck rotation",
};
function labelJoint(key: string): string {
  return JOINT_LABELS[key] ?? key.replace(/_/g, " ");
}

// ── Coach roster system prompt ──────────────────────────────────────────────
function buildCoachSystemPrompt(coachName: string, rosterContexts: Array<Record<string, unknown>>): string {
  const athleteSections = rosterContexts.map((ctx) => {
    const name       = (ctx.full_name as string | null) ?? "Unknown Athlete";
    const belt       = (ctx.belt as string | null) ?? "white";
    const summary    = ctx.technique_summary as Record<string, number> | null;
    const worst      = ctx.worst_joints as string[] | null;
    const greenTechs = ctx.green_techniques as Array<{name: string; category: string}> | null;
    const yellowTechs = ctx.yellow_techniques as Array<{name: string; category: string; limiting_joints: string[] | null}> | null;
    const savedPlans = ctx.saved_game_plans as Array<{name: string; path_mode: string}> | null;

    const greenByCategory = (greenTechs ?? []).reduce((acc, t) => {
      if (!acc[t.category]) acc[t.category] = [];
      acc[t.category].push(t.name);
      return acc;
    }, {} as Record<string, string[]>);
    const greenSection = Object.entries(greenByCategory).length > 0
      ? Object.entries(greenByCategory).map(([cat, names]) => `    ${cat}: ${names.join(", ")}`).join("\n")
      : "    No assessment yet";

    const yellowSection = yellowTechs && yellowTechs.length > 0
      ? yellowTechs.map(t => {
          const joints = (t.limiting_joints ?? []).map(j => labelJoint(j)).join(", ");
          return `    ${t.name} (${t.category})${joints ? ` - ${joints} limiting` : ""}`;
        }).join("\n")
      : "    No assessment yet";

    const plansSection = savedPlans && savedPlans.length > 0
      ? savedPlans.map(p => `    "${p.name}" (${p.path_mode})`).join("\n")
      : "    None saved yet";

    return `### ${name} (${belt} belt)
  Readiness: ${summary ? `${summary.green ?? 0} GREEN / ${summary.yellow ?? 0} YELLOW / ${summary.red ?? 0} RED` : "No assessment"}
  Priority joints: ${worst?.map(j => labelJoint(j)).join(", ") ?? "No data"}
  GREEN techniques (ready to train):
${greenSection}
  YELLOW techniques (train with awareness):
${yellowSection}
  Saved game plans:
${plansSection}`;
  });

  return `You are ROMBot, the team intelligence assistant for ROMRxBJJ coach ${coachName}.

You have full access to ALL of your athletes' ROM profiles, technique readiness, and saved game plans. Use this data to answer coaching questions with specificity.

## Your Roster (${rosterContexts.length} athlete${rosterContexts.length !== 1 ? "s" : ""})

${athleteSections.join("\n\n")}

## Your Role as Coach ROMBot
- Answer questions about individual athletes or the whole team by name
- Identify who is most at risk, who is ready to train hard, who needs modified work
- Suggest technique readiness comparisons across the roster
- Help build game plans for specific athletes based on their GREEN/YELLOW profile
- Suggest drill assignments and mobility priorities per athlete
- Reference saved game plans by name

## Critical Rules
- NEVER reveal specific degree values or ROM thresholds - these are proprietary
- NEVER use technique codes (e.g. WT-1) - use technique names only
- Reference joint restrictions with soft language: "hip IR is restricted", "shoulder flexion is limited"
- Use technique names from each athlete's GREEN/YELLOW lists when making recommendations
- Be direct and coaching-focused. You are talking to a professional.

Keep responses concise and actionable. Use bullet points. Always tie advice to actual athlete data.`;
}

// ── BJJ Athlete system prompt ────────────────────────────────────────────────
function buildAthleteSystemPrompt(ctx: Record<string, unknown>, sport: string): string {
  const name        = ctx.full_name ?? "Athlete";
  const belt        = ctx.belt ?? "white";
  const techSummary = ctx.technique_summary as Record<string, number> | null;
  const protocol    = ctx.protocol as unknown[] | null;
  const redTechs    = ctx.red_techniques as unknown[] | null;
  const worstJoints = ctx.worst_joints as string[] | null;
  const greenTechs  = ctx.green_techniques as Array<{name: string; category: string; belt: string}> | null;
  const yellowTechs = ctx.yellow_techniques as Array<{name: string; category: string; belt: string; limiting_joints: string[] | null}> | null;
  const savedPlans  = ctx.saved_game_plans as Array<{name: string; path_mode: string; techniques: Array<{name: string; category: string}>; created_at: string}> | null;

  const greenByCategory = (greenTechs ?? []).reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t.name);
    return acc;
  }, {} as Record<string, string[]>);
  const greenSection = Object.entries(greenByCategory).length > 0
    ? Object.entries(greenByCategory).map(([cat, names]) => `  ${cat}: ${names.join(", ")}`).join("\n")
    : "  No assessment completed yet";

  const yellowSection = yellowTechs && yellowTechs.length > 0
    ? yellowTechs.map(t => {
        const joints = (t.limiting_joints ?? []).map(j => labelJoint(j)).join(", ");
        return `  ${t.name} (${t.category})${joints ? ` - ${joints} limiting` : ""}`;
      }).join("\n")
    : "  No assessment completed yet";

  const redSection = redTechs && redTechs.length > 0
    ? redTechs.slice(0, 8).map((t: unknown) => {
        const tech = t as Record<string, unknown>;
        const joints = ((tech.limiting_joints ?? []) as string[]).map(j => labelJoint(j)).join(", ");
        return `  ${tech.name} (${tech.belt} belt) - ${joints} limiting`;
      }).join("\n")
    : "  None yet";

  const plansSection = savedPlans && savedPlans.length > 0
    ? savedPlans.map(p => {
        const chain = (p.techniques ?? []).map((t: {name: string}) => t.name).join(" > ");
        return `  "${p.name}" (${p.path_mode}): ${chain}`;
      }).join("\n")
    : "  No saved game plans yet";

  return `You are ROMBot, the AI mobility intelligence assistant for ROMRx.

## Athlete Profile
Name: ${name} | Belt: ${belt} belt | Sport: ${sport.toUpperCase()}
Technique readiness: ${techSummary ? `${techSummary.green ?? 0} GREEN, ${techSummary.yellow ?? 0} YELLOW, ${techSummary.red ?? 0} RED` : "No assessment yet"}
Priority joints to improve: ${worstJoints?.map(j => labelJoint(j)).join(", ") ?? "No assessment yet"}

## GREEN techniques - ready to train now
${greenSection}

## YELLOW techniques - train with awareness
${yellowSection}

## RED techniques - build mobility before attempting
${redSection}

## Priority mobility protocol
${protocol?.slice(0, 3).map((p: unknown) => {
  const ex = p as Record<string, unknown>;
  return `  ${ex.joint ?? ex.jointKey}: ${ex.exercise} - ${ex.sets}x${ex.reps} (${ex.cue ?? ex.coaching_cue})`;
}).join("\n") ?? "  No protocol generated yet"}

## Saved Game Plans
${plansSection}

## Critical Rules
- NEVER reveal specific degree values or ROM thresholds
- NEVER use technique codes - use technique names only
- Reference restrictions with soft language: "hip IR is restricted"
- If asked for numbers say: "I can't share exact measurements, but I can tell you how your mobility compares to what each technique needs"

Keep responses focused. Use bullet points. Tie advice to this athlete's GREEN/YELLOW/RED profile.`;
}

// ── Bodybuilding athlete data + prompt ───────────────────────────────────────
type Landmark = { muscle: string; mv: number; mev: number; mav_low: number; mav_high: number; mrv: number };

function volumeStatus(planned: number, lm: Landmark | undefined): string {
  if (!lm) return "";
  if (planned < lm.mev) return "BELOW MEV (under-dosed)";
  if (planned < lm.mav_low) return "MEV→MAV (productive, room to add)";
  if (planned <= lm.mav_high) return "in MAV band (optimal)";
  if (planned <= lm.mrv) return "MAV→MRV (high, near max recoverable)";
  return "ABOVE MRV (overreaching — pull back)";
}

async function buildBodybuildingAthletePrompt(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  romCtx: Record<string, unknown>,
): Promise<string> {
  const name = (romCtx.full_name as string | null) ?? "Athlete";
  const techSummary = romCtx.technique_summary as Record<string, number> | null;
  const worstJoints = romCtx.worst_joints as string[] | null;

  // 1) Active generated program: workouts (sessions) + their exercises.
  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, name, day_label, split_type, source_program, created_at")
    .eq("user_id", userId)
    .eq("is_template", false)
    .like("source_program", "generated:%")
    .order("created_at", { ascending: false });

  // Most-recent program key = the generated program currently in effect.
  const latestProgram = (workouts ?? [])[0]?.source_program as string | undefined;
  const sessions = (workouts ?? []).filter(w => w.source_program === latestProgram);
  const sessionIds = sessions.map(s => s.id);

  let exByWorkout: Record<string, Array<{ name: string; sets: number; reps_min: number | null; reps_max: number | null; notes: string | null }>> = {};
  if (sessionIds.length > 0) {
    const { data: wex } = await supabase
      .from("workout_exercises")
      .select("workout_id, exercise_name, sets, reps_min, reps_max, target_notes, position")
      .in("workout_id", sessionIds)
      .order("position", { ascending: true });
    exByWorkout = (wex ?? []).reduce((acc, e) => {
      const wid = e.workout_id as string;
      if (!acc[wid]) acc[wid] = [];
      acc[wid].push({
        name: e.exercise_name as string,
        sets: (e.sets as number) ?? 0,
        reps_min: (e.reps_min as number | null) ?? null,
        reps_max: (e.reps_max as number | null) ?? null,
        notes: (e.target_notes as string | null) ?? null,
      });
      return acc;
    }, {} as typeof exByWorkout);
  }

  // 2) Planned weekly volume per muscle (sum of planned sets across program).
  const { data: planned } = await supabase.rpc("program_planned_volume", { p_program: latestProgram ?? null });
  const plannedMap: Record<string, number> = {};
  for (const row of (planned ?? []) as Array<{ muscle: string; planned_sets: number }>) {
    plannedMap[row.muscle] = Number(row.planned_sets) || 0;
  }

  // 3) Logged volume last 7 days per primary muscle (service-client inline; the
  //    weekly_muscle_volume RPC is auth.uid()-scoped so we query directly).
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: loggedRows } = await supabase
    .from("workout_sets")
    .select("technique_id, techniques!inner(primary_muscle)")
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .gte("performed_at", since);
  const loggedMap: Record<string, number> = {};
  for (const r of (loggedRows ?? []) as Array<{ techniques: { primary_muscle: string | null } | null }>) {
    const m = r.techniques?.primary_muscle;
    if (m) loggedMap[m] = (loggedMap[m] ?? 0) + 1;
  }

  // 4) Volume landmarks.
  const { data: lmRows } = await supabase
    .from("muscle_volume_landmarks")
    .select("muscle, mv, mev, mav_low, mav_high, mrv");
  const landmarks: Record<string, Landmark> = {};
  for (const l of (lmRows ?? []) as Landmark[]) landmarks[l.muscle] = l;

  // 5) Active mesocycle (week + RIR phase).
  const { data: meso } = await supabase
    .from("mesocycles")
    .select("name, weeks, current_week, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .maybeSingle();

  // ── Compose sections ──
  const programSection = sessions.length > 0
    ? sessions.map((s) => {
        const exs = exByWorkout[s.id as string] ?? [];
        const lines = exs.map(e => {
          const rep = e.reps_min && e.reps_max ? ` ${e.reps_min}-${e.reps_max} reps` : "";
          const note = e.notes ? ` — ${e.notes}` : "";
          return `    ${e.name}: ${e.sets} sets${rep}${note}`;
        }).join("\n");
        return `  ${s.day_label ?? s.name} (${s.split_type ?? "session"}):\n${lines || "    (no exercises)"}`;
      }).join("\n")
    : "  No generated program yet — athlete hasn't built one in My Training.";

  const splitType = sessions[0]?.split_type ?? null;

  const muscleOrder = Object.keys({ ...plannedMap, ...loggedMap, ...landmarks });
  const volumeSection = muscleOrder.length > 0
    ? muscleOrder
        .filter(m => (plannedMap[m] ?? 0) > 0 || (loggedMap[m] ?? 0) > 0)
        .sort((a, b) => (plannedMap[b] ?? 0) - (plannedMap[a] ?? 0))
        .map(m => {
          const p = plannedMap[m] ?? 0;
          const lg = loggedMap[m] ?? 0;
          const lm = landmarks[m];
          const band = lm ? ` [MEV ${lm.mev} / MAV ${lm.mav_low}-${lm.mav_high} / MRV ${lm.mrv}]` : "";
          const status = volumeStatus(p, lm);
          return `  ${m}: planned ${p} sets/wk, logged ${lg} last 7d${band}${status ? ` — ${status}` : ""}`;
        }).join("\n")
    : "  No program volume yet.";

  const mesoSection = meso
    ? (() => {
        const wk = (meso.current_week as number) ?? 1;
        const total = (meso.weeks as number) ?? 1;
        const isDeload = wk >= total;
        const progress = total > 1 ? (wk - 1) / (total - 1) : 0;
        let rir = "RIR 1-2";
        if (isDeload) rir = "DELOAD (RIR 4+, ~50% volume)";
        else if (progress < 0.34) rir = "RIR 3 (accumulation)";
        else if (progress < 0.67) rir = "RIR 2 (build)";
        else rir = "RIR 1 (overreach)";
        return `  "${meso.name ?? "Mesocycle"}" — Week ${wk} of ${total}. Current intensity target: ${rir}.`;
      })()
    : "  No active mesocycle. Suggest building one in My Training to autoregulate RIR week to week.";

  const romSection = techSummary
    ? `${techSummary.green ?? 0} GREEN (full ROM — train lengthened/stretched-position work freely), ${techSummary.yellow ?? 0} YELLOW (partial ROM — control the stretch), ${techSummary.red ?? 0} RED (restricted — substitute or build mobility first)`
    : "No ROM assessment yet — encourage completing one to unlock stretch-position exercise selection.";

  const priorityJoints = worstJoints?.map(j => labelJoint(j)).join(", ") ?? "No assessment yet";

  return `You are ROMBot, the AI hypertrophy coach for ROMRx Bodybuilding.

You coach ${name} on building muscle. Your job: maximize hypertrophy by managing weekly training volume per muscle against scientific landmarks (MEV/MAV/MRV), driving progressive overload through the mesocycle, and using their joint range-of-motion data to pick exercises that let them train muscles in the lengthened (stretched) position — which is where the biggest growth stimulus lives. Limited joint ROM is exactly what blocks lifters from hitting that deep stretch, so steer them toward movements their ROM supports.

## Athlete ROM Readiness
${romSection}
Priority joints to improve (unlock more stretched-position movements): ${priorityJoints}

## Current Training Program${splitType ? ` (${splitType} split)` : ""}
${programSection}

## Weekly Volume — Planned vs Landmarks vs Logged
Landmarks: MEV = minimum effective volume, MAV = optimal adaptive band, MRV = max recoverable volume. Keep working sets in the MAV band and progress toward MRV across the mesocycle, then deload.
${volumeSection}

## Mesocycle Status
${mesoSection}

## How to Coach
- ALWAYS be concrete and quote the athlete's real numbers. Reference their actual exercises by name and their actual planned set counts vs the MAV band (e.g. "Back is at 12 sets — bump it toward 14-22"). Do NOT give generic advice when you have their data above; cite it.
- Talk like a bodybuilding coach: muscles, sets, reps, RIR, stretch, progressive overload, mesocycle phase. NO BJJ belts, techniques, or game plans.
- When a muscle's planned volume is below MEV, tell them exactly how many sets to add. When above MRV, tell them to cut back. Use the MAV band as the target and name the muscles that are out of range first.
- Tie exercise choices to ROM: GREEN joints → push deep stretched-position movements for that muscle; RED/restricted joints → recommend a constrained-ROM or alternative movement and a mobility drill to unlock it.
- Use the mesocycle week to set effort: earlier weeks higher RIR (more reps in reserve), later weeks lower RIR (closer to failure), deload week = back off.
- If they have no program yet, walk them through generating one in My Training (pick a split, training days, and muscle emphasis — it auto-builds a ROM-aware draft they can edit).

## Critical Rules
- NEVER reveal specific joint degree values or ROM thresholds — they're proprietary. Use soft language ("your hip IR is a bit restricted").
- Be direct, concise, high-energy. Bullet points and short actionable answers. This athlete wants GAINS, not a lecture.

Keep responses focused and tied to this athlete's actual program, volume, and mesocycle data.`;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-ada-002", input: text.slice(0, 1000) }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

async function callProvider(provider: string, model: string | undefined, apiKey: string, systemPrompt: string, history: Array<{role: string; content: string}>, userMessage: string): Promise<{text: string; tokens: number; latency: number}> {
  const t0 = Date.now();
  const messages = [...history.map(m => ({role: m.role, content: m.content})), {role: "user", content: userMessage}];
  if (provider === "rombot" || provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {Authorization: `Bearer ${apiKey || ROMRX_OPENAI_KEY}`, "Content-Type": "application/json"},
      body: JSON.stringify({model: model ?? "gpt-4o", messages: [{role: "system", content: systemPrompt}, ...messages], max_tokens: 1200, temperature: 0.5}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? "OpenAI error");
    return {text: data.choices[0].message.content, tokens: data.usage?.total_tokens ?? 0, latency: Date.now() - t0};
  }
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"x-api-key": apiKey || ROMRX_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
      body: JSON.stringify({model: model ?? "claude-opus-4-5", system: systemPrompt, messages, max_tokens: 1200}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? "Anthropic error");
    return {text: data.content[0].text, tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0), latency: Date.now() - t0};
  }
  throw new Error(`Unknown provider: ${provider}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {headers: {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"}});
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const role = jwtRole(token);
    const body = await req.json();
    // Sport: server-resolved from users.active_sport for auth'd users so
    // the client cannot escalate access. Guests fall back to body.sport.
    let sport: string = body.sport ?? "bjj";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let systemPrompt = "";
    let provider = "rombot", providerModel: string | undefined, providerKey = "";
    let conversationId: string | undefined = body.conversation_id;
    let saveHistory = false, userId: string | undefined;

    if (role === "authenticated") {
      const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {global: {headers: {Authorization: authHeader}}});
      const {data: {user}, error: authErr} = await userClient.auth.getUser();
      if (authErr || !user) return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401});
      userId = user.id; saveHistory = true;

      const {data: prefs} = await supabase.from("user_ai_preferences").select("provider, model, api_key_enc").eq("user_id", userId).maybeSingle();
      if (prefs) { provider = prefs.provider; providerModel = prefs.model ?? undefined; providerKey = prefs.api_key_enc ?? ""; }

      // Resolve portal role + active sport server-side
      const {data: userRow} = await supabase.from("users").select("portal_role, full_name, active_sport").eq("id", userId).maybeSingle();
      const portalRole = userRow?.portal_role as string | undefined;
      sport = (userRow?.active_sport as string | undefined) ?? sport;

      if (portalRole === "coach") {
        // ── COACH MODE ─────────────────────────────────────────────────────
        const coachName = (userRow?.full_name as string | null) ?? "Coach";
        const { data: coachRow } = await supabase.from("coaches").select("id").eq("user_id", userId).maybeSingle();

        let rosterContexts: Array<Record<string, unknown>> = [];
        if (coachRow) {
          const { data: athletes } = await supabase.from("athletes").select("user_id").eq("coach_id", coachRow.id).eq("is_active", true);
          if (athletes && athletes.length > 0) {
            const userIds = athletes.map(a => a.user_id).filter(Boolean);
            const ctxPromises = userIds.map(uid =>
              supabase.from("rombot_context").select("*").eq("user_id", uid).maybeSingle().then(({data}) => data)
            );
            const results = await Promise.all(ctxPromises);
            rosterContexts = results.filter(Boolean) as Array<Record<string, unknown>>;
          }
        }
        systemPrompt = buildCoachSystemPrompt(coachName, rosterContexts);
      } else {
        // ── ATHLETE MODE ───────────────────────────────────────────────────
        const {data: dbCtx} = await supabase.from("rombot_context").select("*").eq("user_id", userId).maybeSingle();
        const ctx = dbCtx ?? {};
        if (sport === "bodybuilding") {
          // BB athletes get program/volume/mesocycle-flavored coaching.
          systemPrompt = await buildBodybuildingAthletePrompt(supabase, userId, ctx);
        } else {
          systemPrompt = buildAthleteSystemPrompt(ctx, sport);
        }
      }
    } else {
      if (!body.user_email) return new Response(JSON.stringify({error: "user_email required for guest mode"}), {status: 400});
      const ctx = body.guest_context ?? {};
      provider = body.provider ?? "rombot";
      providerKey = body.provider_key ?? "";
      systemPrompt = buildAthleteSystemPrompt(ctx, sport);
    }

    let history: Array<{role: string; content: string}> = [];
    if (saveHistory && conversationId) {
      const {data: dbHistory} = await supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", {ascending: true}).limit(20);
      history = (dbHistory ?? []) as typeof history;
    } else if (body.history) { history = (body.history as typeof history).slice(-10); }

    if (saveHistory && !conversationId && userId) {
      const {data: convo, error: convoErr} = await supabase.from("ai_conversations").insert({user_id: userId, sport, provider, model: providerModel ?? null, context_snapshot: {}}).select("id").single();
      if (convoErr) throw convoErr;
      conversationId = convo.id;
    }

    // RAG: sport-aware semantic search.
    const embedding = await getEmbedding(body.message, ROMRX_OPENAI_KEY);
    let ragSection = "";
    if (embedding) {
      const { data: chunks } = await supabase.rpc("search_rombot_knowledge", {
        query_embedding: embedding,
        p_sport: sport,
        match_threshold: 0.7,
        match_count: 4,
      });
      if (chunks && chunks.length > 0) {
        ragSection = "\n\n## Relevant Research\n" + chunks.map((c: {topic: string; chunk: string; source_citation: string}) =>
          `${c.topic}: ${c.chunk} (${c.source_citation})`
        ).join("\n");
      }
    }

    const {text, tokens, latency} = await callProvider(provider, providerModel, providerKey, systemPrompt + ragSection, history, body.message);

    if (saveHistory && conversationId && userId) {
      await supabase.from("ai_messages").insert([
        {conversation_id: conversationId, user_id: userId, role: "user", content: body.message},
        {conversation_id: conversationId, user_id: userId, role: "assistant", content: text, tokens_used: tokens, latency_ms: latency},
      ]);
      if (!body.conversation_id) await supabase.from("ai_conversations").update({title: body.message.slice(0, 60)}).eq("id", conversationId);
    }

    return new Response(JSON.stringify({reply: text, conversation_id: conversationId ?? null, provider, sport}), {headers: {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({error: msg}), {status: 500, headers: {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}});
  }
});
