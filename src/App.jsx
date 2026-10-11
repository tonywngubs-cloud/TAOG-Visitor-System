import { useEffect, useState } from 'react'
import './App.css'

const navigation = [
{ label: 'Dashboard', icon: '▦' },
{ label: 'Register Visitor', icon: '＋' },
{ label: 'Visitor Directory', icon: '♙' },
{ label: 'Follow-ups', icon: '♡' },
{ label: 'Reports', icon: '▤' },
{ label: 'Settings', icon: '⚙' },
]

const initialVisitorForm = {
name: '',
phone: '',
email: '',
visitType: 'First-time visitor',
visitReason: 'Sunday service',
ministry: 'Prayer ministry',
followUp: true,
notes: '',
}

const initialSettings = {
welcomeEmail: true,
followUpAlerts: true,
weeklyDigest: false,
roleBasedAccess: true,
}

const normalizeVisitor = (visitor) => {
const initials = visitor.initials || (visitor.name
? visitor.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
: 'VS')

return {
...visitor,
initials,
name: visitor.name || 'Unnamed visitor',
phone: visitor.phone || 'No phone number',
type: visitor.type || 'First-time visitor',
date: visitor.date || 'Today',
status: visitor.status || 'Follow-up needed',
color: visitor.color || 'blue',
}
}

const buildWeeklyData = (items) => {
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const total = items.length || 1
const firstTotal = items.filter((item) => item.type === 'First-time visitor').length
const returningTotal = items.filter((item) => item.type === 'Returning visitor').length

return dayNames.map((day, index) => {
const baseFirst = Math.max(2, Math.round((firstTotal / total) * (8 + index)))
const baseReturning = Math.max(2, Math.round((returningTotal / total) * (6 + index)))

return {
  day,
  first: Math.min(18, baseFirst),
  returning: Math.min(16, baseReturning),
}
})
}

function App() {
const [activePage, setActivePage] = useState('Dashboard')
const [visitorForm, setVisitorForm] = useState(initialVisitorForm)
const [formSaved, setFormSaved] = useState(false)
const [directoryQuery, setDirectoryQuery] = useState('')
const [visitorFilter, setVisitorFilter] = useState('All visitors')
const [visitors, setVisitors] = useState([])
const [followUps, setFollowUps] = useState([])
const [reportRange, setReportRange] = useState('This month')
const [settings, setSettings] = useState(initialSettings)
const [authLoading, setAuthLoading] = useState(true)
const [authError, setAuthError] = useState('')
const [setupRequired, setSetupRequired] = useState(false)
const [setupAvailable, setSetupAvailable] = useState(true)
const [setupTokenRequired, setSetupTokenRequired] = useState(false)
const [authMode, setAuthMode] = useState('login')
const [dataError, setDataError] = useState('')
const [loginEmail, setLoginEmail] = useState('')
const [loginPassword, setLoginPassword] = useState('')
const [loginError, setLoginError] = useState('')
const [setupToken, setSetupToken] = useState('')
const [authConfirmPassword, setAuthConfirmPassword] = useState('')
const [staffEmail, setStaffEmail] = useState('')
const [staffPassword, setStaffPassword] = useState('')
const [staffConfirmPassword, setStaffConfirmPassword] = useState('')
const [staffError, setStaffError] = useState('')
const [staffSuccess, setStaffSuccess] = useState('')
const [staffSaving, setStaffSaving] = useState(false)
const [formError, setFormError] = useState('')
const [user, setUser] = useState(null)

const weeklyData = buildWeeklyData(visitors)
const totalVisitors = visitors.length
const firstTimeVisitors = visitors.filter((item) => item.type === 'First-time visitor').length
const returningVisitors = visitors.filter((item) => item.type === 'Returning visitor').length
const pendingFollowUps = followUps.filter((task) => task.status !== 'Completed').length

const handleNavigation = (page) => {
setActivePage(page)
setFormSaved(false)
}

const handleFormChange = (event) => {
const { name, value, type, checked } = event.target

setVisitorForm((currentForm) => ({
...currentForm,
[name]: type === 'checkbox' ? checked : value,
}))

if (formSaved) {
setFormSaved(false)
}
}

const handleFormSubmit = async (event) => {
event.preventDefault()
setFormError('')

try {
  const response = await fetch('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(visitorForm),
  })

  if (!response.ok) {
    const error = await response.json()
    if (response.status === 401) setUser(null)
    throw new Error(error.error || 'Visitor registration failed')
  }

  const data = await response.json()
  setVisitors((current) => [normalizeVisitor(data.visitor), ...current])
  setVisitorForm(initialVisitorForm)
  setFormSaved(true)

  const followUpResponse = await fetch('/api/followups')
  if (followUpResponse.ok) {
    const followUpData = await followUpResponse.json()
    setFollowUps(followUpData.followUps || [])
  }
} catch (error) {
  console.error(error)
  setFormError(error.message)
  setFormSaved(false)
}
}

const fetchVisitorsAndTasks = async () => {
try {
  const [visitorsResponse, followUpsResponse] = await Promise.all([
    fetch('/api/visitors'),
    fetch('/api/followups'),
  ])

  if (visitorsResponse.status === 401 || followUpsResponse.status === 401) {
    setUser(null)
    return
  }
  if (!visitorsResponse.ok || !followUpsResponse.ok) {
    throw new Error('Failed to load data from the server')
  }

  const visitorsData = await visitorsResponse.json()
  const followUpsData = await followUpsResponse.json()

  setVisitors((visitorsData.visitors || []).map(normalizeVisitor))
  setFollowUps(followUpsData.followUps || [])
  setDataError('')
} catch (error) {
  console.error(error)
  setVisitors([])
  setFollowUps([])
  setDataError('Unable to load visitor data. Refresh the page to try again.')
}
}

useEffect(() => {
  const loadSession = async () => {
    try {
      const [sessionResponse, setupResponse] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/auth/setup-status'),
      ])
      if (!sessionResponse.ok || !setupResponse.ok) throw new Error('Unable to check your sign-in status.')
      const [sessionData, setupData] = await Promise.all([sessionResponse.json(), setupResponse.json()])
      setUser(sessionData.user)
      setSetupRequired(setupData.setupRequired)
      setSetupAvailable(setupData.setupAvailable)
      setSetupTokenRequired(setupData.setupTokenRequired)
      if (!sessionData.user && setupData.setupRequired) setAuthMode('setup')
      if (sessionData.user) await fetchVisitorsAndTasks()
    } catch (error) {
      console.error(error)
      setAuthError('Unable to connect to the server. Please refresh and try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  loadSession()
}, [])

const handleInitialSetup = async (event) => {
  event.preventDefault()
  setLoginError('')
  if (loginPassword !== authConfirmPassword) {
    setLoginError('Passwords do not match.')
    return
  }

  try {
    const response = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail,
        password: loginPassword,
        setupToken,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to create the administrator account.')
    setUser(data.user)
    setLoginPassword('')
    setAuthConfirmPassword('')
    setSetupToken('')
    setSetupRequired(false)
    await fetchVisitorsAndTasks()
  } catch (error) {
    console.error(error)
    setLoginError(error.message)
  }
}

const handleLogin = async (event) => {
  event.preventDefault()
  setLoginError('')
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.')
    setUser(data.user)
    setLoginPassword('')
    setAuthError('')
    setSetupRequired(false)
    await fetchVisitorsAndTasks()
  } catch (error) {
    console.error(error)
    setLoginError(error.message)
  }
}

const handleCreateStaff = async (event) => {
  event.preventDefault()
  setStaffError('')
  setStaffSuccess('')
  if (staffPassword !== staffConfirmPassword) {
    setStaffError('Passwords do not match.')
    return
  }

  setStaffSaving(true)
  try {
    const response = await fetch('/api/auth/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, password: staffPassword }),
    })
    const data = await response.json()
    if (response.status === 401) setUser(null)
    if (!response.ok) throw new Error(data.error || 'Unable to create staff account.')
    setStaffEmail('')
    setStaffPassword('')
    setStaffConfirmPassword('')
    setStaffSuccess(`Staff account created for ${data.staff.email}.`)
  } catch (error) {
    console.error(error)
    setStaffError(error.message)
  } finally {
    setStaffSaving(false)
  }
}

const handleLogout = async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('Unable to sign out.')
    setUser(null)
    setVisitors([])
    setFollowUps([])
  } catch (error) {
    console.error(error)
    setAuthError('Unable to sign out. Please try again.')
  }
}

const filteredDirectory = visitors.filter((entry) => {
const matchesSearch = `${entry.name} ${entry.phone}`.toLowerCase().includes(directoryQuery.toLowerCase())
const matchesType = visitorFilter === 'All visitors' || entry.type === visitorFilter
return matchesSearch && matchesType
})

const toggleFollowUpStatus = async (id) => {
try {
  const response = await fetch(`/api/followups/${id}`, {
    method: 'PATCH',
  })

  if (!response.ok) {
    if (response.status === 401) setUser(null)
    throw new Error('Unable to update follow-up status')
  }

  const data = await response.json()
  setFollowUps((current) =>
    current.map((task) =>
      task.id === id
        ? { ...task, status: data.status }
        : task,
    ),
  )
} catch (error) {
  console.error(error)
}
}

const toggleSetting = (key) => {
setSettings((current) => ({
...current,
[key]: !current[key],
}))
}

const reportRows = [
{ label: 'Sunday service', visitors: Math.max(0, Math.round((visitors.length || 0) * 0.36)), first: Math.max(0, Math.round((firstTimeVisitors || 0) * 0.45)), returning: Math.max(0, Math.round((returningVisitors || 0) * 0.40)), conversion: `${Math.min(99, Math.max(35, Math.round(((returningVisitors || 0) / Math.max(1, visitors.length)) * 100)))}%` },
{ label: 'Prayer gathering', visitors: Math.max(0, Math.round((visitors.length || 0) * 0.18)), first: Math.max(0, Math.round((firstTimeVisitors || 0) * 0.22)), returning: Math.max(0, Math.round((returningVisitors || 0) * 0.18)), conversion: `${Math.min(95, Math.max(25, Math.round(((returningVisitors || 0) / Math.max(1, visitors.length)) * 80)))}%` },
{ label: 'Youth event', visitors: Math.max(0, Math.round((visitors.length || 0) * 0.22)), first: Math.max(0, Math.round((firstTimeVisitors || 0) * 0.28)), returning: Math.max(0, Math.round((returningVisitors || 0) * 0.24)), conversion: `${Math.min(96, Math.max(20, Math.round(((returningVisitors || 0) / Math.max(1, visitors.length)) * 70)))}%` },
{ label: 'Community outreach', visitors: Math.max(0, Math.round((visitors.length || 0) * 0.12)), first: Math.max(0, Math.round((firstTimeVisitors || 0) * 0.15)), returning: Math.max(0, Math.round((returningVisitors || 0) * 0.12)), conversion: `${Math.min(90, Math.max(18, Math.round(((returningVisitors || 0) / Math.max(1, visitors.length)) * 60)))}%` },
]

if (authLoading) {
  return <div className="auth-screen"><p>Checking staff sign-in…</p></div>
}

if (!user) {
  const isSetup = setupRequired || authMode === 'setup'
  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={isSetup ? handleInitialSetup : handleLogin}>
        <div className="brand-mark auth-brand">T</div>
        <div className="eyebrow">TAOG VISITOR SYSTEM</div>
        <h1>{isSetup ? 'Set up administrator' : 'Staff sign in'}</h1>
        <p>{isSetup
          ? 'Create the first administrator account. You can add staff from Settings after signing in.'
          : 'Sign in with your church staff account to manage visitor records.'}</p>
        {authError && <div className="auth-error" role="alert">{authError}</div>}
        {loginError && <div className="auth-error" role="alert">{loginError}</div>}
        {isSetup && !setupAvailable && (
          <div className="auth-error" role="alert">
            Initial setup is not configured. Ask your system administrator to set INITIAL_SETUP_TOKEN.
          </div>
        )}
        {isSetup && setupTokenRequired && setupAvailable && (
          <label className="field">
            <span>Initial setup token</span>
            <input
              autoComplete="off"
              type="password"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              required
            />
          </label>
        )}
        <label className="field">
          <span>Email address</span>
          <input
            autoComplete={isSetup ? 'email' : 'username'}
            type="email"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            minLength={isSetup ? 12 : undefined}
            required
          />
        </label>
        {isSetup && setupAvailable && (
          <label className="field">
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              type="password"
              value={authConfirmPassword}
              onChange={(event) => setAuthConfirmPassword(event.target.value)}
              minLength={12}
              required
            />
          </label>
        )}
        <button className="primary-button auth-submit" type="submit" disabled={isSetup && !setupAvailable}>
          {isSetup ? 'Create administrator account' : 'Sign in'}
        </button>
        {isSetup ? (
          <p className="auth-switch">First staff account setup is available only once.</p>
        ) : setupRequired ? (
          <button className="text-button auth-mode-button" type="button" onClick={() => { setAuthMode('setup'); setLoginError('') }}>
            Create the first administrator account
          </button>
        ) : (
          <p className="auth-switch">Staff accounts are created by your administrator.</p>
        )}
      </form>
    </main>
  )
}

return ( <div className="app-shell"> <aside className="sidebar"> <div className="brand"> <div className="brand-mark">T</div> <div className="brand-copy"> <strong>TAOG</strong> <span>VISITOR SYSTEM</span> </div> </div>

```
    <div className="sidebar-label">WORKSPACE</div>

    <nav className="sidebar-nav" aria-label="Main navigation">
      {navigation.map((item) => (
        <button
          className={`nav-item ${activePage === item.label ? 'active' : ''}`}
          key={item.label}
          onClick={() => handleNavigation(item.label)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
          {(item.label === 'Follow-ups' && pendingFollowUps > 0) ? <span className="nav-badge">{pendingFollowUps}</span> : item.badge && <span className="nav-badge">{item.badge}</span>}
        </button>
      ))}
    </nav>

    <div className="sidebar-bottom">
      <div className="help-card">
        <div className="help-icon">✦</div>
        <strong>Here to help</strong>
        <p>Keep every welcome personal and every connection meaningful.</p>
      </div>
      <div className="profile">
        <div className="profile-avatar">TA</div>
        <div className="profile-copy">
          <strong>{user.email}</strong>
          <span>{user.role === 'admin' ? 'Administrator' : 'Staff'}</span>
        </div>
        <span className="profile-menu">●</span>
      </div>
    </div>
  </aside>

  <main className="main-content">
    <header className="topbar">
      <div className="breadcrumb">
        <span>Workspace</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{activePage}</strong>
      </div>
      <div className="topbar-right">
        <span className="today-label">TAOG Community</span>
        <button className="secondary-button sign-out-button" type="button" onClick={handleLogout}>Sign out</button>
      </div>
    </header>

    <div className="page-content">
      {authError && <div className="auth-error" role="alert">{authError}</div>}
      {dataError && <div className="auth-error" role="alert">{dataError}</div>}
      <section className="welcome-row">
        <div>
          <div className="eyebrow">YOUR COMMUNITY, CONNECTED</div>
          <h1>{activePage === 'Dashboard' ? 'Welcome back, Admin' : activePage}</h1>
          <p className="page-subtitle">
            {activePage === 'Dashboard'
              ? 'Here’s what’s happening with your visitors today.'
              : `Manage your church visitors and keep every connection meaningful.`}
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => setActivePage('Register Visitor')}
        >
          <span>＋</span> Register visitor
        </button>
      </section>

      {activePage === 'Dashboard' ? (
        <>
          <section className="stats-grid" aria-label="Visitor statistics">
            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Total visitors</span>
                <span className="stat-icon navy-icon">♙</span>
              </div>
              <div className="stat-value">{totalVisitors}</div>
              <div className="stat-foot">
                <span className="trend">↗ {Math.max(0, Math.min(99, totalVisitors))}%</span>
                <span>live records</span>
              </div>
              <div className="stat-accent navy-accent" />
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">First-time visitors</span>
                <span className="stat-icon gold-icon">✦</span>
              </div>
              <div className="stat-value">{firstTimeVisitors}</div>
              <div className="stat-foot">
                <span className="trend">↗ {Math.max(0, Math.min(30, firstTimeVisitors * 2))}%</span>
                <span>new this cycle</span>
              </div>
              <div className="stat-accent gold-accent" />
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Returning visitors</span>
                <span className="stat-icon blue-icon">↻</span>
              </div>
              <div className="stat-value">{returningVisitors}</div>
              <div className="stat-foot">
                <span className="trend">↗ {Math.max(0, Math.min(30, returningVisitors))}%</span>
                <span>repeat visits</span>
              </div>
              <div className="stat-accent blue-accent" />
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-label">Follow-ups pending</span>
                <span className="stat-icon rose-icon">♡</span>
              </div>
              <div className="stat-value">{pendingFollowUps}</div>
              <div className="stat-foot">
                <span className="pending-note">Needs attention</span>
                <span>open requests</span>
              </div>
              <div className="stat-accent rose-accent" />
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Visitor activity</h2>
                  <p>Visitor registrations throughout the week</p>
                </div>
                <button className="select-button" onClick={() => alert('Weekly view selected')}>
                  This week <span>⌄</span>
                </button>
              </div>

              <div className="chart-legend">
                <span><i className="legend-dot first-dot" /> First-time</span>
                <span><i className="legend-dot returning-dot" /> Returning</span>
              </div>

              <div className="bar-chart">
                <div className="chart-y-labels">
                  <span>30</span><span>20</span><span>10</span><span>0</span>
                </div>
                <div className="chart-plot">
                  <div className="chart-grid-lines">
                    <span /><span /><span /><span />
                  </div>
                  <div className="bar-groups">
                    {weeklyData.map((item) => (
                      <div className="bar-group" key={item.day}>
                        <div className="bar-pair">
                          <div
                            className="bar first-bar"
                            style={{ height: `${(item.first / 30) * 100}%` }}
                            title={`${item.first} first-time visitors`}
                          />
                          <div
                            className="bar returning-bar"
                            style={{ height: `${(item.returning / 30) * 100}%` }}
                            title={`${item.returning} returning visitors`}
                          />
                        </div>
                        <span className="bar-day">{item.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="panel followup-panel">
              <div className="panel-heading">
                <div>
                  <h2>Follow-up overview</h2>
                  <p>Make every visitor feel remembered</p>
                </div>
                <span className="round-icon">♡</span>
              </div>

              <div className="followup-total">
                <strong>{pendingFollowUps}</strong>
                <span>requests to follow up</span>
              </div>

              <div className="followup-progress">
                <div className="progress-track">
                  <span />
                </div>
                <div className="progress-labels">
                  <span>4 completed this week</span>
                  <strong>33%</strong>
                </div>
              </div>

              <div className="followup-divider" />

              <div className="followup-row">
                <span className="followup-dot urgent-dot" />
                <div><strong>Prayer requests</strong><span>Personal support needed</span></div>
                <b>{Math.max(0, pendingFollowUps)}</b>
              </div>
              <div className="followup-row">
                <span className="followup-dot welcome-dot" />
                <div><strong>Welcome calls</strong><span>First-time visitors</span></div>
                <b>{Math.max(0, firstTimeVisitors)}</b>
              </div>
              <div className="followup-row">
                <span className="followup-dot connect-dot" />
                <div><strong>Connect with a ministry</strong><span>Finding a community</span></div>
                <b>{Math.max(0, Math.min(9, returningVisitors))}</b>
              </div>

              <button className="text-button" onClick={() => setActivePage('Follow-ups')}>
                View all follow-ups <span>→</span>
              </button>
            </article>
          </section>

          <section className="panel visitors-panel">
            <div className="panel-heading visitors-heading">
              <div>
                <h2>Recent visitors</h2>
                <p>Your latest community connections</p>
              </div>
              <button className="text-button" onClick={() => setActivePage('Visitor Directory')}>
                View directory <span>→</span>
              </button>
            </div>

            <div className="table-wrap">
              <table className="visitor-table">
                <thead>
                  <tr>
                    <th>VISITOR</th>
                    <th>VISITOR TYPE</th>
                    <th>DATE REGISTERED</th>
                    <th>FOLLOW-UP STATUS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((visitor) => (
                    <tr key={visitor.name}>
                      <td>
                        <div className="visitor-identity">
                          <span className={`visitor-avatar ${visitor.color}`}>{visitor.initials}</span>
                          <strong>{visitor.name}</strong>
                        </div>
                      </td>
                      <td><span className="visitor-type">{visitor.type}</span></td>
                      <td><span className="date-cell">{visitor.date}</span></td>
                      <td>
                        <span className={`status-pill ${visitor.status === 'Follow-up needed' ? 'status-pending' : visitor.status === 'Contacted' ? 'status-contacted' : 'status-welcomed'}`}>
                          <i />{visitor.status}
                        </span>
                      </td>
                      <td><button className="row-menu" aria-label={`More options for ${visitor.name}`}>···</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="page-footer">
            <span>TAOG Visitor System <span className="footer-separator">·</span> Building a welcoming community</span>
            <span>Live data <span className="footer-dot" /> Connected to API</span>
          </footer>
        </>
      ) : activePage === 'Register Visitor' ? (
        <section className="registration-shell">
          <div className="registration-panel panel">
            <div className="panel-heading visitors-heading">
              <div>
                <h2>Register a visitor</h2>
                <p>Capture visitor details and prepare a thoughtful follow-up.</p>
              </div>
              <button className="text-button" onClick={() => setActivePage('Dashboard')}>
                Back to dashboard <span>→</span>
              </button>
            </div>

            <form className="registration-form" onSubmit={handleFormSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Visitor name</span>
                  <input
                    type="text"
                    name="name"
                    value={visitorForm.name}
                    onChange={handleFormChange}
                    placeholder="Enter full name"
                    required
                  />
                </label>

                <label className="field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    name="phone"
                    value={visitorForm.phone}
                    onChange={handleFormChange}
                    placeholder="e.g. +27 71 234 5678"
                    required
                  />
                </label>

                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    name="email"
                    value={visitorForm.email}
                    onChange={handleFormChange}
                    placeholder="name@example.com"
                  />
                </label>

                <label className="field">
                  <span>Visit type</span>
                  <select name="visitType" value={visitorForm.visitType} onChange={handleFormChange}>
                    <option>First-time visitor</option>
                    <option>Returning visitor</option>
                    <option>Group visit</option>
                  </select>
                </label>

                <label className="field">
                  <span>Reason for visit</span>
                  <select name="visitReason" value={visitorForm.visitReason} onChange={handleFormChange}>
                    <option>Sunday service</option>
                    <option>Prayer support</option>
                    <option>Community outreach</option>
                    <option>School or youth event</option>
                    <option>General enquiry</option>
                  </select>
                </label>

                <label className="field">
                  <span>Area of interest</span>
                  <select name="ministry" value={visitorForm.ministry} onChange={handleFormChange}>
                    <option>Prayer ministry</option>
                    <option>Children&apos;s ministry</option>
                    <option>Youth ministry</option>
                    <option>Women&apos;s fellowship</option>
                    <option>Men&apos;s fellowship</option>
                    <option>Small groups</option>
                  </select>
                </label>

                <label className="field field-full">
                  <span>Notes</span>
                  <textarea
                    name="notes"
                    value={visitorForm.notes}
                    onChange={handleFormChange}
                    rows="4"
                    placeholder="Add any important details, prayer requests, or connection notes..."
                  />
                </label>
              </div>

              <div className="form-footer">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="followUp"
                    checked={visitorForm.followUp}
                    onChange={handleFormChange}
                  />
                  <span>Schedule a follow-up</span>
                </label>

                <button className="primary-button" type="submit">
                  <span>＋</span> Save visitor
                </button>
              </div>

              {formSaved && (
                <div className="success-banner" role="status">
                  Visitor registered successfully. A follow-up task has been prepared for the team.
                </div>
              )}
              {formError && <div className="auth-error" role="alert">{formError}</div>}
            </form>
          </div>

          <aside className="registration-side panel">
            <div className="mini-stat">
              <span className="mini-label">Today&apos;s check-ins</span>
              <strong>{totalVisitors}</strong>
            </div>
            <div className="mini-stat accent">
              <span className="mini-label">Follow-ups due</span>
              <strong>{pendingFollowUps}</strong>
            </div>
            <div className="quick-note">
              <h3>Welcome reminder</h3>
              <p>Keep each visitor feeling known by greeting them personally, inviting them to a ministry, and recording any prayer needs.</p>
            </div>
          </aside>
        </section>
      ) : activePage === 'Visitor Directory' ? (
        <section className="directory-shell">
          <div className="panel directory-panel">
            <div className="panel-heading visitors-heading">
              <div>
                <h2>Visitor directory</h2>
                <p>Track visitors and reconnect with new and returning guests.</p>
              </div>
              <button className="primary-button small-button" onClick={() => setActivePage('Register Visitor')}>
                <span>＋</span> Add visitor
              </button>
            </div>

            <div className="directory-toolbar">
              <label className="search-box" aria-label="Search visitors">
                <span>⌕</span>
                <input
                  type="text"
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder="Search visitor or phone number"
                />
              </label>

              <label className="filter-box">
                <span>Filter</span>
                <select value={visitorFilter} onChange={(event) => setVisitorFilter(event.target.value)}>
                  <option>All visitors</option>
                  <option>First-time visitor</option>
                  <option>Returning visitor</option>
                </select>
              </label>
            </div>

            <div className="directory-summary">
              <div className="summary-card">
                <span>Total records</span>
                <strong>{visitors.length}</strong>
              </div>
              <div className="summary-card">
                <span>New this week</span>
                <strong>{firstTimeVisitors}</strong>
              </div>
              <div className="summary-card">
                <span>Returning</span>
                <strong>{returningVisitors}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table className="visitor-table directory-table">
                <thead>
                  <tr>
                    <th>VISITOR</th>
                    <th>CONTACT</th>
                    <th>TYPE</th>
                    <th>LAST VISIT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDirectory.map((visitor) => (
                    <tr key={visitor.id}>
                      <td>
                        <div className="visitor-identity">
                          <span className={`visitor-avatar ${visitor.color}`}>{visitor.initials}</span>
                          <strong>{visitor.name}</strong>
                        </div>
                      </td>
                      <td><span className="date-cell">{visitor.phone}</span></td>
                      <td><span className="visitor-type">{visitor.type}</span></td>
                      <td><span className="date-cell">{visitor.lastVisit || visitor.date}</span></td>
                      <td>
                        <span className={`status-pill ${visitor.status === 'Follow-up needed' ? 'status-pending' : visitor.status === 'Contacted' ? 'status-contacted' : 'status-welcomed'}`}>
                          <i />{visitor.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredDirectory.length === 0 && (
              <div className="empty-state">
                No visitors matched your search. Try a different name or filter.
              </div>
            )}
          </div>
        </section>
      ) : activePage === 'Follow-ups' ? (
        <section className="followup-shell">
          <div className="panel followup-panel full-width-panel">
            <div className="panel-heading visitors-heading">
              <div>
                <h2>Follow-ups</h2>
                <p>Ensure every guest receives a warm and timely response.</p>
              </div>
              <button className="text-button" onClick={() => setActivePage('Dashboard')}>
                Return to dashboard <span>→</span>
              </button>
            </div>

            <div className="followup-metrics">
              <div className="mini-stat">
                <span className="mini-label">Pending tasks</span>
                <strong>{pendingFollowUps}</strong>
              </div>
              <div className="mini-stat accent">
                <span className="mini-label">Completed</span>
                <strong>{followUps.filter((task) => task.status === 'Completed').length}</strong>
              </div>
            </div>

            <div className="followup-list">
              {followUps.map((task) => (
                <div className={`followup-item ${task.status === 'Completed' ? 'completed' : ''}`} key={task.id}>
                  <div className="task-main">
                    <div className={`task-priority ${task.priority.toLowerCase()}`}>{task.priority}</div>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.person}</p>
                    </div>
                  </div>

                  <div className="task-meta">
                    <span><strong>Owner:</strong> {task.owner}</span>
                    <span><strong>Due:</strong> {task.due}</span>
                    <span className={`status-pill ${task.status === 'Completed' ? 'status-welcomed' : task.status === 'In progress' ? 'status-contacted' : 'status-pending'}`}>
                      <i />{task.status}
                    </span>
                  </div>

                  <button className="secondary-button" type="button" onClick={() => toggleFollowUpStatus(task.id)}>
                    {task.status === 'Completed' ? 'Mark pending' : 'Mark complete'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : activePage === 'Reports' ? (
        <section className="report-shell">
          <div className="panel report-panel">
            <div className="panel-heading visitors-heading">
              <div>
                <h2>Reports</h2>
                <p>Insights from your recent guest activity and ministry engagement.</p>
              </div>
              <label className="filter-box report-filter">
                <span>Range</span>
                <select value={reportRange} onChange={(event) => setReportRange(event.target.value)}>
                  <option>This month</option>
                  <option>Last 3 months</option>
                  <option>This year</option>
                </select>
              </label>
            </div>

            <div className="report-grid">
              <article className="report-kpi navy">
                <span>Total visits</span>
                <strong>{totalVisitors}</strong>
                <em>{reportRange}</em>
              </article>
              <article className="report-kpi gold">
                <span>First-time guests</span>
                <strong>{firstTimeVisitors}</strong>
                <em>{Math.max(0, firstTimeVisitors)} new records</em>
              </article>
              <article className="report-kpi slate">
                <span>Returning guests</span>
                <strong>{returningVisitors}</strong>
                <em>{Math.max(0, returningVisitors)} repeat visits</em>
              </article>
              <article className="report-kpi rose">
                <span>Follow-ups</span>
                <strong>{pendingFollowUps}</strong>
                <em>{followUps.filter((task) => task.status === 'Completed').length} completed</em>
              </article>
            </div>

            <div className="report-table-wrap">
              <table className="visitor-table report-table">
                <thead>
                  <tr>
                    <th>SECTION</th>
                    <th>VISITORS</th>
                    <th>FIRST-TIME</th>
                    <th>RETURNING</th>
                    <th>CONVERSION</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.label}>
                      <td><strong className="report-label">{row.label}</strong></td>
                      <td>{row.visitors}</td>
                      <td>{row.first}</td>
                      <td>{row.returning}</td>
                      <td><span className="report-pill">{row.conversion}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : activePage === 'Settings' ? (
        <section className="settings-shell">
          <div className="settings-grid">
            <div className="panel settings-panel">
              <div className="panel-heading visitors-heading">
                <div>
                  <h2>System settings</h2>
                  <p>Adjust the experience for your church admin team.</p>
                </div>
              </div>

              <div className="settings-list">
                {user.role === 'admin' && (
                  <section className="staff-registration">
                    <div className="panel-heading">
                      <div>
                        <h2>Register staff</h2>
                        <p>Create a staff sign-in. The password is securely hashed and stored on the server.</p>
                      </div>
                    </div>
                    <form className="staff-registration-form" onSubmit={handleCreateStaff}>
                      <label className="field">
                        <span>Staff email</span>
                        <input
                          autoComplete="email"
                          type="email"
                          value={staffEmail}
                          onChange={(event) => setStaffEmail(event.target.value)}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Temporary password</span>
                        <input
                          autoComplete="new-password"
                          type="password"
                          value={staffPassword}
                          onChange={(event) => setStaffPassword(event.target.value)}
                          minLength={12}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Confirm password</span>
                        <input
                          autoComplete="new-password"
                          type="password"
                          value={staffConfirmPassword}
                          onChange={(event) => setStaffConfirmPassword(event.target.value)}
                          minLength={12}
                          required
                        />
                      </label>
                      {staffError && <div className="auth-error" role="alert">{staffError}</div>}
                      {staffSuccess && <div className="success-banner" role="status">{staffSuccess}</div>}
                      <button className="primary-button" type="submit" disabled={staffSaving}>
                        {staffSaving ? 'Creating account…' : 'Create staff account'}
                      </button>
                    </form>
                  </section>
                )}
                <div className="setting-row">
                  <div>
                    <strong>Welcome email automation</strong>
                    <span>Send a warm thank-you note to first-time guests.</span>
                  </div>
                  <button className={`toggle ${settings.welcomeEmail ? 'on' : ''}`} type="button" onClick={() => toggleSetting('welcomeEmail')}>
                    <span />
                  </button>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Follow-up reminders</strong>
                    <span>Notify staff when a guest needs a personal response.</span>
                  </div>
                  <button className={`toggle ${settings.followUpAlerts ? 'on' : ''}`} type="button" onClick={() => toggleSetting('followUpAlerts')}>
                    <span />
                  </button>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Weekly digest</strong>
                    <span>Send a summary of attendance and ministries every Friday.</span>
                  </div>
                  <button className={`toggle ${settings.weeklyDigest ? 'on' : ''}`} type="button" onClick={() => toggleSetting('weeklyDigest')}>
                    <span />
                  </button>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Role-based access</strong>
                    <span>Limit admin actions by user permission level.</span>
                  </div>
                  <button className={`toggle ${settings.roleBasedAccess ? 'on' : ''}`} type="button" onClick={() => toggleSetting('roleBasedAccess')}>
                    <span />
                  </button>
                </div>
              </div>
            </div>

            <aside className="panel settings-side">
              <h3>Church profile</h3>
              <div className="profile-card">
                <div className="profile-card-top">
                  <div className="brand-mark small-brand">T</div>
                  <div>
                    <strong>TAOG Community</strong>
                    <span>Visitor management</span>
                  </div>
                </div>
                <ul>
                  <li>Location: Johannesburg</li>
                  <li>Admin team: 4 members</li>
                  <li>Data sync: local workspace</li>
                </ul>
              </div>

              <button className="primary-button full-width-button" type="button">
                Save changes
              </button>
            </aside>
          </div>
        </section>
      ) : (
        <section className="panel placeholder-panel">
          <div className="placeholder-icon">
            {navigation.find((item) => item.label === activePage)?.icon || '✦'}
          </div>
          <h2>{activePage}</h2>
          <p>This section is ready for the next development step.</p>
          <button className="primary-button" onClick={() => setActivePage('Dashboard')}>← Back to dashboard</button>
        </section>
      )}
    </div>
  </main>
</div>
)
}

export default App
