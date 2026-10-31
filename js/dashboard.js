export function renderDashboard(user) {
 return `<div class="welcome-row"><div><span class="eyebrow">LET'S CREATE SOMETHING</span><h1>Welcome back, ${escapeHtml(user?.displayName || "Creator")} ✨</h1><p class="muted">Your next great clip starts here.</p></div><button class="btn primary" data-go="studio">＋ New project</button></div>
 <div class="grid stats-grid"><div class="card"><div class="stat-label">Projects</div><div class="stat-value" id="stat-projects">0</div><div class="stat-foot">Local prototype</div></div><div class="card"><div class="stat-label">Clips created</div><div class="stat-value">—</div><div class="stat-foot">Coming with export engine</div></div><div class="card"><div class="stat-label">Minutes processed</div><div class="stat-value">—</div><div class="stat-foot">Not connected yet</div></div><div class="card"><div class="stat-label">Publishing</div><div class="stat-value">Ready</div><div class="stat-foot">Meta integration pending</div></div></div>
 <div class="section-head"><h3>Creative tools</h3><span class="tiny muted">QUICK ACCESS</span></div><div class="grid quick-grid">
 <div class="card quick-card" data-go="studio"><div class="quick-icon">◈</div><b>Find viral moments</b><p>Upload a video and prepare clip candidates.</p></div>
 <div class="card quick-card" data-go="captions"><div class="quick-icon">≋</div><b>Caption studio</b><p>Write and style subtitles for your clips.</p></div>
 <div class="card quick-card" data-go="ideas"><div class="quick-icon">✧</div><b>AI content lab</b><p>Draft hooks, titles, descriptions and hashtags.</p></div></div>
 <div class="section-head"><h3>Recent activity</h3></div><div class="card"><p class="muted" style="font-size:12px">No projects yet. Start by uploading a video in Clip studio.</p></div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
