function Sidebar({ activePage, onNavigate, onLogout }) {

    const menus = [
        {
            id: 'dashboard',
            label: 'Dashboard',
        },
        {
            id: 'products',
            label: 'Produk',
        },
        {
            id: 'category',
            label: 'Kategori',
        },
        {
            id: 'stock',
            label: 'Stok',
        },
        {
            id: 'purchases',
            label: 'Pembelian',
        },
        {
            id: 'vendors',
            label: 'Supplier',
        },
        {
            id: 'reports',
            label: 'Laporan',
        },
    ];

    return (
        <aside className="dashboard-sidebar">

            {/* BRAND */}
            <div className="sidebar-brand">
                <span className="sidebar-brand-mark">
                    ⌁
                </span>

                <span>
                    Depotify
                </span>
            </div>

            {/* MENU */}
            <div className="sidebar-section">

                <p>
                    MENU UTAMA
                </p>

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

                            <span className="menu-indicator">
                                {activePage === menu.id
                                    ? '●'
                                    : '○'}
                            </span>

                            <span>
                                {menu.label}
                            </span>

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
                >

                    <span>

                    </span>

                    <span>
                        Keluar
                    </span>

                </button>

            </div>

        </aside>
    );
}

export default Sidebar;
