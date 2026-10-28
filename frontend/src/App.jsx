import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, BarChart3, Bot, Check, ChevronDown, CircleHelp, FileUp, LayoutDashboard, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Wallet, X, Zap, AlertTriangle, CheckCircle2, Clock3, CircleDollarSign, ListFilter, Menu, Upload, FileText, Search, RotateCcw, BadgeCheck } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const DEFAULT_GOAL = 'Audit my transactions for subscription traps and silent price hikes.';
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0));
const monthLabel = key => new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const shortDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date unclear';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [source, setSource] = useState('Sample data');
  const [health, setHealth] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({});
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [notes, setNotes] = useState([]);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [audit, setAudit] = useState(null);
  const [reason, setReason] = useState('');
  const [activeNav, setActiveNav] = useState('Overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    return data;
  };
  const setLoading = (key, value) => setBusy(prev => ({ ...prev, [key]: value }));
  const loadHealth = useCallback(async () => { try { const d = await request('/api/health'); setHealth(!!d.gemini_configured); } catch { setHealth(false); } }, []);
  const loadSample = useCallback(async (quiet = false) => {
    setLoading('sample', true); setError('');
    try { const d = await request('/api/sample'); setTransactions(d.transactions || []); setSource('Sample data'); setNotes([]); setAudit(null); if (!quiet) setRawText(''); }
    catch (e) { setError(`Could not load sample data. Is the backend running? ${e.message}`); }
    finally { setLoading('sample', false); }
  }, []);
  useEffect(() => { loadSample(true); loadHealth(); }, [loadSample, loadHealth]);

  const positive = transactions.filter(t => Number(t.amount) > 0);
  const metrics = useMemo(() => ({ count: transactions.length, merchants: new Set(transactions.map(t => t.merchant)).size, outflow: positive.reduce((s,t) => s + Number(t.amount), 0), subscriptions: transactions.filter(t => t.category === 'Subscriptions' && Number(t.amount) > 0).reduce((s,t) => s + Number(t.amount), 0) }), [transactions]);
  const monthly = useMemo(() => { const sums = {}; positive.forEach(t => { if (t.date) { const k = t.date.slice(0,7); sums[k] = (sums[k] || 0) + Number(t.amount); } }); return Object.entries(sums).sort(([a],[b]) => a.localeCompare(b)).map(([month, amount]) => ({ month: monthLabel(month), amount: Number(amount.toFixed(2)) })); }, [transactions]);
  const categories = useMemo(() => { const sums = {}; positive.forEach(t => { sums[t.category] = (sums[t.category] || 0) + Number(t.amount); }); return Object.entries(sums).sort((a,b) => b[1]-a[1]).slice(0,6); }, [transactions]);
  const sorted = useMemo(() => [...transactions].sort((a,b) => { if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1; return b.date.localeCompare(a.date); }).filter(t => `${t.merchant} ${t.category} ${t.raw_line || ''}`.toLowerCase().includes(query.toLowerCase())), [transactions, query]);
  const findings = audit?.findings || [];

  const doExtract = async () => {
    if (!file && !rawText.trim()) { setError('Paste transaction text or choose a file.'); return; }
    setLoading('extract', true); setError(''); setNotes([]); setAudit(null);
    try { const form = new FormData(); if (rawText.trim()) form.append('text', rawText.trim()); if (file) form.append('file', file); const d = await request('/api/extract', { method: 'POST', body: form }); setNotes(d.notes || []); if (d.validation_errors?.length) setError(`${d.validation_errors.length} row(s) were skipped because they did not pass validation.`); if (!d.transactions?.length) { setError('No valid transactions were extracted. Check the input and try again.'); return; } setTransactions(d.transactions); setSource('Your input'); setFile(null); }
    catch (e) { setError(e.message); }
    finally { setLoading('extract', false); }
  };
  const runAudit = async () => {
    if (!transactions.length) return; setLoading('audit', true); setError(''); setAudit(null);
    try { const d = await request('/api/audits', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transactions, goal }) }); setAudit(d); }
    catch(e) { setError(e.message); }
    finally { setLoading('audit', false); }
  };
  const decide = async decision => {
    if (!audit) return; setLoading('approval', true); setError('');
    try { const d = await request(`/api/audits/${audit.session_id}/approval`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ decision, reason: reason.trim() || null }) }); setAudit(d); }
    catch(e) { setError(e.message); }
    finally { setLoading('approval', false); }
  };
  const navTo = id => { setActiveNav(id); setMobileNav(false); const target = id === 'Overview' ? 'overview' : id === 'Transactions' ? 'transactions' : 'agent'; document.getElementById(target)?.scrollIntoView({ behavior:'smooth', block:'start' }); };
  const traceColor = type => ['tool','approved_simulation'].includes(type) ? 'green' : ['approval_required','rejected'].includes(type) ? 'amber' : type === 'error' ? 'red' : 'blue';
  const statusText = status => ({ analyzing:'Analyzing', awaiting_approval:'Awaiting approval', executing:'Executing simulation', done:'Completed', failed:'Failed' }[status] || 'Ready');

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={21}/></div><div><div className="brand-name">Finwise</div><div className="brand-caption">INTELLIGENCE AGENT</div></div><button className="mobile-close icon-btn" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav-list"><button className={`nav-item ${activeNav==='Overview'?'active':''}`} onClick={() => navTo('Overview')}><LayoutDashboard size={18}/>Overview</button><button className={`nav-item ${activeNav==='Transactions'?'active':''}`} onClick={() => navTo('Transactions')}><ListFilter size={18}/>Transactions<span className="nav-count">{transactions.length}</span></button><button className={`nav-item ${activeNav==='Agent audit'?'active':''}`} onClick={() => navTo('Agent audit')}><Bot size={18}/>Agent audit</button></nav>
      <div className="sidebar-spacer"/><div className="safety-card"><div className="safety-icon"><ShieldCheck size={18}/></div><strong>Demo-safe mode</strong><p>Sample data is fictional. Approval actions are simulated and never sent.</p><div className="version">WORKSHOP BUILD · v1.0.0</div></div>
      <div className="sidebar-foot"><span className="online-dot"/>Local workspace <span className="foot-version">v1.0.0</span></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-content" id="overview">
      <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="page-heading"><div className="eyebrow">PERSONAL FINANCE <span>/</span> OVERVIEW</div><h1>Finance overview</h1><p>Understand your spending. Let your agent investigate the details.</p></div><div className="top-actions"><div className="ai-status"><span className={`status-dot ${health?'connected':''}`}/><span>{health?'Gemini connected':'Demo mode available'}</span></div><button className="icon-btn refresh-btn" title="Reload sample data" onClick={() => loadSample(false)} disabled={busy.sample}><RefreshCw size={17} className={busy.sample?'spin':''}/></button><div className="avatar">N</div></div></header>
      {error && <div className="error-banner"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={17}/></button></div>}
      <section className="metric-grid">
        <Metric icon={<Wallet size={19}/>} tone="blue" label="Total transactions" value={metrics.count} sub={`${metrics.merchants} unique merchants`}/>
        <Metric icon={<CircleDollarSign size={19}/>} tone="violet" label="Total outflow" value={money(metrics.outflow)} sub="Across loaded transactions"/>
        <Metric icon={<Zap size={19}/>} tone="amber" label="Subscription charges" value={money(metrics.subscriptions)} sub="All visible periods combined"/>
        <Metric icon={<Activity size={19}/>} tone="green" label="Potential price hikes" value={audit ? findings.length : '—'} sub={audit ? (findings.length ? 'Detected in latest audit' : 'No hikes detected') : 'Run an agent audit'}/>
      </section>
      <section className="chart-grid">
        <div className="panel chart-panel"><div className="panel-head"><div><h2>Spending activity</h2><p>Monthly transaction outflow</p></div><span className="soft-pill"><span className="pill-dot"/>{source}</span></div>
          {monthly.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{top:12,right:8,left:0,bottom:0}}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d78e8" stopOpacity={0.22}/><stop offset="95%" stopColor="#6d78e8" stopOpacity={0.015}/></linearGradient></defs><CartesianGrid stroke="#edf0f6" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:'#8990a5',fontSize:11}} dy={8}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#8990a5',fontSize:11}} tickFormatter={v=>`$${v}`} width={46}/><Tooltip formatter={v=>[money(v),'Outflow']} contentStyle={{border:'1px solid #eaecf2',borderRadius:12,boxShadow:'0 8px 24px #26305a12'}}/><Area type="monotone" dataKey="amount" stroke="#6d78e8" strokeWidth={2.5} fill="url(#spendFill)" activeDot={{r:5,strokeWidth:0}}/></AreaChart></ResponsiveContainer></div> : <Empty icon={<BarChart3/>} text="Add dated transactions to see spending activity."/>}
        </div>
        <div className="panel category-panel"><div className="panel-head"><div><h2>Spending by category</h2><p>Positive charges only</p></div><span className="small-icon muted-icon"><BarChart3 size={17}/></span></div>
          {categories.length ? <div className="category-list">{categories.map(([name,amount],i)=><div className="category-row" key={name}><div className={`category-letter c${i}`}>{name.charAt(0)}</div><div className="category-detail"><div className="category-meta"><span>{name}</span><strong>{money(amount)}</strong></div><div className="bar-track"><div className={`bar-fill c${i}`} style={{width:`${Math.max(3,amount/Math.max(...categories.map(x=>x[1]))*100)}%`}}/></div></div></div>)}</div> : <Empty icon={<BarChart3/>} text="Category totals appear after transactions are loaded."/>}
        </div>
      </section>

      <section className="panel import-panel" id="import"><div className="section-kicker">DAY 1 · GENAI EXTRACTION</div><div className="section-title-row"><div><h2>Bring in financial data</h2><p>Turn raw statements into clean, validated transactions.</p></div><span className="step-tag">01 <span>Extract &amp; validate</span></span></div>
        <div className="import-options"><div className={`dropzone ${file?'has-file':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)setFile(f);}}><input id="file-input" type="file" accept="image/png,image/jpeg,.pdf,.csv,.txt,text/plain" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file ? <><div className="file-icon"><FileText size={23}/></div><strong className="file-name">{file.name}</strong><span>{(file.size/1024).toFixed(1)} KB</span><button className="text-btn" onClick={e=>{e.preventDefault();setFile(null);document.getElementById('file-input').value='';}}>Remove file</button></> : <><div className="upload-icon"><FileUp size={22}/></div><strong>Choose a receipt or statement</strong><span>PNG, JPG, PDF, CSV or TXT · max 12 MB</span><label className="browse-btn" htmlFor="file-input">Browse files</label><small>or drag and drop</small></>}</div>
        <div className="or-divider"><span>OR</span></div>
              <div className="paste-box">
               <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste bank statement or transaction rows here..."
                  rows={4}
                />
                <div className="paste-footer">
                  <span>Raw text is sent to Gemini</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRawText(
                        '2026-09-18 UPI/FOOD DELIVERY/8231 18.75\n2026-09-20 POS HPCL FUEL HYD 25.00'
                      )
                    }
                  >
                    Use example
                  </button>
                </div>
              </div>
            </div>
        <div className="import-bottom"><div className="validation-note"><ShieldCheck size={17}/><span>Structured output + Pydantic validation. Unclear fields should stay null, not guessed.</span></div><div className="import-buttons"><button className="btn btn-secondary" onClick={()=>loadSample(false)} disabled={busy.sample}>{busy.sample?<LoaderCircle className="spin" size={16}/>:<RotateCcw size={16}/>}Load sample data</button><button className="btn btn-primary" onClick={doExtract} disabled={busy.extract||(!file&&!rawText.trim())}>{busy.extract?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>}Extract transactions</button></div></div>
        {notes.length>0&&<div className="notes-box"><strong>Extraction notes</strong><ul>{notes.map((n,i)=><li key={i}>{n}</li>)}</ul></div>}
      </section>

      <section className="panel transactions-panel" id="transactions"><div className="section-title-row"><div><h2>Transactions</h2><p>Validated, typed records feeding your dashboard</p></div><span className="count-pill">{transactions.length} records</span></div><div className="table-toolbar"><div className="table-hint"><ShieldCheck size={15}/>Validated transaction records</div><label className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transactions"/></label></div>
        {sorted.length ? <div className="table-scroll"><table><thead><tr><th>MERCHANT</th><th>DATE</th><th>CATEGORY</th><th>RAW SOURCE</th><th className="amount-col">AMOUNT</th></tr></thead><tbody>{sorted.map((t,i)=><tr key={`${t.merchant}-${t.date}-${i}`}><td><div className="merchant-cell"><span className="merchant-avatar">{t.merchant?.charAt(0)?.toUpperCase()||'?'}</span><strong>{t.merchant}</strong></div></td><td className="date-cell">{shortDate(t.date)}</td><td><span className={`category-chip chip-${String(t.category).toLowerCase().replaceAll(' ','-')}`}>{t.category}</span></td><td><span className="raw-source">{t.raw_line || '—'}</span></td><td className={`amount-cell ${t.amount<0?'refund':''}`}><span className="amount-icon">{t.amount<0?<ArrowDownLeft size={14}/>:<ArrowUpRight size={14}/>}</span>{money(t.amount)}</td></tr>)}</tbody></table></div> : <Empty icon={<FileText/>} text="No transactions yet. Load sample data or extract a statement above."/>}
      </section>

      <section className="agent-section" id="agent"><div className="section-kicker">DAY 2 · AUTONOMOUS AGENT</div><div className="agent-heading"><div><h2>Run a finance audit</h2><p>The agent investigates with Python tools, then asks before any consequential action.</p></div><span className="agent-chip"><span className="online-dot"/>Bounded agent · max 6 steps</span></div>
        <div className="agent-grid"><div className="panel goal-panel"><div className="panel-title-icon"><div className="round-icon"><Bot size={19}/></div><div><h3>Your audit goal</h3><p>Tell the agent what to investigate</p></div></div><label className="field-label" htmlFor="audit-goal">AUDIT INSTRUCTIONS</label><textarea id="audit-goal" value={goal} onChange={e=>setGoal(e.target.value)} rows={5} placeholder="Describe what you want the agent to investigate..."/><div className="goal-safety"><ShieldCheck size={17}/><span>Read-only analysis runs automatically. Cancellation / dispute actions are drafts and require your approval. Nothing is sent.</span></div><button className="btn btn-primary run-btn" onClick={runAudit} disabled={!transactions.length||busy.audit}>{busy.audit?<><LoaderCircle className="spin" size={17}/>Running audit...</>:<><Sparkles size={17}/>Run agent audit</>}</button><div className="tool-foot"><span><Check size={13}/>Deterministic tools</span><span><Check size={13}/>Human approval</span><span><Check size={13}/>Audit trace</span></div></div>
          <div className="panel trace-panel"><div className="trace-head"><div className="panel-title-icon"><div className="round-icon bot-round"><Bot size={19}/></div><div><h3>Agent trace</h3><p>Tools, observations and decisions</p></div></div><span className={`status-pill status-${audit?.status||'ready'}`}><span/>{statusText(audit?.status)}</span></div>
            {audit ? <><div className="summary-box"><div className="summary-label">AUDIT SUMMARY</div><p>{audit.summary || 'The agent is reviewing the available transactions.'}</p></div><div className="timeline">{(audit.audit_log||[]).map((item,i)=><div className="timeline-item" key={`${item.time}-${i}`}><div className={`timeline-marker ${traceColor(item.type)}`}>{item.type==='tool'?<Check size={12}/>:item.type==='error'?<X size={12}/>:item.type==='approval_required'?<ShieldCheck size={12}/>:<span/>}</div><div className="timeline-content"><div className="timeline-message">{item.message}</div><div className="timeline-meta">{item.type.replaceAll('_',' ')} <span>·</span> {new Date(item.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>{item.type==='plan'&&item.details?.tool&&<code>{item.details.tool}({JSON.stringify(item.details.arguments||{})})</code>}</div></div>)}</div></> : <div className="trace-empty"><div className="empty-bot"><Bot size={25}/></div><strong>Your audit trace will appear here</strong><p>Run an audit to see the agent's decisions, tool calls and safety checks.</p><div className="mini-steps"><span>Inspect</span><i>→</i><span>Calculate</span><i>→</i><span>Ask first</span></div></div>}
          </div></div>
        {findings.length>0&&<div className="findings-wrap"><div className="findings-title"><div><div className="section-kicker">AUDIT FINDINGS</div><h3>Potential subscription traps</h3></div><span className="count-pill">{findings.length} detected</span></div><div className="finding-grid">{findings.map((f,i)=><div className="finding-card" key={`${f.merchant}-${i}`}><div className="finding-top"><span className="warning-tag"><AlertTriangle size={13}/>Price increase detected</span><span className="increase-badge">+{f.change_pct}%</span></div><h3>{f.merchant}</h3><div className="price-change"><span>{money(f.old_amount)}</span><ArrowUpRight size={16}/><strong>{money(f.new_amount)}<small>/month</small></strong></div><div className="finding-divider"/><div className="finding-bottom"><span>Detected {shortDate(f.date)}</span><strong>+{money(f.monthly_increase)} / month</strong></div></div>)}</div></div>}
        {audit?.pending_action&&<div className={`panel approval-panel ${audit.status==='done'?'approval-done':''}`}><div className="approval-heading"><div className="approval-icon"><ShieldCheck size={21}/></div><div className="approval-title"><div className="section-kicker">HUMAN-IN-THE-LOOP</div><h2>{audit.pending_action.approved===true?'Action approved (simulation)':audit.pending_action.approved===false?'Proposed action reviewed':'Action needs your approval'}</h2><p>{audit.pending_action.merchant} · Subscription change review</p></div><span className={`approval-state ${audit.status==='awaiting_approval'?'pending':audit.pending_action.approved?'approved':'rejected'}`}><span/>{audit.status==='awaiting_approval'?'Awaiting decision':audit.pending_action.approved?'Decision recorded':'Decision recorded'}</span></div>
          <div className="approval-facts"><Fact label="PRICE INCREASE" value={`+${audit.pending_action.change_pct}%`} accent/><Fact label="ANNUALIZED COST NOW" value={money(audit.pending_action.annual_cost)}/><Fact label="MONTHLY DIFFERENCE" value={`+${money(audit.pending_action.monthly_increase)}`} accent/></div>
          <div className="draft-header"><span>CANCELLATION / DISPUTE DRAFT</span><span className="not-sent"><span/>NOT SENT</span></div><pre className="draft-box">{audit.pending_action.draft}</pre>
          {audit.status==='awaiting_approval'?<><label className="field-label reason-label" htmlFor="approval-reason">OPTIONAL DECISION NOTE</label><input className="reason-input" id="approval-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Add a note about your decision (optional)"/><div className="approval-footer"><p>Review the draft carefully. Approve only to record a local simulation; no message will be sent.</p><div className="approval-buttons"><button className="btn btn-secondary reject-btn" onClick={()=>decide('reject')} disabled={busy.approval}>Reject</button><button className="btn btn-primary" onClick={()=>decide('approve')} disabled={busy.approval}>{busy.approval?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}Approve simulation</button></div></div></>:<div className="decision-notice"><CheckCircle2 size={18}/><span>{audit.pending_action.approved?'Approved and recorded locally. No external message was sent.':'You rejected this proposal. Nothing was sent.'}</span></div>}
        </div>}
      </section>
      <footer className="page-footer"><span>FINWISE · FINANCE INTELLIGENCE AGENT</span><span>Built for learning <i>·</i> Not financial advice</span></footer>
    </main>
  </div>;
}

function Metric({icon,tone,label,value,sub}) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>; }
function Empty({icon,text}) { return <div className="empty-state"><div className="empty-state-icon">{icon}</div><p>{text}</p></div>; }
function Fact({label,value,accent}) { return <div className="fact"><span>{label}</span><strong className={accent?'fact-accent':''}>{value}</strong></div>; }
export default App;
