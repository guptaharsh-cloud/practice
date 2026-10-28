import csv, io, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import ValidationError
from .models import Transaction, Statement, AuditRequest, ApprovalRequest
from .sample_data import sample_transactions
from .tools import detect_stealth_hikes, calculate_annual_leakage, generate_cancellation_script
from .ai_service import extract_statement, choose_next_step

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app = FastAPI(title="Finwise Finance Intelligence Agent", version="1.0.0", description="Educational finance dashboard and safe, simulated agent audit.")
origins = [x.strip() for x in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])
SESSIONS: dict[str, dict] = {}
ALLOWLIST = ["detect_stealth_hikes", "calculate_annual_leakage", "generate_cancellation_script", "finish"]

def now_iso(): return datetime.now(timezone.utc).isoformat()
def log_event(session: dict, typ: str, message: str, details: dict | None = None):
    session["audit_log"].append({"time": now_iso(), "type": typ, "message": message, "details": details or {}})
def summary_for(findings):
    if not findings: return "No subscription price hikes above 10% were found in the provided data."
    return " ".join(f"{f['merchant']} increased from ${f['old_amount']:.2f} to ${f['new_amount']:.2f} (+{f['change_pct']:.1f}%). Current annualized cost: ${f['new_amount']*12:.2f}." for f in findings)
def jsonable_tx(tx): return tx.model_dump(mode="json")

@app.get("/api/health")
def health():
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return {"status": "ok", "gemini_configured": bool(key and key != "replace_me")}

@app.get("/api/sample")
def sample():
    return {"transactions": [jsonable_tx(t) for t in sample_transactions()], "currency": "USD", "source": "fictional workshop sample"}

@app.post("/api/extract")
async def extract(text: str | None = Form(default=None), file: UploadFile | None = File(default=None)):
    clean_text = (text or "").strip()
    if not clean_text and file is None:
        raise HTTPException(400, "Paste transaction text or choose a file.")
    file_bytes = None; mime = None
    if file is not None:
        file_bytes = await file.read()
        if not file_bytes: raise HTTPException(400, "The selected file is empty.")
        if len(file_bytes) > 12 * 1024 * 1024: raise HTTPException(413, "Please use a file smaller than 12 MB for this classroom demo.")
        mime = file.content_type or "application/octet-stream"
        if (file.filename or "").lower().endswith(".csv") or mime == "text/csv":
            try:
                decoded = file_bytes.decode("utf-8-sig")
                rows = list(csv.DictReader(io.StringIO(decoded)))
                if not rows: raise ValueError("CSV has a header but no rows")
                clean_text = "CSV rows (extract/normalize only; do not invent values):\n" + repr(rows)
                file_bytes = None
            except (UnicodeDecodeError, csv.Error, ValueError) as e:
                raise HTTPException(400, f"Could not read CSV: {e}")
    if len(clean_text) > 100_000: clean_text = clean_text[:100_000]
    try:
        statement = extract_statement(text=clean_text or None, file_bytes=file_bytes, mime_type=mime)
    except RuntimeError as e:
        msg = str(e)
        code = 503 if "not configured" in msg.lower() or "stub" in msg.lower() else 502
        raise HTTPException(code, msg)
    except Exception as e:
        raise HTTPException(502, f"Gemini extraction failed: {e}")
    valid, errors = [], []
    raw_rows = statement.transactions if isinstance(statement, Statement) else statement.get("transactions", [])
    notes = statement.notes if isinstance(statement, Statement) else statement.get("notes", [])
    for i, row in enumerate(raw_rows):
        try: valid.append(Transaction.model_validate(row))
        except (ValidationError, ValueError, TypeError) as e: errors.append({"row": i + 1, "error": str(e)})
    return {"transactions": [jsonable_tx(t) for t in valid], "notes": notes, "validation_errors": errors, "count": len(valid)}

@app.post("/api/audits")
def create_audit(request: AuditRequest):
    if not request.transactions: raise HTTPException(400, "Add transactions before starting an audit.")
    sid = str(uuid.uuid4())
    session = {"session_id": sid, "status": "analyzing", "goal": request.goal, "findings": [], "pending_action": None, "audit_log": [], "summary": "", "steps": 0}
    SESSIONS[sid] = session
    log_event(session, "started", "Audit started.", {"transaction_count": len(request.transactions)})
    tool_results: list[dict] = []
    try:
        for _ in range(6):
            session["steps"] += 1
            decision = choose_next_step(request.goal, session["findings"], tool_results, ALLOWLIST)
            # Treat planner output as untrusted, including when a future LLM is connected.
            tool = decision.tool_name if hasattr(decision, "tool_name") else decision.get("tool_name")
            args = decision.arguments if hasattr(decision, "arguments") else decision.get("arguments", {})
            message = decision.message if hasattr(decision, "message") else decision.get("message", "")
            if tool not in ALLOWLIST: raise ValueError("Tool is not allowed")
            log_event(session, "plan", message or f"Selected {tool}.", {"tool": tool, "arguments": args})
            if tool == "finish": break
            if tool == "detect_stealth_hikes":
                result = detect_stealth_hikes(request.transactions)
                session["findings"] = result
            elif tool == "calculate_annual_leakage":
                merchant = args.get("merchant"); amount = args.get("monthly_amount")
                match = next((f for f in session["findings"] if f["merchant"] == merchant and amount is not None and abs(f["new_amount"] - float(amount)) < 0.001), None)
                if match is None and session["findings"]: match = session["findings"][0]
                if match is None: result = {"skipped": "No price hike found."}
                else: result = calculate_annual_leakage(match["merchant"], match["new_amount"])
            elif tool == "generate_cancellation_script":
                merchant = args.get("merchant")
                match = next((f for f in session["findings"] if f["merchant"] == merchant), None)
                if match is None and session["findings"]: match = session["findings"][0]
                if match is None: result = {"skipped": "No price hike found."}
                else:
                    draft_result = generate_cancellation_script(match["merchant"], match["old_amount"], match["new_amount"])
                    annual = calculate_annual_leakage(match["merchant"], match["new_amount"])["annual_cost"]
                    session["pending_action"] = {"type": "review_subscription_change", **match, "annual_cost": annual, "draft": draft_result["draft"], "sent": False}
                    result = draft_result
            tool_results.append({"tool": tool, "result": result})
            log_event(session, "tool", f"Executed {tool}.", result)
            if tool == "generate_cancellation_script" and session["pending_action"]:
                session["status"] = "awaiting_approval"; session["summary"] = summary_for(session["findings"])
                log_event(session, "approval_required", "Draft ready. Waiting for human approval; nothing has been sent.")
                return session
        session["status"] = "done"; session["summary"] = summary_for(session["findings"])
        log_event(session, "completed", "Audit completed.", {"steps": session["steps"]})
    except Exception as e:
        session["status"] = "failed"; session["summary"] = f"Audit stopped safely: {e}"
        log_event(session, "error", str(e))
    return session

@app.get("/api/audits/{session_id}")
def get_audit(session_id: str):
    session = SESSIONS.get(session_id)
    if session is None: raise HTTPException(404, "Audit session not found.")
    return session

@app.post("/api/audits/{session_id}/approval")
def approve_audit(session_id: str, request: ApprovalRequest):
    session = SESSIONS.get(session_id)
    if session is None: raise HTTPException(404, "Audit session not found. Start a new audit.")
    if session["status"] != "awaiting_approval" or not session.get("pending_action"):
        raise HTTPException(409, "This audit has no pending approval.")
    action = session["pending_action"]
    if request.decision == "approve":
        session["status"] = "executing"; action["simulated_execution"] = "Approved and recorded locally; no external message was sent."; action["approved"] = True
        log_event(session, "approved_simulation", "Approval recorded locally; no message was sent.", {"merchant": action["merchant"], "reason": request.reason})
        session["status"] = "done"; session["summary"] += " Demo action approved and simulated; no message was sent."
    else:
        action["approved"] = False
        log_event(session, "rejected", "Human rejected the proposed action. Nothing was sent.", {"merchant": action["merchant"], "reason": request.reason})
        session["status"] = "done"; session["summary"] += " Proposed action rejected; nothing was sent."
    action["sent"] = False
    return session
