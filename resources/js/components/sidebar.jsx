function Sidebar({ activePage, onNavigate, onLogout, user }) {
    const menus = [
        {
            id: 'dashboard',
            label: 'OVERVIEW',
            icon: '◐',
        },
        {
            id: 'products',
            label: 'PRODUK',
            icon: '◫',
        },
        {
            id: 'category',
            label: 'KATEGORI',
            icon: '❖',
        },
        {
            id: 'stock',
            label: 'STOK DEPOT',
            icon: '◰',
        },
        {
            id: 'purchases',
            label: 'PEMBELIAN',
            icon: '▤',
        },
        {
            id: 'vendors',
            label: 'SUPPLIER',
            icon: '◈',
        },
        {
            id: 'reports',
            label: 'LAPORAN',
            icon: '◧',
        },
    ];

    const displayName = user?.name || 'Owner Depotify';
    const displaySub = user?.email || 'ID: OWNER-01';
    const initial = displayName.charAt(0).toUpperCase();

    return (
        <aside className="dashboard-sidebar">
            {/* BRAND & PROFILE HEADER (Neumorphic Reference Style) */}
            <div className="sidebar-brand">
                <span className="sidebar-brand-title">Depotify</span>
            </div>

            <div className="sidebar-profile-card">
                <div className="sidebar-avatar-ring">
                    <div className="sidebar-avatar-inner">{initial}</div>
                </div>
                <strong className="sidebar-profile-name">{displayName}</strong>
                <span className="sidebar-profile-id">{displaySub}</span>
            </div>

            {/* MENU */}
            <div className="sidebar-section">
                <nav className="sidebar-menu">
                    {menus.map((menu) => (
                        <button
                            key={menu.id}
                            type="button"
                            className={
                                activePage === menu.id
                                    ? 'sidebar-menu-item active'
                                    : 'sidebar-menu-item'
                            }
                            onClick={() => onNavigate(menu.id)}
                        >
                            <span className="menu-indicator">{menu.icon}</span>
                            <span>{menu.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* LOGOUT */}
            <div className="sidebar-bottom">
                <button
                    type="button"
                    className="sidebar-logout"
                    onClick={onLogout}
                    title="Keluar dari Sesi"
                >
                    <span className="logout-power-icon">⏻</span>
                    <span>Keluar</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
