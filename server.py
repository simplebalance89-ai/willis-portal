"""
Willis Portal — Operations Scout Hub
FastAPI backend with Azure OpenAI integration, Proton email, task management.
"""

import os
import json
import asyncio
import smtplib
import time
import uuid
import shutil
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AzureOpenAI

from agent import chat as agent_chat

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TASKS_FILE = os.path.join(BASE_DIR, "tasks_state.json")
CASES_FILE = os.path.join(BASE_DIR, "cases_state.json")
CHAT_FILE = os.path.join(BASE_DIR, "chat_messages.json")
TIME_FILE = os.path.join(BASE_DIR, "time_log.json")
LEADS_FILE = os.path.join(BASE_DIR, "leads_state.json")
DROPS_DIR = os.path.join(BASE_DIR, "drops")

# Azure OpenAI config
AZURE_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "https://pwgcerp-9302-resource.openai.azure.com/")
AZURE_KEY = os.getenv("AZURE_OPENAI_KEY", "")
AZURE_API_VERSION = os.getenv("AZURE_API_VERSION", "2024-12-01-preview")

# Proton Bridge SMTP
SMTP_HOST = os.getenv("SMTP_HOST", "127.0.0.1")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1026"))
SMTP_USER = os.getenv("SMTP_USER", "dkgianelli@pm.me")
SMTP_PASS = os.getenv("SMTP_PASS", "")
PETER_EMAIL = os.getenv("PETER_EMAIL", "dkgianelli@proton.me")

# Crowdsource models (Azure deployments)
CROWDSOURCE_MODELS = [
    {"name": "GPT-4.1", "deployment": "gpt-4.1"},
    {"name": "GPT-4.1 Mini", "deployment": "gpt-4.1-mini"},
    {"name": "Grok 4.1 Fast", "deployment": "grok-4-1-fast-reasoning"},
    {"name": "DeepSeek V3.2", "deployment": "DeepSeek-V3.2"},
]

# Default tasks from Willis's task list
DEFAULT_TASKS = [
    {"id": 1, "title": "Edge Crew Daily Score Check", "priority": "HIGHEST", "status": "not_started", "recurring": True, "time": "15-20 min/day", "notes": ""},
    {"id": 2, "title": "Edge Crew Full QA Pass", "priority": "HIGH", "status": "not_started", "recurring": False, "time": "2-3 hours", "notes": ""},
    {"id": 3, "title": "AI Bias Testing — Grading Blind Spots", "priority": "HIGH", "status": "not_started", "recurring": False, "time": "2-3 hours", "notes": ""},
    {"id": 4, "title": "Belt Power Research", "priority": "HIGH", "status": "not_started", "recurring": False, "time": "1-2 hours", "notes": ""},
    {"id": 5, "title": "Odds & Prediction Market Source Audit", "priority": "MEDIUM", "status": "not_started", "recurring": False, "time": "2 hours", "notes": ""},
    {"id": 6, "title": "Model Comparison — Kimi vs DeepSeek", "priority": "MEDIUM", "status": "not_started", "recurring": False, "time": "2 hours", "notes": ""},
    {"id": 7, "title": "Competitor Analysis — Sports Analytics Tools", "priority": "MEDIUM", "status": "not_started", "recurring": False, "time": "2-3 hours", "notes": ""},
    {"id": 8, "title": "API Validation — Live Data Feeds", "priority": "MEDIUM", "status": "not_started", "recurring": False, "time": "1-2 hours", "notes": ""},
    {"id": 9, "title": "Training Course Audit", "priority": "LOWER", "status": "not_started", "recurring": False, "time": "1-2 hours", "notes": ""},
    {"id": 10, "title": "Weekly Knowledge Drop", "priority": "ONGOING", "status": "not_started", "recurring": True, "time": "30 min/week", "notes": ""},
]


# ── JSON file helpers ─────────────────────────────────────────────────────────

def _load_json(path, default=None):
    if default is None:
        default = []
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return default


def _save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def load_tasks():
    return _load_json(TASKS_FILE, DEFAULT_TASKS.copy())


def save_tasks(tasks):
    _save_json(TASKS_FILE, tasks)


def load_cases():
    return _load_json(CASES_FILE, [])


def save_cases(cases):
    _save_json(CASES_FILE, cases)


def load_chat():
    return _load_json(CHAT_FILE, [])


def save_chat(messages):
    _save_json(CHAT_FILE, messages)


def load_time_log():
    return _load_json(TIME_FILE, {"active": None, "entries": []})


def save_time_log(data):
    _save_json(TIME_FILE, data)


def load_leads():
    return _load_json(LEADS_FILE, [])


def save_leads(leads):
    _save_json(LEADS_FILE, leads)


# Azure client
def get_azure_client():
    return AzureOpenAI(
        azure_endpoint=AZURE_ENDPOINT,
        api_key=AZURE_KEY,
        api_version=AZURE_API_VERSION,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.path.exists(TASKS_FILE):
        save_tasks(DEFAULT_TASKS)
    os.makedirs(DROPS_DIR, exist_ok=True)
    print(f"Willis Portal started — {datetime.now().isoformat()}")
    yield


app = FastAPI(title="Willis Portal", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store"
    return response


# ── Models ───────────────────────────────────────────────────────────────────

class CrowdsourceRequest(BaseModel):
    prompt: str
    system_prompt: str = "You are a helpful AI assistant. Be concise and accurate."

class ProofreadRequest(BaseModel):
    text: str
    style: str = "professional"

class EmailRequest(BaseModel):
    subject: str
    body: str
    category: str = "general"

class TaskUpdate(BaseModel):
    status: str
    notes: str = ""

class CaseCreate(BaseModel):
    title: str
    description: str
    priority: str = "medium"
    category: str = "general"

class ChatMessage(BaseModel):
    username: str
    message: str

class LeadCreate(BaseModel):
    company: str
    contact: str
    notes: str = ""
    value: float = 0.0
    stage: str = "prospect"

class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact: Optional[str] = None
    notes: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/health")
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "portal": "Willis Operations Hub",
        "timestamp": datetime.now().isoformat(),
        "azure_configured": bool(AZURE_KEY),
        "smtp_configured": bool(SMTP_PASS),
    }


# ── Crowdsource ──────────────────────────────────────────────────────────────

@app.post("/api/crowdsource")
async def crowdsource(req: CrowdsourceRequest):
    if not AZURE_KEY:
        raise HTTPException(500, "Azure OpenAI not configured")

    client = get_azure_client()
    results = []

    async def call_model(model_info):
        try:
            start = time.time()
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=model_info["deployment"],
                messages=[
                    {"role": "system", "content": req.system_prompt},
                    {"role": "user", "content": req.prompt},
                ],
                max_tokens=2000,
                temperature=0.7,
            )
            elapsed = round(time.time() - start, 2)
            content = response.choices[0].message.content
            tokens_in = response.usage.prompt_tokens if response.usage else 0
            tokens_out = response.usage.completion_tokens if response.usage else 0
            return {
                "model": model_info["name"],
                "response": content,
                "latency": elapsed,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "status": "success",
            }
        except Exception as e:
            return {
                "model": model_info["name"],
                "response": str(e),
                "latency": 0,
                "tokens_in": 0,
                "tokens_out": 0,
                "status": "error",
            }

    tasks = [call_model(m) for m in CROWDSOURCE_MODELS]
    results = await asyncio.gather(*tasks)

    return {"results": results, "prompt": req.prompt, "timestamp": datetime.now().isoformat()}


# ── Prof Read ────────────────────────────────────────────────────────────────

@app.post("/api/proofread")
async def proofread(req: ProofreadRequest):
    if not AZURE_KEY:
        raise HTTPException(500, "Azure OpenAI not configured")

    client = get_azure_client()
    system = f"""You are a professional proofreader and editor. Style: {req.style}.
Review the text for:
1. Grammar and spelling errors
2. Clarity and readability
3. Tone consistency
4. Structural improvements

Return your response in this format:
## Corrected Text
[The full corrected text]

## Changes Made
[Numbered list of changes with brief explanations]

## Overall Assessment
[1-2 sentence summary of the text quality and key improvements]"""

    try:
        start = time.time()
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": req.text},
            ],
            max_tokens=3000,
            temperature=0.3,
        )
        elapsed = round(time.time() - start, 2)
        return {
            "result": response.choices[0].message.content,
            "latency": elapsed,
            "tokens_in": response.usage.prompt_tokens if response.usage else 0,
            "tokens_out": response.usage.completion_tokens if response.usage else 0,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Cases (NetSuite Case Center) ─────────────────────────────────────────────

@app.get("/api/cases")
async def get_cases():
    return {"cases": load_cases()}


@app.post("/api/cases")
async def create_case(case: CaseCreate):
    cases = load_cases()
    new_case = {
        "id": len(cases) + 1,
        "title": case.title,
        "description": case.description,
        "priority": case.priority,
        "category": case.category,
        "status": "new",
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
        "notes": [],
    }
    cases.append(new_case)
    save_cases(cases)
    return new_case


@app.put("/api/cases/{case_id}")
async def update_case(case_id: int, status: str = None, note: str = None):
    cases = load_cases()
    for c in cases:
        if c["id"] == case_id:
            if status:
                c["status"] = status
            if note:
                c["notes"].append({"text": note, "time": datetime.now().isoformat()})
            c["updated"] = datetime.now().isoformat()
            save_cases(cases)
            return c
    raise HTTPException(404, "Case not found")


@app.post("/api/cases/{case_id}/send")
async def send_case_to_peter(case_id: int):
    """Email a case summary to Peter via Proton Bridge."""
    cases = load_cases()
    case = next((c for c in cases if c["id"] == case_id), None)
    if not case:
        raise HTTPException(404, "Case not found")

    if not SMTP_PASS:
        raise HTTPException(500, "SMTP not configured")

    subject = f"[Willis Case #{case['id']}] {case['title']}"
    body = f"""Case #{case['id']}: {case['title']}
Priority: {case['priority'].upper()}
Category: {case['category']}
Status: {case['status']}
Created: {case['created']}

Description:
{case['description']}

Notes:
"""
    for n in case.get("notes", []):
        body += f"- [{n['time']}] {n['text']}\n"

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_USER
        msg["To"] = PETER_EMAIL
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

        return {"status": "sent", "to": PETER_EMAIL, "subject": subject}
    except Exception as e:
        raise HTTPException(500, f"Email failed: {str(e)}")


# ── Tasks ────────────────────────────────────────────────────────────────────

@app.get("/api/tasks")
async def get_tasks():
    return {"tasks": load_tasks()}


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, update: TaskUpdate):
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t["status"] = update.status
            if update.notes:
                t["notes"] = update.notes
            save_tasks(tasks)
            return t
    raise HTTPException(404, "Task not found")


# ── Email Peter ──────────────────────────────────────────────────────────────

@app.post("/api/email-peter")
async def email_peter(req: EmailRequest):
    if not SMTP_PASS:
        raise HTTPException(500, "SMTP not configured — set SMTP_PASS env var")

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_USER
        msg["To"] = PETER_EMAIL
        msg["Subject"] = f"[Willis Portal] {req.subject}"
        msg.attach(MIMEText(req.body, "plain"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

        return {"status": "sent", "to": PETER_EMAIL}
    except Exception as e:
        raise HTTPException(500, f"Email failed: {str(e)}")


# ── Team Chat ────────────────────────────────────────────────────────────────

@app.get("/api/chat/messages")
async def get_chat_messages():
    return {"messages": load_chat()}


@app.post("/api/chat/send")
async def send_chat_message(msg: ChatMessage):
    messages = load_chat()
    new_msg = {
        "id": str(uuid.uuid4())[:8],
        "username": msg.username,
        "message": msg.message,
        "timestamp": datetime.now().isoformat(),
    }
    messages.append(new_msg)
    # Keep last 200 messages
    if len(messages) > 200:
        messages = messages[-200:]
    save_chat(messages)
    return new_msg


# ── File Drop ────────────────────────────────────────────────────────────────

@app.get("/api/files/list")
async def list_files():
    os.makedirs(DROPS_DIR, exist_ok=True)
    files = []
    for fname in os.listdir(DROPS_DIR):
        fpath = os.path.join(DROPS_DIR, fname)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append({
                "name": fname,
                "size": stat.st_size,
                "uploaded": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    files.sort(key=lambda x: x["uploaded"], reverse=True)
    return {"files": files}


@app.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...)):
    os.makedirs(DROPS_DIR, exist_ok=True)
    # Avoid overwriting: prepend timestamp if file exists
    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    dest = os.path.join(DROPS_DIR, safe_name)
    if os.path.exists(dest):
        base, ext = os.path.splitext(safe_name)
        safe_name = f"{base}_{int(time.time())}{ext}"
        dest = os.path.join(DROPS_DIR, safe_name)

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    return {
        "name": safe_name,
        "size": len(content),
        "uploaded": datetime.now().isoformat(),
    }


@app.get("/api/files/download/{filename}")
async def download_file(filename: str):
    fpath = os.path.join(DROPS_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, "File not found")
    return FileResponse(fpath, filename=filename)


# ── Time Tracking ────────────────────────────────────────────────────────────

@app.get("/api/time/log")
async def get_time_log():
    return load_time_log()


@app.post("/api/time/start")
async def start_timer(task_id: int = Query(...), task_title: str = Query("")):
    data = load_time_log()
    if data.get("active"):
        raise HTTPException(400, "Timer already running. Stop it first.")
    data["active"] = {
        "task_id": task_id,
        "task_title": task_title,
        "started": datetime.now().isoformat(),
    }
    save_time_log(data)
    return data["active"]


@app.post("/api/time/stop")
async def stop_timer():
    data = load_time_log()
    if not data.get("active"):
        raise HTTPException(400, "No timer running.")
    active = data["active"]
    started = datetime.fromisoformat(active["started"])
    ended = datetime.now()
    duration_seconds = int((ended - started).total_seconds())
    entry = {
        "id": str(uuid.uuid4())[:8],
        "task_id": active["task_id"],
        "task_title": active["task_title"],
        "started": active["started"],
        "ended": ended.isoformat(),
        "duration_seconds": duration_seconds,
    }
    data["entries"].append(entry)
    data["active"] = None
    save_time_log(data)
    return entry


# ── Sales Pipeline (Leads) ───────────────────────────────────────────────────

@app.get("/api/leads")
async def get_leads():
    return {"leads": load_leads()}


@app.post("/api/leads")
async def create_lead(lead: LeadCreate):
    leads = load_leads()
    new_lead = {
        "id": str(uuid.uuid4())[:8],
        "company": lead.company,
        "contact": lead.contact,
        "notes": lead.notes,
        "value": lead.value,
        "stage": lead.stage,
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
    }
    leads.append(new_lead)
    save_leads(leads)
    return new_lead


@app.put("/api/leads/{lead_id}")
async def update_lead(lead_id: str, update: LeadUpdate):
    leads = load_leads()
    for lead in leads:
        if lead["id"] == lead_id:
            if update.company is not None:
                lead["company"] = update.company
            if update.contact is not None:
                lead["contact"] = update.contact
            if update.notes is not None:
                lead["notes"] = update.notes
            if update.value is not None:
                lead["value"] = update.value
            if update.stage is not None:
                lead["stage"] = update.stage
            lead["updated"] = datetime.now().isoformat()
            save_leads(leads)
            return lead
    raise HTTPException(404, "Lead not found")


# ── Scout Agent ──────────────────────────────────────────────────────────────

WHISPER_ENDPOINT = os.getenv("AZURE_WHISPER_ENDPOINT", "https://enpro-whisper.openai.azure.com/")
WHISPER_KEY = os.getenv("AZURE_WHISPER_KEY", "")
WHISPER_DEPLOYMENT = os.getenv("AZURE_WHISPER_DEPLOYMENT", "whisper")
WHISPER_API_VERSION = os.getenv("AZURE_WHISPER_API_VERSION", "2024-12-01-preview")


class AgentChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@app.post("/agent/chat")
async def agent_chat_endpoint(req: AgentChatRequest):
    """Scout agent chat — Willis talks, Scout handles everything."""
    portal_data = {
        "tasks": load_tasks(),
        "cases": load_cases(),
        "leads": load_leads(),
        "time_log": load_time_log(),
    }
    result = await agent_chat(req.message, req.session_id, portal_data)
    return result


@app.post("/agent/stt")
async def agent_stt(file: UploadFile = File(...)):
    """Speech-to-text for Scout agent via Azure Whisper."""
    whisper_key = WHISPER_KEY or AZURE_KEY
    if not whisper_key:
        return {"error": "Whisper not configured", "text": ""}

    audio_bytes = await file.read()
    if not audio_bytes:
        return {"error": "Empty audio", "text": ""}

    whisper_base = WHISPER_ENDPOINT or AZURE_ENDPOINT
    url = (
        f"{whisper_base.rstrip('/')}/openai/deployments/"
        f"{WHISPER_DEPLOYMENT}/audio/transcriptions"
        f"?api-version={WHISPER_API_VERSION}"
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={"api-key": whisper_key},
                files={
                    "file": (file.filename or "audio.webm", audio_bytes, file.content_type or "audio/webm"),
                    "response_format": (None, "json"),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {"text": data.get("text", "").strip()}
    except Exception as e:
        return {"error": str(e), "text": ""}


# Static files (mount last)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
