document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('side-menu').classList.toggle('active');
});

// Close menu on click outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('side-menu');
    const toggle = document.getElementById('menu-toggle');
    if (!menu.contains(e.target) && !toggle.contains(e.target) && menu.classList.contains('active')) {
        menu.classList.remove('active');
    }
});

// Dark/Light toggle (placeholder for now as background is dark by default)
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
});
