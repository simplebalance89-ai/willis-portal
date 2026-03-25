"""
Scout Agent — Willis's AI operations assistant.
Intent router + domain handlers + session memory.
Forked from Casa agent, adapted for ops/QA focus.
"""

import os
import json
import time
import logging
import asyncio
from datetime import datetime
from typing import Optional

import httpx
from openai import AzureOpenAI

logger = logging.getLogger("scout.agent")

AZURE_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "https://enpro-filtration-ai.openai.azure.com/")
AZURE_KEY = os.getenv("AZURE_OPENAI_KEY", "")
AZURE_API_VERSION = os.getenv("AZURE_API_VERSION", "2024-12-01-preview")

ROUTER_MODEL = "gpt-4.1-mini"
REASONING_MODEL = "gpt-4.1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_FILE = os.path.join(BASE_DIR, "agent_sessions.json")

MAX_HISTORY = 8

# Test sites for health checks
TEST_SITES = [
    {"name": "Edge Crew V2", "url": "https://edge-crew-v2.onrender.com/health"},
    {"name": "FM Portal", "url": "https://enpro-fm-portal.onrender.com/health"},
    {"name": "Casa Cuervo", "url": "https://casa-cuervo-247d.onrender.com/health"},
    {"name": "C365 Platform", "url": "https://c365-ai-platform-v2.onrender.com/health"},
    {"name": "Willis Portal", "url": "https://willis-portal.onrender.com/health"},
    {"name": "Edge Crew Sandbox", "url": "https://edge-crew-alyssa.onrender.com/health"},
]


def _client():
    return AzureOpenAI(
        azure_endpoint=AZURE_ENDPOINT,
        api_key=AZURE_KEY,
        api_version=AZURE_API_VERSION,
    )


# ---------------------------------------------------------------------------
# Persona
# ---------------------------------------------------------------------------
PERSONA = """You are Scout, Willis's operations assistant on the Ops Portal.
You help Willis with daily QA, health checks, case management, time tracking,
sales pipeline, AI model benchmarking, and reporting.

Rules:
- Be professional but approachable — like a sharp ops coordinator
- Be concise — Willis is working, not chatting. Get to the point.
- Proactively suggest next steps: "Want me to start the timer?" "Should I email Peter?"
- Always confirm before write actions (creating cases, sending emails, updating leads)
- When showing data, use tables or numbered lists
- Flag urgent items first (failed health checks, overdue follow-ups)
- For reports, draft and present for review before sending
- You can help with: health checks, cases, tasks, time tracking, sales pipeline,
  AI benchmarking, proofreading, emailing Peter, and general questions."""


# ---------------------------------------------------------------------------
# Intent Router
# ---------------------------------------------------------------------------
ROUTER_PROMPT = """Classify this message into exactly one intent. Return ONLY the intent word.

Intents:
- health_check: run health checks, check site status, service monitoring
- case_read: show cases, open bugs, case summary
- case_write: create case, update case, close case, escalate
- task_read: show tasks, what's on my plate, priorities
- task_write: update task status, mark done
- timer_start: start timer, begin tracking time
- timer_stop: stop timer, done with task
- crowdsource: benchmark prompt, compare models, run through all models
- pipeline_read: show leads, pipeline status, sales summary
- pipeline_write: add lead, update lead, change stage
- report_generate: weekly report, ops summary, draft report
- email_peter: email peter, message peter, send to peter
- proofread: proofread this, check my writing, edit text
- greeting: hello, hi, good morning
- general: everything else"""


async def route_intent(message: str) -> str:
    try:
        client = _client()
        resp = client.chat.completions.create(
            model=ROUTER_MODEL,
            messages=[
                {"role": "system", "content": ROUTER_PROMPT},
                {"role": "user", "content": message},
            ],
            temperature=0.0,
            max_tokens=20,
        )
        intent = resp.choices[0].message.content.strip().lower().replace('"', '').replace("'", "")
        logger.info(f"Intent: '{intent}' for: '{message[:50]}'")
        return intent
    except Exception as e:
        logger.error(f"Router error: {e}")
        return "general"


# ---------------------------------------------------------------------------
# Session Memory
# ---------------------------------------------------------------------------
def load_sessions() -> dict:
    if os.path.exists(SESSIONS_FILE):
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    return {}


def save_sessions(data: dict):
    with open(SESSIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get_history(session_id: str) -> list:
    sessions = load_sessions()
    return sessions.get(session_id, {}).get("history", [])


def save_turn(session_id: str, user_msg: str, assistant_msg: str):
    sessions = load_sessions()
    if session_id not in sessions:
        sessions[session_id] = {"history": [], "created": datetime.now().isoformat()}
    sessions[session_id]["history"].append({"role": "user", "content": user_msg})
    sessions[session_id]["history"].append({"role": "assistant", "content": assistant_msg})
    sessions[session_id]["history"] = sessions[session_id]["history"][-(MAX_HISTORY * 2):]
    sessions[session_id]["updated"] = datetime.now().isoformat()
    save_sessions(sessions)


# ---------------------------------------------------------------------------
# Context Builders
# ---------------------------------------------------------------------------
def build_task_context(tasks: list) -> str:
    if not tasks:
        return "No tasks."
    lines = [f"Tasks ({len(tasks)}):\n"]
    for t in tasks:
        status_icon = {"not_started": "[ ]", "in_progress": "[>]", "completed": "[x]"}.get(t.get("status", ""), "[ ]")
        lines.append(f"  {status_icon} #{t['id']} {t['title']} — {t.get('priority','?')} ({t.get('time','')})")
    return "\n".join(lines)


def build_case_context(cases: list) -> str:
    if not cases:
        return "No cases."
    open_cases = [c for c in cases if c.get("status") not in ("closed",)]
    lines = [f"Cases: {len(cases)} total, {len(open_cases)} open\n"]
    for c in open_cases[:8]:
        lines.append(f"  #{c['id']} [{c.get('priority','?').upper()}] {c['title']} — {c.get('status','new')}")
    return "\n".join(lines)


def build_pipeline_context(leads: list) -> str:
    if not leads:
        return "No leads in pipeline."
    stages = {}
    total_value = 0
    for l in leads:
        stage = l.get("stage", "prospect")
        stages[stage] = stages.get(stage, 0) + 1
        total_value += l.get("value", 0)
    lines = [f"Pipeline: {len(leads)} leads, ${total_value:,.0f} total value"]
    for stage, count in stages.items():
        lines.append(f"  - {stage.title()}: {count}")
    lines.append("\nLeads:")
    for i, l in enumerate(leads[:8], 1):
        lines.append(f"  {i}. {l.get('company','?')} ({l.get('stage','?')}) — ${l.get('value',0):,.0f} — {l.get('contact','?')}")
    return "\n".join(lines)


def build_time_context(time_log: dict) -> str:
    active = time_log.get("active")
    entries = time_log.get("entries", [])
    lines = []
    if active:
        lines.append(f"Timer RUNNING: {active.get('task_title','')} since {active.get('started','')[:16]}")
    else:
        lines.append("No timer running.")
    today = datetime.now().strftime("%Y-%m-%d")
    today_entries = [e for e in entries if e.get("started", "").startswith(today)]
    if today_entries:
        total_mins = sum(e.get("duration_seconds", 0) for e in today_entries) // 60
        lines.append(f"Today: {len(today_entries)} entries, {total_mins} min total")
        for e in today_entries[-5:]:
            mins = e.get("duration_seconds", 0) // 60
            lines.append(f"  - {e.get('task_title','?')}: {mins} min")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Domain Handlers
# ---------------------------------------------------------------------------
async def handle_health_check() -> dict:
    """Run health checks on all test sites."""
    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for site in TEST_SITES:
            try:
                resp = await client.get(site["url"])
                results.append({"name": site["name"], "status": resp.status_code, "ok": resp.status_code == 200})
            except Exception:
                results.append({"name": site["name"], "status": "timeout", "ok": False})

    healthy = [r for r in results if r["ok"]]
    down = [r for r in results if not r["ok"]]

    if not down:
        reply = f"All {len(results)} services healthy. Looking good."
    else:
        lines = [f"{len(down)} service(s) down:"]
        for r in down:
            lines.append(f"  - {r['name']}: {r['status']}")
        lines.append(f"\n{len(healthy)} healthy.")
        lines.append("\nWant me to create a case for the failures?")
        reply = "\n".join(lines)

    return {"reply": reply, "intent": "health_check", "results": results}


async def handle_general(message: str, history: list, context: str = "") -> dict:
    try:
        client = _client()
        messages = [{"role": "system", "content": PERSONA}]
        if context:
            messages.append({"role": "system", "content": f"Portal data:\n{context}"})
        messages.extend(history[-6:])
        messages.append({"role": "user", "content": message})
        resp = client.chat.completions.create(
            model=REASONING_MODEL,
            messages=messages,
            temperature=0.5,
            max_tokens=500,
        )
        return {"reply": resp.choices[0].message.content.strip(), "intent": "general"}
    except Exception as e:
        return {"reply": "Having trouble right now. Try again?", "intent": "general", "error": str(e)}


async def handle_read(message: str, history: list, context: str, intent: str) -> dict:
    """Generic read handler — injects context and answers."""
    client = _client()
    messages = [
        {"role": "system", "content": PERSONA + f"\n\nCurrent data:\n{context}\nToday: {datetime.now().strftime('%A, %B %d, %Y')}"},
    ]
    messages.extend(history[-4:])
    messages.append({"role": "user", "content": message})
    resp = client.chat.completions.create(
        model=ROUTER_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=600,
    )
    return {"reply": resp.choices[0].message.content.strip(), "intent": intent}


async def handle_write_intent(message: str, intent: str, history: list) -> dict:
    """Extract action details, ask for confirmation."""
    client = _client()
    messages = [
        {"role": "system", "content": f"Extract the action from this message. Return JSON: {{\"action\": \"...\", \"details\": \"human description\", \"params\": {{...}}}}. Intent: {intent}"},
    ]
    messages.extend(history[-4:])
    messages.append({"role": "user", "content": message})
    try:
        resp = client.chat.completions.create(
            model=REASONING_MODEL,
            messages=messages,
            temperature=0.0,
            max_tokens=300,
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1].replace("json", "").strip()
        action_data = json.loads(raw)
        details = action_data.get("details", "perform an action")
        return {
            "reply": f"I'd like to {details}. Should I go ahead?",
            "intent": intent,
            "action": "confirm_needed",
            "pending_action": action_data,
        }
    except Exception:
        return {"reply": "I want to help, but I'm not sure I understood. Can you be more specific?", "intent": intent}


async def handle_crowdsource(message: str, history: list) -> dict:
    """Trigger the 4-model crowdsource and analyze results."""
    # Extract the prompt to benchmark
    client = _client()
    extract = client.chat.completions.create(
        model=ROUTER_MODEL,
        messages=[
            {"role": "system", "content": "Extract the prompt the user wants to benchmark. Return ONLY the prompt text, nothing else. If unclear, return the full message."},
            {"role": "user", "content": message},
        ],
        temperature=0.0,
        max_tokens=500,
    )
    prompt = extract.choices[0].message.content.strip()

    return {
        "reply": f"I'll run this across all 4 models:\n\n\"{prompt[:100]}{'...' if len(prompt) > 100 else ''}\"\n\nUse the Crowdsource tab to see the full comparison. Want me to open it?",
        "intent": "crowdsource",
        "action": "open_crowdsource",
        "prompt": prompt,
    }


async def handle_report(message: str, portal_data: dict) -> dict:
    """Draft a weekly ops report from all portal data."""
    tasks = portal_data.get("tasks", [])
    cases = portal_data.get("cases", [])
    leads = portal_data.get("leads", [])
    time_log = portal_data.get("time_log", {})

    completed = [t for t in tasks if t.get("status") == "completed"]
    in_progress = [t for t in tasks if t.get("status") == "in_progress"]
    open_cases = [c for c in cases if c.get("status") not in ("closed",)]
    entries = time_log.get("entries", [])
    total_hours = sum(e.get("duration_seconds", 0) for e in entries) / 3600

    context = f"""Generate a professional weekly operations report for Peter.

Data:
- Tasks: {len(completed)} completed, {len(in_progress)} in progress, {len(tasks)} total
- Completed tasks: {', '.join(t['title'] for t in completed[:5])}
- In-progress: {', '.join(t['title'] for t in in_progress[:5])}
- Cases: {len(open_cases)} open, {len(cases)} total
- Pipeline: {len(leads)} leads
- Time logged: {total_hours:.1f} hours across {len(entries)} entries
- Date: {datetime.now().strftime('%B %d, %Y')}

Format as a clean report with sections: Summary, Tasks, Cases, Pipeline, Time, Next Week Priorities."""

    client = _client()
    resp = client.chat.completions.create(
        model=REASONING_MODEL,
        messages=[
            {"role": "system", "content": PERSONA},
            {"role": "user", "content": context},
        ],
        temperature=0.3,
        max_tokens=1500,
    )
    report = resp.choices[0].message.content.strip()
    return {
        "reply": f"Here's your draft weekly report:\n\n{report}\n\nWant me to email this to Peter?",
        "intent": "report_generate",
        "action": "confirm_email_report",
        "report": report,
    }


async def handle_greeting(time_log: dict, tasks: list, cases: list) -> dict:
    hour = datetime.now().hour
    if hour < 12:
        greet = "Good morning, Willis!"
    elif hour < 17:
        greet = "Good afternoon, Willis!"
    else:
        greet = "Good evening, Willis!"

    # Quick status
    active_timer = time_log.get("active")
    in_progress = [t for t in tasks if t.get("status") == "in_progress"]
    open_cases = [c for c in cases if c.get("status") not in ("closed",)]

    status = []
    if active_timer:
        status.append(f"Timer running on: {active_timer.get('task_title', '?')}")
    status.append(f"{len(in_progress)} tasks in progress, {len(open_cases)} open cases")

    return {
        "reply": f"{greet}\n\n{chr(10).join(status)}\n\nWhat do you want to tackle?",
        "intent": "greeting",
    }


# ---------------------------------------------------------------------------
# Main Chat Handler
# ---------------------------------------------------------------------------
async def chat(message: str, session_id: str, portal_data: dict) -> dict:
    history = get_history(session_id)
    intent = await route_intent(message)

    if intent == "greeting":
        result = await handle_greeting(
            portal_data.get("time_log", {}),
            portal_data.get("tasks", []),
            portal_data.get("cases", []),
        )

    elif intent == "health_check":
        result = await handle_health_check()

    elif intent == "task_read":
        result = await handle_read(message, history, build_task_context(portal_data.get("tasks", [])), intent)

    elif intent == "task_write":
        result = await handle_write_intent(message, intent, history)

    elif intent in ("timer_start", "timer_stop"):
        time_log = portal_data.get("time_log", {})
        ctx = build_time_context(time_log) + "\n" + build_task_context(portal_data.get("tasks", []))
        result = await handle_write_intent(message, intent, history)

    elif intent == "case_read":
        result = await handle_read(message, history, build_case_context(portal_data.get("cases", [])), intent)

    elif intent == "case_write":
        result = await handle_write_intent(message, intent, history)

    elif intent == "pipeline_read":
        result = await handle_read(message, history, build_pipeline_context(portal_data.get("leads", [])), intent)

    elif intent == "pipeline_write":
        result = await handle_write_intent(message, intent, history)

    elif intent == "crowdsource":
        result = await handle_crowdsource(message, history)

    elif intent == "report_generate":
        result = await handle_report(message, portal_data)

    elif intent == "email_peter":
        result = await handle_write_intent(message, "email_peter", history)

    elif intent == "proofread":
        result = {
            "reply": "Paste your text in the Prof Read tab and I'll proofread it. Want me to open Prof Read?",
            "intent": "proofread",
            "action": "switch_tab",
            "tab": "proofread",
        }

    else:
        all_context = []
        tasks = portal_data.get("tasks", [])
        cases = portal_data.get("cases", [])
        if tasks:
            ip = [t for t in tasks if t.get("status") == "in_progress"]
            all_context.append(f"Tasks: {len(ip)} in progress / {len(tasks)} total")
        if cases:
            oc = [c for c in cases if c.get("status") not in ("closed",)]
            all_context.append(f"Cases: {len(oc)} open")
        result = await handle_general(message, history, "\n".join(all_context))

    save_turn(session_id, message, result.get("reply", ""))
    return result
