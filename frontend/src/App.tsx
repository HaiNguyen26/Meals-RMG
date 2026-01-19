import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import './App.css'
import logo from '../LogoRMG.png'
import {
    API_BASE,
    clearDepartmentLunch,
    fetchAuditHistory,
    fetchDepartmentHistory,
    fetchDepartmentLunch,
    fetchLock,
    fetchSummary,
    login,
    setDepartmentLunch,
    setLock,
    type DepartmentLunch,
    type Summary,
} from './api'

type AuthState = {
    accessToken: string
    refreshToken: string
    user: {
        id: string
        email: string
        role: string
        name: string
        department: string
    }
}

type AuditRow = DepartmentLunch & { previousQuantity: number | null }

const STORAGE_KEY = 'meal-auth'
const APP_BASE = import.meta.env.BASE_URL
const getTargetDate = (now: Date) => {
  const target = new Date(now)
  if (now.getHours() >= 12) {
    target.setDate(target.getDate() + 1)
  }
  target.setHours(0, 0, 0, 0)
  return target
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const formatTime = (date: Date) =>
  date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const DEPARTMENTS = [
    'Warehouse',
    'Production',
    'Sales',
    'Purchasing',
    'Mechanical',
    'Design',
    'Automation',
    'Technical Services',
    'Service',
    'CNC',
    'HR',
]

const getRolePath = (role?: string | null) => {
    switch (role) {
        case 'manager':
            return '/manager'
        case 'admin':
            return '/admin'
        case 'kitchen':
            return '/kitchen'
        default:
            return '/login'
    }
}

const loadStoredAuth = (): AuthState | null => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
        return JSON.parse(raw) as AuthState
    } catch {
        return null
    }
}

const saveAuth = (auth: AuthState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

const clearAuth = () => {
    localStorage.removeItem(STORAGE_KEY)
}

function App() {
    const [auth, setAuth] = useState<AuthState | null>(() => loadStoredAuth())
    const [departmentLunch, setDepartmentLunchState] =
        useState<DepartmentLunch | null>(null)
    const [lockState, setLockState] = useState<{
        locked: boolean
        lockedBy: string | null
        lockedAt: string | null
    } | null>(null)
    const [summary, setSummary] = useState<Summary | null>(null)
    const [showToast, setShowToast] = useState(false)
    const [loginError, setLoginError] = useState<string | null>(null)
    const [loginForm, setLoginForm] = useState({
        username: '',
        password: '',
    })
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState<DepartmentLunch[]>([])
    const [audit, setAudit] = useState<DepartmentLunch[]>([])
    const [updatedDepartmentId, setUpdatedDepartmentId] = useState<string | null>(
        null,
    )
    const [lockToast, setLockToast] = useState(false)
    const [showLockConfirm, setShowLockConfirm] = useState(false)
    const [lockConfirmReady, setLockConfirmReady] = useState(false)
    const [now, setNow] = useState(new Date())
    const [syncPulse, setSyncPulse] = useState(false)
    const previousLocked = useRef<boolean | null>(null)

  const targetDate = useMemo(() => getTargetDate(now), [now])
  const date = useMemo(() => targetDate.toISOString().slice(0, 10), [targetDate])
  const dateLabel = useMemo(() => formatDate(targetDate), [targetDate])
  const lockCutoff = useMemo(() => {
    const cutoff = new Date(targetDate)
    cutoff.setHours(9, 0, 0, 0)
    return cutoff
  }, [targetDate])
  const lockWindowLabel = useMemo(
    () => `${formatTime(lockCutoff)}–12:00 • ${dateLabel}`,
    [lockCutoff, dateLabel],
  )
    const isLocked = lockState?.locked ?? false
    const role = auth?.user.role ?? null

    const canViewSummary = role === 'admin' || role === 'kitchen'
    const canEditDepartment = role === 'manager'
    const canLock = role === 'admin'

    const totalQuantity = useMemo(
        () => summary?.totalQuantity ?? 0,
        [summary],
    )
    const totalRegular = useMemo(() => {
        if (!summary) return 0
        return summary.departments.reduce(
            (sum, row) => sum + (row.regularQuantity ?? 0),
            0,
        )
    }, [summary])
    const totalVeg = useMemo(() => {
        if (!summary) return 0
        return summary.departments.reduce(
            (sum, row) => sum + (row.vegQuantity ?? 0),
            0,
        )
    }, [summary])

    const refreshData = useCallback(async () => {
        if (!auth) return
        const lock = await fetchLock(date, auth.accessToken)
        setLockState(lock)

        if (canViewSummary) {
            const summaryResponse = await fetchSummary(date, auth.accessToken)
            setSummary(summaryResponse)
            if (role === 'admin') {
                const auditRows = await fetchAuditHistory(auth.accessToken)
                setAudit(auditRows)
            }
        } else {
            setSummary(null)
            setAudit([])
        }

        if (canEditDepartment) {
            const department = await fetchDepartmentLunch(date, auth.accessToken)
            setDepartmentLunchState(department)
            const historyRows = await fetchDepartmentHistory(auth.accessToken, 5)
            setHistory(historyRows)
        } else {
            setDepartmentLunchState(null)
            setHistory([])
        }
    }, [auth, canViewSummary, date, role, canEditDepartment])

    useEffect(() => {
        if (!auth) return
        refreshData()
    }, [auth, refreshData])

    useEffect(() => {
        if (!auth) return
        const socket = io(`${API_BASE}/realtime`, {
            auth: {
                role: auth.user.role,
            },
        })
        socket.emit('joinDate', { date })
        socket.on('lunch:updated', (payload) => {
            if (payload?.type === 'department' && payload.department?.departmentId) {
                setUpdatedDepartmentId(payload.department.departmentId)
                window.setTimeout(() => setUpdatedDepartmentId(null), 500)
            }
            refreshData()
        })
        return () => {
            socket.disconnect()
        }
    }, [auth, date, refreshData])

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date())
        }, 1000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!auth) return
        const pulse = window.setInterval(() => {
            setSyncPulse(true)
            window.setTimeout(() => setSyncPulse(false), 400)
        }, 8000)
        return () => window.clearInterval(pulse)
    }, [auth])

    useEffect(() => {
        if (lockState?.locked === undefined) {
            return
        }
        if (previousLocked.current === false && lockState.locked) {
            setLockToast(true)
            window.setTimeout(() => setLockToast(false), 2000)
        }
        previousLocked.current = lockState.locked
    }, [lockState])

    useEffect(() => {
        if (showLockConfirm) {
            setLockConfirmReady(false)
        }
    }, [showLockConfirm])

    const handleSave = async () => {
        if (!auth || isLocked || !departmentLunch) return
        setLoading(true)
        try {
            await setDepartmentLunch(
                date,
                departmentLunch.regularQuantity,
                departmentLunch.vegQuantity,
                auth.accessToken,
            )
            setShowToast(true)
            window.setTimeout(() => setShowToast(false), 1800)
            await refreshData()
        } finally {
            setLoading(false)
        }
    }

    const handleLock = async () => {
        if (!auth || !canLock) return
        setLoading(true)
        try {
            await setLock(date, true, auth.accessToken)
            await refreshData()
            setLockToast(true)
            window.setTimeout(() => setLockToast(false), 2000)
        } finally {
            setLoading(false)
        }
    }

    const handleClearDepartment = async (departmentId: string) => {
        if (!auth || role !== 'admin') return
        setLoading(true)
        try {
            await clearDepartmentLunch(date, departmentId, auth.accessToken)
            await refreshData()
        } finally {
            setLoading(false)
        }
    }

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setLoginError(null)
        try {
            const result = await login(loginForm.username, loginForm.password)
            setAuth(result)
            saveAuth(result)
        } catch (error) {
            setLoginError(error instanceof Error ? error.message : 'Đăng nhập lỗi')
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = () => {
        clearAuth()
        setAuth(null)
        setSummary(null)
        setDepartmentLunchState(null)
        setLockState(null)
        setHistory([])
        setAudit([])
    }

    const registeredCount = useMemo(() => {
        if (!summary) return 0
        return summary.departments.filter((row) => row.updatedAt).length
    }, [summary])

    const totalRooms = DEPARTMENTS.length

    return (
        <BrowserRouter basename={APP_BASE}>
            <Routes>
                <Route
                    path="/login"
                    element={
                        <LoginPage
                            auth={auth}
                            loading={loading}
                            loginForm={loginForm}
                            loginError={loginError}
                            onSubmit={handleLogin}
                            setLoginForm={setLoginForm}
                        />
                    }
                />
                <Route
                    path="/manager"
                    element={
                        <RequireAuth auth={auth} role="manager">
                            <ManagerPage
                                auth={auth!}
                                isLocked={isLocked}
                                lockState={lockState}
                                departmentLunch={departmentLunch}
                                history={history}
                                loading={loading}
                                showToast={showToast}
                                canEditDepartment={canEditDepartment}
                                dateLabel={dateLabel}
                                lockTimeLabel={lockWindowLabel}
                                onSave={handleSave}
                                setDepartmentLunchState={setDepartmentLunchState}
                                onLogout={handleLogout}
                            />
                        </RequireAuth>
                    }
                />
                <Route
                    path="/admin"
                    element={
                        <RequireAuth auth={auth} role="admin">
                            <AdminPage
                                auth={auth!}
                                now={now}
                                isLocked={isLocked}
                                summary={summary}
                                audit={audit}
                                totalQuantity={totalQuantity}
                                totalRooms={totalRooms}
                                registeredCount={registeredCount}
                                updatedDepartmentId={updatedDepartmentId}
                                syncPulse={syncPulse}
                                showLockConfirm={showLockConfirm}
                                setShowLockConfirm={setShowLockConfirm}
                                onLock={handleLock}
                                onClearDepartment={handleClearDepartment}
                                dateLabel={dateLabel}
                                lockTimeLabel={lockWindowLabel}
                                onLogout={handleLogout}
                                loading={loading}
                            />
                        </RequireAuth>
                    }
                />
                <Route
                    path="/kitchen"
                    element={
                        <RequireAuth auth={auth} role="kitchen">
                            <KitchenPage
                                dateLabel={dateLabel}
                                now={now}
                                isLocked={isLocked}
                                auth={auth!}
                                summary={summary}
                                totalQuantity={totalQuantity}
                                totalRegular={totalRegular}
                                totalVeg={totalVeg}
                                updatedDepartmentId={updatedDepartmentId}
                                syncPulse={syncPulse}
                                onLogout={handleLogout}
                            />
                        </RequireAuth>
                    }
                />
                <Route path="*" element={<Navigate to={getRolePath(role)} replace />} />
            </Routes>

            {showToast && (
                <div className="toast toast--success">Đã lưu thành công</div>
            )}
            {lockToast && (
                <div className="toast toast--warn">Hệ thống đã khóa đăng ký</div>
            )}
            {showLockConfirm && (
                <div className="modal-backdrop">
                    <div className="modal-card">
                        <h3>Xác nhận khóa đăng ký</h3>
                        <p>Khóa đăng ký ngày {dateLabel}?</p>
                        <label className="modal-check">
                            <input
                                type="checkbox"
                                checked={lockConfirmReady}
                                onChange={(event) => setLockConfirmReady(event.target.checked)}
                            />
                            Tôi hiểu thao tác này không thể hoàn tác
                        </label>
                        <div className="modal-actions">
                            <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => {
                                    setShowLockConfirm(false)
                                    setLockConfirmReady(false)
                                }}
                            >
                                Hủy
                            </button>
                            <button
                                className="btn btn-danger"
                                type="button"
                                disabled={!lockConfirmReady}
                                onClick={() => {
                                    setShowLockConfirm(false)
                                    setLockConfirmReady(false)
                                    handleLock()
                                }}
                            >
                                Khóa (Bước 2)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </BrowserRouter>
    )
}

export default App

type LoginPageProps = {
    auth: AuthState | null
    loading: boolean
    loginError: string | null
    loginForm: { username: string; password: string }
    setLoginForm: (next: { username: string; password: string }) => void
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function LoginPage({
    auth,
    loading,
    loginError,
    loginForm,
    setLoginForm,
    onSubmit,
}: LoginPageProps) {
    const navigate = useNavigate()
    useEffect(() => {
        if (auth) {
            navigate(getRolePath(auth.user.role), { replace: true })
        }
    }, [auth, navigate])

    return (
        <div className="login-page">
            <div className="login-banner">
                <div className="login-banner-overlay" />
                <div className="login-banner-content">
                    <img src={logo} alt="RMG" className="login-logo" />
                    <h1>Hệ thống đăng ký ăn trưa nội bộ</h1>
                    <p>Nhanh chóng – Chính xác – Realtime</p>
                    <div className="login-illustration">
                        <div className="iso-card iso-card--primary" />
                        <div className="iso-card iso-card--secondary" />
                        <div className="iso-card iso-card--neutral" />
                    </div>
                </div>
            </div>
            <div className="login-form-panel">
                <div className="login-form-card">
                    <img src={logo} alt="RMG" className="login-logo small" />
                    <h2>Đăng nhập hệ thống</h2>
                    <form className="login-form" onSubmit={onSubmit}>
                        <label>
                            Username
                            <input
                                type="text"
                                value={loginForm.username}
                                onChange={(event) =>
                                    setLoginForm({ ...loginForm, username: event.target.value })
                                }
                                required
                            />
                        </label>
                        <label>
                            Password
                            <input
                                type="password"
                                value={loginForm.password}
                                onChange={(event) =>
                                    setLoginForm({
                                        ...loginForm,
                                        password: event.target.value,
                                    })
                                }
                                required
                            />
                        </label>
                        {loginError && <div className="form-error">{loginError}</div>}
                        <button
                            className={`btn btn-primary ${loading ? 'btn-loading' : ''}`}
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? 'Đang đăng nhập' : 'Đăng nhập'}
                        </button>
                    </form>
                    <div className="login-footer">© Company Name – Internal System</div>
                </div>
            </div>
        </div>
    )
}

function RequireAuth({
    auth,
    role,
    children,
}: {
    auth: AuthState | null
    role: 'manager' | 'admin' | 'kitchen'
    children: React.ReactNode
}) {
    if (!auth) {
        return <Navigate to="/login" replace />
    }
    if (auth.user.role !== role) {
        return <Navigate to={getRolePath(auth.user.role)} replace />
    }
    return <>{children}</>
}

function Topbar({
    auth,
    dateLabel,
    children,
    onLogout,
    isLocked,
}: {
    auth: AuthState
    dateLabel: string
    children?: React.ReactNode
    onLogout: () => void
    isLocked?: boolean
}) {
    return (
        <header className="topbar">
            <div className="brand">
                <div className="brand-mark">🍽️</div>
                <div>
                    <div className="brand-title">MealCheck</div>
                    <div className="brand-subtitle">Đăng ký ăn trưa nội bộ</div>
                </div>
            </div>
            <div className="topbar-actions">
                <span className="chip chip--date">Suất ăn • {dateLabel}</span>
                {children}
                {isLocked && <span className="chip chip--lock">🔒 Đã khóa</span>}
                <span className="chip">
                    {auth.user.name} • {auth.user.role} • {auth.user.department}
                </span>
                <button className="btn btn-ghost" type="button">
                    Trợ giúp
                </button>
                <button className="btn" type="button" onClick={onLogout}>
                    Đăng xuất
                </button>
            </div>
        </header>
    )
}

function Sidebar({
    title,
    items,
    activeKey,
    onSelect,
    compact = false,
}: {
    title: string
    items: { key: string; label: string; icon: string }[]
    activeKey: string
    onSelect: (key: string) => void
    compact?: boolean
}) {
    return (
        <aside className={`sidebar ${compact ? 'sidebar--compact' : ''}`}>
            <div className="sidebar-title">{title}</div>
            <div className="sidebar-items">
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => onSelect(item.key)}
                        className={`sidebar-item ${activeKey === item.key ? 'sidebar-item--active' : ''
                            }`}
                    >
                        <span className="sidebar-icon">{item.icon}</span>
                        <span className="sidebar-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </aside>
    )
}

function ManagerPage({
    auth,
    isLocked,
    lockState,
    departmentLunch,
    history,
    loading,
    showToast,
    canEditDepartment,
    dateLabel,
    lockTimeLabel,
    onSave,
    setDepartmentLunchState,
    onLogout,
}: {
    auth: AuthState
    isLocked: boolean
    lockState: { locked: boolean; lockedAt: string | null; lockedBy: string | null } | null
    departmentLunch: DepartmentLunch | null
    history: DepartmentLunch[]
    loading: boolean
    showToast: boolean
    canEditDepartment: boolean
    dateLabel: string
    lockTimeLabel: string
    onSave: () => void
    setDepartmentLunchState: React.Dispatch<React.SetStateAction<DepartmentLunch | null>>
    onLogout: () => void
}) {
    const historyRows = useMemo(
        () =>
            history.map((row, index) => ({
                ...row,
                previousQuantity: history[index + 1]?.totalQuantity ?? null,
                previousRegular: history[index + 1]?.regularQuantity ?? null,
                previousVeg: history[index + 1]?.vegQuantity ?? null,
            })),
        [history],
    )

    const totalQuantity =
        (departmentLunch?.regularQuantity ?? 0) + (departmentLunch?.vegQuantity ?? 0)

    const updateQuantity = (field: 'regularQuantity' | 'vegQuantity', delta: number) => {
        setDepartmentLunchState((prev) =>
            prev
                ? {
                      ...prev,
                      [field]: Math.max(0, prev[field] + delta),
                  }
                : prev,
        )
    }

    return (
        <div className="app-shell">
            <Sidebar
                title="Manager"
                items={[{ key: 'dashboard', label: 'Dashboard', icon: '📊' }]}
                activeKey="dashboard"
                onSelect={() => null}
            />
            <div className="app-content">
                <Topbar auth={auth} dateLabel={dateLabel} onLogout={onLogout} isLocked={isLocked}>
                    {lockState && (
                        <span
                            className={`status-badge ${departmentLunch?.updatedAt
                                ? 'status-badge--success'
                                : 'status-badge--warn'
                                }`}
                        >
                            {departmentLunch?.updatedAt ? '🟢 Đã cập nhật' : '🟡 Chưa đăng ký'}
                        </span>
                    )}
                </Topbar>
                <main className="container">
                    <section className="section manager-history">
                        <div className="section-header">
                            <div>
                                <h2>Đăng ký ăn trưa – Phòng {auth.user.department}</h2>
                                <p className="muted date-highlight">📅 Ngày {dateLabel}</p>
                            </div>
                        </div>
                        <div
                            className={`card glass-card manager-card ${showToast ? 'card--highlight' : ''
                                } ${isLocked ? 'card--locked' : ''} ${departmentLunch ? 'card--editing' : ''
                                }`}
                        >
                            {isLocked && (
                                <div className="card-lock">
                                    <span className="lock-icon">🔒</span>
                                    <div>Đã khóa đăng ký • {lockTimeLabel}</div>
                                </div>
                            )}
                            <div className="employee-card-bg">🍱</div>
                            <div className="card-title">Số suất ăn</div>
                            <div className="quantity-control">
                                <span className="muted">Suất thường</span>
                                <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => updateQuantity('regularQuantity', -1)}
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                >
                                    −
                                </button>
                                <input
                                    type="number"
                                    min={0}
                                    value={departmentLunch?.regularQuantity ?? 0}
                                    onChange={(event) =>
                                        setDepartmentLunchState((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    regularQuantity: Number(event.target.value || 0),
                                                }
                                                : prev,
                                        )
                                    }
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                />
                                <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => updateQuantity('regularQuantity', 1)}
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                >
                                    +
                                </button>
                            </div>
                            <div className="quantity-control">
                                <span className="muted">Suất chay</span>
                                <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => updateQuantity('vegQuantity', -1)}
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                >
                                    −
                                </button>
                                <input
                                    type="number"
                                    min={0}
                                    value={departmentLunch?.vegQuantity ?? 0}
                                    onChange={(event) =>
                                        setDepartmentLunchState((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    vegQuantity: Number(event.target.value || 0),
                                                }
                                                : prev,
                                        )
                                    }
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                />
                                <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => updateQuantity('vegQuantity', 1)}
                                    disabled={!departmentLunch || isLocked || !canEditDepartment}
                                >
                                    +
                                </button>
                            </div>
                            <div className="manager-helper">
                                Tổng suất: <strong>{totalQuantity}</strong>
                            </div>
                            <div className="manager-helper">
                                Tổng số người dự kiến ăn trưa của phòng
                            </div>
                            <div className="card-footer">
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={onSave}
                                    disabled={isLocked || loading || !canEditDepartment}
                                >
                                    Lưu đăng ký
                                </button>
                                <span className="muted">
                                    {isLocked
                                        ? 'Đã khóa • chỉ xem'
                                        : '09:00–12:00 sẽ khóa chỉnh sửa'}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="section">
                        <div className="section-header">
                            <div>
                                <h2>Lịch sử đăng ký</h2>
                                <p className="muted">Chỉ xem, không chỉnh sửa</p>
                            </div>
                        </div>
                        <div className="card glass-card table-card">
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Ngày</th>
                                            <th>Từ → Đến</th>
                                            <th>Thời gian cập nhật</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((row) => (
                                            <tr key={row.id}>
                                                <td>{row.date}</td>
                                                <td className="table-number">
                                                    Thường {row.previousRegular ?? '-'} → {row.regularQuantity}
                                                    {' • '}
                                                    Chay {row.previousVeg ?? '-'} → {row.vegQuantity}
                                                    {' • '}
                                                    Tổng {row.previousQuantity ?? '-'} → {row.totalQuantity}
                                                </td>
                                                <td className="muted">
                                                    {row.updatedAt
                                                        ? new Date(row.updatedAt).toLocaleString()
                                                        : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    )
}

function AdminPage({
    auth,
    now,
    isLocked,
    summary,
    audit,
    totalQuantity,
    totalRooms,
    registeredCount,
    updatedDepartmentId,
    syncPulse,
    setShowLockConfirm,
    onClearDepartment,
    dateLabel,
    lockTimeLabel,
    onLogout,
    loading,
}: {
    auth: AuthState
    now: Date
    isLocked: boolean
    summary: Summary | null
    audit: DepartmentLunch[]
    totalQuantity: number
    totalRooms: number
    registeredCount: number
    updatedDepartmentId: string | null
    syncPulse: boolean
    showLockConfirm: boolean
    setShowLockConfirm: (value: boolean) => void
    onLock: () => void
    onClearDepartment: (departmentId: string) => void
    dateLabel: string
    lockTimeLabel: string
    onLogout: () => void
    loading: boolean
}) {
    const [activeTab, setActiveTab] = useState(
        'overview' as 'overview' | 'lock' | 'export' | 'audit',
    )
    const [auditDate, setAuditDate] = useState('')
    const [exporting, setExporting] = useState(false)

    const auditRows = useMemo(() => {
        const filtered = audit.filter((row) => !auditDate || row.date === auditDate)
        const previousMap: Record<string, number> = {}
        const computed: AuditRow[] = []
        filtered
            .slice()
            .reverse()
            .forEach((row) => {
                const previous = previousMap[row.departmentId] ?? null
                previousMap[row.departmentId] = row.totalQuantity
                computed.push({ ...row, previousQuantity: previous })
            })
        return computed.reverse()
    }, [audit, auditDate])

    return (
        <div className="app-shell">
            <Sidebar
                title="Admin"
                items={[
                    { key: 'overview', label: 'Tổng quan', icon: '📊' },
                    { key: 'lock', label: 'Khóa đăng ký', icon: '🔒' },
                    { key: 'export', label: 'Xuất báo cáo', icon: '📤' },
                    { key: 'audit', label: 'Audit log', icon: '📜' },
                ]}
                activeKey={activeTab}
                onSelect={(key) =>
                    setActiveTab(key as 'overview' | 'lock' | 'export' | 'audit')
                }
            />
            <div className="app-content">
                <Topbar auth={auth} dateLabel={dateLabel} onLogout={onLogout} isLocked={isLocked} />
                <main className="container">
                    {activeTab === 'overview' && summary && (
                        <section className="section">
                            <div className="section-header">
                                <div>
                                    <h2>Dashboard tổng – Trung tâm điều hành</h2>
                                    <p className="muted">
                                        3 giây biết tổng – 10 giây biết phòng nào thiếu
                                    </p>
                                </div>
                            </div>
                            <div className="admin-kpi-grid">
                                <div className="card admin-kpi admin-kpi--primary">
                                    <div className="admin-kpi-title">TỔNG SUẤT ĂN</div>
                                    <div className={`admin-kpi-value ${syncPulse ? 'pulse' : ''}`}>
                                        {totalQuantity}
                                    </div>
                                    <div className="admin-kpi-sub">+12% so với hôm qua</div>
                                </div>
                                <div className="card admin-kpi admin-kpi--progress">
                                    <div className="admin-kpi-title">PHÒNG BAN ĐÃ CHỐT</div>
                                    <div className="admin-kpi-value">
                                        {registeredCount}/{totalRooms}
                                    </div>
                                    <div className="admin-kpi-sub">TIẾN ĐỘ</div>
                                    <div className="progress-track">
                                        <div
                                            className="progress-fill"
                                            style={{
                                                width: `${Math.round(
                                                    (registeredCount / totalRooms) * 100,
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div
                                    className={`card admin-kpi admin-kpi--status ${isLocked ? 'is-locked' : ''
                                        }`}
                                >
                                    <div className="admin-kpi-icon">
                                        {isLocked ? '🔒' : '🔓'}
                                    </div>
                                    <div className="admin-kpi-title">TRẠNG THÁI HỆ THỐNG</div>
                                    <div className="admin-kpi-status">
                                        {isLocked ? 'ĐÃ KHÓA' : 'ĐANG MỞ ĐĂNG KÝ'}
                                    </div>
                                </div>
                            </div>
                            <div className="card glass-card table-card admin-table">
                                <div className="table-title-row admin-table-header">
                                    <div className="table-title admin-table-title">
                                        <span className="admin-table-accent" />
                                        CHI TIẾT PHÒNG BAN
                                    </div>
                                    <button className="table-action" type="button">
                                        XEM TẤT CẢ
                                    </button>
                                </div>
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>PHÒNG BAN</th>
                                                <th>THƯỜNG</th>
                                                <th>CHAY</th>
                                                <th>TỔNG</th>
                                                <th>TRẠNG THÁI</th>
                                                <th>CẬP NHẬT</th>
                                                <th>HÀNH ĐỘNG</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {DEPARTMENTS.map((department) => {
                                                const row = summary.departments.find(
                                                    (item) => item.departmentId === department,
                                                )
                                                const updated = row?.updatedAt
                                                return (
                                                    <tr
                                                        key={department}
                                                        className={
                                                            updatedDepartmentId === department
                                                                ? 'row-highlight'
                                                                : ''
                                                        }
                                                    >
                                                        <td className="table-department">{department}</td>
                                                        <td className="table-number">
                                                            {row?.regularQuantity ?? 0}
                                                        </td>
                                                        <td className="table-number">
                                                            {row?.vegQuantity ?? 0}
                                                        </td>
                                                        <td className="table-number table-number--strong">
                                                            {row?.totalQuantity ?? 0}
                                                        </td>
                                                        <td>
                                                            <span
                                                                className={`status-pill ${updated ? 'status-pill--done' : 'status-pill--pending'
                                                                    }`}
                                                            >
                                                                {updated ? '✓ Đã hoàn tất' : '⏱ Đang chờ'}
                                                            </span>
                                                        </td>
                                                        <td className="muted table-updated">
                                                            {row?.updatedAt
                                                                ? new Date(row.updatedAt).toLocaleString()
                                                                : '-'}
                                                        </td>
                                                        <td>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                type="button"
                                                                onClick={() => {
                                                                    if (
                                                                        window.confirm(
                                                                            `Xóa đăng ký của phòng ${department}?`,
                                                                        )
                                                                    ) {
                                                                        onClearDepartment(department)
                                                                    }
                                                                }}
                                                                disabled={loading}
                                                            >
                                                                Xóa
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'lock' && (
                        <section className="section">
                            <div className="section-header">
                                <div>
                                    <h2>Trang khóa đăng ký</h2>
                                    <p className="muted">Khóa tự động {lockTimeLabel}</p>
                                </div>
                                <div className="section-actions">
                                    <div className="clock">{now.toLocaleTimeString()}</div>
                                </div>
                            </div>
                            <div className="card glass-card lock-card">
                                <button
                                    className="btn btn-danger btn-lock"
                                    type="button"
                                    onClick={() => setShowLockConfirm(true)}
                                    disabled={loading || isLocked}
                                >
                                    🔒 KHÓA ĐĂNG KÝ {dateLabel.toUpperCase()}
                                </button>
                                <div className="lock-status">
                                    {isLocked ? 'Đã khóa' : 'Chưa khóa'}
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === 'export' && (
                        <section className="section">
                            <div className="section-header">
                                <div>
                                    <h2>Xuất báo cáo</h2>
                                    <p className="muted">Preview tổng quan</p>
                                </div>
                            </div>
                            <div className="card glass-card report-card">
                                <div className="report-preview">
                                    <div>
                                        <div className="report-value">{totalQuantity}</div>
                                        <div className="muted">Tổng suất</div>
                                    </div>
                                    <div>
                                        <div className="report-value">{totalRooms}</div>
                                        <div className="muted">Số phòng</div>
                                    </div>
                                </div>
                                <button
                                    className={`btn btn-primary ${exporting ? 'btn-loading' : ''}`}
                                    type="button"
                                    onClick={() => {
                                        setExporting(true)
                                        window.setTimeout(() => setExporting(false), 1200)
                                    }}
                                >
                                    📤 Xuất Excel
                                </button>
                            </div>
                        </section>
                    )}

                    {activeTab === 'audit' && (
                        <section className="section">
                            <div className="section-header">
                                <div>
                                    <h2>Audit log</h2>
                                    <p className="muted">Audit • ISO • Truy vết lỗi</p>
                                </div>
                                <div className="section-actions">
                                    <input
                                        className="date-input"
                                        type="date"
                                        value={auditDate}
                                        onChange={(event) => setAuditDate(event.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="card glass-card table-card">
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Phòng</th>
                                                <th>Số cũ → số mới</th>
                                                <th>Người sửa</th>
                                                <th>Thời gian</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditRows.map((row) => (
                                                <tr key={row.id}>
                                                    <td>{row.departmentId}</td>
                                                    <td>
                                                        <span className="table-number">
                                                            {row.previousQuantity ?? '-'} → {row.totalQuantity}
                                                        </span>
                                                    </td>
                                                    <td className="muted">{row.updatedBy ?? '-'}</td>
                                                    <td className="muted">
                                                        {row.updatedAt
                                                            ? new Date(row.updatedAt).toLocaleString()
                                                            : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    )
}

function KitchenPage({
    dateLabel,
    now,
    isLocked,
    auth,
    summary,
    totalQuantity,
    totalRegular,
    totalVeg,
    updatedDepartmentId,
    syncPulse,
    onLogout,
}: {
    dateLabel: string
    now: Date
    isLocked: boolean
    auth: AuthState
    summary: Summary | null
    totalQuantity: number
    totalRegular: number
    totalVeg: number
    updatedDepartmentId: string | null
    syncPulse: boolean
    onLogout: () => void
}) {
    if (!summary) {
        return null
    }
    return (
        <div className="app-shell">
            <Sidebar
                title="Kitchen"
                items={[{ key: 'today', label: 'Theo dõi', icon: '🍱' }]}
                activeKey="today"
                onSelect={() => null}
                compact
            />
            <div className="app-content kitchen-screen">
                <div className="kitchen-topbar">
                    <div className="kitchen-user">{auth.user.department}</div>
                    <button className="btn btn-ghost" type="button" onClick={onLogout}>
                        Đăng xuất
                    </button>
                </div>
                <main className="container">
                    <section className="section kitchen-full">
                        <div className="kitchen-hero">
                            <div className="kitchen-hero-title">Ăn trưa – {dateLabel}</div>
                            <div
                                className={`kitchen-total-hero ${updatedDepartmentId ? 'kitchen-flash' : ''
                                    } ${syncPulse ? 'kitchen-sync' : ''}`}
                            >
                                {totalQuantity}
                            </div>
                            <div className="kitchen-total-sub">
                                Thường {totalRegular} • Chay {totalVeg}
                            </div>
                            <div className="kitchen-date-card">{now.toLocaleString()}</div>
                            <div className="kitchen-status">
                                {isLocked ? '🔒 Đã khóa' : '🟡 Chưa khóa'}
                            </div>
                        </div>
                        <div className="kitchen-grid">
                            {DEPARTMENTS.map((department) => {
                                const row = summary.departments.find(
                                    (item) => item.departmentId === department,
                                )
                                return (
                                    <div key={department} className="kitchen-card">
                                        <div className="kitchen-card-title">
                                            {department.toUpperCase()}
                                        </div>
                                        <div className="kitchen-card-value">
                                            {row?.totalQuantity ?? 0}
                                        </div>
                                        <div className="kitchen-card-sub">
                                            Chay {row?.vegQuantity ?? 0} • Thường{' '}
                                            {row?.regularQuantity ?? 0}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    )
}

