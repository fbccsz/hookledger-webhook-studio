import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Braces, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, CircleDot, Code2, Copy, Database, ExternalLink, Filter, FlaskConical, GitBranch, Layers3, LifeBuoy, LockKeyhole, Menu, MoreHorizontal, Network, PauseCircle, Play, Plus, RefreshCcw, RotateCcw, Route as RouteIcon, Search, Send, Server, Settings2, ShieldCheck, Sparkles, Terminal, Webhook, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLedger } from './core/useLedger';
import { samplePayload } from './core/engine';
import type {
  EventStatus, Evaluation, LedgerEvent, LedgerRoute, Metrics,
  Operator, Page, RouteDraft, Toast
} from './core/types';

const navigation: { section: string; items: { id: Page; label: string; icon: LucideIcon; hint?: string }[] }[] = [
  { section: 'WORKSPACE', items: [
    { id: 'overview', label: 'Overview', icon: Layers3 },
    { id: 'events', label: 'Event explorer', icon: Activity },
    { id: 'routes', label: 'Routing rules', icon: GitBranch },
    { id: 'playground', label: 'Playground', icon: FlaskConical, hint: 'NEW' },
  ] },
  { section: 'DEVELOPER', items: [
    { id: 'docs', label: 'API reference', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ] },
];
const statusNames: Record<EventStatus, string> = { delivered: 'Archived', failed: 'Failed', filtered: 'Filtered' };
const operators: Record<Operator, string> = { equals: 'Equals', contains: 'Contains', greater_than: 'Greater than', exists: 'Exists' };
const pageNames: Record<Page, string> = { overview: 'Overview', events: 'Event explorer', routes: 'Routing rules', playground: 'Playground', settings: 'Settings', docs: 'API reference' };
const shortId = (id: string) => id.length > 17 ? `${id.slice(0, 15)}…` : id;
const relativeTime = (iso: string) => {
  const delta = Math.max(0, Date.now() - new Date(iso).getTime());
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};
const clockTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const rate = (number: number) => `${number.toFixed(1)}%`;
function download(name: string, value: string, mime = 'application/json') {
  const blob = new Blob([value], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function copy(value: string) { if (!navigator.clipboard) throw new Error('Clipboard is not available'); await navigator.clipboard.writeText(value); }

function Status({ status, dot = true }: { status: EventStatus; dot?: boolean }) {
  return <span className={`status-pill status-${status}`}>{dot && <span className="status-dot" />}{statusNames[status]}</span>;
}
function IconSquare({ icon: Icon, tone = 'neutral' }: { icon: LucideIcon; tone?: 'neutral' | 'lime' | 'purple' | 'orange' }) {
  return <span className={`icon-square tone-${tone}`}><Icon size={18} strokeWidth={1.8} /></span>;
}
function SectionTitle({ eyebrow, title, caption, actions }: { eyebrow: string; title: string; caption?: string; actions?: React.ReactNode }) {
  return <div className="section-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{caption && <p className="section-caption">{caption}</p>}</div>
    {actions && <div className="section-actions">{actions}</div>}
  </div>;
}
function Kpi({ label, value, note, icon, trend, tone }: { label: string; value: string; note: string; icon: LucideIcon; trend?: string; tone: 'lime' | 'purple' | 'orange' | 'neutral' }) {
  const Icon = icon;
  return <article className="kpi-card">
    <div className="kpi-top"><span>{label}</span><span className={`kpi-icon tone-${tone}`}><Icon size={17} /></span></div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-footer">{trend && <span className={`kpi-trend tone-${tone}`}>{trend}</span>}<span>{note}</span></div>
  </article>;
}
function ThroughputChart({ metrics }: { metrics: Metrics }) {
  const daily = metrics.daily.length ? metrics.daily : Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return { day: d.toISOString().slice(0, 10), total: 0 }; });
  const max = Math.max(1, ...daily.map(d => d.total));
  const [hover, setHover] = useState<number | null>(null);
  const points = daily.map((d, i) => ({ x: 14 + i * 105, y: 184 - d.total / max * 146 }));
  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `14,184 ${line} ${points.at(-1)?.x ?? 644},184`;
  const active = hover === null ? daily.length - 1 : hover;
  return <article className="panel chart-panel">
    <div className="panel-heading chart-heading"><div><p className="eyebrow">ACTIVITY MONITOR</p><h2>Event throughput</h2><p>Incoming webhooks over the last 7 days</p></div><span className="range-pill"><CircleDot size={11} /> LAST 7 DAYS <ChevronDown size={12}/></span></div>
    <div className="chart-topline"><span>EVENTS</span><span className="chart-selected"><b>{daily[active]?.total ?? 0}</b> {new Date(daily[active]?.day ?? Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
    <div className="chart-canvas">
      <div className="chart-ylabels"><span>{max}</span><span>{Math.round(max * .66)}</span><span>{Math.round(max * .33)}</span><span>0</span></div>
      <svg viewBox="0 0 658 205" preserveAspectRatio="none" role="img" aria-label={`Weekly event throughput. ${daily.map(x => `${x.day}: ${x.total}`).join(', ')}`}>
        <defs><linearGradient id="throughputFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b7f477" stopOpacity="0.31"/><stop offset="1" stopColor="#b7f477" stopOpacity="0"/></linearGradient></defs>
        {[38,87,136,184].map(y=><line key={y} x1="14" x2="644" y1={y} y2={y} stroke="#293035" strokeDasharray="3 6" />)}
        <polygon points={area} fill="url(#throughputFill)" />
        <polyline points={line} fill="none" stroke="#b7f477" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
        {points.map((p,i) => <g key={i}>
          <line x1={p.x} x2={p.x} y1="20" y2="184" stroke={hover === i ? '#647d63' : 'transparent'} strokeWidth="1" strokeDasharray="3 4" />
          <rect x={p.x - 37} y="14" width="74" height="174" fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          <circle cx={p.x} cy={p.y} r={hover === i || (hover === null && i === points.length-1) ? 5.5 : 2.7} fill="#b7f477" stroke="#13181b" strokeWidth="2" pointerEvents="none" />
        </g>)}
      </svg>
    </div>
    <div className="chart-xlabels">{daily.map(x=><span key={x.day}>{new Date(x.day+'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>)}</div>
  </article>;
}
function DeliveryBreakdown({ metrics }: { metrics: Metrics }) {
  const total = metrics.total || 1;
  const segments = [
    { label: 'Archived', value: metrics.delivered, color: '#b7f477' },
    { label: 'Filtered', value: metrics.filtered, color: '#8598dd' },
    { label: 'Failed', value: metrics.failed, color: '#fd8878' },
  ];
  const R = 64, C = 2 * Math.PI * R;
  let acc = 0;
  return <article className="panel breakdown-panel">
    <div className="panel-heading"><div><p className="eyebrow">RELIABILITY SIGNAL</p><h2>Delivery outcomes</h2><p>Local archive, filter & failure states</p></div><MoreHorizontal size={20} color="#6b757c"/></div>
    <div className="donut"><svg viewBox="0 0 190 190" aria-label={`Archived ${metrics.delivered}, filtered ${metrics.filtered}, failed ${metrics.failed}`}>
      <circle cx="95" cy="95" r={R} stroke="#252c31" strokeWidth="17" fill="none" />
      {segments.map(segment => {
        const length = segment.value / total * C;
        const offset = acc; acc += length;
        return <circle key={segment.label} cx="95" cy="95" r={R} stroke={segment.color} strokeWidth="17" fill="none" strokeDasharray={`${Math.max(0, length-4)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 95 95)" />;
      })}
    </svg><div className="donut-center"><strong>{rate(metrics.success_rate)}</strong><span>ARCHIVED</span></div></div>
    <div className="breakdown-rows">{segments.map(segment=><div key={segment.label} className="breakdown-row"><span><i style={{background:segment.color}} />{segment.label}</span><span><b>{segment.value}</b><small>{(segment.value / total * 100).toFixed(1)}%</small></span></div>)}</div>
  </article>;
}
function EventTable({ events, onSelect, condensed = false }: { events: LedgerEvent[]; onSelect: (id: string) => void; condensed?: boolean }) {
  return <div className="table-scroll"><table className="event-table">
    <thead><tr><th>EVENT ID</th><th>EVENT / SOURCE</th><th>ROUTE</th><th>STATUS</th><th>LATENCY</th><th>RECEIVED</th><th aria-label="Open" /></tr></thead>
    <tbody>{events.length ? events.map(event => <tr key={event.id} onClick={() => onSelect(event.id)}>
      <td className="mono event-id">{shortId(event.id)}</td>
      <td><div className="event-type"><span className="type-icon"><Webhook size={16}/></span><span><strong>{event.event_type}</strong><small>{event.payload.environment === 'sandbox' ? 'Sandbox event' : 'Webhook event'}</small></span></div></td>
      <td className="route-col">{event.route_title}</td>
      <td><Status status={event.status}/></td>
      <td className="mono muted">{event.latency_ms}ms</td>
      <td className="time-col">{relativeTime(event.created_at)}</td>
      <td><button className="icon-button row-open" aria-label={`Inspect event ${event.id}`} onClick={e => { e.stopPropagation(); onSelect(event.id); }}><ChevronRight size={17}/></button></td>
    </tr>) : <tr><td colSpan={7} className="empty-table">No events match these filters. Try adjusting your search.</td></tr>}</tbody>
  </table>{condensed && <div className="table-footer-note"><span><CircleDot size={11}/> MOST RECENT {events.length} EVENTS</span><span>CLICK ANY EVENT TO INSPECT <ArrowUpRight size={14}/></span></div>}</div>;
}
function Overview({ metrics, routes, events, onPage, onInspect, onDispatch }: { metrics: Metrics; routes: LedgerRoute[]; events: LedgerEvent[]; onPage: (p: Page) => void; onInspect: (id: string) => void; onDispatch: () => void }) {
  return <>
    <SectionTitle eyebrow="CONTROL PLANE  /  HOME" title="The whole picture." caption="A clear view of every event moving through your system." actions={<><span className="overview-live"><span className="live-dot"/> SYSTEM OBSERVABILITY</span><button className="primary-button" onClick={onDispatch}><Play size={16} fill="currentColor"/> SEND TEST EVENT <ArrowUpRight size={15}/></button></>}/>
    <div className="notice-demo"><div><Sparkles size={16}/><span><strong>Explore the sandbox.</strong> This workspace uses generated test events. Nothing shown represents real clients or external deliveries.</span></div><button onClick={() => onPage('playground')}>OPEN PLAYGROUND <ArrowRight size={15}/></button></div>
    <div className="kpi-grid">
      <Kpi label="TOTAL EVENTS" value={metrics.total.toLocaleString('en-US')} note="in this workspace" icon={Activity} trend="7D WINDOW" tone="lime"/>
      <Kpi label="ARCHIVE RATE" value={rate(metrics.success_rate)} note="matched & archived" icon={CheckCheck} trend="LOCAL SINK" tone="lime"/>
      <Kpi label="FAILED EVENTS" value={String(metrics.failed)} note="ready for inspection" icon={CircleAlert} trend={metrics.failed ? 'ACTION NEEDED' : 'ALL CLEAR'} tone="orange"/>
      <Kpi label="ACTIVE ROUTES" value={String(metrics.active_routes).padStart(2,'0')} note={`of ${routes.length} configured`} icon={GitBranch} trend="CONFIGURED" tone="purple"/>
    </div>
    <div className="analysis-grid"><ThroughputChart metrics={metrics}/><DeliveryBreakdown metrics={metrics}/></div>
    <div className="recent-head"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Event stream <span className="count-chip">{events.length}</span></h2></div><button className="text-button" onClick={() => onPage('events')}>VIEW ALL EVENTS <ArrowUpRight size={17}/></button></div>
    <article className="panel table-panel"><EventTable events={events.slice(0, 6)} onSelect={onInspect} condensed /></article>
    <div className="footer-grid"><div className="mini-panel"><IconSquare icon={ShieldCheck} tone="lime"/><div><strong>Built to be inspected.</strong><p>Every evaluation leaves an explicit rule trace you can review and replay.</p></div><ArrowUpRight size={18}/></div><div className="mini-panel"><IconSquare icon={Terminal} tone="purple"/><div><strong>Real Python backend included.</strong><p>FastAPI + SQLite, HMAC verification, idempotency and an authenticated API.</p></div><button onClick={()=>onPage('docs')} aria-label="View API reference"><ArrowUpRight size={18}/></button></div></div>
  </>;
}
const emptyDraft: RouteDraft = { slug:'',title:'',source:'Custom webhook',field:'type',operator:'equals',expected:'event.created',delivery_mode:'archive',enabled:true };
function RouteModal({ editing, existing, onClose, onSave, busy }: { editing: LedgerRoute | null; existing: LedgerRoute[]; onClose: () => void; onSave: (draft: RouteDraft, id?: string) => Promise<void>; busy: boolean }) {
  const [draft, setDraft] = useState<RouteDraft>(() => editing ? { slug:editing.slug,title:editing.title,source:editing.source,field:editing.field,operator:editing.operator,expected:editing.expected,delivery_mode:editing.delivery_mode,enabled:editing.enabled } : emptyDraft);
  const [error,setError]=useState('');
  const update=(key:keyof RouteDraft,value:string|boolean)=>setDraft(d=>({ ...d,[key]:value }));
  const save=async(event: React.FormEvent)=>{
    event.preventDefault();setError('');
    if(existing.some(r=>r.slug===draft.slug && r.id!==editing?.id)){setError('This endpoint slug is already in use');return;}
    try{await onSave(draft,editing?.id);onClose();}catch(err){setError(err instanceof Error?err.message:'Could not save route');}
  };
  return <div className="modal-scrim" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="modal-card route-modal" role="dialog" aria-modal="true" aria-labelledby="route-modal-title"><div className="modal-heading"><div><p className="eyebrow">ROUTING CONFIGURATION</p><h2 id="route-modal-title">{editing?'Edit routing rule':'Create a route'}</h2><p>Define what comes in, what gets matched and where it ends up.</p></div><button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={20}/></button></div>
      <form onSubmit={save} className="modal-form">
        <div className="form-two"><label>ROUTE NAME <input required minLength={3} maxLength={100} value={draft.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. Lead qualification" /></label><label>SOURCE <input required minLength={2} maxLength={60} value={draft.source} onChange={e=>update('source',e.target.value)} placeholder="e.g. Website forms" /></label></div>
        <label>ENDPOINT SLUG <div className="prefix-input"><span>POST /hooks/</span><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} value={draft.slug} onChange={e=>update('slug',e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="lead-qualification"/></div></label>
        <div className="rule-label"><span>01</span> CONDITION LOGIC</div>
        <div className="form-three"><label>JSON FIELD <input required maxLength={96} value={draft.field} onChange={e=>update('field',e.target.value)} placeholder="lead.score"/></label><label>OPERATOR <select value={draft.operator} onChange={e=>update('operator',e.target.value)}>{Object.entries(operators).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label><label>EXPECTED VALUE <input value={draft.expected} disabled={draft.operator==='exists'} maxLength={150} onChange={e=>update('expected',e.target.value)} placeholder="65" /></label></div>
        <div className="rule-label"><span>02</span> DELIVERY MODE</div>
        <div className="delivery-options"><label className={draft.delivery_mode==='archive'?'delivery-option chosen':'delivery-option'}><input type="radio" name="mode" checked={draft.delivery_mode==='archive'} onChange={()=>update('delivery_mode','archive')}/><Database size={20}/><strong>Local archive</strong><small>Store the event and its trace. No outbound requests.</small></label><label className={draft.delivery_mode==='sandbox_failure'?'delivery-option chosen':'delivery-option'}><input type="radio" name="mode" checked={draft.delivery_mode==='sandbox_failure'} onChange={()=>update('delivery_mode','sandbox_failure')}/><CircleAlert size={20}/><strong>Failure laboratory</strong><small>Intentionally fail matched events to test replay.</small></label></div>
        <label className="toggle-label"><span><strong>Route enabled</strong><small>Disabled routes do not accept new events.</small></span><input type="checkbox" checked={draft.enabled} onChange={e=>update('enabled',e.target.checked)}/><i/></label>
        {error&&<p className="inline-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" onClick={onClose} className="secondary-button">CANCEL</button><button disabled={busy} type="submit" className="primary-button">{busy?'SAVING…':'SAVE ROUTE'} <ArrowRight size={17}/></button></div>
      </form>
    </section>
  </div>;
}
function RoutesPage({ routes, events, openEditor, toggle, exportRoutes }: { routes: LedgerRoute[]; events: LedgerEvent[]; openEditor: (r: LedgerRoute | null) => void; toggle: (r: LedgerRoute) => void; exportRoutes: () => void }) {
  return <><SectionTitle eyebrow="WORKSPACE  /  ROUTING ENGINE" title="Routes, not guesswork." caption="Control which payloads pass, and inspect exactly why." actions={<><button className="secondary-button" onClick={exportRoutes}><ArrowDownToLine size={17}/> EXPORT JSON</button><button className="primary-button" onClick={()=>openEditor(null)}><Plus size={18}/> CREATE ROUTE</button></>}/>
    <div className="info-inline"><ShieldCheck size={18}/><div><strong>Predictable by design.</strong> Rules use simple path comparisons, not arbitrary expressions. The sandbox archives events locally and supports intentionally failed deliveries for replay testing.</div></div>
    <div className="routes-grid">{routes.map((r,i)=>{
      const own=events.filter(e=>e.route_id===r.id);
      const successful=own.filter(e=>e.status==='delivered').length;
      const fail=own.filter(e=>e.status==='failed').length;
      return <article key={r.id} className="route-card">
        <div className="route-card-top"><span className="route-index">0{i+1} / ROUTING RULE</span><span className={r.enabled?'route-enabled':'route-disabled'}><span/>{r.enabled?'ACTIVE':'PAUSED'}</span></div>
        <div className="route-symbol"><GitBranch size={27} strokeWidth={1.6}/></div>
        <h3>{r.title}</h3><p className="route-source"><span className="route-source-dot"/> {r.source}</p>
        <div className="route-endpoint"><span>ENDPOINT</span><code>/hooks/{r.slug}</code></div>
        <div className="route-logic"><span>WHEN</span><code>{r.field}</code><small>{operators[r.operator]} {r.operator!=='exists'?r.expected:''}</small></div>
        <div className="route-metrics"><span><b>{own.length}</b><small>EVENTS</small></span><span><b>{successful}</b><small>ARCHIVED</small></span><span><b className={fail?'orange-text':''}>{fail}</b><small>FAILED</small></span></div>
        <div className="route-card-actions"><button onClick={()=>openEditor(r)} className="route-edit">CONFIGURE RULE <ArrowUpRight size={17}/></button><button onClick={()=>toggle(r)} className="icon-button" title={r.enabled?'Pause route':'Enable route'} aria-label={`${r.enabled?'Pause':'Enable'} ${r.title}`}>{r.enabled?<PauseCircle size={21}/>:<Play size={21}/>}</button></div>
      </article>;
    })}{!routes.length&&<div className="empty-state"><Network size={35}/><h3>Nothing connected yet.</h3><p>Create your first route and start inspecting events.</p><button onClick={()=>openEditor(null)} className="primary-button"><Plus size={16}/> NEW ROUTE</button></div>}</div>
    <div className="route-bottom"><div><IconSquare icon={Code2} tone="purple"/><div><strong>Want to connect a real sender?</strong><p>Use the authenticated Python API locally and send signed HMAC webhooks to a route endpoint.</p></div></div><button className="text-button" onClick={exportRoutes}>DOWNLOAD CONFIG <ArrowUpRight size={17}/></button></div>
  </>;
}
function EventsPage({ events, routes, onInspect, onExport }: { events: LedgerEvent[]; routes: LedgerRoute[]; onInspect: (id: string) => void; onExport: () => void }) {
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[routeId,setRouteId]=useState('all'),[page,setPage]=useState(1);
  const searchRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();searchRef.current?.focus();}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[]);
  const filtered=useMemo(()=>events.filter(e => (status==='all'||e.status===status) && (routeId==='all'||e.route_id===routeId) && (!query||[e.event_type,e.id,e.route_title,JSON.stringify(e.payload)].some(text=>text.toLowerCase().includes(query.toLowerCase())))),[events,query,status,routeId]);
  const perPage=14,totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
  const items=filtered.slice((Math.min(page,totalPages)-1)*perPage,Math.min(page,totalPages)*perPage);
  const changeStatus=(v:string)=>{setStatus(v);setPage(1);};
  return <><SectionTitle eyebrow="WORKSPACE  /  EVENT EXPLORER" title="Nothing gets lost." caption="Search, inspect and trace every received event — down to the payload." actions={<button className="secondary-button" onClick={onExport}><ArrowDownToLine size={17}/> EXPORT EVENTS</button>}/>
    <div className="events-summary"><span><span className="live-dot"/> STREAM READY</span><p>{filtered.length} EVENTS MATCH YOUR FILTERS</p><span>TIP: PRESS <kbd>/</kbd> TO SEARCH</span></div>
    <article className="panel table-panel event-explorer">
      <div className="table-toolbar"><div className="search-box"><Search size={18}/><input ref={searchRef} placeholder="Search event, ID, payload…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} aria-label="Search events"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X size={15}/></button>}</div>
        <div className="filters"><label><Filter size={16}/><select aria-label="Filter by status" value={status} onChange={e=>changeStatus(e.target.value)}><option value="all">All statuses</option><option value="delivered">Archived</option><option value="failed">Failed</option><option value="filtered">Filtered</option></select><ChevronDown size={13}/></label><label><GitBranch size={16}/><select aria-label="Filter by route" value={routeId} onChange={e=>{setRouteId(e.target.value);setPage(1);}}><option value="all">All routes</option>{routes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select><ChevronDown size={13}/></label></div>
      </div>
      <EventTable events={items} onSelect={onInspect}/>
      <div className="pagination"><span>SHOWING {items.length?((Math.min(page,totalPages)-1)*perPage+1):0}–{Math.min(Math.min(page,totalPages)*perPage,filtered.length)} OF {filtered.length}</span><div><button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft size={15}/> PREVIOUS</button><span>{Math.min(page,totalPages)} / {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>NEXT <ArrowRight size={15}/></button></div></div>
    </article>
  </>;
}
function EventDrawer({ event, replay, close, replaying, toast }: { event: LedgerEvent; replay: () => Promise<void>; close: () => void; replaying: boolean; toast: (message: string, tone?: Toast['tone']) => void }) {
  const [tab,setTab]=useState<'payload'|'trace'>('payload');
  const replayNow=async()=>{try{await replay();toast('Event replayed successfully');}catch(err){toast(err instanceof Error?err.message:'Replay failed','error');}};
  return <div className="drawer-scrim" onMouseDown={e=>e.target===e.currentTarget&&close()}>
    <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Event inspection">
      <div className="drawer-header"><div><p className="eyebrow">EVENT INSPECTOR</p><h2>Event details<span>.</span></h2></div><button onClick={close} className="icon-button" aria-label="Close event"><X size={22}/></button></div>
      <div className="drawer-status"><Status status={event.status}/><span>{clockTime(event.created_at)}</span></div>
      <div className="drawer-stats"><div><span>EVENT ID</span><strong className="mono">{shortId(event.id)}</strong></div><div><span>ROUTE</span><strong>{event.route_title}</strong></div><div><span>LATENCY</span><strong className="mono">{event.latency_ms}ms</strong></div><div><span>ATTEMPTS</span><strong className="mono">{event.attempt_count}</strong></div></div>
      <div className="drawer-tabs"><button className={tab==='payload'?'active':''} onClick={()=>setTab('payload')}><Braces size={16}/> JSON PAYLOAD</button><button className={tab==='trace'?'active':''} onClick={()=>setTab('trace')}><RouteIcon size={16}/> EXECUTION TRACE</button></div>
      {tab==='payload'?<div className="code-view"><div className="code-view-head"><span>application/json</span><button onClick={()=>void copy(JSON.stringify(event.payload,null,2)).then(()=>toast('Payload copied')).catch(()=>toast('Clipboard unavailable','error'))}><Copy size={15}/> COPY</button></div><pre>{JSON.stringify(event.payload,null,2)}</pre></div>
        :<div className="trace-list">{event.trace.map((step,i)=><div className="trace-step" key={i}><span className={`trace-mark ${step.result}`}><Check size={15}/></span><div><span>STEP 0{i+1} · {step.step.toUpperCase()}</span><strong>{step.result.replace('_',' ')}</strong><p>{step.detail}</p></div></div>)}</div>}
      <div className="drawer-footer"><p><LockKeyhole size={14}/> Payload remains in this workspace only.</p><button disabled={replaying||event.attempt_count>=10} onClick={()=>void replayNow()} className="primary-button"><RotateCcw size={16}/> {replaying?'REPLAYING…':'REPLAY EVENT'}</button></div>
    </aside>
  </div>;
}
function Playground({ routes, mode, simulate, dispatch, onGoRoutes, toast }: { routes: LedgerRoute[]; mode: 'demo' | 'api'; simulate: (route: LedgerRoute,payload: Record<string,unknown>) => Promise<Evaluation>; dispatch: (route: LedgerRoute,payload: Record<string,unknown>) => void; onGoRoutes: () => void; toast: (text: string,tone?:Toast['tone'])=>void }) {
  const [routeId,setRouteId]=useState(routes[0]?.id ?? '');
  const route=routes.find(r=>r.id===routeId)||routes[0];
  const [json,setJson]=useState(()=>route?JSON.stringify(samplePayload(route),null,2):'{}');
  const [evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const [error,setError]=useState(''),[running,setRunning]=useState(false);
  const changeRoute=(id:string)=>{setRouteId(id);const r=routes.find(x=>x.id===id);if(r)setJson(JSON.stringify(samplePayload(r),null,2));setEvaluation(null);setError('');};
  const run=async(persist:boolean)=>{
    if(!route){setError('Create a route first');return;}
    let data:unknown;
    try{data=JSON.parse(json);}catch{setError('Invalid JSON. Check commas, quotes and brackets.');return;}
    if(!data||Array.isArray(data)||typeof data!=='object'){setError('Payload must be a JSON object.');return;}
    setRunning(true);setError('');
    try{const result=await simulate(route,data as Record<string,unknown>);setEvaluation(result);
      if(persist){dispatch(route,data as Record<string,unknown>);toast('Sandbox event created and archived in the stream');}
      else toast('Simulation complete — no event stored');
    }catch(err){setError(err instanceof Error?err.message:'Could not run simulation');}
    finally{setRunning(false);}
  };
  return <><SectionTitle eyebrow="DEVELOPER TOOLKIT  /  PLAYGROUND" title="Break things safely." caption="Paste JSON, evaluate routing conditions, then inspect the execution trace." actions={<button className="secondary-button" onClick={onGoRoutes}><GitBranch size={17}/> MANAGE ROUTES</button>}/>
    <div className="playground-intro"><div><FlaskConical size={19}/><strong>SAFE EXPERIMENTATION ZONE</strong></div><p>No emails, payments or outbound webhooks are sent. {mode==='demo'?'Save a synthetic test event to your local event stream.':'Backend mode: simulate without persisting; send real webhooks using a signed HTTP request.'}</p></div>
    <div className="playground-grid"><article className="panel editor-panel"><div className="playground-panel-head"><div><span className="eyebrow">01 / INPUT</span><h2>Request builder</h2></div><span className="tiny-indicator"><CircleDot size={12}/> JSON</span></div>
      <div className="playground-body"><label className="control-label">TARGET ROUTE</label><div className="select-wide"><select value={route?.id??''} onChange={e=>changeRoute(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.title} — /hooks/{r.slug}</option>)}</select><ChevronDown size={16}/></div>
        <div className="editor-label"><label className="control-label">REQUEST PAYLOAD</label><div><button onClick={()=>{if(route){setJson(JSON.stringify(samplePayload(route),null,2));setEvaluation(null);}}}><RefreshCcw size={14}/> LOAD SAMPLE</button><button onClick={()=>void copy(json).then(()=>toast('JSON copied')).catch(()=>toast('Clipboard unavailable','error'))}><Copy size={14}/> COPY</button></div></div>
        <div className="json-editor"><div className="line-numbers" aria-hidden="true">{json.split('\n').map((_,i)=><span key={i}>{i+1}</span>)}</div><textarea aria-label="JSON payload editor" spellCheck={false} value={json} onChange={e=>{setJson(e.target.value);setEvaluation(null);}} /></div>
        {error&&<p className="inline-error" role="alert"><CircleAlert size={16}/>{error}</p>}
        <div className="playground-buttons"><button className="secondary-button" disabled={running||!route} onClick={()=>void run(false)}><Play size={16}/> SIMULATE</button><button className="primary-button" disabled={running||!route||mode==='api'} onClick={()=>void run(true)}><Send size={16}/> SEND TEST EVENT <ArrowRight size={15}/></button></div>
      </div>
    </article><article className="panel output-panel"><div className="playground-panel-head"><div><span className="eyebrow">02 / OUTPUT</span><h2>Execution trace</h2></div><span className="tiny-indicator"><Activity size={13}/> {evaluation?'COMPLETE':'IDLE'}</span></div>
      {!evaluation?<div className="playground-empty"><span><Terminal size={31}/></span><h3>Ready when you are.</h3><p>Choose a route, edit the JSON payload and run a simulation. The evaluation steps will appear here.</p><div className="ascii-flow">RECEIVE <ArrowRight size={17}/> VALIDATE <ArrowRight size={17}/> ROUTE <ArrowRight size={17}/> ARCHIVE</div></div>:
      <div className="playground-results"><div className="result-head"><span>SIMULATION RESULT</span><Status status={evaluation.status}/></div><div className="trace-list">{evaluation.trace.map((step,i)=><div key={i} className="trace-step"><span className={`trace-mark ${step.result}`}><Check size={14}/></span><div><span>STEP {String(i+1).padStart(2,'0')} / {step.step.toUpperCase()}</span><strong>{step.result}</strong><p>{step.detail}</p></div></div>)}</div><div className="simulation-note"><ShieldCheck size={17}/> {evaluation.persisted?'Result stored by backend':'Dry run completed. No external delivery occurred.'}</div></div>}
    </article></div>
  </>;
}
function SettingsPage({ mode, connection, busy, connect, disconnect, reset, toast }: {mode:'demo'|'api';connection:{url:string;token:string}|null;busy:boolean;connect:(url:string,token:string)=>Promise<void>;disconnect:()=>void;reset:()=>void;toast:(s:string,t?:Toast['tone'])=>void}){
  const [url,setUrl]=useState(connection?.url||'http://127.0.0.1:8000');
  const [token,setToken]=useState('');
  const [error,setError]=useState('');
  const doConnect=async(e:React.FormEvent)=>{e.preventDefault();setError('');try{await connect(url,token);setToken('');toast('Connected to Python API');}catch(err){setError(err instanceof Error?err.message:'Connection failed');}};
  return <><SectionTitle eyebrow="WORKSPACE  /  ENVIRONMENT" title="Your environment." caption="Choose between a fully interactive local sandbox and your own Python backend." />
    <div className="settings-grid"><article className="panel settings-card"><div className="settings-icon"><Database size={22}/></div><p className="eyebrow">CURRENT WORKSPACE</p><h2>{mode==='demo'?'Local sandbox':'Python API connected'}</h2><p>{mode==='demo'?'All interactions are stored in your browser. No network credentials or real customer data are needed.':'Authenticated API mode. Routes, events and replay operations are handled by your FastAPI instance.'}</p><div className="settings-state"><span className="live-dot"/>{mode==='demo'?'SIMULATION ENVIRONMENT':'CONNECTED TO BACKEND'}</div><button className="secondary-button" onClick={()=>{if(mode==='api'){disconnect();toast('Back to local sandbox');}else if(window.confirm('Reset all sandbox changes and restore sample data?')){reset();toast('Sandbox reset successfully');}}}>{mode==='demo'?<RefreshCcw size={16}/>:<ArrowLeft size={16}/>} {mode==='demo'?'RESET DEMO DATA':'DISCONNECT'}</button></article>
      <article className="panel settings-card"><div className="settings-icon purple"><Server size={22}/></div><p className="eyebrow">OPTIONAL INTEGRATION</p><h2>Connect your backend.</h2><p>Start FastAPI locally and connect with your admin bearer token. Tokens remain in memory for this page session only.</p><form onSubmit={doConnect} className="connect-form"><label>API BASE URL<input value={url} onChange={e=>setUrl(e.target.value)} required placeholder="http://127.0.0.1:8000"/></label><label>ADMIN BEARER TOKEN<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} required placeholder="Your HOOKLEDGER_ADMIN_TOKEN"/></label>{error&&<p className="inline-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy?'CONNECTING…':'TEST CONNECTION'} <ArrowUpRight size={16}/></button></form></article></div>
    <article className="panel security-panel"><div><ShieldCheck size={27}/><h3>Security is a feature, not an afterthought.</h3></div><div className="security-items"><p><Check size={16}/> Admin endpoints require bearer authentication</p><p><Check size={16}/> HMAC-SHA256 verified inbound webhooks</p><p><Check size={16}/> Idempotency keys prevent duplicate events</p><p><Check size={16}/> Explicit sandbox-only failure testing</p><p><Check size={16}/> No arbitrary code execution in routing conditions</p><p><Check size={16}/> No external deliveries from the public demo</p></div></article>
  </>;
}
function DocsPage({ routes, toast }: { routes: LedgerRoute[]; toast:(s:string,t?:Toast['tone'])=>void }) {
  const slug = routes[0]?.slug || 'lead-qualification';
  const curl = `# 1) Create a signed request body\nBODY='{"type":"lead.created","lead":{"score":87}}'\nSIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HOOKLEDGER_WEBHOOK_SECRET" -hex | awk '{print $2}')\n\n# 2) Send it to your Python instance\ncurl -X POST http://localhost:8000/hooks/${slug} \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: demo-0001" \\\n  -H "X-HookLedger-Signature: sha256=$SIGNATURE" \\\n  -d "$BODY"`;

  return <><SectionTitle eyebrow="DEVELOPER RESOURCES  /  DOCUMENTATION" title="Built for builders." caption="From your first signed webhook to a replayable execution trace." actions={<a href="https://fastapi.tiangolo.com/" target="_blank" rel="noopener noreferrer" className="secondary-button"><ExternalLink size={16}/> FASTAPI DOCS</a>}/>
    <div className="docs-hero"><div><span className="eyebrow">HOOKLEDGER API  /  V1.0</span><h2>Integrate with<br/><em>confidence.</em></h2><p>Local-first, observable, auditable. The Python API demonstrates reliability patterns without shipping events to external services.</p></div><div className="docs-endpoint"><span>BASE URL / LOCAL DEVELOPMENT</span><code>http://localhost:8000</code><div><span className="live-dot"/> OPENAPI AT <strong>/docs</strong></div></div></div>
    <div className="docs-content"><article className="panel docs-section"><div className="docs-section-head"><span className="eyebrow">01 / SETUP</span><h3>Run the Python engine.</h3><p>Install dependencies, configure secrets, start the API and open the Swagger UI.</p></div><div className="code-view"><div className="code-view-head"><span>terminal</span><button onClick={()=>void copy('cd backend\npython -m venv .venv\npip install -r requirements.txt\nuvicorn hookledger.main:app --reload').then(()=>toast('Commands copied')).catch(()=>toast('Copy unavailable','error'))}><Copy size={15}/> COPY</button></div><pre>{`cd backend\npython -m venv .venv\npip install -r requirements.txt\n# Configure the environment variables in .env.example\nuvicorn hookledger.main:app --reload`}</pre></div></article>
    <article className="panel docs-section"><div className="docs-section-head"><span className="eyebrow">02 / SIGNED WEBHOOK</span><h3>Send a verified event.</h3><p>Every inbound request is verified with HMAC-SHA256 and an optional idempotency key.</p></div><div className="code-view"><div className="code-view-head"><span>bash · curl</span><button onClick={()=>void copy(curl).then(()=>toast('Example copied')).catch(()=>toast('Copy unavailable','error'))}><Copy size={15}/> COPY</button></div><pre>{curl}</pre></div></article>
    <article className="panel docs-section"><div className="docs-section-head"><span className="eyebrow">03 / API METHODS</span><h3>Minimal, predictable endpoints.</h3><p>Admin routes require a Bearer token. Incoming webhooks require a valid signature.</p></div><div className="endpoint-list">{[
      ['GET','/api/routes','List configured routes'], ['POST','/api/routes','Create a validated route'], ['PATCH','/api/routes/{id}','Update rule or delivery mode'], ['POST','/hooks/{slug}','Receive a signed webhook'], ['GET','/api/events','Inspect stored events'], ['POST','/api/simulate','Dry-run routing logic'], ['POST','/api/events/{id}/replay','Re-evaluate a stored payload'], ['GET','/api/metrics','Read aggregate metrics'],
    ].map(([method,path,desc])=><div key={path+method}><code className={method==='GET'?'method-get':'method-post'}>{method}</code><code className="endpoint-path">{path}</code><span>{desc}</span></div>)}</div></article>
    <article className="panel docs-section"><div className="docs-section-head"><span className="eyebrow">04 / VALIDATE</span><h3>Testable by default.</h3><p>Backend integration tests use ephemeral SQLite and FastAPI TestClient. Frontend rules are also unit-tested.</p></div><div className="code-view"><div className="code-view-head"><span>python · pytest</span><button onClick={()=>void copy('cd backend && PYTHONPATH=. pytest -q').then(()=>toast('Command copied')).catch(()=>toast('Copy unavailable','error'))}><Copy size={15}/> COPY</button></div><pre>{`cd backend\nPYTHONPATH=. pytest -q\n\n# Unit-test the pure rule engine\n# and verify webhook HMAC, replay and idempotency.`}</pre></div></article></div>
    <div className="docs-note"><CircleAlert size={19}/><p><strong>Scope note:</strong> The public interface is a sandbox. The Python backend persists events in SQLite and archives matched payloads; it intentionally does not forward to external APIs. Production delivery would require an outbound queue, destination allowlist, background workers, and encrypted secrets. This distinction is documented.</p></div>
  </>;
}
function App() {
  const ledger = useLedger();
  const [page, setPage] = useState<Page>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string|null>(null);
  const [routeEdit, setRouteEdit] = useState<LedgerRoute|null|undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message:string,tone:Toast['tone']='success')=>{
    const id=Date.now()+Math.random();setToasts(current=>[...current.slice(-2),{id,message,tone}]);
    window.setTimeout(()=>setToasts(current=>current.filter(t=>t.id!==id)),4800);
  },[]);
  const selectedEvent=ledger.events.find(e=>e.id===selectedEventId)||null;
  const navigate=(p:Page)=>{setPage(p);setMobileNav(false);window.scrollTo({top:0,behavior:'instant'});};
  const saveRoute=async(draft:RouteDraft,id?:string)=>{setSaving(true);try{await ledger.saveRoute(draft,id);toast(id?'Route updated successfully':'Route created successfully');}finally{setSaving(false);}};
  const toggleRoute=async(route:LedgerRoute)=>{try{await ledger.saveRoute({slug:route.slug,title:route.title,source:route.source,field:route.field,operator:route.operator,expected:route.expected,delivery_mode:route.delivery_mode,enabled:!route.enabled},route.id);toast(!route.enabled?'Route activated':'Route paused');}catch(err){toast(err instanceof Error?err.message:'Update failed','error');}};
  const exportRoutes=()=>{download('hookledger-routes.json',JSON.stringify({version:1,exported_at:new Date().toISOString(),routes:ledger.routes},null,2));toast('Route configuration exported');};
  const exportEvents=()=>{
    const cols=['id','event_type','route_title','status','latency_ms','attempt_count','created_at'];
    const safe=(v:unknown)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'").replace(/"/g,'""')+'"';
    const csv=[cols.join(','),...ledger.events.map(e=>cols.map(k=>safe(e[k as keyof LedgerEvent])).join(','))].join('\r\n');
    download('hookledger-events.csv','\uFEFF'+csv,'text/csv;charset=utf-8');toast('Event CSV exported');
  };
  const fireTest=()=>{
    if(ledger.mode==='api'){navigate('playground');return;}
    const route=ledger.routes.find(r=>r.enabled && r.delivery_mode==='archive')||ledger.routes.find(r=>r.enabled);
    if(!route){toast('Enable a route to send a test event','error');return;}
    const event=ledger.dispatchDemo(route,samplePayload(route));toast('Synthetic webhook created: '+event.status);
  };
  useEffect(()=>{
    const onEsc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelectedEventId(null);setRouteEdit(undefined);setMobileNav(false);}};
    window.addEventListener('keydown',onEsc);return()=>window.removeEventListener('keydown',onEsc);
  },[]);
  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="sidebar-logo"><span className="brand-mark"><Activity size={24} strokeWidth={2.5}/></span><div><strong>hookledger<span>.</span></strong><small>WEBHOOK OPERATIONS</small></div><span className="brand-version">V1</span></div>
      <div className="sidebar-workspace"><div className="workspace-icon"><Network size={19}/></div><div><span>CURRENT WORKSPACE</span><strong>Sandbox project</strong></div><ChevronDown size={15}/></div>
      <div className="side-scroll">{navigation.map(group=><div key={group.section} className="nav-section"><p className="nav-label">{group.section}</p><nav aria-label={group.section}>{group.items.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'selected':''}`} type="button" onClick={()=>navigate(item.id)}><Icon size={19} strokeWidth={1.8}/><span>{item.label}</span>{item.hint&&<small>{item.hint}</small>}{page===item.id&&<span className="nav-active-marker"/>}</button>;})}</nav></div>)}</div>
      <div className="sidebar-bottom"><div className="sidebar-help"><span><LifeBuoy size={18}/></span><strong>Developer mode</strong><p>Run the FastAPI engine locally and inspect real signed webhook traffic.</p><button onClick={()=>navigate('docs')}>VIEW THE DOCS <ArrowUpRight size={14}/></button></div><div className="sidebar-user"><div className="avatar">ys</div><div><strong>ysh / developer</strong><small>Portfolio workspace</small></div><button onClick={()=>navigate('settings')} aria-label="Settings"><MoreHorizontal size={20}/></button></div></div>
    </aside>
    <div className="main-layout"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)} aria-label="Open menu"><Menu size={21}/></button><span className="breadcrumb-root">WORKSPACE</span><ChevronRight size={14}/><span className="breadcrumb-current">{pageNames[page]}</span></div><div className="topbar-right"><div className={`env-badge ${ledger.mode==='api'?'connected':''}`}><span className="env-dot"/><span>{ledger.mode==='demo'?'DEMO ENVIRONMENT':'PYTHON API'}</span></div><span className="topbar-divider"/><button title="API documentation" onClick={()=>navigate('docs')} aria-label="Go to API documentation" className="icon-button"><BookOpen size={19}/></button><button title="Connection settings" onClick={()=>navigate('settings')} aria-label="Go to connection settings" className="icon-button"><Settings2 size={19}/></button><div className="topbar-avatar">ys</div></div></header>
    <main className="main-content">
      {page==='overview'&&<Overview metrics={ledger.metrics} routes={ledger.routes} events={ledger.events} onPage={navigate} onInspect={setSelectedEventId} onDispatch={fireTest}/>}
      {page==='events'&&<EventsPage events={ledger.events} routes={ledger.routes} onInspect={setSelectedEventId} onExport={exportEvents}/>}
      {page==='routes'&&<RoutesPage routes={ledger.routes} events={ledger.events} openEditor={setRouteEdit} toggle={r=>void toggleRoute(r)} exportRoutes={exportRoutes}/>}
      {page==='playground'&&<Playground routes={ledger.routes} mode={ledger.mode} simulate={ledger.simulate} dispatch={ledger.dispatchDemo} onGoRoutes={()=>navigate('routes')} toast={toast}/>}
      {page==='settings'&&<SettingsPage mode={ledger.mode} connection={ledger.connection} busy={ledger.busy} connect={ledger.connect} disconnect={ledger.disconnect} reset={ledger.resetDemo} toast={toast}/>}
      {page==='docs'&&<DocsPage routes={ledger.routes} toast={toast}/>}
      <footer className="main-footer"><span>HOOKLEDGER / RELIABILITY STUDIO <span className="footer-separator">/</span> <span>BUILT BY YSH</span></span><span><span className="footer-circle"/> OPEN-SOURCE PORTFOLIO PROJECT <span className="footer-separator">/</span> 2026</span></footer>
    </main></div>
    {selectedEvent&&<EventDrawer event={selectedEvent} replay={()=>ledger.replay(selectedEvent)} close={()=>setSelectedEventId(null)} replaying={ledger.busy} toast={toast}/>}
    {routeEdit!==undefined&&<RouteModal editing={routeEdit} existing={ledger.routes} onClose={()=>setRouteEdit(undefined)} onSave={saveRoute} busy={saving}/>}
    <div className="toast-container" role="status" aria-live="polite">{toasts.map(t=><div key={t.id} className={`toast toast-${t.tone}`}><span>{t.tone==='error'?<CircleAlert size={17}/>:<CheckCircle2 size={17}/>}</span><p>{t.message}</p><button onClick={()=>setToasts(current=>current.filter(x=>x.id!==t.id))} aria-label="Dismiss notification"><X size={15}/></button></div>)}</div>
  </div>;
}
export default App;
