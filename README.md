# Finwise — Finance Intelligence Agent

A classroom-friendly full-stack React + FastAPI demonstration of GenAI transaction extraction and a bounded, auditable finance agent. The app ships with fictional USD transactions and a deterministic offline audit flow. It is an educational demo, not financial advice.

## Safety and limitations
- Use fictional or redacted data only. **Do not upload real bank statements.**
- Audit sessions exist only in backend memory and disappear when the server restarts. Uploaded files are not stored.
- No email, merchant/bank contact, payment API, or money movement is implemented. Approval is a local simulation and `sent` stays `false`.
- Gemini integration in `backend/app/ai_service.py` is intentionally a stub. The extraction endpoint returns a clear configuration/stub error until the developer hand-codes the Gemini call. The agent uses a deterministic offline planner.
- USD only; no authentication, database, deduplication, or multi-user support.

## Prerequisites
- Python 3.11+ (3.12 recommended)
- Node.js 20+

## Run the backend (Windows PowerShell)
```powershell
cd finance-intelligence-agentackend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Windows Command Prompt activation: `.venv\Scripts\activate.bat`.

## Run the backend (macOS/Linux)
```bash
cd finance-intelligence-agent/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Run the frontend
Open a second terminal:
```bash
cd finance-intelligence-agent/frontend
npm install
npm run dev
```
Open http://localhost:5173. The frontend defaults to `http://localhost:8000`; set `VITE_API_URL` if your backend runs elsewhere.

## Six-step demo flow
1. Open Finwise; the 14 fictional transactions load automatically.
2. Review the four metrics, monthly chart, category totals and transaction table.
3. In the import panel, select **Use example** and try **Extract transactions**. Without the manually implemented Gemini integration, the app will explain why extraction is unavailable; the sample dashboard remains usable.
4. Scroll to **Run a finance audit** and click the button.
5. Review the StreamBox Premium price increase from $37.69 to $49.00, the $588.00 annualized cost, the draft and the agent trace.
6. Click **Approve simulation** or **Reject**. The app records the choice locally; no message is sent.

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Backend and Gemini-key status |
| GET | `/api/sample` | 14 fictional transactions |
| POST | `/api/extract` | Multipart text/file extraction (AI stub) |
| POST | `/api/audits` | Start a bounded audit |
| GET | `/api/audits/{session_id}` | Read an audit session and trace |
| POST | `/api/audits/{session_id}/approval` | Approve/reject local simulation |

## Tests and build
Backend tests:
```bash
cd backend
pytest
```
Frontend production build:
```bash
cd frontend
npm install
npm run build
```

## Configuration
`backend/.env`:
```dotenv
GEMINI_API_KEY=replace_me
GEMINI_MODEL=gemini-2.5-flash
FRONTEND_ORIGIN=http://localhost:5173
```
The key is never exposed to the frontend. To implement the optional Gemini integration, hand-code calls only in `backend/app/ai_service.py`, preserving its public interface and validation/safety boundaries. Do not remove the deterministic fallback.

## Troubleshooting
- **Frontend cannot connect:** make sure Uvicorn is running on port 8000; check browser console and `VITE_API_URL`.
- **Gemini not configured / extraction unavailable:** expected in this generated build. `ai_service.py` deliberately contains manual TODO markers; use sample data and the offline audit, or implement the Gemini calls in that file.
- **Model/quota errors:** inspect the backend terminal; no automatic AI retries are performed.
- **Port in use:** run Uvicorn on another port and set `VITE_API_URL` accordingly; Vite port can be changed in `vite.config.js`.
- **CORS error:** set `FRONTEND_ORIGIN` to the exact frontend origin and restart the backend.
